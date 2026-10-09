import { contrastRatio, hexToHsl, hslToHex } from './color';
import { resolveStops } from './gradient';
import type { IconConfig } from './iconConfig';

export const SCORE_EFFECT_ALPHA = 0.22;

export function getScoreEffectOpacity(effectOpacity: number) {
  return SCORE_EFFECT_ALPHA * (effectOpacity / 100);
}

/* ------------------------------------------------------------------------ */
/* Drop shadow                                                               */
/* ------------------------------------------------------------------------ */

/** Drop-shadow downward shift as a fraction of the visible tile. */
export const DROP_SHADOW_OFFSET_RATIO = 0.035;
/**
 * Drop-shadow blur as a fraction of the visible tile. This is the CSS
 * `drop-shadow()` blur radius and the canvas `shadowBlur` (both 2σ); SVG's
 * `stdDeviation` is half of it.
 */
export const DROP_SHADOW_BLUR_RATIO = 0.03;
/** Shadow alpha at 100% effect opacity. */
export const DROP_SHADOW_ALPHA = 0.75;

/**
 * Drop-shadow geometry in px for a visible tile of `refSize`. Kept tight and
 * dense so it still reads on thin stroke icons, at launcher sizes and on dark
 * tiles (a wide, soft shadow hides almost entirely under the glyph there).
 */
export function getDropShadow(refSize: number, effectOpacity: number) {
  return {
    dy: Math.max(1, refSize * DROP_SHADOW_OFFSET_RATIO),
    blur: Math.max(1, refSize * DROP_SHADOW_BLUR_RATIO),
    alpha: DROP_SHADOW_ALPHA * Math.max(0, Math.min(1, effectOpacity / 100)),
  };
}

/* ------------------------------------------------------------------------ */
/* Outline (sticker) & offset print                                          */
/* ------------------------------------------------------------------------ */

/** Outline stroke width as a fraction of the visible tile. */
export const OUTLINE_WIDTH_RATIO = 0.03;
/** Offset-print shift (x and y) as a fraction of the visible tile. */
export const OFFSET_PRINT_RATIO = 0.045;

/** Colours the glyph-bound effects paint with, resolved from the config. */
export interface EffectPalette {
  /** Sticker outline: white or near-black, whichever separates best from both the glyph and the tile. */
  outline: string;
  /** Offset print: a tint of the tile background (deeper on light tiles, lighter on dark ones). */
  offset: string;
}

function baseBackgroundColor(config: IconConfig): string {
  if (!config.backgroundGradient) return config.backgroundColor;
  const stops = resolveStops(
    config.backgroundGradientStops,
    config.backgroundGradientStart,
    config.backgroundGradientEnd,
  );
  return stops[0]?.color ?? config.backgroundColor;
}

function glyphSolidColor(config: IconConfig): string {
  if (config.usePartColors && config.iconPartColors[0]) return config.iconPartColors[0];
  if (config.iconGradient) {
    const stops = resolveStops(config.iconGradientStops, config.iconGradientStart, config.iconGradientEnd);
    return stops[0]?.color ?? config.iconColor;
  }
  return config.iconColor;
}

const OUTLINE_CANDIDATES = ['#FFFFFF', '#0F172A'];

export function getEffectPalette(config: IconConfig): EffectPalette {
  const bg = baseBackgroundColor(config);
  const glyph = glyphSolidColor(config);

  let outline = OUTLINE_CANDIDATES[0];
  let best = -1;
  for (const c of OUTLINE_CANDIDATES) {
    const score = Math.min(contrastRatio(c, glyph), contrastRatio(c, bg));
    if (score > best) {
      best = score;
      outline = c;
    }
  }

  const hsl = hexToHsl(bg);
  const offset = hsl
    ? hsl.l < 0.25
      ? hslToHex(hsl.h, hsl.s, Math.min(0.6, hsl.l + 0.22))
      : hslToHex(hsl.h, Math.min(1, hsl.s * 1.05), Math.max(0.06, hsl.l * 0.55))
    : '#000000';

  return { outline, offset };
}
