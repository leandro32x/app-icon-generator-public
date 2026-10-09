/**
 * Iconify-backed unified icon manager.
 *
 * Every icon in the app is now identified by a `prefix:name` id (e.g.
 * "lucide:alarm-clock") resolved through Iconify. This module adapts the
 * `<Icon>` component from `@iconify/react` into a component that accepts the
 * props the rest of the app already passes (`size`, `color`, `strokeWidth`,
 * `style`, `className`) so the existing render/export pipeline keeps working
 * without per-source branches.
 *
 * Persisted icon URL format:
 *   - New:    `iconify:<prefix>:<name>`   e.g. `iconify:lucide:alarm-clock`
 *   - Legacy: `icon:<PascalName>:<source>` — migrated via `legacyToIconifyId`.
 */

import React, { forwardRef } from 'react';
import { Icon as IconifyIcon, loadIcon as iconifyLoadIcon } from '@iconify/react';

// --- Types --------------------------------------------------------------

/** Iconify collection prefix (e.g. "lucide", "mdi", "ph-fill"). */
export type IconSource = string;

/**
 * React component rendering a single icon. Kept as a general
 * `React.ComponentType<any>` so existing call sites in IconPreview /
 * IconTile / DownloadPanel / BannerPreview continue to work.
 */
export type UnifiedIcon = React.ComponentType<any>;

export interface IconOption {
  /** Icon name within its collection (no prefix). */
  name: string;
  /** Ready-to-render adapter component. */
  icon: UnifiedIcon;
  /** Deterministic accent color derived from the icon id. */
  color: string;
  /** Iconify prefix this icon belongs to. */
  source: IconSource;
}

// --- Deterministic color palette ----------------------------------------
// Re-used from the previous lucide/phosphor/solar helpers so generated
// swatches stay visually consistent after migration.

const COLOR_PALETTE = [
  '#3B82F6', '#8B5CF6', '#EC4899', '#F43F5E', '#F97316', '#F59E0B',
  '#EAB308', '#84CC16', '#22C55E', '#10B981', '#14B8A6', '#06B6D4',
  '#0EA5E9', '#6366F1', '#A855F7', '#D946EF', '#EF4444', '#DC2626',
  '#7C3AED', '#2563EB', '#0891B2', '#059669', '#65A30D', '#CA8A04',
  '#EA580C', '#DB2777', '#9333EA', '#4F46E5', '#0D9488',
];

export function generateColor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  return COLOR_PALETTE[Math.abs(hash) % COLOR_PALETTE.length];
}

// --- Icon component adapter ---------------------------------------------

/**
 * Translate the legacy icon-component prop contract
 * (`size`, `color`, `strokeWidth`, `style`, `className`, `weight`) onto
 * `@iconify/react`'s <Icon>. Collapsing these into one component lets the
 * rest of the codebase stay source-agnostic.
 */
function makeIconifyComponent(iconifyId: string): UnifiedIcon {
  const Comp = forwardRef<SVGSVGElement, any>(function IconifyAdapter(props, ref) {
    const {
      size,
      width,
      height,
      color,
      strokeWidth,
      style,
      className,
      // Consumed by the legacy API but not used by Iconify.
      weight: _weight,
      ...rest
    } = props;

    const resolvedWidth = width ?? size ?? '1em';
    const resolvedHeight = height ?? size ?? '1em';

    // Lucide-style `strokeWidth` is exposed via inline CSS so stroke-based
    // icons respect it without Iconify-specific hooks.
    const mergedStyle: React.CSSProperties = { ...(style ?? {}) };
    if (strokeWidth !== undefined && mergedStyle.strokeWidth === undefined) {
      mergedStyle.strokeWidth = strokeWidth as any;
    }

    return (
      <IconifyIcon
        ref={ref as any}
        icon={iconifyId}
        width={resolvedWidth}
        height={resolvedHeight}
        color={color}
        style={mergedStyle}
        className={className}
        {...rest}
      />
    );
  });
  Comp.displayName = `Iconify(${iconifyId})`;
  return Comp;
}

// Cache adapter components per iconify id so React reconciliation sees a
// stable component reference across renders. Bounded in case the picker
// scrolls through many collections in one session.
const adapterCache = new Map<string, UnifiedIcon>();
const ADAPTER_CACHE_MAX = 2000;

export function getIconComponent(iconifyId: string): UnifiedIcon {
  const cached = adapterCache.get(iconifyId);
  if (cached) return cached;
  if (adapterCache.size >= ADAPTER_CACHE_MAX) {
    const firstKey = adapterCache.keys().next().value;
    if (firstKey) adapterCache.delete(firstKey);
  }
  const adapter = makeIconifyComponent(iconifyId);
  adapterCache.set(iconifyId, adapter);
  return adapter;
}

/** Preload a single icon's SVG data through Iconify's loader. */
export function loadIcon(iconifyId: string): Promise<unknown> {
  return iconifyLoadIcon(iconifyId);
}

// --- Unified API (back-compat surface) ----------------------------------

/**
 * Resolve an icon component for a given name + source (Iconify prefix).
 * Always returns an adapter — Iconify handles missing icons gracefully by
 * showing an empty placeholder.
 */
export function findIconByNameAndSource(
  name: string,
  source: IconSource,
): UnifiedIcon | null {
  if (!name || !source) return null;
  return getIconComponent(`${source}:${name}`);
}

// --- URL parsing / migration --------------------------------------------

/**
 * Parse an icon URL into `{ name, source }`.
 *
 * Supports:
 *   - `iconify:<prefix>:<name>`         (new)
 *   - `icon:<PascalName>[:<source>]`    (legacy lucide/phosphor/solar)
 * Legacy URLs are routed through `legacyToIconifyId` to return Iconify ids.
 */
export function parseIconUrl(
  iconUrl: string | null | undefined,
): { name: string; source: IconSource } | null {
  if (!iconUrl) return null;

  if (iconUrl.startsWith('iconify:')) {
    const rest = iconUrl.slice('iconify:'.length);
    const colon = rest.indexOf(':');
    if (colon <= 0) return null;
    return {
      source: rest.slice(0, colon),
      name: rest.slice(colon + 1),
    };
  }

  if (iconUrl.startsWith('icon:')) {
    const migrated = legacyToIconifyId(iconUrl);
    if (!migrated) return null;
    const colon = migrated.indexOf(':');
    if (colon <= 0) return null;
    return { source: migrated.slice(0, colon), name: migrated.slice(colon + 1) };
  }

  return null;
}

/** Build the new Iconify-style URL for an icon. */
export function createIconUrl(name: string, source: IconSource): string {
  return `iconify:${source}:${name}`;
}

// --- Legacy session migration -------------------------------------------

const LEGACY_PHOSPHOR_STYLE_TO_PREFIX: Record<string, string> = {
  regular: 'ph',
  thin: 'ph-thin',
  light: 'ph-light',
  bold: 'ph-bold',
  fill: 'ph-fill',
  duotone: 'ph-duotone',
};

const LEGACY_SOLAR_STYLE_TO_PREFIX: Record<string, string> = {
  Outline: 'solar-outline',
  Linear: 'solar',
  Bold: 'solar-bold',
  BoldDuotone: 'solar-bold-duotone',
  Broken: 'solar-broken',
  LineDuotone: 'solar-line-duotone',
};

// Known Solar style suffixes that were baked into component names (e.g.
// `HomeBoldDuotone`). Ordered longest-first so we strip the most specific
// suffix before its prefixes.
const SOLAR_NAME_SUFFIXES = [
  'BoldDuotone', 'LineDuotone',
  'Outline', 'Linear', 'Broken', 'Bold',
];

/** Convert `PascalCase` → `kebab-case` (best-effort). */
function pascalToKebab(input: string): string {
  return input
    // Handle runs of uppercase letters before a lowercase letter, e.g.
    // `AArrowDown` → `A-ArrowDown` → `a-arrow-down`.
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

/**
 * Best-effort migration of the legacy `icon:<Name>[:<source>]` URL format
 * onto a modern Iconify id string (no `iconify:` prefix).
 * Returns `null` when the input can't be confidently mapped.
 *
 * NOTE: This does not attempt to verify the resolved id actually exists on
 * Iconify — that's OK, the renderer will simply show an empty placeholder if
 * it doesn't, and the user can pick a new icon.
 */
export function legacyToIconifyId(
  iconUrl: string,
  legacyStyle?: string,
): string | null {
  if (!iconUrl.startsWith('icon:')) return null;
  const body = iconUrl.slice('icon:'.length);
  const parts = body.split(':');
  const pascalName = parts[0];
  const legacySource = (parts[1] as 'lucide' | 'phosphor' | 'solar' | undefined) ?? 'lucide';
  if (!pascalName) return null;

  if (legacySource === 'lucide') {
    return `lucide:${pascalToKebab(pascalName)}`;
  }

  if (legacySource === 'phosphor') {
    const prefix = LEGACY_PHOSPHOR_STYLE_TO_PREFIX[legacyStyle ?? 'regular'] ?? 'ph';
    return `${prefix}:${pascalToKebab(pascalName)}`;
  }

  if (legacySource === 'solar') {
    // Strip baked-in style suffix so the base name aligns with Iconify's
    // per-variant collections.
    let baseName = pascalName;
    for (const suffix of SOLAR_NAME_SUFFIXES) {
      if (baseName.endsWith(suffix) && baseName.length > suffix.length) {
        baseName = baseName.slice(0, -suffix.length);
        break;
      }
    }
    const prefix = LEGACY_SOLAR_STYLE_TO_PREFIX[legacyStyle ?? 'Outline'] ?? 'solar';
    return `${prefix}:${pascalToKebab(baseName)}`;
  }

  return null;
}

/**
 * Convert a legacy icon URL to the new persisted `iconify:` form, using a
 * legacy style string when supplied (required to disambiguate ph/ph-fill/
 * solar/solar-bold etc.). Returns the original URL if already migrated.
 */
export function migrateLegacyIconUrl(
  iconUrl: string | null | undefined,
  legacyStyle?: string,
): string | null {
  if (!iconUrl) return null;
  if (iconUrl.startsWith('iconify:')) return iconUrl;
  const id = legacyToIconifyId(iconUrl, legacyStyle);
  return id ? `iconify:${id}` : null;
}
