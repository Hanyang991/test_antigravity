/**
 * Sentence Analyzer (RUNE_DICTIONARY.md §§11-12)
 *
 * Builds on the §9 arrangement output to read a *sentence* off the canvas:
 *
 *   §11. 접속사 (Connectors) — a small "in-between" rune of certain types acts
 *        as a grammatical particle, not as a spell ingredient. The 6 connector
 *        runes from the spec, plus the rule that they must sit BETWEEN two
 *        larger runes and be smaller than them, are encoded here.
 *
 *   §12. 문장 규칙 (Sentences) — multi-rune layouts get a sentence grade based
 *        on how many *main* runes are on the canvas (1=단어 ~ 5+=주문) and a
 *        reading direction based on their spatial trajectory (왼→오 = 투사,
 *        시계방향 = 증폭, etc.). Sentence grade adds an instability delta;
 *        higher grades scale power up but become more unstable.
 *
 * Particle system (조사: 격조사·강도부사·시제·부정) heavily overlaps with the
 * existing §2 radical/combination system in recognition.js — to avoid double-
 * counting we leave particle interpretation to that pipeline and surface only
 * connectors + grade + direction here.
 *
 * Output (always a fully-formed object so callers can read fields freely):
 *   {
 *     kind:           'sentence' | 'word' | 'none',
 *     label:          '단어'|'구'|'절'|'문장'|'주문' | '',
 *     grade:          same as label,
 *     gradeKey:       'word'|'phrase'|'clause'|'sentence'|'incantation'|null,
 *     direction:      '투사'|'흡수'|'하강'|'상승'|'증폭'|'소멸' | null,
 *     directionKey:   'leftToRight'|...|null,
 *     connectors:     [{ rune, fn: '병렬'|..., english: 'AND'|..., between }],
 *     pattern:        'S-V'|'S-V-O'|'조건-결과'|'봉인'|'순환' | null,
 *     mainCount:      number,                  // main rune count (excl. connectors)
 *     powerMul:       number,                  // multiplies cast strength
 *     instabilityDelta: number,                // stacks with §9/§10
 *     detail:         string,                  // single-line analyzer caption
 *     mainUnits:      [{ name, bbox, center, strokes }, ...],
 *   }
 */

import { __INTERNAL__ } from './recognition.js';

const { bboxOfStrokes, clusterStrokesByProximity } = __INTERNAL__;

// §11 — Connector runes. The keys MUST equal the rune names returned by
// recognition.js (so we can look them up directly off arrangement.units).
const CONNECTORS = {
    '대지(ㅡ)':    { fn: '병렬', english: 'AND',    desc: '양쪽 동시 발동' },
    '이사(|)':     { fn: '순차', english: 'THEN',   desc: '왼→오 차례로' },
    '게보(X)':     { fn: '변환', english: 'INTO',   desc: '왼이 오른쪽으로 변환' },
    '나우디즈(+)': { fn: '속박', english: 'BIND',   desc: '양쪽을 하나로 고정' },
    '케나즈(<)':   { fn: '지향', english: 'TOWARD', desc: '꺾쇠 방향으로 지향' },
    '다가즈(◇)':   { fn: '전환', english: 'SHIFT',  desc: '상태 전이' },
};

// §12 — Sentence grade by main-rune count. instabilityDelta verbatim from
// the spec table.
const GRADE = {
    1: { key: 'word',         name: '단어', english: 'Word',
         instabilityDelta:  0, powerMul: 1.0 },
    2: { key: 'phrase',       name: '구',   english: 'Phrase',
         instabilityDelta:  0, powerMul: 1.0 },  // §2 combos already cover this
    3: { key: 'clause',       name: '절',   english: 'Clause',
         instabilityDelta: 15, powerMul: 1.1 },
    4: { key: 'sentence',     name: '문장', english: 'Sentence',
         instabilityDelta: 30, powerMul: 1.3 },
    5: { key: 'incantation',  name: '주문', english: 'Incantation',
         instabilityDelta: 50, powerMul: 1.5 },
};

// §12 — Reading-direction names. desc is the spell-flavor reading from the
// spec; we expose the key separately for downstream UIs that want icons.
const DIRECTIONS = {
    leftToRight:      { name: '투사', english: 'Projecting',
                        desc: '대상을 향해 발사' },
    rightToLeft:      { name: '흡수', english: 'Absorbing',
                        desc: '에너지를 끌어당김' },
    topToBottom:      { name: '하강', english: 'Descending',
                        desc: '접지·안정화' },
    bottomToTop:      { name: '상승', english: 'Ascending',
                        desc: '비상·강화' },
    clockwise:        { name: '증폭', english: 'Amplifying',
                        desc: '원형 배치 시 마력 증가' },
    counterClockwise: { name: '소멸', english: 'Draining',
                        desc: '원형 배치 시 에너지 흡수' },
};

const NONE = {
    kind: 'none',
    label: '',
    grade: '',
    gradeKey: null,
    direction: null,
    directionKey: null,
    connectors: [],
    pattern: null,
    mainCount: 0,
    powerMul: 1.0,
    instabilityDelta: 0,
    detail: '',
    mainUnits: [],
};

/**
 * Run the §11/§12 sentence analyzer.
 *
 * @param {Object}                       args
 * @param {Stroke[]}                     args.runeStrokes    Strokes drawn in
 *                                                           rune mode (in
 *                                                           temporal order).
 * @param {RecognitionEngine}            args.recognizer     Recognizer for
 *                                                           identifying clusters
 *                                                           when no arrangement
 *                                                           units are supplied.
 * @param {ArrangementResult|null}      [args.arrangement]   Output of §9
 *                                                           analyzeArrangement.
 *                                                           When provided we
 *                                                           reuse its identified
 *                                                           units instead of
 *                                                           re-clustering.
 * @param {BoneInteractionResult|null}  [args.boneInteraction] §10 result; used
 *                                                           to detect 봉인 /
 *                                                           순환 patterns.
 * @returns {SentenceResult}
 */
export function analyzeSentence({
    runeStrokes,
    recognizer,
    arrangement = null,
    boneInteraction = null,
} = {}) {
    if (!runeStrokes || runeStrokes.length === 0) return { ...NONE };

    // 1. Resolve the unit list. Reuse arrangement output when present so we
    // get exactly the same clustering / recognition the §9 analyzer used.
    let units = (arrangement && Array.isArray(arrangement.units))
        ? [...arrangement.units]
        : [];
    if (units.length === 0 && recognizer) {
        const clusters = clusterStrokesByProximity(runeStrokes);
        for (const c of clusters) {
            const name = recognizer.identifyRune(c);
            if (!name) continue;
            const bb = bboxOfStrokes(c);
            units.push({
                name,
                bbox: bb,
                center: { x: bb.cx, y: bb.cy },
                strokes: c,
            });
        }
    }
    if (units.length === 0) return { ...NONE };

    // 2. Identify connectors. A unit is a connector iff:
    //   - its rune name is in CONNECTORS (즉 1 of 6 grammatical runes), AND
    //   - it sits *between* at least one pair of other units (left/right or
    //     above/below sandwich), AND
    //   - its bbox area is ≤ 80% of the average non-connector unit area
    //     (per §11.2 "메인 룬보다 작거나 같은 크기").
    const connectorIndices = new Set();
    const connectors = [];
    for (let i = 0; i < units.length; i++) {
        const u = units[i];
        if (!CONNECTORS[u.name]) continue;
        const others = units.filter((_, j) => j !== i);
        if (others.length < 2) continue;
        const flank = findFlankingPair(u, others);
        if (!flank) continue;
        const uArea = Math.max(u.bbox.w, 1) * Math.max(u.bbox.h, 1);
        const avgArea = others.reduce((s, o) =>
            s + Math.max(o.bbox.w, 1) * Math.max(o.bbox.h, 1), 0) / others.length;
        if (uArea > avgArea * 0.8) continue;
        connectorIndices.add(i);
        const meta = CONNECTORS[u.name];
        connectors.push({
            rune: u.name,
            fn: meta.fn,
            english: meta.english,
            desc: meta.desc,
            between: [flank.a.name, flank.b.name],
        });
    }

    // 3. Main runes = everything that isn't a connector.
    const mainUnits = units.filter((_, i) => !connectorIndices.has(i));
    const mainCount = mainUnits.length;
    if (mainCount === 0) {
        // Edge case: only connector-eligible runes drawn. They re-classify
        // as plain runes (not connectors) since there's nothing for them to
        // grammatically connect.
        return {
            ...NONE,
            kind: 'word',
            label: GRADE[1].name,
            grade: GRADE[1].name,
            gradeKey: GRADE[1].key,
            mainCount: units.length,
            mainUnits: units,
            detail: GRADE[1].name,
        };
    }

    // 4. Sentence grade. 5+ runes all collapse onto 주문.
    const gradeKey = Math.min(mainCount, 5);
    const grade = GRADE[gradeKey] || GRADE[1];

    // 5. Reading direction (only meaningful when ≥2 main runes).
    let direction = null;
    if (mainCount >= 2) {
        direction = computeDirection(mainUnits, runeStrokes);
    }

    // 6. Sentence-pattern matching. Returns a string label or null.
    const pattern = matchPattern(mainUnits, connectors, boneInteraction);

    // 7. Compose detail string for the analyzer panel.
    const detailParts = [grade.name];
    if (direction) detailParts.push(direction.name);
    if (connectors.length > 0) {
        detailParts.push(
            connectors.map(c => `${c.rune}=${c.fn}`).join(' · '));
    }
    if (pattern) detailParts.push(pattern);

    return {
        kind: mainCount >= 2 ? 'sentence' : 'word',
        label: grade.name,
        grade: grade.name,
        gradeKey: grade.key,
        direction: direction ? direction.name : null,
        directionKey: direction ? directionKeyOf(direction) : null,
        connectors,
        pattern,
        mainCount,
        powerMul: grade.powerMul,
        instabilityDelta: grade.instabilityDelta,
        detail: detailParts.join(' · '),
        mainUnits,
    };
}

// --- Connector helpers -----------------------------------------------------

// Find a pair of units that flank `u` along either the X or Y axis. Returns
// {a, b} where a is the closer flank on one side and b on the opposite side,
// or null if no flank exists. Used to enforce §11.1 "두 메인 룬 사이에 위치".
function findFlankingPair(u, others) {
    // X-axis sandwich.
    const left = others
        .filter(o => o.center.x < u.center.x)
        .sort((p, q) =>
            Math.abs(p.center.y - u.center.y) -
            Math.abs(q.center.y - u.center.y))[0];
    const right = others
        .filter(o => o.center.x > u.center.x)
        .sort((p, q) =>
            Math.abs(p.center.y - u.center.y) -
            Math.abs(q.center.y - u.center.y))[0];
    if (left && right) return { a: left, b: right };

    // Y-axis sandwich.
    const above = others
        .filter(o => o.center.y < u.center.y)
        .sort((p, q) =>
            Math.abs(p.center.x - u.center.x) -
            Math.abs(q.center.x - u.center.x))[0];
    const below = others
        .filter(o => o.center.y > u.center.y)
        .sort((p, q) =>
            Math.abs(p.center.x - u.center.x) -
            Math.abs(q.center.x - u.center.x))[0];
    if (above && below) return { a: above, b: below };

    return null;
}

// --- Direction helpers -----------------------------------------------------

// Determine reading direction for a set of main units. Drawing order beats
// pure spatial ordering when we can recover it from `runeStrokes`; otherwise
// we fall back to spatial ordering using the dominant axis of the unit
// centers (좌→우 vs 위→아래) and the sign of total winding for circular.
function computeDirection(mainUnits, runeStrokes) {
    if (mainUnits.length < 2) return null;

    // Sort units by drawing order using temporal stroke index.
    const ordered = sortByDrawOrder(mainUnits, runeStrokes);

    // Circular detection: sum the signed angle deltas around the unit
    // centroid in drawing order. > +π total winding ⇒ clockwise (on screen,
    // because Y axis grows downward).
    if (ordered.length >= 3) {
        let cx = 0, cy = 0;
        for (const u of ordered) { cx += u.center.x; cy += u.center.y; }
        cx /= ordered.length; cy /= ordered.length;
        let signed = 0;
        for (let i = 1; i < ordered.length; i++) {
            const a0 = Math.atan2(ordered[i - 1].center.y - cy,
                                  ordered[i - 1].center.x - cx);
            const a1 = Math.atan2(ordered[i].center.y - cy,
                                  ordered[i].center.x - cx);
            let d = a1 - a0;
            while (d >  Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            signed += d;
        }
        if (Math.abs(signed) > Math.PI) {
            return signed > 0 ? DIRECTIONS.clockwise
                              : DIRECTIONS.counterClockwise;
        }
    }

    // Linear: compare first vs last unit centers along the dominant axis.
    const first = ordered[0].center;
    const last = ordered[ordered.length - 1].center;
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    if (Math.abs(dx) >= Math.abs(dy)) {
        return dx >= 0 ? DIRECTIONS.leftToRight : DIRECTIONS.rightToLeft;
    }
    return dy >= 0 ? DIRECTIONS.topToBottom : DIRECTIONS.bottomToTop;
}

// Order units by *drawing* order — i.e. the temporal index of each unit's
// earliest stroke within `runeStrokes`. Falls back to the input order when
// stroke references aren't shared with `runeStrokes` (e.g. test fixtures).
function sortByDrawOrder(units, runeStrokes) {
    if (!Array.isArray(runeStrokes) || runeStrokes.length === 0) return units;
    const indexOfStroke = new Map();
    runeStrokes.forEach((s, i) => indexOfStroke.set(s, i));
    return [...units].sort((u, v) => {
        const ui = Math.min(...u.strokes.map(s =>
            indexOfStroke.has(s) ? indexOfStroke.get(s) : Infinity));
        const vi = Math.min(...v.strokes.map(s =>
            indexOfStroke.has(s) ? indexOfStroke.get(s) : Infinity));
        if (ui === Infinity && vi === Infinity) return 0;
        return ui - vi;
    });
}

function directionKeyOf(direction) {
    for (const [key, val] of Object.entries(DIRECTIONS)) {
        if (val === direction) return key;
    }
    return null;
}

// --- Sentence pattern matching --------------------------------------------

// §12 sentence patterns. Returns one of the labels below or null:
//
//   'S-V'         — 2 main runes, no connector (주어-동사)
//   'S-V-O'       — 3 main runes, no connector (주어-동사-대상)
//   '조건-결과'   — A + 이사(|) + B with | as connector  (If-Then)
//   '봉인'        — 가두기(원/사각/마름모) + 나우디즈(+) connector
//   '순환'        — 원형 배열 + 같은 룬 3개 + 핵 1개
//
// Pattern matching is purely best-effort — we surface the most specific
// pattern that fits and let downstream code decide what (if anything) to
// do about it.
function matchPattern(mainUnits, connectors, boneInteraction) {
    const mainCount = mainUnits.length;
    const conKinds = connectors.map(c => c.fn);

    // 봉인: bone enclosing + 속박(나우디즈) inside.
    if (boneInteraction && boneInteraction.kind === 'enclosing' &&
        conKinds.includes('속박')) {
        return '봉인';
    }
    // 순환: circular bone arrangement + 3+ runes around with a center "core"
    // — we approximate by checking for a circular bone interaction (가두기 +
    // shape='circle') with ≥3 non-connector runes.
    if (boneInteraction && boneInteraction.shape === 'circle' && mainCount >= 3) {
        const names = mainUnits.map(u => u.name);
        const triples = names.filter(n => names.filter(m => m === n).length >= 3);
        if (triples.length > 0) return '순환';
    }
    // 조건-결과: A + 이사(|) + B with | acting as the connector.
    if (mainCount === 2 && connectors.some(c => c.rune === '이사(|)')) {
        return '조건-결과';
    }
    // S-V-O: exactly 3 main runes, no connector.
    if (mainCount === 3 && connectors.length === 0) return 'S-V-O';
    // S-V: exactly 2 main runes, no connector.
    if (mainCount === 2 && connectors.length === 0) return 'S-V';
    return null;
}

// Exposed for tests.
export const __INTERNAL__SENTENCE = {
    CONNECTORS, GRADE, DIRECTIONS,
    findFlankingPair, computeDirection, sortByDrawOrder, matchPattern,
};
