/**
 * Color utilities for deriving readable palettes.
 *
 * Used by the banner "Auto from icon" feature to produce a pleasing
 * background + a text color that meets WCAG AA contrast against it.
 */

function clamp(v: number, lo = 0, hi = 1) {
  return Math.max(lo, Math.min(hi, v));
}

function parseHex(hex: string): [number, number, number] | null {
  let h = hex.trim().replace(/^#/, '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(n: number): string {
  const s = Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
  return s;
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Convert hex (#rrggbb or #rgb) to HSL {h:0-360, s:0-1, l:0-1}. Returns null if invalid. */
export function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      default: h = ((r - g) / d + 4) * 60;
    }
  }
  return { h, s, l };
}

function hue2rgb(p: number, q: number, t: number): number {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

export function hslToHex(h: number, s: number, l: number): string {
  const hh = (((h % 360) + 360) % 360) / 360;
  const ss = clamp(s);
  const ll = clamp(l);
  let r: number;
  let g: number;
  let b: number;
  if (ss === 0) {
    r = g = b = ll;
  } else {
    const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
    const p = 2 * ll - q;
    r = hue2rgb(p, q, hh + 1 / 3);
    g = hue2rgb(p, q, hh);
    b = hue2rgb(p, q, hh - 1 / 3);
  }
  return rgbToHex(r * 255, g * 255, b * 255);
}

/** Relative luminance per WCAG 2.x. Input is a #rrggbb color. */
export function relativeLuminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two colors per WCAG 2.x. Returns 1..21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Pick whichever of the two candidates has the better contrast against `bg`. */
export function pickReadableTextColor(
  bg: string,
  light = '#FFFFFF',
  dark = '#0F172A',
): string {
  return contrastRatio(bg, light) >= contrastRatio(bg, dark) ? light : dark;
}

/**
 * Derive a pleasing banner palette from an icon-tile color.
 *
 * Strategy: convert to HSL, then build a deep but not-too-saturated variant
 * suitable as a large banner surface. Very dark icon colors are nudged up;
 * very light ones are darkened so the banner never washes out the tile.
 * The text color is then chosen by WCAG contrast.
 */
export function deriveBannerPalette(iconBg: string): {
  backgroundColor: string;
  textColor: string;
} {
  const hsl = hexToHsl(iconBg);
  if (!hsl) {
    return { backgroundColor: '#3730A3', textColor: '#FFFFFF' };
  }
  // Keep original hue; pull saturation into a pleasant band; push lightness
  // toward a deep (but not black) tone so text reads at high contrast.
  const s = clamp(hsl.s < 0.15 ? 0.28 : Math.min(0.55, Math.max(0.35, hsl.s * 0.8)));
  const l = 0.24; // ~deep surface
  const bg = hslToHex(hsl.h, s, l);
  return {
    backgroundColor: bg,
    textColor: pickReadableTextColor(bg),
  };
}
