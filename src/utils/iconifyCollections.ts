/**
 * Style-family registry for Iconify collections.
 *
 * Many Iconify collections are published as several prefixes that share the
 * same icon names but differ in visual style (stroke vs filled, duotone,
 * etc.). Treating those prefixes as a single "source" with a style selector
 * preserves the existing UX from the lucide/phosphor/solar era.
 *
 * For collections outside this registry the style selector is hidden (see
 * `getStyleOptionsForPrefix`), since most Iconify collections ship as a
 * single prefix without sibling variants.
 */

export interface StyleVariant {
  /** Iconify collection prefix for this variant, e.g. "ph-fill". */
  prefix: string;
  /** User-facing label, e.g. "Fill". */
  label: string;
}

export interface FamilyLicense {
  /** SPDX identifier, e.g. "MIT", "Apache-2.0", "CC-BY-4.0". */
  spdx: string;
  /** Human-readable license name. */
  name: string;
  /** URL to the full license text. */
  url: string;
  /** Author / organisation name. */
  author: string;
  /** URL to the project homepage or repository. */
  authorUrl: string;
  /** Whether commercial use is explicitly permitted. */
  commercial: boolean;
  /** Whether the license requires attribution in derivative works. */
  attributionRequired: boolean;
}

export interface StyleFamily {
  /** Internal family id, used as a stable key in UI state. */
  id: string;
  /** User-facing family label, e.g. "Phosphor". */
  label: string;
  /** Ordered list of variants. The first entry is the family default. */
  variants: StyleVariant[];
  /** License information for this icon family. */
  license: FamilyLicense;
  /**
   * Set to true for packs that consist of brand / trademark logos (e.g.
   * Simple Icons). Triggers a trademark-restriction warning in the UI.
   */
  isBrandPack?: boolean;
}

export const STYLE_FAMILIES: StyleFamily[] = [
  {
    id: 'phosphor',
    label: 'Phosphor',
    variants: [
      { prefix: 'ph', label: 'Regular' },
      { prefix: 'ph-thin', label: 'Thin' },
      { prefix: 'ph-light', label: 'Light' },
      { prefix: 'ph-bold', label: 'Bold' },
      { prefix: 'ph-fill', label: 'Fill' },
      { prefix: 'ph-duotone', label: 'Duotone' },
    ],
    license: {
      spdx: 'MIT',
      name: 'MIT License',
      url: 'https://github.com/phosphor-icons/core/blob/main/LICENSE',
      author: 'Phosphor Icons',
      authorUrl: 'https://phosphoricons.com',
      commercial: true,
      attributionRequired: false,
    },
  },
  {
    id: 'solar',
    label: 'Solar',
    variants: [
      { prefix: 'solar', label: 'Linear' },
      { prefix: 'solar-outline', label: 'Outline' },
      { prefix: 'solar-bold', label: 'Bold' },
      { prefix: 'solar-broken', label: 'Broken' },
      { prefix: 'solar-line-duotone', label: 'Line Duotone' },
      { prefix: 'solar-bold-duotone', label: 'Bold Duotone' },
    ],
    license: {
      spdx: 'CC-BY-4.0',
      name: 'Creative Commons Attribution 4.0',
      url: 'https://creativecommons.org/licenses/by/4.0/',
      author: '480 Design',
      authorUrl: 'https://www.figma.com/community/file/1166831539721848736',
      commercial: true,
      attributionRequired: true,
    },
  },
  {
    id: 'material-symbols',
    label: 'Material Symbols',
    variants: [
      { prefix: 'material-symbols', label: 'Rounded Filled' },
      { prefix: 'material-symbols-outlined', label: 'Outlined' },
      { prefix: 'material-symbols-rounded', label: 'Rounded' },
      { prefix: 'material-symbols-sharp', label: 'Sharp' },
      { prefix: 'material-symbols-light', label: 'Light' },
      { prefix: 'material-symbols-light-outline', label: 'Light Outlined' },
      { prefix: 'material-symbols-light-rounded', label: 'Light Rounded' },
      { prefix: 'material-symbols-light-sharp', label: 'Light Sharp' },
    ],
    license: {
      spdx: 'Apache-2.0',
      name: 'Apache License 2.0',
      url: 'https://www.apache.org/licenses/LICENSE-2.0',
      author: 'Google',
      authorUrl: 'https://fonts.google.com/icons',
      commercial: true,
      attributionRequired: false,
    },
  },
  {
    id: 'fluent',
    label: 'Fluent UI',
    variants: [
      { prefix: 'fluent', label: 'Default' },
      { prefix: 'fluent-color', label: 'Color' },
    ],
    license: {
      spdx: 'MIT',
      name: 'MIT License',
      url: 'https://github.com/microsoft/fluentui-system-icons/blob/main/LICENSE',
      author: 'Microsoft',
      authorUrl: 'https://github.com/microsoft/fluentui-system-icons',
      commercial: true,
      attributionRequired: false,
    },
  },
  {
    id: 'heroicons',
    label: 'Heroicons',
    variants: [
      { prefix: 'heroicons', label: 'Outline' },
      { prefix: 'heroicons-solid', label: 'Solid' },
      { prefix: 'heroicons-mini', label: 'Mini' },
    ],
    license: {
      spdx: 'MIT',
      name: 'MIT License',
      url: 'https://github.com/tailwindlabs/heroicons/blob/master/LICENSE',
      author: 'Tailwind Labs',
      authorUrl: 'https://heroicons.com',
      commercial: true,
      attributionRequired: false,
    },
  },
];

/** Reverse index: prefix → { family, variant }. */
const PREFIX_INDEX: Map<string, { family: StyleFamily; variant: StyleVariant }> = (() => {
  const m = new Map<string, { family: StyleFamily; variant: StyleVariant }>();
  for (const family of STYLE_FAMILIES) {
    for (const variant of family.variants) {
      m.set(variant.prefix, { family, variant });
    }
  }
  return m;
})();

export function getFamilyForPrefix(prefix: string): StyleFamily | null {
  return PREFIX_INDEX.get(prefix)?.family ?? null;
}

export function getVariantForPrefix(prefix: string): StyleVariant | null {
  return PREFIX_INDEX.get(prefix)?.variant ?? null;
}

/**
 * Return the list of style variants for a prefix, or an empty array when the
 * prefix is not part of a multi-variant family. The picker uses this to
 * decide whether to render the style selector.
 */
export function getStyleOptionsForPrefix(prefix: string): StyleVariant[] {
  const family = getFamilyForPrefix(prefix);
  return family ? family.variants : [];
}

/** Default prefix to select on first load. */
export const DEFAULT_PREFIX = 'lucide';
