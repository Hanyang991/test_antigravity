/**
 * PR-A: 학회지 NPC 논문을 학계(journal) 씬으로 이동 — 회귀 테스트.
 *
 * main 에서 실행하면 (1)/(2)/(3) 에서 FAIL — publications 가 paper-panel 에 그려지고
 * scene-journal 에 학회지 섹션이 없다.
 * PR-A 이후 실행하면 모두 PASS.
 *
 * 실행:
 *   node scratch/test_society_tab.mjs /home/ubuntu/repos/test_antigravity
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { JSDOM } from 'jsdom';

const repoPath = process.argv[2] || process.cwd();
const html = readFileSync(resolve(repoPath, 'index.html'), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost/',
  runScripts: 'outside-only',
  pretendToBeVisual: true,
});
const { window } = dom;

const wireGlobal = (k, v) => {
  try {
    Object.defineProperty(globalThis, k, { configurable: true, writable: true, value: v });
  } catch {
    /* read-only — skip */
  }
};
for (const k of ['window', 'document', 'localStorage', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent']) {
  wireGlobal(k, window[k]);
}
wireGlobal('requestAnimationFrame', (cb) => setTimeout(cb, 16));
wireGlobal('cancelAnimationFrame', (id) => clearTimeout(id));

// localStorage shim (jsdom has one but ESM modules may load before window settles).
const storage = new Map();
wireGlobal('localStorage', {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
});

const importFromRepo = (rel) => import(pathToFileURL(resolve(repoPath, rel)).href);

const { gameState, resetState } = await importFromRepo('gameState.js');
resetState();
storage.clear();

// 학회 publications 슬롯 초기화 — clean slate.
gameState.publications = { entries: {} };

const { initSocietyPublications, tickPublicationsForWeek, getActivePublications } = await importFromRepo('societyPublications.js');
const { initLabNotebook } = await importFromRepo('labNotebook.js');
const { initInbox } = await importFromRepo('inboxSystem.js');

initInbox();
initSocietyPublications();
initLabNotebook();

// week 16 까지 tick → 모든 publication 활성화.
gameState.progression.currentWeek = 16;
tickPublicationsForWeek(16);

const active = getActivePublications();
if (active.length === 0) {
  console.error('FAIL: setup — no active publications after tickPublicationsForWeek(16)');
  process.exit(1);
}

const results = [];
function check(label, ok, detail = '') {
  results.push({ label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ` — ${detail}` : ''}`);
}

// (1) scene-journal 안 학회지 컨테이너 (#scene-journal-society-list) 가 존재해야 한다.
const societyList = window.document.getElementById('scene-journal-society-list');
check('(1) #scene-journal-society-list exists in journal scene', !!societyList);

// (2) scene-btn[data-scene=journal] 의 #scene-journal-badge 가 활성 publication 수를 표시해야 한다.
const journalBadge = window.document.getElementById('scene-journal-badge');
const badgeText = journalBadge ? journalBadge.textContent.trim() : '';
check(
  '(2) #scene-journal-badge shows active publication count',
  journalBadge && Number(badgeText) === active.length,
  `expected ${active.length}, got "${badgeText}"`,
);

// (3) 학계 씬 활성화 (scene-btn 클릭) → society-list 가 publication 으로 채워진다.
const journalBtn = window.document.querySelector('.scene-btn[data-scene="journal"]');
if (!journalBtn) {
  check('(3) journal scene-btn activates society list', false, 'scene button not found');
} else {
  journalBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  const cardsAfterClick = societyList ? societyList.querySelectorAll('.publication-card').length : 0;
  check(
    '(3) journal scene-btn click renders society list',
    cardsAfterClick === active.length,
    `expected ${active.length}, got ${cardsAfterClick}`,
  );
}

// (4) 활성 publication 모두가 society-list 안에서 학회별로 렌더링된다.
const cardsInSocietyList = societyList ? societyList.querySelectorAll('.publication-card').length : 0;
check(
  '(4) #scene-journal-society-list renders all active publication-cards',
  cardsInSocietyList === active.length,
  `expected ${active.length}, got ${cardsInSocietyList}`,
);

// (5) 논문 탭 안에는 publication-card 가 없어야 한다 (분리 핵심 검증).
const paperPanel = window.document.getElementById('paper-panel');
const paperTabBtn = window.document.querySelector('.archive-tab[data-tab="paper"]');
if (paperTabBtn) paperTabBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const cardsInPaper = paperPanel ? paperPanel.querySelectorAll('.publication-card').length : 0;
check(
  '(5) paper-panel does NOT render publication-card list',
  cardsInPaper === 0,
  `got ${cardsInPaper} publication-cards in paper-panel`,
);

// (6) archive-panel 에 society 탭이 없다 (이전 골격 잔재 제거 검증).
const oldSocietyTab = window.document.querySelector('.archive-tab[data-tab="society"]');
const oldSocietyPanel = window.document.getElementById('society-panel');
check(
  '(6) old archive-tab/society-panel removed from archive-panel',
  !oldSocietyTab && !oldSocietyPanel,
  `tab=${!!oldSocietyTab}, panel=${!!oldSocietyPanel}`,
);

// (7) 학회별 accordion: 활성 publication 이 있는 학회는 자동으로 펼쳐져 있다.
if (journalBtn) journalBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const sections = societyList ? societyList.querySelectorAll('.society-section') : [];
let openAreActive = true;
let openCount = 0;
for (const s of sections) {
  const id = s.dataset.societyId;
  const items = active.filter(({ template }) => template.society === id);
  const open = s.dataset.open === '1';
  if (open) openCount += 1;
  if (items.length > 0 && !open) {
    openAreActive = false;
  }
}
check(
  '(7) society-section auto-expands societies with active publications',
  sections.length > 0 && openAreActive && openCount > 0,
  `${sections.length} sections, ${openCount} open, openAreActive=${openAreActive}`,
);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
