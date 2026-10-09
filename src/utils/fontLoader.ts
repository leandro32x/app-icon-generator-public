/**
 * Runtime web-font loading via the Fontsource CDN (jsDelivr).
 *
 * Fonts are loaded by injecting a Fontsource stylesheet
 * (`https://cdn.jsdelivr.net/fontsource/css/{id}@latest/{file}.css`) and
 * then waiting on the CSS Font Loading API so canvas `fillText` /
 * `measureText` calls see the real face instead of the fallback.
 *
 * Which stylesheet: `index.css` is the font's *default* face — 400 normal
 * when the font ships it, otherwise the nearest face it has (Sunflower only
 * comes in 300/500/700, so 500; Molle is italic-only). Every other face uses
 * the static per-weight file (`700.css`, `700-italic.css`). `400.css` 404s
 * on fonts without a regular weight, which is why the regular face always
 * goes through `index`. The variable-font CSS is not used: it renames the
 * family to `"<Family> Variable"`, which would force every `font-family`
 * reference to know whether a font is variable.
 *
 * Why `sampleText` matters: Fontsource stylesheets split each face into
 * `unicode-range` subsets. `document.fonts.load(spec, text)` only fetches the
 * subsets needed for `text`, so always pass the text you are about to draw —
 * otherwise non-Latin glyphs never download and render with the fallback.
 */

const FONTSOURCE_CSS_BASE = 'https://cdn.jsdelivr.net/fontsource/css';

/**
 * Stop waiting on a stylesheet or face after this long. The browser keeps
 * loading it in the background and swaps it into the page when it lands;
 * canvas callers draw with the fallback instead of hanging.
 */
const LOAD_TIMEOUT_MS = 15_000;

/** Pending/finished stylesheet injections, keyed by `${fontId}/${file}`. */
const stylesheetPromises = new Map<string, Promise<boolean>>();

/** Build a canvas / CSS shorthand font string. Families never contain double quotes. */
export function buildCanvasFont(family: string, weight: number, italic: boolean, px: number): string {
  return `${italic ? 'italic ' : ''}${weight} ${px}px "${family}", sans-serif`;
}

/**
 * Derive the Fontsource id from a CSS family name (`Open Sans` → `open-sans`).
 * Used for legacy banner sessions that stored only the family name.
 */
export function fontIdFromFamily(family: string): string {
  return family
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/** Closest available weight to `target` (returns `target` when the list is unknown). */
export function pickNearestWeight(weights: number[] | undefined | null, target: number): number {
  if (!weights || weights.length === 0) return target;
  return weights.reduce(
    (best, w) => (Math.abs(w - target) < Math.abs(best - target) ? w : best),
    weights[0],
  );
}

/** Resolve the banner font to a `{ fontId, family }` pair, backfilling the id for legacy configs. */
export function resolveBannerFont(cfg: { font: string; fontId?: string | null }): {
  fontId: string;
  family: string;
} {
  const family = cfg.font || 'Inter';
  return { fontId: cfg.fontId || fontIdFromFamily(family), family };
}

/** Fontsource stylesheet name for a face (see the header comment for why 400/normal is `index`). */
function stylesheetFile(weight: number, italic: boolean): string {
  if (weight === 400 && !italic) return 'index';
  return `${weight}${italic ? '-italic' : ''}`;
}

function stylesheetHref(fontId: string, file: string): string {
  return `${FONTSOURCE_CSS_BASE}/${encodeURIComponent(fontId)}@latest/${file}.css`;
}

/** Resolve with `fallback` when `promise` rejects or has not settled after `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

/** Inject a stylesheet once and resolve `true` when it loaded, `false` on error or timeout. */
function loadStylesheet(fontId: string, file: string): Promise<boolean> {
  const key = `${fontId}/${file}`;
  const existing = stylesheetPromises.get(key);
  if (existing) return existing;
  if (typeof document === 'undefined') return Promise.resolve(false);

  const elementId = `fontsource-${fontId}-${file}`;
  const present = document.getElementById(elementId) as HTMLLinkElement | null;
  // Left behind by an attempt that timed out: usable as soon as its sheet exists.
  if (present) return Promise.resolve(!!present.sheet);

  const p = new Promise<boolean>((resolve) => {
    const link = document.createElement('link');
    link.id = elementId;
    link.rel = 'stylesheet';
    link.href = stylesheetHref(fontId, file);
    const timer = setTimeout(() => {
      // Keep the link (its sheet may still arrive) but let a later call re-check it.
      stylesheetPromises.delete(key);
      resolve(false);
    }, LOAD_TIMEOUT_MS);
    link.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    link.onerror = () => {
      clearTimeout(timer);
      link.remove();
      // Allow a later retry (e.g. transient network failure).
      stylesheetPromises.delete(key);
      resolve(false);
    };
    document.head.appendChild(link);
  });
  stylesheetPromises.set(key, p);
  return p;
}

async function fontsLoad(spec: string, sampleText: string): Promise<number> {
  try {
    const faces = await withTimeout(document.fonts.load(spec, sampleText || ' '), LOAD_TIMEOUT_MS, [] as FontFace[]);
    return faces.length;
  } catch {
    return 0;
  }
}

/**
 * Load a Fontsource font face and wait until it is usable on canvas.
 *
 * Never rejects. Tries the exact face, then — for italics — the upright face
 * of the same weight, then the font's default face; the browser synthesizes a
 * missing weight or slant from whatever loaded. Resolves `true` when a face
 * covering `sampleText` is ready and `false` when text will render with the
 * `sans-serif` fallback.
 */
export async function loadWebFont(
  fontId: string,
  family: string,
  weight = 400,
  italic = false,
  sampleText = ' ',
): Promise<boolean> {
  if (typeof document === 'undefined' || !('fonts' in document) || !fontId || !family) return false;

  const candidates = [stylesheetFile(weight, italic)];
  if (italic) candidates.push(stylesheetFile(weight, false));
  candidates.push('index');

  const spec = buildCanvasFont(family, weight, italic, 16);
  const tried = new Set<string>();
  for (const file of candidates) {
    if (tried.has(file)) continue;
    tried.add(file);
    if (!(await loadStylesheet(fontId, file))) continue;
    if ((await fontsLoad(spec, sampleText)) > 0) return true;
  }
  return false;
}
