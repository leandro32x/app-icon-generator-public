import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { Trash2, RotateCcw, Clock, FolderOpen, Download, Upload } from 'lucide-react';
import { getSavedSessions, deleteSession, exportSessionToJson, exportAllSessionsToJson, importSessionsFromJson, type SavedSession } from '../utils/sessionStore';
import { resolveForeground } from '../utils/foreground';
import { IconTile } from './IconTile';

/** Short label for the session list: icon pack prefix, "Image" or "Text". */
function foregroundLabel(session: SavedSession): string | null {
  const fg = resolveForeground(session.state.iconConfig, session.state.generatedIcon);
  if (!fg) return null;
  if (fg.kind === 'image') return 'Image';
  if (fg.kind === 'text') return `Text · ${fg.family}`;
  return session.state.iconSource;
}


interface SessionManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (session: SavedSession) => void;
}

export function SessionManagerDialog({ open, onOpenChange, onRestore }: SessionManagerDialogProps) {
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setSessions(getSavedSessions());
      setConfirmDeleteId(null);
    }
  }, [open]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) setConfirmDeleteId(null);
    onOpenChange(isOpen);
  };

  const handleDelete = (id: string, name: string) => {
    try {
      deleteSession(id);
    } catch (err) {
      toast.error((err as Error).message || 'The session could not be deleted.');
      return;
    }
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setConfirmDeleteId(null);
    toast.success(`Session "${name}" deleted`);
  };

  const handleRestore = (session: SavedSession) => {
    onRestore(session);
    onOpenChange(false);
    toast.success(`Session "${session.name}" restored`);
  };

  const handleExportAll = () => {
    if (sessions.length === 0) return;
    exportAllSessionsToJson();
    toast.success(`Exported ${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}`);
  };

  const handleExportOne = (session: SavedSession) => {
    exportSessionToJson(session);
    toast.success(`Exported "${session.name}"`);
  };

  const handleImportClick = () => { fileInputRef.current?.click(); };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const { added, skipped } = await importSessionsFromJson(file);
      setSessions(getSavedSessions());
      if (added === 0) {
        toast.error('No valid sessions found in file.');
      } else {
        const parts = [`Imported ${added} ${added === 1 ? 'session' : 'sessions'}`];
        if (skipped > 0) parts.push(`· ${skipped} skipped`);
        toast.success(parts.join(' '));
      }
    } catch (err) {
      toast.error((err as Error).message || 'Failed to import sessions');
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) +
      ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>My Sessions</DialogTitle>
          <DialogDescription>
            Browse and restore your saved icon configurations. Up to 20 sessions are kept.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 pb-1">
          <Button variant="outline" size="sm" onClick={handleImportClick} className="gap-1.5">
            <Upload className="w-3.5 h-3.5" />
            Import JSON
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportAll} disabled={sessions.length === 0} className="gap-1.5">
            <Download className="w-3.5 h-3.5" />
            Export all
          </Button>
          <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} className="hidden" />
        </div>

        <div className="flex-1 overflow-y-auto -mx-6 px-6">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FolderOpen className="w-12 h-12 mb-3 stroke-1" />
              <p className="text-sm font-medium text-foreground">No saved sessions</p>
              <p className="text-xs mt-1">Save your current configuration or import a JSON file to see it here.</p>
            </div>
          ) : (
            <div className="space-y-2 pb-2">
              {sessions.map((session) => (
                <div key={session.id} className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent/30 transition-colors">
                  <div className="flex-shrink-0">
                    <IconTile
                      size={40}
                      config={session.state.iconConfig}
                      iconUrl={session.state.generatedIcon}
                      iconSource={session.state.iconSource}
                      iconStyle={session.state.iconStyle}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{session.name}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Clock className="w-3 h-3" />
                      <span>{formatDate(session.createdAt)}</span>
                      {foregroundLabel(session) && (
                        <>
                          <span className="mx-1">·</span>
                          <span className="capitalize">{foregroundLabel(session)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="outline" size="sm" onClick={() => handleRestore(session)} className="gap-1">
                      <RotateCcw className="w-3.5 h-3.5" />
                      Restore
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleExportOne(session)} className="text-muted-foreground hover:text-foreground" title="Download as JSON">
                      <Download className="w-4 h-4" />
                    </Button>
                    {confirmDeleteId === session.id ? (
                      <div className="flex items-center gap-1">
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(session.id, session.name)}>Confirm</Button>
                        <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteId(null)}>Cancel</Button>
                      </div>
                    ) : (
                      <Button variant="ghost" size="icon" onClick={() => setConfirmDeleteId(session.id)} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
