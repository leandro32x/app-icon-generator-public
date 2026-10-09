/**
 * Canonical shape + defaults of the central `iconConfig` design state.
 *
 * `App.tsx` owns the live value; every consumer (IconTile, IconGenerator,
 * BannerPreview, DownloadPanel, sessionStore) types against `IconConfig`
 * instead of re-declaring the shape.
 *
 * Persisted sessions may predate newer fields, so always rehydrate through
 * `normalizeIconConfig()` (or merge over the current defaults).
 */

import type { GradientStop } from './gradient';
import { DEFAULT_FOREGROUND_CONFIG, type ForegroundConfig } from './foreground';

export type IconEffect = 'none' | 'drop-shadow' | 'cast-shadow' | 'score' | 'outline' | 'offset';

export interface IconConfig extends ForegroundConfig {
  backgroundColor: string;
  backgroundGradient: boolean;
  /** Legacy two-color pair, kept in sync with the first/last multi-stop entries. */
  backgroundGradientStart: string;
  backgroundGradientEnd: string;
  /** Multi-stop gradient. When present (≥ 2 stops) it overrides start/end. */
  backgroundGradientStops: GradientStop[];
  backgroundGradientAngle: number;
  iconColor: string;
  iconGradient: boolean;
  iconGradientStart: string;
  iconGradientEnd: string;
  iconGradientStops: GradientStop[];
  iconGradientAngle: number;
  /** Colors applied to successive SVG parts when `usePartColors` is on (icon foregrounds only). */
  iconPartColors: string[];
  usePartColors: boolean;
  /** Percent of the visible tile reserved as padding on each side. */
  padding: number;
  /** Corner radius as a percent of the tile side (50 = circle). */
  cornerRadius: number;
  iconEffect: IconEffect;
  /** 0–100 */
  iconEffectOpacity: number;
}

export const DEFAULT_ICON_CONFIG: IconConfig = {
  ...DEFAULT_FOREGROUND_CONFIG,
  backgroundColor: '#3B82F6',
  backgroundGradient: false,
  backgroundGradientStart: '#3B82F6',
  backgroundGradientEnd: '#8B5CF6',
  backgroundGradientStops: [
    { color: '#3B82F6', position: 0 },
    { color: '#8B5CF6', position: 100 },
  ],
  backgroundGradientAngle: 135,
  iconColor: '#FFFFFF',
  iconGradient: false,
  iconGradientStart: '#FFFFFF',
  iconGradientEnd: '#E0E7FF',
  iconGradientStops: [
    { color: '#FFFFFF', position: 0 },
    { color: '#E0E7FF', position: 100 },
  ],
  iconGradientAngle: 135,
  iconPartColors: [],
  usePartColors: false,
  padding: 15,
  cornerRadius: 22,
  iconEffect: 'none',
  iconEffectOpacity: 100,
};

/**
 * Fill in any missing fields (older saved sessions, hand-edited JSON imports)
 * from the defaults so downstream code can rely on a complete shape.
 */
export function normalizeIconConfig(raw: Partial<IconConfig> | null | undefined): IconConfig {
  return { ...DEFAULT_ICON_CONFIG, ...(raw ?? {}) };
}
