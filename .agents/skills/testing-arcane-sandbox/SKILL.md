---
name: testing-arcane-sandbox
description: How to run and end-to-end test the Arcane Sandbox app (Vite + canvas-based magic-rune sandbox). Use when verifying RUNE_DICTIONARY features (§2 radicals, §9 arrangement, §10 bone interaction, §§11-12 sentences) by drawing on the canvas via computer-use.
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
  <bone-detail>                                  e.g. '단선 (─)', '먼에은 2.0회 감기'
문장 (Sentence)         <grade> ×<powerMul>     ← §11-12
  <sentence-detail>                              e.g. '절 · 투사 · S-V-O'
```

Assertions should compare the EXACT panel string (e.g. `연결 ×0.9 / 단선 (─)`), not the raw values. Strings come from BRIDGE_TABLE, GRADE, DIRECTIONS in `bone-interaction.js` / `sentence.js`.

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
