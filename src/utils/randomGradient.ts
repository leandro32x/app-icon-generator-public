/**
 * Random gradient generator.
 *
 * Produces aesthetically pleasing linear gradients using a constrained-HSL
 * strategy (analogous hues, bounded saturation/lightness) rather than fully
 * random RGB, which tends to clash or go muddy in the middle. Returns the same
 * `{ stops, angle }` shape the gradient config already uses.
 */
import { hslToHex } from './color';
import type { GradientStop } from './gradient';

// Diagonals and cardinals read best; pick from a fixed set instead of any angle.
const NICE_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

const rand = (min: number, max: number) => Math.random() * (max - min) + min;
const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** A pleasing random linear gradient: analogous hues with constrained S/L. */
export function randomGradient(): { stops: GradientStop[]; angle: number } {
  const count = Math.random() < 0.3 ? 3 : 2; // mostly 2 stops, sometimes 3
  const baseH = rand(0, 360);
  const dir = Math.random() < 0.5 ? 1 : -1; // consistent hue drift direction
  const step = rand(20, 45); // analogous spacing (avoids clashing pairs)
  const baseS = rand(0.65, 0.9);
  const baseL = rand(0.5, 0.62);

  const stops: GradientStop[] = [];
  for (let i = 0; i < count; i++) {
    const h = baseH + dir * step * i;
    const s = Math.max(0.5, baseS - i * 0.06); // floor 50% -> middle never goes muddy/gray
    const l = Math.min(0.7, baseL + i * 0.04);
    const position = Math.round((i / (count - 1)) * 100);
    stops.push({ color: hslToHex(h, s, l), position });
  }
  return { stops, angle: pick(NICE_ANGLES) };
}
