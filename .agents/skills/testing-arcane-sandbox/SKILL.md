---
name: testing-arcane-sandbox
description: How to run and end-to-end test the Arcane Sandbox app (Vite + canvas-based magic-rune sandbox). Use when verifying RUNE_DICTIONARY features (§2 radicals, §9 arrangement, §10 bone interaction, §§11-12 sentences) by drawing on the canvas via computer-use, OR when verifying DOM/UI bugs that don't need real rendering (use the jsdom harness fallback).
---

# Testing Arcane Sandbox (test_antigravity)

## Run

- `npm install` (first time only)
- `npm run dev` — starts Vite on `http://localhost:5173`. If 5173 is busy Vite auto-falls through to 5174/5175 — read `/tmp/dev.log` for the actual port.
- `npm run build` — production build to `dist/`, expect ~65 kB / gzip ~20 kB.

## Unit tests

Ad-hoc ESM harnesses (not in `package.json`):

- `node /tmp/test_bone.mjs` — bone-interaction (§10 Phase 1 & 2). 30 cases.
- `node /tmp/test_sentence.mjs` — sentence analyzer (§§11-12). 36 cases.

They import directly from `/home/ubuntu/repos/test_antigravity/*.js` so paths must be absolute.

## jsdom harness fallback (when Chrome won't start)

Chrome may fail to start in the VM (immediate exit, no window). For DOM/UI bugs that don't need real CSS rendering — tab switching, button visibility, event handlers, gameState mutations — use a jsdom harness instead. The pattern that works:

1. **Place the harness inside the repo** (e.g. `scratch/<name>.mjs`). jsdom is in the repo's `node_modules`, so a script in `/tmp/` will hit `ERR_MODULE_NOT_FOUND` for the bare `jsdom` specifier.
2. **Install jsdom locally if missing**: `npm install --no-save jsdom` (lockfile stays clean).
3. **Wire jsdom globals via `Object.defineProperty`, not direct assignment**. In modern Node, `globalThis.navigator` is read-only — direct assignment throws `TypeError: Cannot set property navigator of #<Object> which has only a getter`. Use a `wireGlobal(key, value)` helper that wraps `Object.defineProperty(globalThis, key, { configurable: true, writable: true, value })` in a try/catch. Skip `navigator` entirely if not needed by the modules under test.
4. **DO NOT cache-bust dynamic imports with `?t=${Date.now()}`**. Within one Node run, ESM modules are cached by URL — using different cache-busting strings creates SEPARATE module instances. If the harness imports `gameState.js` and `labNotebook.js` (which itself imports `gameState.js`) with different cache busters, the harness's `gameState` reference will be a different object from the one the UI mutates. Symptom: the UI clearly worked (panel rendered, accepted++ in its copy) but the harness's `gameState.papers.accepted.length` reads as `0`. Drop the cache buster.
5. **Load index.html with jsdom**, then dynamic-import the ESM modules in dependency order, then call init functions.

Minimal harness skeleton (`scratch/<name>.mjs`):

```js
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { JSDOM } from 'jsdom';

const repoPath = process.argv[2] || process.cwd();
const html = readFileSync(resolve(repoPath, 'index.html'), 'utf8');
const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;

const wireGlobal = (k, v) => {
  try { Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: v }); }
  catch { /* read-only in node — skip */ }
};
for (const k of ['window','document','localStorage','HTMLElement','Element','Node','Event','MouseEvent']) wireGlobal(k, window[k]);
wireGlobal('requestAnimationFrame', cb => setTimeout(cb, 16));
wireGlobal('cancelAnimationFrame', id => clearTimeout(id));

const importFromRepo = rel => import(pathToFileURL(resolve(repoPath, rel)).href); // NO cache buster

const { gameState } = await importFromRepo('gameState.js');
const { initLabNotebook } = await importFromRepo('labNotebook.js');
initLabNotebook();
// ...drive events, assert DOM/state...
```

Run: `node scratch/<name>.mjs /home/ubuntu/repos/test_antigravity` (must run from inside the repo or with NODE_PATH pointing at it).

**To prove a regression-fix isn't a placebo, run the same harness on `main` and on the fix branch.** A well-designed test case will FAIL on `main` with the symptom-level assertion (e.g. `display === 'block'` after tab click), then PASS on the fix branch.

Limitations:

- jsdom doesn't compute layout — only `style.display` from inline/style attrs. Real CSS rules in stylesheets are NOT applied. If the bug is a CSS layout/visual issue (z-index, flex collapse, theme color) jsdom won't catch it; need a real browser.
- jsdom's canvas is a stub — for canvas-rendering bugs use computer-use with the real game.

## UI cheat sheet

| Button (devinid) | Action |
|---|---|
| 0 | 카운트다운 시작 (start dimensional rift, irrelevant for sandbox testing) |
| 3 | **너대 그으니 (Bone)** — switch to bone-drawing mode |
| 4 | **룬 쓰기 (Rune)** — switch to rune-drawing mode |
| 5 | 자유 그리기 (Free) |
| 6 | 직선 자 (Ruler) |
| 7 | 컴퍼스 (Compass) — single drag becomes a recognizable circle (good for fast §12 grade tests) |
| 8 | 한 회 취소 (Undo) |
| 9 | 초기화 (Clear) |

## Analyzer panel rows (top-right) — the things to assert against

```
공명 (Resonance)         <Hz>
열 (Heat)               <°C>
불안정성 (Instability)   <%>
배치 (Arrangement)       <label> ×<powerMul>     ← §9
  <arrangement-detail>
너대 상호작용 (Bone)     <label> ×<powerMul>     ← §10
  <bone-detail>                                  e.g. '단선 (─)', '먼에은 2.0회 감기'
문장 (Sentence)         <grade> ×<powerMul>     ← §11-12
  <sentence-detail>                              e.g. '절 · 투사 · S-V-O'
```

Assertions should compare the EXACT panel string (e.g. `연결 ×0.9 / 단선 (─)`), not the raw values. Strings come from BRIDGE_TABLE, GRADE, DIRECTIONS in `bone-interaction.js` / `sentence.js`.

## Archive panel id ↔ data-tab convention

The archive tabs (`labNotebook.js`) use `data-tab="X"` and look up panels by id `X-panel`. Convention is **singular**: `notebook` / `library` / `paper` / `discoveries`. If a new tab is added, both must match — the panel id `paper-panel` requires the button to be `data-tab="paper"`, not `"papers"`. A mismatch sets the panel itself to `display: none` (because the tab-switch code hides every child whose id !== `${tab}-panel`), so nothing inside the panel shows up.

## How to draw via computer-use

Single straight stroke: `left_click_drag(start, end)`.

Multi-stroke shape (e.g. triangle = 3 strokes):
```
left_click_drag([200,320], [160,410])
left_click_drag([160,410], [240,410])
left_click_drag([240,410], [200,320])
```

Curved/spiral stroke (mouse_down without coordinate — `coordinate` is rejected on `left_mouse_down`):
```
mouse_move(coordinate=[start_x, start_y])
left_mouse_down                          # NO coordinate field
mouse_move(...)  # …many points…
left_mouse_up                            # NO coordinate field
```

## Recognizer pitfalls

- Three identical vertical lines often fail to recognize a single line as `이사(|)` reliably — use **3 compass-circles** (single drag in Compass mode) for a deterministic 3-rune §12 § test. Compass output always recognizes.
- Drawing 3 triangles can OVERLOAD the system (Heat ≥ 200°C, Instability 100%) and the analyzer switches to a `[경고] 붕괴 임박!` warning that hides the Sentence row. Use simpler runes for grade tests.
- **Cluster proximity** uses a 6%-of-overall-span pad (see `clusterStrokesByProximity` in `recognition.js`). Two rune clusters ≥ ~25% of the canvas width apart cluster separately reliably.

## `analyzeBoneInteraction` priority order (top to bottom)

This order matters when designing tests — the first matching kind wins:

1. **Bridging (연결)** — ≥2 rune clusters + bone touches both.
2. **Wrapping early-out (감싸기, turns ≥1.5)** — added in commit `354da26`. Without this a multi-turn spiral falls into Enclosing.
3. **Enclosing (가두기)** — closed bone shape (circle/triangle/square/rhombus) surrounds rune.
4. **Crossing / Piercing (걸치기 / 관통)** — single line crosses rune bbox.
5. **십자 걸치기** — two perpendicular lines both crossing.
6. **Underlying (받치기)** — bone drawn before rune, sits below.
7. **Wrapping fallback (감싸기, turns ≥0.75)** — catches arcs that wind ≥3/4 turn but didn't fire as the early-out.

## Skipped-on-purpose features

- **§11.2 조사 (particle system: 격조사·강도부사·시제·부정)** — deliberately not implemented because §2 radical pipeline already covers the same semantics; double-counting was the documented reason.
- **Named spell pattern recognition (화빙 쌍포, 화염결계 etc.)** — not implemented; only generalized patterns (S-V, S-V-O, 조건-결과, 봉인, 순환) are matched. PR #9 description.
