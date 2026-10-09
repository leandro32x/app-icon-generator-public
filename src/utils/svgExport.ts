/**
 * Standalone SVG export of the icon: background tile, foreground (Iconify
 * icon, uploaded image or text), user transform and effects, all as vector
 * where the source is vector.
 *
 * - Icons come from Iconify's icon data (`getIcon`/`buildIcon`) and are
 *   recolored with the same rules as the PNG pipeline.
 * - SVG uploads are inlined; raster uploads are embedded as `<image>`.
 * - Text uses the same layout as the canvas rasterizer and embeds the font's
 *   Latin subset as a data-URI `@font-face` so the file renders the same
 *   anywhere (non-Latin glyphs fall back to the viewer's fonts).
 * - Drop shadow → `feDropShadow`; cast shadow → an `feOffset` doubling
 *   chain; score → a half-height overlay; outline → `feMorphology` dilate;
 *   offset print → a flood-filled `<use>` of the glyph shifted down-right.
 * - `darkModeAware` adds a `prefers-color-scheme: dark` rule that darkens the
 *   background, for SVG favicons that sit on dark browser chrome.
 */

import { buildIcon, getIcon, loadIcon, replaceIDs } from '@iconify/react';
import type { IconConfig } from './iconConfig';
import {
  getForegroundScale,
  getForegroundTransform,
  getGlyphFill,
  type GlyphFill,
  type ResolvedForeground,
} from './foreground';
import {
  angleToSvgCoords,
  angleToUserSpaceCoords,
  parseViewBox,
  resolveStops,
  type GradientStop,
} from './gradient';
import { getDropShadow, getEffectPalette, getScoreEffectOpacity, OFFSET_PRINT_RATIO, OUTLINE_WIDTH_RATIO } from './iconEffects';
import { hexToHsl, hslToHex } from './color';
import { layoutTextGlyph } from './foregroundRenderer';
import { loadWebFont, pickNearestWeight } from './fontLoader';
import { getFontMeta, type FontMeta } from './fontsourceApi';

export interface IconSvgOptions {
  /** Nominal width/height in px (the file is vector; this sets the viewBox). */
  size?: number;
  /** Darken the background under `prefers-color-scheme: dark` (SVG favicons). */
  darkModeAware?: boolean;
  iconSource?: string;
  iconStyle?: string;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

const fmt = (n: number): string => String(Math.round(n * 100) / 100);
const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function gradientDef(id: string, stops: GradientStop[], angle: number): string {
  const c = angleToSvgCoords(angle);
  const body = stops
    .map((s) => `<stop offset="${fmt(s.position)}%" stop-color="${esc(s.color)}"/>`)
    .join('');
  return `<linearGradient id="${id}" x1="${c.x1}" y1="${c.y1}" x2="${c.x2}" y2="${c.y2}">${body}</linearGradient>`;
}

/** Dark-mode companion of a background color: same hue, deeper. */
function darken(hex: string): string {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;
  return hslToHex(hsl.h, hsl.s * 0.85, Math.max(0.07, hsl.l * 0.45));
}

/** Diagonal extrusion of the source alpha, built by doubling offsets (log2(size) steps). */
function castShadowFilter(id: string, size: number): string {
  const steps: string[] = [];
  let prev = 's0';
  let i = 0;
  const maxDist = Math.round(size * 1.2);
  for (let step = 1; step < maxDist; step *= 2) {
    i++;
    steps.push(
      `<feOffset in="${prev}" dx="${step}" dy="${step}" result="o${i}"/>` +
        `<feMerge result="s${i}"><feMergeNode in="${prev}"/><feMergeNode in="o${i}"/></feMerge>`,
    );
    prev = `s${i}`;
  }
  return (
    `<filter id="${id}" x="-100%" y="-100%" width="400%" height="400%" color-interpolation-filters="sRGB">` +
    `<feFlood flood-color="#000000" result="flood"/>` +
    `<feComposite in="flood" in2="SourceAlpha" operator="in" result="s0"/>` +
    steps.join('') +
    `</filter>`
  );
}

function inheritedAttr(el: Element, name: string): string | null {
  let node: Element | null = el;
  while (node) {
    const v = node.getAttribute(name);
    if (v) return v;
    node = node.parentElement;
  }
  return null;
}

/**
 * Recolor an Iconify SVG the way the PNG pipeline does: only `currentColor`
 * and unattributed shapes are themed, hardcoded palette colors are kept
 * unless part colors are on.
 */
function recolorIconSvg(root: Element, config: IconConfig, fill: GlyphFill, fillRef: string): void {
  const isThemed = (v: string | null) => !!v && v.toLowerCase() === 'currentcolor';
  const shapes = root.querySelectorAll('path, circle, rect, line, polyline, polygon, ellipse');
  shapes.forEach((el, index) => {
    const f = el.getAttribute('fill');
    const s = el.getAttribute('stroke');
    const bare = (!f || f === 'none') && (!s || s === 'none');
    const parentFill = el.parentElement ? inheritedAttr(el.parentElement, 'fill') : null;
    const fillBased = !!parentFill && parentFill !== 'none';

    if (config.usePartColors && config.iconPartColors.length > 0) {
      const color = config.iconPartColors[index % config.iconPartColors.length];
      if (f && f !== 'none') el.setAttribute('fill', color);
      if (s && s !== 'none') el.setAttribute('stroke', color);
      if (bare) {
        if (fillBased) el.setAttribute('fill', color);
        else {
          el.setAttribute('stroke', color);
          el.setAttribute('fill', 'none');
        }
      }
      return;
    }

    const ref = fill.kind === 'gradient' ? fillRef : fill.kind === 'solid' ? fill.color : '#000000';
    if (isThemed(f)) el.setAttribute('fill', ref);
    if (isThemed(s)) el.setAttribute('stroke', ref);
    if (bare) {
      if (fillBased) el.setAttribute('fill', ref);
      else {
        el.setAttribute('stroke', ref);
        el.setAttribute('fill', 'none');
      }
    }
  });
}

function solidColorFor(fill: GlyphFill): string {
  if (fill.kind === 'solid') return fill.color;
  if (fill.kind === 'gradient') return fill.stops[0]?.color ?? '#000000';
  return '#000000';
}

async function iconMarkup(
  fg: Extract<ResolvedForeground, { kind: 'icon' }>,
  config: IconConfig,
  boxSize: number,
  fill: GlyphFill,
  fillRef: string,
  iconStyle: string | undefined,
): Promise<string> {
  const data = getIcon(fg.iconifyId) ?? (await loadIcon(fg.iconifyId).catch(() => null));
  if (!data) return '';
  const built = buildIcon(data, { width: boxSize, height: boxSize });
  const attrs = Object.entries(built.attributes)
    .map(([k, v]) => `${k}="${esc(String(v))}"`)
    .join(' ');
  const body = replaceIDs(built.body, 'ic-');
  const doc = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}" ${attrs}>${body}</svg>`, 'image/svg+xml');
  if (doc.getElementsByTagName('parsererror').length > 0) return '';
  const root = doc.documentElement;

  // A gradient must live in the icon's own user space (its viewBox), so it is
  // defined inside the nested <svg> with userSpaceOnUse coordinates — one sweep
  // across the whole icon, matching the preview and the PNG export.
  let iconFillRef = fillRef;
  if (fill.kind === 'gradient') {
    const viewBox = parseViewBox(root.getAttribute('viewBox')) ?? { x: 0, y: 0, width: 24, height: 24 };
    const c = angleToUserSpaceCoords(fill.angle, viewBox);
    const defs = doc.createElementNS(SVG_NS, 'defs');
    const gradient = doc.createElementNS(SVG_NS, 'linearGradient');
    gradient.setAttribute('id', 'fg-icon');
    gradient.setAttribute('gradientUnits', 'userSpaceOnUse');
    gradient.setAttribute('x1', fmt(c.x1));
    gradient.setAttribute('y1', fmt(c.y1));
    gradient.setAttribute('x2', fmt(c.x2));
    gradient.setAttribute('y2', fmt(c.y2));
    for (const s of fill.stops) {
      const stop = doc.createElementNS(SVG_NS, 'stop');
      stop.setAttribute('offset', `${fmt(s.position)}%`);
      stop.setAttribute('stop-color', s.color);
      gradient.appendChild(stop);
    }
    defs.appendChild(gradient);
    root.insertBefore(defs, root.firstChild);
    iconFillRef = 'url(#fg-icon)';
  }
  recolorIconSvg(root, config, fill, iconFillRef);
  if (iconStyle === 'thick') root.setAttribute('stroke-width', '2.5');
  const solid = solidColorFor(fill);
  root.setAttribute('color', solid);
  // Belt and braces: anything still referencing currentColor resolves to the solid color.
  return new XMLSerializer().serializeToString(root).replace(/currentColor/gi, solid);
}

function decodeSvgDataUrl(dataUrl: string): string | null {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const meta = dataUrl.slice(0, comma);
  const payload = dataUrl.slice(comma + 1);
  try {
    return /;base64/i.test(meta) ? atob(payload) : decodeURIComponent(payload);
  } catch {
    return null;
  }
}

function imageMarkup(fg: Extract<ResolvedForeground, { kind: 'image' }>, boxSize: number, fillRef: string): string {
  let content = '';
  if (fg.dataUrl.startsWith('data:image/svg+xml')) {
    const text = decodeSvgDataUrl(fg.dataUrl);
    if (text) {
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      if (doc.getElementsByTagName('parsererror').length === 0 && doc.documentElement.nodeName.toLowerCase() === 'svg') {
        const root = doc.documentElement;
        root.setAttribute('width', String(boxSize));
        root.setAttribute('height', String(boxSize));
        root.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        content = new XMLSerializer().serializeToString(root);
      }
    }
  }
  if (!content) {
    content = `<image href="${esc(fg.dataUrl)}" width="${boxSize}" height="${boxSize}" preserveAspectRatio="xMidYMid meet"/>`;
  }
  if (!fg.tint) return content;
  return (
    `<mask id="tint-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="${boxSize}" height="${boxSize}" mask-type="alpha" style="mask-type:alpha">${content}</mask>` +
    `<rect width="${boxSize}" height="${boxSize}" fill="${fillRef}" mask="url(#tint-mask)"/>`
  );
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** `@font-face` rules with the font's Latin subsets embedded as data URIs ('' when offline). */
async function embedFontFaces(
  fontId: string,
  family: string,
  weight: number,
  italic: boolean,
  meta: FontMeta | null,
): Promise<string> {
  const style = italic && (meta ? meta.styles.includes('italic') : true) ? 'italic' : 'normal';
  const candidates: [number, string][] = [[weight, style]];
  if (weight !== 400 || style !== 'normal') candidates.push([400, 'normal']);

  for (const [w, st] of candidates) {
    const subsets = ['latin', 'latin-ext'].filter((s) => {
      if (meta && !meta.subsets.includes(s)) return false;
      // Without a unicode-range the extended subset would shadow the base one.
      return s === 'latin' || !!meta?.unicodeRange?.[s];
    });
    const faces: string[] = [];
    for (const subset of subsets) {
      const url = `https://cdn.jsdelivr.net/fontsource/fonts/${encodeURIComponent(fontId)}@latest/${subset}-${w}-${st}.woff2`;
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const b64 = arrayBufferToBase64(await res.arrayBuffer());
        const range = meta?.unicodeRange?.[subset];
        faces.push(
          `@font-face{font-family:"${esc(family)}";font-style:${st};font-weight:${w};` +
            (range ? `unicode-range:${range};` : '') +
            `src:url(data:font/woff2;base64,${b64}) format("woff2");}`,
        );
      } catch {
        // Offline — the SVG will fall back to the viewer's fonts.
      }
    }
    if (faces.length > 0) return faces.join('');
  }
  return '';
}

async function textMarkup(
  fg: Extract<ResolvedForeground, { kind: 'text' }>,
  boxSize: number,
  fillRef: string,
): Promise<{ markup: string; style: string }> {
  await loadWebFont(fg.fontId, fg.family, fg.weight, fg.italic, fg.text);
  const meta = await getFontMeta(fg.fontId, { detailed: true });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { markup: '', style: '' };
  const layout = layoutTextGlyph(
    ctx,
    { text: fg.text, family: fg.family, weight: fg.weight, italic: fg.italic, letterSpacing: fg.letterSpacing },
    boxSize,
  );
  if (!layout) return { markup: '', style: '' };

  const fileWeight = meta ? pickNearestWeight(meta.weights, fg.weight) : fg.weight;
  const style = await embedFontFaces(fg.fontId, fg.family, fileWeight, fg.italic, meta);
  const family = `'${fg.family.replace(/'/g, '')}', sans-serif`;
  const markup = layout.lines
    .map(
      (line) =>
        `<text x="${fmt(line.x)}" y="${fmt(line.y)}" text-anchor="middle" font-family="${esc(family)}" ` +
        `font-size="${fmt(layout.px)}" font-weight="${fg.weight}" font-style="${fg.italic ? 'italic' : 'normal'}" ` +
        `letter-spacing="${fmt(fg.letterSpacing * layout.px)}" fill="${fillRef}" xml:space="preserve">${esc(line.text)}</text>`,
    )
    .join('');
  return { markup, style };
}

/**
 * Build the standalone SVG document for the current design.
 */
export async function buildIconSvg(
  config: IconConfig,
  fg: ResolvedForeground | null,
  options: IconSvgOptions = {},
): Promise<string> {
  const S = options.size ?? 1024;
  const radiusPx = (config.cornerRadius / 100) * S;
  const defs: string[] = [];
  const styles: string[] = [];

  // Background
  const bgStops = resolveStops(config.backgroundGradientStops, config.backgroundGradientStart, config.backgroundGradientEnd);
  const bgAngle = config.backgroundGradientAngle ?? 135;
  let bgFill: string;
  if (config.backgroundGradient) {
    defs.push(gradientDef('bg', bgStops, bgAngle));
    bgFill = 'url(#bg)';
  } else {
    bgFill = config.backgroundColor;
  }
  if (options.darkModeAware) {
    let darkFill: string;
    if (config.backgroundGradient) {
      defs.push(gradientDef('bg-dark', bgStops.map((s) => ({ ...s, color: darken(s.color) })), bgAngle));
      darkFill = 'url(#bg-dark)';
    } else {
      darkFill = darken(config.backgroundColor);
    }
    styles.push(`@media (prefers-color-scheme: dark){#bg-rect{fill:${darkFill}}}`);
  }

  // Foreground
  const padding = (config.padding / 100) * S;
  const boxSize = Math.min(S, (S - padding * 2) * getForegroundScale(fg, options.iconSource ?? '', options.iconStyle));
  const boxOrigin = (S - boxSize) / 2;
  const fill = getGlyphFill(config);
  if (fill.kind === 'gradient') defs.push(gradientDef('fg', fill.stops, fill.angle));
  const fillRef = fill.kind === 'gradient' ? 'url(#fg)' : fill.kind === 'solid' ? fill.color : '#000000';

  let glyph = '';
  if (fg?.kind === 'icon') {
    glyph = await iconMarkup(fg, config, boxSize, fill, fillRef, options.iconStyle);
  } else if (fg?.kind === 'image') {
    glyph = imageMarkup(fg, boxSize, fillRef);
  } else if (fg?.kind === 'text') {
    const t = await textMarkup(fg, boxSize, fillRef);
    glyph = t.markup;
    if (t.style) styles.push(t.style);
  }

  // Transform (same math as drawTransformedGlyph)
  const t = getForegroundTransform(config);
  const cx = boxOrigin + boxSize / 2 + (t.offsetX / 100) * S;
  const cy = boxOrigin + boxSize / 2 + (t.offsetY / 100) * S;
  const s = Math.max(0.01, t.scale / 100);
  const sx = s * (t.flipX ? -1 : 1);
  const sy = s * (t.flipY ? -1 : 1);
  const gTransform =
    `translate(${fmt(cx)} ${fmt(cy)}) rotate(${fmt(t.rotation)}) scale(${fmt(sx)} ${fmt(sy)}) ` +
    `translate(${fmt(-boxSize / 2)} ${fmt(-boxSize / 2)})`;

  // Effects
  const opacity = Math.max(0, Math.min(1, config.iconEffectOpacity / 100));
  let glyphFilter = '';
  let shadowLayer = '';
  let scoreLayer = '';
  if (config.iconEffect === 'drop-shadow') {
    const shadow = getDropShadow(S, config.iconEffectOpacity);
    defs.push(
      `<filter id="drop" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">` +
        `<feDropShadow dx="0" dy="${fmt(shadow.dy)}" stdDeviation="${fmt(shadow.blur / 2)}" flood-color="#000000" flood-opacity="${fmt(shadow.alpha)}"/>` +
        `</filter>`,
    );
    glyphFilter = ' filter="url(#drop)"';
  } else if (config.iconEffect === 'cast-shadow') {
    defs.push(castShadowFilter('cast', S));
    shadowLayer = `<g filter="url(#cast)" opacity="${fmt(0.6 * opacity)}"><use href="#glyph"/></g>`;
  } else if (config.iconEffect === 'score') {
    scoreLayer = `<rect width="${S}" height="${S / 2}" fill="#000000" opacity="${fmt(getScoreEffectOpacity(config.iconEffectOpacity))}"/>`;
  } else if (config.iconEffect === 'outline') {
    const pal = getEffectPalette(config);
    defs.push(
      `<filter id="outline" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">` +
        `<feMorphology in="SourceAlpha" operator="dilate" radius="${fmt(S * OUTLINE_WIDTH_RATIO)}" result="d"/>` +
        `<feFlood flood-color="${pal.outline}"/>` +
        `<feComposite in2="d" operator="in"/>` +
        `</filter>`,
    );
    shadowLayer = `<g filter="url(#outline)" opacity="${fmt(opacity)}"><use href="#glyph"/></g>`;
  } else if (config.iconEffect === 'offset') {
    const pal = getEffectPalette(config);
    const d = S * OFFSET_PRINT_RATIO;
    defs.push(
      `<filter id="offset" color-interpolation-filters="sRGB">` +
        `<feFlood flood-color="${pal.offset}"/>` +
        `<feComposite in2="SourceAlpha" operator="in"/>` +
        `</filter>`,
    );
    shadowLayer = `<g transform="translate(${fmt(d)} ${fmt(d)})" filter="url(#offset)" opacity="${fmt(opacity)}"><use href="#glyph"/></g>`;
  }

  defs.push(`<clipPath id="tile"><rect width="${S}" height="${S}" rx="${fmt(radiusPx)}"/></clipPath>`);
  const styleBlock = styles.length > 0 ? `<style>${styles.join('')}</style>` : '';

  return (
    `<svg xmlns="${SVG_NS}" xmlns:xlink="http://www.w3.org/1999/xlink" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">` +
    `<defs>${defs.join('')}</defs>${styleBlock}` +
    `<rect id="bg-rect" width="${S}" height="${S}" rx="${fmt(radiusPx)}" fill="${esc(bgFill)}"/>` +
    `<g clip-path="url(#tile)">${shadowLayer}<g id="glyph" transform="${gTransform}"${glyphFilter}>${glyph}</g>${scoreLayer}</g>` +
    `</svg>`
  );
}
