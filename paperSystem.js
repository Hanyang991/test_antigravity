import { gameState } from './gameState.js';
import { getDiscovery } from './discoverySystem.js';
import { getMismatchForSignature } from './academicCanon.js';
import { PAPER_SOCIETIES } from './data/paperReviewData.js';
import { emit } from './eventBus.js';
import { saveGame } from './saveLoad.js';

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
  return draft;
}

export function submitPaper(paperId) {
  const index = gameState.papers.drafts.findIndex((paper) => paper.id === paperId);
  if (index < 0) return null;

  const paper = gameState.papers.drafts.splice(index, 1)[0];
  paper.status = 'submitted';
  paper.submittedAt = Date.now();
  gameState.papers.submitted.unshift(paper);
  emit('paper:submitted', paper);

  const review = reviewPaper(paper);
  finalizePaperReview(paper, review);
  saveGame();
  return review;
}

export function reviewPaper(paper) {
  const society = PAPER_SOCIETIES[paper.targetSociety];
  const evidence = paper.evidence;
  const reasons = [];
  let accepted = false;

  if (!society) {
    return { accepted: false, reasons: ['알 수 없는 학회입니다.'] };
  }

  switch (paper.targetSociety) {
    case 'basic_magic_society':
      accepted = true;
      if (evidence.reproductionCount < 3) {
        accepted = false;
        reasons.push('재현 횟수 3회 미만');
      }
      if (evidence.averageInstability > 50) {
        accepted = false;
        reasons.push(`불안정성 50% 초과 (현재 ${evidence.averageInstability}%)`);
      }
      if (!['single_rune', 'compound_word', 'phrase'].includes(evidence.sentenceGrade)) {
        accepted = false;
        reasons.push('기초 학회는 단일 룬이나 단순 단어만 심사합니다.');
      }
      if (paper.type === 'challenge') {
        accepted = false;
        reasons.push('도전 논문은 접수하지 않습니다.');
      }
      break;
    case 'thermodynamic_magic_society':
      accepted =
        evidence.reproductionCount >= 5 &&
        (evidence.averageHeat > 0 || evidence.averageInstability > 0) &&
        evidence.materialsTested.length >= 2;
      if (!accepted) reasons.push('열역학 학회는 2개 이상 바탕재 재현과 5회 이상 재현을 요구합니다.');
      break;
    case 'high_magic_society':
      accepted =
        evidence.reproductionCount >= 10 &&
        (evidence.sentenceGrade === 'sentence' || evidence.sentenceGrade === 'incantation' || paper.type === 'challenge');
      if (!accepted) reasons.push('고위 학회는 문장급 이상 또는 도전 논문과 10회 재현을 요구합니다.');
      break;
    case 'forbidden_magic_society':
      accepted =
        gameState.progression.currentPhase >= 3 &&
        evidence.sentenceGrade === 'incantation' &&
        evidence.averageInstability >= 70;
      if (!accepted) reasons.push('금서 학회는 Phase 3 이상과 주문급 불안정성을 요구합니다.');
      break;
    default:
      reasons.push('학회 심사 규칙이 없습니다.');
  }

  return {
    accepted,
    reasons,
    society,
  };
}

function finalizePaperReview(paper, review) {
  gameState.papers.submitted = gameState.papers.submitted.filter((item) => item.id !== paper.id);

  if (review.accepted) {
    paper.status = 'accepted';
    paper.review = review;
    gameState.papers.accepted.unshift(paper);
    applyRewards(review.society.rewards);
    emit('paper:accepted', { paper, review });
    return;
  }

  paper.status = 'rejected';
  paper.review = review;
  gameState.papers.rejected.unshift(paper);
  emit('paper:rejected', { paper, review });
}

function applyRewards(rewards) {
  gameState.resources.degreeScore += rewards.degreeScore || 0;
  gameState.resources.reputation += rewards.reputation || 0;
  gameState.resources.researchFunds += rewards.researchFunds || 0;
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
  const repro = discovery.reproducibility?.count || 0;
  const grade = deriveSentenceGrade(discovery);

  const hasAcceptedNew = gameState.papers.accepted.some(
    p => p.discoverySignature === discovery.signature && p.type === 'new_discovery'
  );

  if (repro >= 3 && !hasAcceptedNew) types.push('new_discovery');
  if (mismatch) types.push('refinement');
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
