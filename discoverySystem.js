/**
 * Discovery System — 블라인드 발견 + 재현 판정.
 *
 * 플레이어는 정답명을 보지 못한다. 대신 관측값(열/공명/불안정성/문장 등급)만
 * 보면서 현상을 발견하고, 이름을 붙이고, 재현해 논문을 제출한다.
 *
 * 계획서 §1563~1654 기준.
 */

import { gameState } from './gameState.js';
import { emit } from './eventBus.js';
import { saveGame } from './saveLoad.js';

/**
 * 분석 결과를 발견 DB에 기록한다.
 * 새 signature → 미확인 반응 등록, 기존 signature → 재현 카운트 증가.
 *
 * @param {MagicAnalysis} analysis  magicPipeline 결과
 * @returns {{ isNew: boolean, entry: Object, reproCount: number }}
 */
export function recordDiscovery(analysis) {
  if (!analysis || !analysis.discovery || !analysis.discovery.signature) {
    return { isNew: false, entry: null, reproCount: 0 };
  }

  const sig = analysis.discovery.signature;
  const db = gameState.discoveries;
  const existing = db.bySignature[sig];

  if (!existing) {
    // ── 새로운 현상 발견 ─────────────────────────────────────────
    const entry = {
      signature: sig,
      firstSeenAt: {
        week: gameState.progression.currentWeek,
        day: gameState.progression.currentDay,
      },
      playerName: null,
      playerDescription: '',
      reproducibility: {
        count: 1,
        requiredForPaper: 3,
        records: [buildRecord(analysis)],
      },
      academic: {
        knownToAcademy: false,
        canonId: null,
        canonName: null,
        canonCorrect: null,
      },
      status: 'observed',
      // 블라인드 모드: 정답명은 내부에만 보관
      _legacyMeaning: analysis.legacy?.meaning || '',
      _legacyCompound: analysis.legacy?.compoundName || null,
    };

    db.bySignature[sig] = entry;

    // 최근 발견 목록 (최대 50개)
    db.recentSignatures.unshift(sig);
    if (db.recentSignatures.length > 50) db.recentSignatures.pop();

    emit('discovery:new', { signature: sig, entry, analysis });
    saveGame();
    return { isNew: true, entry, reproCount: 1 };
  }

  // ── 기존 현상 재현 ───────────────────────────────────────────
  const record = buildRecord(analysis);
  const isRepro = checkReproductionMatch(existing, record);

  if (isRepro) {
    existing.reproducibility.count++;
    existing.reproducibility.records.push(record);
    // 최대 20개 기록만 보관
    if (existing.reproducibility.records.length > 20) {
      existing.reproducibility.records.shift();
    }

    // 3회 재현 시 논문 제출 가능
    if (existing.reproducibility.count >= 3 && existing.status === 'observed') {
      existing.status = 'reproducible';
    }

    // 도감 해금 — 3회 재현 시. 복합 룬은 unlockedCompounds, 기초 룬은 unlockedRunes에 등록.
    if (existing.reproducibility.count >= 3) {
      if (existing._legacyCompound) {
        const compoundName = existing._legacyCompound;
        const compounds = gameState.progression.unlockedCompounds;
        if (compoundName && Array.isArray(compounds) && !compounds.includes(compoundName)) {
          compounds.push(compoundName);
          emit('dictionary:unlocked', { compoundName, entry: existing, kind: 'compound' });
        }
      } else {
        const grade = analysis.sentence?.grade || 'single_rune';
        if (grade === 'single_rune' || grade === 'word') {
          const runeName = existing._legacyMeaning;
          if (runeName && !gameState.progression.unlockedRunes.includes(runeName)) {
            gameState.progression.unlockedRunes.push(runeName);
            emit('dictionary:unlocked', { runeName, entry: existing, kind: 'rune' });
          }
        }
      }
    }

    emit('discovery:reproduced', {
      signature: sig,
      entry: existing,
      reproCount: existing.reproducibility.count,
      analysis,
    });
  } else {
    // 유사 현상 — 재현으로 치지 않음
    emit('discovery:variant', { signature: sig, entry: existing, record, analysis });
  }

  saveGame();
  return { isNew: false, entry: existing, reproCount: existing.reproducibility.count };
}

/**
 * 플레이어가 현상에 이름을 붙인다.
 * @param {string} signature
 * @param {string} name
 * @param {string} [description]
 */
export function nameDiscovery(signature, name, description = '') {
  const entry = gameState.discoveries.bySignature[signature];
  if (!entry) return false;
  entry.playerName = name;
  entry.playerDescription = description;
  emit('discovery:named', { signature, name, description });
  saveGame();
  return true;
}

/**
 * 특정 signature의 발견 상태를 조회한다.
 * @param {string} signature
 * @returns {Object|null}
 */
export function getDiscovery(signature) {
  return gameState.discoveries.bySignature[signature] || null;
}

/**
 * 모든 발견을 최근 순으로 반환한다.
 * @returns {Object[]}
 */
export function getAllDiscoveries() {
  return gameState.discoveries.recentSignatures
    .map(sig => gameState.discoveries.bySignature[sig])
    .filter(Boolean);
}

// ── 내부 헬퍼 ─────────────────────────────────────────────────────

function buildRecord(analysis) {
  return {
    heat: analysis.observables?.heat || 0,
    instability: analysis.observables?.instability || 0,
    resonance: analysis.observables?.resonance || 0,
    material: analysis.input?.material || 'parchment',
    sentenceGrade: analysis.sentence?.grade || 'single_rune',
    boneType: analysis._raw?.boneInteraction?.kind || 'none',
    timestamp: Date.now(),
  };
}

/**
 * 재현 판정. 계획서 §1640~1647 허용 오차 기준.
 * @param {Object} existing  기존 발견 엔트리
 * @param {Object} record    새 기록
 * @returns {boolean}
 */
function checkReproductionMatch(existing, record) {
  if (existing.reproducibility.records.length === 0) return true;

  // 첫 기록을 기준으로 비교
  const ref = existing.reproducibility.records[0];

  // heat ±15%
  if (ref.heat > 0) {
    const heatDiff = Math.abs(record.heat - ref.heat) / ref.heat;
    if (heatDiff > 0.15) return false;
  }

  // instability ±10%p
  if (Math.abs(record.instability - ref.instability) > 10) return false;

  // resonance ±20%
  if (ref.resonance > 0) {
    const resDiff = Math.abs(record.resonance - ref.resonance) / ref.resonance;
    if (resDiff > 0.20) return false;
  }

  // sentence pattern 동일
  if (record.sentenceGrade !== ref.sentenceGrade) return false;

  // bone interaction 핵심 유형 동일
  if (record.boneType !== ref.boneType) return false;

  return true;
}
