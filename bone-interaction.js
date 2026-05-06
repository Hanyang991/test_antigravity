// Chapter 10 — 뼈대 상호작용 (Bone Interaction).
//
// Classifies the spatial relationship between the bone strokes (drawn in Bone
// mode) and the rune strokes (drawn in Rune mode) into one of the six grammar
// types listed in RUNE_DICTIONARY §10:
//
//     가두기  (Enclosing)  — bone surrounds rune                  ×0.8 ~ ×1.8
//     걸치기  (Crossing)   — bone passes across rune              +10 ~ +30 inst
//     관통    (Piercing)   — straight bone through rune center
//     받치기  (Underlying) — bone drawn first, rune layered on top
//     연결    (Bridging)   — bone connects two runes
//     감싸기  (Wrapping)   — spiral / curve wraps a rune
//
// Phase 1 implements the four kinds that depend only on bbox geometry:
// enclosing (with 4 shape variants), crossing (with 4 angle variants),
// piercing, and underlying.
//
// Phase 2 (this module, extended) adds the two relationship kinds that are
// more linguistically rich:
//
//     연결    (Bridging) — bone(s) span between two rune clusters. Detection
//                          classifies the bone(s) into one of 9 connector
//                          line types from RUNE_DICTIONARY §10:
//                            단선 · 이중선 · 삼중선 · 점선 · 파선 ·
//                            물결선 · 나선 · 갈래선 · 고리선
//                          Each carries its own efficiency (powerMul) and
//                          stability delta. Bridging takes precedence over
//                          Phase-1 kinds when 2+ rune clusters exist because
//                          a bone "between" runes is fundamentally a multi-
//                          rune relationship.
//
//     감싸기  (Wrapping)  — a single bone stroke that winds > 1.5 full turns
//                          around a single rune. Strength scales with the
//                          number of full turns (1 turn → ×1.5, capped at
//                          5 turns → ×2.7). Detected after Phase-1 enclosing
//                          so that a perfectly-closed circle still reads as
//                          봉인 (Enclosing) rather than a 1-turn 감싸기.
//
// Output shape (returned to main.js):
//   {
//     kind: 'enclosing'|'crossing'|'piercing'|'underlying'|'bridging'
//          |'wrapping'|'none',
//     label: '가두기'|'걸치기'|'관통'|'받치기'|'연결'|'감싸기'|'단순 뼈대',
//     detail: string,                       // e.g. '봉인', '단선 (─)'
//     shape: 'circle'|'triangle'|'square'|'rhombus'|'line'|'curve'|null,
//     powerMul: number,                     // 1.0 == neutral
//     instabilityDelta: number,             // stacks on top of arrangement
//     bridgeCount?: number,                 // bridging only: connector count
//     turns?: number,                       // wrapping only: bone winding turns
//   }
//
// Multiplier and instability values come straight out of the dictionary
// tables: §10 가두기 detail (RUNE_DICTIONARY.md lines 388-393), 걸치기 detail
// (399-404), and 연결 detail (413-423). 받치기 / 관통 / 감싸기 don't have
// explicit numeric tables, so we use values that match the spec's narrative
// ("불안정성↓, 지속 시간↑" for 받치기; "응축 단발" for 감싸기).
//
// The resulting multiplier is independent of the §9 arrangement multiplier;
// both are surfaced separately in the analyzer panel and main.js stacks them
// when it computes the final cast power.

import { __INTERNAL__ } from './recognition.js';
const { bboxOfStrokes, clusterStrokesByProximity } = __INTERNAL__;

// --- Shape classification --------------------------------------------------

// Categorize the bone shape from its stroke count and geometry. Returns one of
// 'circle' | 'triangle' | 'square' | 'rhombus' | 'line' | 'curve' | null.
//
// We follow the existing main.js convention (1 stroke = circle, 3 = triangle,
// 4 = square) but distinguish line/curve for single-stroke bones (so a single
// horizontal slash does not get classified as "circle" → "봉인") and rhombus
// vs square for 4-stroke shapes (rhombus has all-diagonal edges, square has
// axis-aligned edges).
export function classifyBoneShape(boneStrokes) {
    if (!boneStrokes || boneStrokes.length === 0) return null;
    const n = boneStrokes.length;

    if (n === 1) {
        const stroke = boneStrokes[0];
        if (stroke.length < 2) return 'curve';
        const bb = bboxOfStrokes([stroke]);
        const aspect = bb.h === 0 ? 999 : bb.w / bb.h;

        // Closure: endpoint-to-endpoint distance / span. ~0 = closed loop,
        // ~1 = straight stroke from one corner of the bbox to the other.
        const head = stroke[0];
        const tail = stroke[stroke.length - 1];
        const span = Math.max(bb.w, bb.h) || 1;
        const closure = Math.hypot(head.x - tail.x, head.y - tail.y) / span;

        if (closure < 0.25 && aspect > 0.5 && aspect < 2.0) return 'circle';

        // Linearity: avg perpendicular distance from each sample point to the
        // chord (head→tail), normalized by chord length. < ~5% = clearly a
        // line (works for diagonals where bbox aspect alone fails).
        const chordLen = Math.hypot(tail.x - head.x, tail.y - head.y) || 1;
        let residual = 0;
        for (const p of stroke) {
            residual += distPointToSeg(p, head, tail);
        }
        residual /= stroke.length;
        const linearity = residual / chordLen;

        if (linearity < 0.05 && closure > 0.6) return 'line';

        // Long thin bbox is also a line (axis-aligned diagonals already caught
        // above; this catches other elongated strokes).
        if (aspect > 3.5 || aspect < 0.28) return 'line';

        // Otherwise it's a curve / arc that doesn't close.
        return 'curve';
    }

    if (n === 2) {
        // Two strokes that meet at a point are likely the start of a triangle
        // (incomplete) or a cross. We don't classify them as a closed shape;
        // crossing detection downstream handles 2-line cases.
        return null;
    }

    if (n === 3) return 'triangle';

    if (n >= 4) {
        // Distinguish square (axis-aligned edges) from rhombus (diagonal
        // edges) by checking the dominant orientation of each stroke.
        const angles = boneStrokes.slice(0, 4).map(s => {
            if (s.length < 2) return 0;
            const dx = s[s.length - 1].x - s[0].x;
            const dy = s[s.length - 1].y - s[0].y;
            return Math.atan2(dy, dx);
        });
        const isAxis = (a) => {
            const norm = ((a % Math.PI) + Math.PI) % Math.PI;  // [0, π)
            return norm < Math.PI / 8 || norm > Math.PI * 7 / 8 ||
                   Math.abs(norm - Math.PI / 2) < Math.PI / 8;
        };
        const allAxis = angles.every(isAxis);
        const allDiagonal = angles.every(a => !isAxis(a));
        if (allDiagonal) return 'rhombus';
        if (allAxis) return 'square';
        return 'square';  // mixed → fallback to square
    }

    return null;
}

// --- Enclosing (가두기) ----------------------------------------------------

// True when bone bbox contains rune bbox with a non-trivial margin on every
// side. Margin guards against false positives where the rune extends slightly
// past the bone outline (e.g. a △ rune drawn just inside a triangle bone).
//
// 1D runes (e.g. 이사 `|` has w=0, 대지 `ㅡ` has h=0) are treated as enclosable;
// only the bone bbox must be 2D for the margin to make sense.
function boneEnclosesRune(boneBox, runeBox) {
    if (boneBox.w <= 0 || boneBox.h <= 0) {
        return false;
    }
    const margin = Math.min(boneBox.w, boneBox.h) * 0.06;
    return boneBox.minX <= runeBox.minX - margin &&
           boneBox.maxX >= runeBox.maxX + margin &&
           boneBox.minY <= runeBox.minY - margin &&
           boneBox.maxY >= runeBox.maxY + margin;
}

// Inflate a degenerate (1D / very thin) rune bbox so downstream stroke-
// intersection and centroid-distance math doesn't divide by zero. A `|`
// (이사) rune comes in at w=0, h≈150; we inflate to a 10px-wide column
// centered on the original line.
function inflateThinBox(box) {
    const min = 10;
    if (box.w >= min && box.h >= min) return box;
    const padX = box.w < min ? (min - box.w) / 2 : 0;
    const padY = box.h < min ? (min - box.h) / 2 : 0;
    const minX = box.minX - padX;
    const maxX = box.maxX + padX;
    const minY = box.minY - padY;
    const maxY = box.maxY + padY;
    return {
        minX, maxX, minY, maxY,
        w: maxX - minX, h: maxY - minY,
        cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
    };
}

const ENCLOSING_TABLE = {
    circle:   { detail: '봉인',  powerMul: 1.2, instabilityDelta: -10 },
    triangle: { detail: '집중',  powerMul: 1.5, instabilityDelta: 5 },
    square:   { detail: '결계',  powerMul: 0.8, instabilityDelta: -25 },
    rhombus:  { detail: '공명',  powerMul: 1.8, instabilityDelta: 20 },
};

// --- Crossing (걸치기) -----------------------------------------------------

// Squared distance from a point to a line segment.
function distPointToSeg(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// Minimum distance from point `p` to any segment of the polyline `stroke`.
function distPointToStroke(p, stroke) {
    if (!stroke || stroke.length === 0) return Infinity;
    if (stroke.length === 1) return Math.hypot(p.x - stroke[0].x, p.y - stroke[0].y);
    let best = Infinity;
    for (let i = 1; i < stroke.length; i++) {
        const d = distPointToSeg(p, stroke[i - 1], stroke[i]);
        if (d < best) best = d;
    }
    return best;
}

// Does any segment of `stroke` cross into the rune bbox?
function strokeCrossesBox(stroke, box) {
    for (const pt of stroke) {
        if (pt.x >= box.minX && pt.x <= box.maxX &&
            pt.y >= box.minY && pt.y <= box.maxY) {
            return true;
        }
    }
    // Also: line segment passes through box even if no sample point is inside.
    // (For our coarse 16ms-sampled strokes this is rare, but cheap to check.)
    for (let i = 1; i < stroke.length; i++) {
        const a = stroke[i - 1], b = stroke[i];
        if (segIntersectsBox(a, b, box)) return true;
    }
    return false;
}

function segIntersectsBox(a, b, box) {
    // Liang–Barsky-ish: any segment that has both endpoints on the same side
    // of any box edge cannot cross.
    if (a.x < box.minX && b.x < box.minX) return false;
    if (a.x > box.maxX && b.x > box.maxX) return false;
    if (a.y < box.minY && b.y < box.minY) return false;
    if (a.y > box.maxY && b.y > box.maxY) return false;
    // We've ruled out trivial cases — accept (overestimates slightly but fine).
    return true;
}

// Axis label for a stroke direction (for 걸치기 sub-classification).
function classifyAngle(stroke) {
    if (stroke.length < 2) return 'horizontal';
    const dx = stroke[stroke.length - 1].x - stroke[0].x;
    const dy = stroke[stroke.length - 1].y - stroke[0].y;
    const a = Math.atan2(Math.abs(dy), Math.abs(dx));   // [0, π/2]
    if (a < Math.PI / 8) return 'horizontal';
    if (a > Math.PI * 3 / 8) return 'vertical';
    return 'diagonal';
}

const CROSSING_TABLE = {
    horizontal: { detail: '수평 관통 (ㅡ)',   powerMul: 1.3, instabilityDelta: 10 },
    vertical:   { detail: '수직 관통 (|)',    powerMul: 1.3, instabilityDelta: 15 },
    diagonal:   { detail: '대각선 관통 (/)',  powerMul: 1.3, instabilityDelta: 25 },
    cross:      { detail: '십자 관통 (+)',    powerMul: 1.5, instabilityDelta: 30 },
};

// --- Underlying (받치기) ---------------------------------------------------

// Underlying / 받치기: bone is drawn first AND the bone bbox is broadly under
// the rune (canvas Y grows downward, so "below" = larger Y). The 받치기 effect
// is generic stabilization (no shape table in §10) — flat values approximated
// from the spec's narrative ("불안정성 ↓, 지속 시간 ↑").
const UNDERLYING_VALUES = { detail: '안정화 기반', powerMul: 1.0, instabilityDelta: -10 };

// --- Bridging (연결) -------------------------------------------------------

// 9 connector line types from RUNE_DICTIONARY §10. powerMul derives from the
// spec's "전달 효율" column, except where a special effect overrides it:
//
//   - 물결선 ("도착 시 폭발적") → ×1.5 burst instead of base 80% efficiency
//   - 나선 ("도착 시 ×2.0 폭발") → ×2.0 condensed burst instead of 60%
//   - 갈래선 (각 50% 분배) → split is informational; total throughput is ×1.0
//   - 고리선 (자기 유지 / 순환) → ×1.0 sustained loop, no per-cast burst
//
// instabilityDelta uses the spec value verbatim.
const BRIDGE_TABLE = {
    단선:    { detail: '단선 (─)',    powerMul: 0.9, instabilityDelta:   0 },
    이중선:  { detail: '이중선 (═)',  powerMul: 1.0, instabilityDelta:   5 },
    삼중선:  { detail: '삼중선 (≡)',  powerMul: 1.2, instabilityDelta:  15 },
    점선:    { detail: '점선 (···)',  powerMul: 0.5, instabilityDelta:  -5 },
    파선:    { detail: '파선 (- -)',  powerMul: 0.7, instabilityDelta: -10 },
    물결선:  { detail: '물결선 (~)',  powerMul: 1.5, instabilityDelta:  10 },
    나선:    { detail: '나선 (⌀)',    powerMul: 2.0, instabilityDelta:  20 },
    갈래선:  { detail: '갈래선 (⑂)', powerMul: 1.0, instabilityDelta:   5 },
    고리선:  { detail: '고리선 (∞)', powerMul: 1.0, instabilityDelta:  15 },
};

// Distance from a point to the closest edge/inside of a rectangle (0 if
// inside). Used to decide whether a bone-stroke endpoint terminates "near"
// a rune cluster.
function pointToBoxDist(p, box) {
    const dx = Math.max(box.minX - p.x, 0, p.x - box.maxX);
    const dy = Math.max(box.minY - p.y, 0, p.y - box.maxY);
    return Math.hypot(dx, dy);
}

// Direction angle (atan2 dy/dx) of the head→tail vector of a stroke.
function strokeAngle(stroke) {
    if (stroke.length < 2) return 0;
    const dx = stroke[stroke.length - 1].x - stroke[0].x;
    const dy = stroke[stroke.length - 1].y - stroke[0].y;
    return Math.atan2(dy, dx);
}

// Two strokes are "parallel" for our purposes when their head→tail vectors
// point in roughly the same (or opposite) direction AND their chord lengths
// match within 40%. Used for 이중선 / 삼중선 detection.
function isStrokePairParallel(a, b) {
    const angA = strokeAngle(a), angB = strokeAngle(b);
    let diff = Math.abs(angA - angB) % Math.PI;
    if (diff > Math.PI / 2) diff = Math.PI - diff;
    if (diff > Math.PI / 9) return false;   // ~20° tolerance
    const lenA = Math.hypot(
        a[a.length - 1].x - a[0].x, a[a.length - 1].y - a[0].y);
    const lenB = Math.hypot(
        b[b.length - 1].x - b[0].x, b[b.length - 1].y - b[0].y);
    const maxLen = Math.max(lenA, lenB) || 1;
    if (Math.abs(lenA - lenB) / maxLen > 0.4) return false;
    return true;
}

// Perpendicular distance between two roughly-parallel strokes (mid-point of
// `b` to the line through `a`). Used to gate 이중선/삼중선: lines too far apart
// don't read as a bundle.
function parallelGap(a, b) {
    const mid = b[Math.floor(b.length / 2)];
    return distPointToSeg(mid, a[0], a[a.length - 1]);
}

// Wave detector: count how many times the stroke crosses its own chord.
// A straight line has 0 crossings; a curved-but-monotone arc has 0; an S-curve
// has 1; a sine wave with 3 humps has ~5. Used to identify 물결선 vs 단선.
function strokeChordCrossings(stroke) {
    if (stroke.length < 4) return 0;
    const head = stroke[0], tail = stroke[stroke.length - 1];
    const chordLen = Math.hypot(tail.x - head.x, tail.y - head.y);
    if (chordLen < 1) return 0;
    const dx = (tail.x - head.x) / chordLen;
    const dy = (tail.y - head.y) / chordLen;
    let crossings = 0;
    let prevSign = 0;
    for (const p of stroke) {
        const off = (p.x - head.x) * (-dy) + (p.y - head.y) * dx;
        const sign = off > 0.5 ? 1 : (off < -0.5 ? -1 : 0);
        if (sign !== 0) {
            if (prevSign !== 0 && sign !== prevSign) crossings++;
            prevSign = sign;
        }
    }
    return crossings;
}

// Total signed angular winding of a stroke around point (cx, cy), in radians.
// Used by both 나선 (around the midpoint between two clusters) and 감싸기
// (around a single rune's center). A perfect circle returns ±2π.
function angularWinding(stroke, cx, cy) {
    let wind = 0;
    let prev = null;
    for (const p of stroke) {
        const ang = Math.atan2(p.y - cy, p.x - cx);
        if (prev !== null) {
            let d = ang - prev;
            while (d >  Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            wind += d;
        }
        prev = ang;
    }
    return Math.abs(wind);
}

// True when the stroke head and tail are close (relative to total path
// length), indicating a closed loop. Used to detect 고리선.
function isClosedLoop(stroke) {
    if (stroke.length < 4) return false;
    const head = stroke[0], tail = stroke[stroke.length - 1];
    const closure = Math.hypot(head.x - tail.x, head.y - tail.y);
    let pathLen = 0;
    for (let i = 1; i < stroke.length; i++) {
        pathLen += Math.hypot(
            stroke[i].x - stroke[i - 1].x,
            stroke[i].y - stroke[i - 1].y);
    }
    return pathLen > 50 && closure < pathLen * 0.15;
}

// Pick out the bone strokes that "connect" cluster A to cluster B. Two
// patterns count as bridging:
//
//   1. Direct bridge — one endpoint touches A's bbox and the other touches
//      B's bbox (단선/이중선/삼중선/물결선/나선/고리선 are typically this).
//   2. Chain element — a short stroke that lies entirely in the corridor
//      between A and B without touching either, used to chain into a
//      점선/파선 (dashed) connector when many such strokes are present.
//
// Returns the matching strokes; an empty list means no bone bridges between
// A and B.
function bridgingStrokes(boneStrokes, boxA, boxB) {
    const a = inflateThinBox(boxA);
    const b = inflateThinBox(boxB);
    const sep = Math.hypot(a.cx - b.cx, a.cy - b.cy);
    // Endpoint snap tolerance: 35% of the distance between the two clusters
    // OR 60% of the smaller cluster's span, whichever is larger. Generous
    // because hand-drawn bones rarely terminate exactly on the rune bbox.
    const minSpan = Math.min(Math.max(a.w, a.h), Math.max(b.w, b.h));
    const tol = Math.max(sep * 0.35, minSpan * 0.6, 25);
    // Corridor extent (used for chain detection). Stroke center must fall
    // between the two cluster centers (with a small margin) on both axes.
    const corridorMargin = Math.max(sep * 0.1, 20);

    const out = [];
    for (const s of boneStrokes) {
        if (s.length < 2) continue;
        const head = s[0], tail = s[s.length - 1];
        const dHA = pointToBoxDist(head, a);
        const dHB = pointToBoxDist(head, b);
        const dTA = pointToBoxDist(tail, a);
        const dTB = pointToBoxDist(tail, b);
        const headOnA = dHA <= tol && dHA <= dHB;
        const tailOnB = dTB <= tol && dTB <= dTA;
        const headOnB = dHB <= tol && dHB <= dHA;
        const tailOnA = dTA <= tol && dTA <= dTB;
        const directBridge = (headOnA && tailOnB) || (headOnB && tailOnA);

        let chainBetween = false;
        if (!directBridge) {
            const sb = bboxOfStrokes([s]);
            const inCorridor =
                sb.cx >= Math.min(a.cx, b.cx) - corridorMargin &&
                sb.cx <= Math.max(a.cx, b.cx) + corridorMargin &&
                sb.cy >= Math.min(a.cy, b.cy) - corridorMargin &&
                sb.cy <= Math.max(a.cy, b.cy) + corridorMargin;
            const outsideClusters =
                pointToBoxDist({ x: sb.cx, y: sb.cy }, a) > 5 &&
                pointToBoxDist({ x: sb.cx, y: sb.cy }, b) > 5;
            // Chain element: short stroke (≤ 40% of cluster separation) that
            // sits in the AB corridor without touching either cluster.
            const chordLen = Math.hypot(tail.x - head.x, tail.y - head.y);
            chainBetween = inCorridor && outsideClusters &&
                chordLen <= sep * 0.4;
        }
        if (directBridge || chainBetween) out.push(s);
    }
    return out;
}

// Classify the bone strokes that span between A and B into one of the 9
// connector types. Returns one of the BRIDGE_TABLE keys, or null when the
// strokes don't read as any recognizable connector pattern.
function classifyConnector(strokes, boxA, boxB) {
    if (!strokes || strokes.length === 0) return null;

    const lens = strokes.map(s =>
        Math.hypot(s[s.length - 1].x - s[0].x, s[s.length - 1].y - s[0].y));
    const span = Math.hypot(boxA.cx - boxB.cx, boxA.cy - boxB.cy) || 1;

    // ── Many short strokes → dashed family (점선 vs 파선) ───────────────
    // Threshold: average chord ≤ 50% of cluster separation AND ≥ 3 strokes.
    if (strokes.length >= 3) {
        const avgLen = lens.reduce((a, b) => a + b, 0) / lens.length;
        if (avgLen < span * 0.5) {
            // 파선 (long-short repeating) when chord lengths are visibly
            // bimodal — longest stroke ≥ 2× the shortest. Otherwise the
            // dashes are uniformly short → 점선.
            const minLen = Math.min(...lens);
            const maxLen = Math.max(...lens);
            if (minLen > 0 && maxLen / minLen >= 2.0) return '파선';
            return '점선';
        }
    }

    // ── Single-stroke connectors ────────────────────────────────────────
    if (strokes.length === 1) {
        const s = strokes[0];

        // 고리선: closed loop encircling both clusters (or one + drift).
        if (isClosedLoop(s)) return '고리선';

        // 나선: winds ≥ 1.5 turns around the midpoint between A and B.
        const midX = (boxA.cx + boxB.cx) / 2;
        const midY = (boxA.cy + boxB.cy) / 2;
        const wind = angularWinding(s, midX, midY);
        if (wind > Math.PI * 3) return '나선';   // ≥ 1.5 full turns

        // 물결선: enough chord crossings to count as wavy (≥ 2).
        if (strokeChordCrossings(s) >= 2) return '물결선';

        // Default: 단선.
        return '단선';
    }

    // ── 2 strokes: 이중선 if parallel and close, else fall through to 단선
    if (strokes.length === 2 && isStrokePairParallel(strokes[0], strokes[1])) {
        const len = Math.max(...lens) || 1;
        if (parallelGap(strokes[0], strokes[1]) < len * 0.25) return '이중선';
    }

    // ── 3+ strokes: 삼중선 if all 3 mutually parallel and close ──────────
    if (strokes.length === 3 &&
        isStrokePairParallel(strokes[0], strokes[1]) &&
        isStrokePairParallel(strokes[1], strokes[2]) &&
        isStrokePairParallel(strokes[0], strokes[2])) {
        const len = Math.max(...lens) || 1;
        const g01 = parallelGap(strokes[0], strokes[1]);
        const g12 = parallelGap(strokes[1], strokes[2]);
        if (g01 < len * 0.25 && g12 < len * 0.25) return '삼중선';
    }

    // Multi-stroke fallback: treat as a thicker 단선 bundle.
    return '단선';
}

// Try the §10 연결 (Bridging) reading. Requires ≥2 rune clusters AND at
// least one bone stroke whose endpoints touch both. Returns the descriptor
// or null. When 3+ clusters exist and a single starting cluster has bones
// reaching ≥2 other clusters, returns 갈래선 (branched distribution).
function analyzeBridging({ runeStrokes, boneStrokes }) {
    if (!runeStrokes || runeStrokes.length === 0) return null;
    if (!boneStrokes || boneStrokes.length === 0) return null;

    const clusters = clusterStrokesByProximity(runeStrokes);
    if (clusters.length < 2) return null;

    const boxes = clusters.map(c => bboxOfStrokes(c));

    // 갈래선 — one cluster originates connectors to ≥ 2 distinct other
    // clusters. Detected before pair-wise classification so a 1-to-many
    // distribution doesn't get misread as a single bridge.
    if (clusters.length >= 3) {
        for (let i = 0; i < clusters.length; i++) {
            const reaches = [];
            for (let j = 0; j < clusters.length; j++) {
                if (i === j) continue;
                const ij = bridgingStrokes(boneStrokes, boxes[i], boxes[j]);
                if (ij.length > 0) reaches.push(j);
            }
            if (reaches.length >= 2) {
                const t = BRIDGE_TABLE.갈래선;
                return {
                    kind: 'bridging',
                    label: '연결',
                    detail: `${t.detail} · ${reaches.length}갈래`,
                    shape: 'line',
                    powerMul: t.powerMul,
                    instabilityDelta: t.instabilityDelta,
                    bridgeCount: reaches.length,
                };
            }
        }
    }

    // Pair-wise: try the two largest clusters first. (Largest = bbox area.)
    const order = boxes
        .map((b, i) => ({ i, area: Math.max(b.w, 1) * Math.max(b.h, 1) }))
        .sort((p, q) => q.area - p.area)
        .map(o => o.i);

    for (let i = 0; i < order.length; i++) {
        for (let j = i + 1; j < order.length; j++) {
            const A = boxes[order[i]];
            const B = boxes[order[j]];
            const bridges = bridgingStrokes(boneStrokes, A, B);
            if (bridges.length === 0) continue;
            const kind = classifyConnector(bridges, A, B);
            if (!kind) continue;
            const t = BRIDGE_TABLE[kind];
            return {
                kind: 'bridging',
                label: '연결',
                detail: t.detail,
                shape: 'line',
                powerMul: t.powerMul,
                instabilityDelta: t.instabilityDelta,
                bridgeCount: bridges.length,
            };
        }
    }

    return null;
}

// --- Wrapping (감싸기) -----------------------------------------------------

// 감싸기: a single bone stroke that winds at least 1.5 full turns around the
// rune's center. The spec calls out "에너지 응축. 느리지만 강력한 단발" —
// represented as a turn-count-scaled multiplier (×1.5 at 1.5 turns,
// approaching ×2.7 at 5+ turns).
function analyzeWrapping({ runeStrokes, boneStrokes }) {
    if (!runeStrokes || runeStrokes.length === 0) return null;
    if (!boneStrokes || boneStrokes.length === 0) return null;

    const runeBox = inflateThinBox(bboxOfStrokes(runeStrokes));

    let bestTurns = 0;
    for (const s of boneStrokes) {
        if (s.length < 8) continue;
        const wind = angularWinding(s, runeBox.cx, runeBox.cy);
        const turns = wind / (Math.PI * 2);
        if (turns > bestTurns) bestTurns = turns;
    }
    if (bestTurns < 0.75) return null;          // < 1.5 half-turns → no spiral

    const cappedTurns = Math.min(bestTurns, 5);
    const powerMul = 1.5 + (cappedTurns - 1) * 0.3;   // 1→1.5, 5→2.7
    return {
        kind: 'wrapping',
        label: '감싸기',
        detail: `나선 ${bestTurns.toFixed(1)}회 감기`,
        shape: 'curve',
        powerMul: Number(powerMul.toFixed(2)),
        instabilityDelta: 15,
        turns: bestTurns,
    };
}

// --- Main entrypoint -------------------------------------------------------

/**
 * @param {Object} args
 * @param {Array<Array<{x:number,y:number,t?:number}>>} args.runeStrokes
 * @param {Array<Array<{x:number,y:number,t?:number}>>} args.boneStrokes
 * @param {boolean} [args.boneFirst]  — true if bones were drawn before runes
 *   (informs 받치기 detection). Default false.
 * @returns {Object} interaction descriptor — see top-of-file docstring.
 */
export function analyzeBoneInteraction({ runeStrokes, boneStrokes, boneFirst = false }) {
    const NONE = {
        kind: 'none', label: '단순 뼈대', detail: '', shape: null,
        powerMul: 1.0, instabilityDelta: 0,
    };

    if (!boneStrokes || boneStrokes.length === 0 ||
        !runeStrokes || runeStrokes.length === 0) {
        return NONE;
    }

    const runeBox = inflateThinBox(bboxOfStrokes(runeStrokes));
    const boneBox = bboxOfStrokes(boneStrokes);
    const shape = classifyBoneShape(boneStrokes);

    // 0. Bridging (연결) — when the player has drawn ≥2 spatially-separate
    // rune clusters AND a bone stroke spans between them, that relationship
    // dominates: a bone "between" two runes is structurally a connector and
    // should never be misread as a Phase-1 enclosing/crossing/etc. of either
    // single rune. Returns null when there's only one rune cluster on the
    // canvas, falling through to the rest of the pipeline.
    const bridge = analyzeBridging({ runeStrokes, boneStrokes });
    if (bridge) return bridge;

    // 0.5. Wrapping (감싸기) early-out — a true spiral that winds ≥ 1.5 full
    // turns around the rune's center reads as 감싸기 even when its closed-end
    // shape would otherwise trigger 가두기 below. A 1-turn closed circle stays
    // 봉인 (Enclosing) because its winding stays under the 1.5-turn threshold;
    // only multi-turn spirals (which are unambiguously the "wrap" gesture in
    // the dictionary) take this branch.
    const spiralWrap = analyzeWrapping({ runeStrokes, boneStrokes });
    if (spiralWrap && spiralWrap.turns >= 1.5) return spiralWrap;

    // 1. Enclosing (가두기) — bone bbox surrounds rune bbox AND bone is a
    // closed/recognizable shape. Highest priority among single-rune kinds
    // because it's the most structurally constrained relationship.
    if (['circle', 'triangle', 'square', 'rhombus'].includes(shape) &&
        boneEnclosesRune(boneBox, runeBox)) {
        const t = ENCLOSING_TABLE[shape];
        return {
            kind: 'enclosing',
            label: '가두기',
            detail: t.detail,
            shape,
            powerMul: t.powerMul,
            instabilityDelta: t.instabilityDelta,
        };
    }

    // 2. Crossing (걸치기) / Piercing (관통) — bone is one or more lines that
    // cross into the rune's bbox.
    if (boneStrokes.length === 1 && shape === 'line' &&
        strokeCrossesBox(boneStrokes[0], runeBox)) {
        // 관통 if line passes within ~25% of rune width from the rune center;
        // otherwise 걸치기.
        const center = { x: runeBox.cx, y: runeBox.cy };
        const distFromCenter = distPointToStroke(center, boneStrokes[0]);
        const piercingThreshold = Math.min(runeBox.w, runeBox.h) * 0.25;
        const angle = classifyAngle(boneStrokes[0]);

        if (distFromCenter < piercingThreshold) {
            // §10 piercing description: "방향성 부여. 마법이 직선 방향으로 발사".
            // Spec doesn't list a direct multiplier, so reuse the 걸치기 table
            // (직선 관통 is the most common piercing form) and tag it as 관통.
            const t = CROSSING_TABLE[angle];
            return {
                kind: 'piercing',
                label: '관통',
                detail: t.detail.replace(' 관통', ' 발사체'),
                shape: 'line',
                powerMul: t.powerMul,
                instabilityDelta: t.instabilityDelta,
            };
        }
        const t = CROSSING_TABLE[angle];
        return {
            kind: 'crossing',
            label: '걸치기',
            detail: t.detail,
            shape: 'line',
            powerMul: t.powerMul,
            instabilityDelta: t.instabilityDelta,
        };
    }

    // 2b. 십자 걸치기: two line bones, one ~horizontal one ~vertical, both
    // crossing the rune bbox.
    if (boneStrokes.length === 2) {
        const angles = boneStrokes.map(classifyAngle);
        const crosses = boneStrokes.every(s => strokeCrossesBox(s, runeBox));
        const isCross = (angles.includes('horizontal') && angles.includes('vertical')) ||
                        angles.filter(a => a === 'diagonal').length === 2;
        if (crosses && isCross) {
            const t = CROSSING_TABLE.cross;
            return {
                kind: 'crossing',
                label: '걸치기',
                detail: t.detail,
                shape: 'line',
                powerMul: t.powerMul,
                instabilityDelta: t.instabilityDelta,
            };
        }
    }

    // 3. Underlying (받치기) — bone is broadly under the rune AND was drawn
    // first. Loose: bone center ≥ 25% rune-height below rune center.
    if (boneFirst && boneBox.cy > runeBox.cy + runeBox.h * 0.25) {
        return {
            kind: 'underlying',
            label: '받치기',
            detail: UNDERLYING_VALUES.detail,
            shape,
            powerMul: UNDERLYING_VALUES.powerMul,
            instabilityDelta: UNDERLYING_VALUES.instabilityDelta,
        };
    }

    // 4. Wrapping (감싸기) — single bone stroke that winds ≥ 1.5 turns around
    // the rune center. Tested last so a perfect 1-stroke circle that fully
    // encloses the rune still reads as Enclosing 봉인 (×1.2, more specific)
    // rather than a 1-turn 감싸기.
    const wrap = analyzeWrapping({ runeStrokes, boneStrokes });
    if (wrap) return wrap;

    return { ...NONE, shape };
}

// Exposed for unit tests.
export const __INTERNAL__BONE = {
    classifyBoneShape, boneEnclosesRune, classifyAngle, strokeCrossesBox,
    ENCLOSING_TABLE, CROSSING_TABLE, UNDERLYING_VALUES,
    BRIDGE_TABLE,
    analyzeBridging, analyzeWrapping,
    classifyConnector, bridgingStrokes,
    angularWinding, strokeChordCrossings,
    isStrokePairParallel, parallelGap, isClosedLoop,
};
