/**
 * Rasterizer for image and text foregrounds.
 *
 * Produces a transparent square canvas with the glyph contain-fitted and
 * centered, ready to be composited exactly like the SVG `<img>` the Iconify
 * path produces. The same functions feed the live preview (`ForegroundCanvas`),
 * the banner canvas and the export pipeline, so all three match.
 */

import { applyCanvasGradient } from './gradient';
import { buildCanvasFont, loadWebFont } from './fontLoader';
import type { GlyphFill, RasterForeground } from './foreground';

// --- Image decoding cache --------------------------------------------------

const IMAGE_CACHE_MAX = 8;
const imageCache = new Map<string, Promise<HTMLImageElement>>();

/**
 * Decode a `data:` / same-origin `blob:` URL into an `HTMLImageElement`.
 * Promise-cached so a 1024 px upload is decoded once across dozens of export
 * sizes and preview tiles.
 */
export function loadImageElement(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return cached;

  const p = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to decode'));
    img.src = src;
  }).then((img) => (typeof img.decode === 'function' ? img.decode().then(() => img, () => img) : img));

  p.catch(() => imageCache.delete(src));
  if (imageCache.size >= IMAGE_CACHE_MAX) {
    const oldest = imageCache.keys().next().value;
    if (oldest !== undefined) imageCache.delete(oldest);
  }
  imageCache.set(src, p);
  return p;
}

// --- Geometry --------------------------------------------------------------

/** Contain-fit a `w × h` source into a `box × box` square, centered. */
export function containFit(w: number, h: number, box: number): { x: number; y: number; w: number; h: number } {
  if (!(w > 0) || !(h > 0)) return { x: 0, y: 0, w: box, h: box };
  const s = Math.min(box / w, box / h);
  const fw = w * s;
  const fh = h * s;
  return { x: (box - fw) / 2, y: (box - fh) / 2, w: fw, h: fh };
}

function applyFillStyle(ctx: CanvasRenderingContext2D, fill: GlyphFill, box: number): void {
  if (fill.kind === 'silhouette') {
    ctx.fillStyle = '#000000';
  } else if (fill.kind === 'solid') {
    ctx.fillStyle = fill.color;
  } else {
    ctx.fillStyle = applyCanvasGradient(ctx, fill.stops, fill.angle, box);
  }
}

// --- Image -----------------------------------------------------------------

/**
 * Draw a decoded image contain-fitted into the `box × box` context. With
 * `tint` (or a silhouette fill) the image's alpha becomes a mask that is
 * filled with the color/gradient, like iOS "tinted" icons.
 */
export function drawImageForeground(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  box: number,
  fill: GlyphFill,
  tint: boolean,
): void {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const r = containFit(w, h, box);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, r.x, r.y, r.w, r.h);
  if (tint || fill.kind === 'silhouette') {
    ctx.globalCompositeOperation = 'source-in';
    applyFillStyle(ctx, fill, box);
    ctx.fillRect(0, 0, box, box);
  }
  ctx.restore();
}

// --- Text ------------------------------------------------------------------

export interface TextGlyphSpec {
  text: string;
  family: string;
  weight: number;
  italic: boolean;
  /** em units */
  letterSpacing: number;
}

interface LineMetrics {
  /** Ink extent left/right of the (centered) alignment point. */
  left: number;
  right: number;
  /** Ink extent above/below the alphabetic baseline. */
  asc: number;
  desc: number;
}

interface BlockMetrics {
  lines: LineMetrics[];
  inkW: number;
  inkH: number;
  lineAdvance: number;
}

/** Reference size used for the first measurement pass. */
const REF_PX = 100;
/** Baseline-to-baseline distance for multi-line text, in em. */
const LINE_HEIGHT = 1.15;

function splitLines(text: string): string[] {
  const lines = text.replace(/\r/g, '').split('\n');
  while (lines.length > 1 && lines[lines.length - 1].trim() === '') lines.pop();
  while (lines.length > 1 && lines[0].trim() === '') lines.shift();
  return lines;
}

function setFont(ctx: CanvasRenderingContext2D, spec: TextGlyphSpec, px: number): void {
  ctx.font = buildCanvasFont(spec.family, spec.weight, spec.italic, px);
  // `letterSpacing` on 2D contexts: Chrome 99+, Safari 17+, Firefox 133+.
  if ('letterSpacing' in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spec.letterSpacing * px}px`;
  }
}

function measureBlock(ctx: CanvasRenderingContext2D, lines: string[], px: number): BlockMetrics {
  const metrics: LineMetrics[] = lines.map((line) => {
    const m = ctx.measureText(line);
    return {
      left: m.actualBoundingBoxLeft ?? 0,
      right: m.actualBoundingBoxRight ?? m.width,
      asc: m.actualBoundingBoxAscent ?? px * 0.7,
      desc: m.actualBoundingBoxDescent ?? 0,
    };
  });
  const lineAdvance = px * LINE_HEIGHT;
  const inkW = Math.max(...metrics.map((m) => m.left + m.right), 0);
  const first = metrics[0];
  const last = metrics[metrics.length - 1];
  const inkH =
    metrics.length === 1
      ? first.asc + first.desc
      : first.asc + (metrics.length - 1) * lineAdvance + last.desc;
  return { lines: metrics, inkW, inkH, lineAdvance };
}

export interface TextLayoutLine {
  text: string;
  /** Alignment point for `textAlign = 'center'` / `text-anchor="middle"`. */
  x: number;
  /** Alphabetic baseline. */
  y: number;
}

export interface TextLayout {
  /** Final font size in px. */
  px: number;
  lines: TextLayoutLine[];
}

/**
 * Compute the font size and per-line positions that make the text's ink
 * bounding box fill a `box × box` square. Shared by the canvas rasterizer and
 * the SVG exporter so both place glyphs identically.
 *
 * Single-line text is fitted ink-tight on both axes (a lone "O" fills the
 * box), multi-line text keeps an em-based line advance between baselines.
 * Each line is centered by its ink, not its advance width, so glyph side
 * bearings and trailing letter-spacing never push the block off-center.
 *
 * The font must already be loaded. Leaves `ctx.font` set to the final size.
 */
export function layoutTextGlyph(
  ctx: CanvasRenderingContext2D,
  spec: TextGlyphSpec,
  box: number,
): TextLayout | null {
  const lines = splitLines(spec.text);
  if (lines.every((l) => l.trim() === '')) return null;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';

  setFont(ctx, spec, REF_PX);
  let m = measureBlock(ctx, lines, REF_PX);
  const scale = Math.min(
    m.inkW > 0 ? box / m.inkW : Number.POSITIVE_INFINITY,
    m.inkH > 0 ? box / m.inkH : Number.POSITIVE_INFINITY,
  );
  let px = Number.isFinite(scale) && scale > 0 ? REF_PX * scale : REF_PX;

  // Re-measure at the final size (hinting/rounding differs) and nudge down if
  // the ink still overflows the box.
  setFont(ctx, spec, px);
  m = measureBlock(ctx, lines, px);
  const overflow = Math.max(m.inkW / box, m.inkH / box);
  if (overflow > 1) {
    px = px / overflow;
    setFont(ctx, spec, px);
    m = measureBlock(ctx, lines, px);
  }

  const blockTop = (box - m.inkH) / 2;
  const baseline0 = blockTop + m.lines[0].asc;
  const placed: TextLayoutLine[] = [];
  lines.forEach((line, i) => {
    if (line.trim() === '') return;
    const lm = m.lines[i];
    placed.push({
      text: line,
      x: box / 2 - (lm.right - lm.left) / 2,
      y: baseline0 + i * m.lineAdvance,
    });
  });
  return { px, lines: placed };
}

/**
 * Draw text so that its ink bounding box fills the `box × box` context.
 * See `layoutTextGlyph` for the fitting rules. The font must already be
 * loaded (see `rasterizeForeground`).
 */
export function drawTextForeground(
  ctx: CanvasRenderingContext2D,
  spec: TextGlyphSpec,
  box: number,
  fill: GlyphFill,
): void {
  ctx.save();
  const layout = layoutTextGlyph(ctx, spec, box);
  if (layout) {
    setFont(ctx, spec, layout.px);
    applyFillStyle(ctx, fill, box);
    for (const line of layout.lines) ctx.fillText(line.text, line.x, line.y);
  }
  ctx.restore();
}

// --- Entry point -----------------------------------------------------------

/**
 * Rasterize an image/text foreground into a fresh transparent `box × box`
 * canvas. Waits for the image to decode / the font to load first. Never
 * rejects for image decode failures (the canvas is left empty).
 */
export async function rasterizeForeground(
  fg: RasterForeground,
  box: number,
  options: { fill: GlyphFill },
): Promise<HTMLCanvasElement> {
  const size = Math.max(1, Math.round(box));
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  if (fg.kind === 'image') {
    try {
      const img = await loadImageElement(fg.dataUrl);
      drawImageForeground(ctx, img, size, options.fill, fg.tint);
    } catch {
      // Undecodable image — leave the glyph transparent rather than failing the export.
    }
    return canvas;
  }

  await loadWebFont(fg.fontId, fg.family, fg.weight, fg.italic, fg.text);
  drawTextForeground(
    ctx,
    {
      text: fg.text,
      family: fg.family,
      weight: fg.weight,
      italic: fg.italic,
      letterSpacing: fg.letterSpacing,
    },
    size,
    options.fill,
  );
  return canvas;
}
