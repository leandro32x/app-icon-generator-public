/**
 * Per-collection optical scale compensation for Iconify-rendered icons.
 *
 * Different Iconify collections render at visually different sizes even at
 * the same nominal pixel box (stroke-only packs look smaller than filled
 * packs). This multiplier scales the inner icon relative to its tile so
 * packs look visually comparable at the same `padding` setting.
 *
 * Values > 1 make the icon bigger; < 1 make it smaller. Default 1.0 is used
 * for any unknown prefix.
 *
 * Applied in: IconPreview, IconTile (device preview), DownloadPanel.
 */

const SCALE_BY_PREFIX: Record<string, number> = {
  // Lucide — thin stroke outlines
  lucide: 1.18,

  // Phosphor family
  ph: 1.00,
  'ph-thin': 1.10,
  'ph-light': 1.05,
  'ph-bold': 0.98,
  'ph-fill': 0.95,
  'ph-duotone': 1.00,

  // Solar family
  solar: 1.08, // linear (default)
  'solar-outline': 1.08,
  'solar-linear': 1.08,
  'solar-broken': 1.08,
  'solar-line-duotone': 1.08,
  'solar-bold': 1.00,
  'solar-bold-duotone': 1.00,

  // Material Symbols — generally render edge-to-edge.
  'material-symbols': 0.95,
  'material-symbols-outlined': 0.95,
  'material-symbols-rounded': 0.95,
  'material-symbols-sharp': 0.95,
};

export function getOpticalScale(source: string, _style?: string): number {
  return SCALE_BY_PREFIX[source] ?? 1.0;
}
