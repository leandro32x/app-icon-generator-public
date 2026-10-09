import { useState, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { ScrollArea } from './ui/scroll-area';
import { TriangleAlert } from 'lucide-react';
import { STYLE_FAMILIES, getFamilyForPrefix } from '../utils/iconifyCollections';
import { fetchCollections, type CollectionInfo } from '../utils/iconifyApi';
import {
  getDisabledSpdxCodes,
  setLicenseEnabled,
  subscribeToPackFilter,
  getFilterVersion,
} from '../utils/packFilterStore';

interface LicenseGroup {
  spdx: string;
  name: string;
  url?: string;
  commercial?: boolean;
  attributionRequired?: boolean;
  /** How many packs use this license (for sorting). */
  count: number;
  /** Representative pack names (truncated for display). */
  packs: string[];
}

interface PackSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Derives commercial-use permission from a SPDX identifier.
 * Creative Commons Non-Commercial variants (CC-*-NC-* / CC-*-NC) are the
 * only widely-used open-source licenses that explicitly prohibit commercial
 * use. Everything else (MIT, Apache, CC-BY, OFL, GPL…) is considered
 * commercially permissive for this badge.
 * Returns undefined for unrecognised or ambiguous codes.
 */
function inferCommercialFromSpdx(spdx: string): boolean | undefined {
  const upper = spdx.toUpperCase();
  if (upper.startsWith('CC-')) {
    // Any CC license with "-NC" in it prohibits commercial use.
    return !upper.includes('-NC');
  }
  // MIT, Apache, ISC, BSD, OFL, GPL, LGPL, MPL, EUPL, Artistic, Zlib…
  // All well-known permissive/copyleft licenses allow commercial use.
  const knownPermissive = /^(MIT|APACHE|ISC|BSD|OFL|GPL|LGPL|MPL|EUPL|CDDL|EPL|ARTISTIC|ZLIB|WTFPL|UNLICENSED|0BSD)/i;
  if (knownPermissive.test(upper)) return true;
  return undefined;
}

export function PackSettingsDialog({ open, onOpenChange }: PackSettingsDialogProps) {
  const filterVersion = useSyncExternalStore(subscribeToPackFilter, getFilterVersion);
  const disabledSpdx = useMemo(() => getDisabledSpdxCodes(), [filterVersion]);

  const [apiCollections, setApiCollections] = useState<Record<string, CollectionInfo> | null>(null);
  const [loadingCollections, setLoadingCollections] = useState(false);

  // Fetch the full Iconify collection catalogue once the dialog is first opened.
  useEffect(() => {
    if (!open || apiCollections !== null || loadingCollections) return;
    setLoadingCollections(true);
    fetchCollections()
      .then((data) => setApiCollections(data))
      .catch(() => setApiCollections({}))
      .finally(() => setLoadingCollections(false));
  }, [open, apiCollections, loadingCollections]);

  // Build one row per unique SPDX code across all known packs.
  const licenseGroups = useMemo<LicenseGroup[]>(() => {
    // Keyed by SPDX code.
    const map = new Map<string, LicenseGroup>();

    // 1. Seed from STYLE_FAMILIES — authoritative for commercial / attribution info.
    for (const family of STYLE_FAMILIES) {
      const { spdx, name, url, commercial, attributionRequired } = family.license;
      if (!map.has(spdx)) {
        map.set(spdx, { spdx, name, url, commercial, attributionRequired, count: 0, packs: [] });
      }
      const g = map.get(spdx)!;
      g.count++;
      g.packs.push(family.label);
    }

    // 2. Augment with every API collection that carries an SPDX identifier.
    if (apiCollections) {
      for (const [prefix, info] of Object.entries(apiCollections)) {
        // Skip variant prefixes already counted via STYLE_FAMILIES.
        if (getFamilyForPrefix(prefix)) continue;

        const spdx = info.license?.spdx;
        if (!spdx) continue; // no SPDX = uncontrolled, cannot be filtered

        if (!map.has(spdx)) {
          map.set(spdx, {
            spdx,
            name: info.license?.title ?? spdx,
            url: info.license?.url,
            commercial: inferCommercialFromSpdx(spdx),
            count: 0,
            packs: [],
          });
        }
        const g = map.get(spdx)!;
        g.count++;
        // Keep at most 8 example pack names per group to avoid huge tooltips.
        if (g.packs.length < 8) g.packs.push(info.name ?? prefix);
      }
    }

    // Sort: most packs first, then alphabetically by SPDX code.
    return [...map.values()].sort((a, b) => b.count - a.count || a.spdx.localeCompare(b.spdx));
  }, [apiCollections]);

  const allDisabled = licenseGroups.length > 0 && licenseGroups.every((g) => disabledSpdx.has(g.spdx));

  const handleToggle = (spdx: string, value: boolean) => {
    setLicenseEnabled(spdx, value);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Icon Pack Settings</DialogTitle>
          <DialogDescription>
            Control which icon packs appear in the picker by enabling or disabling their
            license type. All packs sharing a license are toggled together.
          </DialogDescription>
        </DialogHeader>

        {allDisabled && (
          <Alert variant="destructive">
            <TriangleAlert className="h-4 w-4" />
            <AlertDescription>
              All licenses are disabled — the icon picker will be empty. Enable at least one.
            </AlertDescription>
          </Alert>
        )}

        {loadingCollections && (
          <p className="text-sm text-muted-foreground text-center py-2">Loading license data…</p>
        )}

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-3 pr-3">
            {licenseGroups.map((group) => {
              const isEnabled = !disabledSpdx.has(group.spdx);
              const packsLabel = group.count > group.packs.length
                ? `${group.packs.join(', ')} + ${group.count - group.packs.length} more`
                : group.packs.join(', ');
              return (
                <div
                  key={group.spdx}
                  className="flex items-start gap-3 rounded-lg border border-border p-4 bg-card"
                >
                  <Switch
                    id={`license-${group.spdx}`}
                    checked={isEnabled}
                    onCheckedChange={(val) => handleToggle(group.spdx, val)}
                    className="mt-0.5 shrink-0"
                  />

                  <div className="flex-1 min-w-0">
                    <label
                      htmlFor={`license-${group.spdx}`}
                      className="font-medium text-sm text-foreground cursor-pointer"
                    >
                      {group.url ? (
                        <a
                          href={group.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {group.name}
                        </a>
                      ) : group.name}
                    </label>

                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Badge variant="secondary" className="text-xs font-mono">
                        {group.spdx}
                      </Badge>
                      {group.commercial === true && (
                        <Badge variant="secondary" className="text-xs text-green-700 dark:text-green-400">
                          Commercial ✓
                        </Badge>
                      )}
                      {group.commercial === false && (
                        <Badge variant="destructive" className="text-xs">
                          No commercial use
                        </Badge>
                      )}
                      {group.attributionRequired && (
                        <Badge variant="outline" className="text-xs text-amber-700 dark:text-amber-400">
                          Attribution required
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        {group.count} {group.count === 1 ? 'pack' : 'packs'}
                      </Badge>
                    </div>

                    <p className="text-xs text-muted-foreground mt-2">
                      <span className="font-medium">Affects:</span>{' '}
                      {packsLabel}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <p className="text-xs text-muted-foreground">
          Settings are saved locally in your browser and persist across sessions.
        </p>
      </DialogContent>
    </Dialog>
  );
}

