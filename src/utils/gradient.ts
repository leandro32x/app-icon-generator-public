/**
 * Multi-stop gradient helpers shared across preview, device preview, banner
 * and download code paths.
 */

export interface GradientStop {
  color: string;
  /** 0-100. Positions outside this range are clamped when serialized. */
  position: number;
}

/**
 * Resolve the stops array to use.
 * If `stops` is empty/missing, falls back to a 2-stop [start, end] gradient.
 * The returned array is sorted by position and guaranteed to have ≥ 2 stops.
 */
export function resolveStops(
  stops: GradientStop[] | undefined,
  start: string,
  end: string,
): GradientStop[] {
  const list =
    Array.isArray(stops) && stops.length >= 2
      ? stops.map((s) => ({ color: s.color, position: clamp(s.position, 0, 100) }))
      : [
          { color: start, position: 0 },
          { color: end, position: 100 },
        ];
  return [...list].sort((a, b) => a.position - b.position);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Build a CSS `linear-gradient(...)` string from stops + angle. */
export function buildCssGradient(stops: GradientStop[], angle: number): string {
  const parts = stops.map((s) => `${s.color} ${s.position}%`).join(', ');
  return `linear-gradient(${angle}deg, ${parts})`;
}

/**
 * Convert a CSS gradient angle (0° = up, increases clockwise) to SVG
 * `linearGradient` x1/y1/x2/y2 percentages on the unit box.
 */
export function angleToSvgCoords(angleDeg: number): {
  x1: string;
  y1: string;
  x2: string;
  y2: string;
} {
  // CSS angle → math angle (in radians). 0deg points up (−y), 90deg points right.
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  // Extend so the line spans the bounding box; using a unit vector scaled by 0.5
  // and centered at (0.5, 0.5) keeps stops nicely distributed.
  const x1 = 0.5 - dx * 0.5;
  const y1 = 0.5 - dy * 0.5;
  const x2 = 0.5 + dx * 0.5;
  const y2 = 0.5 + dy * 0.5;
  return {
    x1: `${x1 * 100}%`,
    y1: `${y1 * 100}%`,
    x2: `${x2 * 100}%`,
    y2: `${y2 * 100}%`,
  };
}

export interface ViewBoxRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Parse an SVG `viewBox` attribute; `null` when missing or malformed. */
export function parseViewBox(value: string | null | undefined): ViewBoxRect | null {
  if (!value) return null;
  const parts = value.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n)) || parts[2] <= 0 || parts[3] <= 0) return null;
  return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
}

/**
 * Gradient end points in *user space* for a `gradientUnits="userSpaceOnUse"`
 * `<linearGradient>` that should sweep across the whole `box` (an icon's
 * viewBox). One sweep across the icon looks right and, unlike the default
 * per-element `objectBoundingBox` units, also works for straight-line paths
 * whose bounding box has no area.
 */
export function angleToUserSpaceCoords(
  angleDeg: number,
  box: ViewBoxRect,
): { x1: number; y1: number; x2: number; y2: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  return {
    x1: box.x + (0.5 - dx * 0.5) * box.width,
    y1: box.y + (0.5 - dy * 0.5) * box.height,
    x2: box.x + (0.5 + dx * 0.5) * box.width,
    y2: box.y + (0.5 + dy * 0.5) * box.height,
  };
}

/**
 * Compute canvas linear-gradient end points for a given angle over a square.
 * Matches the convention used by CSS.
 */
export function angleToCanvasCoords(
  angleDeg: number,
  size: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const cx = size / 2;
  const cy = size / 2;
  return {
    x0: cx - dx * (size / 2),
    y0: cy - dy * (size / 2),
    x1: cx + dx * (size / 2),
    y1: cy + dy * (size / 2),
  };
}

/** Apply a multi-stop linear gradient to a canvas context. */
export function applyCanvasGradient(
  ctx: CanvasRenderingContext2D,
  stops: GradientStop[],
  angle: number,
  size: number,
): CanvasGradient {
  const { x0, y0, x1, y1 } = angleToCanvasCoords(angle, size);
  const grad = ctx.createLinearGradient(x0, y0, x1, y1);
  stops.forEach((s) => grad.addColorStop(clamp(s.position, 0, 100) / 100, s.color));
  return grad;
}

/**
 * Apply a multi-stop linear gradient across a non-square rectangle (e.g. the
 * 1024×500 store banner). `applyCanvasGradient` assumes a square; this variant
 * extends the gradient line so it spans the full rectangle at the given angle.
 */
export function applyCanvasGradientRect(
  ctx: CanvasRenderingContext2D,
  stops: GradientStop[],
  angle: number,
  width: number,
  height: number,
): CanvasGradient {
  const rad = ((angle - 90) * Math.PI) / 180; // same convention as angleToCanvasCoords
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const cx = width / 2;
  const cy = height / 2;
  const halfLen = (Math.abs(dx) * width + Math.abs(dy) * height) / 2; // cover the whole rect
  const grad = ctx.createLinearGradient(
    cx - dx * halfLen,
    cy - dy * halfLen,
    cx + dx * halfLen,
    cy + dy * halfLen,
  );
  stops.forEach((s) => grad.addColorStop(clamp(s.position, 0, 100) / 100, s.color));
  return grad;
}
