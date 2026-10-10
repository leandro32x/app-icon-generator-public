import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Smartphone } from 'lucide-react';
import type { IconSource } from '../utils/iconManager';
import type { GradientStop } from '../utils/gradient';
import { DevicePreview } from './DevicePreview';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { IconTile, type IconTileConfig } from './IconTile';
import { IconSourceInfo } from './IconSourceInfo';
import { resolveForeground } from '../utils/foreground';

interface IconSizeTileProps {
  size: number;
  showLabel?: boolean;
  config: IconTileConfig;
  iconUrl: string | null;
  iconSource: IconSource;
  iconStyle: string;
}

/**
 * Stable module-level wrapper: renders an IconTile at the given size with an
 * optional pixel label underneath. Defined outside IconPreview so React never
 * remounts it on a parent re-render (the root cause of the Iconify infinite-
 * update loop when dragging a color picker).
 *
 * No overscan here: the Standard preview represents the plain PNG export
 * (and iOS), where the background gradient and effects span the whole tile.
 * The Android device preview models the adaptive 108/72 dp overscan itself.
 */
function IconSizeTile({ size, showLabel = false, config, iconUrl, iconSource, iconStyle }: IconSizeTileProps) {
  return (
    <div className="text-center">
      <IconTile
        size={size}
        config={config}
        iconUrl={iconUrl}
        iconSource={iconSource}
        iconStyle={iconStyle}
      />
      {showLabel && <p className="text-xs text-muted-foreground mt-2">{size}px</p>}
    </div>
  );
}

interface IconPreviewProps {
  iconUrl: string | null;
  config: IconTileConfig;
  iconSource: IconSource;
  iconStyle: string;
  /** When provided, the hero tile becomes draggable (moves the foreground) and accepts arrow keys. */
  onConfigChange?: (config: IconTileConfig) => void;
}

const HERO_SIZE = 200;

const clampOffset = (v: number) => Math.max(-50, Math.min(50, Math.round(v)));

export function IconPreview({ iconUrl, config, iconSource, iconStyle, onConfigChange }: IconPreviewProps) {
  const [previewMode, setPreviewMode] = useState<'standard' | 'android' | 'ios'>('standard');
  // Icon, uploaded image or text — `null` until the user has picked/entered one.
  const foreground = resolveForeground(config, iconUrl);
  const hasForeground = foreground !== null;

  // Direct manipulation of the foreground offset on the hero tile. Offsets are
  // a percent of the visible tile, so `dx / HERO_SIZE * 100` maps 1:1.
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; ox: number; oy: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const interactive = !!onConfigChange && hasForeground;

  const handlePointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!interactive || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      ox: config.foregroundOffsetX,
      oy: config.foregroundOffsetY,
    };
    setDragging(true);
  };
  const handlePointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || !onConfigChange) return;
    const dx = ((e.clientX - d.startX) / HERO_SIZE) * 100;
    const dy = ((e.clientY - d.startY) / HERO_SIZE) * 100;
    onConfigChange({
      ...config,
      foregroundOffsetX: clampOffset(d.ox + dx),
      foregroundOffsetY: clampOffset(d.oy + dy),
    });
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) {
      try {
        e.currentTarget.releasePointerCapture(dragRef.current.pointerId);
      } catch {
        // Pointer capture may already be gone.
      }
    }
    dragRef.current = null;
    setDragging(false);
  };
  const recenter = () => {
    if (!onConfigChange) return;
    onConfigChange({ ...config, foregroundOffsetX: 0, foregroundOffsetY: 0 });
  };
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || !onConfigChange) return;
    const step = e.shiftKey ? 5 : 1;
    let dx = 0;
    let dy = 0;
    switch (e.key) {
      case 'ArrowLeft': dx = -step; break;
      case 'ArrowRight': dx = step; break;
      case 'ArrowUp': dy = -step; break;
      case 'ArrowDown': dy = step; break;
      default: return;
    }
    e.preventDefault();
    onConfigChange({
      ...config,
      foregroundOffsetX: clampOffset(config.foregroundOffsetX + dx),
      foregroundOffsetY: clampOffset(config.foregroundOffsetY + dy),
    });
  };

  return (
    <Card className="border border-border shadow-sm bg-card overflow-hidden">
      <CardHeader className="p-4 sm:p-6 border-b border-border bg-surface-subtle">
        <CardTitle className="text-base font-semibold text-foreground">Icon Preview</CardTitle>
        <CardDescription className="text-sm text-muted-foreground">Real-time preview across sizes and devices</CardDescription>
      </CardHeader>
      <CardContent className="p-4 sm:p-6">
        {/* Preview-mode segmented control (full width, prominent) */}
        <ToggleGroup
          type="single"
          value={previewMode}
          onValueChange={(v) => v && setPreviewMode(v as 'standard' | 'android' | 'ios')}
          variant="outline"
          className="grid grid-cols-3 w-full mb-4 sm:mb-6"
        >
          <ToggleGroupItem value="standard" className="text-sm">Standard</ToggleGroupItem>
          <ToggleGroupItem value="android" className="text-sm">Android</ToggleGroupItem>
          <ToggleGroupItem value="ios" className="text-sm">iOS</ToggleGroupItem>
        </ToggleGroup>

        {previewMode === 'standard' ? (
          <div className="space-y-6 sm:space-y-8">
            {/* Hero */}
            <div className="bg-surface-subtle rounded-xl p-6 sm:p-12 flex flex-col items-center justify-center gap-3 border border-border">
              {hasForeground ? (
                <>
                  <div
                    role={interactive ? 'application' : undefined}
                    tabIndex={interactive ? 0 : undefined}
                    aria-label={interactive ? 'Foreground position. Drag or use arrow keys to move, double-click to recenter.' : undefined}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onDoubleClick={recenter}
                    onKeyDown={handleKeyDown}
                    className="rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    style={{ cursor: interactive ? (dragging ? 'grabbing' : 'grab') : undefined, touchAction: 'none' }}
                  >
                    <IconSizeTile size={HERO_SIZE} config={config} iconUrl={iconUrl} iconSource={iconSource} iconStyle={iconStyle} />
                  </div>
                  {interactive && (
                    <p className="text-xs text-muted-foreground select-none">
                      Drag to move · double-click to recenter · arrow keys to nudge
                    </p>
                  )}
                </>
              ) : (
                <div className="flex items-center justify-center bg-muted text-muted-foreground" style={{ width: 200, height: 200, borderRadius: `${config.cornerRadius}%` }}>
                  <Smartphone className="w-1/2 h-1/2" />
                </div>
              )}
            </div>
            {/* Size Variations */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-4">Size Variations</h3>
              <div className="flex flex-wrap items-end justify-center gap-4 sm:gap-6 bg-surface-subtle rounded-xl p-4 sm:p-6">
                {[32, 48, 64, 96, 128].map((size) => (
                  hasForeground ? (
                    <IconSizeTile key={size} size={size} showLabel config={config} iconUrl={iconUrl} iconSource={iconSource} iconStyle={iconStyle} />
                  ) : (
                    <div key={size} className="text-center">
                      <div className="flex items-center justify-center bg-muted text-muted-foreground" style={{ width: size, height: size, borderRadius: `${config.cornerRadius}%` }}>
                        <Smartphone style={{ width: size / 2, height: size / 2 }} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">{size}px</p>
                    </div>
                  )
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Device preview fills the card; drop extra chrome so the phone is the hero */
          <div
            className="device-preview-bg rounded-xl py-6 px-2 flex items-center justify-center border border-border"
            data-platform={previewMode}
          >
            <DevicePreview
              platform={previewMode}
              iconUrl={iconUrl}
              config={config}
              iconSource={iconSource}
              iconStyle={iconStyle}
            />
          </div>
        )}

        {hasForeground && <IconSourceInfo iconUrl={iconUrl} foreground={foreground} />}
      </CardContent>
    </Card>
  );
}
