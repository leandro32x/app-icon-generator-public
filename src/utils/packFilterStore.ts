import { STYLE_FAMILIES } from './iconifyCollections';

const STORAGE_KEY = 'license-filter-settings';

type FilterSettings = Record<string, boolean>; // SPDX code → enabled

export function getKnownSpdxCodes(): Set<string> {
  return new Set(STYLE_FAMILIES.map((f) => f.license.spdx));
}

function loadSettings(): FilterSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as FilterSettings;
  } catch {
    // ignore parse errors
  }
  // Default: all licenses enabled.
  const defaults: FilterSettings = {};
  for (const spdx of getKnownSpdxCodes()) {
    defaults[spdx] = true;
  }
  return defaults;
}

function saveSettings(settings: FilterSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors (e.g. private browsing quota)
  }
}

/** Returns the set of SPDX codes whose packs are currently visible. */
export function getEnabledLicenseSpdxCodes(): Set<string> {
  const settings = loadSettings();
  const enabled = new Set<string>();
  for (const spdx of getKnownSpdxCodes()) {
    // Treat missing key as enabled (forward-compatible with new licenses).
    if (settings[spdx] !== false) {
      enabled.add(spdx);
    }
  }
  return enabled;
}

/**
 * Returns the set of SPDX codes explicitly disabled by the user.
 * Uses a blacklist approach so collections with uncontrolled licenses are
 * never accidentally hidden.
 */
export function getDisabledSpdxCodes(): Set<string> {
  const settings = loadSettings();
  const disabled = new Set<string>();
  for (const [spdx, enabled] of Object.entries(settings)) {
    if (!enabled) disabled.add(spdx);
  }
  return disabled;
}

/** Enable or disable all packs sharing a given SPDX license code. */
export function setLicenseEnabled(spdx: string, enabled: boolean): void {
  const settings = loadSettings();
  settings[spdx] = enabled;
  saveSettings(settings);
  filterVersion++;
  listeners.forEach((cb) => cb());
}

/**
 * Derives the set of enabled family ids from the disabled SPDX codes.
 * Uses the blacklist so newly-disabled API SPDX codes are also respected.
 * Used by IconGenerator to filter the collection picker.
 */
export function getEnabledFamilyIds(): Set<string> {
  const disabledSpdx = getDisabledSpdxCodes();
  const enabled = new Set<string>();
  for (const f of STYLE_FAMILIES) {
    if (!disabledSpdx.has(f.license.spdx)) {
      enabled.add(f.id);
    }
  }
  return enabled;
}

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Monotonically-increasing counter. Bumped on every change so that
 * `useSyncExternalStore` callers can detect mutations by value equality.
 */
let filterVersion = 0;

/** Returns the current filter-change version (stable snapshot for useSyncExternalStore). */
export function getFilterVersion(): number {
  return filterVersion;
}

/** Subscribe to filter changes. Returns an unsubscribe function. */
export function subscribeToPackFilter(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
