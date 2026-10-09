/**
 * Transform-aware glyph compositing shared by the export pipeline, the banner
 * and the live preview's cast shadow.
 *
 * A "glyph" is any square `CanvasImageSource` (the Iconify SVG image, an
 * uploaded picture or rasterized text). It is placed inside a `boxSize`
 * square at `boxOrigin`, then the user's transform (offset / scale / rotate /
 * flip) is applied around the box center. Offsets are expressed as a percent
 * of `refSize` — the *visible* tile — so the same numbers mean the same thing
 * on a 1024 px iOS icon, a 108 dp Android layer (ref = 72 dp safe zone) and
 * the overscanned preview tile.
 */

import type { ForegroundTransform } from './foreground';
import type { IconEffect } from './iconConfig';
import { getDropShadow, OFFSET_PRINT_RATIO, OUTLINE_WIDTH_RATIO, type EffectPalette } from './iconEffects';

export interface GlyphPlacement {
  /** Side of the destination canvas. */
  tileSize: number;
  /** Side of the visible tile that percent offsets refer to. */
  refSize: number;
  /** Top-left of the un-transformed glyph box. */
  boxOrigin: number;
  /** Side of the un-transformed glyph box. */
  boxSize: number;
  transform: ForegroundTransform;
}

/** Trace a rounded-rect path (quadratic corners, matching the rest of the app). */
export function traceRoundedRect(ctx: CanvasRenderingContext2D, size: number, radiusPx: number): void {
  const r = Math.max(0, Math.min(radiusPx, size / 2));
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
}

/** Draw the glyph with the placement transform applied. */
export function drawTransformedGlyph(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  p: GlyphPlacement,
): void {
  const { transform: t } = p;
  const cx = p.boxOrigin + p.boxSize / 2 + (t.offsetX / 100) * p.refSize;
  const cy = p.boxOrigin + p.boxSize / 2 + (t.offsetY / 100) * p.refSize;
  const s = Math.max(0.01, t.scale / 100);
  ctx.save();
  ctx.translate(cx, cy);
  if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(s * (t.flipX ? -1 : 1), s * (t.flipY ? -1 : 1));
  ctx.drawImage(source, -p.boxSize / 2, -p.boxSize / 2, p.boxSize, p.boxSize);
  ctx.restore();
}

/** Transparent `tileSize²` canvas holding the transformed glyph. */
export function makeGlyphLayer(source: CanvasImageSource, p: GlyphPlacement): HTMLCanvasElement {
  const layer = document.createElement('canvas');
  const s = Math.max(1, Math.round(p.tileSize));
  layer.width = s;
  layer.height = s;
  const ctx = layer.getContext('2d');
  if (ctx) drawTransformedGlyph(ctx, source, p);
  return layer;
}

/**
 * Long ("cast") shadow: a solid black diagonal extrusion of the glyph
 * silhouette. Built by doubling — each pass unions the shadow with itself
 * shifted by 1, 2, 4… px — so a 1024 px tile needs ~10 blits instead of
 * ~1,200 stamps, with the same result.
 */
export function drawCastShadow(
  ctx: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  tileSize: number,
  opacity: number,
  clipRadiusPx?: number,
): void {
  const s = Math.max(1, Math.round(tileSize));

  let a = document.createElement('canvas');
  a.width = s;
  a.height = s;
  const actx = a.getContext('2d');
  if (!actx) return;
  actx.drawImage(layer, 0, 0);
  actx.globalCompositeOperation = 'source-in';
  actx.fillStyle = '#000000';
  actx.fillRect(0, 0, s, s);
  // The doubling loop below ping-pongs between `a` and `b`, so this context
  // is drawn onto again; left in `source-in` it would paint nothing onto a
  // cleared canvas and the shadow would vanish after the first pass.
  actx.globalCompositeOperation = 'source-over';

  let b = document.createElement('canvas');
  b.width = s;
  b.height = s;

  const maxDist = Math.round(s * 1.2);
  for (let step = 1; step < maxDist; step *= 2) {
    const bctx = b.getContext('2d');
    if (!bctx) return;
    bctx.clearRect(0, 0, s, s);
    bctx.drawImage(a, 0, 0);
    bctx.drawImage(a, step, step);
    [a, b] = [b, a];
  }

  ctx.save();
  if (clipRadiusPx !== undefined) {
    traceRoundedRect(ctx, s, clipRadiusPx);
    ctx.clip();
  }
  ctx.globalAlpha = 0.6 * opacity;
  ctx.drawImage(a, 0, 0);
  ctx.restore();
}

/** Solid-colour copy of the layer's alpha (the glyph silhouette). */
export function makeSilhouette(layer: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = layer.width;
  c.height = layer.height;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  ctx.drawImage(layer, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

/**
 * Sticker outline: the silhouette dilated by `widthPx`, drawn under the glyph.
 * Dilation is approximated by stamping the silhouette around three rings of
 * offsets (48 blits) onto a scratch canvas, which is then drawn once at the
 * effect opacity so overlapping stamps don't compound.
 */
export function drawOutline(
  ctx: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  widthPx: number,
  color: string,
  opacity: number,
): void {
  const sil = makeSilhouette(layer, color);
  const dilated = document.createElement('canvas');
  dilated.width = layer.width;
  dilated.height = layer.height;
  const dctx = dilated.getContext('2d');
  if (!dctx) return;
  const w = Math.max(1, widthPx);
  const rings: Array<[number, number]> = [
    [w, 24],
    [w * 0.66, 16],
    [w * 0.33, 8],
  ];
  for (const [r, steps] of rings) {
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      dctx.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(dilated, 0, 0);
  ctx.restore();
}

/** Offset print: a hard, solid-colour copy of the silhouette shifted by (dx, dy), drawn under the glyph. */
export function drawOffsetPrint(
  ctx: CanvasRenderingContext2D,
  layer: HTMLCanvasElement,
  dx: number,
  dy: number,
  color: string,
  opacity: number,
): void {
  const sil = makeSilhouette(layer, color);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.drawImage(sil, dx, dy);
  ctx.restore();
}

export interface GlyphEffectOptions {
  /** Clip the cast shadow to this rounded rect (px radius); omit for no clip. */
  castClipRadiusPx?: number;
  /** Skip the cast shadow (e.g. transparent banner tiles, iOS appearance variants). */
  skipCast?: boolean;
  /** Colours for the outline / offset-print effects (`getEffectPalette`); required for those effects. */
  palette?: EffectPalette;
}

/**
 * Composite the glyph with the selected effect: drop shadow (canvas shadow),
 * cast shadow (extrusion under the glyph) or plain. The score overlay is a
 * post-draw step handled by the callers.
 */
export function drawGlyphWithEffect(
  ctx: CanvasRenderingContext2D,
  source: CanvasImageSource,
  p: GlyphPlacement,
  effect: IconEffect,
  effectOpacity: number,
  options: GlyphEffectOptions = {},
): void {
  const layer = makeGlyphLayer(source, p);
  const opacity = Math.max(0, Math.min(1, effectOpacity / 100));

  if (effect === 'drop-shadow') {
    // Sized from the visible tile, like the preview's CSS drop-shadow.
    const shadow = getDropShadow(p.refSize, effectOpacity);
    ctx.save();
    ctx.shadowColor = `rgba(0,0,0,${shadow.alpha})`;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = shadow.dy;
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
    return;
  }

  if (effect === 'cast-shadow' && !options.skipCast) {
    drawCastShadow(ctx, layer, p.tileSize, opacity, options.castClipRadiusPx);
  } else if (effect === 'outline' && options.palette) {
    drawOutline(ctx, layer, p.refSize * OUTLINE_WIDTH_RATIO, options.palette.outline, opacity);
  } else if (effect === 'offset' && options.palette) {
    const d = p.refSize * OFFSET_PRINT_RATIO;
    drawOffsetPrint(ctx, layer, d, d, options.palette.offset, opacity);
  }

  ctx.drawImage(layer, 0, 0);
}
