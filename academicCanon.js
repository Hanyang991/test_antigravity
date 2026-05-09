import { CANON_DATA } from './data/canonData.js';
import { gameState } from './gameState.js';
import { on, emit } from './eventBus.js';
import { saveGame } from './saveLoad.js';

let initialized = false;

export function initAcademicCanon() {
  if (initialized) return;
  initialized = true;

  if (!Array.isArray(gameState.academic.canonMismatches)) {
    gameState.academic.canonMismatches = [];
  }

  on('magic:analyzed', (analysis) => {
    inspectCanonMismatch(analysis);
  });
}

export function getCanonEntries() {
  return CANON_DATA;
}

export function getCanonMismatches() {
  return Array.isArray(gameState.academic.canonMismatches)
    ? gameState.academic.canonMismatches
    : [];
}

export function getMismatchForSignature(signature) {
  return getCanonMismatches().find((item) => item.signature === signature) || null;
}

/**
 * 정설 힌트가 매칭된 발견을 조회한다. 매칭 시점에 항상 기록되므로
 * 관측값이 정설과 일치하는 케이스도 잡힌다.
 * @param {string} signature
 * @returns {{ canonId: string, observed: 'consistent'|'inconsistent', recordedAt: number } | null}
 */
export function getCanonMatchForSignature(signature) {
  const matches = gameState.academic.canonMatches;
  if (!matches || typeof matches !== 'object') return null;
  return matches[signature] || null;
}

/**
 * 발견을 정설과 비교해 분류한다.
 *
 *   - 'unknown'         : 정설 힌트와 매칭된 적 없음 → 신규 발견 가능
 *   - 'known_correct'   : 정설 힌트 매칭 + canon.isCorrect=true + 관측값 일치
 *                         → 신규 발견(new_discovery) 하드 거절 대상
 *   - 'known_disputed'  : 정설 힌트 매칭 + (canon.isCorrect=false 또는 관측값 충돌)
 *                         → 신규 발견은 점수/보상 차감 후 수락 (옵션 B),
 *                           도전(challenge)/보완(refinement) 가능
 *
 * @param {string} signature
 * @returns {{ classification: 'unknown'|'known_correct'|'known_disputed', canon: Object|null, reason: string }}
 */
export function classifyDiscoveryAgainstCanon(signature) {
  const match = getCanonMatchForSignature(signature);
  if (!match) {
    return { classification: 'unknown', canon: null, reason: '' };
  }

  const canon = CANON_DATA.find((c) => c.id === match.canonId) || null;
  if (!canon) {
    return { classification: 'unknown', canon: null, reason: '' };
  }

  const hasMismatch = getMismatchForSignature(signature) !== null;
  const canonIsKnownWrong = canon.isCorrect === false;

  if (hasMismatch || canonIsKnownWrong) {
    const reason = hasMismatch
      ? `관측값이 ${canon.discoveredBy} ${canon.year}년 정설(${canon.title})과 충돌함`
      : `${canon.title}는 학계 내부에서도 의문이 제기되는 정설임`;
    return { classification: 'known_disputed', canon, reason };
  }

  return {
    classification: 'known_correct',
    canon,
    reason: `이미 ${canon.discoveredBy} ${canon.year}년 정설(${canon.title})로 등재된 현상`,
  };
}

export function inspectCanonMismatch(analysis) {
  if (!analysis) return null;

  const candidates = CANON_DATA.filter((canon) => matchesCanonHint(analysis, canon));
  if (candidates.length === 0) return null;

  let firstMismatch = null;

  for (const canon of candidates) {
    const mismatch = buildMismatchIfNeeded(analysis, canon);
    recordCanonMatch(analysis, canon, mismatch ? 'inconsistent' : 'consistent');

    if (!mismatch) continue;

    const exists = getCanonMismatches().some(
      (entry) => entry.canonId === mismatch.canonId && entry.signature === mismatch.signature,
    );
    if (exists) {
      if (!firstMismatch) firstMismatch = mismatch;
      continue;
    }

    gameState.academic.canonMismatches.push(mismatch);
    emit('canon:mismatch', mismatch);
    saveGame();
    if (!firstMismatch) firstMismatch = mismatch;
  }

  return firstMismatch;
}

function recordCanonMatch(analysis, canon, observed) {
  const signature = analysis.discovery?.signature;
  if (!signature) return;
  if (!gameState.academic.canonMatches || typeof gameState.academic.canonMatches !== 'object') {
    gameState.academic.canonMatches = {};
  }
  const existing = gameState.academic.canonMatches[signature];
  // 일관성이 한 번이라도 깨진 적이 있으면 보존(observed='inconsistent' 가 우선).
  if (existing && existing.canonId === canon.id && existing.observed === 'inconsistent') {
    return;
  }
  gameState.academic.canonMatches[signature] = {
    canonId: canon.id,
    observed,
    recordedAt: Date.now(),
  };
}

function matchesCanonHint(analysis, canon) {
  if (canon.expectedSignature && analysis.discovery?.signature === canon.expectedSignature) {
    return true;
  }

  const legacyMeaning = analysis.legacy?.meaning || '';
  const rawSentence = analysis._raw?.sentence;
  const mainNames = rawSentence?.mainUnits?.map((unit) => unit.name) || [];

  if (canon.legacyHint.mainRune && !(legacyMeaning.includes(canon.legacyHint.mainRune) || mainNames.includes(canon.legacyHint.mainRune))) {
    return false;
  }

  if (canon.legacyHint.radical && !legacyMeaning.includes(canon.legacyHint.radical)) {
    return false;
  }

  return true;
}

function buildMismatchIfNeeded(analysis, canon) {
  const reasons = [];
  const expectedBand = canon.officialObservables?.instabilityBand;
  const actualInstability = analysis.observables?.instability ?? 0;
  const actualBand = Math.round(actualInstability / 5) * 5;
  const dynamics = analysis.legacy?.dynamics || '';
  const expectedDynamics = canon.officialObservables?.dynamics || '';

  if (canon.expectedSignature && analysis.discovery?.signature !== canon.expectedSignature) {
    reasons.push('signature mismatch');
  }
  if (expectedDynamics && dynamics && dynamics !== expectedDynamics) {
    reasons.push('dynamics mismatch');
  }
  if (typeof expectedBand === 'number' && Math.abs(actualBand - expectedBand) >= 10) {
    reasons.push('instability mismatch');
  }

  if (reasons.length === 0) return null;

  return {
    id: `mismatch_${canon.id}_${analysis.discovery?.signature || Date.now()}`,
    canonId: canon.id,
    canonTitle: canon.title,
    canonOfficialName: canon.officialName,
    signature: analysis.discovery?.signature,
    discoverySignature: analysis.discovery?.signature,
    reasons,
    actualObservables: {
      dynamics,
      instabilityBand: actualBand,
    },
    message: `학술 정설과 불일치: ${canon.discoveredBy} ${canon.year}년 정설은 이 현상을 '${canon.officialName}'로 기록했으나, 현재 관측값은 다른 반응을 가리킵니다. 도전 논문 후보입니다.`,
    createdAt: Date.now(),
  };
}
