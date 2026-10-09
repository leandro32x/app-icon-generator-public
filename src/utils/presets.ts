/**
 * One-click style presets and the "shuffle" generator.
 *
 * A preset only touches look-related fields (colors, gradients, corner
 * radius, padding, effect); the foreground itself (icon / image / text and
 * its transform) is kept so users can try styles on their own design.
 */

import type { IconConfig } from './iconConfig';
import type { GradientStop } from './gradient';
import { randomGradient } from './randomGradient';
import { pickReadableTextColor } from './color';

export interface StylePreset {
  id: string;
  name: string;
  config: Partial<IconConfig>;
}

type ColorSpec = string | [string, string];

interface PresetSpec {
  bg: ColorSpec;
  bgAngle?: number;
  fg: ColorSpec;
  fgAngle?: number;
  effect?: IconConfig['iconEffect'];
  effectOpacity?: number;
  corner?: number;
  padding?: number;
}

function stops(spec: [string, string]): GradientStop[] {
  return [
    { color: spec[0], position: 0 },
    { color: spec[1], position: 100 },
  ];
}

function preset(id: string, name: string, spec: PresetSpec): StylePreset {
  const bgGradient = Array.isArray(spec.bg);
  const fgGradient = Array.isArray(spec.fg);
  const bgStart = Array.isArray(spec.bg) ? spec.bg[0] : spec.bg;
  const bgEnd = Array.isArray(spec.bg) ? spec.bg[1] : spec.bg;
  const fgStart = Array.isArray(spec.fg) ? spec.fg[0] : spec.fg;
  const fgEnd = Array.isArray(spec.fg) ? spec.fg[1] : spec.fg;
  return {
    id,
    name,
    config: {
      backgroundColor: bgStart,
      backgroundGradient: bgGradient,
      backgroundGradientStart: bgStart,
      backgroundGradientEnd: bgEnd,
      backgroundGradientStops: stops([bgStart, bgEnd]),
      backgroundGradientAngle: spec.bgAngle ?? 135,
      iconColor: fgStart,
      iconGradient: fgGradient,
      iconGradientStart: fgStart,
      iconGradientEnd: fgEnd,
      iconGradientStops: stops([fgStart, fgEnd]),
      iconGradientAngle: spec.fgAngle ?? 135,
      usePartColors: false,
      iconEffect: spec.effect ?? 'none',
      iconEffectOpacity: spec.effectOpacity ?? 100,
      cornerRadius: spec.corner ?? 22,
      padding: spec.padding ?? 15,
    },
  };
}

export const STYLE_PRESETS: StylePreset[] = [
  preset('ocean', 'Ocean', { bg: ['#0EA5E9', '#2563EB'], fg: '#FFFFFF' }),
  preset('sunset', 'Sunset', { bg: ['#F97316', '#EC4899'], fg: '#FFFFFF', effect: 'drop-shadow', effectOpacity: 70 }),
  preset('midnight', 'Midnight', { bg: ['#1E293B', '#020617'], fg: ['#F8FAFC', '#94A3B8'] }),
  preset('forest', 'Forest', { bg: ['#22C55E', '#065F46'], bgAngle: 160, fg: '#ECFDF5' }),
  preset('candy', 'Candy', { bg: ['#F472B6', '#A855F7'], fg: '#FFFFFF', corner: 30 }),
  preset('mint', 'Mint', { bg: '#14B8A6', fg: '#F0FDFA', effect: 'score' }),
  preset('paper', 'Paper', { bg: '#F8FAFC', fg: '#0F172A', padding: 18 }),
  preset('neon', 'Neon', { bg: '#0B0F19', fg: ['#22D3EE', '#A3E635'], effect: 'drop-shadow', effectOpacity: 80 }),
  preset('long-shadow', 'Long shadow', { bg: '#F59E0B', fg: '#FFFFFF', effect: 'cast-shadow' }),
  preset('sticker', 'Sticker', { bg: '#F43F5E', fg: '#FFFFFF', effect: 'outline', padding: 18 }),
  preset('retro', 'Retro print', { bg: '#FDE68A', fg: '#7C2D12', effect: 'offset' }),
  preset('slate', 'Slate', { bg: ['#64748B', '#334155'], fg: '#F1F5F9' }),
  preset('ruby', 'Ruby', { bg: ['#EF4444', '#7F1D1D'], bgAngle: 160, fg: '#FFFFFF' }),
  preset('gold', 'Gold', { bg: ['#FDE68A', '#F59E0B'], fg: '#78350F' }),
  preset('lavender', 'Lavender', { bg: ['#C4B5FD', '#7C3AED'], fg: '#FFFFFF' }),
  preset('mono', 'Mono', { bg: '#111827', fg: '#FFFFFF', corner: 12, padding: 20 }),
];

/** Apply a preset over the current config, keeping the foreground and its transform. */
export function applyPreset(config: IconConfig, presetToApply: StylePreset): IconConfig {
  return { ...config, ...presetToApply.config };
}

const SHUFFLE_CORNERS = [12, 18, 22, 22, 30, 50];
const SHUFFLE_EFFECTS: IconConfig['iconEffect'][] = ['none', 'none', 'drop-shadow', 'cast-shadow', 'score', 'outline', 'offset'];

function pick<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/** Random but coherent style: harmonious gradient background + a readable foreground color. */
export function shuffleStyle(config: IconConfig): IconConfig {
  const g = randomGradient();
  const first = g.stops[0].color;
  const last = g.stops[g.stops.length - 1].color;
  const fg = pickReadableTextColor(first);
  return {
    ...config,
    backgroundGradient: true,
    backgroundGradientStops: g.stops,
    backgroundGradientAngle: g.angle,
    backgroundColor: first,
    backgroundGradientStart: first,
    backgroundGradientEnd: last,
    iconGradient: false,
    iconColor: fg,
    iconGradientStart: fg,
    iconGradientEnd: fg,
    usePartColors: false,
    cornerRadius: pick(SHUFFLE_CORNERS),
    iconEffect: pick(SHUFFLE_EFFECTS),
    iconEffectOpacity: 100,
  };
}
