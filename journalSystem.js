/**
 * Journal system — 학계 저널 (NPC 발표 정설/연구 논문 열람).
 * 시드 데이터를 기반으로, 정설(canon)과 연결된 논문은 '반박 초안 작성' CTA 와
 * 연동되어 도전 논문 흐름을 시작할 수 있게 한다.
 */

import { JOURNAL_PAPERS } from './data/journalSeed.js';
import { getCanonEntries } from './academicCanon.js';

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
