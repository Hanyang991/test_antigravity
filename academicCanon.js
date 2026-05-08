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

export function inspectCanonMismatch(analysis) {
  if (!analysis) return null;

  const candidates = CANON_DATA.filter((canon) => matchesCanonHint(analysis, canon));
  if (candidates.length === 0) return null;

  for (const canon of candidates) {
    const mismatch = buildMismatchIfNeeded(analysis, canon);
    if (!mismatch) continue;

    const exists = getCanonMismatches().some(
      (entry) => entry.canonId === mismatch.canonId && entry.signature === mismatch.signature,
    );
    if (exists) return mismatch;

    gameState.academic.canonMismatches.push(mismatch);
    emit('canon:mismatch', mismatch);
    saveGame();
    return mismatch;
  }

  return null;
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
