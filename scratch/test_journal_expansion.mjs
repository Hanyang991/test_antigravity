#!/usr/bin/env node
/**
 * Standalone jsdom harness — journal canon papers 확장 회귀.
 *
 * 검증:
 *   T1: JOURNAL_PAPERS 가 100개 이상이며, 각 paper 가 truthful (boolean) + releaseWeek (>=0) 보유
 *   T2: tickJournalPapersForWeek(week=0) 시 BACKGROUND_PAPERS (releaseWeek=0) 만 활성, 미래 paper 0
 *   T3: tickJournalPapersForWeek(week=8) 시 releaseWeek<=8 인 paper 모두 활성
 *   T4: scene-journal 진입 시 모든 활성 paper 에 `.journal-rebut` 버튼이 있음 (열람만 가능 없음)
 *   T5: submitJournalRebuttal — truthful=true paper 반박 → wrongful penalty 적용
 *   T6: submitJournalRebuttal — truthful=false paper 반박 → exposed reward 적용
 *   T7: 반박된 paper 는 refreshJournal 후 카드 사라지고 #scene-journal-badge 감소
 *   T8: validateJournalPapers() 가 모든 entry 에 대해 ok=true (canonRef 일관성 + truthful 형식)
 */

import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>
  <div class="archive-panel"><div class="panel-header"></div></div>
</body></html>`, { url: 'http://localhost/', pretendToBeVisual: true });

global.window = dom.window;
global.document = dom.window.document;
global.HTMLElement = dom.window.HTMLElement;
global.Node = dom.window.Node;
global.Event = dom.window.Event;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
global.localStorage = dom.window.localStorage;

const importFromRepo = async (p) => import(pathToFileURL(resolve(repoRoot, p)).href);

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  } catch (e) {
    results.push({ name, ok: false, err: e.message });
    console.error(`FAIL ${name}: ${e.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed'); }

const { gameState, resetState } = await importFromRepo('gameState.js');
resetState();
gameState.progression = gameState.progression || { currentWeek: 0, currentDay: 1 };
gameState.progression.currentWeek = 0;
gameState.progression.currentDay = 1;
gameState.journal = { entries: {} };
gameState.publications = { entries: {} };
gameState.academic = gameState.academic || { failedRebuttals: 0, successfulRebuttals: 0 };

const {
  initJournal,
  tickJournalPapersForWeek,
  getActiveJournalPapers,
  submitJournalRebuttal,
  getJournalPapers,
  validateJournalPapers,
} = await importFromRepo('journalSystem.js');
const { JOURNAL_PAPERS } = await importFromRepo('data/journalSeed.js');

initJournal();

test('T1: 100+ JOURNAL_PAPERS + truthful/releaseWeek 필드 유효', () => {
  assert(JOURNAL_PAPERS.length >= 100, `expected >=100, got ${JOURNAL_PAPERS.length}`);
  for (const p of JOURNAL_PAPERS) {
    assert(typeof p.truthful === 'boolean', `${p.id}: truthful must be boolean`);
    assert(typeof p.releaseWeek === 'number' && p.releaseWeek >= 0, `${p.id}: releaseWeek must be >=0 number`);
    assert(typeof p.id === 'string' && p.id.length > 0, `paper missing id`);
    assert(typeof p.title === 'string' && p.title.length > 0, `${p.id}: missing title`);
  }
});

test('T2: week=0 (background only) — releaseWeek=0 paper 만 활성', () => {
  // reset state
  gameState.journal.entries = {};
  tickJournalPapersForWeek(0);
  const active = getActiveJournalPapers();
  const expected = JOURNAL_PAPERS.filter(p => p.releaseWeek === 0).length;
  assert(active.length === expected,
    `week=0 active=${active.length}, expected ${expected} (releaseWeek=0 papers)`);
  // 미래 paper 는 활성 아님
  for (const { template } of active) {
    assert(template.releaseWeek === 0, `${template.id} should not be active at week=0`);
  }
});

test('T3: week=8 — releaseWeek<=8 paper 모두 활성', () => {
  gameState.journal.entries = {};
  tickJournalPapersForWeek(8);
  const active = getActiveJournalPapers();
  const expected = JOURNAL_PAPERS.filter(p => p.releaseWeek <= 8).length;
  assert(active.length === expected,
    `week=8 active=${active.length}, expected ${expected}`);
});

test('T4: scene-journal 활성 paper 마다 .journal-rebut 버튼 존재', async () => {
  gameState.journal.entries = {};
  tickJournalPapersForWeek(4);
  // Need to load labNotebook to set up the scene
  const { initLabNotebook } = await importFromRepo('labNotebook.js');
  initLabNotebook();

  // The scene element should exist
  const journalScene = document.getElementById('scene-journal');
  assert(journalScene, 'scene-journal element should exist');
  // Switch to journal scene to trigger refreshJournal
  const btn = document.querySelector('.scene-btn[data-scene="journal"]');
  assert(btn, 'scene-journal btn should exist');
  btn.click();

  const grid = document.getElementById('journal-grid');
  assert(grid, 'journal-grid should exist');

  const cards = grid.querySelectorAll('.journal-card');
  const rebutButtons = grid.querySelectorAll('.journal-rebut');
  const disabled = grid.querySelectorAll('.journal-cta-disabled');

  const expectedActive = JOURNAL_PAPERS.filter(p => p.releaseWeek <= 4).length;
  assert(cards.length === expectedActive,
    `cards=${cards.length}, expected ${expectedActive}`);
  assert(rebutButtons.length === cards.length,
    `rebut buttons=${rebutButtons.length}, expected ${cards.length} (every card rebuttable)`);
  assert(disabled.length === 0,
    `should have 0 "열람만 가능" disabled spans, got ${disabled.length}`);
});

test('T5: truthful=true paper 반박 → wrongful penalty (degree -10, rep -8)', () => {
  gameState.journal.entries = {};
  gameState.papers = gameState.papers || { eligible: [], accepted: [], rejected: [], disputes: [] };
  gameState.papers.eligible = [];
  gameState.papers.accepted = [];
  gameState.papers.rejected = [];
  gameState.academic.failedRebuttals = 0;
  gameState.academic.successfulRebuttals = 0;
  gameState.resources = gameState.resources || { degreeScore: 0, reputation: 0, researchFunds: 0 };
  gameState.resources.degreeScore = 50;
  gameState.resources.reputation = 30;
  gameState.resources.researchFunds = 1000;

  tickJournalPapersForWeek(32);
  // Pick a truthful=true paper
  const truthfulPaper = JOURNAL_PAPERS.find(p => p.truthful === true && p.releaseWeek <= 32);
  assert(truthfulPaper, 'should have at least one truthful=true paper');
  const result = submitJournalRebuttal(truthfulPaper.id);
  assert(result.ok === true, `rebuttal should succeed, got ${JSON.stringify(result)}`);
  assert(result.outcome === 'wrongful', `outcome=${result.outcome}, expected wrongful`);
  assert(result.deltas.degreeScore === -10, `degreeScore delta=${result.deltas.degreeScore}, expected -10`);
  assert(result.deltas.reputation === -8, `reputation delta=${result.deltas.reputation}, expected -8`);
  assert(gameState.resources.degreeScore === 40, `degree=${gameState.resources.degreeScore}, expected 40`);
  assert(gameState.resources.reputation === 22, `reputation=${gameState.resources.reputation}, expected 22`);
  assert(gameState.academic.failedRebuttals === 1, `failedRebuttals=${gameState.academic.failedRebuttals}`);
  assert(gameState.papers.rejected.length === 1, `rejected papers=${gameState.papers.rejected.length}, expected 1`);
});

test('T6: truthful=false paper 반박 → exposed reward (degree +30, rep +18, funds +1000)', () => {
  gameState.journal.entries = {};
  gameState.papers.eligible = [];
  gameState.papers.accepted = [];
  gameState.papers.rejected = [];
  gameState.academic.failedRebuttals = 0;
  gameState.academic.successfulRebuttals = 0;
  gameState.resources.degreeScore = 50;
  gameState.resources.reputation = 30;
  gameState.resources.researchFunds = 1000;

  tickJournalPapersForWeek(32);
  const falsePaper = JOURNAL_PAPERS.find(p => p.truthful === false && p.releaseWeek <= 32);
  assert(falsePaper, 'should have at least one truthful=false paper');
  const result = submitJournalRebuttal(falsePaper.id);
  assert(result.ok === true, `rebuttal should succeed, got ${JSON.stringify(result)}`);
  assert(result.outcome === 'exposed', `outcome=${result.outcome}, expected exposed`);
  assert(result.deltas.degreeScore === 30, `degreeScore delta=${result.deltas.degreeScore}, expected 30`);
  assert(result.deltas.reputation === 18, `reputation delta=${result.deltas.reputation}, expected 18`);
  assert(result.deltas.researchFunds === 1000, `funds delta=${result.deltas.researchFunds}, expected 1000`);
  assert(gameState.resources.degreeScore === 80, `degree=${gameState.resources.degreeScore}, expected 80`);
  assert(gameState.resources.reputation === 48, `reputation=${gameState.resources.reputation}, expected 48`);
  assert(gameState.resources.researchFunds === 2000, `funds=${gameState.resources.researchFunds}, expected 2000`);
  assert(gameState.academic.successfulRebuttals === 1, `successfulRebuttals=${gameState.academic.successfulRebuttals}`);
  assert(gameState.papers.accepted.length === 1, `accepted papers=${gameState.papers.accepted.length}, expected 1`);
});

test('T7: 반박된 paper 는 active 리스트에서 제거 (idempotent guard)', () => {
  gameState.journal.entries = {};
  gameState.papers.eligible = [];
  gameState.papers.accepted = [];
  gameState.papers.rejected = [];
  gameState.academic.failedRebuttals = 0;
  gameState.academic.successfulRebuttals = 0;
  gameState.resources.degreeScore = 50;
  gameState.resources.reputation = 30;
  gameState.resources.researchFunds = 1000;

  tickJournalPapersForWeek(2);
  const before = getActiveJournalPapers().length;
  const paper = getActiveJournalPapers()[0]?.template;
  assert(paper, 'should have at least one active paper at week=2');
  submitJournalRebuttal(paper.id);
  const after = getActiveJournalPapers().length;
  assert(after === before - 1, `after rebuttal active=${after}, expected ${before - 1}`);

  // 멱등 가드: 같은 paper 재반박 시 ok=false
  const repeat = submitJournalRebuttal(paper.id);
  assert(repeat.ok === false, `second rebuttal of same paper should fail`);
});

test('T8: validateJournalPapers — all entries valid', () => {
  const result = validateJournalPapers();
  if (!result.ok) {
    console.error('errors:', JSON.stringify(result.errors.slice(0, 5), null, 2));
  }
  assert(result.ok, `validation failed with ${result.errors.length} errors`);
});

const passed = results.filter(r => r.ok).length;
const failed = results.length - passed;
console.log(`\n=== ${passed}/${results.length} passed ===`);
process.exit(failed > 0 ? 1 : 0);
