/**
 * Thin wrappers over the public Iconify HTTP API.
 * Docs: https://iconify.design/docs/api/queries.html
 *
 * All icon data is fetched lazily on demand. Responses are cached in memory
 * for the lifetime of the page. `@iconify/react`'s <Icon> component handles
 * per-icon SVG fetching & caching independently — this module only deals
 * with metadata (collection list, per-collection icon names, search).
 */

const API_BASE = 'https://api.iconify.design';

// --- Types ---------------------------------------------------------------

export interface CollectionInfo {
  /** Collection prefix, e.g. "mdi", "lucide", "ph". */
  prefix: string;
  /** Human-readable name, e.g. "Material Design Icons". */
  name: string;
  /** Total icon count in the collection. */
  total: number;
  /** Author / license info, when available. */
  author?: { name?: string; url?: string };
  license?: { title?: string; spdx?: string; url?: string };
  /** Optional category/family grouping supplied by Iconify. */
  category?: string;
  /** Sample icon names (full ids) for previews. */
  samples?: string[];
  /** Optional height hint, used for display grid sizing. */
  height?: number;
}

export interface CollectionData {
  prefix: string;
  total: number;
  title?: string;
  /** Flat list of icon names within the collection (no prefix). */
  icons: string[];
  /** Aliases → resolved name (not currently used). */
  aliases?: Record<string, string>;
}

export interface SearchResult {
  /** Full iconify ids ("prefix:name"). */
  icons: string[];
  total: number;
  limit: number;
  start: number;
  /** Collections metadata returned alongside results. */
  collections?: Record<string, CollectionInfo>;
}

// --- Caches --------------------------------------------------------------

let collectionsPromise: Promise<Record<string, CollectionInfo>> | null = null;
const collectionDataCache = new Map<string, Promise<CollectionData>>();

// --- Public API ----------------------------------------------------------

export async function fetchCollections(): Promise<Record<string, CollectionInfo>> {
  if (!collectionsPromise) {
    collectionsPromise = fetch(`${API_BASE}/collections`)
      .then((r) => {
        if (!r.ok) throw new Error(`Iconify /collections failed: ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        // Clear cache on failure so subsequent calls can retry.
        collectionsPromise = null;
        throw err;
      });
  }
  return collectionsPromise;
}

export async function fetchCollection(prefix: string): Promise<CollectionData> {
  let p = collectionDataCache.get(prefix);
  if (!p) {
    p = fetch(`${API_BASE}/collection?prefix=${encodeURIComponent(prefix)}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Iconify /collection?prefix=${prefix} failed: ${r.status}`);
        return r.json();
      })
      .then((raw: any) => {
        // API returns { prefix, total, title, categories?: {cat: [names]}, uncategorized?: [names] }.
        const names: string[] = [];
        if (raw.categories && typeof raw.categories === 'object') {
          for (const cat of Object.values(raw.categories)) {
            if (Array.isArray(cat)) names.push(...(cat as string[]));
          }
        }
        if (Array.isArray(raw.uncategorized)) names.push(...raw.uncategorized);
        // Deduplicate while preserving order.
        const seen = new Set<string>();
        const deduped = names.filter((n) => {
          if (seen.has(n)) return false;
          seen.add(n);
          return true;
        });
        return {
          prefix: raw.prefix ?? prefix,
          total: raw.total ?? deduped.length,
          title: raw.title,
          icons: deduped,
          aliases: raw.aliases,
        } as CollectionData;
      })
      .catch((err) => {
        collectionDataCache.delete(prefix);
        throw err;
      });
    // Simple LRU cap: evict oldest entries once we exceed 12.
    if (collectionDataCache.size >= 12) {
      const firstKey = collectionDataCache.keys().next().value;
      if (firstKey) collectionDataCache.delete(firstKey);
    }
    collectionDataCache.set(prefix, p);
  }
  return p;
}

/**
 * Search icons across all collections using the Iconify search API.
 * `signal` lets callers cancel stale requests on keystroke.
 */
export async function searchIcons(
  query: string,
  options: { limit?: number; signal?: AbortSignal; prefixes?: string[] } = {},
): Promise<SearchResult> {
  const limit = options.limit ?? 200;
  const params = new URLSearchParams({
    query,
    limit: String(limit),
  });
  if (options.prefixes && options.prefixes.length > 0) {
    params.set('prefixes', options.prefixes.join(','));
  }
  const r = await fetch(`${API_BASE}/search?${params.toString()}`, {
    signal: options.signal,
  });
  if (!r.ok) throw new Error(`Iconify /search failed: ${r.status}`);
  return r.json();
}
