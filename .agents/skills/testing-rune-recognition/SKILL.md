---
name: testing-rune-recognition
description: End-to-end test the $P rune recognizer in arcane-sandbox by drawing in the live UI. Use whenever changes touch recognition.js (templates, threshold, radical extraction) or main.js drawing handlers (FREE/RULER/COMPASS). Covers aspect-ratio caveats specific to $P uniform-scale matching.
---

# Test runtime rune recognition

The project is a Vite + Vanilla JS canvas app. There is no automated UI test harness, so the only realistic way to verify recognition is to draw shapes in the live UI and read the right-panel `에너지 분석기` system status.

## How to bring up the app

```bash
cd /home/ubuntu/repos/test_antigravity
npm install   # only if node_modules missing
npm run dev   # Vite picks the next free port if 5173 is taken
```

Vite logs `Local: http://localhost:<port>/`. Open that URL in Chrome. There is no build step required for testing.

## Where recognition output appears

- Right panel, element id `#system-status` (defined in `index.html`).
- Format depends on `state.resonance` and `state.instability`:
  - `대기 중...` (idle, no strokes)
  - `분석 중: <name>` (rune analyzed, low resonance — most common path during testing)
  - `발현 중: <name> - <dynamics>` (resonance > 30, requires bones too)
  - `[경고] 붕괴 임박! (<name>)` (instability > 80)
- Rune name format is `<korean>(<symbol>)`. Templates and names live in `recognition.js` `RAW_TEMPLATES`. There are 13 templates as of PR #1.
- `알 수 없는 문양` means recognition returned `null` (distance > `RecognitionEngine.MATCH_THRESHOLD`, which is `0.85`).

## UI flow per test

1. Click `룬 쓰기 (RUNE)` in the bottom toolbar — strokes turn pink and `state.mode === 'rune'`. If you skip this, strokes are tagged `bone` (cyan) and recognition is never tried (the user has hit this exact mistake — Tiwaz drawn in BONE mode reads as 37.5 Hz resonance with no rune name).
2. Pick an assist mode:
   - `자유 그리기 (FREE)` — captures every mousemove. This is the closest to real player input.
   - `직선 자 (RULER)` — internally densifies the line to 33 points (segments=32). This is required because `recognition.js` early-returns when `points.length < 5`.
   - `컴퍼스 (COMPASS)` — emits a 32-segment circle from drag start to current cursor radius.
3. Draw the rune by mouse-drag. Each `left_click_drag` is one stroke. Multi-stroke runes need multiple drags.
4. Read `#system-status`. Pass = the expected name appears as a substring.
5. Click `초기화 (CLEAR)` to reset (`state.strokes = []`, status returns to `대기 중...`) before the next attempt.

## Aspect-ratio caveats ($P uniform-scale limitation)

`recognition.js` `Scale()` normalizes by `max(width, height)`, so non-square strokes get squashed against the templates (which are all defined in a 100×100 box). In practice this means:

- **하갈라즈(H)** at 240×160 reads `알 수 없는 문양`. Drawing at ~160×160 matches. If a future change adds a stretched H test, expect this to fail and consider switching to anisotropic Scale.
- **에와즈(M)** is sensitive to where the inner V apex sits. Template puts the V apex flush to the bottom of the verticals. If the apex is 30+ px above, the cloud distance crosses the threshold and falls through.
- The other 11 shapes (single-line, X, Y, △, ◇, +, L, <, ○) tolerate moderate aspect skew because their bounding boxes are roughly square already.

When testing freehand drawing programmatically (e.g. via the `computer` tool), aim for square-ish bounding boxes around (510, 400) ±120 px to avoid these caveats. Real players naturally hit them; document the limitation in the PR description rather than treating it as a regression.

## Negative test

Draw 3 random crossing lines in RUNE+FREE mode. Status should read `알 수 없는 문양`. If it matches a real rune, the threshold (`MATCH_THRESHOLD = 0.85` in `recognition.js`) is too loose.

## Archive panel navigation

Top-left panel `고문헌 보관소`. The `<` and `>` buttons cycle through the archives array in `main.js`. As of PR #1 there are 13 entries (one per rune). Badges are zero-padded: `문서 #01` … `문서 #13` (the format is `String(doc.id).padStart(2, '0')`, not the older `0${doc.id}` template literal — that bug is fixed).

## Recording tips

- Maximize the browser before starting: `wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz`. Do NOT use `xdotool key super+Up` (it tiles half-screen on this WM).
- Annotate per rune with `test_start` and `assertion`. Use 'It should …' style.
- Drawing with `left_click_drag` is essentially straight; for shapes that need curves, use COMPASS for the circle and accept that ovals/spirals have to be drawn with multiple short drags or skipped.
- Screen is 1024×768. Center each rune around (510, 400) with size ~200–240 px.

## OVERLOAD overlay false-alarm

During testing of RULER strokes the canvas sometimes shows `OVERLOAD` even at heat=20°C / instability=14%. Recognition itself is unaffected (right-panel name still updates). It might be a stale `state.overloaded` flag; check `clearCanvas()` resets it. Worth investigating separately if it interferes with screenshots — currently a low-priority UX bug.

## Devin Secrets Needed

None. Repo is local, dev server requires no auth.
