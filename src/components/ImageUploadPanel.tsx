import { useRef, useState, type CSSProperties, type DragEvent } from 'react';
import { ImagePlus, Trash2, RefreshCw, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { Badge } from './ui/badge';
import type { IconConfig } from '../utils/iconConfig';
import { importImageFile, IMAGE_ACCEPT_ATTR, MAX_IMAGE_DIMENSION } from '../utils/imageImport';

interface ImageUploadPanelProps {
  config: IconConfig;
  onConfigChange: (config: IconConfig) => void;
}

/** Transparent-checkerboard backdrop so alpha is visible in the thumbnail. */
const CHECKERBOARD: CSSProperties = {
  backgroundColor: 'rgba(128,128,128,0.12)',
  backgroundImage:
    'linear-gradient(45deg, rgba(128,128,128,0.25) 25%, transparent 25%), linear-gradient(-45deg, rgba(128,128,128,0.25) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(128,128,128,0.25) 75%), linear-gradient(-45deg, transparent 75%, rgba(128,128,128,0.25) 75%)',
  backgroundSize: '16px 16px',
  backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
};

/**
 * "Image" foreground controls: file picker + drop zone, thumbnail with
 * metadata, and the tint switch that routes the icon color/gradient through
 * the image's alpha channel.
 */
export function ImageUploadPanel({ config, onConfigChange }: ImageUploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [importing, setImporting] = useState(false);

  const handleFiles = async (files: FileList | null | undefined) => {
    const file = files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const img = await importImageFile(file);
      onConfigChange({
        ...config,
        foregroundType: 'image',
        imageDataUrl: img.dataUrl,
        imageName: img.name,
        imageWidth: img.width,
        imageHeight: img.height,
        imageHasAlpha: img.hasAlpha,
      });
      toast.success(`Loaded ${img.name}`);
    } catch (err) {
      toast.error((err as Error).message || 'Could not load that image.');
    } finally {
      setImporting(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    void handleFiles(e.dataTransfer?.files);
  };

  const handleRemove = () => {
    onConfigChange({
      ...config,
      imageDataUrl: null,
      imageName: null,
      imageWidth: null,
      imageHeight: null,
      imageHasAlpha: true,
    });
  };

  const openPicker = () => inputRef.current?.click();

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_ACCEPT_ATTR}
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {!config.imageDataUrl ? (
        <div
          role="button"
          tabIndex={0}
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openPicker();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          className={`rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
            dragging ? 'border-primary bg-accent/50' : 'border-border bg-surface-subtle hover:bg-accent/30'
          }`}
        >
          <ImagePlus className="w-8 h-8 mx-auto mb-3 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">
            {importing ? 'Loading image…' : 'Drop an image here, or click to browse'}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            PNG, JPEG, WebP or SVG · up to 10 MB · resized to {MAX_IMAGE_DIMENSION}px max
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            A logo with a transparent background works best.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div
            className="rounded-xl border border-border overflow-hidden"
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
          >
            <div className="flex items-center justify-center p-4" style={CHECKERBOARD}>
              <img
                src={config.imageDataUrl}
                alt={config.imageName ?? 'Uploaded foreground'}
                className="max-h-40 max-w-full object-contain"
                draggable={false}
              />
            </div>
            <div className="flex items-center justify-between gap-3 p-3 bg-card border-t border-border">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate" title={config.imageName ?? undefined}>
                  {config.imageName ?? 'Image'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {config.imageWidth && config.imageHeight ? `${config.imageWidth} × ${config.imageHeight} px` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Badge variant={config.imageHasAlpha ? 'secondary' : 'outline'}>
                  {config.imageHasAlpha ? 'Transparent' : 'Opaque'}
                </Badge>
                <Button type="button" variant="outline" size="sm" onClick={openPicker} className="gap-1.5" disabled={importing}>
                  <RefreshCw className="w-3.5 h-3.5" />
                  Replace
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleRemove}
                  className="text-muted-foreground hover:text-destructive"
                  title="Remove image"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-start justify-between gap-3 p-3 rounded-lg border border-border bg-accent/30">
            <div className="min-w-0 pr-3">
              <Label htmlFor="image-tint" className="text-sm font-medium">Tint with foreground color</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                {config.imageTint
                  ? 'The image shape is filled with the foreground color or gradient from the Customize tab.'
                  : 'Off: the image keeps its own colors. The foreground color settings do not affect it.'}
              </p>
            </div>
            <Switch
              id="image-tint"
              checked={config.imageTint}
              onCheckedChange={(checked: boolean) => onConfigChange({ ...config, imageTint: checked })}
            />
          </div>

          {!config.imageHasAlpha && (
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <TriangleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0 text-amber-500" />
              <span>
                This image has no transparency, so tint, cast shadow and the Android monochrome layer treat the
                whole square as the shape. Use a PNG or SVG with a transparent background for a cut-out look.
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
