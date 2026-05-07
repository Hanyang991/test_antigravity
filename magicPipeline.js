// Unified analysis pipeline.
//
// Produces the canonical `MagicAnalysis` object defined in
// docs/IMPLEMENTATION_SPEC.md §437~509 from the raw canvas strokes. Every
// downstream system (UI panel, Rift game, M6 discovery, M7 papers, M8
// economy) reads this single object — that's what makes the rest of the
// game possible without circular imports between feature modules.
//
// This module is intentionally a *pure orchestrator*: it does not own any
// state and never touches `gameState`. Boundary owned by main.js:
//   1. partition strokes into rune / bone / current
//   2. call analyzeMagic({...}) here
//   3. mirror the result onto `state.*` for back-compat with existing UI
//   4. emit('magic:analyzed', analysis) so other modules can react
//
// The existing engine (recognition / arrangement / bone-interaction /
// sentence / particles) is reused verbatim. We do NOT re-implement any of
// their logic. We just call them in the correct order and reshape their
// outputs into the spec's canonical structure.

import { __INTERNAL__ as RECOGNITION_INTERNAL } from './recognition.js';
import { analyzeArrangement } from './arrangement.js';
import { analyzeBoneInteraction } from './bone-interaction.js';
import { analyzeSentence } from './sentence.js';
import { analyzeParticles } from './particles.js';

const { bboxOfStrokes, clusterStrokesByProximity } = RECOGNITION_INTERNAL;

// Bumped whenever the signature input set changes. Used inside the hashed
// payload so the same drawing on a future version doesn't collide with an
// old recorded discovery.
export const SIGNATURE_VERSION = 1;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run the full analysis pipeline.
 *
 * @param {object}    args
 * @param {Stroke[]}  args.runeStrokes  Strokes drawn in rune mode (filtered).
 * @param {Stroke[]}  args.boneStrokes  Strokes drawn in bone mode (filtered).
 * @param {Stroke[]}  [args.allStrokes] All strokes including current in
 *                                       drawing order. Used to determine
 *                                       boneFirst (받치기) and to compute
 *                                       drawing-speed heat live.
 * @param {string}    [args.material]    'parchment' | 'obsidian' | 'water'.
 * @param {string}    [args.assistMode]  'free' | 'ruler' | 'compass'.
 * @param {RecognitionEngine} args.recognizer  Shared engine instance.
 * @returns {MagicAnalysis}
 */
export function analyzeMagic({
  runeStrokes,
  boneStrokes,
  allStrokes,
  material = 'parchment',
  assistMode = 'free',
  recognizer,
}) {
  const all = Array.isArray(allStrokes) ? allStrokes : [...boneStrokes, ...runeStrokes];

  // 1. Recognition (single-rune templates + radical compound table). Output is
  //    the legacy answer the player must NOT see directly per §74~82.
  const legacyAnalysis = recognizer
    ? recognizer.analyzeRune(runeStrokes, boneStrokes)
    : { meaning: '알 수 없는 문양', compoundName: null, dynamics: '대기 중', instabilityModifier: 0, radicals: [], avgSpeed: 0 };

  // 2. Arrangement (§9). Compound short-circuits to 'overlapping'.
  const arrangement = analyzeArrangement({
    runeStrokes,
    boneStrokes,
    recognizer,
    compoundName: legacyAnalysis.compoundName,
  });

  // 3. Bone × Rune interaction (§10). boneFirst = the first bone stroke in
  //    drawing order precedes the first rune stroke (받치기 detection).
  const firstBoneIdx = all.findIndex(s => s && s.length > 0 && s[0].mode === 'bone');
  const firstRuneIdx = all.findIndex(s => s && s.length > 0 && s[0].mode === 'rune');
  const boneFirst = firstBoneIdx >= 0 && firstRuneIdx >= 0 && firstBoneIdx < firstRuneIdx;
  const bone = analyzeBoneInteraction({ runeStrokes, boneStrokes, boneFirst });

  // 4. Sentence (§§11-12).
  const sentence = analyzeSentence({
    runeStrokes,
    recognizer,
    arrangement,
    boneInteraction: bone,
  });

  // 5. Particles (§11.2). Stacks with §2 compounds intentionally.
  const particleMainUnits = derivePerticleMainUnits({
    runeStrokes,
    arrangement,
    sentence,
    recognizer,
  });
  const particles = analyzeParticles({
    runeStrokes,
    mainUnits: particleMainUnits,
  });

  // 6. Physics (heat/pressure/resonance/instability) — folds in every layer's
  //    instabilityDelta so the final number reflects what the cast will use.
  const observables = computeObservables({
    allStrokes: all,
    runeStrokes,
    boneStrokes,
    material,
    legacyAnalysis,
    deltas: {
      arrangement: numberOr(arrangement?.instabilityDelta, 0),
      bone:        numberOr(bone?.instabilityDelta, 0),
      sentence:    numberOr(sentence?.instabilityDelta, 0),
      particles:   numberOr(particles?.instabilityDelta, 0),
    },
  });

  // 7. Assemble MagicAnalysis (§437~509). Spec-required fields are always
  //    present; back-compat fields (kind, label, detail, powerMul) are also
  //    mirrored onto each subobject so the existing UI panel and rift.cast()
  //    keep working without modification.
  const analysis = {
    id: makeAnalysisId(),
    createdAt: Date.now(),

    input: {
      material,
      runeStrokeCount: runeStrokes.length,
      boneStrokeCount: boneStrokes.length,
      assistMode,
    },

    legacy: {
      meaning: legacyAnalysis.meaning,
      compoundName: legacyAnalysis.compoundName ?? null,
      dynamics: legacyAnalysis.dynamics,
      instabilityModifier: numberOr(legacyAnalysis.instabilityModifier, 0),
      radicals: legacyAnalysis.radicals ?? [],
      avgSpeed: numberOr(legacyAnalysis.avgSpeed, 0),
    },

    observables: {
      resonance: observables.resonance,
      heat: observables.heat,
      pressure: observables.pressure,
      instability: observables.instability,
      dynamics: legacyAnalysis.dynamics,
      overloaded: observables.overloaded,
      maxHeat: observables.maxHeat,
    },

    arrangement: {
      kind: arrangement?.kind ?? 'none',
      label: arrangement?.label ?? '단일 룬',
      detail: arrangement?.detail ?? '',
      powerMul: numberOr(arrangement?.powerMul, 1.0),
      instabilityDelta: numberOr(arrangement?.instabilityDelta, 0),
      runeCount: arrangement?.runeCount ?? (arrangement?.units?.length ?? 0),
      units: arrangement?.units ?? [],
    },

    bone: {
      // Spec wants `interactions` array. bone-interaction.js currently returns
      // a single result so we wrap it (when non-trivial) and keep the
      // singleton fields mirrored on top for back-compat consumers.
      interactions: (bone && bone.kind && bone.kind !== 'none') ? [bone] : [],
      totalInstabilityDelta: numberOr(bone?.instabilityDelta, 0),
      totalResonanceMul: numberOr(bone?.powerMul, 1.0),
      // back-compat (rift.cast + analyzer panel):
      kind: bone?.kind ?? 'none',
      label: bone?.label ?? '단순 뼈대',
      detail: bone?.detail ?? '',
      shape: bone?.shape ?? null,
      powerMul: numberOr(bone?.powerMul, 1.0),
      instabilityDelta: numberOr(bone?.instabilityDelta, 0),
    },

    connectors: buildConnectors({ bone, sentence }),

    grammar: buildGrammarFromParticles(particles),

    sentence: {
      readingOrder: sentence?.directionKey ?? 'left_to_right',
      grade: sentence?.gradeKey ?? 'word',
      pattern: sentence?.pattern ?? null,
      normalizedText: buildNormalizedText(sentence),
      semanticTags: buildSemanticTags(sentence),
      // back-compat (rift.cast + analyzer panel):
      kind: sentence?.kind ?? 'none',
      label: sentence?.label ?? '',
      direction: sentence?.direction ?? null,
      directionKey: sentence?.directionKey ?? null,
      connectors: sentence?.connectors ?? [],
      mainCount: sentence?.mainCount ?? 0,
      mainUnits: sentence?.mainUnits ?? [],
      powerMul: numberOr(sentence?.powerMul, 1.0),
      instabilityDelta: numberOr(sentence?.instabilityDelta, 0),
      detail: sentence?.detail ?? '',
    },

    // Particles aren't a top-level field in the §437~509 schema; they feed
    // grammar.tokens/roles/modifiers above. We keep the raw particles output
    // available too because rift.cast() and the analyzer panel both already
    // consume it directly. Treat this as a stable back-compat alias rather
    // than spec-canonical.
    particles,

    discovery: {
      signature: '',          // filled below
      knownToPlayer: false,   // M6 fills in
      knownToAcademy: false,  // M7 fills in
      displayName: null,      // M6 fills in (player-given name)
      status: 'unknown',      // 'unknown' | 'recorded' | 'reproduced' | 'published'
    },
  };

  analysis.discovery.signature = makeSignature(analysis);
  return analysis;
}

// ---------------------------------------------------------------------------
// Signature
// ---------------------------------------------------------------------------

/** Round heat into 25°C bands per §539-541. */
export function bandHeat(heat) {
  return Math.round((heat || 0) / 25) * 25;
}

/** Round instability into 5% bands per §543-545. */
export function bandInstability(instability) {
  return Math.round((instability || 0) / 5) * 5;
}

/**
 * Hash an arbitrary serializable payload into a stable, short signature.
 * Same input → same output, across reloads and machines. We use cyrb53,
 * which is fast and well-distributed for short strings.
 */
function hash53(str) {
  let h1 = 0xdeadbeef ^ 0;
  let h2 = 0x41c6ce57 ^ 0;
  for (let i = 0, ch; i < str.length; i++) {
    ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0));
}

/**
 * Produce a discovery signature from a MagicAnalysis. Per spec §519~545 the
 * signature folds in:
 *   - mainLegacyEffect           (compoundName ?? meaning)
 *   - normalizedRuneUnits        (sorted unit names)
 *   - arrangementKind
 *   - boneInteractionTypes
 *   - connectorTypes (bone lines)
 *   - grammarOperators (sentence connectors)
 *   - sentencePattern
 *   - material
 *   - observableBand (banded heat/instability)
 *
 * Returns 'sig_' + base36 hash.
 */
export function makeSignature(analysis) {
  const parts = signatureParts(analysis);
  const json = JSON.stringify(parts);
  const h = hash53(json);
  return 'sig_' + h.toString(36);
}

/** Visible to tests so they can inspect what the hash is built over. */
export function signatureParts(analysis) {
  const a = analysis;
  return {
    v: SIGNATURE_VERSION,
    legacy: a.legacy?.compoundName ?? a.legacy?.meaning ?? null,
    units: (a.arrangement?.units ?? []).map(u => u.name).filter(Boolean).slice().sort(),
    arrangementKind: a.arrangement?.kind ?? 'none',
    boneTypes: (a.bone?.interactions ?? [])
      .map(b => b.kind)
      .filter(k => k && k !== 'none')
      .slice()
      .sort(),
    connectorLines: (a.connectors?.links ?? [])
      .map(l => l.lineType ?? l.type ?? null)
      .filter(Boolean)
      .slice()
      .sort(),
    grammarOperators: (a.connectors?.operators ?? [])
      .map(op => op.fn ?? op.rune ?? null)
      .filter(Boolean)
      .slice()
      .sort(),
    sentencePattern: a.sentence?.pattern ?? null,
    sentenceGrade: a.sentence?.grade ?? 'word',
    material: a.input?.material ?? 'parchment',
    band: {
      h: bandHeat(a.observables?.heat),
      i: bandInstability(a.observables?.instability),
    },
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function numberOr(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

let _idCounter = 0;
function makeAnalysisId() {
  // Monotonic id is enough — never persisted, only used to dedupe events.
  _idCounter = (_idCounter + 1) >>> 0;
  return `analysis_${Date.now().toString(36)}_${_idCounter.toString(36)}`;
}

/**
 * Derive the "main rune" anchors particles attach to. Re-clusters the
 * rune strokes (rather than reusing arrangement.units) so a small clean
 * stroke that the recognizer claimed as a separate main rune can still fire
 * as a particle when its bbox is much smaller than the dominant cluster.
 *
 * Migrated verbatim from main.js — see PR #11 commits 514a719 / 01f5b90 for
 * rationale.
 */
export function derivePerticleMainUnits({ runeStrokes, arrangement, sentence, recognizer }) {
  if (!runeStrokes || runeStrokes.length === 0) return [];
  const clusters = clusterStrokesByProximity(runeStrokes);
  if (!clusters || clusters.length === 0) return [];

  const groups = [];
  for (const cluster of clusters) {
    for (const g of decomposeByEndpointConnectivity(cluster)) groups.push(g);
  }

  const sized = groups.map(group => {
    const bb = bboxOfStrokes(group);
    const area = Math.max(bb.w, 1) * Math.max(bb.h, 1);
    return { group, bb, area };
  });
  sized.sort((a, b) => b.area - a.area);

  if (sized.length === 1) {
    const { group, bb } = sized[0];
    const name = recognizer?.identifyRune(group) || '복합 룬';
    return [{ name, bbox: bb, center: { x: bb.cx, y: bb.cy }, strokes: group }];
  }

  const dominantArea = sized[0].area;
  const MAIN_AREA_RATIO = 0.30;
  const mainBuckets = sized.filter(s => s.area >= dominantArea * MAIN_AREA_RATIO);

  if (mainBuckets.length === sized.length) {
    if (sentence && Array.isArray(sentence.mainUnits) && sentence.mainUnits.length > 0) {
      return sentence.mainUnits;
    }
    if (arrangement && Array.isArray(arrangement.units) && arrangement.units.length > 0) {
      return arrangement.units;
    }
  }

  return mainBuckets.map(({ group, bb }) => {
    const name = recognizer?.identifyRune(group) || '복합 룬';
    return { name, bbox: bb, center: { x: bb.cx, y: bb.cy }, strokes: group };
  });
}

/**
 * Union-find on stroke endpoints. Strokes whose endpoints sit within
 * `endpointTol` of each other are grouped. A bar drawn through a circle but
 * not touching its endpoints comes out as its own group.
 *
 * Migrated verbatim from main.js (PR #11 commit 01f5b90).
 */
export function decomposeByEndpointConnectivity(strokes, endpointTol = 18) {
  if (!strokes || strokes.length <= 1) {
    return strokes && strokes.length > 0 ? [strokes] : [];
  }
  const n = strokes.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const unite = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const tol2 = endpointTol * endpointTol;
  const close = (p, q) => {
    if (!p || !q) return false;
    const dx = p.x - q.x, dy = p.y - q.y;
    return dx * dx + dy * dy <= tol2;
  };
  for (let i = 0; i < n; i++) {
    const sa = strokes[i];
    if (!sa || sa.length === 0) continue;
    const aStart = sa[0], aEnd = sa[sa.length - 1];
    for (let j = i + 1; j < n; j++) {
      const sb = strokes[j];
      if (!sb || sb.length === 0) continue;
      const bStart = sb[0], bEnd = sb[sb.length - 1];
      if (close(aStart, bStart) || close(aStart, bEnd) ||
          close(aEnd,   bStart) || close(aEnd,   bEnd)) {
        unite(i, j);
      }
    }
  }
  const buckets = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!buckets.has(r)) buckets.set(r, []);
    buckets.get(r).push(strokes[i]);
  }
  return Array.from(buckets.values());
}

/**
 * Compute thermodynamic observables from raw strokes. Same formulas as the
 * pre-pipeline analyzeCurrentState() in main.js — extracted here so the rest
 * of the game can read the canonical numbers off MagicAnalysis.observables
 * instead of reaching into transient `state`.
 */
function computeObservables({ allStrokes, runeStrokes, boneStrokes, material, legacyAnalysis, deltas }) {
  // Volume from bone bbox area. Floor at 1 so divisions don't blow up.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const stroke of boneStrokes) {
    for (const pt of stroke) {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    }
  }
  let volume = 1;
  if (minX !== Infinity) {
    volume = Math.max(((maxX - minX) * (maxY - minY)) / 10000, 1);
  }

  // Density (n) = total rune-stroke point count.
  let density = 0;
  for (const s of runeStrokes) density += s.length;

  // Heat from drawing speed (resistance heat ≈ I²R). Ruler / compass strokes
  // get their timestamps unified upstream so this loop is safe (PR #12).
  let speedHeat = 0;
  for (const s of allStrokes) {
    if (s && s.length > 5) {
      const dt = s[s.length - 1].t - s[0].t;
      if (dt > 0) {
        const speed = s.length / dt; // points per ms
        speedHeat += speed * 500;
      }
    }
  }

  const boneCount = boneStrokes.length;
  const radicalCount = legacyAnalysis.radicals?.length ?? 0;
  const resonance = Math.min(boneCount * 12.5, 100);
  const heat = Math.floor(speedHeat + radicalCount * 50);
  const pressure = Math.floor((density * Math.max(heat, 1)) / (volume * 10));

  let baseInstability = (pressure * 0.1) + (heat * 0.05) - (resonance * 0.5);
  let maxHeat = 150;
  if (material === 'obsidian') {
    maxHeat = 9999;
    baseInstability -= 20;
  } else if (material === 'water') {
    maxHeat = 300;
    baseInstability += 10;
  }

  const instability = clamp(
    baseInstability +
      numberOr(legacyAnalysis.instabilityModifier, 0) +
      deltas.arrangement + deltas.bone + deltas.sentence + deltas.particles,
    0,
    100,
  );

  return {
    resonance,
    heat,
    pressure,
    instability,
    overloaded: heat > maxHeat || instability >= 100,
    maxHeat,
  };
}

function clamp(v, lo, hi) {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Build connectors.{links, operators}. §10 connector lines (when bone reads
 * as a "bridging" interaction between two rune clusters) become structural
 * links; §11 connector runes (대지/이사/게보/나우디즈/케나즈/다가즈) become
 * grammatical operators.
 *
 * `bone.links` is the M3 adapter shape — a list of every connector span the
 * bridging analyzer detected, each with its own `lineType` (raw §10 key:
 * 단선/이중선/삼중선/점선/파선/물결선/나선/갈래선/고리선). Older callers /
 * fixtures that returned a single bridging interaction without a `links`
 * array fall back to `bone.lineType` so the signature still captures the
 * connector classification.
 */
function buildConnectors({ bone, sentence }) {
  const links = [];
  if (bone && Array.isArray(bone.links) && bone.links.length > 0) {
    for (const link of bone.links) {
      links.push({
        type: 'bone-line',
        lineType: link.lineType ?? null,
        label: link.lineLabel ?? link.label ?? '',
        powerMul: numberOr(link.powerMul, 1.0),
        instabilityDelta: numberOr(link.instabilityDelta, 0),
        bridgeCount: link.bridgeCount ?? null,
        endpoints: link.endpoints ?? [],
      });
    }
  } else if (bone && bone.kind === 'bridging') {
    // Bridging detected but no `links` array — synthesize one from the
    // top-level fields so signature inputs stay consistent with the
    // `links`-aware path.
    links.push({
      type: 'bone-line',
      lineType: bone.lineType ?? null,
      label: bone.lineLabel ?? bone.detail ?? bone.label ?? '',
      powerMul: numberOr(bone.powerMul, 1.0),
      instabilityDelta: numberOr(bone.instabilityDelta, 0),
      bridgeCount: bone.bridgeCount ?? null,
    });
  }

  const operators = [];
  if (sentence && Array.isArray(sentence.connectors)) {
    for (const c of sentence.connectors) {
      operators.push({
        type: 'connector-rune',
        rune: c.rune,
        fn: c.fn,
        english: c.english,
        between: c.between ?? [],
      });
    }
  }

  return { links, operators };
}

/**
 * Build grammar.{tokens, roles, modifiers} from the §11.2 particle analyzer
 * output. Particles fall into three buckets:
 *   - case markers (격조사)            → roles
 *   - intensity / tense / negation    → modifiers
 * Every particle also lands in `tokens` so the discovery / paper systems can
 * iterate without family-specific code.
 */
function buildGrammarFromParticles(particles) {
  const empty = { tokens: [], roles: [], modifiers: [] };
  if (!particles || particles.kind !== 'particle' || !Array.isArray(particles.runes)) {
    return empty;
  }
  const tokens = [];
  const roles = [];
  const modifiers = [];
  for (const r of particles.runes) {
    const targetName = r.unit?.name ?? null;
    const list = Array.isArray(r.particles) ? r.particles : [];
    for (const p of list) {
      const tok = {
        family: p.family,
        key: p.key,
        name: p.name,
        symbol: p.symbol,
        target: targetName,
      };
      tokens.push(tok);
      if (p.family === 'case') roles.push(tok);
      else modifiers.push(tok);
    }
  }
  return { tokens, roles, modifiers };
}

/**
 * Build a normalized text representation of the sentence for
 * paper-system queries. Form: "<unit> [conn=fn] <unit> ..." with connector
 * runes interpolated where they fall.
 */
function buildNormalizedText(sentence) {
  if (!sentence || !Array.isArray(sentence.mainUnits) || sentence.mainUnits.length === 0) {
    return '';
  }
  const names = sentence.mainUnits.map(u => u?.name ?? '?');
  if (!Array.isArray(sentence.connectors) || sentence.connectors.length === 0) {
    return names.join(' · ');
  }
  // Best-effort interleave: place each connector after the unit that first
  // appears in its `between` pair. Spec doesn't require strict ordering;
  // M6 renders this as a hint, not as an exact reconstruction.
  const parts = [];
  for (let i = 0; i < names.length; i++) {
    parts.push(names[i]);
    const c = sentence.connectors.find(c =>
      Array.isArray(c.between) && c.between[0] === names[i]);
    if (c) parts.push(`[${c.fn}]`);
  }
  return parts.join(' ');
}

/**
 * Heuristic semantic-tag list. M6 / M7 use these to suggest "similar
 * phenomena" hints. Tags are derived purely from the sentence-level fields
 * so they remain blind to the legacy compound name.
 */
function buildSemanticTags(sentence) {
  const tags = new Set();
  if (sentence?.gradeKey) tags.add(`grade:${sentence.gradeKey}`);
  if (sentence?.directionKey) tags.add(`direction:${sentence.directionKey}`);
  if (sentence?.pattern) tags.add(`pattern:${sentence.pattern}`);
  if (Array.isArray(sentence?.connectors)) {
    for (const c of sentence.connectors) {
      if (c.fn) tags.add(`op:${c.fn}`);
    }
  }
  return Array.from(tags);
}

// Visible to tests.
export const __INTERNAL__ = {
  computeObservables,
  buildConnectors,
  buildGrammarFromParticles,
  buildNormalizedText,
  buildSemanticTags,
  signatureParts,
  hash53,
};
