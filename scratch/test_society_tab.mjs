/**
 * PR-A: 학회 탭 골격 회귀 테스트.
 *
 * main 에서 실행하면 (1)/(2)/(3) 에서 FAIL — publications 가 paper-panel 에 그려지고
 * society-panel/society-badge 가 존재하지 않는다.
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

// (1) society-panel 가 DOM 에 존재해야 한다.
const societyPanel = window.document.getElementById('society-panel');
check('(1) #society-panel exists', !!societyPanel);

// (2) society-badge 가 활성 publication 수를 표시해야 한다.
const societyBadge = window.document.getElementById('society-badge');
const badgeText = societyBadge ? societyBadge.textContent.trim() : '';
check(
  '(2) #society-badge shows active publication count',
  societyBadge && Number(badgeText) === active.length,
  `expected ${active.length}, got "${badgeText}"`,
);

// (3) 학회 탭 클릭 → society-panel display === 'block'.
const societyTabBtn = window.document.querySelector('.archive-tab[data-tab="society"]');
if (!societyTabBtn) {
  check('(3) clicking 학회 tab activates society-panel', false, 'tab button not found');
} else {
  societyTabBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
  check(
    '(3) clicking 학회 tab activates society-panel',
    societyPanel && societyPanel.style.display === 'block',
    `display="${societyPanel?.style.display}"`,
  );
}

// (4) 학회 탭 안에 publication-card 들이 그려져 있어야 한다.
const cardsInSociety = societyPanel ? societyPanel.querySelectorAll('.publication-card').length : 0;
check(
  '(4) society-panel renders publication-card list',
  cardsInSociety === active.length,
  `expected ${active.length}, got ${cardsInSociety}`,
);

// (5) 논문 탭 안에는 publication-card 가 없어야 한다.
const paperPanel = window.document.getElementById('paper-panel');
const paperTabBtn = window.document.querySelector('.archive-tab[data-tab="paper"]');
if (paperTabBtn) paperTabBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const cardsInPaper = paperPanel ? paperPanel.querySelectorAll('.publication-card').length : 0;
check(
  '(5) paper-panel does NOT render publication-card list',
  cardsInPaper === 0,
  `got ${cardsInPaper} publication-cards in paper-panel`,
);

// (6) 학회별 accordion: 활성 publication 이 있는 학회는 자동으로 펼쳐져 있다.
if (societyTabBtn) societyTabBtn.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
const sections = societyPanel ? societyPanel.querySelectorAll('.society-section') : [];
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
  '(6) society-section auto-expands societies with active publications',
  sections.length > 0 && openAreActive && openCount > 0,
  `${sections.length} sections, ${openCount} open, openAreActive=${openAreActive}`,
);

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length === 0 ? 0 : 1);
