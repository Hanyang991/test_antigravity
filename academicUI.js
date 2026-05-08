/**
 * Academic UI
 *
 * M9 integration layer that binds the late-game systems to stable DOM ids
 * from the implementation spec without taking over the drawing UI.
 */

export function renderAcademicUI(gameState, analysis = null) {
  wireSpecIds();
  renderGrammarBlock(analysis);
  renderAcademicSummary(gameState, analysis);
  renderModalPlaceholders();
}

function wireSpecIds() {
  const notebookTab = document.querySelector('.archive-tab[data-tab="notebook"]');
  if (notebookTab && !notebookTab.id) notebookTab.id = 'lab-notebook-tab';

  const expeditionTab = document.querySelector('.archive-tab[data-tab="expedition"]');
  if (expeditionTab && !expeditionTab.id) expeditionTab.id = 'expedition-tab';
}

function renderGrammarBlock(analysis) {
  const container = document.getElementById('analysis-grammar-content');
  if (!container) return;

  if (!analysis || !analysis.grammar) {
    container.textContent = '아직 해석된 문법 토큰이 없습니다.';
    return;
  }

  const operators = analysis.grammar.operators || [];
  const roles = analysis.grammar.roles || [];
  const transforms = analysis.grammar.transforms || [];
  const modifiers = analysis.grammar.modifiers || [];

  const rows = [];
  rows.push(`<div class="analysis-chip-row"><span class="analysis-chip-label">연산자</span><span class="analysis-chip-value">${operators.length ? operators.join(' · ') : '없음'}</span></div>`);
  rows.push(`<div class="analysis-chip-row"><span class="analysis-chip-label">역할</span><span class="analysis-chip-value">${roles.length ? roles.map((role) => `${role.unitId}:${role.role}`).join(' · ') : '미지정'}</span></div>`);
  rows.push(`<div class="analysis-chip-row"><span class="analysis-chip-label">변형</span><span class="analysis-chip-value">${transforms.length ? transforms.join(' · ') : '없음'}</span></div>`);
  rows.push(`<div class="analysis-chip-row"><span class="analysis-chip-label">강조</span><span class="analysis-chip-value">${modifiers.length ? modifiers.map((modifier) => `${modifier.runeIdx}:${modifier.kind}`).join(' · ') : '없음'}</span></div>`);
  container.innerHTML = rows.join('');
}

function renderAcademicSummary(gameState) {
  const discoveries = Object.keys(gameState.discoveries.bySignature).length;
  const accepted = gameState.papers.accepted.length;
  const mismatches = gameState.academic.canonMismatches?.length || 0;
  const activeExpeditions = gameState.expeditions.active.length;

  const setText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };
  setText('hud-discoveries', discoveries);
  setText('hud-papers', accepted);
  setText('hud-expeditions', activeExpeditions);
  setText('hud-mismatches', mismatches);
}

function renderModalPlaceholders() {
  const paperModal = document.getElementById('paper-modal');
  const discoveryModal = document.getElementById('discovery-modal');

  if (paperModal && !paperModal.dataset.bound) {
    paperModal.dataset.bound = 'true';
    paperModal.innerHTML = '<div class="ui-modal-card">논문 작성 모달은 현재 탭 기반 UI로 대체되어 있습니다.</div>';
  }

  if (discoveryModal && !discoveryModal.dataset.bound) {
    discoveryModal.dataset.bound = 'true';
    discoveryModal.innerHTML = '<div class="ui-modal-card">발견 기록 모달은 현재 연구 노트 탭으로 대체되어 있습니다.</div>';
  }
}
