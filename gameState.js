// Single source of truth for long-term game progress.
//
// Per docs/IMPLEMENTATION_SPEC.md §369~435 / §371. Everything that should
// survive a refresh (research funds, discoveries, papers, expeditions, …)
// lives in this exported `gameState` object. Transient canvas / input state
// (current strokes, hover position, draw mode) stays in `main.js` and is NOT
// stored here.
//
// Design notes:
//   - The `gameState` export is a *mutable singleton*. Modules that want to
//     update progress mutate it in place; never reassign the reference.
//     This lets multiple consumers (UI panel, save loop, debug console)
//     observe the same object without subscribing to a getter.
//   - `createInitialState()` returns a *fresh deep copy* — used by save/load
//     for "new game" reset and by tests.
//   - `version` is bumped whenever the schema changes; saveLoad.js handles
//     migration.

export const STATE_VERSION = 2;

/**
 * Build a brand-new game state with default values. Always returns a fresh
 * deep copy so callers can mutate without bleeding into the singleton.
 */
export function createInitialState() {
  return {
    version: STATE_VERSION,

    resources: {
      researchFunds: 500,
      reputation: 0,
      degreeScore: 0,
      mentalHealth: 100,
      stamina: 100,
    },

    progression: {
      currentPhase: 1,
      currentWeek: 1,
      currentDay: 1,
      warnings: 0,
      unlockedRunes: [],
      unlockedMaterials: ['parchment'],
      unlockedEquipment: [],
    },

    discoveries: {
      // Map<signatureHash, DiscoveryRecord> — see M6 (§551~553).
      bySignature: {},
      // Most-recent-first ring buffer of signatures, capped to ~50.
      recentSignatures: [],
    },

    papers: {
      drafts: [],
      submitted: [],
      accepted: [],
      rejected: [],
      disputes: [],
    },

    expeditions: {
      active: [],
      completed: [],
      unlockedSiteIds: [],
    },

    economy: {
      activeGrants: [],
      activeContracts: [],
      scrollOrders: [],
      weeklyIncome: [],
    },

    academic: {
      // Map<canonId, override> — player rebuttals to the academic canon.
      canonOverrides: {},
      // Map<npcId, { trust, debts, last_interaction }> — relations tracker.
      npcRelations: {},
      citations: [],
    },

    settings: {
      blindDiscovery: true,
      debugShowLegacyNames: false,
      autosave: true,
    },
  };
}

/**
 * The live, mutable game state. Imported by every module that needs to read
 * or write long-term progress. Replaced *in place* by saveLoad.js — never
 * reassigned, so consumers can hold the reference across reloads.
 */
export const gameState = createInitialState();

/**
 * Replace every key of `gameState` with the contents of `next` (deep). Used by
 * saveLoad.js after parsing localStorage so that holders of `gameState` keep
 * the same reference but see the loaded data.
 *
 * Top-level keys present in `next` are written through; keys absent from
 * `next` are reset to their initial values so partial saves don't leave
 * stale state behind.
 */
export function replaceState(next) {
  const fresh = createInitialState();
  for (const key of Object.keys(fresh)) {
    if (Object.prototype.hasOwnProperty.call(next, key)) {
      gameState[key] = next[key];
    } else {
      gameState[key] = fresh[key];
    }
  }
  // Drop any unknown extra top-level keys that may have leaked in from a
  // future / corrupted save file.
  for (const key of Object.keys(gameState)) {
    if (!Object.prototype.hasOwnProperty.call(fresh, key)) {
      delete gameState[key];
    }
  }
}

/**
 * Reset to defaults *in place* so consumers keep the same reference.
 */
export function resetState() {
  replaceState(createInitialState());
}
