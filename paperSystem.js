import { gameState } from './gameState.js';
import { getDiscovery } from './discoverySystem.js';
import {
  getMismatchForSignature,
  classifyDiscoveryAgainstCanon,
} from './academicCanon.js';
import { PAPER_SOCIETIES } from './data/paperReviewData.js';
import { emit, on as onBus } from './eventBus.js';
import { saveGame } from './saveLoad.js';
import { enqueueEvent } from './schedule.js';
import { consumeForAction } from './actionCosts.js';

// known_disputed 정설 위에 올라온 new_discovery 논문은 받되 점수와 보상을
// 차감한다 (옵션 B). 기존 정설 재검증의 부분 기여로 취급. 0.7은 잘 쓴
// disputed paper 가 basic 학회 acceptThreshold(60)를 통과하면서 high(70)
// 에는 못 닿는 수준 — raw 95 → final 67. 0.4 시절에는 사실상 hard-reject
// 였어서 manual 검증 후 완화함.
//
// UI(논문 카드 / 모달 경고)가 "NN% 차감" 문구를 동적으로 계산할 수 있도록
// export 한다 — 하드코딩된 문자열이 이 상수 튜닝 시 조용히 어긋나지 않도록
// 하는 장치.
export const DISPUTED_CANON_PENALTY_MULTIPLIER = 0.7;

// 학회별 심사 지연 일수 — submitPaper 시점에서 N일 뒤 'paper:review_due' 이벤트가
// fire 되어야 reviewPaper가 호출된다 (M8: 시간 흐름 기반 심사).
const REVIEW_DELAY_DAYS = {
  basic_magic_society: 3,
  thermodynamic_magic_society: 5,
  high_magic_society: 7,
  forbidden_magic_society: 10,
};

function getReviewDelayDays(societyId) {
  return REVIEW_DELAY_DAYS[societyId] ?? 5;
}

function getCurrentDayIndex() {
  const week = gameState.progression.currentWeek || 1;
  const day = gameState.progression.currentDay || 1;
  return ((week - 1) * 7) + day;
}

export function getSocieties() {
  return Object.values(PAPER_SOCIETIES);
}

/**
 * 논문 작성 모달 프리필 — 발견의 증거 요약과 추천 제목/주장을 반환한다.
 * 플레이어는 모달에서 이를 확인·편집한 뒤 createPaperDraft + submitPaper를 호출한다.
 *
 * @param {string} signature
 * @param {string} type  'new_discovery' | 'refinement' | 'challenge' | 'sentence_formula' | 'forbidden'
 * @returns {{ ok: boolean, discovery?: Object, evidence?: Object, suggestedTitle?: string, suggestedClaim?: string, mismatch?: Object|null }}
 */
export function getPaperSuggestion(signature, type = 'new_discovery') {
  const discovery = getDiscovery(signature);
  if (!discovery) return { ok: false };
  return {
    ok: true,
    discovery,
    evidence: buildEvidence(discovery),
    suggestedTitle: suggestTitle(discovery, type),
    suggestedClaim: suggestClaim(discovery, type),
    mismatch: getMismatchForSignature(signature),
  };
}

export function getEligiblePaperPlans() {
  const plans = [];
  for (const signature of gameState.discoveries.recentSignatures) {
    const discovery = getDiscovery(signature);
    if (!discovery) continue;
    const types = getEligiblePaperTypes(discovery);
    if (types.length === 0) continue;
    plans.push({
      signature,
      discovery,
      types,
      mismatch: getMismatchForSignature(signature),
      classification: classifyDiscoveryAgainstCanon(signature),
    });
  }
  return plans;
}

export function createPaperDraft({
  discoverySignature,
  type = 'new_discovery',
  targetSociety = 'basic_magic_society',
  title = '',
  claim = '',
  authorName = '플레이어',
}) {
  const discovery = getDiscovery(discoverySignature);
  if (!discovery) return null;

  const evidence = buildEvidence(discovery);
  const draft = {
    id: `paper_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    type,
    title: title || suggestTitle(discovery, type),
    discoverySignature,
    authorName,
    targetSociety,
    claim: claim || suggestClaim(discovery, type),
    evidence,
    status: 'draft',
    createdAt: Date.now(),
  };

  gameState.papers.drafts.unshift(draft);
  emit('paper:drafted', draft);
  saveGame();

  const timeConsumed = consumeForAction('createPaperDraft');
  if (timeConsumed > 0) draft.timeConsumed = timeConsumed;
  return draft;
}

/**
 * 논문 제출 — 즉시 심사하지 않고 학회별 지연 후 'paper:review_due' 이벤트가
 * fire되어야 심사가 끝난다. consumeTime/advanceDay가 schedule 큐를 dispatch
 * 하면서 자동으로 runDuePaperReview를 트리거한다.
 *
 * @param {string} paperId
 * @returns {Object|null}  제출된 paper 객체 (status='submitted'). 심사 결과는
 *   `papers.accepted` / `papers.rejected` 에서 확인하거나 'paper:accepted' /
 *   'paper:rejected' 이벤트로 수신한다.
 */
export function submitPaper(paperId) {
  const index = gameState.papers.drafts.findIndex((paper) => paper.id === paperId);
  if (index < 0) return null;

  const paper = gameState.papers.drafts.splice(index, 1)[0];
  paper.status = 'submitted';
  paper.submittedAt = Date.now();

  const delayDays = getReviewDelayDays(paper.targetSociety);
  paper.reviewDelayDays = delayDays;
  paper.reviewDueDayIndex = getCurrentDayIndex() + delayDays;

  gameState.papers.submitted.unshift(paper);
  emit('paper:submitted', paper);

  enqueueEvent({
    delayDays,
    type: 'paper:review_due',
    payload: { paperId: paper.id },
    label: `${paper.title || '논문'} 심사 마감`,
  });

  saveGame();
  return paper;
}

/**
 * 'paper:review_due' 이벤트 수신 시 즉시 호출되거나, 외부에서 강제로 심사를
 * 트리거하고 싶을 때 호출. 이미 accepted/rejected 처리된 논문은 다시 처리하지
 * 않는다.
 */
export function runDuePaperReview(paperId) {
  const submittedIdx = gameState.papers.submitted.findIndex((p) => p.id === paperId);
  if (submittedIdx < 0) return null;

  const paper = gameState.papers.submitted[submittedIdx];
  const review = reviewPaper(paper);
  finalizePaperReview(paper, review);
  saveGame();
  return review;
}

// 모듈 로드 시 단 한 번 등록되는 리스너. consumeTime/advanceDay가 큐 이벤트를
// dispatch하면 schedule.js가 emit('paper:review_due', event) 호출하므로
// payload.paperId 로 실제 심사를 진행한다.
onBus('paper:review_due', (event) => {
  const paperId = event?.payload?.paperId;
  if (paperId) runDuePaperReview(paperId);
});

/**
 * 학회별 심사. 점수(score)와 결과(accepted/disputed/rejected)를 함께 반환한다.
 *
 * 결과 분기:
 *   - 하드 게이트(Phase 미달, 학회가 받지 않는 type 등) 위반 → reject
 *   - score >= acceptThreshold                              → accept
 *   - score >= rejectThreshold AND (challenge|refinement)   → disputed (재논의 큐)
 *   - 그 외                                                  → reject
 *
 * 반환 값:
 *   { accepted, disputed, score, reasons, society, reviewerVoice, canonOverride }
 */
export function reviewPaper(paper) {
  const society = PAPER_SOCIETIES[paper.targetSociety];
  if (!society) {
    return {
      accepted: false,
      disputed: false,
      score: 0,
      reasons: ['알 수 없는 학회입니다.'],
      society: null,
      reviewerVoice: '',
      canonOverride: null,
      classification: null,
    };
  }

  // PR-F: 정설 분류 게이트.
  // known_correct + new_discovery → 점수와 무관하게 하드 거절.
  // (학회는 이미 등재된 현상을 신규 발견으로 다시 받지 않는다.)
  const classification = classifyDiscoveryAgainstCanon(paper.discoverySignature);
  if (
    classification.classification === 'known_correct' &&
    paper.type === 'new_discovery' &&
    classification.canon
  ) {
    const canon = classification.canon;
    return {
      accepted: false,
      disputed: false,
      score: 0,
      reasons: [
        `이미 ${canon.discoveredBy} ${canon.year}년 정설(${canon.title})로 등재된 현상입니다. 신규 발견 등재 불가.`,
      ],
      society,
      reviewerVoice: society.reviewerVoice?.rejected || '',
      canonOverride: null,
      classification,
    };
  }

  const evidence = paper.evidence || {};
  const hardGate = evaluateHardGate(paper, society);
  if (!hardGate.ok) {
    return {
      accepted: false,
      disputed: false,
      score: 0,
      reasons: hardGate.reasons,
      society,
      reviewerVoice: society.reviewerVoice?.rejected || '',
      canonOverride: null,
      classification,
    };
  }

  const scored = scoreReview(paper, society, evidence);
  let finalScore = scored.score;
  const finalReasons = [...scored.reasons];
  let penaltyApplied = false;

  // PR-F: known_disputed + new_discovery → 점수/보상 차감 (옵션 B).
  // 기존 정설을 검증하는 미세 기여로 취급하며, 임계값 판정은 차감된 점수
  // 기준이다. 현재 곱은 DISPUTED_CANON_PENALTY_MULTIPLIER(=0.7) — 잘 쓴
  // disputed paper(raw 95) 가 basic 학회 acceptThreshold(60) 는 통과(최종 67)
  // 하면서 high(70) 에는 닿지 않는 수준이다. 이전 0.4 시절에는 사실상 hard-reject
  // 였어서 PR-F tune 커밋(8c3d314)에서 0.7 로 완화됨.
  if (
    classification.classification === 'known_disputed' &&
    paper.type === 'new_discovery' &&
    classification.canon
  ) {
    finalScore = Math.max(0, Math.round(finalScore * DISPUTED_CANON_PENALTY_MULTIPLIER));
    finalReasons.push(
      `기존 정설(${classification.canon.title}) 검증 — 미세 기여로 점수 ${Math.round((1 - DISPUTED_CANON_PENALTY_MULTIPLIER) * 100)}% 차감`,
    );
    penaltyApplied = true;
  }

  const accepted = finalScore >= society.acceptThreshold;
  const challengesCanon = paper.type === 'challenge' || paper.type === 'refinement';
  const disputed = !accepted && challengesCanon && finalScore >= society.rejectThreshold;

  const outcomeKey = accepted ? 'accepted' : disputed ? 'disputed' : 'rejected';
  const reviewerVoice = society.reviewerVoice?.[outcomeKey] || '';

  return {
    accepted,
    disputed,
    score: finalScore,
    reasons: finalReasons,
    society,
    reviewerVoice,
    canonOverride: null,
    classification,
    canonPenaltyApplied: penaltyApplied,
  };
}

function finalizePaperReview(paper, review) {
  gameState.papers.submitted = gameState.papers.submitted.filter((item) => item.id !== paper.id);

  if (review.accepted) {
    paper.status = 'accepted';
    paper.review = review;
    gameState.papers.accepted.unshift(paper);

    if (paper.type === 'challenge' || paper.type === 'refinement') {
      const override = recordCanonOverride(paper, review);
      if (override) review.canonOverride = override;
    }

    const rewardMultiplier = review.canonPenaltyApplied ? DISPUTED_CANON_PENALTY_MULTIPLIER : 1;
    const grantedRewards = applyRewards(review.society.rewards, rewardMultiplier);
    review.grantedRewards = grantedRewards;
    emit('paper:accepted', { paper, review });
    return;
  }

  if (review.disputed) {
    paper.status = 'disputed';
    paper.review = review;
    if (!Array.isArray(gameState.papers.disputes)) gameState.papers.disputes = [];
    gameState.papers.disputes.unshift(paper);
    emit('paper:disputed', { paper, review });
    return;
  }

  paper.status = 'rejected';
  paper.review = review;
  gameState.papers.rejected.unshift(paper);
  emit('paper:rejected', { paper, review });
}

function recordCanonOverride(paper, review) {
  const mismatch = getMismatchForSignature(paper.discoverySignature);
  if (!mismatch || !mismatch.canonId) return null;

  if (!gameState.academic.canonOverrides || typeof gameState.academic.canonOverrides !== 'object') {
    gameState.academic.canonOverrides = {};
  }

  const override = {
    canonId: mismatch.canonId,
    canonTitle: mismatch.canonTitle,
    overriddenBy: paper.id,
    overriddenByTitle: paper.title,
    replacedBySignature: paper.discoverySignature,
    societyId: review.society?.id || null,
    overriddenAt: {
      week: gameState.progression.currentWeek,
      day: gameState.progression.currentDay,
    },
    score: review.score,
  };
  gameState.academic.canonOverrides[mismatch.canonId] = override;
  emit('canon:overridden', override);
  return override;
}

function evaluateHardGate(paper, society) {
  const reasons = [];

  if (paper.type === 'challenge' && !society.challengeable) {
    reasons.push(`${society.name}는 도전 논문을 받지 않습니다.`);
  }

  if (society.id === 'forbidden_magic_society' && gameState.progression.currentPhase < 3) {
    reasons.push('금서 학회는 Phase 3 이상에서만 접수합니다.');
  }

  if (society.id === 'basic_magic_society') {
    const grade = paper.evidence?.sentenceGrade || 'single_rune';
    if (!['single_rune', 'compound_word', 'phrase'].includes(grade)) {
      reasons.push('기초 학회는 단일 룬·복합어·구 등급만 심사합니다.');
    }
  }

  return { ok: reasons.length === 0, reasons };
}

/**
 * 학회별 채점 루브릭 (0~100). thresholds 는 paperReviewData.js 에 정의된다.
 */
function scoreReview(paper, society, evidence) {
  const repro = evidence.reproductionCount || 0;
  const grade = evidence.sentenceGrade || 'single_rune';
  const instability = evidence.averageInstability || 0;
  const heat = evidence.averageHeat || 0;
  const materials = Array.isArray(evidence.materialsTested) ? evidence.materialsTested.length : 0;

  const reasons = [];
  let score = 0;

  switch (society.id) {
    case 'basic_magic_society': {
      score += scoreReproBand(repro, [3, 5, 10], [25, 30, 35]);
      score += ['single_rune', 'compound_word', 'phrase'].includes(grade) ? 25 : 0;
      score += instability <= 50 ? 25 : Math.max(0, 25 - (instability - 50));
      score += paper.type === 'new_discovery' || paper.type === 'refinement' ? 15 : 0;
      if (repro < 3) reasons.push('재현 횟수 3회 미만');
      if (instability > 50) reasons.push(`불안정성 50% 초과 (현재 ${instability}%)`);
      break;
    }
    case 'thermodynamic_magic_society': {
      score += scoreReproBand(repro, [3, 5, 10], [15, 25, 35]);
      score += materials >= 2 ? 25 : materials === 1 ? 10 : 0;
      score += heat > 0 || instability > 0 ? 20 : 0;
      score += grade === 'phrase' || grade === 'sentence' || grade === 'incantation' ? 15 : 0;
      if (repro < 5) reasons.push('재현 표본 5회 권장');
      if (materials < 2) reasons.push('바탕재 2종 이상 권장');
      break;
    }
    case 'high_magic_society': {
      score += scoreReproBand(repro, [5, 10, 15], [15, 30, 40]);
      score += grade === 'sentence' || grade === 'incantation' ? 30 : 0;
      score += paper.type === 'challenge' ? 15 : paper.type === 'sentence_formula' ? 10 : 0;
      if (repro < 10) reasons.push('재현 10회 권장');
      if (grade !== 'sentence' && grade !== 'incantation' && paper.type !== 'challenge') {
        reasons.push('문장급 이상 또는 도전 논문 권장');
      }
      break;
    }
    case 'forbidden_magic_society': {
      score += scoreReproBand(repro, [3, 5, 8], [10, 20, 30]);
      score += grade === 'incantation' ? 35 : grade === 'sentence' ? 15 : 0;
      score += instability >= 70 ? 30 : instability >= 50 ? 15 : 0;
      score += paper.type === 'forbidden' || paper.type === 'challenge' ? 10 : 0;
      if (grade !== 'incantation') reasons.push('주문급(incantation) 등급 필요');
      if (instability < 70) reasons.push('불안정성 70 이상 권장');
      break;
    }
    default:
      reasons.push('학회 채점 루브릭이 없습니다.');
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    reasons,
  };
}

function scoreReproBand(repro, thresholds, points) {
  let earned = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (repro >= thresholds[i]) earned = points[i];
  }
  return earned;
}

function applyRewards(rewards, multiplier = 1) {
  const granted = {
    degreeScore: Math.round((rewards.degreeScore || 0) * multiplier),
    reputation: Math.round((rewards.reputation || 0) * multiplier),
    researchFunds: Math.round((rewards.researchFunds || 0) * multiplier),
  };
  gameState.resources.degreeScore += granted.degreeScore;
  gameState.resources.reputation += granted.reputation;
  gameState.resources.researchFunds += granted.researchFunds;
  return granted;
}

function buildEvidence(discovery) {
  const records = discovery.reproducibility?.records || [];
  const totalHeat = records.reduce((sum, item) => sum + (item.heat || 0), 0);
  const totalInstability = records.reduce((sum, item) => sum + (item.instability || 0), 0);
  const materials = [...new Set(records.map((item) => item.material).filter(Boolean))];

  return {
    reproductionCount: discovery.reproducibility?.count || 0,
    averageHeat: records.length ? Math.round(totalHeat / records.length) : 0,
    averageInstability: records.length ? Math.round(totalInstability / records.length) : 0,
    materialsTested: materials,
    sentenceGrade: deriveSentenceGrade(discovery),
  };
}

function deriveSentenceGrade(discovery) {
  const first = discovery.reproducibility?.records?.[0];
  const grade = first?.sentenceGrade || 'single_rune';
  if (grade === 'word') return 'single_rune';
  if (grade === 'phrase') return 'phrase';
  if (grade === 'sentence') return 'sentence';
  if (grade === 'incantation') return 'incantation';
  return grade;
}

function getEligiblePaperTypes(discovery) {
  const types = [];
  const mismatch = getMismatchForSignature(discovery.signature);
  const classification = classifyDiscoveryAgainstCanon(discovery.signature);
  const repro = discovery.reproducibility?.count || 0;
  const grade = deriveSentenceGrade(discovery);

  const hasAcceptedNew = gameState.papers.accepted.some(
    p => p.discoverySignature === discovery.signature && p.type === 'new_discovery'
  );

  // PR-F: 이미 등재된 정설(known_correct) 위에는 new_discovery 옵션을 노출하지
  // 않는다. 플레이어가 2일 비용을 들여 작성한 뒤 reviewPaper 에서 하드 거절
  // 당하는 일을 막기 위함. challenge/refinement 는 mismatch 가 잡혀야 등장하므로
  // known_correct (mismatch 없음) 에서는 자연히 비활성화된다.
  const isKnownCorrect = classification.classification === 'known_correct';
  if (repro >= 3 && !hasAcceptedNew && !isKnownCorrect) types.push('new_discovery');
  // refinement 도 new_discovery 와 동일하게 재현 3회 이상을 요구한다. mismatch 가
  // 잡혔다는 사실 하나로 곧장 refinement 를 노출하면, 단 1회 관측 표본으로
  // basic 학회 (acceptThreshold 60) 를 통과할 수 있는 경로가 생긴다 — 등급=phrase
  // (25) + 안정성≤50 (25) + type bonus (15) = 65. 정설 보완 논문을 단발 관측으로
  // 받아주면 게임 의도(재현→문법→논문) 가 무너지므로 동일한 floor 를 둔다.
  if (mismatch && repro >= 3) types.push('refinement');
  if (mismatch && repro >= 10) types.push('challenge');
  if (grade === 'sentence' || grade === 'incantation') types.push('sentence_formula');
  if (gameState.progression.currentPhase >= 3 && grade === 'incantation') types.push('forbidden');

  return [...new Set(types)];
}

function suggestTitle(discovery, type) {
  const baseName = discovery.playerName || '미확인 현상';
  if (type === 'challenge') return `${baseName}에 대한 정설 반박`;
  if (type === 'refinement') return `${baseName} 관측 보완 보고`;
  if (type === 'sentence_formula') return `${baseName} 문장 술식 해석`;
  if (type === 'forbidden') return `${baseName} 금서급 주문 보고`;
  return `${baseName} 신규 현상 보고`;
}

function suggestClaim(discovery, type) {
  if (type === 'challenge') return '기존 학술 정설과 관측값이 일치하지 않음을 보고한다.';
  if (type === 'refinement') return '기존 정설을 보완하는 새로운 조건 차이를 제시한다.';
  if (type === 'sentence_formula') return '다중 룬 문장 구조가 현상 해석에 핵심적임을 주장한다.';
  if (type === 'forbidden') return '고위험 술식의 재현성과 위험성을 함께 보고한다.';
  return '새로운 현상의 재현성과 관측값을 보고한다.';
}
