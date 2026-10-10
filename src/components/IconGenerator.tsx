import React, { useState, useMemo, useRef, useEffect, useCallback, useSyncExternalStore } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Switch } from './ui/switch';
import { Button } from './ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog';
import { ScrollArea } from './ui/scroll-area';
import {
    createIconUrl,
    getIconComponent,
    generateColor,
    parseIconUrl,
    loadIcon,
    type IconOption,
    type IconSource,
} from '../utils/iconManager';
import {
    fetchCollections,
    fetchCollection,
    searchIcons,
    type CollectionInfo,
} from '../utils/iconifyApi';
import {
    getStyleOptionsForPrefix,
    getFamilyForPrefix,
    getVariantForPrefix,
    STYLE_FAMILIES,
    DEFAULT_PREFIX,
    isBrandCollection,
} from '../utils/iconifyCollections';
import { getDisabledSpdxCodes, getEnabledFamilyIds, getBrandPacksVisible, subscribeToPackFilter, getFilterVersion } from '../utils/packFilterStore';
import { Alert, AlertDescription } from './ui/alert';
import { TriangleAlert } from 'lucide-react';
import { IconWrapper } from './IconWrapper';
import { Plus, X, Check, ChevronsUpDown, AlignHorizontalSpaceAround, AlignVerticalSpaceAround, Circle, Square, RectangleHorizontal, Contrast, Shapes, ImageIcon, Type, FlipHorizontal2, FlipVertical2, Shuffle, RotateCcw, Layers, Palette, SquareRoundCorner, Move, Sparkles } from 'lucide-react';
import type { BannerConfig } from './BannerPreview';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { GradientStopsEditor } from './GradientStopsEditor';
import { Accordion } from './ui/accordion';
import { SettingsSection, SwatchChip } from './SettingsSection';
import { SliderField } from './ui/slider-field';
import { ColorField } from './ui/color-field';
import { AngleDial } from './ui/angle-slider';
import { buildCssGradient } from '../utils/gradient';
import { randomGradient } from '../utils/randomGradient';
import type { IconConfig } from '../utils/iconConfig';
import type { ForegroundType } from '../utils/foreground';
import { resolveBannerFont } from '../utils/fontLoader';
import { FontPicker } from './FontPicker';
import { ImageUploadPanel } from './ImageUploadPanel';
import { TextForegroundPanel } from './TextForegroundPanel';
import { IconTile } from './IconTile';
import { STYLE_PRESETS, applyPreset, shuffleStyle } from '../utils/presets';

/** Sentinel prefix used in state to mean "search across all Iconify collections". */
const ALL_COLLECTIONS = '__all__';
const LAST_PREFIX_STORAGE_KEY = 'app-icon-generator-last-prefix';
const SEARCH_DEBOUNCE_MS = 220;
const CUSTOMIZE_SECTIONS = ['background', 'foreground', 'shape', 'transform', 'effect'];
const EFFECT_LABELS: Record<IconConfig['iconEffect'], string> = {
    none: 'None',
    'drop-shadow': 'Drop shadow',
    'cast-shadow': 'Cast shadow',
    score: 'Score',
    outline: 'Outline',
    offset: 'Offset print',
};

/** Solid / Gradient segmented switch used by the background and foreground sections. */
function FillModeToggle({ gradient, onChange, label }: { gradient: boolean; onChange: (gradient: boolean) => void; label: string }) {
    return (
        <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={gradient ? 'gradient' : 'solid'}
            onValueChange={(v: string) => { if (v) onChange(v === 'gradient'); }}
            aria-label={label}
        >
            <ToggleGroupItem value="solid" className="px-4 text-xs">Solid</ToggleGroupItem>
            <ToggleGroupItem value="gradient" className="px-4 text-xs">Gradient</ToggleGroupItem>
        </ToggleGroup>
    );
}

interface IconGeneratorProps {
    onGenerate: (url: string) => void;
    /** Externally controlled icon URL (e.g. restored from a saved session). */
    generatedIcon?: string | null;
    config: IconConfig;
    onConfigChange: (config: IconConfig) => void;
    iconSource: IconSource;
    onIconSourceChange: (source: IconSource) => void;
    iconStyle: string;
    onIconStyleChange: (style: string) => void;
    bannerConfig: BannerConfig;
    onBannerConfigChange: (config: BannerConfig) => void;
    onActiveTabChange?: (tab: string) => void;
    /** Called when the user clicks "Open settings" from the all-packs-disabled empty state. */
    onOpenPackSettings?: () => void;
}

export function IconGenerator({ onGenerate, generatedIcon, config, onConfigChange, iconSource, onIconSourceChange, iconStyle, onIconStyleChange, bannerConfig, onBannerConfigChange, onActiveTabChange, onOpenPackSettings }: IconGeneratorProps) {
    const [selectedIcon, setSelectedIcon] = useState<IconOption | null>(null);
    const [openSections, setOpenSections] = useState<string[]>(CUSTOMIZE_SECTIONS);
    const [searchQuery, setSearchQuery] = useState('');
    const [debouncedQuery, setDebouncedQuery] = useState('');
    const parentRef = useRef<HTMLDivElement>(null);
    // Width of the icon grid so the column count can follow the viewport
    // (6 on desktop, 3–4 on phones). A callback ref re-attaches the observer
    // whenever the grid mounts again (it is unmounted for image/text kinds).
    const [gridWidth, setGridWidth] = useState(0);
    const gridResizeObserver = useRef<ResizeObserver | null>(null);
    const setGridRef = useCallback((el: HTMLDivElement | null) => {
        gridResizeObserver.current?.disconnect();
        gridResizeObserver.current = null;
        parentRef.current = el;
        if (!el) return;
        const measure = () => setGridWidth(el.clientWidth);
        measure();
        if (typeof ResizeObserver !== 'undefined') {
            gridResizeObserver.current = new ResizeObserver(measure);
            gridResizeObserver.current.observe(el);
        }
    }, []);

    // Iconify-collection catalogue (fetched once per session).
    const [collections, setCollections] = useState<Record<string, CollectionInfo> | null>(null);
    const [collectionsError, setCollectionsError] = useState<string | null>(null);

    // Active prefix (what the user has chosen in the library combobox).
    // `iconSource` is the source of truth from App state; we mirror a sentinel
    // here for "All" mode so the UI can switch without touching App state.
    const [activePrefix, setActivePrefix] = useState<string>(() => {
        if (typeof window === 'undefined') return iconSource || DEFAULT_PREFIX;
        return localStorage.getItem(LAST_PREFIX_STORAGE_KEY) || iconSource || DEFAULT_PREFIX;
    });
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [attributionOpen, setAttributionOpen] = useState(false);

    // Per-collection icon names (cached in iconifyApi; this state holds the
    // currently active list so the virtualized grid has something to render).
    const [collectionNames, setCollectionNames] = useState<string[] | null>(null);
    const [collectionLoading, setCollectionLoading] = useState(false);
    const [collectionError, setCollectionError] = useState<string | null>(null);

    // Search-all results when activePrefix === ALL_COLLECTIONS.
    const [searchResults, setSearchResults] = useState<string[] | null>(null);
    const [searchLoading, setSearchLoading] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);

    // --- Pack filter (from packFilterStore) --------------------------------
    // useSyncExternalStore guarantees React reads the store synchronously
    // during each render, so the combobox list always reflects the latest
    // preference without relying on batched setState callbacks.
    const filterVersion = useSyncExternalStore(subscribeToPackFilter, getFilterVersion);
    const enabledFamilyIds = useMemo(() => getEnabledFamilyIds(), [filterVersion]);
    // Brand / logo packs are opt-in (trademarks) — see packFilterStore.
    const brandPacksVisible = useMemo(() => getBrandPacksVisible(), [filterVersion]);

    // If the currently active prefix belongs to a disabled family or a
    // collection whose license has been disabled, switch to the first remaining
    // allowed collection — or ALL_COLLECTIONS if none are left.
    useEffect(() => {
        if (activePrefix === ALL_COLLECTIONS || !collections) return;
        const activeFamily = getFamilyForPrefix(activePrefix);
        const disabledSpdxCodes = getDisabledSpdxCodes();
        const activeInfo = collections?.[activePrefix];
        const activeSpdx = activeInfo?.license?.spdx;
        const familyDisabled = !!activeFamily && !enabledFamilyIds.has(activeFamily.id);
        const collectionDisabled = !activeFamily && !!activeSpdx && disabledSpdxCodes.has(activeSpdx);
        const brandHidden = !brandPacksVisible && isBrandCollection(activePrefix, activeInfo);
        if (!familyDisabled && !collectionDisabled && !brandHidden) return;
        // collectionItems is recomputed in the same render cycle that bumped
        // filterVersion, so it already reflects the new filter state. Prefer
        // the stock default library over whatever sorts first alphabetically.
        const fallback = collectionItems.some((item) => item.prefix === DEFAULT_PREFIX)
            ? DEFAULT_PREFIX
            : (collectionItems[0]?.prefix ?? ALL_COLLECTIONS);
        handleLibraryChange(fallback);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterVersion, collections]);

    // --- External restore: rehydrate selection from props ------------------
    //
    // When a saved session is restored, the parent updates `generatedIcon` /
    // `iconSource` but our internal `selectedIcon` and `activePrefix` stay
    // stale — the grid loses its highlight and the preview may render a
    // placeholder for variant prefixes (e.g. `ph-fill`) because the active
    // collection doesn't match the icon's actual prefix. This effect syncs
    // both on prop change.
    useEffect(() => {
        if (!generatedIcon) return;
        const parsed = parseIconUrl(generatedIcon);
        if (!parsed) return;
        const sameSelection =
            selectedIcon?.name === parsed.name && selectedIcon?.source === parsed.source;
        if (!sameSelection) {
            const full = `${parsed.source}:${parsed.name}`;
            const next: IconOption = {
                name: parsed.name,
                source: parsed.source,
                icon: getIconComponent(full),
                color: generateColor(full),
            };
            setSelectedIcon(next);
            // Kick off the Iconify fetch so the grid/preview have real SVG
            // data to render against once the collection loads.
            loadIcon(full).catch(() => undefined);
        }
        // Only switch the active prefix on session restore — not when the user
        // picks an icon while in "All collections" search mode, as that would
        // replace the search results with a single-collection grid.
        if (activePrefix !== parsed.source && activePrefix !== ALL_COLLECTIONS) {
            setActivePrefix(parsed.source);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [generatedIcon]);

    // --- Bootstrap: sync activePrefix → App iconSource, load collections ----

    useEffect(() => {
        if (activePrefix !== ALL_COLLECTIONS && activePrefix !== iconSource) {
            onIconSourceChange(activePrefix);
        }
        if (activePrefix !== ALL_COLLECTIONS && typeof window !== 'undefined') {
            localStorage.setItem(LAST_PREFIX_STORAGE_KEY, activePrefix);
        }
        // Only run when activePrefix changes — App's iconSource is downstream.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activePrefix]);

    useEffect(() => {
        let cancelled = false;
        fetchCollections()
            .then((data) => {
                if (!cancelled) setCollections(data);
            })
            .catch((err) => {
                if (!cancelled) setCollectionsError(String(err?.message ?? err));
            });
        return () => { cancelled = true; };
    }, []);

    // --- Style selector (contextual) ----------------------------------------

    const styleOptions = useMemo(
        () => (activePrefix === ALL_COLLECTIONS ? [] : getStyleOptionsForPrefix(activePrefix)),
        [activePrefix],
    );
    const showStyleSelector = styleOptions.length >= 2;

    // Sync the App's `iconStyle` whenever the active prefix changes to a known
    // family: keep the user on the variant they picked. `iconStyle` stores the
    // full variant prefix (e.g. "ph-fill") when inside a family; outside a
    // family it stays as a free-form string for back-compat.
    useEffect(() => {
        if (!showStyleSelector) return;
        const matchedVariant = styleOptions.find((v) => v.prefix === activePrefix);
        if (matchedVariant && iconStyle !== matchedVariant.prefix) {
            onIconStyleChange(matchedVariant.prefix);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activePrefix, showStyleSelector]);

    const handleStyleChange = (variantPrefix: string) => {
        onIconStyleChange(variantPrefix);
        // Switch the active collection to the chosen style variant while
        // attempting to preserve the currently selected icon name.
        const prevName = selectedIcon?.name;
        setActivePrefix(variantPrefix);
        if (prevName) {
            const icon = getIconComponent(`${variantPrefix}:${prevName}`);
            const next: IconOption = {
                name: prevName,
                icon,
                color: generateColor(`${variantPrefix}:${prevName}`),
                source: variantPrefix,
            };
            setSelectedIcon(next);
            onGenerate(createIconUrl(prevName, variantPrefix));
        }
    };

    // --- Library combobox ---------------------------------------------------

    const collectionItems = useMemo(() => {
        if (!collections) return [] as Array<{ prefix: string; label: string; category?: string; total: number }>;
        const disabledSpdxCodes = getDisabledSpdxCodes();
        return Object.entries(collections)
            .filter(([prefix, info]) => {
                // Brand / logo packs stay hidden unless the user opted in.
                if (!brandPacksVisible && isBrandCollection(prefix, info)) return false;
                const family = getFamilyForPrefix(prefix);
                // If prefix belongs to a StyleFamily, hide it when that family is disabled.
                if (family) return enabledFamilyIds.has(family.id);
                // For other API collections: hide if their SPDX license is explicitly
                // disabled by the user. Collections with uncontrolled / unknown licenses
                // are never hidden (blacklist approach).
                const spdx = info.license?.spdx;
                if (spdx && disabledSpdxCodes.has(spdx)) return false;
                return true;
            })
            .map(([prefix, info]) => ({
                prefix,
                label: info.name ?? prefix,
                category: info.category,
                total: info.total ?? 0,
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }, [collections, enabledFamilyIds, brandPacksVisible]);

    const activeCollectionLabel = useMemo(() => {
        if (activePrefix === ALL_COLLECTIONS) return 'All collections';
        const info = collections?.[activePrefix];
        if (info) return info.name ?? activePrefix;
        // Fall back to the family label when we're inside a multi-variant
        // family and the direct prefix isn't in the collections index.
        const variant = getVariantForPrefix(activePrefix);
        const family = getFamilyForPrefix(activePrefix);
        if (family && variant) return `${family.label} · ${variant.label}`;
        return activePrefix;
    }, [activePrefix, collections]);

    const handleLibraryChange = (prefix: string) => {
        setLibraryOpen(false);
        setSearchQuery('');
        setDebouncedQuery('');
        setSelectedIcon(null);
        onGenerate('');
        setActivePrefix(prefix);
        // If the chosen library is the root of a style family, also sync
        // iconStyle to the family default so the style selector is consistent.
        const family = getFamilyForPrefix(prefix);
        if (family) {
            onIconStyleChange(prefix);
        } else {
            onIconStyleChange('');
        }
    };

    // --- Per-collection name fetch -----------------------------------------

    useEffect(() => {
        if (activePrefix === ALL_COLLECTIONS) {
            setCollectionNames(null);
            setCollectionError(null);
            setCollectionLoading(false);
            return;
        }
        let cancelled = false;
        setCollectionLoading(true);
        setCollectionError(null);
        fetchCollection(activePrefix)
            .then((data) => {
                if (!cancelled) setCollectionNames(data.icons);
            })
            .catch((err) => {
                if (!cancelled) setCollectionError(String(err?.message ?? err));
            })
            .finally(() => {
                if (!cancelled) setCollectionLoading(false);
            });
        return () => { cancelled = true; };
    }, [activePrefix]);

    // --- Search debounce ---------------------------------------------------

    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(searchQuery.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [searchQuery]);

    // --- Search-all fetch --------------------------------------------------

    useEffect(() => {
        if (activePrefix !== ALL_COLLECTIONS) {
            setSearchResults(null);
            setSearchError(null);
            setSearchLoading(false);
            return;
        }
        if (debouncedQuery.length < 2) {
            setSearchResults(null);
            setSearchError(null);
            setSearchLoading(false);
            return;
        }
        const controller = new AbortController();
        setSearchLoading(true);
        setSearchError(null);
        searchIcons(debouncedQuery, { limit: 200, signal: controller.signal })
            .then((res) => setSearchResults(res.icons))
            .catch((err) => {
                if (err?.name === 'AbortError') return;
                setSearchError(String(err?.message ?? err));
            })
            .finally(() => {
                setSearchLoading(false);
            });
        return () => controller.abort();
    }, [activePrefix, debouncedQuery]);

    // --- Filtered grid list ------------------------------------------------

    const filteredIcons: IconOption[] = useMemo(() => {
        if (activePrefix === ALL_COLLECTIONS) {
            if (!searchResults) return [];
            // Apply the same license filter used by the collection picker so
            // search-all results respect the user's pack preferences.
            const disabledSpdxCodes = getDisabledSpdxCodes();
            const isPrefixAllowed = (prefix: string) => {
                if (!brandPacksVisible && isBrandCollection(prefix, collections?.[prefix])) return false;
                const family = getFamilyForPrefix(prefix);
                if (family) return enabledFamilyIds.has(family.id);
                const spdx = collections?.[prefix]?.license?.spdx;
                if (spdx && disabledSpdxCodes.has(spdx)) return false;
                return true;
            };
            return searchResults.reduce<IconOption[]>((acc, fullId) => {
                const colon = fullId.indexOf(':');
                const prefix = fullId.slice(0, colon);
                if (!isPrefixAllowed(prefix)) return acc;
                const name = fullId.slice(colon + 1);
                acc.push({
                    name,
                    source: prefix,
                    icon: getIconComponent(fullId),
                    color: generateColor(fullId),
                });
                return acc;
            }, []);
        }
        if (!collectionNames) return [];
        const query = debouncedQuery.toLowerCase();
        const filtered = query
            ? collectionNames.filter((n) => n.toLowerCase().includes(query))
            : collectionNames;
        return filtered.map((name) => ({
            name,
            source: activePrefix,
            icon: getIconComponent(`${activePrefix}:${name}`),
            color: generateColor(`${activePrefix}:${name}`),
        }));
    }, [activePrefix, collectionNames, debouncedQuery, searchResults, enabledFamilyIds, brandPacksVisible, collections, filterVersion]);

    const totalCount = activePrefix === ALL_COLLECTIONS
        ? (searchResults?.length ?? 0)
        : (collectionNames?.length ?? 0);

    const handleIconSelect = (iconOption: IconOption) => {
        setSelectedIcon(iconOption);
        const dataUrl = createIconUrl(iconOption.name, iconOption.source);
        onGenerate(dataUrl);

        onConfigChange({
            ...config,
            backgroundColor: iconOption.color,
            backgroundGradientStart: iconOption.color,
            backgroundGradientStops: config.backgroundGradientStops.length >= 2
                ? config.backgroundGradientStops.map((s, i) =>
                    i === 0 ? { ...s, color: iconOption.color } : s,
                  )
                : [
                    { color: iconOption.color, position: 0 },
                    { color: config.backgroundGradientEnd, position: 100 },
                  ],
        });
    };

    // --- Virtualized grid --------------------------------------------------

    // ~84 px per tile keeps the names legible; the grid div has 8 px padding on each side.
    const columnCount = gridWidth > 0 ? Math.min(6, Math.max(3, Math.floor((gridWidth - 16) / 84))) : 6;
    const rowVirtualizer = useVirtualizer({
        count: Math.ceil(filteredIcons.length / columnCount),
        getScrollElement: () => parentRef.current,
        estimateSize: () => 110,
        overscan: 3,
    });

    // --- Status line for empty/loading/error states ------------------------

    const gridStatus: { message: string; kind: 'empty' | 'loading' | 'error' | 'hint' | 'filter' } | null =
        (() => {
            // All packs hidden by license filter — trumps everything else.
            if (collectionItems.length === 0 && collections) {
                return { kind: 'filter', message: 'No icon packs are available with your current license settings.' };
            }
            if (activePrefix === ALL_COLLECTIONS) {
                if (debouncedQuery.length < 2) {
                    return { kind: 'hint', message: 'Type at least 2 characters to search all collections.' };
                }
                if (searchLoading) return { kind: 'loading', message: 'Searching Iconify…' };
                if (searchError) return { kind: 'error', message: searchError };
                if (filteredIcons.length === 0) return { kind: 'empty', message: `No results for "${debouncedQuery}".` };
                return null;
            }
            if (collectionLoading) return { kind: 'loading', message: `Loading ${activeCollectionLabel}…` };
            if (collectionError) return { kind: 'error', message: collectionError };
            if (filteredIcons.length === 0) {
                return debouncedQuery
                    ? { kind: 'empty', message: `No icons match "${debouncedQuery}" in ${activeCollectionLabel}.` }
                    : { kind: 'empty', message: `${activeCollectionLabel} is empty.` };
            }
            return null;
        })();

    return (
        <Card className="border border-border shadow-sm bg-card overflow-hidden">
            <div className="p-4 sm:p-6 border-b border-border bg-surface-subtle">
                <h3 className="font-semibold text-foreground">Design Your Icon</h3>
                <p className="text-sm text-muted-foreground mt-1">
                    Pick an icon, upload an image or type text, then customize the appearance
                </p>
            </div>
            <Tabs defaultValue="icons" className="w-full" onValueChange={(value) => onActiveTabChange?.(value)}>
                <div className="border-b border-border px-4 sm:px-6">
                    <TabsList className="flex w-full justify-start gap-4 sm:gap-8 bg-transparent p-0 h-auto rounded-none">
                        <TabsTrigger
                            value="icons"
                            className="flex-none rounded-none border-0 border-b-2 border-transparent px-1 sm:px-2 py-3 sm:py-4 h-auto whitespace-nowrap font-medium text-muted-foreground hover:text-foreground data-[state=active]:border-b-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:bg-transparent bg-transparent focus-visible:ring-0 focus-visible:outline-none transition-all"
                        >
                            Foreground
                        </TabsTrigger>
                        <TabsTrigger
                            value="customize"
                            className="flex-none rounded-none border-0 border-b-2 border-transparent px-1 sm:px-2 py-3 sm:py-4 h-auto whitespace-nowrap font-medium text-muted-foreground hover:text-foreground data-[state=active]:border-b-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:bg-transparent bg-transparent focus-visible:ring-0 focus-visible:outline-none transition-all"
                        >
                            Customize
                        </TabsTrigger>
                        <TabsTrigger
                            value="banner"
                            className="flex-none rounded-none border-0 border-b-2 border-transparent px-1 sm:px-2 py-3 sm:py-4 h-auto whitespace-nowrap font-medium text-muted-foreground hover:text-foreground data-[state=active]:border-b-foreground data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:bg-transparent bg-transparent focus-visible:ring-0 focus-visible:outline-none transition-all"
                        >
                            Store Banner
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="icons" forceMount className="p-4 sm:p-6 space-y-5 sm:space-y-6 mt-0 data-[state=inactive]:hidden">
                        {/* Foreground kind — Iconify icon, uploaded image or text. Switching keeps the
                            other kinds' state (icon pick, image, text) so users can flip back. */}
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-foreground">Foreground type</Label>
                            <ToggleGroup
                                type="single"
                                value={config.foregroundType}
                                onValueChange={(value) => { if (value) onConfigChange({ ...config, foregroundType: value as ForegroundType }); }}
                                variant="outline"
                                className="w-full"
                            >
                                <ToggleGroupItem value="icon" className="flex-1 gap-2">
                                    <Shapes className="h-4 w-4" />
                                    Icon
                                </ToggleGroupItem>
                                <ToggleGroupItem value="image" className="flex-1 gap-2">
                                    <ImageIcon className="h-4 w-4" />
                                    Image
                                </ToggleGroupItem>
                                <ToggleGroupItem value="text" className="flex-1 gap-2">
                                    <Type className="h-4 w-4" />
                                    Text
                                </ToggleGroupItem>
                            </ToggleGroup>
                        </div>

                        {config.foregroundType === 'image' && (
                            <ImageUploadPanel config={config} onConfigChange={onConfigChange} />
                        )}

                        {config.foregroundType === 'text' && (
                            <TextForegroundPanel config={config} onConfigChange={onConfigChange} />
                        )}

                        {config.foregroundType === 'icon' && (<>
                        <div className="space-y-1.5">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
                                <div className="space-y-2 flex-1">
                                    <Label className="text-sm font-medium text-foreground">Icon Library</Label>
                                    <Popover open={libraryOpen} onOpenChange={setLibraryOpen}>
                                        <PopoverTrigger asChild>
                                            <Button
                                                type="button"
                                                variant="outline"
                                                role="combobox"
                                                aria-expanded={libraryOpen}
                                                className="w-full justify-between bg-card border-border shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors h-10 font-normal"
                                                disabled={!collections && !collectionsError}
                                            >
                                                <span className="truncate">
                                                    {collectionsError ? 'Failed to load collections' : activeCollectionLabel}
                                                </span>
                                                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                            </Button>
                                        </PopoverTrigger>
                                        <PopoverContent className="w-[min(360px,calc(100vw-2rem))] p-0" align="start">
                                            <Command>
                                                <CommandInput placeholder="Search collections…" />
                                                <CommandList className="max-h-[320px]">
                                                    <CommandEmpty>No collections found.</CommandEmpty>
                                                    <CommandGroup>
                                                        <CommandItem
                                                            value="All collections"
                                                            onSelect={() => handleLibraryChange(ALL_COLLECTIONS)}
                                                        >
                                                            <Check className={`mr-2 h-4 w-4 ${activePrefix === ALL_COLLECTIONS ? 'opacity-100' : 'opacity-0'}`} />
                                                            <span className="font-medium">All collections</span>
                                                            <span className="ml-auto text-xs text-muted-foreground">search only</span>
                                                        </CommandItem>
                                                    </CommandGroup>
                                                    {collectionItems.length > 0 && (
                                                        <CommandGroup heading={`${collectionItems.length} collections`}>
                                                            {collectionItems.map((item) => (
                                                                <CommandItem
                                                                    key={item.prefix}
                                                                    value={`${item.label} ${item.prefix}`}
                                                                    onSelect={() => handleLibraryChange(item.prefix)}
                                                                >
                                                                    <Check className={`mr-2 h-4 w-4 ${activePrefix === item.prefix ? 'opacity-100' : 'opacity-0'}`} />
                                                                    <span className="truncate">{item.label}</span>
                                                                    <span className="ml-auto text-xs text-muted-foreground tabular-nums">{item.total}</span>
                                                                </CommandItem>
                                                            ))}
                                                        </CommandGroup>
                                                    )}
                                                </CommandList>
                                            </Command>
                                        </PopoverContent>
                                    </Popover>
                                </div>

                                {showStyleSelector && (
                                    <div className="space-y-2 flex-1">
                                        <Label className="text-sm font-medium text-foreground">Icon Style</Label>
                                        <Select
                                            value={styleOptions.find((v) => v.prefix === activePrefix)?.prefix ?? styleOptions[0].prefix}
                                            onValueChange={handleStyleChange}
                                        >
                                            <SelectTrigger className="w-full bg-card border-border shadow-sm hover:bg-accent transition-colors h-10">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {styleOptions.map((opt) => (
                                                    <SelectItem key={opt.prefix} value={opt.prefix}>{opt.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                <div className="space-y-2 flex-[2]">
                                    <Label htmlFor="icon-search" className="text-sm font-medium text-foreground">
                                        {activePrefix === ALL_COLLECTIONS ? 'Search all collections' : 'Search icons'}
                                    </Label>
                                    <Input
                                        id="icon-search"
                                        type="text"
                                        placeholder={activePrefix === ALL_COLLECTIONS ? 'e.g. "home", "rocket"…' : 'Search icons…'}
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="h-10"
                                    />
                                </div>
                            </div>

                            {activePrefix !== ALL_COLLECTIONS && collections?.[activePrefix] && (
                                <button
                                    type="button"
                                    onClick={() => setAttributionOpen(true)}
                                    className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
                                >
                                    View attribution
                                </button>
                            )}

                            {/* Trademark warning for brand-logo packs */}
                            {(() => {
                                if (activePrefix === ALL_COLLECTIONS) return null;
                                const info = collections?.[activePrefix];
                                if (!isBrandCollection(activePrefix, info)) return null;
                                const packLabel = info?.name ?? getFamilyForPrefix(activePrefix)?.label ?? activePrefix;
                                return (
                                    <Alert className="mt-2">
                                        <TriangleAlert className="h-4 w-4" />
                                        <AlertDescription>
                                            <strong>{packLabel}</strong> contains brand and product logos.
                                            Logo usage may be restricted by trademark law regardless of the
                                            icon pack license. Verify usage rights with the brand owner before
                                            publishing.
                                        </AlertDescription>
                                    </Alert>
                                );
                            })()}
                        </div>

                        {/* Attribution modal */}
                        {collections?.[activePrefix] && (() => {
                            const col = collections[activePrefix];
                            return (
                                <Dialog open={attributionOpen} onOpenChange={setAttributionOpen}>
                                    <DialogContent className="sm:max-w-md">
                                        <DialogHeader>
                                            <DialogTitle>Icon Pack Attribution</DialogTitle>
                                        </DialogHeader>
                                        <dl className="space-y-3 text-sm">
                                            <div>
                                                <dt className="font-medium text-foreground">Icon pack</dt>
                                                <dd className="text-muted-foreground">{col.name}</dd>
                                            </div>
                                            {col.author?.name && (
                                                <div>
                                                    <dt className="font-medium text-foreground">Author</dt>
                                                    <dd className="text-muted-foreground">
                                                        {col.author.url ? (
                                                            <a href={col.author.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">{col.author.name}</a>
                                                        ) : col.author.name}
                                                    </dd>
                                                </div>
                                            )}
                                            {col.license?.title && (
                                                <div>
                                                    <dt className="font-medium text-foreground">License</dt>
                                                    <dd className="text-muted-foreground">
                                                        {col.license.url ? (
                                                            <a href={col.license.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">{col.license.title}{col.license.spdx ? ` (${col.license.spdx})` : ''}</a>
                                                        ) : `${col.license.title}${col.license.spdx ? ` (${col.license.spdx})` : ''}`}
                                                    </dd>
                                                </div>
                                            )}
                                            <div>
                                                <dt className="font-medium text-foreground">Source</dt>
                                                <dd className="text-muted-foreground">
                                                    <a href={`https://icon-sets.iconify.design/${activePrefix}/`} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">icon-sets.iconify.design/{activePrefix}</a>
                                                </dd>
                                            </div>
                                            <div>
                                                <dt className="font-medium text-foreground">Changes</dt>
                                                <dd className="text-muted-foreground">Icon customized / generated by user using this app</dd>
                                            </div>
                                        </dl>
                                    </DialogContent>
                                </Dialog>
                            );
                        })()}

                        <div className="space-y-3">
                            <div className="flex items-center justify-between text-sm px-1">
                                <span className="text-muted-foreground font-medium">
                                    {totalCount.toLocaleString()} {totalCount === 1 ? 'icon' : 'icons'}
                                    {debouncedQuery && activePrefix !== ALL_COLLECTIONS && ` · filtered: ${filteredIcons.length.toLocaleString()}`}
                                </span>
                                <span className="text-xs bg-muted px-2 py-1 rounded-md text-muted-foreground font-medium uppercase tracking-wider">
                                    {activePrefix === ALL_COLLECTIONS ? 'All' : activePrefix}
                                </span>
                            </div>

                            <div
                                ref={setGridRef}
                                className="border border-border rounded-xl bg-surface-subtle overflow-auto h-[450px]"
                            >
                                {gridStatus ? (
                                    <div className="flex flex-col items-center justify-center h-full py-16 text-center text-muted-foreground">
                                        <div className={`bg-card p-4 rounded-full shadow-sm mb-4 border border-border ${gridStatus.kind === 'loading' ? 'animate-pulse' : ''}`}>
                                            <svg className="w-8 h-8 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                {gridStatus.kind === 'error' ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
                                                ) : gridStatus.kind === 'filter' ? (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
                                                ) : (
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                                )}
                                            </svg>
                                        </div>
                                        <p className="font-semibold text-foreground text-lg">
                                            {gridStatus.kind === 'loading' ? 'Loading icons' :
                                                gridStatus.kind === 'error' ? 'Something went wrong' :
                                                gridStatus.kind === 'hint' ? 'Start typing' :
                                                gridStatus.kind === 'filter' ? 'No packs available' :
                                                'No icons found'}
                                        </p>
                                        <p className="text-sm mt-1 max-w-[320px] mx-auto">{gridStatus.message}</p>
                                        {gridStatus.kind === 'filter' && onOpenPackSettings && (
                                            <button
                                                type="button"
                                                onClick={onOpenPackSettings}
                                                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md border border-border bg-card text-foreground hover:bg-accent transition-colors"
                                            >
                                                Open license settings
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div
                                        style={{
                                            height: `${rowVirtualizer.getTotalSize()}px`,
                                            width: '100%',
                                            position: 'relative',
                                            padding: '8px',
                                        }}
                                    >
                                        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                                            const startIndex = virtualRow.index * columnCount;
                                            const icons = filteredIcons.slice(startIndex, startIndex + columnCount);

                                            return (
                                                <div
                                                    key={virtualRow.index}
                                                    style={{
                                                        position: 'absolute',
                                                        top: 0,
                                                        left: 0,
                                                        width: '100%',
                                                        height: `${virtualRow.size}px`,
                                                        transform: `translateY(${virtualRow.start}px)`,
                                                    }}
                                                >
                                                    <div className="grid gap-2 px-1" style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}>
                                                        {icons.map((iconOption) => {
                                                            const IconComponent = iconOption.icon;
                                                            if (!IconComponent) return null;
                                                            const key = `${iconOption.source}:${iconOption.name}`;
                                                            return (
                                                                <IconWrapper
                                                                    key={key}
                                                                    icon={IconComponent}
                                                                    color={iconOption.color}
                                                                    name={iconOption.name}
                                                                    onSelect={() => handleIconSelect(iconOption)}
                                                                    isSelected={selectedIcon
                                                                        ? selectedIcon.name === iconOption.name && selectedIcon.source === iconOption.source
                                                                        : false}
                                                                />
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                        </>)}
                </TabsContent>

                <TabsContent value="customize" forceMount className="p-4 sm:p-6 sm:pt-4 space-y-4 mt-0 min-h-[550px] data-[state=inactive]:hidden">
                        {/* Style presets — one-click looks rendered live with the current foreground */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between gap-3">
                                <div>
                                    <Label>Style presets</Label>
                                    <p className="text-xs text-muted-foreground mt-1">
                                        One-click looks. Your icon, image or text stays as it is.
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onConfigChange(shuffleStyle(config))}
                                    className="gap-1.5 shrink-0"
                                    title="Random harmonious background and a readable foreground color"
                                >
                                    <Shuffle className="h-3.5 w-3.5" />
                                    Shuffle
                                </Button>
                            </div>
                            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                                {STYLE_PRESETS.map((preset) => (
                                    <button
                                        key={preset.id}
                                        type="button"
                                        title={preset.name}
                                        onClick={() => onConfigChange(applyPreset(config, preset))}
                                        className="flex flex-col items-center gap-1.5 shrink-0 rounded-lg p-1.5 hover:bg-accent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        <IconTile
                                            size={44}
                                            config={applyPreset(config, preset)}
                                            iconUrl={generatedIcon ?? null}
                                            iconSource={iconSource}
                                            iconStyle={iconStyle}
                                        />
                                        <span className="text-[10px] leading-none text-muted-foreground whitespace-nowrap">{preset.name}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Each part of the icon gets its own collapsible section with a live summary in the header. */}
                        <Accordion
                            type="multiple"
                            value={openSections}
                            onValueChange={setOpenSections}
                            className="rounded-lg border border-border bg-surface-subtle px-4"
                        >
                            {/* ---- Background ---- */}
                            <SettingsSection
                                value="background"
                                title="Background"
                                icon={Layers}
                                summary={config.backgroundGradient ? (
                                    <>
                                        <SwatchChip background={buildCssGradient(config.backgroundGradientStops, config.backgroundGradientAngle)} />
                                        Gradient · {config.backgroundGradientStops.length} stops · {Math.round(config.backgroundGradientAngle)}°
                                    </>
                                ) : (
                                    <>
                                        <SwatchChip background={config.backgroundColor} />
                                        <span className="uppercase">{config.backgroundColor}</span>
                                    </>
                                )}
                            >
                                <FillModeToggle
                                    gradient={config.backgroundGradient}
                                    onChange={(gradient) => onConfigChange({ ...config, backgroundGradient: gradient })}
                                    label="Background fill"
                                />
                                {!config.backgroundGradient ? (
                                    <ColorField
                                        id="bg-color"
                                        value={config.backgroundColor}
                                        onChange={(backgroundColor) => onConfigChange({ ...config, backgroundColor })}
                                        aria-label="Background color"
                                    />
                                ) : (
                                    <GradientStopsEditor
                                        idPrefix="bg-gradient"
                                        stops={config.backgroundGradientStops}
                                        angle={config.backgroundGradientAngle}
                                        onStopsChange={(stops) => onConfigChange({
                                            ...config,
                                            backgroundGradientStops: stops,
                                            backgroundGradientStart: stops[0]?.color ?? config.backgroundGradientStart,
                                            backgroundGradientEnd: stops[stops.length - 1]?.color ?? config.backgroundGradientEnd,
                                        })}
                                        onAngleChange={(angle) => onConfigChange({ ...config, backgroundGradientAngle: angle })}
                                        onRandomize={() => {
                                            const g = randomGradient();
                                            onConfigChange({
                                                ...config,
                                                backgroundGradientStops: g.stops,
                                                backgroundGradientStart: g.stops[0].color,
                                                backgroundGradientEnd: g.stops[g.stops.length - 1].color,
                                                backgroundGradientAngle: g.angle,
                                            });
                                        }}
                                    />
                                )}
                            </SettingsSection>

                            {/* ---- Foreground color (icon, text, or tinted image) ---- */}
                            <SettingsSection
                                value="foreground"
                                title="Foreground color"
                                icon={Palette}
                                summary={config.foregroundType === 'image' && !config.imageTint ? (
                                    <>Image keeps its own colors</>
                                ) : config.usePartColors && config.foregroundType === 'icon' ? (
                                    <>
                                        {config.iconPartColors.slice(0, 4).map((c, i) => <SwatchChip key={i} background={c} />)}
                                        {config.iconPartColors.length} part colors
                                    </>
                                ) : config.iconGradient ? (
                                    <>
                                        <SwatchChip background={buildCssGradient(config.iconGradientStops, config.iconGradientAngle)} />
                                        Gradient · {config.iconGradientStops.length} stops · {Math.round(config.iconGradientAngle)}°
                                    </>
                                ) : (
                                    <>
                                        <SwatchChip background={config.iconColor} />
                                        <span className="uppercase">{config.iconColor}</span>
                                    </>
                                )}
                            >
                                <FillModeToggle
                                    gradient={config.iconGradient}
                                    onChange={(gradient) => onConfigChange({ ...config, iconGradient: gradient })}
                                    label="Foreground fill"
                                />
                                {!config.iconGradient ? (
                                    <ColorField
                                        id="icon-color"
                                        value={config.iconColor}
                                        onChange={(iconColor) => onConfigChange({ ...config, iconColor })}
                                        aria-label="Foreground color"
                                    />
                                ) : (
                                    <GradientStopsEditor
                                        idPrefix="icon-gradient"
                                        stops={config.iconGradientStops}
                                        angle={config.iconGradientAngle}
                                        onStopsChange={(stops) => onConfigChange({
                                            ...config,
                                            iconGradientStops: stops,
                                            iconGradientStart: stops[0]?.color ?? config.iconGradientStart,
                                            iconGradientEnd: stops[stops.length - 1]?.color ?? config.iconGradientEnd,
                                        })}
                                        onAngleChange={(angle) => onConfigChange({ ...config, iconGradientAngle: angle })}
                                    />
                                )}
                                {config.foregroundType === 'image' && !config.imageTint && (
                                    <p className="text-xs text-muted-foreground">
                                        The uploaded image keeps its own colors. Turn on “Tint with foreground color” in the Foreground tab to recolor it.
                                    </p>
                                )}

                                {/* Part colors (SVG icons only) */}
                                {config.foregroundType === 'icon' && (
                                    <div className="rounded-md border border-border bg-card p-3 space-y-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div>
                                                <Label htmlFor="use-part-colors" className="text-xs">Color parts separately</Label>
                                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                                    Each color goes to the next path in the icon, in order.
                                                </p>
                                            </div>
                                            <Switch
                                                id="use-part-colors"
                                                checked={config.usePartColors}
                                                onCheckedChange={(checked: boolean) => {
                                                    const newConfig = { ...config, usePartColors: checked };
                                                    // Initialize with 2 colors if enabling and array is empty
                                                    if (checked && config.iconPartColors.length === 0) {
                                                        newConfig.iconPartColors = [config.iconColor, '#FF0000'];
                                                    }
                                                    onConfigChange(newConfig);
                                                }}
                                            />
                                        </div>

                                        {config.usePartColors && (
                                            <div className="space-y-2">
                                                {config.iconPartColors.map((color, index) => (
                                                    <div key={index} className="flex items-center gap-2">
                                                        <span className="w-5 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{index + 1}</span>
                                                        <ColorField
                                                            size="sm"
                                                            value={color}
                                                            onChange={(next) => {
                                                                const newColors = [...config.iconPartColors];
                                                                newColors[index] = next;
                                                                onConfigChange({ ...config, iconPartColors: newColors });
                                                            }}
                                                            aria-label={`Part ${index + 1} color`}
                                                            className="flex-1 min-w-0"
                                                        />
                                                        <Button
                                                            type="button"
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => {
                                                                const newColors = config.iconPartColors.filter((_, i) => i !== index);
                                                                onConfigChange({ ...config, iconPartColors: newColors });
                                                            }}
                                                            className="h-8 w-8 shrink-0"
                                                            aria-label={`Remove part ${index + 1} color`}
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                ))}
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => onConfigChange({ ...config, iconPartColors: [...config.iconPartColors, '#000000'] })}
                                                    className="w-full"
                                                >
                                                    <Plus className="h-4 w-4 mr-1.5" />
                                                    Add part color
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </SettingsSection>

                            {/* ---- Shape ---- */}
                            <SettingsSection
                                value="shape"
                                title="Shape"
                                icon={SquareRoundCorner}
                                summary={<>Padding {config.padding}% · Radius {config.cornerRadius}%</>}
                            >
                                <SliderField
                                    label="Padding"
                                    value={config.padding}
                                    onChange={(padding) => onConfigChange({ ...config, padding })}
                                    min={0}
                                    max={50}
                                    unit="%"
                                    resetTo={15}
                                />
                                <SliderField
                                    label="Corner radius"
                                    value={config.cornerRadius}
                                    onChange={(cornerRadius) => onConfigChange({ ...config, cornerRadius })}
                                    min={0}
                                    max={50}
                                    unit="%"
                                    resetTo={22}
                                />
                            </SettingsSection>

                            {/* ---- Position & transform of the foreground (any kind) ---- */}
                            <SettingsSection
                                value="transform"
                                title="Position & size"
                                icon={Move}
                                summary={
                                    <>
                                        Scale {config.foregroundScale}% · Offset {config.foregroundOffsetX}, {config.foregroundOffsetY} · {config.foregroundRotation}°
                                        {(config.foregroundFlipX || config.foregroundFlipY) && ' · flipped'}
                                    </>
                                }
                            >
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-5">
                                    <div className="flex-1 min-w-0 space-y-3 pt-1">
                                        <SliderField
                                            label="Scale"
                                            value={config.foregroundScale}
                                            onChange={(foregroundScale) => onConfigChange({ ...config, foregroundScale })}
                                            min={25}
                                            max={200}
                                            unit="%"
                                            resetTo={100}
                                        />
                                        <SliderField
                                            label="Horizontal"
                                            value={config.foregroundOffsetX}
                                            onChange={(foregroundOffsetX) => onConfigChange({ ...config, foregroundOffsetX })}
                                            min={-50}
                                            max={50}
                                            unit="%"
                                            resetTo={0}
                                        />
                                        <SliderField
                                            label="Vertical"
                                            value={config.foregroundOffsetY}
                                            onChange={(foregroundOffsetY) => onConfigChange({ ...config, foregroundOffsetY })}
                                            min={-50}
                                            max={50}
                                            unit="%"
                                            resetTo={0}
                                        />
                                    </div>
                                    <div className="flex shrink-0 items-center justify-center gap-3 sm:flex-col sm:gap-1">
                                        <AngleDial
                                            size={76}
                                            value={((config.foregroundRotation % 360) + 360) % 360}
                                            onValueChange={(deg) => onConfigChange({
                                                ...config,
                                                foregroundRotation: deg > 180 ? deg - 360 : deg,
                                            })}
                                            aria-label="Rotation"
                                            arc="signed"
                                        >
                                            <span className="text-[11px] font-semibold tabular-nums text-foreground">
                                                {config.foregroundRotation}°
                                            </span>
                                        </AngleDial>
                                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Rotation</span>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <ToggleGroup
                                        type="multiple"
                                        variant="outline"
                                        size="sm"
                                        value={[config.foregroundFlipX ? 'x' : '', config.foregroundFlipY ? 'y' : ''].filter(Boolean)}
                                        onValueChange={(values: string[]) => onConfigChange({
                                            ...config,
                                            foregroundFlipX: values.includes('x'),
                                            foregroundFlipY: values.includes('y'),
                                        })}
                                        aria-label="Flip"
                                    >
                                        <ToggleGroupItem value="x" aria-label="Flip horizontally" className="gap-1.5 px-2.5 text-xs">
                                            <FlipHorizontal2 className="h-3.5 w-3.5" />
                                            Flip H
                                        </ToggleGroupItem>
                                        <ToggleGroupItem value="y" aria-label="Flip vertically" className="gap-1.5 px-2.5 text-xs">
                                            <FlipVertical2 className="h-3.5 w-3.5" />
                                            Flip V
                                        </ToggleGroupItem>
                                    </ToggleGroup>
                                    <div className="flex items-center gap-3">
                                        <p className="hidden text-[11px] text-muted-foreground sm:block">
                                            Drag the preview to move · double-click to recenter
                                        </p>
                                        <button
                                            type="button"
                                            className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary hover:opacity-80"
                                            onClick={() => onConfigChange({
                                                ...config,
                                                foregroundOffsetX: 0,
                                                foregroundOffsetY: 0,
                                                foregroundScale: 100,
                                                foregroundRotation: 0,
                                                foregroundFlipX: false,
                                                foregroundFlipY: false,
                                            })}
                                        >
                                            <RotateCcw className="h-3 w-3" />
                                            Reset
                                        </button>
                                    </div>
                                </div>
                            </SettingsSection>

                            {/* ---- Effect ---- */}
                            <SettingsSection
                                value="effect"
                                title="Effect"
                                icon={Sparkles}
                                summary={config.iconEffect === 'none'
                                    ? 'None'
                                    : `${EFFECT_LABELS[config.iconEffect]} · ${config.iconEffectOpacity}%`}
                            >
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                                    <Select
                                        value={config.iconEffect}
                                        onValueChange={(value: string) =>
                                            onConfigChange({ ...config, iconEffect: value as IconConfig['iconEffect'] })
                                        }
                                    >
                                        <SelectTrigger id="icon-effect" className="w-full sm:w-[150px] shrink-0 bg-card border-border shadow-sm h-9" aria-label="Icon effect">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">None</SelectItem>
                                            <SelectItem value="drop-shadow">Drop shadow</SelectItem>
                                            <SelectItem value="cast-shadow">Cast shadow</SelectItem>
                                            <SelectItem value="score">Score</SelectItem>
                                            <SelectItem value="outline">Outline</SelectItem>
                                            <SelectItem value="offset">Offset print</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    {config.iconEffect !== 'none' ? (
                                        <SliderField
                                            label="Opacity"
                                            value={config.iconEffectOpacity}
                                            onChange={(iconEffectOpacity) => onConfigChange({ ...config, iconEffectOpacity })}
                                            min={0}
                                            max={100}
                                            unit="%"
                                            resetTo={100}
                                            labelClassName="w-14"
                                            className="flex-1 min-w-0"
                                        />
                                    ) : (
                                        <p className="text-xs text-muted-foreground">
                                            Add a shadow, an outline, an offset print or a score line behind the glyph.
                                        </p>
                                    )}
                                </div>
                            </SettingsSection>
                        </Accordion>
                </TabsContent>

                <TabsContent value="banner" forceMount className="p-4 sm:p-6 space-y-6 mt-0 min-h-[550px] data-[state=inactive]:hidden">
                        {/* Use icon background */}
                        <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border bg-accent/30">
                            <div className="min-w-0 pr-3">
                                <Label htmlFor="banner-use-icon-bg" className="text-sm font-medium">Use icon background</Label>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Match the banner background to the icon's color or gradient.
                                </p>
                            </div>
                            <Switch
                                id="banner-use-icon-bg"
                                checked={bannerConfig.useIconBackground}
                                onCheckedChange={(checked: boolean) => onBannerConfigChange({ ...bannerConfig, useIconBackground: checked })}
                            />
                        </div>

                        {/* Title */}
                        <div className="space-y-2">
                            <Label htmlFor="banner-title">Title</Label>
                            <Input
                                id="banner-title"
                                type="text"
                                value={bannerConfig.title}
                                onChange={(e) => onBannerConfigChange({ ...bannerConfig, title: e.target.value })}
                                placeholder="Your App"
                            />
                        </div>

                        {/* Tagline */}
                        <div className="space-y-2">
                            <Label htmlFor="banner-tagline">Tagline</Label>
                            <Input
                                id="banner-tagline"
                                type="text"
                                value={bannerConfig.tagline}
                                onChange={(e) => onBannerConfigChange({ ...bannerConfig, tagline: e.target.value })}
                                placeholder="Tagline"
                            />
                        </div>

                        {/* Font — any Fontsource / Google font */}
                        <div className="space-y-2">
                            <Label htmlFor="banner-font">Font</Label>
                            <FontPicker
                                id="banner-font"
                                value={resolveBannerFont(bannerConfig)}
                                sampleText={`${bannerConfig.title}${bannerConfig.tagline}`}
                                onChange={({ fontId, family }) => onBannerConfigChange({ ...bannerConfig, font: family, fontId })}
                            />
                        </div>

                        {/* Background — hidden while the banner mirrors the icon background */}
                        {!bannerConfig.useIconBackground && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="banner-bg-gradient">Background Gradient</Label>
                                <Switch
                                    id="banner-bg-gradient"
                                    checked={bannerConfig.backgroundGradient}
                                    onCheckedChange={(checked: boolean) => onBannerConfigChange({ ...bannerConfig, backgroundGradient: checked })}
                                />
                            </div>

                            {!bannerConfig.backgroundGradient ? (
                                <div className="space-y-2">
                                    <Label htmlFor="banner-bg">Background Color</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="banner-bg"
                                            type="color"
                                            value={bannerConfig.backgroundColor}
                                            onChange={(e) => onBannerConfigChange({ ...bannerConfig, backgroundColor: e.target.value })}
                                            className="w-20 h-10"
                                        />
                                        <Input
                                            type="text"
                                            value={bannerConfig.backgroundColor}
                                            onChange={(e) => onBannerConfigChange({ ...bannerConfig, backgroundColor: e.target.value })}
                                            className="flex-1"
                                        />
                                    </div>
                                </div>
                            ) : (
                                <GradientStopsEditor
                                    idPrefix="banner-gradient"
                                    stops={bannerConfig.backgroundGradientStops}
                                    angle={bannerConfig.backgroundGradientAngle}
                                    onStopsChange={(stops) => onBannerConfigChange({ ...bannerConfig, backgroundGradientStops: stops })}
                                    onAngleChange={(angle) => onBannerConfigChange({ ...bannerConfig, backgroundGradientAngle: angle })}
                                    onRandomize={() => {
                                        const g = randomGradient();
                                        onBannerConfigChange({
                                            ...bannerConfig,
                                            backgroundGradientStops: g.stops,
                                            backgroundGradientAngle: g.angle,
                                        });
                                    }}
                                />
                            )}
                        </div>
                        )}

                        {/* Text Color */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="banner-text-color">Text Color</Label>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const isLight = bannerConfig.textColor.toLowerCase() === '#ffffff';
                                        onBannerConfigChange({
                                            ...bannerConfig,
                                            textColor: isLight ? '#0F172A' : '#FFFFFF',
                                        });
                                    }}
                                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                                    title="Flip between light and dark text"
                                >
                                    <Contrast className="h-3.5 w-3.5" />
                                    Invert
                                </button>
                            </div>
                            <div className="flex gap-2">
                                <Input
                                    id="banner-text-color"
                                    type="color"
                                    value={bannerConfig.textColor}
                                    onChange={(e) => onBannerConfigChange({ ...bannerConfig, textColor: e.target.value })}
                                    className="w-20 h-10"
                                />
                                <Input
                                    type="text"
                                    value={bannerConfig.textColor}
                                    onChange={(e) => onBannerConfigChange({ ...bannerConfig, textColor: e.target.value })}
                                    className="flex-1"
                                />
                            </div>
                        </div>

                        {/* Show Icon Toggle */}
                        <div className="flex items-center justify-between">
                            <Label htmlFor="banner-show-icon">Show Icon</Label>
                            <Switch
                                id="banner-show-icon"
                                checked={bannerConfig.showIcon}
                                onCheckedChange={(checked: boolean) => onBannerConfigChange({ ...bannerConfig, showIcon: checked })}
                            />
                        </div>

                        {/* Merge Icon (remove the icon's own background) */}
                        {bannerConfig.showIcon && (
                            <div className="flex items-center justify-between">
                                <div className="min-w-0 pr-3">
                                    <Label htmlFor="banner-merge-icon">Merge icon (no background)</Label>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        Drop the icon tile so the clipart blends into the banner.
                                    </p>
                                </div>
                                <Switch
                                    id="banner-merge-icon"
                                    checked={bannerConfig.removeIconBackground}
                                    onCheckedChange={(checked: boolean) => onBannerConfigChange({ ...bannerConfig, removeIconBackground: checked })}
                                />
                            </div>
                        )}

                        {/* Layout */}
                        <div className="space-y-2">
                            <Label>Layout</Label>
                            <ToggleGroup
                                type="single"
                                value={bannerConfig.layout}
                                onValueChange={(value) => { if (value) onBannerConfigChange({ ...bannerConfig, layout: value as 'horizontal' | 'vertical' }); }}
                                variant="outline"
                                className="w-full"
                            >
                                <ToggleGroupItem value="horizontal" className="flex-1 gap-2">
                                    <AlignHorizontalSpaceAround className="h-4 w-4" />
                                    Horizontal
                                </ToggleGroupItem>
                                <ToggleGroupItem value="vertical" className="flex-1 gap-2">
                                    <AlignVerticalSpaceAround className="h-4 w-4" />
                                    Vertical
                                </ToggleGroupItem>
                            </ToggleGroup>
                        </div>

                        {/* Icon Shape */}
                        <div className="space-y-2">
                            <Label>Icon Shape</Label>
                            <ToggleGroup
                                type="single"
                                value={bannerConfig.shape}
                                onValueChange={(value) => { if (value) onBannerConfigChange({ ...bannerConfig, shape: value as 'square' | 'squircle' | 'circle' }); }}
                                variant="outline"
                                className="w-full"
                            >
                                <ToggleGroupItem value="circle" className="flex-1 gap-2">
                                    <Circle className="h-4 w-4" />
                                    Circle
                                </ToggleGroupItem>
                                <ToggleGroupItem value="squircle" className="flex-1 gap-2">
                                    <RectangleHorizontal className="h-4 w-4 rounded" />
                                    Squircle
                                </ToggleGroupItem>
                                <ToggleGroupItem value="square" className="flex-1 gap-2">
                                    <Square className="h-4 w-4" />
                                    Square
                                </ToggleGroupItem>
                            </ToggleGroup>
                        </div>
                </TabsContent>
            </Tabs>
        </Card>
    );
}
