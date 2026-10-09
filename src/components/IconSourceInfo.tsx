import { useEffect, useState } from 'react';
import { TriangleAlert } from 'lucide-react';
import { parseIconUrl } from '../utils/iconManager';
import { fetchCollections, type CollectionInfo } from '../utils/iconifyApi';
import { getFamilyForPrefix } from '../utils/iconifyCollections';
import type { ResolvedForeground } from '../utils/foreground';
import {
  getFontMeta,
  fontLicenseLabel,
  fontLicenseUrl,
  fontsourceUrl,
  type FontMeta,
} from '../utils/fontsourceApi';
import { Badge } from './ui/badge';

interface IconSourceInfoProps {
  /** The currently selected icon, e.g. `iconify:lucide:alarm-clock`. */
  iconUrl: string | null;
  /** Resolved foreground; when it is an image or text the strip describes that instead of an icon pack. */
  foreground?: ResolvedForeground | null;
}

/**
 * Compact provenance + license strip for the current foreground.
 *
 * Icons: license data is resolved from the Iconify collections API
 * (module-level cache — instant after the first session fetch), with the
 * local `STYLE_FAMILIES` registry as a fallback for the bundled families.
 * Text: font family + license from the Fontsource catalog. Both mirror the
 * resolution order used by `generateAttributionContent` so the on-screen
 * info matches what ends up in the exported `ATTRIBUTION.md`.
 */
export function IconSourceInfo({ iconUrl, foreground }: IconSourceInfoProps) {
  if (foreground?.kind === 'text') {
    return <FontSourceInfo fontId={foreground.fontId} family={foreground.family} />;
  }
  if (foreground?.kind === 'image') {
    return <CustomImageInfo name={foreground.name} hasAlpha={foreground.hasAlpha} />;
  }
  return <IconPackInfo iconUrl={iconUrl} />;
}

function IconPackInfo({ iconUrl }: { iconUrl: string | null }) {
  const parsed = parseIconUrl(iconUrl);
  const prefix = parsed?.source ?? null;
  const iconName = parsed?.name ?? null;

  const [collection, setCollection] = useState<CollectionInfo | null>(null);

  useEffect(() => {
    if (!prefix) {
      setCollection(null);
      return;
    }
    let cancelled = false;
    fetchCollections()
      .then((cols) => {
        if (!cancelled) setCollection(cols[prefix] ?? null);
      })
      .catch(() => {
        // Offline / API unavailable — fall back to the local registry below.
        if (!cancelled) setCollection(null);
      });
    return () => {
      cancelled = true;
    };
  }, [prefix]);

  if (!prefix || !iconName) return null;

  const family = getFamilyForPrefix(prefix);
  const packName = collection?.name ?? family?.label ?? prefix;
  const authorName = collection?.author?.name ?? family?.license.author;
  const licenseTitle = collection?.license?.title ?? family?.license.name;
  const licenseSpdx = collection?.license?.spdx ?? family?.license.spdx;
  const licenseUrl = collection?.license?.url ?? family?.license.url;
  const sourceUrl = `https://icon-sets.iconify.design/${prefix}/`;
  const licenseLabel = licenseSpdx ?? licenseTitle ?? null;

  return (
    <div className="mt-6 pt-6 border-t border-border">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Source</p>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-foreground hover:underline underline-offset-2 truncate block"
            title={`View ${packName} on Iconify`}
          >
            {packName}
          </a>
          <p className="text-xs text-muted-foreground truncate">
            <span className="font-mono">{prefix}:{iconName}</span>
            {authorName ? ` · by ${authorName}` : ''}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">License</p>
          {licenseLabel ? (
            licenseUrl ? (
              <a href={licenseUrl} target="_blank" rel="noopener noreferrer" title={licenseTitle ?? licenseLabel}>
                <Badge variant="secondary" className="cursor-pointer">{licenseLabel}</Badge>
              </a>
            ) : (
              <Badge variant="secondary" title={licenseTitle ?? licenseLabel}>{licenseLabel}</Badge>
            )
          ) : (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" title="Verify license on Iconify">
              <Badge variant="outline" className="cursor-pointer">Unknown</Badge>
            </a>
          )}
        </div>
      </div>

      {family?.isBrandPack && (
        <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
          <span>
            Brand/logo packs may carry trademark restrictions beyond the icon-pack license. Verify usage rights with the brand owner before publishing.
          </span>
        </div>
      )}
    </div>
  );
}

function FontSourceInfo({ fontId, family }: { fontId: string; family: string }) {
  const [meta, setMeta] = useState<FontMeta | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFontMeta(fontId).then((m) => {
      if (!cancelled) setMeta(m);
    });
    return () => {
      cancelled = true;
    };
  }, [fontId]);

  const sourceUrl = fontsourceUrl(fontId);
  const license = meta?.license || null;

  return (
    <div className="mt-6 pt-6 border-t border-border">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Font</p>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-foreground hover:underline underline-offset-2 truncate block"
            title={`View ${family} on Fontsource`}
            style={{ fontFamily: `"${family}", sans-serif` }}
          >
            {family}
          </a>
          <p className="text-xs text-muted-foreground truncate">
            <span className="font-mono">{fontId}</span>
            {' · via Fontsource'}
            {meta?.type === 'google' ? ' · Google Fonts' : ''}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">License</p>
          {license ? (
            <a href={fontLicenseUrl(license)} target="_blank" rel="noopener noreferrer" title={fontLicenseLabel(license)}>
              <Badge variant="secondary" className="cursor-pointer">{license}</Badge>
            </a>
          ) : (
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer" title="Verify license on Fontsource">
              <Badge variant="outline" className="cursor-pointer">Unknown</Badge>
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function CustomImageInfo({ name, hasAlpha }: { name: string | null; hasAlpha: boolean }) {
  return (
    <div className="mt-6 pt-6 border-t border-border">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Source</p>
          <p className="text-sm font-medium text-foreground truncate" title={name ?? undefined}>
            {name ?? 'Custom image'}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            Uploaded by you{hasAlpha ? '' : ' · no transparency'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1">License</p>
          <Badge variant="outline" title="You are responsible for the rights to this artwork">Your own</Badge>
        </div>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Make sure you hold the rights to use this artwork as an app icon. No icon-pack attribution is added for it.
      </p>
    </div>
  );
}
