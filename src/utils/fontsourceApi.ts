/**
 * Thin wrapper over the public Fontsource API — the font equivalent of
 * `iconifyApi.ts`. Docs: https://fontsource.org/docs/api/fonts
 *
 * The catalog (~2,100 fonts, ~540 KB / ~70 KB gzipped) is fetched once per
 * page — prefetched when a text panel mounts or a picker is hovered, at the
 * latest when one opens — and cached in memory for the page lifetime. It is
 * deliberately NOT persisted to localStorage: that quota is shared with saved
 * sessions, which may carry uploaded images.
 *
 * Font files themselves are loaded by `fontLoader.ts` from the jsDelivr CDN.
 */

const API_BASE = 'https://api.fontsource.org/v1';

// --- Types ---------------------------------------------------------------

export type FontCategory =
  | 'sans-serif'
  | 'serif'
  | 'display'
  | 'handwriting'
  | 'monospace'
  | 'other'
  | 'icons';

export type FontStyleName = 'normal' | 'italic';

export interface FontMeta {
  /** Fontsource id, e.g. `open-sans`. Used in CDN URLs. */
  id: string;
  /** CSS font-family name, e.g. `Open Sans`. */
  family: string;
  category: FontCategory;
  /** Available static weights, ascending. */
  weights: number[];
  styles: FontStyleName[];
  subsets: string[];
  /** SPDX license id, e.g. `OFL-1.1`, `Apache-2.0`. */
  license: string;
  variable: boolean;
  type: 'google' | 'other';
  /** Per-subset `unicode-range` values. Only present for metadata fetched from `/v1/fonts/{id}`. */
  unicodeRange?: Record<string, string>;
}

// --- Labels --------------------------------------------------------------

export const FONT_CATEGORY_LABELS: Record<string, string> = {
  'sans-serif': 'Sans',
  serif: 'Serif',
  display: 'Display',
  handwriting: 'Script',
  monospace: 'Mono',
  other: 'Other',
};

export const FONT_LICENSE_LABELS: Record<string, string> = {
  'OFL-1.1': 'SIL Open Font License 1.1',
  'Apache-2.0': 'Apache License 2.0',
  'UFL-1.0': 'Ubuntu Font License 1.0',
  MIT: 'MIT License',
  'CC0-1.0': 'CC0 1.0 (public domain)',
  'CC-BY-4.0': 'Creative Commons Attribution 4.0',
  Unlicense: 'The Unlicense',
};

function normalizeSpdx(spdx: string): string {
  return spdx === 'mit' ? 'MIT' : spdx;
}

/** Human-readable license name (falls back to the SPDX id). */
export function fontLicenseLabel(spdx: string): string {
  const norm = normalizeSpdx(spdx);
  return FONT_LICENSE_LABELS[norm] ?? norm;
}

/** Compact badge text, e.g. `OFL`, `Apache`. */
export function fontLicenseShort(spdx: string): string {
  const norm = normalizeSpdx(spdx);
  if (norm.startsWith('OFL')) return 'OFL';
  if (norm.startsWith('Apache')) return 'Apache';
  if (norm.startsWith('UFL')) return 'UFL';
  if (norm.startsWith('CC0')) return 'CC0';
  return norm;
}

export function fontLicenseUrl(spdx: string): string {
  return `https://spdx.org/licenses/${encodeURIComponent(normalizeSpdx(spdx))}.html`;
}

export function fontsourceUrl(id: string): string {
  return `https://fontsource.org/fonts/${encodeURIComponent(id)}`;
}

// --- Curated "Popular" list (also the offline fallback) --------------------
//
// Metadata copied from the live catalog so the picker works before/without
// the catalog request. Order = display order in the picker.

export const POPULAR_FONTS_FALLBACK: FontMeta[] = [
  { id: 'inter', family: 'Inter', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], styles: ['italic', 'normal'], subsets: ['cyrillic', 'cyrillic-ext', 'greek', 'greek-ext', 'latin', 'latin-ext'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'roboto', family: 'Roboto', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], styles: ['italic', 'normal'], subsets: ['cyrillic', 'cyrillic-ext', 'greek', 'greek-ext', 'latin', 'latin-ext'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'poppins', family: 'Poppins', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], styles: ['italic', 'normal'], subsets: ['devanagari', 'latin', 'latin-ext'], license: 'OFL-1.1', variable: false, type: 'google' },
  { id: 'montserrat', family: 'Montserrat', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], styles: ['italic', 'normal'], subsets: ['cyrillic', 'cyrillic-ext', 'latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'open-sans', family: 'Open Sans', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800], styles: ['italic', 'normal'], subsets: ['cyrillic', 'cyrillic-ext', 'greek', 'greek-ext', 'hebrew', 'latin'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'lato', family: 'Lato', category: 'sans-serif', weights: [100, 300, 400, 700, 900], styles: ['italic', 'normal'], subsets: ['latin', 'latin-ext'], license: 'OFL-1.1', variable: false, type: 'google' },
  { id: 'raleway', family: 'Raleway', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], styles: ['italic', 'normal'], subsets: ['cyrillic', 'cyrillic-ext', 'latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'nunito', family: 'Nunito', category: 'sans-serif', weights: [200, 300, 400, 500, 600, 700, 800, 900], styles: ['italic', 'normal'], subsets: ['cyrillic', 'cyrillic-ext', 'latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'dm-sans', family: 'DM Sans', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], styles: ['italic', 'normal'], subsets: ['latin', 'latin-ext'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'manrope', family: 'Manrope', category: 'sans-serif', weights: [200, 300, 400, 500, 600, 700, 800], styles: ['normal'], subsets: ['cyrillic', 'cyrillic-ext', 'greek', 'latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'outfit', family: 'Outfit', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], styles: ['normal'], subsets: ['latin', 'latin-ext'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'plus-jakarta-sans', family: 'Plus Jakarta Sans', category: 'sans-serif', weights: [200, 300, 400, 500, 600, 700, 800], styles: ['italic', 'normal'], subsets: ['cyrillic-ext', 'latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'space-grotesk', family: 'Space Grotesk', category: 'sans-serif', weights: [300, 400, 500, 600, 700], styles: ['normal'], subsets: ['latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'rubik', family: 'Rubik', category: 'sans-serif', weights: [300, 400, 500, 600, 700, 800, 900], styles: ['italic', 'normal'], subsets: ['arabic', 'cyrillic', 'cyrillic-ext', 'hebrew', 'latin', 'latin-ext'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'work-sans', family: 'Work Sans', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], styles: ['italic', 'normal'], subsets: ['latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'urbanist', family: 'Urbanist', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], styles: ['italic', 'normal'], subsets: ['latin', 'latin-ext'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'sora', family: 'Sora', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800], styles: ['normal'], subsets: ['latin', 'latin-ext'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'quicksand', family: 'Quicksand', category: 'sans-serif', weights: [300, 400, 500, 600, 700], styles: ['normal'], subsets: ['latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'comfortaa', family: 'Comfortaa', category: 'display', weights: [300, 400, 500, 600, 700], styles: ['normal'], subsets: ['cyrillic', 'cyrillic-ext', 'greek', 'latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'fredoka', family: 'Fredoka', category: 'sans-serif', weights: [300, 400, 500, 600, 700], styles: ['normal'], subsets: ['hebrew', 'latin', 'latin-ext'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'oswald', family: 'Oswald', category: 'sans-serif', weights: [200, 300, 400, 500, 600, 700], styles: ['normal'], subsets: ['cyrillic', 'cyrillic-ext', 'latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'bebas-neue', family: 'Bebas Neue', category: 'sans-serif', weights: [400], styles: ['normal'], subsets: ['latin', 'latin-ext'], license: 'OFL-1.1', variable: false, type: 'google' },
  { id: 'anton', family: 'Anton', category: 'sans-serif', weights: [400], styles: ['normal'], subsets: ['latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: false, type: 'google' },
  { id: 'archivo-black', family: 'Archivo Black', category: 'sans-serif', weights: [400], styles: ['normal'], subsets: ['latin', 'latin-ext'], license: 'OFL-1.1', variable: false, type: 'google' },
  { id: 'righteous', family: 'Righteous', category: 'display', weights: [400], styles: ['normal'], subsets: ['latin', 'latin-ext'], license: 'OFL-1.1', variable: false, type: 'google' },
  { id: 'bungee', family: 'Bungee', category: 'display', weights: [400], styles: ['normal'], subsets: ['latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: false, type: 'google' },
  { id: 'russo-one', family: 'Russo One', category: 'sans-serif', weights: [400], styles: ['normal'], subsets: ['cyrillic', 'latin', 'latin-ext'], license: 'OFL-1.1', variable: false, type: 'google' },
  { id: 'lilita-one', family: 'Lilita One', category: 'display', weights: [400], styles: ['normal'], subsets: ['latin', 'latin-ext'], license: 'OFL-1.1', variable: false, type: 'google' },
  { id: 'luckiest-guy', family: 'Luckiest Guy', category: 'display', weights: [400], styles: ['normal'], subsets: ['latin', 'latin-ext'], license: 'Apache-2.0', variable: false, type: 'google' },
  { id: 'bangers', family: 'Bangers', category: 'display', weights: [400], styles: ['normal'], subsets: ['latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: false, type: 'google' },
  { id: 'abril-fatface', family: 'Abril Fatface', category: 'display', weights: [400], styles: ['normal'], subsets: ['latin', 'latin-ext'], license: 'OFL-1.1', variable: false, type: 'google' },
  { id: 'alfa-slab-one', family: 'Alfa Slab One', category: 'display', weights: [400], styles: ['normal'], subsets: ['latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: false, type: 'google' },
  { id: 'playfair-display', family: 'Playfair Display', category: 'serif', weights: [400, 500, 600, 700, 800, 900], styles: ['italic', 'normal'], subsets: ['cyrillic', 'latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'merriweather', family: 'Merriweather', category: 'serif', weights: [300, 400, 500, 600, 700, 800, 900], styles: ['italic', 'normal'], subsets: ['cyrillic', 'cyrillic-ext', 'latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'lora', family: 'Lora', category: 'serif', weights: [400, 500, 600, 700], styles: ['italic', 'normal'], subsets: ['cyrillic', 'cyrillic-ext', 'latin', 'latin-ext', 'math', 'symbols'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'cormorant-garamond', family: 'Cormorant Garamond', category: 'serif', weights: [300, 400, 500, 600, 700], styles: ['italic', 'normal'], subsets: ['cyrillic', 'cyrillic-ext', 'latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'pacifico', family: 'Pacifico', category: 'handwriting', weights: [400], styles: ['normal'], subsets: ['cyrillic', 'cyrillic-ext', 'latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: false, type: 'google' },
  { id: 'lobster', family: 'Lobster', category: 'display', weights: [400], styles: ['normal'], subsets: ['cyrillic', 'cyrillic-ext', 'latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: false, type: 'google' },
  { id: 'caveat', family: 'Caveat', category: 'handwriting', weights: [400, 500, 600, 700], styles: ['normal'], subsets: ['cyrillic', 'cyrillic-ext', 'latin', 'latin-ext'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'dancing-script', family: 'Dancing Script', category: 'handwriting', weights: [400, 500, 600, 700], styles: ['normal'], subsets: ['latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'great-vibes', family: 'Great Vibes', category: 'handwriting', weights: [400], styles: ['normal'], subsets: ['cyrillic', 'cyrillic-ext', 'greek-ext', 'latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: false, type: 'google' },
  { id: 'satisfy', family: 'Satisfy', category: 'handwriting', weights: [400], styles: ['normal'], subsets: ['latin'], license: 'Apache-2.0', variable: false, type: 'google' },
  { id: 'permanent-marker', family: 'Permanent Marker', category: 'handwriting', weights: [400], styles: ['normal'], subsets: ['latin'], license: 'Apache-2.0', variable: false, type: 'google' },
  { id: 'shadows-into-light', family: 'Shadows Into Light', category: 'handwriting', weights: [400], styles: ['normal'], subsets: ['latin', 'latin-ext'], license: 'OFL-1.1', variable: false, type: 'google' },
  { id: 'press-start-2p', family: 'Press Start 2P', category: 'display', weights: [400], styles: ['normal'], subsets: ['cyrillic', 'cyrillic-ext', 'greek', 'latin', 'latin-ext'], license: 'OFL-1.1', variable: false, type: 'google' },
  { id: 'orbitron', family: 'Orbitron', category: 'sans-serif', weights: [400, 500, 600, 700, 800, 900], styles: ['normal'], subsets: ['latin'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'audiowide', family: 'Audiowide', category: 'display', weights: [400], styles: ['normal'], subsets: ['latin', 'latin-ext'], license: 'OFL-1.1', variable: false, type: 'google' },
  { id: 'exo-2', family: 'Exo 2', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], styles: ['italic', 'normal'], subsets: ['cyrillic', 'cyrillic-ext', 'latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'jetbrains-mono', family: 'JetBrains Mono', category: 'monospace', weights: [100, 200, 300, 400, 500, 600, 700, 800], styles: ['italic', 'normal'], subsets: ['cyrillic', 'cyrillic-ext', 'greek', 'latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'fira-code', family: 'Fira Code', category: 'monospace', weights: [300, 400, 500, 600, 700], styles: ['normal'], subsets: ['cyrillic', 'cyrillic-ext', 'greek', 'greek-ext', 'latin', 'latin-ext'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'space-mono', family: 'Space Mono', category: 'monospace', weights: [400, 700], styles: ['italic', 'normal'], subsets: ['latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: false, type: 'google' },
  { id: 'ibm-plex-mono', family: 'IBM Plex Mono', category: 'monospace', weights: [100, 200, 300, 400, 500, 600, 700], styles: ['italic', 'normal'], subsets: ['cyrillic', 'cyrillic-ext', 'latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: false, type: 'google' },
  { id: 'noto-sans', family: 'Noto Sans', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], styles: ['italic', 'normal'], subsets: ['cyrillic', 'cyrillic-ext', 'devanagari', 'greek', 'greek-ext', 'latin'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'noto-sans-jp', family: 'Noto Sans JP', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], styles: ['normal'], subsets: ['cyrillic', 'japanese', 'latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: true, type: 'google' },
  { id: 'kanit', family: 'Kanit', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700, 800, 900], styles: ['italic', 'normal'], subsets: ['latin', 'latin-ext', 'thai', 'vietnamese'], license: 'OFL-1.1', variable: false, type: 'google' },
  { id: 'josefin-sans', family: 'Josefin Sans', category: 'sans-serif', weights: [100, 200, 300, 400, 500, 600, 700], styles: ['italic', 'normal'], subsets: ['latin', 'latin-ext', 'vietnamese'], license: 'OFL-1.1', variable: true, type: 'google' },
];

export const POPULAR_FONT_IDS: string[] = POPULAR_FONTS_FALLBACK.map((f) => f.id);

// --- Caches --------------------------------------------------------------

let catalogPromise: Promise<FontMeta[]> | null = null;
let loadedCatalog: FontMeta[] | null = null;
const catalogById = new Map<string, FontMeta>();
const metaCache = new Map<string, Promise<FontMeta | null>>();

// --- Catalog store -------------------------------------------------------
//
// Every picker reads the catalog through this tiny external store (via
// `useSyncExternalStore`), so one request serves them all and each can show
// the curated list immediately while the full catalog is still on its way.

export type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface CatalogSnapshot {
  status: CatalogStatus;
  /** The full catalog once loaded; `null` until then (pickers fall back to `POPULAR_FONTS_FALLBACK`). */
  list: FontMeta[] | null;
  /** Why the last request failed, when `status` is `error`. */
  error: string | null;
}

/** Abort the catalog request after this long; the picker keeps working on the curated list and offers a retry. */
const CATALOG_TIMEOUT_MS = 20_000;

let catalogSnapshot: CatalogSnapshot = { status: 'idle', list: null, error: null };
const catalogListeners = new Set<() => void>();

function updateCatalogSnapshot(patch: Partial<CatalogSnapshot>): void {
  catalogSnapshot = { ...catalogSnapshot, ...patch };
  for (const listener of catalogListeners) listener();
}

export function subscribeToCatalog(listener: () => void): () => void {
  catalogListeners.add(listener);
  return () => {
    catalogListeners.delete(listener);
  };
}

export function getCatalogSnapshot(): CatalogSnapshot {
  return catalogSnapshot;
}

function toMeta(raw: unknown): FontMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || typeof r.family !== 'string') return null;
  const weights = Array.isArray(r.weights)
    ? (r.weights as unknown[]).map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
    : [];
  const styles = Array.isArray(r.styles)
    ? (r.styles as unknown[]).filter((s): s is FontStyleName => s === 'normal' || s === 'italic')
    : [];
  const unicodeRange =
    r.unicodeRange && typeof r.unicodeRange === 'object'
      ? Object.fromEntries(
          Object.entries(r.unicodeRange as Record<string, unknown>).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        )
      : undefined;
  return {
    id: r.id,
    family: r.family,
    category: (typeof r.category === 'string' ? r.category : 'other') as FontCategory,
    weights: weights.length > 0 ? weights : [400],
    styles: styles.length > 0 ? styles : ['normal'],
    subsets: Array.isArray(r.subsets) ? (r.subsets as unknown[]).filter((s): s is string => typeof s === 'string') : [],
    license: typeof r.license === 'string' ? r.license : '',
    variable: !!r.variable,
    type: r.type === 'other' ? 'other' : 'google',
    ...(unicodeRange ? { unicodeRange } : {}),
  };
}

// --- Public API ----------------------------------------------------------

/**
 * Full font catalog (icon fonts excluded). One request per page lifetime:
 * concurrent callers share the promise, a failure clears it so the next call
 * retries, and progress is mirrored into the catalog store.
 */
export function fetchFontCatalog(): Promise<FontMeta[]> {
  if (loadedCatalog) return Promise.resolve(loadedCatalog);
  if (!catalogPromise) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = setTimeout(() => controller?.abort(), CATALOG_TIMEOUT_MS);
    updateCatalogSnapshot({ status: 'loading', error: null });
    catalogPromise = fetch(`${API_BASE}/fonts`, controller ? { signal: controller.signal } : undefined)
      .then((r) => {
        if (!r.ok) throw new Error(`Fontsource /fonts failed: ${r.status}`);
        return r.json();
      })
      .then((raw: unknown) => {
        if (!Array.isArray(raw)) throw new Error('Unexpected Fontsource catalog response');
        const list = raw
          .map(toMeta)
          .filter((m): m is FontMeta => !!m && m.category !== 'icons');
        catalogById.clear();
        for (const m of list) catalogById.set(m.id, m);
        loadedCatalog = list;
        updateCatalogSnapshot({ status: 'ready', list, error: null });
        return list;
      })
      .catch((err: unknown) => {
        // Clear cache on failure so subsequent calls can retry.
        catalogPromise = null;
        const message =
          err instanceof Error && err.name === 'AbortError'
            ? `no response after ${CATALOG_TIMEOUT_MS / 1000}s`
            : String((err as { message?: unknown } | null)?.message ?? err);
        updateCatalogSnapshot({ status: 'error', error: message });
        throw err;
      })
      .finally(() => clearTimeout(timer));
  }
  return catalogPromise;
}

/**
 * Kick off the catalog request early (a text panel mounting, the picker's
 * trigger being hovered) so the list is populated by the time it opens.
 * Failures surface through the store, never as a rejection.
 */
export function prefetchFontCatalog(): void {
  if (loadedCatalog || catalogPromise) return;
  fetchFontCatalog().catch(() => {});
}

/** Synchronous access to the catalog once it has loaded (else `null`). */
export function getLoadedCatalog(): FontMeta[] | null {
  return loadedCatalog;
}

/**
 * Metadata for a single font id. Served from the loaded catalog when
 * possible, otherwise from `/v1/fonts/{id}`; falls back to the curated list
 * (or `null`) when offline.
 */
export function getFontMeta(id: string, options: { detailed?: boolean } = {}): Promise<FontMeta | null> {
  if (!id) return Promise.resolve(null);
  const fromCatalog = catalogById.get(id);
  // The catalog rows lack `unicodeRange`; callers that need it ask for the detailed record.
  if (fromCatalog && !options.detailed) return Promise.resolve(fromCatalog);

  let p = metaCache.get(id);
  if (!p) {
    p = fetch(`${API_BASE}/fonts/${encodeURIComponent(id)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Fontsource /fonts/${id} failed: ${r.status}`);
        return r.json();
      })
      .then((raw: unknown) => toMeta(raw))
      .catch(() => {
        metaCache.delete(id);
        return catalogById.get(id) ?? POPULAR_FONTS_FALLBACK.find((f) => f.id === id) ?? null;
      });
    metaCache.set(id, p);
  }
  return p;
}

/**
 * Filter + rank fonts for the picker. An empty query lists the curated
 * popular fonts first, then the rest alphabetically; otherwise prefix
 * matches on family/id come before substring matches.
 */
export function searchFonts(
  catalog: FontMeta[],
  query: string,
  category: FontCategory | 'all' = 'all',
): FontMeta[] {
  const q = query.trim().toLowerCase();
  const pool = category === 'all' ? catalog : catalog.filter((f) => f.category === category);

  if (!q) {
    const rank = new Map(POPULAR_FONT_IDS.map((id, i) => [id, i] as const));
    const popular = pool
      .filter((f) => rank.has(f.id))
      .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    const rest = pool
      .filter((f) => !rank.has(f.id))
      .sort((a, b) => a.family.localeCompare(b.family));
    return [...popular, ...rest];
  }

  const starts: FontMeta[] = [];
  const contains: FontMeta[] = [];
  for (const f of pool) {
    const family = f.family.toLowerCase();
    if (family.startsWith(q) || f.id.startsWith(q)) starts.push(f);
    else if (family.includes(q) || f.id.includes(q)) contains.push(f);
  }
  return [...starts, ...contains];
}
