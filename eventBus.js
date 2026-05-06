// Event bus — minimal pub/sub for cross-module communication.
//
// Modules that produce game-relevant events (magic cast, discovery, paper
// submission, expedition completion, …) emit named events here. Other modules
// (UI panels, autosave, achievements, …) subscribe by name. This avoids hard
// imports between feature modules so M6/M7/M8 can be developed and tested in
// isolation per docs/IMPLEMENTATION_SPEC.md §138~149.
//
// Listener errors are caught so a buggy subscriber cannot break event delivery
// to the rest of the listeners.

const listeners = new Map();

/**
 * Subscribe to a named event. Returns an unsubscribe function for convenience.
 * @param {string} name
 * @param {(payload: any) => void} fn
 */
export function on(name, fn) {
  if (typeof fn !== 'function') {
    throw new TypeError(`eventBus.on(${name}): listener must be a function`);
  }
  let set = listeners.get(name);
  if (!set) {
    set = new Set();
    listeners.set(name, set);
  }
  set.add(fn);
  return () => off(name, fn);
}

/**
 * Subscribe but auto-unsubscribe after the first delivery.
 */
export function once(name, fn) {
  const off = on(name, (payload) => {
    off();
    fn(payload);
  });
  return off;
}

/**
 * Remove a previously registered listener. Safe to call with an unknown fn.
 */
export function off(name, fn) {
  const set = listeners.get(name);
  if (!set) return;
  set.delete(fn);
  if (set.size === 0) listeners.delete(name);
}

/**
 * Emit a named event. Listeners are invoked synchronously in registration
 * order. Errors thrown by listeners are caught and logged; they do not stop
 * delivery to remaining listeners.
 */
export function emit(name, payload) {
  const set = listeners.get(name);
  if (!set || set.size === 0) return;
  // Snapshot so a listener that subscribes/unsubscribes during dispatch
  // doesn't mutate the iteration.
  for (const fn of [...set]) {
    try {
      fn(payload);
    } catch (err) {
      console.error(`[eventBus] listener for "${name}" threw:`, err);
    }
  }
}

/**
 * Drop every listener. Used by save-game reload and tests.
 */
export function clear() {
  listeners.clear();
}

/**
 * Inspection helper for tests / dev tools.
 */
export function listenerCount(name) {
  if (name === undefined) {
    let total = 0;
    for (const set of listeners.values()) total += set.size;
    return total;
  }
  return listeners.get(name)?.size ?? 0;
}

/**
 * Canonical event name list. Keeping these as constants prevents typos at
 * call sites and gives a single grep target for "where do we react to X?".
 *
 * Conventions:
 *   - past tense, lowercase, namespace:verb (e.g. "magic:analyzed")
 *   - payload is an object (never a positional arg list)
 *   - new event names go here so consumers can find them
 */
export const Events = Object.freeze({
  // M2: analysis pipeline — fired every time the canvas analysis updates
  //     (per stroke). UI panels listen.
  MAGIC_ANALYZED: 'magic:analyzed',

  // M2: Cast button pressed — Rift game and discovery system listen.
  MAGIC_CAST: 'magic:cast',

  // M6: Discovery system — new signature recorded or reproduction count up.
  DISCOVERY_RECORDED: 'discovery:recorded',
  DISCOVERY_NAMED: 'discovery:named',

  // M7: Paper system.
  PAPER_SUBMITTED: 'paper:submitted',
  PAPER_REVIEWED: 'paper:reviewed',

  // M8: Schedule / week tick.
  WEEK_ADVANCED: 'schedule:weekAdvanced',
  PHASE_UNLOCKED: 'phase:unlocked',

  // Save/load lifecycle.
  STATE_LOADED: 'state:loaded',
  STATE_SAVED: 'state:saved',
});
