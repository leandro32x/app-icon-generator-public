import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { toast } from 'sonner';
import {
  saveSession,
  generateDefaultName,
  type IconConfig,
  type SavedSession,
} from '../utils/sessionStore';
import type { BannerConfig } from './BannerPreview';
import type { IconSource } from '../utils/iconManager';
import { IconTile } from './IconTile';

interface SaveSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  generatedIcon: string | null;
  iconSource: IconSource;
  iconStyle: string;
  iconConfig: IconConfig;
  bannerConfig: BannerConfig;
}

export function SaveSessionDialog({
  open,
  onOpenChange,
  generatedIcon,
  iconSource,
  iconStyle,
  iconConfig,
  bannerConfig,
}: SaveSessionDialogProps) {
  const [name, setName] = useState('');

  // Seed the default name whenever the dialog opens. Radix `onOpenChange`
  // does not fire when the `open` prop is toggled externally.
  useEffect(() => {
    if (open) setName(generateDefaultName());
  }, [open]);

  const handleSave = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Please enter a name for this session');
      return;
    }

    const session: SavedSession = {
      id: crypto.randomUUID(),
      name: trimmedName,
      createdAt: new Date().toISOString(),
      state: {
        generatedIcon,
        iconSource,
        iconStyle,
        iconConfig,
        bannerConfig,
      },
    };

    try {
      saveSession(session);
    } catch (err) {
      // Typically the localStorage quota (sessions with uploaded images are
      // large). Keep the dialog open so the user can retry after cleaning up.
      toast.error((err as Error).message || 'The session could not be saved.');
      return;
    }
    toast.success(`Session "${trimmedName}" saved`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Save Session</DialogTitle>
          <DialogDescription>
            Save your current configuration to restore later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="flex items-center gap-4">
            {/* Live preview of what is being saved */}
            <div className="flex-shrink-0">
              <IconTile
                size={48}
                config={iconConfig}
                iconUrl={generatedIcon}
                iconSource={iconSource}
                iconStyle={iconStyle}
              />
            </div>
            <div className="flex-1">
              <label htmlFor="session-name" className="text-sm font-medium text-foreground block mb-1">
                Session Name
              </label>
              <Input
                id="session-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="My Icon Design"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                }}
                autoFocus
              />
            </div>
          </div>

          <div className="text-xs text-muted-foreground space-y-1">
            <p>This will save: the foreground (icon, uploaded image or text and font), colors, gradients, effects, padding, corner radius, and banner settings.</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>Save Session</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
