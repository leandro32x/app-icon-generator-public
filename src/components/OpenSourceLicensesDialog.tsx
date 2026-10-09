import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { Badge } from './ui/badge';
import { ScrollArea } from './ui/scroll-area';
import { Separator } from './ui/separator';
import { Input } from './ui/input';
import { getFamilyForPrefix } from '../utils/iconifyCollections';
import { fetchCollections, type CollectionInfo } from '../utils/iconifyApi';
import { APP_DEPENDENCIES } from '../utils/licenseManager';

interface OpenSourceLicensesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ResolvedCollection {
  prefix: string;
  name: string;
  authorName?: string;
  authorUrl?: string;
  licenseTitle?: string;
  licenseSpdx?: string;
  licenseUrl?: string;
  isBrandPack: boolean;
  attributionRequired: boolean;
}

function resolveCollection(prefix: string, info: CollectionInfo): ResolvedCollection {
  // Merge API data with our local StyleFamily registry for richer info.
  const family = getFamilyForPrefix(prefix);
  return {
    prefix,
    name: info.name ?? prefix,
    authorName: info.author?.name ?? family?.license.author,
    authorUrl: info.author?.url ?? family?.license.authorUrl,
    licenseTitle: info.license?.title ?? family?.license.name,
    licenseSpdx: info.license?.spdx ?? family?.license.spdx,
    licenseUrl: info.license?.url ?? family?.license.url,
    isBrandPack: family?.isBrandPack ?? false,
    attributionRequired: family?.license.attributionRequired ?? false,
  };
}

export function OpenSourceLicensesDialog({ open, onOpenChange }: OpenSourceLicensesDialogProps) {
  const [apiCollections, setApiCollections] = useState<Record<string, CollectionInfo> | null>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  // Fetch on first open (fetchCollections is already cached after the first call).
  useEffect(() => {
    if (!open || apiCollections) return;
    setLoading(true);
    fetchCollections()
      .then((data) => setApiCollections(data))
      .catch(() => setApiCollections({}))
      .finally(() => setLoading(false));
  }, [open, apiCollections]);

  const allCollections = useMemo<ResolvedCollection[]>(() => {
    if (!apiCollections) return [];
    return Object.entries(apiCollections)
      .map(([prefix, info]) => resolveCollection(prefix, info))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [apiCollections]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return allCollections;
    return allCollections.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.prefix.toLowerCase().includes(q) ||
        c.licenseSpdx?.toLowerCase().includes(q) ||
        c.authorName?.toLowerCase().includes(q),
    );
  }, [allCollections, search]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Open Source Licenses</DialogTitle>
          <DialogDescription>
            Licenses for all available icon packs, fonts and the open source libraries used in this app.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[560px] pr-3">
          {/* ── Icon Packs ───────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-foreground">
                Icon Packs
                {allCollections.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    ({filtered.length} of {allCollections.length})
                  </span>
                )}
              </h3>
            </div>

            {loading ? (
              <div className="text-sm text-muted-foreground py-6 text-center animate-pulse">
                Loading collections…
              </div>
            ) : (
              <>
                <Input
                  placeholder="Search by pack name, prefix or license…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="mb-3 h-9 text-sm"
                />

                {filtered.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">No results.</p>
                ) : (
                  <div className="rounded-lg border border-border overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted text-muted-foreground">
                          <th className="text-left px-3 py-2 font-medium">Pack</th>
                          <th className="text-left px-3 py-2 font-medium">Author</th>
                          <th className="text-left px-3 py-2 font-medium">License</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((col, i) => (
                          <tr key={col.prefix} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/30'}>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <a
                                  href={`https://icon-sets.iconify.design/${col.prefix}/`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline hover:text-primary font-medium"
                                >
                                  {col.name}
                                </a>
                                <span className="text-muted-foreground font-mono">
                                  {col.prefix}
                                </span>
                                {col.isBrandPack && (
                                  <Badge variant="destructive" className="text-xs">⚠ TM</Badge>
                                )}
                                {col.attributionRequired && (
                                  <Badge variant="outline" className="text-xs text-amber-700 dark:text-amber-400">
                                    Attribution
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {col.authorUrl ? (
                                <a
                                  href={col.authorUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="underline hover:text-foreground"
                                >
                                  {col.authorName ?? '—'}
                                </a>
                              ) : (
                                col.authorName ?? '—'
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {col.licenseSpdx || col.licenseTitle ? (
                                <a
                                  href={col.licenseUrl ?? '#'}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title={col.licenseTitle}
                                >
                                  <Badge variant="secondary" className="text-xs font-mono cursor-pointer hover:bg-muted">
                                    {col.licenseSpdx ?? col.licenseTitle}
                                  </Badge>
                                </a>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </section>

          <Separator className="my-5" />

          {/* ── Fonts ─────────────────────────────────────────────────────── */}
          <section>
            <h3 className="font-semibold text-sm text-foreground mb-2">Fonts</h3>
            <p className="text-xs text-muted-foreground">
              Text icons and banner fonts come from{' '}
              <a
                href="https://fontsource.org"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-foreground"
              >
                Fontsource
              </a>
              {' '}(MIT), served by jsDelivr. Each font keeps its own license, mostly the SIL Open Font
              License 1.1, shown next to it in the font picker and written to ATTRIBUTION.md when you
              export a text icon.
            </p>
          </section>

          <Separator className="my-5" />

          {/* ── App Dependencies ─────────────────────────────────────────── */}
          <section>
            <h3 className="font-semibold text-sm text-foreground mb-3">
              App Icon Generator — OSS Dependencies
            </h3>
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted text-muted-foreground">
                    <th className="text-left px-3 py-2 font-medium">Library</th>
                    <th className="text-left px-3 py-2 font-medium">Version</th>
                    <th className="text-left px-3 py-2 font-medium">License</th>
                  </tr>
                </thead>
                <tbody>
                  {APP_DEPENDENCIES.map((dep, i) => (
                    <tr key={dep.name} className={i % 2 === 0 ? 'bg-card' : 'bg-muted/30'}>
                      <td className="px-3 py-2">
                        <a
                          href={dep.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-primary"
                        >
                          {dep.name}
                        </a>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground font-mono whitespace-nowrap">{dep.version}</td>
                      <td className="px-3 py-2">
                        <Badge variant="secondary" className="text-xs font-mono">
                          {dep.license}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <Separator className="my-5" />

          {/* ── Trademark Notice ─────────────────────────────────────────── */}
          <section className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3">
            <p className="text-xs text-amber-800 dark:text-amber-300 font-medium mb-1">
              ⚠ Trademark Notice
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-400">
              App icons based on brand or product logos may be subject to trademark restrictions
              independent of the icon pack license. Always verify usage rights with the respective
              brand owners before publishing your app.
            </p>
          </section>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
