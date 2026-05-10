import { CANON_DATA } from './data/canonData.js';
import { gameState } from './gameState.js';
import { on, emit } from './eventBus.js';
import { saveGame } from './saveLoad.js';
import { consumeForAction } from './actionCosts.js';

/**
 * Phase 5 능력 'register_canon' 이 해금된 후 도전·보완 논문 수락분에 대해
 * 본인 이름으로 정설을 갱신할 때 즉시 지급되는 자원 보상.
 * 학회별 논문 보상과 별개의 capstone 보상이며, multiplier 적용 대상이 아니다.
 */
export const REGISTER_CANON_REWARDS = {
  degreeScore: 50,
  reputation: 20,
  researchFunds: 500,
};

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

/**
 * Phase 5 의 `register_canon` 능력으로, 이미 수락된 도전·보완 논문(challenge/refinement)에
 * 대해 플레이어 이름으로 정설을 등재한다.
 *
 * 전제:
 *   - paper.status === 'accepted' 이고 papers.accepted 에 존재
 *   - paper.type === 'challenge' || 'refinement'
 *   - paper.review.canonOverride 가 채워져 있음 (mismatch 가 있던 도전 논문 수락분)
 *   - gameState.progression.canRegisterCanon === true (Phase 5 도달)
 *   - 같은 canonId 슬롯에 registered=true 가 아직 박히지 않았음 (멱등)
 *
 * 효과:
 *   - canonOverrides 슬롯에 registered/registeredAt/registeredByPaper/newOfficialName 추가
 *   - paper.review.canonOverride 에도 같은 정보 동기화 (UI 가 review 객체만 봐도 알 수 있게)
 *   - REGISTER_CANON_REWARDS 즉시 지급 (학위 50 / 평판 20 / 연구비 500G)
 *   - 'canon:registered' 이벤트 발행
 *   - actionCosts.registerCanon (5일) 만큼 schedule.consumeTime 호출
 *
 * @param {string} paperId
 * @returns {{ ok: true, override, rewards, timeConsumed } | { ok: false, reason: string }}
 */
export function registerCanon(paperId) {
  if (!gameState.progression?.canRegisterCanon) {
    return { ok: false, reason: '석학(Phase 5) 진입 후에만 정설 등재가 가능합니다.' };
  }

  const paper = gameState.papers?.accepted?.find((p) => p.id === paperId);
  if (!paper) {
    return { ok: false, reason: '수락된 논문을 찾을 수 없습니다.' };
  }

  if (paper.type !== 'challenge' && paper.type !== 'refinement') {
    return { ok: false, reason: '도전·보완 논문만 정설 등재 대상입니다.' };
  }

  const override = paper.review?.canonOverride;
  if (!override || !override.canonId) {
    return { ok: false, reason: '갱신 대상 정설이 없습니다.' };
  }

  if (!gameState.academic.canonOverrides || typeof gameState.academic.canonOverrides !== 'object') {
    gameState.academic.canonOverrides = {};
  }
  const slot = gameState.academic.canonOverrides[override.canonId];
  if (slot?.registered) {
    return { ok: false, reason: '이미 등재된 정설입니다.' };
  }

  const registeredAt = {
    week: gameState.progression.currentWeek,
    day: gameState.progression.currentDay,
  };
  const enrichment = {
    registered: true,
    registeredAt,
    registeredByPaper: paper.id,
    registeredByAuthor: paper.authorName || '플레이어',
    newOfficialName: paper.title,
  };
  if (slot) Object.assign(slot, enrichment);
  else gameState.academic.canonOverrides[override.canonId] = { ...override, ...enrichment };
  Object.assign(override, enrichment);

  gameState.resources.degreeScore += REGISTER_CANON_REWARDS.degreeScore;
  gameState.resources.reputation += REGISTER_CANON_REWARDS.reputation;
  gameState.resources.researchFunds += REGISTER_CANON_REWARDS.researchFunds;

  emit('canon:registered', {
    paper,
    canonId: override.canonId,
    override,
    rewards: REGISTER_CANON_REWARDS,
  });

  saveGame();

  // 시간 비용은 emit + save 후에 적용 — schedule.consumeTime 이 도중에
  // paper:review_due / expedition:return 큐를 dispatch 해도 등재 자체는 이미 커밋됨.
  const timeConsumed = consumeForAction('registerCanon');

  return { ok: true, override, rewards: REGISTER_CANON_REWARDS, timeConsumed };
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
