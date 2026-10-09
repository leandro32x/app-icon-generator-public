import { getFamilyForPrefix } from './iconifyCollections';
import { parseIconUrl } from './iconManager';
import { fetchCollections, type CollectionInfo } from './iconifyApi';
import type { ResolvedForeground } from './foreground';
import { getFontMeta, fontLicenseLabel, fontLicenseUrl, fontsourceUrl } from './fontsourceApi';

export interface AppDependency {
  name: string;
  version: string;
  license: string;
  url: string;
}

/** Who made the app, credited in the footer. */
export const AUTHOR_HANDLE = '@leandro32x';
export const AUTHOR_URL = 'https://github.com/leandro32x';

/**
 * OSS packages that end up in the production bundle (plus the build tools
 * whose output ships with it). Keep this in sync with what Vite actually
 * bundles, not with package.json: several shadcn primitives' dependencies
 * (recharts, vaul, embla…) are never imported and are tree-shaken away.
 * Transitive packages are grouped under the library that pulls them in.
 */
export const APP_DEPENDENCIES: AppDependency[] = [
  { name: 'React / React DOM', version: '19.2.3', license: 'MIT', url: 'https://github.com/facebook/react' },
  { name: '@iconify/react', version: '6.0.2', license: 'MIT', url: 'https://github.com/iconify/iconify' },
  { name: 'Radix UI primitives', version: '1.x – 2.x', license: 'MIT', url: 'https://github.com/radix-ui/primitives' },
  { name: 'Floating UI', version: '1.8.0', license: 'MIT', url: 'https://github.com/floating-ui/floating-ui' },
  { name: 'react-remove-scroll (+ use-sidecar, react-style-singleton, use-callback-ref, get-nonce)', version: '2.7.2', license: 'MIT', url: 'https://github.com/theKashey/react-remove-scroll' },
  { name: 'aria-hidden', version: '1.2.6', license: 'MIT', url: 'https://github.com/theKashey/aria-hidden' },
  { name: 'Ark UI (+ Zag.js)', version: '5.39.2', license: 'MIT', url: 'https://github.com/chakra-ui/ark' },
  { name: 'cmdk', version: '1.1.1', license: 'MIT', url: 'https://github.com/pacocoursey/cmdk' },
  { name: '@tanstack/react-virtual', version: '3.13.13', license: 'MIT', url: 'https://github.com/TanStack/virtual' },
  { name: 'lucide-react', version: '0.487.0', license: 'ISC', url: 'https://github.com/lucide-icons/lucide' },
  // Dual-licensed (MIT OR GPL-3.0-or-later); used under MIT.
  { name: 'JSZip', version: '3.10.1', license: 'MIT', url: 'https://github.com/Stuk/jszip' },
  { name: 'sonner', version: '2.0.7', license: 'MIT', url: 'https://github.com/emilkowalski/sonner' },
  { name: 'class-variance-authority', version: '0.7.1', license: 'Apache-2.0', url: 'https://github.com/joe-bell/cva' },
  { name: 'clsx', version: '2.1.1', license: 'MIT', url: 'https://github.com/lukeed/clsx' },
  { name: 'tailwind-merge', version: '3.4.0', license: 'MIT', url: 'https://github.com/dcastil/tailwind-merge' },
  { name: 'tslib', version: '2.8.1', license: '0BSD', url: 'https://github.com/microsoft/tslib' },
  { name: '@vercel/analytics', version: '2.0.1', license: 'MIT', url: 'https://github.com/vercel/analytics' },
  { name: '@vercel/speed-insights', version: '2.0.0', license: 'Apache-2.0', url: 'https://github.com/vercel/speed-insights' },
  { name: 'shadcn/ui', version: '—', license: 'MIT', url: 'https://github.com/shadcn-ui/ui' },
  { name: 'Tailwind CSS', version: '4.1.18', license: 'MIT', url: 'https://github.com/tailwindlabs/tailwindcss' },
  { name: 'Vite', version: '6.3.5', license: 'MIT', url: 'https://github.com/vitejs/vite' },
];

/**
 * Generate the content of the ATTRIBUTION.md file that is included in every
 * exported icon ZIP.
 *
 * Icon foregrounds: license data is resolved dynamically from the Iconify API
 * (already cached in memory after the first fetch in the session), with our
 * local StyleFamily registry used as a fallback for the bundled families.
 * Text foregrounds: the font's license comes from the Fontsource catalog.
 * Image foregrounds: the artwork is the user's own, so only a rights reminder
 * is written.
 */
export async function generateAttributionContent(
  iconUrl: string | null,
  foreground?: ResolvedForeground | null,
): Promise<string> {
  const lines: string[] = [];

  lines.push('# Attribution & Licenses');
  lines.push('');
  lines.push('These app icons were generated with App Icon Generator.');
  lines.push('');

  if (foreground?.kind === 'text') {
    await appendFontSection(lines, foreground);
  } else if (foreground?.kind === 'image') {
    appendCustomImageSection(lines, foreground);
  } else {
    await appendIconPackSection(lines, iconUrl);
  }

  lines.push('');

  // ── Tool Dependencies Section ──────────────────────────────────────────────
  lines.push('## App Icon Generator — Open Source Dependencies');
  lines.push('');
  lines.push('| Library | Version | License |');
  lines.push('|---------|---------|---------|');
  for (const dep of APP_DEPENDENCIES) {
    lines.push(`| [${dep.name}](${dep.url}) | ${dep.version} | ${dep.license} |`);
  }

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(
    '> **Trademark notice:** App icons based on brand or product logos may be subject to trademark restrictions independent of the icon pack license. Verify usage rights with the respective brand owners before publishing.',
  );
  lines.push('');

  return lines.join('\n');
}

async function appendIconPackSection(lines: string[], iconUrl: string | null): Promise<void> {
  const parsed = parseIconUrl(iconUrl);
  // parseIconUrl returns { source, name } — "source" is the Iconify prefix.
  const prefix = parsed?.source ?? null;
  const iconName = parsed?.name ?? null;

  // Live data from Iconify API (module-level cache — fast after first load).
  let apiCollection: CollectionInfo | null = null;
  if (prefix) {
    try {
      const collections = await fetchCollections();
      apiCollection = collections[prefix] ?? null;
    } catch {
      // Offline or API unavailable — fall back to local registry below.
    }
  }

  // Local StyleFamily registry (only covers the 5 bundled families).
  const family = prefix ? getFamilyForPrefix(prefix) : null;

  // ── Icon Pack Section ──────────────────────────────────────────────────────
  lines.push('## Icon Pack Used');
  lines.push('');

  if (apiCollection || family) {
    const packName = apiCollection?.name ?? family?.label ?? prefix ?? 'Unknown';
    const authorName = apiCollection?.author?.name ?? family?.license.author;
    const authorUrl = apiCollection?.author?.url ?? family?.license.authorUrl;
    const licenseTitle = apiCollection?.license?.title ?? family?.license.name;
    const licenseSpdx = apiCollection?.license?.spdx ?? family?.license.spdx;
    const licenseUrl = apiCollection?.license?.url ?? family?.license.url;
    const commercial = family?.license.commercial;
    const attributionRequired = family?.license.attributionRequired;

    if (iconName && prefix) {
      lines.push(`**Icon:** \`${prefix}:${iconName}\``);
      lines.push('');
    }

    lines.push(`**Pack:** ${packName}`);
    if (prefix) lines.push(`**Prefix:** \`${prefix}\``);
    lines.push('');

    if (authorName) {
      lines.push(`- Author: ${authorUrl ? `[${authorName}](${authorUrl})` : authorName}`);
    }

    if (licenseTitle || licenseSpdx) {
      const licText = [licenseTitle, licenseSpdx ? `(${licenseSpdx})` : ''].filter(Boolean).join(' ');
      lines.push(`- License: ${licenseUrl ? `[${licText}](${licenseUrl})` : licText}`);
    }

    if (commercial !== undefined) {
      lines.push(`- Commercial use: ${commercial ? 'Permitted' : 'Not permitted'}`);
    }

    if (attributionRequired !== undefined) {
      lines.push(`- Attribution required: ${attributionRequired ? 'Yes' : 'No'}`);
      if (attributionRequired && authorName) {
        lines.push('');
        lines.push(
          `> When distributing an app using these icons, you must credit "${authorName}"${authorUrl ? ` (<${authorUrl}>)` : ''}.`,
        );
      }
    }

    if (prefix && !licenseTitle && !licenseSpdx) {
      lines.push('');
      lines.push(
        `Please verify the license for the \`${prefix}\` icon pack at: <https://icon-sets.iconify.design/${prefix}/>`,
      );
    }
  } else if (prefix) {
    lines.push(`**Pack prefix:** \`${prefix}\``);
    lines.push('');
    lines.push(
      `Please verify the license for this icon pack at: <https://icon-sets.iconify.design/${prefix}/>`,
    );
  } else {
    lines.push('Icon pack information could not be determined.');
    lines.push('');
    lines.push('Please check the license of the icon pack you used before distribution.');
  }
}

async function appendFontSection(
  lines: string[],
  fg: Extract<ResolvedForeground, { kind: 'text' }>,
): Promise<void> {
  const meta = await getFontMeta(fg.fontId);
  const sourceUrl = fontsourceUrl(fg.fontId);

  lines.push('## Font Used');
  lines.push('');
  lines.push(`**Font:** ${fg.family}`);
  lines.push(`**Fontsource id:** \`${fg.fontId}\``);
  lines.push(`**Style:** weight ${fg.weight}${fg.italic ? ', italic' : ''}`);
  lines.push('');
  lines.push(`- Source: <${sourceUrl}>${meta?.type === 'google' ? ' (Google Fonts)' : ''}`);

  if (meta?.license) {
    lines.push(`- License: [${fontLicenseLabel(meta.license)} (${meta.license})](${fontLicenseUrl(meta.license)})`);
    if (meta.license.startsWith('OFL')) {
      lines.push(
        '- The SIL Open Font License permits free use in commercial products; the font files themselves may not be sold on their own.',
      );
    }
  } else {
    lines.push(`- License: could not be determined offline — please verify at <${sourceUrl}>`);
  }
  lines.push('');
  lines.push(
    'The text was rasterized into the exported PNGs; no font files are included in this package.',
  );
}

function appendCustomImageSection(
  lines: string[],
  fg: Extract<ResolvedForeground, { kind: 'image' }>,
): void {
  lines.push('## Custom Image');
  lines.push('');
  lines.push(`**Foreground:** user-supplied image${fg.name ? ` (\`${fg.name}\`)` : ''}`);
  lines.push('');
  lines.push(
    '- The foreground artwork was uploaded by the person who generated these icons. No icon-pack license applies to it.',
  );
  lines.push(
    '- Make sure you hold the rights to use this artwork (and any logos it contains) as an app icon before publishing.',
  );
}
