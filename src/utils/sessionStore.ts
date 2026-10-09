import type { BannerConfig } from '../components/BannerPreview';
import { migrateLegacyIconUrl, type IconSource } from './iconManager';
import { normalizeIconConfig, type IconConfig } from './iconConfig';
import { fontIdFromFamily } from './fontLoader';

// The canonical config shape lives in utils/iconConfig.ts; re-exported so
// existing `sessionStore` imports keep working.
export type { IconConfig } from './iconConfig';

/**
 * Thrown by every persisting call when `localStorage` rejects the write.
 * `code === 'quota'` means the origin's storage is full — sessions that carry
 * uploaded images can be several hundred KB each.
 */
export class SessionStorageError extends Error {
  code: 'quota' | 'unknown';

  constructor(code: 'quota' | 'unknown', message: string) {
    super(message);
    this.name = 'SessionStorageError';
    this.code = code;
  }
}

export interface SavedSession {
  id: string;
  name: string;
  createdAt: string;
  /**
   * @deprecated Sessions are previewed with a live `IconTile` from their
   * config; nothing writes or reads this anymore. Kept so older exports and
   * imports keep validating.
   */
  thumbnail?: string | null;
  state: {
    generatedIcon: string | null;
    iconSource: IconSource;
    iconStyle: string;
    iconConfig: IconConfig;
    bannerConfig: BannerConfig;
  };
}

const STORAGE_KEY = 'app-icon-generator-sessions';
const MAX_SESSIONS = 20;

export function getSavedSessions(): SavedSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const sessions: SavedSession[] = JSON.parse(raw);
    return sessions
      .map(migrateSessionIconUrls)
      .map(normalizeSession)
      .sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
  } catch {
    return [];
  }
}

/**
 * Best-effort on-read migration of saved sessions from the legacy
 * `icon:PascalName:source` format to the new `iconify:prefix:name` form.
 *
 * Uses the session's stored `iconStyle` to disambiguate phosphor/solar
 * variants. We do NOT write the migrated value back to storage here —
 * that happens naturally the next time the user saves.
 */
function migrateSessionIconUrls(session: SavedSession): SavedSession {
  const { generatedIcon, iconStyle } = session.state;
  if (!generatedIcon || generatedIcon.startsWith('iconify:')) return session;
  const migrated = migrateLegacyIconUrl(generatedIcon, iconStyle);
  if (!migrated) return session;
  return {
    ...session,
    state: { ...session.state, generatedIcon: migrated },
  };
}

/**
 * Fill in fields that older sessions / hand-edited imports may lack, so the
 * rest of the app (e.g. the session manager's live `IconTile`) can rely on a
 * complete shape without merging over defaults itself.
 */
function normalizeSession(session: SavedSession): SavedSession {
  return {
    ...session,
    state: {
      ...session.state,
      iconConfig: normalizeIconConfig(session.state.iconConfig),
      bannerConfig: normalizeBannerConfig(session.state.bannerConfig),
    },
  };
}

/**
 * Banner sessions saved before the Fontsource picker stored only the CSS
 * family name. Backfill the font id here (not in App's merge-over-defaults,
 * which would otherwise pair the default `fontId` with a restored `font`).
 */
function normalizeBannerConfig(raw: BannerConfig): BannerConfig {
  const family = raw?.font || 'Inter';
  return { ...raw, font: family, fontId: raw?.fontId || fontIdFromFamily(family) };
}

function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: string; code?: number };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014
  );
}

/** Write the session list, translating storage failures into `SessionStorageError`. */
function persistSessions(sessions: SavedSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
  } catch (err) {
    if (isQuotaError(err)) {
      throw new SessionStorageError(
        'quota',
        'Not enough browser storage to save this session. Delete an older session (sessions with uploaded images are large) and try again.',
      );
    }
    throw new SessionStorageError('unknown', 'The session could not be saved to browser storage.');
  }
}

export function saveSession(session: SavedSession): void {
  const sessions = getSavedSessions();
  sessions.unshift(session);
  // Enforce cap — drop oldest sessions beyond the limit
  const trimmed = sessions.slice(0, MAX_SESSIONS);
  persistSessions(trimmed);
}

export function deleteSession(id: string): void {
  const sessions = getSavedSessions().filter((s) => s.id !== id);
  persistSessions(sessions);
}

export function generateDefaultName(): string {
  const now = new Date();
  return `Icon - ${now.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })} ${now.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })}`;
}

// --- JSON import / export ------------------------------------------------

const EXPORT_VERSION = 1;

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'session';
}

function triggerDownload(data: string, filename: string) {
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Give the browser a tick to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Download a single saved session as a JSON file. */
export function exportSessionToJson(session: SavedSession): void {
  const payload = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    sessions: [session],
  };
  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(
    JSON.stringify(payload, null, 2),
    `icon-session-${slugify(session.name)}-${date}.json`,
  );
}

/** Download all saved sessions as a single JSON file. */
export function exportAllSessionsToJson(): void {
  const sessions = getSavedSessions();
  const payload = {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    sessions,
  };
  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(
    JSON.stringify(payload, null, 2),
    `app-icon-sessions-${date}.json`,
  );
}

function isValidSessionShape(s: unknown): s is SavedSession {
  if (!s || typeof s !== 'object') return false;
  const o = s as Record<string, unknown>;
  if (typeof o.name !== 'string') return false;
  if (!o.state || typeof o.state !== 'object') return false;
  const state = o.state as Record<string, unknown>;
  if (!state.iconConfig || typeof state.iconConfig !== 'object') return false;
  if (!state.bannerConfig || typeof state.bannerConfig !== 'object') return false;
  return true;
}

export interface ImportResult {
  added: number;
  skipped: number;
}

/**
 * Import sessions from a user-provided JSON file. Accepts both the
 * multi-session export format produced by `exportAllSessionsToJson` and a
 * bare session object (to be forgiving with manual edits).
 *
 * Sessions are appended to the existing list; the overall `MAX_SESSIONS`
 * cap still applies. Colliding ids get a fresh one.
 */
export async function importSessionsFromJson(file: File): Promise<ImportResult> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('File is not valid JSON.');
  }

  let incoming: unknown[] = [];
  if (Array.isArray(parsed)) {
    incoming = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.sessions)) {
      incoming = obj.sessions;
    } else if (isValidSessionShape(obj)) {
      incoming = [obj];
    }
  }
  if (incoming.length === 0) {
    throw new Error('No sessions found in file.');
  }

  const existing = getSavedSessions();
  const existingIds = new Set(existing.map((s) => s.id));

  let added = 0;
  let skipped = 0;
  const toAdd: SavedSession[] = [];

  for (const raw of incoming) {
    if (!isValidSessionShape(raw)) { skipped++; continue; }
    // Assign fresh id on collision or missing id, and preserve createdAt when
    // present. Run the URL migration so old lucide/phosphor exports continue
    // to resolve. The legacy `thumbnail` data URL is dropped — previews are
    // rendered live from the config.
    const id = typeof raw.id === 'string' && !existingIds.has(raw.id)
      ? raw.id
      : (typeof crypto !== 'undefined' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
    const createdAt = typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString();
    const { thumbnail: _legacyThumbnail, ...rest } = raw;
    void _legacyThumbnail;
    const session: SavedSession = normalizeSession(
      migrateSessionIconUrls({
        ...rest,
        id,
        createdAt,
      }),
    );
    toAdd.push(session);
    existingIds.add(id);
    added++;
  }

  const merged = [...toAdd, ...existing].slice(0, MAX_SESSIONS);
  persistSessions(merged);
  return { added, skipped };
}

