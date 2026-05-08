/**
 * Magic Pipeline — 전체 분석 파이프라인 통합.
 *
 * canvas strokes → recognition → arrangement → boneInteraction →
 * sentence → particles → observables → signature → MagicAnalysis
 *
 * main.js는 이 함수 하나만 호출하면 모든 분석 결과를 받는다.
 * 기존 엔진 파일(recognition.js, arrangement.js 등)은 일절 수정하지 않는다.
 */

import { RecognitionEngine, __INTERNAL__ as RECOGNITION_INTERNAL } from './recognition.js';
import { analyzeArrangement } from './arrangement.js';
import { analyzeBoneInteraction } from './boneInteraction.js';
import { analyzeSentence as analyzeRawSentence } from './sentence.js';
import { analyzeParticles } from './particles.js';
import { analyzeConnectorLines } from './connectorLine.js';
import { analyzeGrammarTokens } from './grammarTokens.js';
import { analyzeSentence as analyzeSentenceStructure } from './sentenceAnalyzer.js';

const { bboxOfStrokes, clusterStrokesByProximity } = RECOGNITION_INTERNAL;

/**
 * 전체 분석 파이프라인 실행.
 *
 * @param {Object}             args
 * @param {Stroke[]}           args.runeStrokes    룬 모드 획
 * @param {Stroke[]}           args.boneStrokes    뼈대 모드 획
 * @param {Stroke[]}           args.allStrokes     전체 획 (순서 보존)
 * @param {string}             args.material       바탕재
 * @param {RecognitionEngine}  args.recognizer     인식 엔진 인스턴스
 * @returns {MagicAnalysis}
 */
export function analyzeMagic({ runeStrokes, boneStrokes, allStrokes, material, recognizer }) {
  const id = 'analysis_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const createdAt = Date.now();

  // ── 1. Legacy recognition (기존 recognition.js) ──────────────────
  const legacyResult = recognizer.analyzeRune(runeStrokes, boneStrokes);

  const legacy = {
    meaning: legacyResult.meaning,
    compoundName: legacyResult.compoundName,
    dynamics: legacyResult.dynamics,
    instabilityModifier: legacyResult.instabilityModifier,
    avgSpeed: legacyResult.avgSpeed,
    radicals: legacyResult.radicals,
  };

  // ── 2. Arrangement (§9) ──────────────────────────────────────────
  const arrangement = analyzeArrangement({
    runeStrokes,
    boneStrokes,
    recognizer,
    compoundName: legacy.compoundName,
  });

  // ── 3. Bone Interaction (§10) ────────────────────────────────────
  const firstBoneIdx = allStrokes.findIndex(s => s.length > 0 && s[0].mode === 'bone');
  const firstRuneIdx = allStrokes.findIndex(s => s.length > 0 && s[0].mode === 'rune');
  const boneFirst = firstBoneIdx >= 0 && firstRuneIdx >= 0 && firstBoneIdx < firstRuneIdx;

  const boneInteraction = analyzeBoneInteraction({
    runeStrokes,
    boneStrokes,
    boneFirst,
  });

  // ── 4. Sentence (§§11-12) ────────────────────────────────────────
  const sentence = analyzeRawSentence({
    runeStrokes,
    recognizer,
    arrangement,
    boneInteraction,
  });

  // ── 5. Particles (§11.2) ─────────────────────────────────────────
  const particleMainUnits = deriveParticleMainUnits({
    runeStrokes, arrangement, sentence, recognizer,
  });
  const particles = analyzeParticles({
    runeStrokes,
    mainUnits: particleMainUnits,
  });

  // ── 6. Observables 계산 ──────────────────────────────────────────
  const observables = computeObservables({
    runeStrokes, boneStrokes, allStrokes, material,
    legacy, arrangement, boneInteraction, sentence, particles,
  });

  // ── 7. Grammar token 정규화 (M4 어댑터) ──────────────────────────
  const connectors = analyzeConnectorLines({
    boneInteraction,
    sentence,
  });

  const grammar = analyzeGrammarTokens({
    sentence,
    particles,
    connectorLines: connectors,
  });

  // ── 8. Bone 정규화 (M3 어댑터) ───────────────────────────────────
  const bone = normalizeBone({ boneInteraction });

  // ── 9. Sentence 정규화 (M5 어댑터) ───────────────────────────────
  const sentenceNormalized = analyzeSentenceStructure({
    units: sentence.mainUnits,
    arrangement,
    connectors,
    grammar,
    boneInteractions: bone.interactions,
    material,
    rawSentence: sentence,
  });

  // ── 11. Signature 생성 ───────────────────────────────────────────
  const signature = generateSignature({
    legacy, arrangement, boneInteraction, grammar,
    sentenceNormalized, material, observables,
  });

  // ── 12. Discovery 상태 (discoverySystem이 나중에 채움) ───────────
  const discovery = {
    signature,
    knownToPlayer: false,
    knownToAcademy: false,
    displayName: null,
    status: 'unknown',
  };

  return {
    id,
    createdAt,
    input: {
      material,
      runeStrokeCount: runeStrokes.length,
      boneStrokeCount: boneStrokes.length,
      assistMode: 'free',
    },
    legacy,
    observables,
    arrangement: {
      kind: arrangement.kind,
      label: arrangement.label,
      detail: arrangement.detail,
      powerMul: arrangement.powerMul,
      instabilityDelta: arrangement.instabilityDelta,
      runeCount: arrangement.runeCount,
      units: arrangement.units,
    },
    bone,
    connectors,
    grammar,
    sentence: sentenceNormalized,
    discovery,
    // 기존 시스템 호환용 — rift.js가 직접 참조하는 필드
    meaning: legacy.meaning,
    compoundName: legacy.compoundName,
    // 기존 §9/§10/§11/§11.2 raw 결과 (UI에서 직접 접근)
    _raw: {
      arrangement,
      boneInteraction,
      sentence,
      particles,
    },
  };
}

// ── Observables (열/공명/불안정성) 계산 ────────────────────────────
function computeObservables({ runeStrokes, boneStrokes, allStrokes, material,
                              legacy, arrangement, boneInteraction, sentence, particles }) {
  // 공명: 뼈대 획 수 기반
  const resonance = Math.min(boneStrokes.length * 12.5, 100);

  // 열: 획 속도 기반
  let heat = 0;
  allStrokes.forEach(stroke => {
    if (stroke.length > 5) {
      const timeTaken = stroke[stroke.length - 1].t - stroke[0].t;
      if (timeTaken > 0) {
        const speed = stroke.length / timeTaken;
        heat += speed * 500;
      }
    }
  });
  heat = Math.floor(heat + (legacy.radicals.length * 50));

  // Volume (뼈대 면적)
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  boneStrokes.forEach(stroke => {
    stroke.forEach(pt => {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    });
  });
  const volume = minX !== Infinity
    ? Math.max(((maxX - minX) * (maxY - minY)) / 10000, 1)
    : 1;

  // Density (룬 밀도)
  let density = 0;
  runeStrokes.forEach(stroke => { density += stroke.length; });

  // Pressure
  const pressure = Math.floor((density * Math.max(heat, 1)) / (volume * 10));

  // Instability
  let baseInstability = (pressure * 0.1) + (heat * 0.05) - (resonance * 0.5);

  let maxHeat = 300;
  if (material === 'obsidian') { maxHeat = 9999; baseInstability -= 20; }
  else if (material === 'water') { maxHeat = 450; baseInstability += 10; }

  const arrangementDelta = arrangement?.instabilityDelta || 0;
  const boneInteractionDelta = boneInteraction?.instabilityDelta || 0;
  const sentenceDelta = sentence?.instabilityDelta || 0;
  const particleDelta = particles?.instabilityDelta || 0;

  const instability = Math.max(Math.min(
    baseInstability + legacy.instabilityModifier
    + arrangementDelta + boneInteractionDelta + sentenceDelta + particleDelta,
    100), 0);

  const overloaded = heat > maxHeat || instability >= 100;

  return {
    resonance,
    heat,
    pressure,
    instability,
    dynamics: legacy.dynamics,
    overloaded,
    maxHeat,
  };
}

// ── Signature 생성 (계획서 §519~545) ───────────────────────────────
function generateSignature({ legacy, arrangement, boneInteraction, grammar,
                             sentenceNormalized, material, observables }) {
  const parts = [
    'v2',
    legacy.compoundName || legacy.meaning || 'unknown',
    arrangement.kind || 'none',
    boneInteraction?.kind || 'none',
    sentenceNormalized?.pattern || 'none',
    material || 'parchment',
    bandHeat(observables.heat),
    bandInstability(observables.instability),
  ];
  // Simple deterministic hash from string parts
  const raw = parts.join('|');
  return 'sig_' + simpleHash(raw);
}

function bandHeat(heat) {
  return 'h' + (Math.round(heat / 25) * 25);
}

function bandInstability(instability) {
  return 'i' + (Math.round(instability / 5) * 5);
}

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// ── M3 어댑터: Bone 정규화 ────────────────────────────────────────
function normalizeBone({ boneInteraction }) {
  if (!boneInteraction || boneInteraction.kind === 'none') {
    return { interactions: [], totalInstabilityDelta: 0, totalResonanceMul: 1.0 };
  }
  return {
    interactions: [{
      type: boneInteraction.kind,
      label: boneInteraction.label,
      detail: boneInteraction.detail,
      shape: boneInteraction.shape,
      powerMul: boneInteraction.powerMul,
      instabilityDelta: boneInteraction.instabilityDelta,
    }],
    totalInstabilityDelta: boneInteraction.instabilityDelta || 0,
    totalResonanceMul: boneInteraction.powerMul || 1.0,
  };
}

// ── Particle main-unit derivation (main.js에서 이동) ───────────────
function deriveParticleMainUnits({ runeStrokes, arrangement, sentence, recognizer }) {
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
    const name = recognizer.identifyRune(group) || '복합 룬';
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
    const name = recognizer.identifyRune(group) || '복합 룬';
    return { name, bbox: bb, center: { x: bb.cx, y: bb.cy }, strokes: group };
  });
}

function decomposeByEndpointConnectivity(strokes, endpointTol = 18) {
  if (!strokes || strokes.length <= 1) return strokes && strokes.length > 0 ? [strokes] : [];
  const n = strokes.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const unite = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
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
          close(aEnd, bStart) || close(aEnd, bEnd)) {
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
