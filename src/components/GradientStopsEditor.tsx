import { Plus, X, Shuffle } from 'lucide-react';
import { Slider } from './ui/slider';
import { Button } from './ui/button';
import { ColorField } from './ui/color-field';
import { AngleDial } from './ui/angle-slider';
import { buildCssGradient, type GradientStop } from '../utils/gradient';

interface GradientStopsEditorProps {
  stops: GradientStop[];
  angle: number;
  onStopsChange: (stops: GradientStop[]) => void;
  onAngleChange: (angle: number) => void;
  idPrefix: string;
  /** Optional: when provided, renders a "Randomize" button that generates a fresh gradient. */
  onRandomize?: () => void;
}

/**
 * Multi-stop linear-gradient editor: a live preview with the angle dial
 * beside it, one compact row per stop, and add / randomize actions.
 */
export function GradientStopsEditor({
  stops,
  angle,
  onStopsChange,
  onAngleChange,
  idPrefix,
  onRandomize,
}: GradientStopsEditorProps) {
  const sorted = [...stops].sort((a, b) => a.position - b.position);
  const preview = buildCssGradient(sorted.length >= 2 ? sorted : [
    ...sorted,
    { color: sorted[0]?.color ?? '#000000', position: 100 },
  ], angle);

  const updateStop = (index: number, patch: Partial<GradientStop>) => {
    const next = stops.map((s, i) => (i === index ? { ...s, ...patch } : s));
    onStopsChange(next);
  };

  const addStop = () => {
    // Insert a new stop midway between the largest gap.
    const sortedStops = [...stops].sort((a, b) => a.position - b.position);
    let bestGap = 0;
    let bestPos = 50;
    let insertAfterColor = sortedStops[0]?.color ?? '#000000';
    for (let i = 0; i < sortedStops.length - 1; i++) {
      const gap = sortedStops[i + 1].position - sortedStops[i].position;
      if (gap > bestGap) {
        bestGap = gap;
        bestPos = sortedStops[i].position + gap / 2;
        insertAfterColor = sortedStops[i].color;
      }
    }
    onStopsChange([...stops, { color: insertAfterColor, position: Math.round(bestPos) }]);
  };

  const removeStop = (index: number) => {
    if (stops.length <= 2) return; // Keep at least 2 stops.
    onStopsChange(stops.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-3">
      {/* Preview + direction dial */}
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className="h-16 flex-1 rounded-lg border border-border"
          style={{ background: preview }}
        />
        <div className="flex flex-col items-center gap-1">
          <AngleDial
            id={`${idPrefix}-angle`}
            value={angle}
            onValueChange={onAngleChange}
            size={64}
            aria-label="Gradient angle"
          />
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Angle</span>
        </div>
      </div>

      {/* Stops list */}
      <div className="space-y-2">
        {stops.map((stop, index) => (
          <div key={index} className="flex items-center gap-2">
            <ColorField
              size="sm"
              value={stop.color}
              onChange={(color) => updateStop(index, { color })}
              aria-label={`Stop ${index + 1} color`}
              className="flex-1 min-w-0"
            />
            <div className="flex w-32 shrink-0 items-center gap-1.5">
              <Slider
                value={[stop.position]}
                onValueChange={([v]: number[]) => updateStop(index, { position: v })}
                min={0}
                max={100}
                step={1}
                aria-label={`Stop ${index + 1} position`}
                className="[&_[data-slot=slider-track]]:h-1.5 [&_[data-slot=slider-thumb]]:size-3.5"
              />
              <span className="w-8 text-right text-xs tabular-nums text-muted-foreground">
                {Math.round(stop.position)}%
              </span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => removeStop(index)}
              disabled={stops.length <= 2}
              aria-label={`Remove stop ${index + 1}`}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addStop} className="flex-1">
          <Plus className="h-4 w-4 mr-1.5" />
          Add stop
        </Button>
        {onRandomize && (
          <Button type="button" variant="outline" size="sm" onClick={onRandomize} className="flex-1">
            <Shuffle className="h-4 w-4 mr-1.5" />
            Randomize
          </Button>
        )}
      </div>
    </div>
  );
}
