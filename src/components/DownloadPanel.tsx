import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Button } from './ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { Download, CheckCircle2, Package, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { parseIconUrl, findIconByNameAndSource, loadIcon, type UnifiedIcon, type IconSource } from '../utils/iconManager';
import {
  angleToUserSpaceCoords,
  applyCanvasGradient,
  parseViewBox,
  resolveStops,
} from '../utils/gradient';
import { getEffectPalette, getScoreEffectOpacity } from '../utils/iconEffects';
import type { IconConfig } from '../utils/iconConfig';
import {
  getForegroundScale,
  getForegroundTransform,
  getGlyphFill,
  resolveForeground,
  type GlyphFill,
} from '../utils/foreground';
import { rasterizeForeground } from '../utils/foregroundRenderer';
import { drawGlyphWithEffect, drawTransformedGlyph } from '../utils/glyphEffects';
import { buildIconSvg } from '../utils/svgExport';
import { contrastRatio } from '../utils/color';
import JSZip from 'jszip';
import { generateAttributionContent } from '../utils/licenseManager';

interface DownloadPanelProps {
  /** Iconify URL of the picked icon. May be null when the foreground is an uploaded image or text. */
  iconUrl: string | null;
  config: IconConfig;
  iconSource: IconSource;
  iconStyle: string;
}

// iOS icon definitions based on Contents.json structure
const IOS_ICONS = [
  { filename: 'AppIcon@2x.png', idiom: 'iphone', scale: '2x', size: '60x60', pixelSize: 120 },
  { filename: 'AppIcon@3x.png', idiom: 'iphone', scale: '3x', size: '60x60', pixelSize: 180 },
  { filename: 'AppIcon~ipad.png', idiom: 'ipad', scale: '1x', size: '76x76', pixelSize: 76 },
  { filename: 'AppIcon@2x~ipad.png', idiom: 'ipad', scale: '2x', size: '76x76', pixelSize: 152 },
  { filename: 'AppIcon-83.5@2x~ipad.png', idiom: 'ipad', scale: '2x', size: '83.5x83.5', pixelSize: 167 },
  { filename: 'AppIcon-40@2x.png', idiom: 'iphone', scale: '2x', size: '40x40', pixelSize: 80 },
  { filename: 'AppIcon-40@3x.png', idiom: 'iphone', scale: '3x', size: '40x40', pixelSize: 120 },
  { filename: 'AppIcon-40~ipad.png', idiom: 'ipad', scale: '1x', size: '40x40', pixelSize: 40 },
  { filename: 'AppIcon-40@2x~ipad.png', idiom: 'ipad', scale: '2x', size: '40x40', pixelSize: 80 },
  { filename: 'AppIcon-20@2x.png', idiom: 'iphone', scale: '2x', size: '20x20', pixelSize: 40 },
  { filename: 'AppIcon-20@3x.png', idiom: 'iphone', scale: '3x', size: '20x20', pixelSize: 60 },
  { filename: 'AppIcon-20~ipad.png', idiom: 'ipad', scale: '1x', size: '20x20', pixelSize: 20 },
  { filename: 'AppIcon-20@2x~ipad.png', idiom: 'ipad', scale: '2x', size: '20x20', pixelSize: 40 },
  { filename: 'AppIcon-29.png', idiom: 'iphone', scale: '1x', size: '29x29', pixelSize: 29 },
  { filename: 'AppIcon-29@2x.png', idiom: 'iphone', scale: '2x', size: '29x29', pixelSize: 58 },
  { filename: 'AppIcon-29@3x.png', idiom: 'iphone', scale: '3x', size: '29x29', pixelSize: 87 },
  { filename: 'AppIcon-29~ipad.png', idiom: 'ipad', scale: '1x', size: '29x29', pixelSize: 29 },
  { filename: 'AppIcon-29@2x~ipad.png', idiom: 'ipad', scale: '2x', size: '29x29', pixelSize: 58 },
  { filename: 'AppIcon-60@2x~car.png', idiom: 'car', scale: '2x', size: '60x60', pixelSize: 120 },
  { filename: 'AppIcon-60@3x~car.png', idiom: 'car', scale: '3x', size: '60x60', pixelSize: 180 },
  { filename: 'AppIcon~ios-marketing.png', idiom: 'ios-marketing', scale: '1x', size: '1024x1024', pixelSize: 1024 },
];

// Legacy IOS_SIZES for individual downloads (keeping for backward compatibility)
const IOS_SIZES = [
  { name: 'App Store', size: 1024, required: true, filename: 'AppIcon-1024.png' },
  { name: 'iPhone 60x60@3x', size: 180, required: true, filename: 'AppIcon-60@3x.png' },
  { name: 'iPhone 60x60@2x', size: 120, required: true, filename: 'AppIcon-60@2x.png' },
  { name: 'iPhone 40x40@3x', size: 120, required: true, filename: 'AppIcon-40@3x.png' },
  { name: 'iPhone 40x40@2x', size: 80, required: true, filename: 'AppIcon-40@2x.png' },
  { name: 'iPhone 29x29@3x', size: 87, required: true, filename: 'AppIcon-29@3x.png' },
  { name: 'iPhone 29x29@2x', size: 58, required: true, filename: 'AppIcon-29@2x.png' },
  { name: 'iPad 76x76@2x', size: 152, required: true, filename: 'AppIcon-76@2x.png' },
  { name: 'iPad 76x76', size: 76, required: true, filename: 'AppIcon-76.png' },
  { name: 'iPad 40x40@2x', size: 80, required: true, filename: 'AppIcon-40@2x.png' },
  { name: 'iPad 29x29@2x', size: 58, required: true, filename: 'AppIcon-29@2x.png' },
  { name: 'Notification 20x20@3x', size: 60, required: false, filename: 'AppIcon-20@3x.png' },
];

const ANDROID_SIZES = [
  { name: 'Play Store', size: 512, density: 'xxxhdpi', required: true, filename: 'ic_launcher-512.png' },
  { name: 'xxxhdpi', size: 192, density: 'xxxhdpi', required: true, filename: 'ic_launcher-xxxhdpi.png' },
  { name: 'xxhdpi', size: 144, density: 'xxhdpi', required: true, filename: 'ic_launcher-xxhdpi.png' },
  { name: 'xhdpi', size: 96, density: 'xhdpi', required: true, filename: 'ic_launcher-xhdpi.png' },
  { name: 'hdpi', size: 72, density: 'hdpi', required: true, filename: 'ic_launcher-hdpi.png' },
  { name: 'mdpi', size: 48, density: 'mdpi', required: true, filename: 'ic_launcher-mdpi.png' },
];

// Android adaptive icons composite a 108dp layer, but only the central 72dp
// "safe zone" is guaranteed visible — the launcher mask (circle/squircle/etc.)
// may crop the outer 18dp on each side. Foreground/monochrome glyphs must be
// sized against the 72dp safe zone, not the full 108dp layer, or they render
// ~1.5x too large and get clipped in the generated files. The live preview
// models the same thing via IconTile's 108/72 `overscan`, which is why the
// preview looked correct while the export did not.
// https://developer.android.com/develop/ui/compose/system/icon_design_adaptive
const ADAPTIVE_SAFE_ZONE_RATIO = 72 / 108;

// Android adaptive icon sizes (108dp base)
const ANDROID_ADAPTIVE_SIZES = {
  mdpi: 108,
  hdpi: 162,
  xhdpi: 216,
  xxhdpi: 324,
  xxxhdpi: 432,
};

// Android legacy icon sizes (48dp base)
const ANDROID_LEGACY_SIZES = {
  mdpi: 48,
  hdpi: 72,
  xhdpi: 96,
  xxhdpi: 144,
  xxxhdpi: 192,
};

// Favicon / web assets. The `.ico` bundles several resolutions (the browser
// picks the best fit per context); the PNGs cover modern `<link rel="icon">`,
// the iOS home-screen `apple-touch-icon`, and the PWA web-app-manifest icons.
const FAVICON_ICO_SIZES = [16, 32, 48];

// iOS 18 dark/tinted appearances sit on the system's dark gray gradient; this
// is roughly its midpoint. A glyph below this contrast against it would be
// hard to see, so only then is its color swapped (see `variantGlyphColor`).
const IOS_DARK_BACKDROP_MID = '#28282B';
const IOS_DARK_MIN_CONTRAST = 2.5;
// Sample tint for the on-screen tinted thumbnail (iOS uses the user's pick).
const IOS_TINT_SAMPLE = '#6FA8FF';

const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) || 0) as [number, number, number];
};

type FaviconMode = 'rounded' | 'ios';

const FAVICON_PNG_ASSETS: { filename: string; size: number; name: string; mode: FaviconMode }[] = [
  { filename: 'favicon-16x16.png', size: 16, name: 'Favicon', mode: 'rounded' },
  { filename: 'favicon-32x32.png', size: 32, name: 'Favicon', mode: 'rounded' },
  // apple-touch-icon follows Apple HIG: a flat, fully opaque square (the OS
  // applies the rounded mask), so it is rendered like an iOS app icon.
  { filename: 'apple-touch-icon.png', size: 180, name: 'Apple touch icon', mode: 'ios' },
  { filename: 'android-chrome-192x192.png', size: 192, name: 'Android Chrome', mode: 'rounded' },
  { filename: 'android-chrome-512x512.png', size: 512, name: 'Android Chrome', mode: 'rounded' },
];

// Decode the base64 payload of a PNG data URL into raw bytes (for ICO packing).
const dataURLToUint8Array = (dataURL: string): Uint8Array => {
  const bstr = atob(dataURL.split(',')[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return u8arr;
};

// Assemble a multi-resolution `.ico` from already-encoded PNG images. Modern
// browsers accept PNG-compressed entries inside an ICO container, so we just
// wrap each PNG in an ICONDIRENTRY rather than re-encoding to BMP.
// Layout: 6-byte ICONDIR header + 16-byte ICONDIRENTRY per image + PNG data.
const buildIcoFromPngs = (images: { size: number; data: Uint8Array }[]): Blob => {
  const count = images.length;
  const headerSize = 6;
  const entrySize = 16;
  const dataOffsetBase = headerSize + entrySize * count;

  const header = new Uint8Array(headerSize);
  const headerView = new DataView(header.buffer);
  headerView.setUint16(0, 0, true); // reserved, must be 0
  headerView.setUint16(2, 1, true); // image type: 1 = icon
  headerView.setUint16(4, count, true); // number of images

  const directory = new Uint8Array(entrySize * count);
  const dirView = new DataView(directory.buffer);

  let offset = dataOffsetBase;
  images.forEach((img, i) => {
    const base = i * entrySize;
    // 0 in the width/height byte is interpreted as 256 px.
    directory[base + 0] = img.size >= 256 ? 0 : img.size; // width
    directory[base + 1] = img.size >= 256 ? 0 : img.size; // height
    directory[base + 2] = 0; // color palette count
    directory[base + 3] = 0; // reserved
    dirView.setUint16(base + 4, 1, true); // color planes
    dirView.setUint16(base + 6, 32, true); // bits per pixel
    dirView.setUint32(base + 8, img.data.length, true); // image data size
    dirView.setUint32(base + 12, offset, true); // image data offset
    offset += img.data.length;
  });

  // Cast: newer TypeScript types `Uint8Array` over `ArrayBufferLike`, which is
  // not assignable to `BlobPart`; the buffers here are plain ArrayBuffers.
  return new Blob([header, directory, ...images.map((img) => img.data)] as BlobPart[], {
    type: 'image/x-icon',
  });
};

export function DownloadPanel({ iconUrl, config, iconSource, iconStyle }: DownloadPanelProps) {
  const [downloading, setDownloading] = useState(false);

  // Icon, uploaded image or text. `null` means there is nothing to draw (App
  // hides the panel in that case, but every generator still guards on it).
  const fg = resolveForeground(config, iconUrl);
  // Offset / scale / rotation / flip applied to every export.
  const transform = getForegroundTransform(config);

  // iOS 18 appearance variants (dark + tinted) in the iOS ZIP, with previews.
  const [includeIOS18Variants, setIncludeIOS18Variants] = useState(true);
  const [variantPreviews, setVariantPreviews] = useState<{ light: string; dark: string; tinted: string } | null>(null);

  // Resolve multi-stop gradient fields with backwards-compatible fallback
  // to the legacy start/end pair.
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

  // Apply the background fill (solid or multi-stop gradient) to the current
  // canvas clip region covering a `size`×`size` square.
  const fillBackground = (ctx: CanvasRenderingContext2D, size: number) => {
    if (config.backgroundGradient) {
      ctx.fillStyle = applyCanvasGradient(ctx, bgStops, bgAngle, size);
    } else {
      ctx.fillStyle = config.backgroundColor;
    }
    ctx.fillRect(0, 0, size, size);
  };

  const getIconComponent = (iconUrl: string | null): UnifiedIcon | null => {
    const parsed = parseIconUrl(iconUrl);
    if (!parsed) return null;

    // Use the source from the URL if available, otherwise fall back to prop
    const source = parsed.source || iconSource;
    return findIconByNameAndSource(parsed.name, source);
  };

  // Helper to get the current icon source from URL or prop
  const getCurrentIconSource = (iconUrl: string): IconSource => {
    const parsed = parseIconUrl(iconUrl);
    return parsed?.source || iconSource;
  };

  // Helper to render icon component with correct props based on source
  const renderIconComponent = (
    IconComponent: UnifiedIcon,
    iconSize: number,
    iconCssStyle: React.CSSProperties,
    _iconUrl: string | null
  ) => {
    // Under Iconify, the adapter component reads `size` + `style`. Lucide-style
    // thick stroke is driven by CSS `strokeWidth` inside `iconCssStyle`.
    const strokeWidth = iconStyle === 'thick' ? 2.5 : undefined;
    return (
      <IconComponent
        size={iconSize}
        strokeWidth={strokeWidth}
        style={iconCssStyle}
      />
    );
  };

  // Helper: get proper CSS style for icon rendering (works for both stroke-based and fill-based icons)
  const getIconCssStyle = (gradientId: string, colorOverride?: string): React.CSSProperties => {
    if (config.usePartColors && config.iconPartColors.length > 0) {
      return { color: config.iconPartColors[0] };
    }
    if (config.iconGradient) {
      return { stroke: `url(#${gradientId})` };
    }
    return { color: colorOverride ?? config.iconColor };
  };

  // Helper: apply colors to SVG path elements respecting existing fill/stroke attributes.
  //
  // Multi-color ("palette") icon packs — e.g. BPMN, Cryptocurrency Color,
  // Emoji One, OpenEmoji, Rivet, SmartIcons Glyph, SVG Logos — ship hardcoded
  // hex fills/strokes per shape. The live preview (IconTile) leaves those
  // SVGs alone and only themes `currentColor` via CSS, which is why they
  // render with their original colors. To make the exported PNG match, we
  // only override attributes whose value is `currentColor` (the Iconify
  // monochrome convention) or attributes that are missing entirely (icons
  // that inherit `currentColor` from the SVG root). Hardcoded colors are
  // preserved unless the user explicitly opts in via `usePartColors`.
  const applyIconColorsToSvg = (svgElement: Element, gradientId: string, colorOverride?: string) => {
    const solidColor = colorOverride ?? config.iconColor;
    // Detect if this is a fill-based icon (e.g. Phosphor with fill="currentColor" on SVG root)
    // vs stroke-based (e.g. Lucide with fill="none" on SVG root)
    const svgRootFill = svgElement.getAttribute('fill');
    const isFillBasedIcon = !!svgRootFill && svgRootFill !== 'none';

    const isThemed = (v: string | null) =>
      !!v && v.toLowerCase() === 'currentcolor';

    const paths = svgElement.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse');
    paths.forEach((path, index) => {
      const currentFill = path.getAttribute('fill');
      const currentStroke = path.getAttribute('stroke');
      const hasNoExplicitAttrs = (!currentFill || currentFill === 'none') && (!currentStroke || currentStroke === 'none');

      if (config.usePartColors && config.iconPartColors.length > 0) {
        // User explicitly asked to recolor every part — override unconditionally.
        const colorIndex = index % config.iconPartColors.length;
        const color = config.iconPartColors[colorIndex];

        if (currentFill && currentFill !== 'none') {
          path.setAttribute('fill', color);
        }
        if (currentStroke && currentStroke !== 'none') {
          path.setAttribute('stroke', color);
        }
        if (hasNoExplicitAttrs) {
          if (isFillBasedIcon) {
            path.setAttribute('fill', color);
          } else {
            path.setAttribute('stroke', color);
            path.setAttribute('fill', 'none');
          }
        }
      } else if (config.iconGradient) {
        const gradRef = `url(#${gradientId})`;
        if (isThemed(currentFill)) {
          path.setAttribute('fill', gradRef);
        }
        if (isThemed(currentStroke)) {
          path.setAttribute('stroke', gradRef);
        }
        if (hasNoExplicitAttrs) {
          if (isFillBasedIcon) {
            path.setAttribute('fill', gradRef);
          } else {
            path.setAttribute('stroke', gradRef);
            path.setAttribute('fill', 'none');
          }
        }
      } else {
        if (isThemed(currentFill)) {
          path.setAttribute('fill', solidColor);
        }
        if (isThemed(currentStroke)) {
          path.setAttribute('stroke', solidColor);
        }
        if (hasNoExplicitAttrs) {
          if (isFillBasedIcon) {
            path.setAttribute('fill', solidColor);
          } else {
            path.setAttribute('stroke', solidColor);
            path.setAttribute('fill', 'none');
          }
        }
      }
    });
  };

  // Helper: apply monochrome colors to SVG path elements.
  //
  // The Android monochrome layer is meant for themed icons: it must end up
  // as a flat silhouette. We theme `currentColor` and unattributed paths to
  // black; hardcoded palette colors are left alone here and flattened to
  // grayscale by the post-draw CPU pass in `generateMonochromeLayer`.
  const applyMonochromeToSvg = (svgElement: Element) => {
    const svgRootFill = svgElement.getAttribute('fill');
    const isFillBasedIcon = !!svgRootFill && svgRootFill !== 'none';

    const isThemed = (v: string | null) =>
      !!v && v.toLowerCase() === 'currentcolor';

    const paths = svgElement.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse');
    paths.forEach((path) => {
      const currentFill = path.getAttribute('fill');
      const currentStroke = path.getAttribute('stroke');

      if (isThemed(currentFill)) {
        path.setAttribute('fill', '#000000');
      }
      if (isThemed(currentStroke)) {
        path.setAttribute('stroke', '#000000');
      }
      if ((!currentFill || currentFill === 'none') && (!currentStroke || currentStroke === 'none')) {
        if (isFillBasedIcon) {
          path.setAttribute('fill', '#000000');
        } else {
          path.setAttribute('stroke', '#000000');
          path.setAttribute('fill', 'none');
        }
      }
    });
  };

  // Helper: add gradient defs to SVG
  const addGradientDefs = (svgElement: Element, gradientId: string) => {
    if (!config.iconGradient || config.usePartColors) return;

    const svgNS = 'http://www.w3.org/2000/svg';
    // One sweep across the icon's viewBox (user space), like the live preview.
    const viewBox = parseViewBox(svgElement.getAttribute('viewBox')) ?? { x: 0, y: 0, width: 24, height: 24 };
    const coords = angleToUserSpaceCoords(iconAngle, viewBox);

    const buildGradient = (): SVGElement => {
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
      return gradient;
    };

    const existingDefs = svgElement.querySelector('defs');
    if (!existingDefs) {
      const defs = document.createElementNS(svgNS, 'defs');
      defs.appendChild(buildGradient());
      svgElement.insertBefore(defs, svgElement.firstChild);
    } else {
      // Remove any prior instance with our id (and any leftover legacy default
      // linearGradient without id) then append a fresh, correctly-stop'd one.
      const prior =
        existingDefs.querySelector(`#${gradientId}`) ||
        existingDefs.querySelector('linearGradient');
      if (prior) prior.remove();
      existingDefs.appendChild(buildGradient());
    }
  };

  // Helper: apply icon effect to canvas after drawing icon
  const applyIconEffect = (ctx: CanvasRenderingContext2D, size: number, radius: number) => {
    if (config.iconEffect === 'score') {
      // Score: dark overlay on top half
      ctx.save();
      // Clip to rounded rectangle
      ctx.beginPath();
      ctx.moveTo(radius, 0);
      ctx.lineTo(size - radius, 0);
      ctx.quadraticCurveTo(size, 0, size, radius);
      ctx.lineTo(size, size - radius);
      ctx.quadraticCurveTo(size, size, size - radius, size);
      ctx.lineTo(radius, size);
      ctx.quadraticCurveTo(0, size, 0, size - radius);
      ctx.lineTo(0, radius);
      ctx.quadraticCurveTo(0, 0, radius, 0);
      ctx.closePath();
      ctx.clip();

      ctx.fillStyle = `rgba(0,0,0,${getScoreEffectOpacity(config.iconEffectOpacity)})`;
      ctx.fillRect(0, 0, size, size / 2);

      ctx.restore();
    }
  };

  // Helper: draw a foreground glyph (SVG image, uploaded image or rasterized
  // text) to canvas with effect support. Every effect only needs pixels +
  // alpha, so any CanvasImageSource works.
  const drawIconWithEffect = (
    ctx: CanvasRenderingContext2D,
    img: CanvasImageSource,
    padding: number,
    iconSize: number,
    size: number,
    refSize: number = size,
    skipCast = false,
  ) => {
    // Shared compositor (also used by the banner and the live preview's cast
    // shadow): places the glyph with the user's transform, then applies the
    // drop shadow or the cast shadow clipped to the tile's rounded rect.
    // Score is applied post-draw by `applyIconEffect`.
    drawGlyphWithEffect(
      ctx,
      img,
      { tileSize: size, refSize, boxOrigin: padding, boxSize: iconSize, transform },
      config.iconEffect,
      config.iconEffectOpacity,
      { castClipRadiusPx: (size * config.cornerRadius) / 100, skipCast, palette: getEffectPalette(config) },
    );
  };

  // Helper: render icon SVG to canvas, handling React mount, SVG extraction, and cleanup
  const renderIconToCanvas = (
    ctx: CanvasRenderingContext2D,
    IconComponent: UnifiedIcon,
    size: number,
    padding: number,
    iconSize: number,
    options: {
      colorMode: 'normal' | 'monochrome';
      applyEffect: boolean;
      radius?: number;
      /** Visible tile side that percent offsets refer to (defaults to `size`). */
      refSize?: number;
      /** Replace the solid icon color (iOS appearance variants). */
      colorOverride?: string;
      /** Skip the cast shadow even when selected (transparent variants). */
      skipCast?: boolean;
    }
  ): Promise<void> => {
    return new Promise((resolve) => {
      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-9999px';
      tempContainer.style.width = `${iconSize}px`;
      tempContainer.style.height = `${iconSize}px`;
      document.body.appendChild(tempContainer);

      const gradientId = `iconGradient-${size}-${Date.now()}`;

      // Preload the Iconify data before mounting so the SVG is present in the
      // DOM on first render (avoids relying solely on the 100ms setTimeout).
      const parsedUrl = parseIconUrl(iconUrl);
      const iconifyId = parsedUrl ? `${parsedUrl.source}:${parsedUrl.name}` : null;
      const preload: Promise<unknown> = iconifyId
        ? loadIcon(iconifyId).catch(() => undefined)
        : Promise.resolve();

      Promise.all([import('react-dom/client'), preload]).then(([{ createRoot }]) => {
        const root = createRoot(tempContainer);

        const iconCssStyle = options.colorMode === 'monochrome'
          ? { color: '#000000' }
          : getIconCssStyle(gradientId, options.colorOverride);

        root.render(renderIconComponent(IconComponent, iconSize, iconCssStyle, iconUrl));

        setTimeout(() => {
          const svgElement = tempContainer.querySelector('svg');

          if (svgElement) {
            svgElement.setAttribute('width', iconSize.toString());
            svgElement.setAttribute('height', iconSize.toString());

            if (options.colorMode === 'monochrome') {
              applyMonochromeToSvg(svgElement);
            } else {
              applyIconColorsToSvg(svgElement, gradientId, options.colorOverride);
              addGradientDefs(svgElement, gradientId);
            }

            let svgData = new XMLSerializer().serializeToString(svgElement);
            // Replace unresolved currentColor references - these won't resolve in standalone SVG images
            const resolvedColor = options.colorMode === 'monochrome'
              ? '#000000'
              : options.colorOverride ?? config.iconColor;
            svgData = svgData.replace(/currentColor/gi, resolvedColor);
            const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(svgBlob);

            const img = new Image();
            img.onload = () => {
              if (options.applyEffect) {
                drawIconWithEffect(ctx, img, padding, iconSize, size, options.refSize, options.skipCast);
              } else {
                drawTransformedGlyph(ctx, img, {
                  tileSize: size,
                  refSize: options.refSize ?? size,
                  boxOrigin: padding,
                  boxSize: iconSize,
                  transform,
                });
              }
              URL.revokeObjectURL(url);
              document.body.removeChild(tempContainer);
              root.unmount();
              resolve();
            };
            img.onerror = () => {
              document.body.removeChild(tempContainer);
              root.unmount();
              resolve();
            };
            img.src = url;
          } else {
            document.body.removeChild(tempContainer);
            root.unmount();
            resolve();
          }
        }, 100);
      });
    });
  };

  // Glyph box for a given available span (tile minus padding, or the adaptive
  // safe zone). Iconify packs apply their per-collection optical multiplier;
  // images and text are already contain-fitted and use 1.0.
  const glyphSize = (size: number, available: number): number =>
    Math.min(size, available * getForegroundScale(fg, iconSource, iconStyle));

  // Draw the current foreground, whatever its kind, into `ctx`. Icons go
  // through the React/SVG path in `renderIconToCanvas`; images and text are
  // rasterized by the shared renderer and composited with the same effects.
  const renderForeground = async (
    ctx: CanvasRenderingContext2D,
    opts: {
      size: number;
      iconPadding: number;
      iconSize: number;
      colorMode: 'normal' | 'monochrome';
      applyEffect: boolean;
      radius?: number;
      /** Visible tile side that percent offsets refer to (defaults to `size`). */
      refSize?: number;
      /** Replace a solid foreground color (iOS appearance variants). */
      colorOverride?: string;
      /** Skip the cast shadow even when selected (transparent variants). */
      skipCast?: boolean;
    },
  ): Promise<void> => {
    if (!fg) return;
    const refSize = opts.refSize ?? opts.size;
    if (fg.kind === 'icon') {
      const IconComponent = getIconComponent(iconUrl);
      if (!IconComponent) return;
      await renderIconToCanvas(ctx, IconComponent, opts.size, opts.iconPadding, opts.iconSize, {
        colorMode: opts.colorMode,
        applyEffect: opts.applyEffect,
        radius: opts.radius,
        refSize,
        colorOverride: opts.colorOverride,
        skipCast: opts.skipCast,
      });
      return;
    }
    let fill: GlyphFill = getGlyphFill(config, opts.colorMode === 'monochrome');
    if (opts.colorOverride && fill.kind === 'solid') fill = { kind: 'solid', color: opts.colorOverride };
    const glyph = await rasterizeForeground(fg, Math.round(opts.iconSize), { fill });
    if (opts.applyEffect) {
      drawIconWithEffect(ctx, glyph, opts.iconPadding, opts.iconSize, opts.size, refSize, opts.skipCast);
    } else {
      drawTransformedGlyph(ctx, glyph, {
        tileSize: opts.size,
        refSize,
        boxOrigin: opts.iconPadding,
        boxSize: opts.iconSize,
        transform,
      });
    }
  };

  // iOS 18 appearance variants are glyph-only on a transparent background:
  // the system paints its own dark gradient (dark) or tints a grayscale glyph
  // (tinted). Brand-colored glyphs (blue, red, purple…) stay as they are, like
  // Apple's own dark icons; only a glyph that would all but vanish against the
  // dark backdrop (near-black, e.g. the "Paper" look) switches to the icon's
  // background color (or white when that is dark too), so the variants match
  // the main preview whenever they can.
  const variantGlyphColor = (): string | undefined => {
    if (config.iconGradient || (config.usePartColors && config.iconPartColors.length > 0)) return undefined;
    if (fg?.kind === 'image' && !config.imageTint) return undefined;
    if (contrastRatio(config.iconColor, IOS_DARK_BACKDROP_MID) >= IOS_DARK_MIN_CONTRAST) return undefined;
    const bg = config.backgroundGradient ? bgStops[0]?.color ?? config.backgroundColor : config.backgroundColor;
    return contrastRatio(bg, IOS_DARK_BACKDROP_MID) >= IOS_DARK_MIN_CONTRAST ? bg : '#FFFFFF';
  };

  /**
   * `previewTint` is for the on-screen thumbnail only: iOS colors the
   * grayscale glyph with the user's tint, so the preview shows a sample tint
   * instead of a gray glyph that would look identical to the dark variant.
   * The exported PNG is always plain grayscale, as Apple requires.
   */
  const generateIOSVariant = async (
    size: number,
    variant: 'dark' | 'tinted',
    previewTint?: string,
  ): Promise<string> => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);

    if (fg) {
      const padding = (config.padding / 100) * size;
      const iconSize = glyphSize(size, size - padding * 2);
      const iconPadding = (size - iconSize) / 2;
      await renderForeground(ctx, {
        size,
        iconPadding,
        iconSize,
        colorMode: 'normal',
        // Only the drop shadow makes sense without a tile; cast shadow and
        // score are tile-bound and skipped.
        applyEffect: config.iconEffect === 'drop-shadow',
        radius: 0,
        refSize: size,
        colorOverride: variantGlyphColor(),
        skipCast: true,
      });
    }

    if (variant === 'tinted') {
      // Grayscale (luminance), alpha untouched — iOS applies the tint color.
      const tint = previewTint ? hexToRgb(previewTint) : null;
      const imageData = ctx.getImageData(0, 0, size, size);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        if (tint) {
          // Luminosity → tint intensity, the way iOS renders tinted icons.
          const k = gray / 255;
          data[i] = tint[0] * k;
          data[i + 1] = tint[1] * k;
          data[i + 2] = tint[2] * k;
        } else {
          data[i] = gray;
          data[i + 1] = gray;
          data[i + 2] = gray;
        }
      }
      ctx.putImageData(imageData, 0, 0);
    }
    return canvas.toDataURL('image/png');
  };

  const generateIcon = async (size: number): Promise<string> => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const radius = (config.cornerRadius / 100) * size;
    const padding = (config.padding / 100) * size;

    // Draw background with rounded rect clip
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(size - radius, 0);
    ctx.quadraticCurveTo(size, 0, size, radius);
    ctx.lineTo(size, size - radius);
    ctx.quadraticCurveTo(size, size, size - radius, size);
    ctx.lineTo(radius, size);
    ctx.quadraticCurveTo(0, size, 0, size - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.clip();

    fillBackground(ctx, size);
    ctx.restore();

    // Clip for icon rendering
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(size - radius, 0);
    ctx.quadraticCurveTo(size, 0, size, radius);
    ctx.lineTo(size, size - radius);
    ctx.quadraticCurveTo(size, size, size - radius, size);
    ctx.lineTo(radius, size);
    ctx.quadraticCurveTo(0, size, 0, size - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.clip();

    if (fg) {
      const iconSize = glyphSize(size, size - padding * 2);
      const iconPadding = (size - iconSize) / 2;
      await renderForeground(ctx, {
        size,
        iconPadding,
        iconSize,
        colorMode: 'normal',
        applyEffect: true,
        radius,
      });
    }

    ctx.restore();
    // Apply post-draw effects (score)
    applyIconEffect(ctx, size, radius);
    return canvas.toDataURL('image/png');
  };

  // Generate round icon (for legacy Android icons)
  const generateRoundIcon = async (size: number): Promise<string> => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const padding = (config.padding / 100) * size;
    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2;

    // Draw circular background
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.clip();

    fillBackground(ctx, size);
    ctx.restore();

    // Clip for icon rendering
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.closePath();
    ctx.clip();

    if (fg) {
      const iconSize = glyphSize(size, size - padding * 2);
      const iconPadding = (size - iconSize) / 2;
      await renderForeground(ctx, {
        size,
        iconPadding,
        iconSize,
        colorMode: 'normal',
        applyEffect: true,
      });
    }

    ctx.restore();
    // Apply post-draw effects (score) — circular clip for round icon
    applyIconEffect(ctx, size, size / 2);
    return canvas.toDataURL('image/png');
  };

  const downloadIcon = async (filename: string, size: number) => {
    try {
      const dataUrl = await generateIcon(size);
      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      link.click();
      toast.success(`Downloaded ${filename}`);
    } catch (error) {
      toast.error('Failed to download icon');
    }
  };

  // Generate iOS icon per Apple HIG: flat square, fully opaque. The system
  // applies the squircle mask at display time, so the exported PNG must NOT
  // have baked-in rounded corners. `config.padding` is the single control for
  // visible glyph size and is consistent with the Android preview/export.
  // See: https://developer.apple.com/design/human-interface-guidelines/app-icons
  const generateIOSIcon = async (size: number): Promise<string> => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Fully opaque square background — no rounded corners.
    fillBackground(ctx, size);

    if (fg) {
      const padding = (config.padding / 100) * size;
      const iconSize = glyphSize(size, size - padding * 2);
      const iconPadding = (size - iconSize) / 2;
      await renderForeground(ctx, {
        size,
        iconPadding,
        iconSize,
        colorMode: 'normal',
        applyEffect: true,
        // radius 0 — the exported asset is a flat square per Apple HIG.
        radius: 0,
      });
    }

    // Post-draw effects (score) on a square canvas.
    applyIconEffect(ctx, size, 0);

    // Guarantee full opacity (required for iOS App Store submission).
    const imageData = ctx.getImageData(0, 0, size, size);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL('image/png');
  };

  // Files in the iOS ZIP: the single-size set (1 light + optional dark/tinted)
  // plus every legacy explicit size.
  const iosZipFileCount = 1 + (includeIOS18Variants ? 2 : 0) + IOS_ICONS.length;

  const downloadAllIOS = async () => {
    setDownloading(true);
    toast.info('Generating iOS icons...');

    try {
      const zip = new JSZip();
      const iosFolder = zip.folder('ios')!;

      // Modern single-size asset catalog (Xcode 14+ derives every size from
      // the 1024 image) with the iOS 18 dark & tinted appearances.
      const modern = iosFolder.folder('AppIcon.appiconset')!;
      modern.file('AppIcon.png', dataURLToBlob(await generateIOSIcon(1024)));
      const modernImages: Record<string, unknown>[] = [
        { filename: 'AppIcon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' },
      ];
      if (includeIOS18Variants) {
        modern.file('AppIcon-Dark.png', dataURLToBlob(await generateIOSVariant(1024, 'dark')));
        modern.file('AppIcon-Tinted.png', dataURLToBlob(await generateIOSVariant(1024, 'tinted')));
        modernImages.push(
          {
            appearances: [{ appearance: 'luminosity', value: 'dark' }],
            filename: 'AppIcon-Dark.png',
            idiom: 'universal',
            platform: 'ios',
            size: '1024x1024',
          },
          {
            appearances: [{ appearance: 'luminosity', value: 'tinted' }],
            filename: 'AppIcon-Tinted.png',
            idiom: 'universal',
            platform: 'ios',
            size: '1024x1024',
          },
        );
      }
      modern.file(
        'Contents.json',
        JSON.stringify({ images: modernImages, info: { author: 'app-icon-generator', version: 1 } }, null, 2),
      );

      // Legacy explicit sizes for older Xcode versions / manual use.
      const legacy = iosFolder.folder('legacy-sizes')!;
      for (const icon of IOS_ICONS) {
        const iconDataUrl = await generateIOSIcon(icon.pixelSize);
        legacy.file(icon.filename, dataURLToBlob(iconDataUrl));
        // Small delay to prevent UI blocking
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      const contentsJson = {
        images: IOS_ICONS.map(icon => ({
          filename: icon.filename,
          idiom: icon.idiom,
          scale: icon.scale,
          size: icon.size,
        })),
        info: {
          author: 'app-icon-generator',
          version: 1,
        },
      };
      legacy.file('Contents.json', JSON.stringify(contentsJson, null, 2));

      iosFolder.file(
        'README.txt',
        `iOS app icons generated by App Icon Generator
=============================================

AppIcon.appiconset/
  Drag this folder into your Xcode project's Assets.xcassets (replace the
  existing AppIcon). Xcode 14 or newer derives every size from the single
  1024x1024 image.${includeIOS18Variants ? `
  Contents.json also registers the iOS 18 appearances:
    AppIcon.png         light (default)
    AppIcon-Dark.png    dark   — transparent background; iOS adds its dark gradient
    AppIcon-Tinted.png  tinted — grayscale glyph; iOS applies the user's tint color` : ''}

legacy-sizes/
  Every explicit iPhone / iPad size with its own Contents.json, for older
  Xcode versions or tooling that needs individual files.
`,
      );
      iosFolder.file('ATTRIBUTION.md', await generateAttributionContent(iconUrl, fg));

      // Generate ZIP file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'ios-icons.zip';
      link.click();
      URL.revokeObjectURL(url);

      setDownloading(false);
      toast.success('iOS icons downloaded as ZIP!');
    } catch (error) {
      console.error('Error generating iOS icons:', error);
      setDownloading(false);
      toast.error('Failed to generate iOS icons');
    }
  };

  // Generate background layer (just background, no icon, square for adaptive icons)
  const generateBackgroundLayer = async (size: number): Promise<string> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      // Fill background (adaptive icons are square, no corner radius)
      fillBackground(ctx, size);

      resolve(canvas.toDataURL('image/png'));
    });
  };

  // Generate foreground layer (icon on transparent background, square)
  const generateForegroundLayer = async (size: number): Promise<string> => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);

    if (fg) {
      // Size the glyph against the 72dp safe zone (not the full 108dp layer) so
      // it stays inside the launcher mask and matches the live preview. Padding
      // is applied within the safe zone, exactly like IconTile.
      const safeZone = size * ADAPTIVE_SAFE_ZONE_RATIO;
      const iconSize = glyphSize(size, safeZone * (1 - (config.padding / 100) * 2));
      const iconPadding = (size - iconSize) / 2;
      await renderForeground(ctx, {
        size,
        iconPadding,
        iconSize,
        colorMode: 'normal',
        applyEffect: true,
        // Percent offsets refer to the visible 72dp safe zone, like the preview.
        refSize: safeZone,
      });
    }
    // Apply post-draw effects (score) — radius 0 since foreground is a full square
    applyIconEffect(ctx, size, 0);
    return canvas.toDataURL('image/png');
  };

  // Generate monochrome layer (icon in grayscale)
  const generateMonochromeLayer = async (size: number): Promise<string> => {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);

    if (fg) {
      // Same 72dp safe-zone sizing as the foreground layer so the themed
      // monochrome silhouette stays inside the launcher mask. Images and text
      // become a flat black silhouette through their alpha (Android tints the
      // monochrome drawable by alpha only).
      const safeZone = size * ADAPTIVE_SAFE_ZONE_RATIO;
      const iconSize = glyphSize(size, safeZone * (1 - (config.padding / 100) * 2));
      const iconPadding = (size - iconSize) / 2;
      await renderForeground(ctx, {
        size,
        iconPadding,
        iconSize,
        colorMode: 'monochrome',
        applyEffect: false,
        refSize: safeZone,
      });

      // Convert to grayscale
      const imageData = ctx.getImageData(0, 0, size, size);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
      }
      ctx.putImageData(imageData, 0, 0);
    }
    return canvas.toDataURL('image/png');
  };

  // Convert data URL to blob
  const dataURLToBlob = (dataURL: string): Blob => {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)![1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };

  const downloadAllAndroid = async () => {
    setDownloading(true);
    toast.info('Generating Android adaptive icons...');

    try {
      const zip = new JSZip();

      // Generate Play Store icon (512x512)
      const playStoreIcon = await generateIcon(512);
      const playStoreBlob = dataURLToBlob(playStoreIcon);
      zip.file('play_store_512.png', playStoreBlob);

      // Create res folder structure
      const resFolder = zip.folder('res');

      // Create mipmap-anydpi-v26 folder and XML file
      const anydpiFolder = resFolder!.folder('mipmap-anydpi-v26');
      const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
  <background android:drawable="@mipmap/ic_launcher_background"/>
  <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
  <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>`;
      anydpiFolder!.file('ic_launcher.xml', xmlContent);

      // Generate icons for each density
      const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'] as const;

      for (const density of densities) {
        const adaptiveSize = ANDROID_ADAPTIVE_SIZES[density];
        const legacySize = ANDROID_LEGACY_SIZES[density];

        const mipmapFolder = resFolder!.folder(`mipmap-${density}`);

        // Generate background layer
        const backgroundDataUrl = await generateBackgroundLayer(adaptiveSize);
        const backgroundBlob = dataURLToBlob(backgroundDataUrl);
        mipmapFolder!.file('ic_launcher_background.png', backgroundBlob);

        // Generate foreground layer
        const foregroundDataUrl = await generateForegroundLayer(adaptiveSize);
        const foregroundBlob = dataURLToBlob(foregroundDataUrl);
        mipmapFolder!.file('ic_launcher_foreground.png', foregroundBlob);

        // Generate monochrome layer
        const monochromeDataUrl = await generateMonochromeLayer(adaptiveSize);
        const monochromeBlob = dataURLToBlob(monochromeDataUrl);
        mipmapFolder!.file('ic_launcher_monochrome.png', monochromeBlob);

        // Generate legacy icon (full icon with background, round shape)
        const legacyDataUrl = await generateRoundIcon(legacySize);
        const legacyBlob = dataURLToBlob(legacyDataUrl);
        mipmapFolder!.file('ic_launcher.png', legacyBlob);

        // Small delay to prevent UI blocking
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      zip.file('ATTRIBUTION.md', await generateAttributionContent(iconUrl, fg));

      // Generate ZIP file
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'android-icons.zip';
      link.click();
      URL.revokeObjectURL(url);

      setDownloading(false);
      toast.success('Android adaptive icons downloaded as ZIP!');
    } catch (error) {
      console.error('Error generating Android icons:', error);
      setDownloading(false);
      toast.error('Failed to generate Android icons');
    }
  };

  // Render a single favicon PNG. The `apple-touch-icon` is exported as a flat
  // opaque square (iOS applies its own mask); everything else keeps the
  // configured corner radius so it matches the on-screen preview.
  const generateFaviconPng = (mode: FaviconMode, size: number): Promise<string> =>
    mode === 'ios' ? generateIOSIcon(size) : generateIcon(size);

  // Theme/background color for the web app manifest. Falls back to the first
  // gradient stop when a gradient background is in use.
  const manifestThemeColor = config.backgroundGradient
    ? bgStops[0]?.color ?? config.backgroundColor
    : config.backgroundColor;

  const buildFaviconIco = async (): Promise<Blob> => {
    const images: { size: number; data: Uint8Array }[] = [];
    for (const size of FAVICON_ICO_SIZES) {
      const dataUrl = await generateIcon(size);
      images.push({ size, data: dataURLToUint8Array(dataUrl) });
    }
    return buildIcoFromPngs(images);
  };

  const downloadFaviconIco = async () => {
    try {
      const blob = await buildFaviconIco();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = 'favicon.ico';
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Downloaded favicon.ico');
    } catch (error) {
      console.error('Error generating favicon.ico:', error);
      toast.error('Failed to download favicon.ico');
    }
  };

  const downloadFaviconPng = async (mode: FaviconMode, size: number, filename: string) => {
    try {
      const dataUrl = await generateFaviconPng(mode, size);
      const link = document.createElement('a');
      link.download = filename;
      link.href = dataUrl;
      link.click();
      toast.success(`Downloaded ${filename}`);
    } catch (error) {
      toast.error(`Failed to download ${filename}`);
    }
  };

  // Vector exports. `favicon.svg` darkens its background under
  // `prefers-color-scheme: dark`; `icon.svg` is the plain design.
  const buildSvg = (darkModeAware: boolean): Promise<string> =>
    buildIconSvg(config, fg, { size: 1024, darkModeAware, iconSource, iconStyle });

  const downloadSvg = async (filename: string, darkModeAware: boolean) => {
    try {
      const svg = await buildSvg(darkModeAware);
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = filename;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${filename}`);
    } catch (error) {
      console.error(`Error building ${filename}:`, error);
      toast.error(`Failed to download ${filename}`);
    }
  };

  const downloadFaviconPackage = async () => {
    setDownloading(true);
    toast.info('Generating favicon package...');

    try {
      const zip = new JSZip();

      // Multi-resolution favicon.ico + scalable, dark-mode-aware SVG
      zip.file('favicon.ico', await buildFaviconIco());
      zip.file('favicon.svg', await buildSvg(true));

      // PNG assets
      for (const asset of FAVICON_PNG_ASSETS) {
        const dataUrl = await generateFaviconPng(asset.mode, asset.size);
        zip.file(asset.filename, dataURLToBlob(dataUrl));
        // Small delay to keep the UI responsive between renders
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      // PWA web app manifest
      const webmanifest = {
        name: '',
        short_name: '',
        icons: [
          { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
        theme_color: manifestThemeColor,
        background_color: manifestThemeColor,
        display: 'standalone',
      };
      zip.file('site.webmanifest', JSON.stringify(webmanifest, null, 2));

      // Usage instructions + HTML <head> snippet
      const readme = `Favicon package generated by App Icon Generator
================================================

1. Copy every file in this folder to the root of your website.
2. Add the following tags inside the <head> of your HTML:

<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/x-icon" href="/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">

Files included
--------------
- favicon.svg .................. scalable vector; darkens its background in dark mode
- favicon.ico .................. ${FAVICON_ICO_SIZES.join(', ')} px (multi-resolution)
- favicon-16x16.png ............ classic browser tab favicon
- favicon-32x32.png ............ high-DPI browser tab favicon
- apple-touch-icon.png ......... 180x180, iOS home screen
- android-chrome-192x192.png ... PWA / Android home screen
- android-chrome-512x512.png ... PWA splash / store listing
- site.webmanifest ............. PWA metadata (set "name"/"short_name")
`;
      zip.file('README.txt', readme);

      zip.file('ATTRIBUTION.md', await generateAttributionContent(iconUrl, fg));

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'favicon.zip';
      link.click();
      URL.revokeObjectURL(url);

      setDownloading(false);
      toast.success('Favicon package downloaded as ZIP!');
    } catch (error) {
      console.error('Error generating favicon package:', error);
      setDownloading(false);
      toast.error('Failed to generate favicon package');
    }
  };

  // Small light / dark / tinted previews for the iOS tab, regenerated
  // (debounced) whenever the design changes.
  useEffect(() => {
    if (!fg || !includeIOS18Variants) {
      setVariantPreviews(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(async () => {
      try {
        const light = await generateIOSIcon(144);
        const dark = await generateIOSVariant(144, 'dark');
        const tinted = await generateIOSVariant(144, 'tinted', IOS_TINT_SAMPLE);
        if (!cancelled) setVariantPreviews({ light, dark, tinted });
      } catch {
        if (!cancelled) setVariantPreviews(null);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
    // The generators close over `config`/`fg`; re-run whenever the design changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, iconUrl, iconSource, iconStyle, includeIOS18Variants]);

  return (
    <Card className="border border-border shadow-sm bg-card overflow-hidden">
      <div className="p-6 border-b border-border bg-surface-subtle">
        <h3 className="font-semibold text-foreground">Download Assets</h3>
        <p className="text-sm text-muted-foreground mt-1">Export your icon for all platforms</p>
      </div>
      <CardContent>
        <div className="space-y-4">
          <Tabs defaultValue="ios" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="ios">iOS ({IOS_SIZES.length})</TabsTrigger>
              <TabsTrigger value="android">Android ({ANDROID_SIZES.length})</TabsTrigger>
              <TabsTrigger value="web">Web ({FAVICON_PNG_ASSETS.length + 1})</TabsTrigger>
            </TabsList>

            <TabsContent value="ios" className="space-y-3 mt-4">
              <Button
                onClick={downloadAllIOS}
                disabled={downloading}
                className="w-full"
                size="lg"
              >
                <Package className="mr-2 h-5 w-5" />
                Download iOS AppIcon Set ({iosZipFileCount} files)
              </Button>
              <p className="text-xs text-muted-foreground -mt-1">
                AppIcon.appiconset (single 1024 px, Xcode 14+) plus every legacy size.
              </p>

              {/* iOS 18 appearance variants */}
              <div className="rounded-lg border border-border bg-surface-subtle p-3 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 pr-2">
                    <Label htmlFor="ios18-variants" className="text-sm font-medium">iOS 18 dark &amp; tinted icons</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Adds AppIcon-Dark.png and AppIcon-Tinted.png, registered as appearances in Contents.json.
                      Both are glyph-only: iOS draws its own dark background and applies the tint (the preview
                      uses a sample tint; the file itself is grayscale).
                    </p>
                  </div>
                  <Switch
                    id="ios18-variants"
                    checked={includeIOS18Variants}
                    onCheckedChange={(checked: boolean) => setIncludeIOS18Variants(checked)}
                  />
                </div>
                {includeIOS18Variants && variantPreviews && (
                  <div className="flex items-end gap-5">
                    {([
                      ['Light', variantPreviews.light, false],
                      ['Dark', variantPreviews.dark, true],
                      ['Tinted', variantPreviews.tinted, true],
                    ] as [string, string, boolean][]).map(([label, src, onDark]) => (
                      <div key={label} className="text-center">
                        <div
                          className="overflow-hidden"
                          style={{
                            width: 72,
                            height: 72,
                            borderRadius: '22%',
                            background: onDark ? 'linear-gradient(180deg, #3a3a3d 0%, #151517 100%)' : 'transparent',
                          }}
                        >
                          <img src={src} width={72} height={72} alt={`${label} icon preview`} draggable={false} />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">{label}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {IOS_SIZES.map((icon) => (
                  <div
                    key={icon.name}
                    className="flex items-center justify-between p-3 bg-surface-subtle rounded-lg hover:bg-surface-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="bg-card rounded border border-border flex items-center justify-center"
                        style={{ width: 40, height: 40 }}
                      >
                        <span className="text-xs text-muted-foreground">{icon.size}</span>
                      </div>
                      <div>
                        <p className="text-sm">{icon.name}</p>
                        <p className="text-xs text-muted-foreground">{icon.filename}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {icon.required && (
                        <Badge variant="secondary" className="text-xs">Required</Badge>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => downloadIcon(icon.filename, icon.size)}
                        disabled={downloading}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="android" className="space-y-3 mt-4">
              <Button
                onClick={downloadAllAndroid}
                disabled={downloading}
                className="w-full"
                size="lg"
              >
                <Package className="mr-2 h-5 w-5" />
                Download All Android Icons ({ANDROID_SIZES.length} files)
              </Button>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {ANDROID_SIZES.map((icon) => (
                  <div
                    key={icon.name}
                    className="flex items-center justify-between p-3 bg-surface-subtle rounded-lg hover:bg-surface-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="bg-card rounded border border-border flex items-center justify-center"
                        style={{ width: 40, height: 40 }}
                      >
                        <span className="text-xs text-muted-foreground">{icon.size}</span>
                      </div>
                      <div>
                        <p className="text-sm">{icon.name}</p>
                        <p className="text-xs text-muted-foreground">{icon.filename}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {icon.required && (
                        <Badge variant="secondary" className="text-xs">Required</Badge>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => downloadIcon(icon.filename, icon.size)}
                        disabled={downloading}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="web" className="space-y-3 mt-4">
              <Button
                onClick={downloadFaviconPackage}
                disabled={downloading}
                className="w-full"
                size="lg"
              >
                <Globe className="mr-2 h-5 w-5" />
                Download Favicon Package (ZIP)
              </Button>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {/* favicon.ico (multi-resolution) */}
                <div className="flex items-center justify-between p-3 bg-surface-subtle rounded-lg hover:bg-surface-muted transition-colors">
                  <div className="flex items-center gap-3">
                    <div
                      className="bg-card rounded border border-border flex items-center justify-center"
                      style={{ width: 40, height: 40 }}
                    >
                      <span className="text-xs text-muted-foreground">ico</span>
                    </div>
                    <div>
                      <p className="text-sm">favicon.ico</p>
                      <p className="text-xs text-muted-foreground">
                        {FAVICON_ICO_SIZES.join(' · ')} px
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-xs">Required</Badge>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={downloadFaviconIco}
                      disabled={downloading}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Vector exports */}
                {([
                  ['favicon.svg', 'Scalable favicon · darkens in dark mode', true],
                  ['icon.svg', 'Scalable vector of the full icon', false],
                ] as [string, string, boolean][]).map(([filename, description, darkAware]) => (
                  <div
                    key={filename}
                    className="flex items-center justify-between p-3 bg-surface-subtle rounded-lg hover:bg-surface-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="bg-card rounded border border-border flex items-center justify-center"
                        style={{ width: 40, height: 40 }}
                      >
                        <span className="text-xs text-muted-foreground">svg</span>
                      </div>
                      <div>
                        <p className="text-sm">{filename}</p>
                        <p className="text-xs text-muted-foreground">{description}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => downloadSvg(filename, darkAware)}
                      disabled={downloading}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                {FAVICON_PNG_ASSETS.map((asset) => (
                  <div
                    key={asset.filename}
                    className="flex items-center justify-between p-3 bg-surface-subtle rounded-lg hover:bg-surface-muted transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="bg-card rounded border border-border flex items-center justify-center"
                        style={{ width: 40, height: 40 }}
                      >
                        <span className="text-xs text-muted-foreground">{asset.size}</span>
                      </div>
                      <div>
                        <p className="text-sm">{asset.name}</p>
                        <p className="text-xs text-muted-foreground">{asset.filename}</p>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => downloadFaviconPng(asset.mode, asset.size, asset.filename)}
                      disabled={downloading}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <div className="pt-4 border-t border-border">
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 mt-0.5 text-green-500" />
              <div>
                <p>All icons are generated according to Apple and Google's official guidelines and include all required sizes for App Store and Play Store submission.</p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}