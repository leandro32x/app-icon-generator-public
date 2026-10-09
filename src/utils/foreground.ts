/**
 * Foreground model.
 *
 * An icon's foreground can be one of three mutually exclusive kinds:
 *
 * - `icon`  — an Iconify icon (`iconify:<prefix>:<name>`, held in App state as
 *             `generatedIcon`).
 * - `image` — a user-uploaded PNG/JPEG/WebP/SVG stored as a data URL inside the
 *             icon config.
 * - `text`  — a short string rendered in a Fontsource web font.
 *
 * Every consumer (live preview tile, banner canvas, export pipeline, session
 * thumbnails, attribution) goes through `resolveForeground()` so the branching
 * logic lives in exactly one place.
 */

import { parseIconUrl } from './iconManager';
import { getOpticalScale } from './opticalScale';
import { resolveStops, type GradientStop } from './gradient';

export type ForegroundType = 'icon' | 'image' | 'text';

/** Foreground fields that live inside the persisted icon config. */
export interface ForegroundConfig {
  foregroundType: ForegroundType;
  /** Data URL (`data:image/...`) of the uploaded image, already size-capped. */
  imageDataUrl: string | null;
  imageName: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  /** Whether the uploaded image has any transparent pixels (drives UI hints). */
  imageHasAlpha: boolean;
  /** Recolor the image through its alpha channel with the foreground color/gradient. */
  imageTint: boolean;
  text: string;
  /** Fontsource font id, e.g. `inter`, `open-sans`. */
  textFontId: string;
  /** CSS font-family name as declared by the Fontsource stylesheet, e.g. `Open Sans`. */
  textFontFamily: string;
  textWeight: number;
  textItalic: boolean;
  /** Letter spacing in em units (0 = font default). */
  textLetterSpacing: number;
  /** Glyph offset from the tile center, percent of the visible tile side (-50…50). */
  foregroundOffsetX: number;
  foregroundOffsetY: number;
  /** Glyph scale in percent (25…200); 100 fills the padded box. */
  foregroundScale: number;
  /** Rotation in degrees (-180…180). */
  foregroundRotation: number;
  foregroundFlipX: boolean;
  foregroundFlipY: boolean;
}

export const DEFAULT_FOREGROUND_CONFIG: ForegroundConfig = {
  foregroundType: 'icon',
  imageDataUrl: null,
  imageName: null,
  imageWidth: null,
  imageHeight: null,
  imageHasAlpha: true,
  imageTint: false,
  text: '',
  textFontId: 'inter',
  textFontFamily: 'Inter',
  textWeight: 700,
  textItalic: false,
  textLetterSpacing: 0,
  foregroundOffsetX: 0,
  foregroundOffsetY: 0,
  foregroundScale: 100,
  foregroundRotation: 0,
  foregroundFlipX: false,
  foregroundFlipY: false,
};

/** Geometric adjustments applied to any foreground kind at composite time. */
export interface ForegroundTransform {
  offsetX: number;
  offsetY: number;
  scale: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
}

export const IDENTITY_TRANSFORM: ForegroundTransform = {
  offsetX: 0,
  offsetY: 0,
  scale: 100,
  rotation: 0,
  flipX: false,
  flipY: false,
};

export function getForegroundTransform(
  cfg: Partial<ForegroundConfig> | null | undefined,
): ForegroundTransform {
  return {
    offsetX: cfg?.foregroundOffsetX ?? 0,
    offsetY: cfg?.foregroundOffsetY ?? 0,
    scale: cfg?.foregroundScale ?? 100,
    rotation: cfg?.foregroundRotation ?? 0,
    flipX: !!cfg?.foregroundFlipX,
    flipY: !!cfg?.foregroundFlipY,
  };
}

export function isIdentityTransform(t: ForegroundTransform): boolean {
  return t.offsetX === 0 && t.offsetY === 0 && t.scale === 100 && t.rotation === 0 && !t.flipX && !t.flipY;
}

export function transformKey(t: ForegroundTransform): string {
  return `${t.offsetX}|${t.offsetY}|${t.scale}|${t.rotation}|${t.flipX ? 1 : 0}|${t.flipY ? 1 : 0}`;
}

/**
 * CSS `transform` equivalent of `drawTransformedGlyph` for the DOM preview.
 * `refSize` is the visible tile side the percent offsets refer to.
 */
export function foregroundCssTransform(t: ForegroundTransform, refSize: number): string | undefined {
  if (isIdentityTransform(t)) return undefined;
  const ox = (t.offsetX / 100) * refSize;
  const oy = (t.offsetY / 100) * refSize;
  const s = Math.max(0.01, t.scale / 100);
  const sx = s * (t.flipX ? -1 : 1);
  const sy = s * (t.flipY ? -1 : 1);
  return `translate(${ox}px, ${oy}px) rotate(${t.rotation}deg) scale(${sx}, ${sy})`;
}

export type ResolvedForeground =
  | { kind: 'icon'; iconifyId: string; source: string; name: string }
  | { kind: 'image'; dataUrl: string; tint: boolean; hasAlpha: boolean; name: string | null }
  | {
      kind: 'text';
      text: string;
      fontId: string;
      family: string;
      weight: number;
      italic: boolean;
      letterSpacing: number;
    };

/** Foreground kinds that are rasterized by `foregroundRenderer` (everything but Iconify icons). */
export type RasterForeground = Extract<ResolvedForeground, { kind: 'image' | 'text' }>;

/**
 * Resolve the effective foreground from the icon config + the Iconify URL.
 * Returns `null` when the selected kind has nothing to show yet (no icon
 * picked, no image uploaded, empty text). Tolerates raw legacy configs that
 * predate the foreground fields.
 */
export function resolveForeground(
  cfg: Partial<ForegroundConfig> | null | undefined,
  iconUrl: string | null | undefined,
): ResolvedForeground | null {
  const type: ForegroundType = cfg?.foregroundType ?? 'icon';

  if (type === 'image') {
    if (!cfg?.imageDataUrl) return null;
    return {
      kind: 'image',
      dataUrl: cfg.imageDataUrl,
      tint: !!cfg.imageTint,
      hasAlpha: cfg.imageHasAlpha ?? true,
      name: cfg.imageName ?? null,
    };
  }

  if (type === 'text') {
    const text = (cfg?.text ?? '').replace(/\r/g, '');
    if (!text.trim()) return null;
    return {
      kind: 'text',
      text,
      fontId: cfg?.textFontId || DEFAULT_FOREGROUND_CONFIG.textFontId,
      family: cfg?.textFontFamily || DEFAULT_FOREGROUND_CONFIG.textFontFamily,
      weight: cfg?.textWeight ?? DEFAULT_FOREGROUND_CONFIG.textWeight,
      italic: !!cfg?.textItalic,
      letterSpacing: cfg?.textLetterSpacing ?? 0,
    };
  }

  const parsed = parseIconUrl(iconUrl);
  if (!parsed) return null;
  return {
    kind: 'icon',
    iconifyId: `${parsed.source}:${parsed.name}`,
    source: parsed.source,
    name: parsed.name,
  };
}

/**
 * Stable string identity for a resolved foreground — safe to use in React
 * effect dependency arrays and as a cache key. For images the (already
 * string) data URL is embedded, so equal images always produce equal keys.
 */
export function foregroundKey(fg: ResolvedForeground | null): string {
  if (!fg) return 'none';
  switch (fg.kind) {
    case 'icon':
      return `icon:${fg.iconifyId}`;
    case 'image':
      return `image:${fg.tint ? 1 : 0}:${fg.dataUrl}`;
    case 'text':
      return `text:${JSON.stringify([fg.text, fg.fontId, fg.family, fg.weight, fg.italic, fg.letterSpacing])}`;
  }
}

/**
 * Optical size multiplier for the foreground. Iconify packs render at
 * visually different sizes for the same box (see `opticalScale.ts`); images
 * and text are already contain-fitted to the box, so they use 1.0.
 *
 * With no foreground selected the legacy behaviour (scale of the active
 * library) is kept so placeholder sizing does not change.
 */
export function getForegroundScale(
  fg: ResolvedForeground | null,
  iconSource: string,
  iconStyle?: string,
): number {
  if (!fg) return getOpticalScale(iconSource, iconStyle);
  if (fg.kind === 'icon') return getOpticalScale(fg.source || iconSource, iconStyle);
  return 1;
}

/** How a rasterized (image/text) glyph is filled. */
export type GlyphFill =
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; stops: GradientStop[]; angle: number }
  /** Flat black through the glyph's alpha — used for Android monochrome layers and cast shadows. */
  | { kind: 'silhouette' };

interface GlyphFillSource {
  iconColor: string;
  iconGradient: boolean;
  iconGradientStart: string;
  iconGradientEnd: string;
  iconGradientStops?: GradientStop[];
  iconGradientAngle?: number;
}

/**
 * Derive the glyph fill from the icon color settings. Part colors are an
 * SVG-only concept and are deliberately ignored for image/text foregrounds.
 */
export function getGlyphFill(cfg: GlyphFillSource, monochrome = false): GlyphFill {
  if (monochrome) return { kind: 'silhouette' };
  if (cfg.iconGradient) {
    return {
      kind: 'gradient',
      stops: resolveStops(cfg.iconGradientStops, cfg.iconGradientStart, cfg.iconGradientEnd),
      angle: cfg.iconGradientAngle ?? 135,
    };
  }
  return { kind: 'solid', color: cfg.iconColor };
}

/** Stable string identity for a glyph fill (effect dependency helper). */
export function glyphFillKey(fill: GlyphFill): string {
  return JSON.stringify(fill);
}
