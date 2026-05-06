// LocalStorage save / load for `gameState`.
//
// Per docs/IMPLEMENTATION_SPEC.md §371~435 acceptance criteria:
//   - 새로고침해도 연구 노트와 자원 값이 유지된다.
//   - 개발자 콘솔에서 window.__ARCANE_STATE__로 현재 상태를 확인할 수 있다.
//
// One key per save slot. Serialized as JSON. Older save versions are migrated
// forward when possible; otherwise we keep defaults and stash the raw blob
// under a backup key so the player doesn't lose their progress silently.

import { gameState, replaceState, resetState, createInitialState, STATE_VERSION } from './gameState.js';
import { emit, Events } from './eventBus.js';

const STORAGE_KEY = 'arcane-sandbox.v2';
const BACKUP_KEY  = 'arcane-sandbox.backup';

function getStorage() {
  // Defensive: localStorage can throw on the very first access in private
  // browsing or sandboxed iframes. Treat any failure as "no persistence".
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    // touch storage so we surface a SecurityError now, not at save time.
    window.localStorage.getItem(STORAGE_KEY);
    return window.localStorage;
  } catch (err) {
    console.warn('[saveLoad] localStorage unavailable:', err?.message ?? err);
    return null;
  }
}

/**
 * Read the persisted blob and merge it into `gameState`. Idempotent — safe to
 * call once at boot.
 *
 * Returns:
 *   { status: 'loaded' }   — existing save merged.
 *   { status: 'fresh'  }   — no save found, defaults retained.
 *   { status: 'migrated', from: <oldVer>, to: STATE_VERSION }
 *   { status: 'corrupt', error }  — save unparseable; backed up.
 *   { status: 'unavailable' }     — localStorage not usable.
 */
export function loadGame() {
  const storage = getStorage();
  if (!storage) return { status: 'unavailable' };

  const raw = storage.getItem(STORAGE_KEY);
  if (!raw) {
    emit(Events.STATE_LOADED, { status: 'fresh', state: gameState });
    return { status: 'fresh' };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    console.warn('[saveLoad] save blob unparseable; backing up under', BACKUP_KEY);
    storage.setItem(BACKUP_KEY, raw);
    storage.removeItem(STORAGE_KEY);
    resetState();
    emit(Events.STATE_LOADED, { status: 'corrupt', state: gameState });
    return { status: 'corrupt', error: err?.message ?? String(err) };
  }

  const fromVersion = typeof parsed?.version === 'number' ? parsed.version : 0;

  let migrated = parsed;
  let didMigrate = false;
  if (fromVersion !== STATE_VERSION) {
    migrated = migrate(parsed, fromVersion, STATE_VERSION);
    didMigrate = true;
  }

  replaceState(migrated);

  if (didMigrate) {
    // Persist immediately so the migrated shape replaces the old blob.
    saveGame();
    emit(Events.STATE_LOADED, { status: 'migrated', from: fromVersion, to: STATE_VERSION, state: gameState });
    return { status: 'migrated', from: fromVersion, to: STATE_VERSION };
  }

  emit(Events.STATE_LOADED, { status: 'loaded', state: gameState });
  return { status: 'loaded' };
}

/**
 * Persist `gameState` to localStorage. Returns true on success.
 */
export function saveGame() {
  const storage = getStorage();
  if (!storage) return false;
  try {
    const blob = JSON.stringify(gameState);
    storage.setItem(STORAGE_KEY, blob);
    emit(Events.STATE_SAVED, { state: gameState, size: blob.length });
    return true;
  } catch (err) {
    console.error('[saveLoad] save failed:', err);
    return false;
  }
}

/**
 * Wipe the persisted save and reset `gameState` to defaults. Used by a
 * future "new game" button and by tests.
 */
export function clearSave() {
  const storage = getStorage();
  if (storage) {
    storage.removeItem(STORAGE_KEY);
  }
  resetState();
}

/**
 * Forward-migrate a stored snapshot to STATE_VERSION. Each step is small and
 * idempotent so we can chain them without loops.
 */
function migrate(stored, fromVersion, toVersion) {
  let current = stored;

  // v0/v1 → v2: introduce structured top-level groups (resources/progression/
  // discoveries/papers/expeditions/economy/academic/settings). Old saves that
  // pre-date the spec are treated as fresh — there is no production data to
  // preserve so we just adopt defaults but try to keep individual fields if
  // the user already had them at the top level.
  if (fromVersion < 2 && toVersion >= 2) {
    const fresh = createInitialState();
    current = {
      ...fresh,
      ...current,
      resources:    { ...fresh.resources,    ...(current.resources    ?? {}) },
      progression:  { ...fresh.progression,  ...(current.progression  ?? {}) },
      discoveries:  { ...fresh.discoveries,  ...(current.discoveries  ?? {}) },
      papers:       { ...fresh.papers,       ...(current.papers       ?? {}) },
      expeditions:  { ...fresh.expeditions,  ...(current.expeditions  ?? {}) },
      economy:      { ...fresh.economy,      ...(current.economy      ?? {}) },
      academic:     { ...fresh.academic,     ...(current.academic     ?? {}) },
      settings:     { ...fresh.settings,     ...(current.settings     ?? {}) },
      version:      STATE_VERSION,
    };
  }

  // Future migrations chain here.

  current.version = STATE_VERSION;
  return current;
}

// Keys exported for tests and dev tooling.
export const __INTERNAL__ = { STORAGE_KEY, BACKUP_KEY, migrate };
