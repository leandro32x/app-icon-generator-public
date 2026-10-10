import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Check, ChevronsUpDown, Loader2, RefreshCw, Search } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { cn } from './ui/utils';
import {
  fetchFontCatalog,
  getCatalogSnapshot,
  prefetchFontCatalog,
  subscribeToCatalog,
  searchFonts,
  fontLicenseShort,
  FONT_CATEGORY_LABELS,
  POPULAR_FONT_IDS,
  POPULAR_FONTS_FALLBACK,
  type FontCategory,
  type FontMeta,
} from '../utils/fontsourceApi';
import { loadWebFont } from '../utils/fontLoader';

export interface FontPickerValue {
  fontId: string;
  family: string;
}

export interface FontPickerSelection extends FontPickerValue {
  meta: FontMeta | null;
}

interface FontPickerProps {
  value: FontPickerValue | null;
  onChange: (selection: FontPickerSelection) => void;
  /** Text the font will render — forwarded to the loader so the right unicode subsets download. */
  sampleText?: string;
  id?: string;
  placeholder?: string;
}

type CategoryFilter = FontCategory | 'all';
type Row = { kind: 'header'; label: string } | { kind: 'font'; meta: FontMeta };

const CATEGORY_FILTERS: { value: CategoryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'sans-serif', label: 'Sans' },
  { value: 'serif', label: 'Serif' },
  { value: 'display', label: 'Display' },
  { value: 'handwriting', label: 'Script' },
  { value: 'monospace', label: 'Mono' },
];

const HEADER_ROW_HEIGHT = 28;
const FONT_ROW_HEIGHT = 40;
const LIST_PADDING = 4;
/** Rows only fetch their preview face after sitting in the viewport this long (fast scrolling stays cheap). */
const PREVIEW_LOAD_DELAY_MS = 150;
/** Rows a PageUp / PageDown press moves the highlight by. */
const PAGE_ROWS = 7;
/** What the virtualizer assumes before it has measured the list, so the first paint already carries rows. */
const INITIAL_LIST_RECT = { width: 372, height: 320 };

/* ------------------------------------------------------------------------ */
/* Preview faces                                                             */
/* ------------------------------------------------------------------------ */

type FaceStatus = 'loading' | 'ready' | 'failed';

/**
 * Outcome of every preview-face load, shared by all rows and pickers so a row
 * that scrolls back into view renders in its face straight away instead of
 * dimming again.
 */
const faceStatus = new Map<string, FaceStatus>();
const facePromises = new Map<string, Promise<FaceStatus>>();

function loadPreviewFace(meta: FontMeta): Promise<FaceStatus> {
  if (faceStatus.get(meta.id) === 'ready') return Promise.resolve('ready');
  let p = facePromises.get(meta.id);
  if (!p) {
    // 400/normal maps to the font's default face, so fonts without a regular weight still get a preview.
    p = loadWebFont(meta.id, meta.family, 400, false, meta.family).then((ok) => {
      const status: FaceStatus = ok ? 'ready' : 'failed';
      faceStatus.set(meta.id, status);
      facePromises.delete(meta.id);
      return status;
    });
    facePromises.set(meta.id, p);
  }
  return p;
}

interface FontRowProps {
  meta: FontMeta;
  id: string;
  index: number;
  selected: boolean;
  active: boolean;
  onSelect: (meta: FontMeta) => void;
  onActivate: (index: number) => void;
}

/**
 * One catalog row. The family name is dimmed until the font's own face has
 * loaded, then shown in it. Module-level for stable identity.
 */
const FontRow = memo(function FontRow({ meta, id, index, selected, active, onSelect, onActivate }: FontRowProps) {
  const [status, setStatus] = useState<FaceStatus>(() => faceStatus.get(meta.id) ?? 'loading');

  useEffect(() => {
    if (faceStatus.get(meta.id) === 'ready') {
      setStatus('ready');
      return;
    }
    // A face that failed earlier is retried on re-mount (the loader forgets failed stylesheets).
    let cancelled = false;
    const timer = setTimeout(() => {
      void loadPreviewFace(meta).then((next) => {
        if (!cancelled) setStatus(next);
      });
    }, PREVIEW_LOAD_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [meta]);

  return (
    <div
      id={id}
      role="option"
      aria-selected={selected}
      data-active={active || undefined}
      className={cn(
        'flex h-10 cursor-pointer select-none items-center gap-2 rounded-sm px-2 text-sm',
        active && 'bg-accent text-accent-foreground',
      )}
      onPointerMove={() => onActivate(index)}
      onClick={() => onSelect(meta)}
    >
      <Check className={cn('h-4 w-4 shrink-0', selected ? 'opacity-100' : 'opacity-0')} />
      <span
        className={cn(
          'truncate text-[15px] leading-none transition-opacity duration-200',
          status === 'loading' && 'opacity-40',
        )}
        style={{ fontFamily: `"${meta.family}", sans-serif` }}
        title={status === 'failed' ? `${meta.family} (preview unavailable)` : meta.family}
      >
        {meta.family}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-1.5">
        {status === 'failed' && <span className="text-[10px] text-muted-foreground">no preview</span>}
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
          {FONT_CATEGORY_LABELS[meta.category] ?? meta.category}
        </span>
        {meta.license && (
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-normal" title={meta.license}>
            {fontLicenseShort(meta.license)}
          </Badge>
        )}
      </span>
    </div>
  );
});

/* ------------------------------------------------------------------------ */
/* Panel (mounted fresh on every open)                                       */
/* ------------------------------------------------------------------------ */

interface FontPanelProps {
  value: FontPickerValue | null;
  category: CategoryFilter;
  onCategoryChange: (category: CategoryFilter) => void;
  onSelect: (meta: FontMeta) => void;
}

/**
 * The popover's contents: search input, category filter, virtualized list
 * and catalog-status footer. It mounts fresh on every open, so the search
 * starts empty and the virtualizer starts from `INITIAL_LIST_RECT` instead
 * of a measurement left over from a previous, now-unmounted list — a stale
 * 0 px measurement makes `@tanstack/react-virtual` render no rows at all.
 */
function FontPanel({ value, category, onCategoryChange, onSelect }: FontPanelProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  // Mirror of `activeIndex` for key handlers, so fast repeats never act on a stale render.
  const activeRef = useRef(-1);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const catalog = useSyncExternalStore(subscribeToCatalog, getCatalogSnapshot, getCatalogSnapshot);
  // The curated list stands in until the full catalog arrives (or when it cannot).
  const fonts = catalog.list ?? POPULAR_FONTS_FALLBACK;
  const partial = catalog.list === null;

  // Fetch the catalog at the latest now (usually prefetched before the panel opened).
  useEffect(() => {
    prefetchFontCatalog();
  }, []);

  const rows = useMemo<Row[]>(() => {
    const results = searchFonts(fonts, query, category);
    if (query.trim()) return results.map((meta) => ({ kind: 'font', meta }));
    const popularIds = new Set(POPULAR_FONT_IDS);
    const popular = results.filter((f) => popularIds.has(f.id));
    const rest = results.filter((f) => !popularIds.has(f.id));
    const out: Row[] = [];
    if (popular.length > 0) {
      out.push({ kind: 'header', label: 'Popular' });
      for (const meta of popular) out.push({ kind: 'font', meta });
    }
    if (rest.length > 0) {
      out.push({ kind: 'header', label: `All fonts (${rest.length.toLocaleString()})` });
      for (const meta of rest) out.push({ kind: 'font', meta });
    }
    return out;
  }, [fonts, query, category]);

  const firstFontIndex = useMemo(() => rows.findIndex((r) => r.kind === 'font'), [rows]);
  const selectedIndex = useMemo(
    () => (value ? rows.findIndex((r) => r.kind === 'font' && r.meta.id === value.fontId) : -1),
    [rows, value?.fontId],
  );

  const estimateSize = useCallback(
    (index: number) => (rows[index]?.kind === 'header' ? HEADER_ROW_HEIGHT : FONT_ROW_HEIGHT),
    [rows],
  );
  const getItemKey = useCallback(
    (index: number) => {
      const row = rows[index];
      return row.kind === 'header' ? `header:${row.label}` : row.meta.id;
    },
    [rows],
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize,
    getItemKey,
    overscan: 6,
    paddingStart: LIST_PADDING,
    paddingEnd: LIST_PADDING,
    initialRect: INITIAL_LIST_RECT,
  });

  const activate = useCallback((index: number) => {
    activeRef.current = index;
    setActiveIndex(index);
  }, []);

  // Whenever the result set changes — mount, typing, switching category, the
  // full catalog replacing the curated list — highlight the selected font
  // (browsing) or the first result (searching) and bring it into view.
  useEffect(() => {
    const browsing = !query.trim();
    const target = browsing && selectedIndex >= 0 ? selectedIndex : firstFontIndex;
    activate(target);
    if (target < 0) return;
    if (browsing && selectedIndex >= 0) virtualizer.scrollToIndex(target, { align: 'center' });
    else virtualizer.scrollToOffset(0);
  }, [rows, query, selectedIndex, firstFontIndex, virtualizer, activate]);

  /** Move the highlight by `delta` font rows (headers are skipped) and keep it in view. */
  const moveActive = (delta: number) => {
    if (rows.length === 0) return;
    const current = activeRef.current;
    const dir = delta > 0 ? 1 : -1;
    let index = current >= 0 ? current : dir > 0 ? -1 : rows.length;
    let landed = current;
    for (let remaining = Math.abs(delta); remaining > 0; ) {
      index += dir;
      if (index < 0 || index >= rows.length) break;
      if (rows[index].kind === 'font') {
        landed = index;
        remaining--;
      }
    }
    if (landed < 0 || landed === current) return;
    activate(landed);
    virtualizer.scrollToIndex(landed, { align: 'auto' });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        moveActive(1);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moveActive(-1);
        break;
      case 'PageDown':
        e.preventDefault();
        moveActive(PAGE_ROWS);
        break;
      case 'PageUp':
        e.preventDefault();
        moveActive(-PAGE_ROWS);
        break;
      case 'Enter': {
        e.preventDefault();
        const row = rows[activeRef.current];
        if (row?.kind === 'font') onSelect(row.meta);
        break;
      }
      default:
        break;
    }
  };

  const rowId = (index: number) => `${listboxId}-${index}`;

  return (
    <>
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3">
        <Search className="size-4 shrink-0 opacity-50" aria-hidden="true" />
        <input
          role="combobox"
          aria-expanded="true"
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? rowId(activeIndex) : undefined}
          aria-autocomplete="list"
          aria-label="Search fonts"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={partial ? 'Search fonts…' : `Search ${fonts.length.toLocaleString()} fonts…`}
          className="h-10 w-full min-w-0 bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
        />
        {catalog.status === 'loading' && (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <div className="shrink-0 border-b border-border px-2 py-2">
        <ToggleGroup
          type="single"
          size="sm"
          variant="outline"
          value={category}
          onValueChange={(v) => {
            if (v) onCategoryChange(v as CategoryFilter);
          }}
          className="w-full"
        >
          {CATEGORY_FILTERS.map((c) => (
            <ToggleGroupItem key={c.value} value={c.value} className="flex-1 text-xs px-1">
              {c.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <div
        ref={listRef}
        id={listboxId}
        role="listbox"
        aria-label="Fonts"
        tabIndex={-1}
        className="min-h-[160px] max-h-[320px] overflow-y-auto overscroll-contain"
      >
        {rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">No fonts found.</div>
        ) : (
          <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              return (
                <div
                  key={item.key}
                  data-index={item.index}
                  className="absolute left-0 top-0 w-full px-1"
                  style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                >
                  {row.kind === 'header' ? (
                    <div role="presentation" className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                      {row.label}
                    </div>
                  ) : (
                    <FontRow
                      meta={row.meta}
                      id={rowId(item.index)}
                      index={item.index}
                      selected={value?.fontId === row.meta.id}
                      active={item.index === activeIndex}
                      onSelect={onSelect}
                      onActivate={activate}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {partial && (
        <div className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          {catalog.status === 'error' ? (
            <>
              <span className="min-w-0 flex-1 truncate" title={catalog.error ?? undefined}>
                Could not load the full catalog — showing {POPULAR_FONTS_FALLBACK.length} popular fonts.
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2"
                onClick={() => fetchFontCatalog().catch(() => {})}
              >
                <RefreshCw className="mr-1 size-3" aria-hidden="true" />
                Retry
              </Button>
            </>
          ) : (
            <>
              <Loader2 className="size-3 shrink-0 animate-spin" aria-hidden="true" />
              <span>
                Loading all 2,100+ fonts…{query.trim() ? ' Search covers the popular fonts for now.' : ''}
              </span>
            </>
          )}
        </div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------------ */
/* Picker                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Searchable font picker backed by the Fontsource catalog (~2,100 fonts).
 *
 * The curated "Popular" fonts show instantly; the full catalog streams in
 * behind them (prefetched when the trigger is hovered or a text panel mounts).
 * The list is a plain virtualized listbox driven from the search input —
 * arrows / PageUp / PageDown move the highlight, Enter picks — rather than
 * cmdk, whose mount-driven "select the first item" logic fights a list whose
 * rows mount and unmount as it scrolls. Each row lazily loads its own face
 * for the preview.
 */
export function FontPicker({ value, onChange, sampleText, id, placeholder = 'Choose a font…' }: FontPickerProps) {
  const [open, setOpen] = useState(false);
  // Lives here rather than in the panel so a chosen category survives re-opens.
  const [category, setCategory] = useState<CategoryFilter>('all');

  // Make sure the selected family renders in its own face on the trigger.
  useEffect(() => {
    if (!value) return;
    void loadWebFont(value.fontId, value.family, 400, false, `${value.family}${sampleText ?? ''}`);
  }, [value?.fontId, value?.family, sampleText]);

  const handleSelect = useCallback(
    (meta: FontMeta) => {
      onChange({ fontId: meta.id, family: meta.family, meta });
      setOpen(false);
    },
    [onChange],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-haspopup="listbox"
          aria-expanded={open}
          onPointerEnter={prefetchFontCatalog}
          onFocus={prefetchFontCatalog}
          className="w-full justify-between bg-card border-border shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors h-10 font-normal"
        >
          <span
            className="truncate text-[15px]"
            style={value ? { fontFamily: `"${value.family}", sans-serif` } : undefined}
          >
            {value?.family ?? placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      {/* Capped to the space Radix reports so the list shrinks instead of running off short viewports,
          with a floor so it never collapses to a sliver on tiny ones. */}
      <PopoverContent
        align="start"
        className="flex w-[min(380px,calc(100vw-2rem))] max-h-[min(460px,max(var(--radix-popover-content-available-height),300px))] flex-col overflow-hidden p-0"
      >
        <FontPanel value={value} category={category} onCategoryChange={setCategory} onSelect={handleSelect} />
      </PopoverContent>
    </Popover>
  );
}
