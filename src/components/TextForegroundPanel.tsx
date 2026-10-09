import { useEffect, useMemo, useState } from 'react';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Switch } from './ui/switch';
import { SliderField } from './ui/slider-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { FontPicker } from './FontPicker';
import type { IconConfig } from '../utils/iconConfig';
import { getFontMeta, prefetchFontCatalog, type FontMeta } from '../utils/fontsourceApi';
import { pickNearestWeight } from '../utils/fontLoader';

interface TextForegroundPanelProps {
  config: IconConfig;
  onConfigChange: (config: IconConfig) => void;
}

const WEIGHT_NAMES: Record<number, string> = {
  100: 'Thin',
  200: 'Extra Light',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'Semi Bold',
  700: 'Bold',
  800: 'Extra Bold',
  900: 'Black',
};

const MAX_TEXT_LENGTH = 40;

/**
 * "Text" foreground controls: the text itself, a Fontsource font picker,
 * weight / italic (limited to what the font ships) and letter spacing.
 */
export function TextForegroundPanel({ config, onConfigChange }: TextForegroundPanelProps) {
  const [meta, setMeta] = useState<FontMeta | null>(null);
  // Metadata handed over by the picker: covers the moment before `getFontMeta` answers, and offline.
  const [pickedMeta, setPickedMeta] = useState<FontMeta | null>(null);

  // The user is about to open the font picker — have the catalog ready for it.
  useEffect(() => {
    prefetchFontCatalog();
  }, []);

  useEffect(() => {
    let cancelled = false;
    getFontMeta(config.textFontId).then((m) => {
      if (!cancelled) setMeta(m);
    });
    return () => {
      cancelled = true;
    };
  }, [config.textFontId]);

  const fontMeta = meta ?? (pickedMeta?.id === config.textFontId ? pickedMeta : null);

  // Keep the current weight selectable even if the font does not list it
  // (e.g. a restored session), so the Select stays controlled.
  const weightOptions = useMemo(() => {
    const weights = new Set(fontMeta?.weights ?? [400, 700]);
    weights.add(config.textWeight);
    return [...weights].sort((a, b) => a - b);
  }, [fontMeta, config.textWeight]);

  const hasItalic = fontMeta ? fontMeta.styles.includes('italic') : true;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="fg-text">Text</Label>
        <Textarea
          id="fg-text"
          value={config.text}
          onChange={(e) => onConfigChange({ ...config, text: e.target.value.slice(0, MAX_TEXT_LENGTH) })}
          placeholder="A"
          rows={2}
          maxLength={MAX_TEXT_LENGTH}
          className="min-h-[64px] text-lg"
        />
        <p className="text-xs text-muted-foreground">
          One or two letters make the best icons. Press Enter for a second line. The text is scaled to fill the
          icon inside the padding.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="fg-font">Font</Label>
        <FontPicker
          id="fg-font"
          value={{ fontId: config.textFontId, family: config.textFontFamily }}
          sampleText={config.text}
          onChange={({ fontId, family, meta: nextMeta }) => {
            setPickedMeta(nextMeta);
            onConfigChange({
              ...config,
              textFontId: fontId,
              textFontFamily: family,
              textWeight: pickNearestWeight(nextMeta?.weights, config.textWeight),
              textItalic: config.textItalic && (nextMeta ? nextMeta.styles.includes('italic') : true),
            });
          }}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="fg-weight">Weight</Label>
          <Select
            value={String(config.textWeight)}
            onValueChange={(v) => onConfigChange({ ...config, textWeight: Number(v) })}
          >
            <SelectTrigger id="fg-weight" className="w-full bg-card border-border shadow-sm h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {weightOptions.map((w) => (
                <SelectItem key={w} value={String(w)}>
                  {w} {WEIGHT_NAMES[w] ? `· ${WEIGHT_NAMES[w]}` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="fg-italic">Italic</Label>
          <div className="flex items-center h-10">
            <Switch
              id="fg-italic"
              checked={config.textItalic}
              disabled={!hasItalic}
              onCheckedChange={(checked: boolean) => onConfigChange({ ...config, textItalic: checked })}
            />
            {!hasItalic && (
              <span className="ml-3 text-xs text-muted-foreground">Not available for this font</span>
            )}
          </div>
        </div>
      </div>

      <SliderField
        label="Letter spacing"
        value={config.textLetterSpacing}
        onChange={(textLetterSpacing) => onConfigChange({ ...config, textLetterSpacing })}
        min={-0.1}
        max={0.5}
        step={0.01}
        unit="em"
        format={(v) => v.toFixed(2)}
        resetTo={0}
        labelClassName="w-24"
      />

      <p className="text-xs text-muted-foreground">
        The text color, gradient and effects come from the Customize tab.
      </p>
    </div>
  );
}
