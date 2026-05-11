/**
 * Journal system — 학계 정설/연구 논문 (canon journal papers).
 *
 * 모든 정설 논문은 반박 가능하다 — societyPublications 와 동일한 즉시-결과 모델:
 *   - 매 주(week:ticked) tick 시 releaseWeek 가 도래한 논문이 활성 큐에 진입한다.
 *   - 플레이어는 활성 논문에 대해 5일을 들여 직접 반박할 수 있다.
 *   - 결과는 paper.truthful 만 보고 즉시 결정된다 — 점수 채점 없음.
 *     truthful=true  : 정설이 옳음. 잘못 반박 → 학위/평판 페널티 (오반박)
 *     truthful=false : 정설이 잘못됨. 정확히 반박 → 보상 (정확 반박)
 *
 * 보관 위치:
 *   - 모든 paper 의 진행 상태는 gameState.journal.entries[id] 에 누적된다.
 *     { released: bool, releasedAt: {week,day}, rebutted: bool, rebuttedBy: paperId,
 *       outcome: 'wrongful'|'exposed' }
 *   - 'failedRebuttals' / 'successfulRebuttals' 카운터는 gameState.academic 에 누적
 *     (societyPublications 와 카운터 공유).
 *
 * 페널티/보상은 societyPublicationsData 의 REBUTTAL_OUTCOMES 와 공유 — 정설/학회지 구분 없이 일관.
 */

import { gameState } from './gameState.js';
import { on, emit } from './eventBus.js';
import { saveGame } from './saveLoad.js';
import { consumeForAction } from './actionCosts.js';
import { JOURNAL_PAPERS } from './data/journalSeed.js';
import { CANON_DATA } from './data/canonData.js';
import { REBUTTAL_OUTCOMES } from './data/societyPublicationsData.js';
import { getCanonEntries } from './academicCanon.js';

let initialized = false;

function ensureJournalSlot() {
  if (!gameState.journal || typeof gameState.journal !== 'object') {
    gameState.journal = { entries: {} };
  }
  if (!gameState.journal.entries || typeof gameState.journal.entries !== 'object') {
    gameState.journal.entries = {};
  }
  return gameState.journal;
}

function ensureAcademicCounters() {
  if (typeof gameState.academic.failedRebuttals !== 'number') {
    gameState.academic.failedRebuttals = 0;
  }
  if (typeof gameState.academic.successfulRebuttals !== 'number') {
    gameState.academic.successfulRebuttals = 0;
  }
}

export function initJournal() {
  if (initialized) return;
  initialized = true;

  ensureJournalSlot();
  ensureAcademicCounters();

  // 게임이 처음 시작될 때(week=1) 와 매 주 진입 시 같이 처리.
  tickJournalPapersForWeek(gameState.progression?.currentWeek ?? 1);
  on('week:ticked', (payload) => {
    tickJournalPapersForWeek(payload?.week ?? gameState.progression?.currentWeek ?? 1);
  });
}

/**
 * 현재 주차까지의 paper 를 모두 release 한다 (멱등).
 * 한 번에 여러 주가 흐르더라도 누락 없이 따라잡힌다.
 */
export function tickJournalPapersForWeek(currentWeek) {
  const slot = ensureJournalSlot();
  const released = [];
  for (const tpl of JOURNAL_PAPERS) {
    if (tpl.releaseWeek > currentWeek) continue;
    const entry = slot.entries[tpl.id];
    if (entry?.released) continue;
    const newEntry = {
      ...(entry || {}),
      released: true,
      releasedAt: {
        week: gameState.progression?.currentWeek ?? currentWeek,
        day: gameState.progression?.currentDay ?? 1,
      },
      rebutted: entry?.rebutted || false,
    };
    slot.entries[tpl.id] = newEntry;
    released.push({ template: tpl, entry: newEntry });
    emit('journal:released', { paper: tpl, entry: newEntry });
  }
  if (released.length > 0) saveGame();
  return released;
}

export function getJournalPapers() {
  return JOURNAL_PAPERS;
}

export function getJournalPaperById(id) {
  return JOURNAL_PAPERS.find((p) => p.id === id) || null;
}

export function getCanonForPaper(paper) {
  if (!paper?.canonRef) return null;
  return getCanonEntries().find((c) => c.id === paper.canonRef) || null;
}

/**
 * 게재되었고 아직 반박되지 않은 정설 논문만 반환 — UI 노출용.
 * 게재 순서(releaseWeek 오름차순 + 시드 순서) 그대로 정렬.
 */
export function getActiveJournalPapers() {
  ensureJournalSlot();
  const result = [];
  for (const tpl of JOURNAL_PAPERS) {
    const entry = gameState.journal.entries[tpl.id];
    if (!entry?.released) continue;
    if (entry.rebutted) continue;
    result.push({ template: tpl, entry });
  }
  return result;
}

/**
 * 정설 논문 반박 처리. 결과 paper 를 papers.{accepted|rejected} 에 푸시한다.
 *
 * @param {string} paperId
 * @returns {{ ok: true, paper, review, outcome, deltas, timeConsumed } | { ok: false, reason }}
 */
export function submitJournalRebuttal(paperId) {
  ensureJournalSlot();
  ensureAcademicCounters();

  const tpl = getJournalPaperById(paperId);
  if (!tpl) return { ok: false, reason: '정설 논문을 찾을 수 없습니다.' };

  const entry = gameState.journal.entries[paperId];
  if (!entry?.released) {
    return { ok: false, reason: '아직 출간되지 않은 논문입니다.' };
  }
  if (entry.rebutted) {
    return { ok: false, reason: '이미 반박된 논문입니다.' };
  }

  const outcome = tpl.truthful ? 'wrongful' : 'exposed';
  const deltas = REBUTTAL_OUTCOMES[outcome];

  const authorDisplay = Array.isArray(tpl.authors) ? tpl.authors.join(', ') : (tpl.authors || tpl.society || '');

  const paper = {
    id: `paper_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    type: 'rebuttal',
    title: `반박: ${tpl.title}`,
    authorName: '플레이어',
    targetSociety: tpl.society,
    targetJournalPaperId: paperId,
    targetJournalPaperTitle: tpl.title,
    targetJournalPaperAuthor: authorDisplay,
    discoverySignature: null,
    evidence: {},
    status: tpl.truthful ? 'rejected' : 'accepted',
    createdAt: Date.now(),
    submittedAt: Date.now(),
  };

  const review = {
    accepted: !tpl.truthful,
    disputed: false,
    score: null,
    reasons: [
      tpl.truthful
        ? `${authorDisplay}의 "${tpl.title}" 는 사실에 부합하는 정설 논문입니다. 본 학회는 잘못된 반박을 기록합니다.`
        : `${authorDisplay}의 "${tpl.title}" 는 사실과 다른 정설이었습니다. 학계는 귀하의 반박을 채택합니다.`,
    ],
    society: { id: null, name: tpl.society || '' },
    reviewerVoice: tpl.truthful
      ? `${tpl.society || '학계'} 심사위원: 해당 정설은 충분히 검증된 내용입니다. 반박 근거가 부족하여 귀하의 평판에 흠이 남을 것입니다.`
      : `${tpl.society || '학계'} 심사위원: 귀하의 지적이 옳습니다. 정설 재검토를 권고합니다.`,
    canonOverride: null,
    classification: null,
    canonPenaltyApplied: false,
    rebuttal: {
      journalPaperId: paperId,
      paperTitle: tpl.title,
      paperAuthor: authorDisplay,
      outcome,
      truthful: !!tpl.truthful,
      deltas,
    },
    grantedRewards: { ...deltas },
  };
  paper.review = review;

  // 자원 적용 — societyPublications 와 동일.
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

  entry.rebutted = true;
  entry.rebuttedBy = paper.id;
  entry.rebuttedAt = {
    week: gameState.progression?.currentWeek ?? 0,
    day: gameState.progression?.currentDay ?? 0,
  };
  entry.outcome = outcome;
  gameState.journal.entries[paperId] = entry;

  emit('journal:rebutted', { paper: tpl, playerPaper: paper, review, outcome, deltas });
  if (tpl.truthful) {
    emit('paper:rejected', { paper, review });
  } else {
    emit('paper:accepted', { paper, review });
  }

  saveGame();

  const timeConsumed = consumeForAction('submitRebuttal');

  return { ok: true, paper, review, outcome, deltas, timeConsumed };
}

/**
 * dev assertion: canon-linked 정설 논문의 truthful 값이 canon.isCorrect 와
 * 일관되는지 검사. (단, journal paper 에는 stance 필드가 없으므로 단순
 * isCorrect/truthful 매핑이 아니라 둘이 합쳐 의미 있는 분포인지 확인할 수 있도록
 * 호출자가 결정한다 — 여기서는 단순히 canonRef 가 존재하는지만 확인한다.)
 */
export function validateJournalPapers({ papers = JOURNAL_PAPERS, canons = CANON_DATA } = {}) {
  const canonById = new Map(canons.map((c) => [c.id, c]));
  const errors = [];
  for (const p of papers) {
    if (typeof p.truthful !== 'boolean') {
      errors.push({ paperId: p.id, reason: 'truthful 필드가 boolean 이 아님' });
    }
    if (typeof p.releaseWeek !== 'number' || p.releaseWeek < 0) {
      errors.push({ paperId: p.id, reason: 'releaseWeek 필드가 비음수 number 가 아님' });
    }
    if (p.canonRef && !canonById.has(p.canonRef)) {
      errors.push({ paperId: p.id, reason: `canonRef '${p.canonRef}' 가 canon 레지스트리에 없음` });
    }
  }
  return { ok: errors.length === 0, errors };
}
