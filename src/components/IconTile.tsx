import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { getIcon } from '@iconify/react';
import {
  findIconByNameAndSource,
  loadIcon,
  type UnifiedIcon,
  type IconSource,
} from '../utils/iconManager';
import {
  angleToUserSpaceCoords,
  buildCssGradient,
  resolveStops,
  type ViewBoxRect,
} from '../utils/gradient';
import {
  getDropShadow,
  getEffectPalette,
  getScoreEffectOpacity,
  OFFSET_PRINT_RATIO,
  OUTLINE_WIDTH_RATIO,
} from '../utils/iconEffects';
import type { IconConfig } from '../utils/iconConfig';
import {
  foregroundCssTransform,
  foregroundKey,
  getForegroundScale,
  getForegroundTransform,
  getGlyphFill,
  resolveForeground,
  transformKey,
} from '../utils/foreground';
import { rasterizeForeground } from '../utils/foregroundRenderer';
import { drawCastShadow, drawOffsetPrint, drawOutline, makeGlyphLayer } from '../utils/glyphEffects';
import { ForegroundCanvas } from './ForegroundCanvas';

export type MaskShape = 'default' | 'circle' | 'squircle' | 'rounded-square' | 'square';

/**
 * Config contract for the tile. This is the canonical `IconConfig`; the alias
 * is kept so existing imports keep working.
 */
export type IconTileConfig = IconConfig;

interface IconTileProps {
  size: number;
  config: IconTileConfig;
  iconUrl: string | null;
  iconSource: IconSource;
  iconStyle: string;
  maskShape?: MaskShape;
  overscan?: number;
  /**
   * When true, applies Apple's iOS icon-grid safe-area scale to the glyph so
   * the visible icon content sits inside the system squircle mask. Follows
   * the HIG recommendation to keep primary content centered and away from the
   * masked edges (see developer.apple.com/design/human-interface-guidelines/app-icons).
   */
  iosSafeArea?: boolean;
  className?: string;
}

/**
 * Apple's iOS squircle (continuous-curvature rounded rectangle) corresponds
 * to a corner radius of roughly 22.37% of the canvas side. This is the
 * canonical value derived from the 1024×1024 app-icon mask.
 */
export const IOS_SQUIRCLE_RADIUS_PCT = 22.37;

/**
 * Fraction of the icon canvas reserved for visible glyph content on iOS,
 * derived from Apple's app-icon grid (primary content extends to ~82% of
 * the 1024×1024 canvas). Applied in addition to `config.padding` so that
 * iOS output matches the HIG regardless of user padding tweaks.
 */
export const IOS_SAFE_AREA_SCALE = 0.82;

function shapeToRadius(shape: MaskShape, cornerRadius: number): number {
  switch (shape) {
    case 'circle':
      return 50;
    case 'squircle':
      return IOS_SQUIRCLE_RADIUS_PCT;
    case 'rounded-square':
      return 18;
    case 'square':
      return 0;
    case 'default':
    default:
      return cornerRadius;
  }
}

/**
 * Shared icon tile: background + foreground (Iconify icon, uploaded image or
 * text) + effects (drop-shadow, cast-shadow, score). Used by the main
 * preview, the device preview and the session manager so every surface
 * faithfully reflects every effect available in the editor.
 */
export function IconTile({
  size,
  config,
  iconUrl,
  iconSource,
  iconStyle,
  maskShape = 'default',
  overscan = 1,
  iosSafeArea = false,
  className,
}: IconTileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const castShadowCanvasRef = useRef<HTMLCanvasElement>(null);
  // Monotonic token so a slow cast-shadow render can't overwrite a newer one.
  const castShadowToken = useRef(0);
  // Re-runs SVG-dependent effects once Iconify resolves the icon.
  const [iconLoadTick, setIconLoadTick] = useState(0);

  const fg = resolveForeground(config, iconUrl);
  const fgKey = foregroundKey(fg);
  // User offset / scale / rotation / flip. Percent offsets refer to the
  // visible tile (`size`), matching the export pipeline's `refSize`.
  const transform = getForegroundTransform(config);
  const tKey = transformKey(transform);
  const iconFg = fg?.kind === 'icon' ? fg : null;
  const iconifyId = iconFg?.iconifyId ?? null;
  const currentSource = iconFg?.source || iconSource;
  const IconComponent: UnifiedIcon | null = iconFg
    ? findIconByNameAndSource(iconFg.name, currentSource)
    : null;

  useEffect(() => {
    if (!iconifyId) return;
    let cancelled = false;
    loadIcon(iconifyId)
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIconLoadTick((t) => t + 1);
      });
    return () => {
      cancelled = true;
    };
  }, [iconifyId]);

  const canvasSize = size * overscan;
  const offset = (size - canvasSize) / 2;

  // Icon size is derived from the *visible* tile (`size`), not the overscan
  // canvas, so `config.padding` means the same thing on every platform:
  // "fraction of the visible tile reserved as padding on each side". Without
  // this, Android's 1.5x overscan would inflate the glyph while iOS would
  // shrink it, making one padding value produce very different visible sizes
  // across previews.
  //
  // `iosSafeArea` is retained as an opt-in tightener for consumers that need
  // Apple's icon-grid content area on top of the user's padding; it is off by
  // default so Android/iOS previews match at a given padding value.
  //
  // Images and text are contain-fitted to the box, so they get scale 1.0;
  // Iconify packs use their per-collection optical multiplier.
  const opticalScale = getForegroundScale(fg, iconSource, iconStyle);
  const safeAreaScale = iosSafeArea ? IOS_SAFE_AREA_SCALE : 1;
  const baseIconSize = size * (1 - (config.padding / 100) * 2) * safeAreaScale;
  const iconSize = Math.min(canvasSize, baseIconSize * opticalScale);

  const radius = shapeToRadius(maskShape, config.cornerRadius);

  const bgStops = resolveStops(
    config.backgroundGradientStops,
    config.backgroundGradientStart,
    config.backgroundGradientEnd,
  );
  const bgAngle = config.backgroundGradientAngle ?? 135;
  const iconStops = resolveStops(
    config.iconGradientStops,
    config.iconGradientStart,
    config.iconGradientEnd,
  );
  const iconAngle = config.iconGradientAngle ?? 135;

  // Part colors are an SVG-only feature: walk the rendered Iconify SVG.
  useEffect(() => {
    if (!iconFg) return;
    if (!containerRef.current) return;
    if (!config.usePartColors || config.iconPartColors.length === 0) return;
    const svg = containerRef.current.querySelector('svg');
    if (!svg) return;
    const paths = svg.querySelectorAll('path, circle, rect, line, polyline, polygon');
    paths.forEach((path, index) => {
      const color = config.iconPartColors[index % config.iconPartColors.length];
      const currentFill = path.getAttribute('fill');
      const currentStroke = path.getAttribute('stroke');
      if (currentFill && currentFill !== 'none') path.setAttribute('fill', color);
      if (currentStroke && currentStroke !== 'none') path.setAttribute('stroke', color);
      if ((!currentFill || currentFill === 'none') && (!currentStroke || currentStroke === 'none')) {
        path.setAttribute('stroke', color);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.usePartColors, config.iconPartColors, iconUrl, fgKey, iconSize, iconStyle, iconLoadTick]);

  // Effects that need the glyph silhouette (cast shadow, outline, offset
  // print) are painted on an overlay canvas under the glyph, with the same
  // algorithms the export pipeline uses, adapted to the authored canvas size.
  // The silhouette source is the live Iconify SVG for icons, or the shared
  // rasterizer (black silhouette) for images and text.
  const hasOverlayEffect =
    config.iconEffect === 'cast-shadow' || config.iconEffect === 'outline' || config.iconEffect === 'offset';
  const palette = getEffectPalette(config);
  const paletteKey = `${palette.outline}|${palette.offset}`;
  const renderCastShadow = useCallback(() => {
    if (!hasOverlayEffect || !fg) return;
    const canvas = castShadowCanvasRef.current;
    if (!canvas) return;

    const token = ++castShadowToken.current;
    const s = canvasSize;
    const iSize = Math.max(1, Math.round(iconSize));

    const paint = (source: CanvasImageSource) => {
      if (token !== castShadowToken.current) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      canvas.width = s;
      canvas.height = s;
      ctx.clearRect(0, 0, s, s);

      // Same placement as the DOM glyph (centered in the overscan canvas,
      // percent offsets relative to the visible tile), so the shadow follows
      // the user's transform exactly like the export does.
      const layer = makeGlyphLayer(source, {
        tileSize: s,
        refSize: size,
        boxOrigin: (s - iSize) / 2,
        boxSize: iSize,
        transform,
      });
      const opacity = config.iconEffectOpacity / 100;
      if (config.iconEffect === 'cast-shadow') {
        drawCastShadow(ctx, layer, s, opacity, (s * radius) / 100);
      } else if (config.iconEffect === 'outline') {
        drawOutline(ctx, layer, size * OUTLINE_WIDTH_RATIO, palette.outline, opacity);
      } else if (config.iconEffect === 'offset') {
        const d = size * OFFSET_PRINT_RATIO;
        drawOffsetPrint(ctx, layer, d, d, palette.offset, opacity);
      }
    };

    if (fg.kind === 'icon') {
      const svg = containerRef.current?.querySelector('svg');
      if (!svg) return;
      const svgClone = svg.cloneNode(true) as SVGElement;
      const serialized = new XMLSerializer().serializeToString(svgClone);
      const colorized = serialized.replace(/currentColor/g, config.iconColor || '#000000');
      const blob = new Blob([colorized], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        paint(img);
        URL.revokeObjectURL(url);
      };
      img.onerror = () => URL.revokeObjectURL(url);
      img.src = url;
    } else {
      rasterizeForeground(fg, iSize, { fill: { kind: 'silhouette' } })
        .then(paint)
        .catch(() => undefined);
    }
    // `fg`/`transform` are derived from props each render; their string keys stand in for them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config.iconEffect,
    config.iconColor,
    config.iconEffectOpacity,
    hasOverlayEffect,
    paletteKey,
    canvasSize,
    size,
    iconSize,
    radius,
    fgKey,
    tKey,
  ]);

  useEffect(() => {
    const t = setTimeout(renderCastShadow, 50);
    return () => clearTimeout(t);
  }, [
    renderCastShadow,
    iconUrl,
    fgKey,
    tKey,
    iconStyle,
    config.padding,
    config.cornerRadius,
    config.iconEffect,
    config.iconEffectOpacity,
    config.iconColor,
    iconLoadTick,
  ]);

  const backgroundStyle: CSSProperties = config.backgroundGradient
    ? { background: buildCssGradient(bgStops, bgAngle) }
    : { backgroundColor: config.backgroundColor };

  // Per-instance ids: several tiles of the same size (size strip, preset
  // thumbnails, session list) must not share one <linearGradient>, or they
  // would all resolve `url(#…)` to the first one in the document.
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const gradientId = `iconTileGradient-${uid}`;

  // The foreground gradient sweeps across the icon's own viewBox (user
  // space), exactly like the export pipeline. Icon data is available
  // synchronously once loaded; `iconLoadTick` re-renders us when it lands.
  const iconData = iconFg ? getIcon(iconFg.iconifyId) : null;
  const iconBox: ViewBoxRect = iconData
    ? { x: iconData.left ?? 0, y: iconData.top ?? 0, width: iconData.width, height: iconData.height }
    : { x: 0, y: 0, width: 24, height: 24 };
  const gradCoords = angleToUserSpaceCoords(iconAngle, iconBox);
  const showIconGradient = !!iconFg && config.iconGradient && !config.usePartColors;

  const iconColorStyle: CSSProperties = (() => {
    if (config.usePartColors && config.iconPartColors.length > 0) {
      return { color: config.iconPartColors[0] };
    }
    if (config.iconGradient) {
      return { stroke: `url(#${gradientId})`, color: iconStops[0]?.color };
    }
    return { color: config.iconColor };
  })();

  const dropShadow = getDropShadow(size, config.iconEffectOpacity);
  const wrapperEffectStyle: CSSProperties =
    config.iconEffect === 'drop-shadow'
      ? { filter: `drop-shadow(0px ${dropShadow.dy}px ${dropShadow.blur}px rgba(0,0,0,${dropShadow.alpha}))` }
      : {};

  const glyphWrapperStyle: CSSProperties = {
    ...wrapperEffectStyle,
    position: 'relative',
    zIndex: 2,
    lineHeight: 0,
    transform: foregroundCssTransform(transform, size),
    transformOrigin: 'center center',
  };

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: `${radius}%`,
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: offset,
          top: offset,
          width: canvasSize,
          height: canvasSize,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          ...backgroundStyle,
        }}
      >
        {showIconGradient && (
          <>
            <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
              <defs>
                <linearGradient
                  id={gradientId}
                  gradientUnits="userSpaceOnUse"
                  x1={gradCoords.x1}
                  y1={gradCoords.y1}
                  x2={gradCoords.x2}
                  y2={gradCoords.y2}
                >
                  {iconStops.map((s, i) => (
                    <stop key={i} offset={`${s.position}%`} stopColor={s.color} />
                  ))}
                </linearGradient>
              </defs>
            </svg>
            {/*
              Iconify bodies carry `stroke="currentColor"` / `fill="currentColor"`
              presentation attributes on their own elements, which beat any value
              inherited from the root <svg>. A CSS rule (any specificity) beats a
              presentation attribute, so this is how the themed parts get the
              gradient — mirroring `applyIconColorsToSvg` in the export. Hardcoded
              palette colors are left alone.
            */}
            <style>{`[data-tile="${uid}"] svg [stroke="currentColor" i]{stroke:url(#${gradientId})}[data-tile="${uid}"] svg [fill="currentColor" i]{fill:url(#${gradientId})}`}</style>
          </>
        )}

        {hasOverlayEffect && (
          <canvas
            ref={castShadowCanvasRef}
            width={canvasSize}
            height={canvasSize}
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
        )}

        {iconFg && IconComponent ? (
          <div ref={containerRef} data-tile={uid} style={glyphWrapperStyle}>
            <IconComponent
              size={iconSize}
              strokeWidth={iconStyle === 'thick' ? 2.5 : undefined}
              style={iconColorStyle}
            />
          </div>
        ) : fg && fg.kind !== 'icon' ? (
          <div style={glyphWrapperStyle}>
            <ForegroundCanvas fg={fg} size={iconSize} fill={getGlyphFill(config)} />
          </div>
        ) : (
          <div
            style={{
              width: iconSize,
              height: iconSize,
              background: 'rgba(255,255,255,0.25)',
              borderRadius: '20%',
            }}
          />
        )}

        {config.iconEffect === 'score' && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: '50%',
              pointerEvents: 'none',
              background: `rgba(0,0,0,${getScoreEffectOpacity(config.iconEffectOpacity)})`,
              zIndex: 3,
            }}
          />
        )}
      </div>
    </div>
  );
}
