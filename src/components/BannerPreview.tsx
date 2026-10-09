import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Download } from 'lucide-react';
import { toast } from 'sonner';
import { parseIconUrl, findIconByNameAndSource, loadIcon, type UnifiedIcon, type IconSource } from '../utils/iconManager';
import {
  angleToUserSpaceCoords,
  applyCanvasGradient,
  applyCanvasGradientRect,
  parseViewBox,
  resolveStops,
  type GradientStop,
} from '../utils/gradient';
import { getEffectPalette, getScoreEffectOpacity } from '../utils/iconEffects';
import type { IconConfig } from '../utils/iconConfig';
import { getForegroundTransform, getGlyphFill, resolveForeground } from '../utils/foreground';
import { rasterizeForeground } from '../utils/foregroundRenderer';
import { drawGlyphWithEffect } from '../utils/glyphEffects';
import { buildCanvasFont, loadWebFont, pickNearestWeight, resolveBannerFont } from '../utils/fontLoader';
import { getFontMeta, type FontMeta } from '../utils/fontsourceApi';

const BANNER_WIDTH = 1024;
const BANNER_HEIGHT = 500;

export interface BannerConfig {
  title: string;
  tagline: string;
  /** CSS font-family name, e.g. `Open Sans` — what `ctx.font` must use. */
  font: string;
  /**
   * Fontsource id, e.g. `open-sans`. Optional for sessions saved before the
   * font picker existed; `resolveBannerFont` derives it from `font`.
   */
  fontId?: string;
  backgroundColor: string;
  backgroundGradient: boolean;
  backgroundGradientStops: GradientStop[];
  backgroundGradientAngle: number;
  textColor: string;
  showIcon: boolean;
  /** Drop the icon's own background tile so the clipart merges into the banner. */
  removeIconBackground: boolean;
  /** Mirror the icon's background color/gradient instead of a custom banner background. */
  useIconBackground: boolean;
  layout: 'horizontal' | 'vertical';
  shape: 'square' | 'squircle' | 'circle';
}

interface BannerPreviewProps {
  bannerConfig: BannerConfig;
  iconConfig: IconConfig;
  iconUrl: string | null;
  iconSource: IconSource;
  iconStyle: string;
}

// Horizontal breathing room kept on each side so text never touches the edge.
const TEXT_EDGE_MARGIN = 0.05; // fraction of banner width

// Shrink the font size until `text` fits within `maxWidth` (down to a floor),
// so long titles/taglines auto-scale instead of overflowing the canvas.
function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  fontSize: number,
  fontFamily: string,
  maxWidth: number,
): number {
  let size = fontSize;
  const minSize = Math.max(8, Math.round(fontSize * 0.4));
  ctx.font = buildCanvasFont(fontFamily, weight, false, size);
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = buildCanvasFont(fontFamily, weight, false, size);
  }
  return size;
}

export function BannerPreview({ bannerConfig, iconConfig, iconUrl, iconSource, iconStyle }: BannerPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Font readiness: `fontReady` gates the very first draw; `fontTick` forces a
  // redraw whenever a (new) face or unicode subset finishes loading, so the
  // canvas never stays on the fallback font after a font change.
  const [fontReady, setFontReady] = useState(false);
  const [fontTick, setFontTick] = useState(0);
  const [fontMeta, setFontMeta] = useState<FontMeta | null>(null);

  const { fontId: bannerFontId, family: bannerFontFamily } = resolveBannerFont(bannerConfig);
  // Closest published weights, so single-weight fonts (e.g. Bebas Neue) are
  // not rendered with a synthesized faux-bold.
  const titleWeight = pickNearestWeight(fontMeta?.weights, 700);
  const taglineWeight = pickNearestWeight(fontMeta?.weights, 400);

  useEffect(() => {
    let cancelled = false;
    setFontMeta(null);
    getFontMeta(bannerFontId).then((meta) => {
      if (!cancelled) setFontMeta(meta);
    });
    return () => {
      cancelled = true;
    };
  }, [bannerFontId]);

  // Load the selected faces with the actual banner text (Fontsource splits
  // faces into unicode-range subsets), then trigger a redraw.
  const bannerText = `${bannerConfig.title}${bannerConfig.tagline}`;
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadWebFont(bannerFontId, bannerFontFamily, titleWeight, false, bannerText),
      loadWebFont(bannerFontId, bannerFontFamily, taglineWeight, false, bannerText),
    ]).then(() => {
      if (cancelled) return;
      setFontReady(true);
      setFontTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [bannerFontId, bannerFontFamily, titleWeight, taglineWeight, bannerText]);

  const getIconComponent = useCallback((url: string): UnifiedIcon | null => {
    const parsed = parseIconUrl(url);
    if (!parsed) return null;
    const source = parsed.source || iconSource;
    return findIconByNameAndSource(parsed.name, source);
  }, [iconSource]);

  // Draw squircle (superellipse) path
  const drawSquircle = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number) => {
    const r = size / 2;
    const cx = x + r;
    const cy = y + r;
    const n = 4; // superellipse exponent — iOS-like squircle
    const steps = 200;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * 2 * Math.PI;
      const cosT = Math.cos(t);
      const sinT = Math.sin(t);
      const px = cx + Math.sign(cosT) * r * Math.pow(Math.abs(cosT), 2 / n);
      const py = cy + Math.sign(sinT) * r * Math.pow(Math.abs(sinT), 2 / n);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  };

  // Clip to the chosen icon shape
  const clipIconShape = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, shape: string) => {
    ctx.beginPath();
    if (shape === 'circle') {
      ctx.arc(x + size / 2, y + size / 2, size / 2, 0, 2 * Math.PI);
    } else if (shape === 'squircle') {
      drawSquircle(ctx, x, y, size);
    } else {
      // square — no rounded corners
      ctx.rect(x, y, size, size);
    }
    ctx.closePath();
    ctx.clip();
  };

  // Render the Iconify icon (with its iconConfig colors) to an image the tile
  // compositor can draw. Uploaded images and text go through the shared
  // `rasterizeForeground` instead.
  const renderIconifyGlyph = useCallback(async (iconSize: number): Promise<HTMLImageElement | null> => {
    if (!iconUrl) return null;
    const IconComponent = getIconComponent(iconUrl);
    if (!IconComponent) return null;

    const parsed = parseIconUrl(iconUrl);

    // Render the icon into a temp container to get SVG
    const tempContainer = document.createElement('div');
    tempContainer.style.position = 'absolute';
    tempContainer.style.left = '-9999px';
    tempContainer.style.width = `${iconSize}px`;
    tempContainer.style.height = `${iconSize}px`;
    document.body.appendChild(tempContainer);

    const gradientId = `bannerIconGradient-${Date.now()}`;

    // Preload Iconify data so the inline <svg> is present in the first render
    // frame and downstream path/fill manipulation has a real DOM to work on.
    if (parsed) {
      try {
        await loadIcon(`${parsed.source}:${parsed.name}`);
      } catch {
        // Missing icon is non-fatal — we'll still render an empty placeholder.
      }
    }

    const { createRoot } = await import('react-dom/client');
    const root = createRoot(tempContainer);

    // Determine icon CSS style
    let iconCssStyle: React.CSSProperties;
    if (iconConfig.usePartColors && iconConfig.iconPartColors.length > 0) {
      iconCssStyle = { color: iconConfig.iconPartColors[0] };
    } else if (iconConfig.iconGradient) {
      iconCssStyle = { stroke: `url(#${gradientId})` };
    } else {
      iconCssStyle = { color: iconConfig.iconColor };
    }

    // Single render path — the Iconify adapter handles prop translation.
    const strokeWidth = iconStyle === 'thick' ? 2.5 : undefined;
    const iconElement: React.ReactElement = React.createElement(IconComponent, {
      size: iconSize,
      strokeWidth,
      style: iconCssStyle,
    });
    root.render(iconElement);

    await new Promise(r => setTimeout(r, 100));

    const svgElement = tempContainer.querySelector('svg');
    if (!svgElement) {
      document.body.removeChild(tempContainer);
      root.unmount();
      return null;
    }
    svgElement.setAttribute('width', iconSize.toString());
    svgElement.setAttribute('height', iconSize.toString());

    // Apply colors to SVG paths.
    //
    // Multi-color ("palette") icon packs ship hardcoded fills per shape and
    // must be preserved so the rendered banner matches the live preview. We
    // only override `currentColor` references and elements without explicit
    // attributes (which inherit the root color). Hardcoded colors stay
    // intact unless `usePartColors` is on (a deliberate user opt-in).
    const svgRootFill = svgElement.getAttribute('fill');
    const isFillBased = !!svgRootFill && svgRootFill !== 'none';
    const isThemed = (v: string | null) =>
      !!v && v.toLowerCase() === 'currentcolor';
    const paths = svgElement.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse');
    paths.forEach((path, index) => {
      const currentFill = path.getAttribute('fill');
      const currentStroke = path.getAttribute('stroke');
      const hasNoAttrs = (!currentFill || currentFill === 'none') && (!currentStroke || currentStroke === 'none');

      if (iconConfig.usePartColors && iconConfig.iconPartColors.length > 0) {
        const color = iconConfig.iconPartColors[index % iconConfig.iconPartColors.length];
        if (currentFill && currentFill !== 'none') path.setAttribute('fill', color);
        if (currentStroke && currentStroke !== 'none') path.setAttribute('stroke', color);
        if (hasNoAttrs) {
          if (isFillBased) path.setAttribute('fill', color);
          else { path.setAttribute('stroke', color); path.setAttribute('fill', 'none'); }
        }
      } else if (iconConfig.iconGradient) {
        const gradRef = `url(#${gradientId})`;
        if (isThemed(currentFill)) path.setAttribute('fill', gradRef);
        if (isThemed(currentStroke)) path.setAttribute('stroke', gradRef);
        if (hasNoAttrs) {
          if (isFillBased) path.setAttribute('fill', gradRef);
          else { path.setAttribute('stroke', gradRef); path.setAttribute('fill', 'none'); }
        }
      } else {
        if (isThemed(currentFill)) path.setAttribute('fill', iconConfig.iconColor);
        if (isThemed(currentStroke)) path.setAttribute('stroke', iconConfig.iconColor);
        if (hasNoAttrs) {
          if (isFillBased) path.setAttribute('fill', iconConfig.iconColor);
          else { path.setAttribute('stroke', iconConfig.iconColor); path.setAttribute('fill', 'none'); }
        }
      }
    });

    // Add gradient defs if needed
    if (iconConfig.iconGradient && !iconConfig.usePartColors) {
      const svgNS = 'http://www.w3.org/2000/svg';
      let defs = svgElement.querySelector('defs');
      if (!defs) {
        defs = document.createElementNS(svgNS, 'defs');
        svgElement.insertBefore(defs, svgElement.firstChild);
      }
      const iconStops = resolveStops(
        iconConfig.iconGradientStops,
        iconConfig.iconGradientStart,
        iconConfig.iconGradientEnd,
      );
      // One sweep across the icon's viewBox (user space), like the preview and export.
      const viewBox = parseViewBox(svgElement.getAttribute('viewBox')) ?? { x: 0, y: 0, width: 24, height: 24 };
      const coords = angleToUserSpaceCoords(iconConfig.iconGradientAngle ?? 135, viewBox);
      const gradient = document.createElementNS(svgNS, 'linearGradient');
      gradient.setAttribute('id', gradientId);
      gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
      gradient.setAttribute('x1', String(coords.x1));
      gradient.setAttribute('y1', String(coords.y1));
      gradient.setAttribute('x2', String(coords.x2));
      gradient.setAttribute('y2', String(coords.y2));
      iconStops.forEach((s) => {
        const stop = document.createElementNS(svgNS, 'stop');
        stop.setAttribute('offset', `${s.position}%`);
        stop.setAttribute('stop-color', s.color);
        gradient.appendChild(stop);
      });
      defs.appendChild(gradient);
    }

    let svgData = new XMLSerializer().serializeToString(svgElement);
    svgData = svgData.replace(/currentColor/gi, iconConfig.iconColor);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });

    URL.revokeObjectURL(url);
    document.body.removeChild(tempContainer);
    root.unmount();
    return img;
  }, [iconUrl, iconConfig, iconStyle, getIconComponent]);

  // Draw the foreground (icon, uploaded image or text) with its full
  // iconConfig styling onto a temp tile canvas, then return it.
  const renderIconImage = useCallback(async (iconSize: number): Promise<HTMLCanvasElement | null> => {
    const fg = resolveForeground(iconConfig, iconUrl);
    if (!fg) return null;

    // Glyph box inside the tile padding
    const padding = (iconConfig.padding / 100) * iconSize;
    const innerSize = iconSize - padding * 2;

    let img: CanvasImageSource | null;
    if (fg.kind === 'icon') {
      img = await renderIconifyGlyph(iconSize);
    } else {
      img = await rasterizeForeground(fg, Math.round(innerSize), { fill: getGlyphFill(iconConfig) });
    }
    if (!img) return null;

    // Now draw the full icon tile (background + icon + effects) onto a canvas
    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = iconSize;
    tileCanvas.height = iconSize;
    const tCtx = tileCanvas.getContext('2d')!;

    // The tile is rendered as a full square; the banner clips it to the chosen
    // shape (`clipIconShape`) so that's the single source of truth. Applying the
    // icon's own corner radius here would leave rounded corners showing through
    // a "square" banner shape, so we deliberately don't round the tile.
    tCtx.save();

    // When "merge icon" is on, skip the background fill entirely so the tile
    // stays transparent and the clipart composites directly onto the banner.
    if (!bannerConfig.removeIconBackground) {
      if (iconConfig.backgroundGradient) {
        const bgStops = resolveStops(
          iconConfig.backgroundGradientStops,
          iconConfig.backgroundGradientStart,
          iconConfig.backgroundGradientEnd,
        );
        tCtx.fillStyle = applyCanvasGradient(
          tCtx,
          bgStops,
          iconConfig.backgroundGradientAngle ?? 135,
          iconSize,
        );
      } else {
        tCtx.fillStyle = iconConfig.backgroundColor;
      }
      tCtx.fillRect(0, 0, iconSize, iconSize);
    }

    // With "merge icon" on there's no background tile, so cast-shadow and score
    // (which paint against that tile) would look broken — skip them. Drop-shadow
    // attaches to the clipart itself, so it stays allowed.
    const mergeIcon = bannerConfig.removeIconBackground;

    // Shared compositor: applies the user's offset/scale/rotation/flip and the
    // drop or cast shadow exactly like the export pipeline. The cast shadow is
    // not clipped here because the banner clips the whole tile to its shape.
    drawGlyphWithEffect(
      tCtx,
      img,
      {
        tileSize: iconSize,
        refSize: iconSize,
        boxOrigin: padding,
        boxSize: innerSize,
        transform: getForegroundTransform(iconConfig),
      },
      iconConfig.iconEffect,
      iconConfig.iconEffectOpacity,
      { skipCast: mergeIcon, palette: getEffectPalette(iconConfig) },
    );

    // Score effect
    if (iconConfig.iconEffect === 'score' && !mergeIcon) {
      tCtx.fillStyle = `rgba(0,0,0,${getScoreEffectOpacity(iconConfig.iconEffectOpacity)})`;
      tCtx.fillRect(0, 0, iconSize, iconSize / 2);
    }

    tCtx.restore();
    return tileCanvas;
  }, [iconUrl, iconConfig, bannerConfig.removeIconBackground, renderIconifyGlyph]);

  // Main render function for the banner
  const renderBanner = useCallback(async (targetCanvas: HTMLCanvasElement, width: number, height: number) => {
    const ctx = targetCanvas.getContext('2d')!;
    targetCanvas.width = width;
    targetCanvas.height = height;

    // Background. When "use icon background" is on, mirror the icon's own
    // background color/gradient so the banner matches the icon by default;
    // otherwise use the banner's custom background.
    const useIconBg = bannerConfig.useIconBackground;
    const bgIsGradient = useIconBg ? iconConfig.backgroundGradient : bannerConfig.backgroundGradient;
    if (bgIsGradient) {
      const bgStops = useIconBg
        ? resolveStops(
            iconConfig.backgroundGradientStops,
            iconConfig.backgroundGradientStart,
            iconConfig.backgroundGradientEnd,
          )
        : resolveStops(
            bannerConfig.backgroundGradientStops,
            bannerConfig.backgroundColor,
            bannerConfig.backgroundColor,
          );
      const bgAngle = useIconBg
        ? (iconConfig.backgroundGradientAngle ?? 135)
        : (bannerConfig.backgroundGradientAngle ?? 135);
      ctx.fillStyle = applyCanvasGradientRect(ctx, bgStops, bgAngle, width, height);
    } else {
      ctx.fillStyle = useIconBg ? iconConfig.backgroundColor : bannerConfig.backgroundColor;
    }
    ctx.fillRect(0, 0, width, height);

    const isHorizontal = bannerConfig.layout === 'horizontal';
    const iconDisplaySize = Math.round(height * 0.45); // ~45% of banner height

    // Render icon tile if enabled
    let iconTile: HTMLCanvasElement | null = null;
    if (bannerConfig.showIcon) {
      iconTile = await renderIconImage(iconDisplaySize);
    }

    if (isHorizontal) {
      // HORIZONTAL: icon on left, text on right
      const centerY = height / 2;

      if (iconTile && bannerConfig.showIcon) {
        const iconX = width * 0.22;
        const iconY = centerY - iconDisplaySize / 2;

        // Clip to shape
        ctx.save();
        clipIconShape(ctx, iconX, iconY, iconDisplaySize, bannerConfig.shape);
        ctx.drawImage(iconTile, iconX, iconY, iconDisplaySize, iconDisplaySize);
        ctx.restore();
      }

      // Text
      const textX = bannerConfig.showIcon && iconTile ? width * 0.48 : width / 2;
      const textAlign: CanvasTextAlign = bannerConfig.showIcon && iconTile ? 'left' : 'center';

      // Available width for text: left-aligned text runs from textX to the
      // right edge; centered text is bounded symmetrically on both sides.
      const edgeMargin = width * TEXT_EDGE_MARGIN;
      const maxTextWidth = textAlign === 'left'
        ? width - textX - edgeMargin
        : width - edgeMargin * 2;

      ctx.fillStyle = bannerConfig.textColor;
      ctx.textAlign = textAlign;
      ctx.textBaseline = 'middle';

      // Title
      const titleSize = fitFontSize(ctx, bannerConfig.title, titleWeight, Math.round(height * 0.14), bannerFontFamily, maxTextWidth);
      ctx.font = buildCanvasFont(bannerFontFamily, titleWeight, false, titleSize);
      ctx.fillText(bannerConfig.title, textX, centerY - titleSize * 0.45);

      // Tagline
      const taglineSize = fitFontSize(ctx, bannerConfig.tagline, taglineWeight, Math.round(height * 0.07), bannerFontFamily, maxTextWidth);
      ctx.font = buildCanvasFont(bannerFontFamily, taglineWeight, false, taglineSize);
      ctx.globalAlpha = 0.85;
      ctx.fillText(bannerConfig.tagline, textX, centerY + titleSize * 0.55);
      ctx.globalAlpha = 1;
    } else {
      // VERTICAL: icon on top, text below
      const totalHeight = iconDisplaySize + height * 0.22;
      const startY = (height - totalHeight) / 2;

      if (iconTile && bannerConfig.showIcon) {
        const iconX = (width - iconDisplaySize) / 2;
        const iconY = startY;

        ctx.save();
        clipIconShape(ctx, iconX, iconY, iconDisplaySize, bannerConfig.shape);
        ctx.drawImage(iconTile, iconX, iconY, iconDisplaySize, iconDisplaySize);
        ctx.restore();
      }

      // Text
      ctx.fillStyle = bannerConfig.textColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      // Centered text is bounded symmetrically on both sides.
      const maxTextWidth = width - width * TEXT_EDGE_MARGIN * 2;

      const textStartY = bannerConfig.showIcon && iconTile
        ? startY + iconDisplaySize + height * 0.04
        : height * 0.32;

      // Title
      const titleSize = fitFontSize(ctx, bannerConfig.title, titleWeight, Math.round(height * 0.12), bannerFontFamily, maxTextWidth);
      ctx.font = buildCanvasFont(bannerFontFamily, titleWeight, false, titleSize);
      ctx.fillText(bannerConfig.title, width / 2, textStartY);

      // Tagline
      const taglineSize = fitFontSize(ctx, bannerConfig.tagline, taglineWeight, Math.round(height * 0.06), bannerFontFamily, maxTextWidth);
      ctx.font = buildCanvasFont(bannerFontFamily, taglineWeight, false, taglineSize);
      ctx.globalAlpha = 0.85;
      ctx.fillText(bannerConfig.tagline, width / 2, textStartY + titleSize + height * 0.02);
      ctx.globalAlpha = 1;
    }
  }, [bannerConfig, iconConfig, renderIconImage, bannerFontFamily, titleWeight, taglineWeight]);

  // Draw preview on canvas whenever config changes or a font finishes loading
  useEffect(() => {
    if (!canvasRef.current || !fontReady) return;
    renderBanner(canvasRef.current, BANNER_WIDTH, BANNER_HEIGHT);
  }, [renderBanner, fontReady, fontTick]);

  const handleDownload = async () => {
    try {
      const canvas = document.createElement('canvas');
      await renderBanner(canvas, BANNER_WIDTH, BANNER_HEIGHT);
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = 'banner-1024x500.png';
      link.href = dataUrl;
      link.click();
      toast.success('Downloaded banner-1024x500.png');
    } catch (err) {
      toast.error('Failed to download banner');
      console.error(err);
    }
  };

  return (
    <Card className="border border-border shadow-sm bg-card overflow-hidden">
      <div className="p-6 border-b border-border bg-surface-subtle">
        <h3 className="font-semibold text-foreground">Store Banner Preview</h3>
        <p className="text-sm text-muted-foreground mt-1">
          1024 × 500 — Play Store Feature Graphic
        </p>
      </div>
      <div className="p-6 space-y-4">
        <div className="border border-border rounded-xl overflow-hidden bg-surface-subtle">
          <canvas
            ref={canvasRef}
            width={BANNER_WIDTH}
            height={BANNER_HEIGHT}
            className="w-full h-auto block"
          />
        </div>
        <Button onClick={handleDownload} className="w-full" size="lg">
          <Download className="h-4 w-4 mr-2" />
          Download Banner (1024×500)
        </Button>
      </div>
    </Card>
  );
}
