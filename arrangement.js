/**
 * Arrangement Analyzer (RUNE_DICTIONARY.md §9)
 *
 * Looks at the *spatial layout* of multiple recognized runes on the canvas
 * and classifies it into one of six grammatical arrangements:
 *
 *   - linear        직선 배열   순차/연쇄
 *   - circular      원형 배열   지속/증폭 (뼈대 원 둘레 + 핵)
 *   - triangular    삼각 배열   안정/균형 (뼈대 삼각형 꼭짓점)
 *   - radial        방사형 배열  광역 방출
 *   - overlapping   중첩 배열   융합 (현 부수 조합 시스템)
 *   - symmetric    대칭 배열   공명 보너스
 *
 * Output is a small struct that downstream code (analyzer UI, Rift cast,
 * instability calc) can consume without re-implementing geometry.
 */

import { RecognitionEngine, __INTERNAL__ } from './recognition.js';

const { bboxOfStrokes, clusterStrokesByProximity } = __INTERNAL__;

// Default no-op result. analyzeArrangement returns this shape always so
// callers can read .kind / .powerMul / .instabilityDelta unconditionally.
const NONE = {
  kind: 'none',
  label: '',
  detail: '',
  powerMul: 1.0,
  instabilityDelta: 0,
  runeCount: 0,
  units: [],
};

/**
 * @param {Object}   args
 * @param {Stroke[]} args.runeStrokes          Strokes drawn in rune mode.
 * @param {Stroke[]} args.boneStrokes          Strokes drawn in bone mode.
 * @param {RecognitionEngine} args.recognizer  Shared recognizer instance.
 * @param {string|null} [args.compoundName]    Compound name from analyzeRune
 *                                             (if non-null we already know
 *                                             the layout is overlapping).
 */
export function analyzeArrangement({ runeStrokes, boneStrokes, recognizer, compoundName = null }) {
  if (!runeStrokes || runeStrokes.length === 0) return { ...NONE };

  // The compound rune system (PR #4) already handles overlapping: 열기△ + 대지ㅡ
  // drawn through it produces a compound. When that fires, the spec assigns
  // ×2.0 power but defers instability to the combination table — our delta
  // here stays 0 to avoid double-counting.
  if (compoundName) {
    return {
      kind: 'overlapping',
      label: '중첩 배열',
      detail: `결합: ${compoundName}`,
      powerMul: 2.0,
      instabilityDelta: 0,
      runeCount: 2,
      units: [],
    };
  }

  // Cluster strokes spatially, then run the recognizer on each cluster.
  // Only clusters that identify as a known rune count as a "unit". Failed
  // clusters are likely radicals / noise and are ignored for arrangement.
  const clusters = clusterStrokesByProximity(runeStrokes);
  const units = [];
  for (const cluster of clusters) {
    const name = recognizer.identifyRune(cluster);
    if (!name) continue;
    const bb = bboxOfStrokes(cluster);
    units.push({
      name,
      bbox: bb,
      center: { x: bb.cx, y: bb.cy },
      strokes: cluster,
    });
  }

  const n = units.length;
  if (n < 2) return { ...NONE, runeCount: n, units };

  // ── Triangular (bone triangle + 3 rune units near vertices) ──────────
  // Existing bone simplification: 3 bone strokes ≡ "triangle". We don't try
  // to fit a perfect triangle to the strokes — instead we check that the
  // three rune centers cluster near the three bone-stroke centers.
  if (n === 3 && boneStrokes.length === 3) {
    const tri = triangularFit(units, boneStrokes);
    if (tri) return tri;
  }

  // ── Circular (bone circle + runes around perimeter, optional 핵) ─────
  // Single bone stroke closed enough to look like a circle, with rune
  // centers either on the perimeter (orbital) or one centered (핵).
  if (n >= 2 && boneStrokes.length === 1) {
    const circ = circularFit(units, boneStrokes[0]);
    if (circ) return circ;
  }

  // ── Linear (≥2 rune centers along a straight line) ───────────────────
  const lin = linearFit(units);
  if (lin) {
    // If 3+ runes line up AND all gaps fit within ~20% of overall bbox we
    // upgrade to "밀집 직선" (chain speed). 3+ aligned at all → "연쇄술식"
    // chain bonus (+0.2 mul). These stack.
    return lin;
  }

  // ── Symmetric (≥3 centers mirror across central vertical axis) ───────
  // Tested before radial: a perfect symmetric layout (e.g. mirrored pairs)
  // can also pass the equidistant test, so we prefer the more specific axis
  // mirror reading.
  if (n >= 3) {
    const sym = symmetricFit(units);
    if (sym) return sym;
  }

  // ── Radial (≥3 centers equidistant from centroid) ────────────────────
  if (n >= 3) {
    const rad = radialFit(units);
    if (rad) return rad;
  }

  // Default: 2+ runes that don't fit any pattern still register as a
  // weak linear sequence so the UI can call them out.
  return {
    kind: 'linear',
    label: '직선 배열',
    detail: '느슨한 배치',
    powerMul: 1.0,
    instabilityDelta: 0,
    runeCount: n,
    units,
  };
}

// ── Geometry helpers ────────────────────────────────────────────────────

function triangularFit(units, boneStrokes) {
  // Triangle vertices = points where two bone-edge endpoints coincide.
  // Each of the 3 bone strokes contributes its two endpoints; each true
  // vertex is shared by 2 strokes → cluster the 6 endpoints into 3 groups.
  const overall = bboxOfStrokes(boneStrokes);
  const span = Math.max(overall.w, overall.h);
  if (span < 1) return null;
  const epTol = span * 0.15;
  const endpoints = boneStrokes.flatMap(s => [s[0], s[s.length - 1]]);
  const vertices = [];
  for (const ep of endpoints) {
    const found = vertices.find(v => Math.hypot(v.x - ep.x, v.y - ep.y) < epTol);
    if (found) {
      // running average
      found.x = (found.x * found.n + ep.x) / (found.n + 1);
      found.y = (found.y * found.n + ep.y) / (found.n + 1);
      found.n += 1;
    } else {
      vertices.push({ x: ep.x, y: ep.y, n: 1 });
    }
  }
  if (vertices.length !== 3) return null;

  // Match each rune to the closest unused vertex.
  const tolerance = span * 0.35;
  const used = new Set();
  for (const u of units) {
    let bestIdx = -1, bestDist = Infinity;
    for (let i = 0; i < vertices.length; i++) {
      if (used.has(i)) continue;
      const d = Math.hypot(u.center.x - vertices[i].x, u.center.y - vertices[i].y);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx === -1 || bestDist > tolerance) return null;
    used.add(bestIdx);
  }

  // Distinct vs uniform names → 삼원소 균형 vs 삼중 강화.
  const names = units.map(u => u.name);
  const uniqueCount = new Set(names).size;
  if (uniqueCount === 3) {
    return {
      kind: 'triangular',
      label: '삼각 배열',
      detail: '삼원소 균형',
      powerMul: 1.2,
      instabilityDelta: -20,
      runeCount: 3,
      units,
    };
  }
  if (uniqueCount === 1) {
    return {
      kind: 'triangular',
      label: '삼각 배열',
      detail: `삼중 강화 (${names[0]})`,
      powerMul: 2.0,
      instabilityDelta: 30,
      runeCount: 3,
      units,
    };
  }
  return {
    kind: 'triangular',
    label: '삼각 배열',
    detail: '',
    powerMul: 1.2,
    instabilityDelta: -10,
    runeCount: 3,
    units,
  };
}

function circularFit(units, boneStroke) {
  const bb = bboxOfStrokes([boneStroke]);
  // Aspect ratio close to 1 + decent size means it's plausibly a ring.
  const ar = bb.w === 0 ? 0 : bb.h / bb.w;
  if (ar < 0.5 || ar > 2.0) return null;
  if (Math.max(bb.w, bb.h) < 40) return null;

  const r = Math.max(bb.w, bb.h) / 2;
  const cx = bb.cx, cy = bb.cy;

  let coreUnit = null;
  const orbitals = [];
  for (const u of units) {
    const d = Math.hypot(u.center.x - cx, u.center.y - cy);
    if (d < r * 0.4) {
      coreUnit = u; // 핵: rune sitting at the center
    } else if (d < r * 1.25) {
      orbitals.push(u); // on or near the perimeter
    } else {
      return null; // outside the ring → not actually circular
    }
  }

  // Need at least one rune on the perimeter to call it circular at all.
  if (orbitals.length === 0) return null;

  // Spec: 룬 수가 많을수록 순환 마력 증가 (n × 0.3 추가)
  const cycleBonus = orbitals.length * 0.3;
  const detail = coreUnit ? `핵: ${coreUnit.name} · 둘레 ${orbitals.length}` : `둘레 ${orbitals.length}`;
  return {
    kind: 'circular',
    label: '원형 배열',
    detail,
    powerMul: 1.5 + cycleBonus,
    instabilityDelta: 15,
    runeCount: orbitals.length + (coreUnit ? 1 : 0),
    units,
  };
}

function linearFit(units) {
  if (units.length < 2) return null;
  const pts = units.map(u => u.center);

  // Fit a line via the dominant axis: principal direction = vector from
  // first to last point. Compute the perpendicular residual for each.
  const x0 = pts[0].x, y0 = pts[0].y;
  const xN = pts[pts.length - 1].x, yN = pts[pts.length - 1].y;
  const len = Math.hypot(xN - x0, yN - y0);
  if (len < 1) return null;
  const dx = (xN - x0) / len, dy = (yN - y0) / len;

  let maxResid = 0;
  for (const p of pts) {
    // perpendicular distance = |(p - p0) × dir|
    const vx = p.x - x0, vy = p.y - y0;
    const cross = Math.abs(vx * dy - vy * dx);
    if (cross > maxResid) maxResid = cross;
  }
  // Tolerance: residual / total length < 18% to count as collinear.
  if (maxResid / len > 0.18) return null;
  if (units.length === 2) {
    return {
      kind: 'linear',
      label: '직선 배열',
      detail: '',
      powerMul: 1.0,
      instabilityDelta: 0,
      runeCount: 2,
      units,
    };
  }

  // 3+ collinear → 연쇄술식 (+0.2). Check density for 밀집 보너스.
  const sorted = [...pts].sort((a, b) =>
    Math.abs(dx) > Math.abs(dy) ? a.x - b.x : a.y - b.y
  );
  let maxGap = 0;
  for (let i = 1; i < sorted.length; i++) {
    const g = Math.hypot(sorted[i].x - sorted[i - 1].x, sorted[i].y - sorted[i - 1].y);
    if (g > maxGap) maxGap = g;
  }
  const dense = maxGap / len < 0.4; // gaps don't exceed 40% of total span

  let powerMul = 1.0 + 0.2; // 연쇄술식
  let detail = '연쇄술식';
  if (dense) {
    powerMul += 0.1;
    detail += ' · 밀집 직선';
  }
  return {
    kind: 'linear',
    label: '직선 배열',
    detail,
    powerMul,
    instabilityDelta: 0,
    runeCount: units.length,
    units,
  };
}

function radialFit(units) {
  // Centroid + variance of distances. If stddev/mean < 20% the points sit
  // on a roughly equal radius → radial spoke.
  let cx = 0, cy = 0;
  for (const u of units) { cx += u.center.x; cy += u.center.y; }
  cx /= units.length; cy /= units.length;
  const dists = units.map(u => Math.hypot(u.center.x - cx, u.center.y - cy));
  const mean = dists.reduce((a, b) => a + b, 0) / dists.length;
  if (mean < 1) return null;
  const variance = dists.reduce((a, d) => a + (d - mean) ** 2, 0) / dists.length;
  const stddev = Math.sqrt(variance);
  if (stddev / mean > 0.2) return null;
  return {
    kind: 'radial',
    label: '방사형 배열',
    detail: `${units.length}방향 방출`,
    powerMul: 0.8 * units.length, // ×0.8 per ray (광역 방출)
    instabilityDelta: 20,
    runeCount: units.length,
    units,
  };
}

function symmetricFit(units) {
  // Test mirror symmetry across a vertical axis through the centroid.
  // For each unit, find its mirror partner; if every unit has one (within
  // tolerance) it counts as symmetric. Tolerance: 15% of overall span.
  const overall = bboxOfStrokes(units.flatMap(u => u.strokes));
  const span = Math.max(overall.w, overall.h);
  if (span < 1) return null;
  const tolerance = span * 0.15;

  let cx = 0, cy = 0;
  for (const u of units) { cx += u.center.x; cy += u.center.y; }
  cx /= units.length; cy /= units.length;

  // Build a multiset and try to pair (allow self-pairing on the axis).
  const remaining = units.map((_, i) => i);
  while (remaining.length > 0) {
    const i = remaining.shift();
    const u = units[i];
    const mirror = { x: 2 * cx - u.center.x, y: u.center.y };
    if (Math.hypot(u.center.x - cx, 0) < tolerance) continue; // on axis
    let matchAt = -1;
    for (let k = 0; k < remaining.length; k++) {
      const o = units[remaining[k]];
      if (o.name !== u.name) continue;
      if (Math.hypot(o.center.x - mirror.x, o.center.y - mirror.y) < tolerance) {
        matchAt = k; break;
      }
    }
    if (matchAt === -1) return null;
    remaining.splice(matchAt, 1);
  }

  return {
    kind: 'symmetric',
    label: '대칭 배열',
    detail: '공명 보너스',
    powerMul: 1.3,
    instabilityDelta: -15,
    runeCount: units.length,
    units,
  };
}

// Exposed for tests.
export const __INTERNAL__ARRANGEMENT__ = {
  triangularFit, circularFit, linearFit, radialFit, symmetricFit,
};
