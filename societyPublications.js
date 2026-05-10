/**
 * 학회지 NPC 논문 모듈 (PR-J).
 *
 * - 매 주(week:ticked) tick 시 releaseWeek 가 도래한 publication 을 게재 큐에 올린다.
 * - 학내 메일함은 'publication:released' 이벤트로 학회지 출간 알림을 받는다.
 * - 플레이어는 활성 publication 에 대해 submitRebuttal(publicationId) 로
 *   반박 논문(paper.type='rebuttal') 을 즉시 게시한다 — 별도 5일 심사 지연 없이
 *   ACTION_COSTS.submitRebuttal (기본 5일) 만큼 schedule.consumeTime 으로 시간이 흐르고
 *   결과는 publication.truthful 만 보고 즉시 결정된다.
 *
 * 보관 위치:
 *   - 모든 publication 의 진행 상태는 gameState.publications.entries[id] 에 누적된다.
 *     { released: bool, releasedAt: {week,day}, rebutted: bool, rebuttedBy: paperId,
 *       outcome: 'wrongful'|'exposed', read: bool }
 *   - 'failedRebuttals' / 'successfulRebuttals' 카운터는 gameState.academic 에 누적.
 */

import { gameState } from './gameState.js';
import { on, emit } from './eventBus.js';
import { saveGame } from './saveLoad.js';
import { consumeForAction } from './actionCosts.js';
import { SOCIETY_PUBLICATIONS, REBUTTAL_OUTCOMES } from './data/societyPublicationsData.js';
import { PAPER_SOCIETIES } from './data/paperReviewData.js';

let initialized = false;

function ensurePublicationsSlot() {
  if (!gameState.publications || typeof gameState.publications !== 'object') {
    gameState.publications = { entries: {} };
  }
  if (!gameState.publications.entries || typeof gameState.publications.entries !== 'object') {
    gameState.publications.entries = {};
  }
  return gameState.publications;
}

function ensureAcademicCounters() {
  if (typeof gameState.academic.failedRebuttals !== 'number') {
    gameState.academic.failedRebuttals = 0;
  }
  if (typeof gameState.academic.successfulRebuttals !== 'number') {
    gameState.academic.successfulRebuttals = 0;
  }
}

export function initSocietyPublications() {
  if (initialized) return;
  initialized = true;

  ensurePublicationsSlot();
  ensureAcademicCounters();

  // 게임이 처음 시작될 때(week=1) 와 매 주 진입 시 같이 처리.
  tickPublicationsForWeek(gameState.progression.currentWeek);
  on('week:ticked', (payload) => {
    tickPublicationsForWeek(payload?.week ?? gameState.progression.currentWeek);
  });
}

/**
 * 현재 주차까지의 publication 을 모두 release 한다 (멱등).
 * 한 번에 여러 주가 흐르더라도 누락 없이 따라잡힌다.
 */
export function tickPublicationsForWeek(currentWeek) {
  const slot = ensurePublicationsSlot();
  const released = [];
  for (const tpl of SOCIETY_PUBLICATIONS) {
    if (tpl.releaseWeek > currentWeek) continue;
    const entry = slot.entries[tpl.id];
    if (entry?.released) continue;
    const newEntry = {
      ...(entry || {}),
      released: true,
      releasedAt: {
        week: gameState.progression.currentWeek,
        day: gameState.progression.currentDay,
      },
      read: entry?.read || false,
      rebutted: entry?.rebutted || false,
    };
    slot.entries[tpl.id] = newEntry;
    released.push({ template: tpl, entry: newEntry });
    emit('publication:released', {
      publication: tpl,
      society: PAPER_SOCIETIES[tpl.society] || null,
      entry: newEntry,
    });
  }
  if (released.length > 0) saveGame();
  return released;
}

export function getPublicationTemplates() {
  return SOCIETY_PUBLICATIONS;
}

export function getPublicationTemplate(id) {
  return SOCIETY_PUBLICATIONS.find((p) => p.id === id) || null;
}

/**
 * 게재되었고 아직 반박되지 않은 publication 만 반환 — UI 노출용.
 * 게재 순서(releaseWeek 오름차순) 그대로 정렬.
 */
export function getActivePublications() {
  ensurePublicationsSlot();
  const result = [];
  for (const tpl of SOCIETY_PUBLICATIONS) {
    const entry = gameState.publications.entries[tpl.id];
    if (!entry?.released) continue;
    if (entry.rebutted) continue;
    result.push({ template: tpl, entry });
  }
  return result;
}

/**
 * 반박 처리. paperSystem 에서 'rebuttal' 타입 paper 를 만들어 호출하거나,
 * UI 가 직접 호출하면 내부에서 paperSystem.createPaperDraft + submitPaper 를
 * 거치지 않고 바로 결과 paper 를 papers.{accepted|rejected} 에 푸시한다.
 *
 * @param {string} publicationId
 * @returns {{ ok: true, paper, review, outcome, deltas, timeConsumed } | { ok: false, reason }}
 */
export function submitRebuttal(publicationId) {
  ensurePublicationsSlot();
  ensureAcademicCounters();

  const tpl = getPublicationTemplate(publicationId);
  if (!tpl) return { ok: false, reason: '학회지 논문을 찾을 수 없습니다.' };

  const entry = gameState.publications.entries[publicationId];
  if (!entry?.released) {
    return { ok: false, reason: '아직 출간되지 않은 논문입니다.' };
  }
  if (entry.rebutted) {
    return { ok: false, reason: '이미 반박된 논문입니다.' };
  }

  const society = PAPER_SOCIETIES[tpl.society] || null;
  const outcome = tpl.truthful ? 'wrongful' : 'exposed';
  const deltas = REBUTTAL_OUTCOMES[outcome];

  const paper = {
    id: `paper_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    type: 'rebuttal',
    title: `반박: ${tpl.title}`,
    authorName: '플레이어',
    targetSociety: tpl.society,
    targetPublicationId: publicationId,
    targetPublicationTitle: tpl.title,
    targetPublicationAuthor: tpl.author,
    discoverySignature: null,
    evidence: {},
    status: tpl.truthful ? 'rejected' : 'accepted',
    createdAt: Date.now(),
    submittedAt: Date.now(),
  };

  const review = {
    accepted: !tpl.truthful,
    disputed: false,
    score: null, // 반박은 점수 채점이 아니라 truthful 만 본다.
    reasons: [
      tpl.truthful
        ? `${tpl.author}의 "${tpl.title}" 는 사실에 부합하는 논문입니다. 본 학회는 잘못된 반박을 기록합니다.`
        : `${tpl.author}의 "${tpl.title}" 는 사실과 다른 논문이었습니다. 학회는 귀하의 반박을 채택합니다.`,
    ],
    society,
    reviewerVoice:
      society?.reviewerVoice?.[tpl.truthful ? 'rejected' : 'accepted'] || '',
    canonOverride: null,
    classification: null,
    canonPenaltyApplied: false,
    rebuttal: {
      publicationId,
      publicationTitle: tpl.title,
      publicationAuthor: tpl.author,
      outcome, // 'wrongful' | 'exposed'
      truthful: tpl.truthful,
      deltas,
    },
    grantedRewards: { ...deltas },
  };
  paper.review = review;

  // 자원 적용 — 보너스든 페널티든 동일 헬퍼.
  gameState.resources.degreeScore = Math.max(0, gameState.resources.degreeScore + deltas.degreeScore);
  gameState.resources.reputation = Math.max(0, gameState.resources.reputation + deltas.reputation);
  gameState.resources.researchFunds = Math.max(0, gameState.resources.researchFunds + deltas.researchFunds);

  if (tpl.truthful) {
    gameState.papers.rejected.unshift(paper);
    gameState.academic.failedRebuttals += 1;
  } else {
    gameState.papers.accepted.unshift(paper);
    gameState.academic.successfulRebuttals += 1;
  }

  // publication 상태 갱신 — 멱등 보호.
  entry.rebutted = true;
  entry.rebuttedBy = paper.id;
  entry.rebuttedAt = {
    week: gameState.progression.currentWeek,
    day: gameState.progression.currentDay,
  };
  entry.outcome = outcome;
  gameState.publications.entries[publicationId] = entry;

  emit('publication:rebutted', {
    publication: tpl,
    society,
    paper,
    review,
    outcome,
    deltas,
  });
  if (tpl.truthful) {
    emit('paper:rejected', { paper, review });
  } else {
    emit('paper:accepted', { paper, review });
  }

  saveGame();

  // 시간 비용은 emit/save 후에 적용 — registerCanon 과 동일한 순서.
  const timeConsumed = consumeForAction('submitRebuttal');

  return { ok: true, paper, review, outcome, deltas, timeConsumed };
}

export function markPublicationRead(publicationId) {
  ensurePublicationsSlot();
  const entry = gameState.publications.entries[publicationId];
  if (!entry || entry.read) return;
  entry.read = true;
  saveGame();
}
