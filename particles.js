/**
 * Particle Analyzer (RUNE_DICTIONARY.md §11.2 조사 체계)
 *
 * Detects small decorator strokes attached to a main rune and classifies them
 * into one of four particle families:
 *
 *   1) 격조사 (Case Markers)      — 주격(·)/목적격(·)/처격(—)/구격(/)/여격(|)/공동격(··)
 *   2) 강도 부사 (Intensity Mods) — 미약/약화/강화/극대/극한/폭주
 *   3) 시제/상 (Tense / Aspect)   — 지연(○)/지속(~)/반복(⋮)/완료(○)/조건부(△)
 *   4) 부정과 반전 (Negation)     — 부정(—)/반전(X)/흡수(∩)
 *
 * Per spec §11.2.5 the priority within a single rune is
 *   강도부사 > 격조사 > 시제 > 부정
 * and 격조사 + 강도부사 may stack on the same rune (subject + intensity).
 *
 * **Intentional double-counting note:** the §2 radical/compound system in
 * recognition.js already produces named effects when a small stroke sits next
 * to a main rune (e.g. △ + ㅡ below = 마그마). This module fires *in addition*
 * to that — by design — so the same stroke that triggers a radical compound
 * can also register as a particle modifier. The user explicitly wants
 * amplification/reduction effects to live in multiple layers so the same
 * physical drawing yields different cast behavior depending on which layer
 * dominates. Avoiding duplication is therefore intentionally NOT done here;
 * the cast pipeline multiplies all layers' powerMul together.
 *
 * Output:
 * {
 *   kind: 'particle' | 'none',
 *   runes: [{
 *     unit: { name, bbox, ... },           // back-pointer to the main rune
 *     particles: [{                        // resolved particles after priority
 *       family: 'intensity'|'case'|'tense'|'negation',
 *       key:    string,                    // INTENSITY/CASE_MARKERS/... key
 *       name:   string,                    // 강조 한글 라벨
 *       symbol: string,                    // 시각 심볼 (panel 표시용)
 *     }],
 *     powerMul: number,                    // multiplier from this rune's mods
 *     instabilityDelta: number,
 *     summary: string,                     // 1-line human label
 *   }],
 *   powerMul: number,                      // product over all runes
 *   instabilityDelta: number,              // sum over all runes
 *   detail: string,                        // analyzer panel caption
 *   particleCount: number,
 * }
 */

import { __INTERNAL__ as RECOGNITION_INTERNAL } from './recognition.js';

const { bboxOfStrokes } = RECOGNITION_INTERNAL;

// ---------- Tables (verbatim from RUNE_DICTIONARY §11.2) -------------------

const CASE_MARKERS = {
    nominative:   { name: '주격',   symbol: '·' },   // 점 1개 좌상단
    accusative:   { name: '목적격', symbol: '·' },   // 점 1개 우하단
    locative:     { name: '처격',   symbol: '—' },   // 짧은 가로선 아래
    instrumental: { name: '구격',   symbol: '/' },   // 짧은 대각선 우측
    dative:       { name: '여격',   symbol: '|' },   // 짧은 세로선 우측
    comitative:   { name: '공동격', symbol: '··' },  // 점 2개 양옆
};

const INTENSITY = {
    barelyThere: { name: '미약', symbol: '·',   powerMul: 0.3, instabilityDelta: -15 },
    weak:        { name: '약화', symbol: '—',   powerMul: 0.5, instabilityDelta: -10 },
    strong:      { name: '강화', symbol: '|',   powerMul: 1.5, instabilityDelta: 10  },
    intense:     { name: '극대', symbol: '‖',   powerMul: 2.0, instabilityDelta: 25  },
    extreme:     { name: '극한', symbol: '⫼',   powerMul: 3.0, instabilityDelta: 50  },
    runaway:     { name: '폭주', symbol: '✕',   powerMul: 5.0, instabilityDelta: 90  },
};

const TENSE = {
    delayed:     { name: '지연',   symbol: '○', powerMul: 1.0, instabilityDelta:  5 },
    sustained:   { name: '지속',   symbol: '~', powerMul: 1.0, instabilityDelta: 15 },
    repeating:   { name: '반복',   symbol: '⋮', powerMul: 1.2, instabilityDelta: 20 },
    completed:   { name: '완료',   symbol: '◎', powerMul: 1.0, instabilityDelta:  0 },
    conditional: { name: '조건부', symbol: '△', powerMul: 1.0, instabilityDelta: -5 },
};

const NEGATION = {
    not:        { name: '부정', symbol: '—', powerMul: 0.0, instabilityDelta:   0 },
    inversion:  { name: '반전', symbol: '✕', powerMul: 1.0, instabilityDelta:  10 },
    absorption: { name: '흡수', symbol: '∩', powerMul: 0.5, instabilityDelta: -10 },
};

const NONE = {
    kind: 'none',
    runes: [],
    powerMul: 1.0,
    instabilityDelta: 0,
    detail: '',
    particleCount: 0,
};

// Tunables. Hand-drawn input is noisy, so the spec's "≤10%" / "≤15%" become
// soft thresholds with extra slack.
//
// We size-test on the THIN dimension: a particle's smaller bbox dimension
// (min(w, h)) must be ≤ 20% of the unit. This way a 부정 (—) bar that spans
// the rune's full width (large w, tiny h) still qualifies, but a chunky
// blob the size of a quarter-rune does not. We additionally cap the LARGER
// dimension at 1.5× unit size so a comically big stroke can't impersonate
// a particle.
const PARTICLE_MAX_THIN_REL = 0.25;
const PARTICLE_MAX_LONG_REL = 1.5;
const PARTICLE_MAX_DIST_REL = 0.30;  // particle center within 30% of unit size from unit bbox edge
const TIGHT_CLUSTER_PAD_REL = 0.06;  // strokes within 6% of unit size cluster into one particle

// --------------------------------------------------------------------------

/**
 * Run the §11.2 particle analyzer.
 *
 * @param {Object}  args
 * @param {Stroke[]} args.runeStrokes  All rune-mode strokes (raw).
 * @param {Array<{name, bbox, strokes}>} args.mainUnits  Main runes (excluding
 *        connector runes). Provided by sentence.js or arrangement.js. We use
 *        these as anchor points; particles are attached to the *nearest* main
 *        unit.
 * @returns {Object}  See file header for shape.
 */
export function analyzeParticles({ runeStrokes, mainUnits = [] } = {}) {
    if (!mainUnits || mainUnits.length === 0) return { ...NONE };
    if (!runeStrokes || runeStrokes.length === 0) return { ...NONE };

    // 1. Strokes already claimed by a main unit are off-limits — only
    //    explicitly *separate* strokes can be particles. Use reference
    //    equality (rune strokes are mutated in place by main.js).
    const claimed = new Set();
    for (const u of mainUnits) {
        if (Array.isArray(u.strokes)) {
            for (const s of u.strokes) claimed.add(s);
        }
    }
    const candidates = runeStrokes.filter(s => !claimed.has(s));
    if (candidates.length === 0) return { ...NONE };

    // 2. For each main unit, attach candidate strokes that are small enough
    //    AND close enough. A candidate may attach to multiple units (e.g.
    //    공동격 == "··" with one dot on each side of the rune); we resolve
    //    that conflict by picking the closer unit and making the dot
    //    EITHER comitative OR a single-side case marker, never both.
    const usedCandidates = new Set();
    const perRune = mainUnits.map(unit => {
        const unitSize = Math.max(unit.bbox.w, unit.bbox.h, 1);
        const attached = [];
        for (const stroke of candidates) {
            const sb = bboxOfStrokes([stroke]);
            const sbThin = Math.min(sb.w, sb.h);
            const sbLong = Math.max(sb.w, sb.h);
            if (sbThin > unitSize * PARTICLE_MAX_THIN_REL) continue;
            if (sbLong > unitSize * PARTICLE_MAX_LONG_REL) continue;
            const dist = bboxDistance(sb, unit.bbox);
            if (dist > unitSize * PARTICLE_MAX_DIST_REL) continue;
            attached.push({ stroke, bbox: sb, dist });
        }
        // Sort attachments closest-first so the "claim closest unit" rule
        // is deterministic.
        attached.sort((a, b) => a.dist - b.dist);
        return { unit, attached };
    });

    // 3. Resolve double-claims. A candidate stroke's bbox can be near two
    //    units; whichever unit is closest claims it.
    for (const stroke of candidates) {
        let best = null;
        for (const r of perRune) {
            const hit = r.attached.find(a => a.stroke === stroke);
            if (!hit) continue;
            if (!best || hit.dist < best.dist) best = { entry: r, hit };
        }
        if (!best) continue;
        for (const r of perRune) {
            if (r === best.entry) continue;
            r.attached = r.attached.filter(a => a.stroke !== stroke);
        }
        usedCandidates.add(stroke);
    }

    // 4. Bucket each unit's attached strokes by side (above / below / left /
    //    right / corner / across) and classify each side's strokes as a
    //    single particle type. Side-based bucketing handles multi-stroke
    //    particles (||, |||, X, ⋮) cleanly without forcing tight cluster
    //    padding that would mis-merge a top-side intensity with a bottom-side
    //    case marker.
    const runeResults = perRune.map(({ unit, attached }) => {
        if (attached.length === 0) {
            return {
                unit,
                particles: [],
                powerMul: 1.0,
                instabilityDelta: 0,
                summary: '',
            };
        }
        const buckets = bucketBySide(attached, unit);
        const classified = [];
        for (const [side, items] of Object.entries(buckets)) {
            if (items.length === 0) continue;
            const p = classifySideBucket(side, items, unit);
            if (p) classified.push(p);
        }
        return resolvePerRune(unit, classified);
    });

    // 5. Aggregate.
    const totalPowerMul = runeResults.reduce(
        (acc, r) => acc * r.powerMul, 1.0);
    const totalInstabilityDelta = runeResults.reduce(
        (acc, r) => acc + r.instabilityDelta, 0);
    const particleCount = runeResults.reduce(
        (acc, r) => acc + r.particles.length, 0);

    if (particleCount === 0) return { ...NONE };

    const detailParts = runeResults
        .filter(r => r.summary)
        .map(r => `${r.unit.name}: ${r.summary}`);

    return {
        kind: 'particle',
        runes: runeResults,
        powerMul: totalPowerMul,
        instabilityDelta: totalInstabilityDelta,
        detail: detailParts.join(' / '),
        particleCount,
    };
}

// --------------------------------------------------------------------------
// Geometry helpers
// --------------------------------------------------------------------------

/** L2 distance between two bboxes (0 when overlapping). */
function bboxDistance(a, b) {
    const dx = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX));
    const dy = Math.max(0, Math.max(a.minY - b.maxY, b.minY - a.maxY));
    return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Bucket attached strokes into one of: 'above', 'below', 'left', 'right',
 * 'top-left', 'bottom-right', 'across'. Each attachment goes into exactly one
 * bucket. 'across' (horizontal bar covering the rune) takes priority because
 * it's the only bucket where a single stroke can also span 'above' and 'below'
 * by extension.
 */
function bucketBySide(attachments, unit) {
    const out = {
        above: [],
        below: [],
        left: [],
        right: [],
        'top-left': [],
        'bottom-right': [],
        across: [],
    };
    for (const att of attachments) {
        const pos = relPosition(att.bbox, unit.bbox);
        // Map relPosition's 11 buckets to the 7 we care about, collapsing
        // some into the dominant axis. This is intentional simplification.
        let bucket;
        switch (pos) {
            case 'across':       bucket = 'across';       break;
            case 'above':        bucket = 'above';        break;
            case 'below':        bucket = 'below';        break;
            case 'left':         bucket = 'left';         break;
            case 'right':        bucket = 'right';        break;
            case 'top-left':     bucket = 'top-left';     break;
            case 'top-right':    bucket = 'above';        break;
            case 'bottom-left':  bucket = 'below';        break;
            case 'bottom-right': bucket = 'bottom-right'; break;
            case 'inside':
            case 'below-bbox':
            default:             bucket = 'across';       break;
        }
        out[bucket].push(att);
    }
    return out;
}

/**
 * Classify an entire side bucket as a single particle. Returns null when
 * the side's contents don't match any known particle (intentional — unknown
 * decoration is ignored rather than misclassified).
 *
 * Per-side semantics (RUNE_DICTIONARY §11.2):
 *
 *   above:        1| → 강화, ‖ → 극대, ⫼ → 극한, X → 폭주, ○ → 완료
 *   below:        ~  → 지속, ∩ → 흡수, · → 미약, — → 약화
 *   left:         ○  → 지연, △ → 조건부
 *   right:        |  → 여격, /  → 구격, ⋮ (3 dots vert-aligned) → 반복
 *   top-left:     ·  → 주격
 *   bottom-right: ·  → 목적격
 *   across:       —  → 부정 (horizontal bar through rune)
 */
function classifySideBucket(side, items, unit) {
    if (!items || items.length === 0) return null;

    if (side === 'above') {
        const verticals = items.filter(a => isVertical(a.stroke));
        if (verticals.length >= 3) {
            return mk('intensity', 'extreme', INTENSITY.extreme);
        }
        if (verticals.length === 2) {
            return mk('intensity', 'intense', INTENSITY.intense);
        }
        if (items.length === 2 && areCrossing(items[0].stroke, items[1].stroke)) {
            return mk('intensity', 'runaway', INTENSITY.runaway);
        }
        if (verticals.length === 1 && items.length === 1) {
            return mk('intensity', 'strong', INTENSITY.strong);
        }
        if (items.length === 1) {
            const it = items[0];
            if (isCircle(it.stroke, it.bbox)) {
                return mk('tense', 'completed', TENSE.completed);
            }
        }
        return null;
    }

    if (side === 'below') {
        if (items.length === 1) {
            const it = items[0];
            if (isWave(it.stroke, it.bbox)) {
                return mk('tense', 'sustained', TENSE.sustained);
            }
            if (isArch(it.stroke, it.bbox)) {
                return mk('negation', 'absorption', NEGATION.absorption);
            }
            if (isDot(it.stroke, it.bbox)) {
                return mk('intensity', 'barelyThere', INTENSITY.barelyThere);
            }
            if (isHorizontalBar(it.stroke, it.bbox)) {
                return mk('intensity', 'weak', INTENSITY.weak);
            }
        }
        return null;
    }

    if (side === 'left') {
        if (items.length === 1) {
            const it = items[0];
            // Triangle test BEFORE circle: a closed-loop with sharp corners
            // would otherwise misclassify as a circle since both pass the
            // closure + aspect-ratio screen.
            if (isTriangle(it.stroke, it.bbox)) {
                return mk('tense', 'conditional', TENSE.conditional);
            }
            if (isCircle(it.stroke, it.bbox)) {
                return mk('tense', 'delayed', TENSE.delayed);
            }
        }
        return null;
    }

    if (side === 'right') {
        // 반복 (⋮): 3 small dots at right, vertically aligned.
        if (items.length === 3 && items.every(it => isDot(it.stroke, it.bbox))) {
            const xs = items.map(it => (it.bbox.minX + it.bbox.maxX) / 2);
            const xRange = Math.max(...xs) - Math.min(...xs);
            const unitSize = Math.max(unit.bbox.w, unit.bbox.h, 1);
            if (xRange < unitSize * 0.10) {
                return mk('tense', 'repeating', TENSE.repeating);
            }
        }
        if (items.length === 1) {
            const it = items[0];
            if (isVertical(it.stroke)) {
                return mk('case', 'dative', CASE_MARKERS.dative);
            }
            if (isDiagonal(it.stroke, it.bbox)) {
                return mk('case', 'instrumental', CASE_MARKERS.instrumental);
            }
        }
        return null;
    }

    if (side === 'top-left') {
        if (items.length === 1 && isDot(items[0].stroke, items[0].bbox)) {
            return mk('case', 'nominative', CASE_MARKERS.nominative);
        }
        return null;
    }

    if (side === 'bottom-right') {
        if (items.length === 1 && isDot(items[0].stroke, items[0].bbox)) {
            return mk('case', 'accusative', CASE_MARKERS.accusative);
        }
        return null;
    }

    if (side === 'across') {
        if (items.length === 1) {
            const it = items[0];
            if (isHorizontalBar(it.stroke, it.bbox)) {
                return mk('negation', 'not', NEGATION.not);
            }
        }
        return null;
    }

    return null;
}

/**
 * Tightly cluster attached candidate strokes so multi-stroke particles
 * (X = 2 crossing strokes, ⋮ = 3 dots, ‖ = 2 verticals) become one cluster.
 * Padding is tighter than `clusterStrokesByProximity` so we don't accidentally
 * merge a top-side intensity mark with a bottom-side case marker.
 *
 * NOTE: Currently unused — superseded by `bucketBySide` + `classifySideBucket`.
 * Kept for potential future use in finer-grained clustering scenarios.
 */
function clusterAttachments(attachments, unit) {
    if (attachments.length === 0) return [];
    if (attachments.length === 1) return [attachments];

    const unitSize = Math.max(unit.bbox.w, unit.bbox.h, 1);
    const pad = unitSize * TIGHT_CLUSTER_PAD_REL;

    const parent = attachments.map((_, i) => i);
    const find = (x) => {
        while (parent[x] !== x) {
            parent[x] = parent[parent[x]];
            x = parent[x];
        }
        return x;
    };
    const union = (a, b) => {
        const ra = find(a), rb = find(b);
        if (ra !== rb) parent[ra] = rb;
    };

    for (let i = 0; i < attachments.length; i++) {
        for (let j = i + 1; j < attachments.length; j++) {
            const a = attachments[i].bbox;
            const b = attachments[j].bbox;
            if (a.minX - pad <= b.maxX && b.minX - pad <= a.maxX
                && a.minY - pad <= b.maxY && b.minY - pad <= a.maxY) {
                union(i, j);
            }
        }
    }

    const buckets = new Map();
    for (let i = 0; i < attachments.length; i++) {
        const r = find(i);
        if (!buckets.has(r)) buckets.set(r, []);
        buckets.get(r).push(attachments[i]);
    }
    return Array.from(buckets.values());
}

/**
 * Classify a cluster of attached strokes into a particle. Returns null when
 * the shape doesn't match any known particle (intentional — unknown decoration
 * gets ignored rather than misclassified).
 *
 * Returns: { family, key, name, symbol, meta }   meta = the table entry.
 */
function classifyParticleCluster(cluster, unit) {
    if (!cluster || cluster.length === 0) return null;

    // Cluster bbox + position relative to unit.
    const cbb = unionBbox(cluster.map(a => a.bbox));
    const pos = relPosition(cbb, unit.bbox);

    // 1. Multi-stroke clusters take priority — distinct shapes.
    if (cluster.length === 2) {
        // Two strokes: either parallel (‖) or crossing (X).
        if (areCrossing(cluster[0].stroke, cluster[1].stroke)) {
            // X above = 폭주 / 반전. Polysemy: spec lists both. Resolve by
            // family priority — intensity (폭주) wins over negation (반전)
            // for the same shape, so we emit 폭주.
            if (pos === 'above') {
                return mk('intensity', 'runaway', INTENSITY.runaway);
            }
            // X anywhere else still reads as 반전 (negation).
            return mk('negation', 'inversion', NEGATION.inversion);
        }
        if (areParallelVertical(cluster[0].stroke, cluster[1].stroke)) {
            if (pos === 'above') {
                return mk('intensity', 'intense', INTENSITY.intense);
            }
        }
    }
    if (cluster.length === 3) {
        // Three strokes: ||| (3 verticals above) = 극한, or ⋮ (3 dots
        // vertically aligned right) = 반복.
        const allVertical = cluster.every(a => isVertical(a.stroke));
        if (allVertical && pos === 'above') {
            return mk('intensity', 'extreme', INTENSITY.extreme);
        }
        const allDots = cluster.every(a => isDot(a.stroke, a.bbox));
        if (allDots && pos === 'right') {
            const xs = cluster.map(a => (a.bbox.minX + a.bbox.maxX) / 2);
            const xRange = Math.max(...xs) - Math.min(...xs);
            const unitSize = Math.max(unit.bbox.w, unit.bbox.h, 1);
            // Vertically aligned: x-coordinate spread should be tight.
            if (xRange < unitSize * 0.05) {
                return mk('tense', 'repeating', TENSE.repeating);
            }
        }
    }

    // 2. Single-stroke shapes.
    if (cluster.length !== 1) return null;
    const { stroke, bbox } = cluster[0];

    // Closed loop / circle / triangle (single stroke).
    if (isCircle(stroke, bbox)) {
        if (pos === 'above')   return mk('tense', 'completed', TENSE.completed);
        if (pos === 'left')    return mk('tense', 'delayed',   TENSE.delayed);
    }
    if (isTriangle(stroke, bbox)) {
        if (pos === 'left')    return mk('tense', 'conditional', TENSE.conditional);
    }
    if (isArch(stroke, bbox)) {
        if (pos === 'below')   return mk('negation', 'absorption', NEGATION.absorption);
    }
    if (isWave(stroke, bbox)) {
        if (pos === 'below')   return mk('tense', 'sustained', TENSE.sustained);
    }

    // Linear shapes: dot, horizontal bar, vertical, diagonal.
    if (isDot(stroke, bbox)) {
        if (pos === 'top-left')     return mk('case', 'nominative',   CASE_MARKERS.nominative);
        if (pos === 'bottom-right') return mk('case', 'accusative',   CASE_MARKERS.accusative);
        if (pos === 'below')        return mk('intensity', 'barelyThere', INTENSITY.barelyThere);
        if (pos === 'left' || pos === 'right') {
            // A standalone dot to the side without a sibling dot on the
            // opposite flank is ambiguous — bias toward case marker.
            return null;
        }
    }
    if (isHorizontalBar(stroke, bbox)) {
        if (pos === 'across')       return mk('negation', 'not',      NEGATION.not);
        if (pos === 'below')        return mk('intensity', 'weak',    INTENSITY.weak);
        if (pos === 'below-bbox')   return mk('case', 'locative',     CASE_MARKERS.locative);
    }
    if (isVertical(stroke)) {
        if (pos === 'above')        return mk('intensity', 'strong',  INTENSITY.strong);
        if (pos === 'right')        return mk('case', 'dative',       CASE_MARKERS.dative);
    }
    if (isDiagonal(stroke, bbox)) {
        if (pos === 'right')        return mk('case', 'instrumental', CASE_MARKERS.instrumental);
    }

    return null;
}

function mk(family, key, meta) {
    return {
        family,
        key,
        name: meta.name,
        symbol: meta.symbol,
        meta,
    };
}

/**
 * Apply per-rune priority resolution per §11.2.5:
 *   강도부사 > 격조사 > 시제 > 부정
 *   격조사 + 강도부사 stack.
 *
 * Within the same family only one wins (the first-detected, since shapes are
 * effectively mutually exclusive within a family — you can't have both 강화
 * and 극대 on the same rune because they're different stroke counts above).
 */
function resolvePerRune(unit, particles) {
    if (particles.length === 0) {
        return { unit, particles: [], powerMul: 1.0, instabilityDelta: 0, summary: '' };
    }

    // Bucket by family.
    const byFamily = { intensity: [], case: [], tense: [], negation: [] };
    for (const p of particles) byFamily[p.family].push(p);

    // Priority resolution.
    let resolved = [];
    if (byFamily.intensity.length > 0) {
        resolved.push(byFamily.intensity[0]);
        // Stack a case marker on top if present (per §11.2.5.4).
        if (byFamily.case.length > 0) resolved.push(byFamily.case[0]);
    } else if (byFamily.case.length > 0) {
        // No intensity → case marker keeps the slot. Multiple case markers
        // on the same rune (e.g. 주격 + 공동격) are unusual but allowed.
        resolved.push(...byFamily.case);
    } else if (byFamily.tense.length > 0) {
        resolved.push(byFamily.tense[0]);
    } else if (byFamily.negation.length > 0) {
        resolved.push(byFamily.negation[0]);
    }

    // Aggregate effects. Case markers are semantic-only (×1.0, ±0).
    let powerMul = 1.0;
    let instabilityDelta = 0;
    for (const p of resolved) {
        const m = p.meta;
        if (typeof m.powerMul === 'number') powerMul *= m.powerMul;
        if (typeof m.instabilityDelta === 'number')
            instabilityDelta += m.instabilityDelta;
    }

    const summary = resolved
        .map(p => `${p.symbol} ${p.name}`)
        .join(' + ');

    return { unit, particles: resolved, powerMul, instabilityDelta, summary };
}

// --------------------------------------------------------------------------
// Shape & position predicates
// --------------------------------------------------------------------------

function unionBbox(bboxes) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of bboxes) {
        if (b.minX < minX) minX = b.minX;
        if (b.minY < minY) minY = b.minY;
        if (b.maxX > maxX) maxX = b.maxX;
        if (b.maxY > maxY) maxY = b.maxY;
    }
    return {
        minX, minY, maxX, maxY,
        w: maxX - minX, h: maxY - minY,
        cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
    };
}

/**
 * Position of a particle bbox relative to the main rune's bbox. Buckets are
 * tuned for the §11.2 spec table (예: 주격 점은 룬 좌상단, 처격 가로선은
 * 룬 아래…). Returns one of:
 *   'above', 'below', 'left', 'right', 'top-left', 'top-right',
 *   'bottom-left', 'bottom-right', 'across', 'below-bbox', 'inside'
 */
function relPosition(particleBbox, unitBbox) {
    const px = (particleBbox.minX + particleBbox.maxX) / 2;
    const py = (particleBbox.minY + particleBbox.maxY) / 2;
    const u = unitBbox;
    const cx = (u.minX + u.maxX) / 2;
    const cy = (u.minY + u.maxY) / 2;
    const w = Math.max(u.w, 1);
    const h = Math.max(u.h, 1);

    // Tolerance buffer: 1D-ish runes (e.g. a single vertical bar with bbox.w
    // ≈ 0) would otherwise force every nearby particle into a corner bucket.
    // 10% of rune size (capped) lets a particle just-outside the rune's thin
    // edge resolve to 'above' / 'below' instead of 'top-left' / etc.
    const tol = Math.min(Math.max(w, h) * 0.10, 12);
    const insideX = px >= u.minX - tol && px <= u.maxX + tol;
    const insideY = py >= u.minY - tol && py <= u.maxY + tol;

    // 'across' means a horizontal bar that mostly overlaps the rune
    // horizontally AND its center sits inside the rune's vertical band:
    // exactly the §11.2.4 부정 (— 가로지름) shape.
    const horizSpan = particleBbox.w;
    const horizCovers = horizSpan >= w * 0.55
        && particleBbox.minX <= u.minX + w * 0.30
        && particleBbox.maxX >= u.maxX - w * 0.30;
    if (horizCovers && insideY) return 'across';

    // Corner check with a small `cornerTol` (smaller than the position
    // tolerance `tol`). A particle that's clearly outside the rune bbox on
    // BOTH axes goes into a corner bucket — even when one axis is within
    // the wider `tol`. This way 주격 (· top-left) and 목적격 (· bottom-right),
    // which sit clearly diagonal from the rune corner, are bucketed as
    // corners rather than as 'above' or 'right'. We use a smaller tolerance
    // here than for axis-inside checks so a near-axis particle still falls
    // through to dominant-axis logic.
    const cornerTol = Math.max(Math.max(w, h) * 0.08, 6);
    const strictlyOutsideX = px < u.minX - cornerTol || px > u.maxX + cornerTol;
    const strictlyOutsideY = py < u.minY - cornerTol || py > u.maxY + cornerTol;
    if (strictlyOutsideX && strictlyOutsideY) {
        const left  = px < cx;
        const above = py < cy;
        if (above && left)  return 'top-left';
        if (above && !left) return 'top-right';
        if (!above && left) return 'bottom-left';
        return 'bottom-right';
    }

    if (insideX && insideY) return 'inside';

    // Dominant axis when only one is inside (with tolerance).
    if (insideX) return py < u.minY ? 'above' : 'below';
    return px < u.minX ? 'left' : 'right';
}

function strokeLen(stroke) {
    let n = 0;
    for (let i = 1; i < stroke.length; i++) {
        const dx = stroke[i].x - stroke[i - 1].x;
        const dy = stroke[i].y - stroke[i - 1].y;
        n += Math.sqrt(dx * dx + dy * dy);
    }
    return n;
}

function isDot(stroke, bbox) {
    if (stroke.length <= 3) return true;
    const len = strokeLen(stroke);
    const span = Math.max(bbox.w, bbox.h);
    // Tiny extent → dot.
    return span < 12 || (len < 16 && bbox.w < 12 && bbox.h < 12);
}

function isHorizontalBar(stroke, bbox) {
    if (stroke.length < 2) return false;
    if (bbox.w < 8) return false;
    return bbox.w >= bbox.h * 2.0 && !isWave(stroke, bbox);
}

function isVertical(stroke) {
    if (stroke.length < 2) return false;
    const b = bboxOfStrokes([stroke]);
    if (b.h < 8) return false;
    return b.h >= b.w * 2.0;
}

function isDiagonal(stroke, bbox) {
    if (stroke.length < 2) return false;
    if (bbox.w < 6 || bbox.h < 6) return false;
    const ratio = bbox.w / bbox.h;
    if (ratio < 0.5 || ratio > 2.0) return false;
    // Roughly diagonal if start→end vector has nontrivial slope.
    const a = stroke[0], z = stroke[stroke.length - 1];
    const dx = Math.abs(z.x - a.x);
    const dy = Math.abs(z.y - a.y);
    return dx > 4 && dy > 4 && Math.abs(dx - dy) / Math.max(dx, dy) < 0.7;
}

function isCircle(stroke, bbox) {
    if (stroke.length < 6) return false;
    if (bbox.w < 8 || bbox.h < 8) return false;
    const a = stroke[0], z = stroke[stroke.length - 1];
    const closure = Math.hypot(z.x - a.x, z.y - a.y);
    const span = Math.max(bbox.w, bbox.h);
    if (closure > span * 0.4) return false;
    // Aspect ratio close to 1.
    const ratio = bbox.w / Math.max(bbox.h, 1);
    if (ratio < 0.5 || ratio > 2.0) return false;
    // Contains both an above-center and below-center point relative to bbox
    // center (excludes a closed but degenerate path).
    let touchesTop = false, touchesBot = false;
    const cy = (bbox.minY + bbox.maxY) / 2;
    for (const pt of stroke) {
        if (pt.y < cy - bbox.h * 0.2) touchesTop = true;
        if (pt.y > cy + bbox.h * 0.2) touchesBot = true;
    }
    return touchesTop && touchesBot;
}

function isTriangle(stroke, bbox) {
    // A single-stroke triangle: closure low + 3 corner-like direction
    // changes. Cheap heuristic: count direction reversals along the path.
    if (stroke.length < 6) return false;
    if (bbox.w < 8 || bbox.h < 8) return false;
    const a = stroke[0], z = stroke[stroke.length - 1];
    const closure = Math.hypot(z.x - a.x, z.y - a.y);
    const span = Math.max(bbox.w, bbox.h);
    if (closure > span * 0.4) return false;
    let corners = 0;
    let lastAngle = null;
    for (let i = 1; i < stroke.length; i++) {
        const dx = stroke[i].x - stroke[i - 1].x;
        const dy = stroke[i].y - stroke[i - 1].y;
        if (dx * dx + dy * dy < 1) continue;
        const ang = Math.atan2(dy, dx);
        if (lastAngle !== null) {
            let d = Math.abs(ang - lastAngle);
            if (d > Math.PI) d = 2 * Math.PI - d;
            if (d > Math.PI / 3) corners++;
        }
        lastAngle = ang;
    }
    return corners >= 2 && corners <= 4;
}

function isWave(stroke, bbox) {
    // Multiple vertical reversals = ~ shape. Specifically the y-coordinate
    // must oscillate at least twice as the stroke progresses left→right.
    if (stroke.length < 8) return false;
    if (bbox.w < bbox.h) return false;
    let reversals = 0;
    let lastDir = 0;
    for (let i = 1; i < stroke.length; i++) {
        const dy = stroke[i].y - stroke[i - 1].y;
        if (Math.abs(dy) < 0.5) continue;
        const dir = dy > 0 ? 1 : -1;
        if (lastDir !== 0 && dir !== lastDir) reversals++;
        lastDir = dir;
    }
    return reversals >= 2;
}

function isArch(stroke, bbox) {
    // ∩ — single-stroke arch: starts low, peaks high, ends low.
    if (stroke.length < 6) return false;
    if (bbox.h < 4) return false;  // a flat line is not an arch
    if (bbox.w < bbox.h * 0.6) return false;  // wider than tall-ish
    const a = stroke[0];
    const z = stroke[stroke.length - 1];
    const top = stroke.reduce((min, p) => (p.y < min.y ? p : min), a);
    // Endpoints both clearly below the peak by ≥ 50% of bbox height.
    const dropA = a.y - top.y;
    const dropZ = z.y - top.y;
    if (dropA < bbox.h * 0.5 || dropZ < bbox.h * 0.5) return false;
    // Endpoints roughly at the same height (forming a rounded cap).
    if (Math.abs(a.y - z.y) > bbox.h * 0.3) return false;
    return true;
}

/** True iff the two strokes' line segments cross within their bbox overlap. */
function areCrossing(s1, s2) {
    if (!s1 || !s2 || s1.length < 2 || s2.length < 2) return false;
    const a1 = s1[0], a2 = s1[s1.length - 1];
    const b1 = s2[0], b2 = s2[s2.length - 1];
    return segmentsIntersect(a1, a2, b1, b2);
}

function areParallelVertical(s1, s2) {
    if (!isVertical(s1) || !isVertical(s2)) return false;
    const b1 = bboxOfStrokes([s1]);
    const b2 = bboxOfStrokes([s2]);
    const cx1 = (b1.minX + b1.maxX) / 2;
    const cx2 = (b2.minX + b2.maxX) / 2;
    const meanW = (b1.w + b2.w) / 2;
    return Math.abs(cx1 - cx2) > meanW;  // distinct horizontal columns
}

function segmentsIntersect(p1, p2, p3, p4) {
    function ccw(a, b, c) {
        return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
    }
    return ccw(p1, p3, p4) !== ccw(p2, p3, p4)
        && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

// Internal hooks for unit testing.
export const __INTERNAL__ = {
    classifyParticleCluster,
    relPosition,
    isDot, isHorizontalBar, isVertical, isDiagonal,
    isCircle, isTriangle, isWave, isArch,
    areCrossing, areParallelVertical,
    INTENSITY, CASE_MARKERS, TENSE, NEGATION,
};
