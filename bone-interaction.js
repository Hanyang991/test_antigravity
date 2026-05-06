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
//     연결    (Bridging)   — bone connects two runes               (Phase 2)
//     감싸기  (Wrapping)   — spiral / curve wraps a rune           (Phase 2)
//
// Phase 1 (this module) implements the four kinds that depend only on bbox
// geometry: enclosing (with 4 shape variants), crossing (with 4 angle
// variants), piercing, and underlying. Bridging and wrapping require
// connection-line recognition (9 line types in §10) and are deferred.
//
// Output shape (returned to main.js):
//   {
//     kind: 'enclosing'|'crossing'|'piercing'|'underlying'|'none',
//     label: '가두기'|'걸치기'|'관통'|'받치기'|'단순 뼈대',
//     detail: string,                       // e.g. '봉인', '대각선 관통'
//     shape: 'circle'|'triangle'|'square'|'rhombus'|'line'|'curve'|null,
//     powerMul: number,                     // 1.0 == neutral
//     instabilityDelta: number,             // stacks on top of arrangement
//   }
//
// Multiplier and instability values come straight out of the dictionary
// tables (§10 가두기 detail at lines 388-393, 걸치기 detail at 399-404). The
// resulting multiplier is independent of the §9 arrangement multiplier; both
// are surfaced separately in the analyzer panel and main.js stacks them when
// it computes the final cast power.

import { __INTERNAL__ } from './recognition.js';
const { bboxOfStrokes } = __INTERNAL__;

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
function boneEnclosesRune(boneBox, runeBox) {
    if (boneBox.w <= 0 || boneBox.h <= 0 || runeBox.w <= 0 || runeBox.h <= 0) {
        return false;
    }
    const margin = Math.min(boneBox.w, boneBox.h) * 0.06;
    return boneBox.minX <= runeBox.minX - margin &&
           boneBox.maxX >= runeBox.maxX + margin &&
           boneBox.minY <= runeBox.minY - margin &&
           boneBox.maxY >= runeBox.maxY + margin;
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

    const runeBox = bboxOfStrokes(runeStrokes);
    const boneBox = bboxOfStrokes(boneStrokes);
    const shape = classifyBoneShape(boneStrokes);

    // 1. Enclosing (가두기) — bone bbox surrounds rune bbox AND bone is a
    // closed/recognizable shape. Highest priority because it's the most
    // structurally constrained relationship.
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

    return { ...NONE, shape };
}

// Exposed for unit tests.
export const __INTERNAL__BONE = {
    classifyBoneShape, boneEnclosesRune, classifyAngle, strokeCrossesBox,
    ENCLOSING_TABLE, CROSSING_TABLE, UNDERLYING_VALUES,
};
