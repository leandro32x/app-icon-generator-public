import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconGenerator } from './components/IconGenerator';
import { IconPreview } from './components/IconPreview';
import { DownloadPanel } from './components/DownloadPanel';
import { BannerPreview, type BannerConfig } from './components/BannerPreview';
import { SaveSessionDialog } from './components/SaveSessionDialog';
import { SessionManagerDialog } from './components/SessionManagerDialog';
import { PackSettingsDialog } from './components/PackSettingsDialog';
import { OpenSourceLicensesDialog } from './components/OpenSourceLicensesDialog';
import { ThemeToggle } from './components/ThemeToggle';
import type { SavedSession } from './utils/sessionStore';
import type { IconSource } from './utils/iconManager';
import { DEFAULT_ICON_CONFIG, type IconConfig } from './utils/iconConfig';
import { resolveForeground } from './utils/foreground';
import { useHistory } from './utils/useHistory';
import { AUTHOR_HANDLE, AUTHOR_URL } from './utils/licenseManager';
import { Toaster } from './components/ui/sonner';
import { Save, FolderOpen, Info, Settings2, Undo2, Redo2 } from 'lucide-react';

/** Everything undo/redo tracks — the same state a saved session captures. */
interface DesignSnapshot {
  generatedIcon: string | null;
  iconSource: IconSource;
  iconStyle: string;
  iconConfig: IconConfig;
  bannerConfig: BannerConfig;
}

const snapshotsEqual = (a: DesignSnapshot, b: DesignSnapshot) =>
  a.generatedIcon === b.generatedIcon &&
  a.iconSource === b.iconSource &&
  a.iconStyle === b.iconStyle &&
  a.iconConfig === b.iconConfig &&
  a.bannerConfig === b.bannerConfig;

export default function App() {
  const [generatedIcon, setGeneratedIcon] = useState<string | null>(null);
  const [iconSource, setIconSource] = useState<IconSource>('lucide');
  const [iconStyle, setIconStyle] = useState('');
  // Central design state (shape + defaults live in utils/iconConfig.ts).
  const [iconConfig, setIconConfig] = useState<IconConfig>(DEFAULT_ICON_CONFIG);
  const [activeTab, setActiveTab] = useState('icons');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [managerDialogOpen, setManagerDialogOpen] = useState(false);
  const [packSettingsOpen, setPackSettingsOpen] = useState(false);
  const [licensesOpen, setLicensesOpen] = useState(false);
  const [bannerConfig, setBannerConfig] = useState<BannerConfig>({
    title: 'Your App',
    tagline: 'Tagline',
    font: 'Inter',
    fontId: 'inter',
    backgroundColor: '#3730A3',
    backgroundGradient: false,
    backgroundGradientStops: [
      { color: '#3730A3', position: 0 },
      { color: '#6D28D9', position: 100 },
    ],
    backgroundGradientAngle: 135,
    textColor: '#FFFFFF',
    showIcon: true,
    removeIconBackground: true,
    useIconBackground: true,
    layout: 'horizontal',
    shape: 'circle',
  });

  const handleRestoreSession = (session: SavedSession) => {
    setGeneratedIcon(session.state.generatedIcon);
    setIconSource(session.state.iconSource);
    setIconStyle(session.state.iconStyle);
    // Merge restored config with current defaults so old saved sessions (which
    // lack the new multi-stop gradient fields) still rehydrate correctly.
    setIconConfig((prev) => ({ ...prev, ...session.state.iconConfig }));
    // Merge over defaults too, so older sessions lacking the new banner
    // gradient / merge fields rehydrate without breaking the render.
    setBannerConfig((prev) => ({ ...prev, ...session.state.bannerConfig }));
  };

  // True once there is something to export: a picked icon, an uploaded image
  // or non-empty text (depending on the selected foreground kind).
  const hasForeground = resolveForeground(iconConfig, generatedIcon) !== null;

  // Undo / redo over the whole design. Rapid changes (slider drags, typing)
  // collapse into one step; restoring a session is itself one step.
  const snapshot = useMemo<DesignSnapshot>(
    () => ({ generatedIcon, iconSource, iconStyle, iconConfig, bannerConfig }),
    [generatedIcon, iconSource, iconStyle, iconConfig, bannerConfig],
  );
  const restoreSnapshot = useCallback((s: DesignSnapshot) => {
    setGeneratedIcon(s.generatedIcon);
    setIconSource(s.iconSource);
    setIconStyle(s.iconStyle);
    setIconConfig(s.iconConfig);
    setBannerConfig(s.bannerConfig);
  }, []);
  const history = useHistory(snapshot, restoreSnapshot, {
    isEqual: snapshotsEqual,
    // The icon library bootstraps iconSource/iconStyle right after mount;
    // that is not a user action, so it must not become the first undo step.
    ignoreInitialMs: 1000,
  });
  const { undo, redo } = history;

  useEffect(() => {
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      // Leave native text editing undo alone inside fields.
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undo, redo]);

  return (
    <>
      <div className="min-h-screen text-foreground font-sans">
        <div className="container mx-auto px-6 py-12 max-w-[1440px]">
          <header className="text-center mb-12 relative">
            <div className="absolute top-0 right-0 flex items-center gap-1">
              <button
                onClick={() => setPackSettingsOpen(true)}
                title="Icon pack settings"
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Settings2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setLicensesOpen(true)}
                title="Open source licenses"
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              >
                <Info className="w-4 h-4" />
              </button>
              <ThemeToggle />
            </div>
            <h1 className="mb-4">App Icon Generator</h1>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Generate professional iOS and Android app icons. Customize layers, preview all sizes, save sessions, and download production-ready assets.
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setSaveDialogOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <Save className="w-4 h-4" />
                Save Session
              </button>
              <button
                onClick={() => setManagerDialogOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md border border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              >
                <FolderOpen className="w-4 h-4" />
                My Sessions
              </button>
              <span className="w-px h-6 bg-border mx-1" aria-hidden="true" />
              <button
                onClick={undo}
                disabled={!history.canUndo}
                title="Undo (Ctrl+Z)"
                aria-label="Undo"
                className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <Undo2 className="w-4 h-4" />
              </button>
              <button
                onClick={redo}
                disabled={!history.canRedo}
                title="Redo (Ctrl+Shift+Z)"
                aria-label="Redo"
                className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <Redo2 className="w-4 h-4" />
              </button>
            </div>
          </header>

          <div className="grid lg:grid-cols-2 gap-8 items-start">
            <div className="min-w-0">
              <IconGenerator
                onGenerate={setGeneratedIcon}
                generatedIcon={generatedIcon}
                config={iconConfig}
                onConfigChange={setIconConfig}
                iconSource={iconSource}
                onIconSourceChange={setIconSource}
                iconStyle={iconStyle}
                onIconStyleChange={setIconStyle}
                bannerConfig={bannerConfig}
                onBannerConfigChange={setBannerConfig}
                onActiveTabChange={setActiveTab}
                onOpenPackSettings={() => setPackSettingsOpen(true)}
              />
            </div>

            <div className="space-y-6">
              {activeTab === 'banner' ? (
                <BannerPreview
                  bannerConfig={bannerConfig}
                  iconConfig={iconConfig}
                  iconUrl={generatedIcon}
                  iconSource={iconSource}
                  iconStyle={iconStyle}
                />
              ) : (
                <>
                  <IconPreview
                    iconUrl={generatedIcon}
                    config={iconConfig}
                    iconSource={iconSource}
                    iconStyle={iconStyle}
                    onConfigChange={setIconConfig}
                  />

                  {hasForeground && (
                    <DownloadPanel
                      iconUrl={generatedIcon}
                      config={iconConfig}
                      iconSource={iconSource}
                      iconStyle={iconStyle}
                    />
                  )}
                </>
              )}
            </div>
          </div>

          <footer className="mt-16 pb-16 text-center text-sm text-muted-foreground">
            <p>
              © {new Date().getFullYear()} App Icon Generator. All rights reserved.
              {' · '}
              <button
                onClick={() => setLicensesOpen(true)}
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                Open Source Licenses
              </button>
            </p>
            <p className="mt-2">
              Made by{' '}
              <a
                href={AUTHOR_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground transition-colors"
              >
                {AUTHOR_HANDLE}
              </a>
            </p>
          </footer>
        </div>
      </div>

      <SaveSessionDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        generatedIcon={generatedIcon}
        iconSource={iconSource}
        iconStyle={iconStyle}
        iconConfig={iconConfig}
        bannerConfig={bannerConfig}
      />

      <SessionManagerDialog
        open={managerDialogOpen}
        onOpenChange={setManagerDialogOpen}
        onRestore={handleRestoreSession}
      />

      <PackSettingsDialog
        open={packSettingsOpen}
        onOpenChange={setPackSettingsOpen}
      />

      <OpenSourceLicensesDialog
        open={licensesOpen}
        onOpenChange={setLicensesOpen}
      />

      <Toaster />
    </>
  );
}