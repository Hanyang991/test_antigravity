/**
 * Lab Notebook — 게임 HUD 스타일 연구 노트 UI.
 *
 * 모달 폼이 아닌 인게임 요소로 구현:
 * - 캔버스 위 토스트 알림 (미확인 반응, 재현 성공 등)
 * - 좌측 패널 탭 전환 (고문헌 / 연구 노트)
 * - 발견 카드 목록 + 인라인 명명
 * - 하단 자원 HUD 바
 */

import { gameState } from './gameState.js';
import { on } from './eventBus.js';
import { getAllDiscoveries, nameDiscovery } from './discoverySystem.js';
import { getCanonMismatches, classifyDiscoveryAgainstCanon, registerCanon } from './academicCanon.js';
import { createPaperDraft, getEligiblePaperPlans, getPaperSuggestion, getSocieties, submitPaper } from './paperSystem.js';
import { getActivePublications, submitRebuttal } from './societyPublications.js';
import { getExpeditionSites, startExpedition } from './expedition.js';
import { applyForGrant, getGrantOffers, getContractOffers, sellScroll, signContract } from './economy.js';
import { advanceDay } from './schedule.js';
import { getCurrentPhaseInfo } from './phase.js';
import { getMessages, getUnreadCount, markRead } from './inboxSystem.js';
import { getJournalPapers, getCanonForPaper } from './journalSystem.js';
import { SENDER_ROLES } from './data/inboxSeed.js';
import { resetState } from './gameState.js';
import { clearSave, saveGame } from './saveLoad.js';

// ── 초기화 ────────────────────────────────────────────────────────
let initialized = false;

export function initLabNotebook() {
  if (initialized) return;
  initialized = true;

  // DOM 요소 생성
  createToastContainer();
  createNotebookTab();
  createResourceHUD();
  setupScenes();

  // 이벤트 구독
  on('discovery:new', handleNewDiscovery);
  on('discovery:reproduced', handleReproduction);
  on('discovery:named', handleNamed);
  on('dictionary:unlocked', handleDictionaryUnlocked);
  on('canon:mismatch', handleCanonMismatch);
  on('paper:drafted', handlePaperDrafted);
  on('paper:submitted', handlePaperSubmitted);
  on('paper:accepted', handlePaperAccepted);
  on('paper:rejected', handlePaperRejected);
  on('canon:registered', handleCanonRegistered);
  on('expedition:started', handleExpeditionStarted);
  on('expedition:completed', handleExpeditionCompleted);
  on('economy:grantAccepted', handleEconomyUpdate);
  on('economy:contractSigned', handleEconomyUpdate);
  on('economy:scrollSold', handleScrollSold);
  on('week:ticked', handleScheduleUpdate);
  on('day:ticked', handleScheduleUpdate);
  on('phase:advanced', handlePhaseAdvanced);
  on('exam:midtermTaken', handleMidtermTaken);
  on('exam:finalTaken', handleFinalTaken);
  on('inbox:received', handleInboxChange);
  on('inbox:read', handleInboxChange);

  updateNotebookBadge();
  updatePaperBadge();
  refreshInboxBadge();
}

// ── 토스트 시스템 ─────────────────────────────────────────────────
let toastContainer = null;

function createToastContainer() {
  toastContainer = document.createElement('div');
  toastContainer.id = 'toast-container';
  toastContainer.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10000;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    pointer-events: none;
  `;
  document.body.appendChild(toastContainer);
}

/**
 * 게임 HUD 토스트를 표시한다.
 * @param {string} message  메시지
 * @param {string} type     'discovery' | 'repro' | 'info' | 'warn'
 * @param {number} duration 표시 시간 (ms)
 */
export function showToast(message, type = 'info', duration = 3000) {
  if (!toastContainer) return;

  const toast = document.createElement('div');
  toast.className = `game-toast toast-${type}`;

  const icons = {
    discovery: '⚡',
    repro: '✓',
    info: 'ℹ',
    warn: '⚠',
    paper: '📜',
  };

  toast.innerHTML = `
    <span class="toast-icon">${icons[type] || '•'}</span>
    <span class="toast-text">${message}</span>
  `;

  toast.style.cssText = `
    pointer-events: auto;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: ${getToastBg(type)};
    border: 1px solid ${getToastBorder(type)};
    border-radius: 8px;
    color: #fff;
    font-family: var(--font-data, 'Share Tech Mono', monospace);
    font-size: 0.85rem;
    backdrop-filter: blur(10px);
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
    animation: toastSlideIn 0.3s ease-out;
    opacity: 1;
    transition: opacity 0.4s ease-out;
  `;

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, duration);
}

function getToastBg(type) {
  switch (type) {
    case 'discovery': return 'rgba(138, 43, 226, 0.85)';
    case 'repro': return 'rgba(0, 200, 100, 0.85)';
    case 'warn': return 'rgba(255, 170, 0, 0.85)';
    case 'paper': return 'rgba(0, 180, 255, 0.85)';
    default: return 'rgba(0, 255, 255, 0.7)';
  }
}

function getToastBorder(type) {
  switch (type) {
    case 'discovery': return 'rgba(180, 80, 255, 0.8)';
    case 'repro': return 'rgba(0, 255, 130, 0.6)';
    case 'warn': return 'rgba(255, 200, 0, 0.6)';
    case 'paper': return 'rgba(0, 200, 255, 0.6)';
    default: return 'rgba(0, 255, 255, 0.5)';
  }
}

// ── 연구 노트 탭 ─────────────────────────────────────────────────
function createNotebookTab() {
  const archivePanel = document.querySelector('.archive-panel');
  if (!archivePanel) return;

  // 탭 헤더 추가
  const header = archivePanel.querySelector('.panel-header');
  if (!header) return;

  const tabBar = document.createElement('div');
  tabBar.id = 'archive-tab-bar';
  tabBar.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
    flex: 1 1 auto;
  `;

  tabBar.innerHTML = `
    <button class="archive-tab active" data-tab="archive">고문헌</button>
    <button class="archive-tab" data-tab="dictionary">도감</button>
    <button class="archive-tab" data-tab="notebook">연구 노트 <span id="notebook-badge" style="
      background: rgba(138,43,226,0.8);
      border-radius: 8px;
      padding: 1px 6px;
      font-size: 0.65rem;
      margin-left: 4px;
      display: none;
    ">0</span></button>
    <button class="archive-tab" data-tab="paper">논문 <span id="paper-badge" style="
      background: rgba(0,180,255,0.8);
      border-radius: 8px;
      padding: 1px 6px;
      font-size: 0.65rem;
      margin-left: 4px;
      display: none;
    ">0</span></button>
    <button class="archive-tab" data-tab="expedition">탐사</button>
  `;

  header.insertBefore(tabBar, header.firstChild);

  // 연구 노트 컨텐츠 패널
  const content = archivePanel.querySelector('.panel-content');
  if (!content) return;

  const dictionaryPanel = document.createElement('div');
  dictionaryPanel.id = 'dictionary-panel';
  dictionaryPanel.style.cssText = 'display: none;';
  dictionaryPanel.innerHTML = `
    <div id="dictionary-list" style="
      max-height: 280px;
      overflow-y: auto;
      padding-right: 4px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
    "></div>
  `;
  content.appendChild(dictionaryPanel);

  const notebookPanel = document.createElement('div');
  notebookPanel.id = 'notebook-panel';
  notebookPanel.style.cssText = 'display: none;';
  notebookPanel.innerHTML = `
    <div id="notebook-list" style="
      max-height: 280px;
      overflow-y: auto;
      padding-right: 4px;
    ">
      <p style="color: #666; font-size: 0.8rem; text-align: center; padding: 20px 0;">
        아직 발견된 현상이 없습니다.<br>룬을 그려 실험해 보세요.
      </p>
    </div>
  `;
  content.appendChild(notebookPanel);

  const paperPanel = document.createElement('div');
  paperPanel.id = 'paper-panel';
  paperPanel.style.cssText = 'display: none;';
  paperPanel.innerHTML = `
    <div id="paper-list" style="
      max-height: 300px;
      overflow-y: auto;
      padding-right: 4px;
    ">
      <p style="color: #666; font-size: 0.8rem; text-align: center; padding: 20px 0;">
        아직 제출 가능한 논문이 없습니다.<br>현상을 3회 이상 재현해 보세요.
      </p>
    </div>
  `;
  content.appendChild(paperPanel);

  const expeditionPanel = document.createElement('div');
  expeditionPanel.id = 'expedition-panel';
  expeditionPanel.style.cssText = 'display: none;';
  expeditionPanel.innerHTML = `
    <div id="expedition-list" style="
      max-height: 300px;
      overflow-y: auto;
      padding-right: 4px;
    "></div>
  `;
  content.appendChild(expeditionPanel);

  // 탭 전환 로직
  tabBar.addEventListener('click', (e) => {
    const btn = e.target.closest('.archive-tab');
    if (!btn) return;
    const tab = btn.dataset.tab;

    // 탭 활성화
    tabBar.querySelectorAll('.archive-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // 패널 전환
    const archiveContent = content.querySelector('.lore-text')?.parentElement;
    if (tab === 'archive') {
      for (const child of content.children) {
        if (['notebook-panel', 'paper-panel', 'expedition-panel', 'dictionary-panel'].includes(child.id)) child.style.display = 'none';
        else child.style.display = '';
      }
    } else {
      for (const child of content.children) {
        child.style.display = child.id === `${tab}-panel` ? 'block' : 'none';
      }
      if (tab === 'notebook') refreshNotebookList();
      else if (tab === 'paper') refreshPaperList();
      else if (tab === 'expedition') refreshExpeditionList();
      else if (tab === 'dictionary') refreshDictionaryList();
    }
  });
}

function refreshDictionaryList() {
  const list = document.getElementById('dictionary-list');
  if (!list) return;

  const unlockedRunes = gameState.progression.unlockedRunes || [];
  const unlockedCompounds = gameState.progression.unlockedCompounds || [];

  if (unlockedRunes.length === 0 && unlockedCompounds.length === 0) {
    list.innerHTML = `
      <div style="grid-column: 1 / -1; color: #666; font-size: 0.8rem; text-align: center; padding: 20px 0;">
        아직 해금된 룬이 없습니다.<br>지도교수의 과제를 완료하여 도감을 채우세요.
      </div>
    `;
    return;
  }

  const runeCardsHtml = unlockedRunes.map(runeName => `
    <div style="
      background: rgba(20, 10, 40, 0.8);
      border: 1px solid rgba(0, 200, 100, 0.4);
      border-radius: 6px;
      padding: 12px 8px;
      text-align: center;
      color: #a8ffd1;
      font-size: 0.85rem;
      box-shadow: 0 0 10px rgba(0, 200, 100, 0.1);
    ">
      ${runeName}
    </div>
  `).join('');

  const compoundCardsHtml = unlockedCompounds.map(name => `
    <div style="
      background: rgba(40, 20, 60, 0.85);
      border: 1px solid rgba(220, 140, 60, 0.55);
      border-radius: 6px;
      padding: 12px 8px;
      text-align: center;
      color: #ffd9a8;
      font-size: 0.85rem;
      box-shadow: 0 0 10px rgba(220, 140, 60, 0.15);
    ">
      <div style="font-size:0.6rem; color:#c89a5a; margin-bottom:2px; letter-spacing:0.4px;">복합</div>
      ${name}
    </div>
  `).join('');

  list.innerHTML = runeCardsHtml + compoundCardsHtml;
}

function refreshNotebookList() {
  const list = document.getElementById('notebook-list');
  if (!list) return;

  const discoveries = getAllDiscoveries();

  if (discoveries.length === 0) {
    list.innerHTML = `
      <p style="color: #666; font-size: 0.8rem; text-align: center; padding: 20px 0;">
        아직 발견된 현상이 없습니다.<br>룬을 그려 실험해 보세요.
      </p>
    `;
    return;
  }

  list.innerHTML = discoveries.map((d, i) => {
    const ref = d.reproducibility.records[0] || {};
    const name = d.playerName || '미확인 현상 #' + (i + 1);
    const reproClass = d.reproducibility.count >= 3 ? 'repro-ready' : '';
    const statusText = d.status === 'reproducible' ? '📜 논문 제출 가능' :
                        `재현 ${d.reproducibility.count}/${d.reproducibility.requiredForPaper}회`;

    // 디버그 모드일 때만 정답명 표시
    const debugInfo = gameState.settings.debugShowLegacyNames
      ? `<div style="color:#666;font-size:0.6rem;margin-top:2px;">DEBUG: ${d._legacyMeaning || '?'}${d._legacyCompound ? ' → ' + d._legacyCompound : ''}</div>`
      : '';

    return `
      <div class="discovery-card ${reproClass}" data-sig="${d.signature}" style="
        background: rgba(20, 10, 40, 0.8);
        border: 1px solid rgba(138, 43, 226, 0.3);
        border-radius: 6px;
        padding: 8px 10px;
        margin-bottom: 6px;
        cursor: pointer;
        transition: border-color 0.2s;
      ">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span class="discovery-name" style="
            color: ${d.playerName ? '#e0d0ff' : '#888'};
            font-size: 0.85rem;
            font-weight: ${d.playerName ? '600' : '400'};
          ">${name}</span>
          <span style="
            font-size: 0.7rem;
            color: ${d.status === 'reproducible' ? '#00cc66' : '#888'};
          ">${statusText}</span>
        </div>
        <div style="
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 4px;
          margin-top: 6px;
          font-size: 0.7rem;
          color: #aaa;
          font-family: var(--font-data, monospace);
        ">
          <span>열 ${ref.heat || 0}°C</span>
          <span>불안정 ${(ref.instability || 0).toFixed(0)}%</span>
          <span>공명 ${(ref.resonance || 0).toFixed(1)}Hz</span>
        </div>
        ${d.playerDescription ? `<div style="color:#998;font-size:0.7rem;margin-top:4px;font-style:italic;">"${d.playerDescription}"</div>` : ''}
        ${debugInfo}
      </div>
    `;
  }).join('');

  // 카드 클릭 → 명명 인터랙션
  list.querySelectorAll('.discovery-card').forEach(card => {
    card.addEventListener('click', () => {
      const sig = card.dataset.sig;
      openNamingInline(card, sig);
    });
  });
}

function refreshPaperList() {
  const list = document.getElementById('paper-list');
  if (!list) return;

  const eligible = getEligiblePaperPlans();
  const mismatches = getCanonMismatches();
  const societies = getSocieties();

  const accepted = gameState.papers.accepted;
  const rejected = gameState.papers.rejected;
  const publications = getActivePublications();

  if (eligible.length === 0 && accepted.length === 0 && rejected.length === 0 && publications.length === 0) {
    list.innerHTML = `
      <p style="color: #666; font-size: 0.8rem; text-align: center; padding: 20px 0;">
        아직 제출 가능한 논문이 없습니다.<br>현상을 3회 이상 재현해 보세요.
      </p>
    `;
    return;
  }

  const eligibleHtml = eligible.map((plan, index) => {
    const name = plan.discovery.playerName || `미확인 현상 #${index + 1}`;
    const types = plan.types.map((type) => `<option value="${type}">${type}</option>`).join('');
    const societyOptions = societies.map((society) => `<option value="${society.id}">${society.name}</option>`).join('');
    return `
      <div class="paper-card" data-sig="${plan.signature}" style="
        background: rgba(10, 20, 40, 0.75);
        border: 1px solid rgba(0, 180, 255, 0.25);
        border-radius: 6px;
        padding: 8px 10px;
        margin-bottom: 8px;
      ">
        <div style="display:flex; justify-content:space-between; gap:8px; align-items:center;">
          <span style="color:#d7ecff; font-size:0.84rem; font-weight:600;">${name}</span>
          <span style="color:#7ebadf; font-size:0.68rem;">재현 ${plan.discovery.reproducibility.count}회</span>
        </div>
        ${plan.mismatch ? `<div style="margin-top:6px;color:#ffcc88;font-size:0.72rem;">정설 불일치: ${plan.mismatch.canonOfficialName}</div>` : ''}
        ${renderClassificationBadge(plan.classification)}
        <div style="display:grid; grid-template-columns: 1fr 1fr auto; gap:6px; margin-top:8px;">
          <select class="paper-type" style="${selectStyle()}">${types}</select>
          <select class="paper-society" style="${selectStyle()}">${societyOptions}</select>
          <button class="paper-submit" style="${buttonStyle()}">작성·제출</button>
        </div>
      </div>
    `;
  }).join('');

  const resultHtml = renderPaperHistory(accepted, rejected, mismatches);
  const publicationsHtml = renderPublicationsSection(publications);

  list.innerHTML = `
    ${publicationsHtml}
    ${eligibleHtml || ''}
    ${resultHtml}
  `;

  list.querySelectorAll('.paper-card').forEach((card) => {
    const button = card.querySelector('.paper-submit');
    const typeEl = card.querySelector('.paper-type');
    const societyEl = card.querySelector('.paper-society');
    button.addEventListener('click', () => {
      openPaperDraftModal({
        signature: card.dataset.sig,
        type: typeEl.value,
        targetSociety: societyEl.value,
      });
    });
  });

  // PR-I: 수락된 도전/보완 논문 카드의 "정설 등재" 버튼 바인딩.
  list.querySelectorAll('.paper-register-canon').forEach((button) => {
    button.addEventListener('click', () => handleRegisterCanonClick(button.dataset.paperId));
  });

  // PR-J: 학회지 NPC 논문에 대한 반박 버튼.
  list.querySelectorAll('.publication-rebut').forEach((button) => {
    button.addEventListener('click', () => handleRebutPublicationClick(button.dataset.publicationId));
  });
}

// PR-J: 활성 NPC 학회지 논문 섹션. 각 카드 = abstract + 반박 버튼.
function renderPublicationsSection(publications) {
  const failed = gameState.academic?.failedRebuttals || 0;
  const succeeded = gameState.academic?.successfulRebuttals || 0;
  const counterHtml = (failed > 0 || succeeded > 0)
    ? `<div style="color:#7ebadf; font-size:0.66rem; margin-top:2px;">반박 누적: 정확 ${succeeded} / 오반박 ${failed}</div>`
    : '';

  if (publications.length === 0) {
    return `
      <div style="margin-bottom:10px;">
        <div style="color:#8fd4ff; font-size:0.74rem; font-family:var(--font-data, monospace);">학회지 NPC 논문</div>
        ${counterHtml}
        <div style="color:#666; font-size:0.72rem; padding:6px 0;">현재 출간된 NPC 논문이 없습니다.</div>
      </div>
    `;
  }

  const cards = publications.map(({ template, entry }) => {
    const releasedWeek = entry?.releasedAt?.week ?? template.releaseWeek;
    return `
      <div class="publication-card" style="
        background: rgba(20, 30, 50, 0.78);
        border: 1px solid rgba(120, 180, 230, 0.3);
        border-radius: 6px;
        padding: 8px 10px;
        margin-bottom: 8px;
      ">
        <div style="display:flex; justify-content:space-between; gap:8px; align-items:center;">
          <span style="color:#cfe2ff; font-size:0.82rem; font-weight:600;">${escapeHtml(template.title)}</span>
          <span style="color:#7ebadf; font-size:0.66rem;">${releasedWeek}주차</span>
        </div>
        <div style="color:#9bb6cf; font-size:0.7rem; margin-top:2px;">
          ${escapeHtml(template.author)} · ${escapeHtml(getSocietyDisplayName(template.society))}
        </div>
        <div style="color:#b9d4ec; font-size:0.7rem; margin-top:4px; line-height:1.4;">
          ${escapeHtml(template.abstract)}
        </div>
        <div style="display:flex; justify-content:flex-end; margin-top:6px;">
          <button class="publication-rebut" data-publication-id="${escapeHtml(template.id)}"
            title="반박 (5일 소모 · 사실에 부합하는 논문이면 학위·평판 손실)"
            style="
              background: rgba(220, 110, 110, 0.14);
              border: 1px solid rgba(220, 110, 110, 0.45);
              border-radius: 4px;
              color: #ffd0d0;
              font-size: 0.7rem;
              padding: 4px 10px;
              cursor: pointer;
              font-family: var(--font-text, system-ui), sans-serif;
            ">반박 (5일)</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div style="margin-bottom:10px;">
      <div style="color:#8fd4ff; font-size:0.74rem; font-family:var(--font-data, monospace);">학회지 NPC 논문 (${publications.length})</div>
      ${counterHtml}
      ${cards}
    </div>
  `;
}

function getSocietyDisplayName(societyId) {
  const society = getSocieties().find((s) => s.id === societyId);
  return society?.name || societyId;
}

function handleRebutPublicationClick(publicationId) {
  if (!publicationId) return;
  const result = submitRebuttal(publicationId);
  if (!result.ok) {
    showToast(`반박 실패: ${result.reason}`, 'warn', 4000);
    return;
  }
  if (result.outcome === 'wrongful') {
    showToast(`오반박 — 학위 ${result.deltas.degreeScore} / 평판 ${result.deltas.reputation}`, 'warn', 5000);
  } else {
    showToast(`반박 채택 — 학위 +${result.deltas.degreeScore} / 평판 +${result.deltas.reputation} / ${result.deltas.researchFunds}G`, 'paper', 5000);
  }
  refreshPaperList();
  refreshResourceHUD();
}

function openPaperDraftModal({ signature, type, targetSociety }) {
  const suggestion = getPaperSuggestion(signature, type);
  if (!suggestion.ok) {
    showToast('error', '발견을 찾을 수 없습니다.', '');
    return;
  }

  // 기존 열린 모달 제거
  document.getElementById('paper-draft-modal')?.remove();

  const society = getSocieties().find((s) => s.id === targetSociety) || { name: targetSociety };
  const evidence = suggestion.evidence;
  const discoveryName = suggestion.discovery.playerName || '미확인 현상';
  const classification = classifyDiscoveryAgainstCanon(signature);

  const overlay = document.createElement('div');
  overlay.id = 'paper-draft-modal';
  overlay.style.cssText = `
    position: fixed; inset: 0; z-index: 9999;
    background: rgba(8, 4, 16, 0.78);
    display: flex; align-items: center; justify-content: center;
    backdrop-filter: blur(2px);
  `;

  overlay.innerHTML = `
    <div style="
      width: min(560px, 92vw); max-height: 86vh; overflow: auto;
      background: linear-gradient(180deg, rgba(28, 18, 48, 0.96), rgba(18, 10, 36, 0.96));
      border: 1px solid rgba(160, 120, 220, 0.45);
      border-radius: 8px;
      padding: 18px 20px;
      color: #e7dffb;
      font-family: var(--font-text, system-ui), serif;
      box-shadow: 0 10px 40px rgba(0,0,0,0.6);
    ">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <h3 style="margin:0; font-size:1.05rem; color:#d8c8ff;">논문 초안 작성</h3>
        <button id="paper-draft-close" style="
          background:transparent; color:#aaa; border:none; font-size:1.4rem; cursor:pointer; line-height:1;
        ">×</button>
      </div>

      <div style="font-size:0.78rem; color:#b9a9d6; margin-bottom:10px;">
        <div>대상 발견: <span style="color:#fff;">${escapeHtml(discoveryName)}</span></div>
        <div>제출 학회: <span style="color:#fff;">${escapeHtml(society.name)}</span></div>
        <div>논문 유형: <span style="color:#fff;">${escapeHtml(type)}</span></div>
      </div>
      ${renderModalClassificationWarning(classification, type)}

      <div style="
        background: rgba(0,0,0,0.25);
        border:1px solid rgba(255,255,255,0.06);
        border-radius:4px; padding:8px 10px; margin-bottom:12px;
        font-size:0.72rem; color:#9c8eb8;
      ">
        <div style="font-size:0.66rem; color:#7a6d96; margin-bottom:4px; letter-spacing:0.3px;">증거 요약</div>
        <div>재현 ${evidence.reproductionCount}회 · 평균 열 ${evidence.averageHeat}°C · 평균 불안정 ${evidence.averageInstability}%</div>
        <div>등급 ${escapeHtml(evidence.sentenceGrade)} · 바탕재 ${evidence.materialsTested.join(', ') || '없음'}</div>
        ${suggestion.mismatch ? `<div style="color:#ffcc88; margin-top:4px;">정설 불일치: ${escapeHtml(suggestion.mismatch.canonOfficialName || '')}</div>` : ''}
      </div>

      <label style="display:block; font-size:0.72rem; color:#a99cc7; margin-bottom:4px;">제목</label>
      <input id="paper-draft-title" type="text" value="${escapeHtml(suggestion.suggestedTitle)}" style="
        width:100%; padding:8px 10px; margin-bottom:12px;
        background: rgba(0,0,0,0.35); color:#fff;
        border:1px solid rgba(160, 120, 220, 0.3); border-radius:4px;
        font-size:0.85rem;
      "/>

      <label style="display:block; font-size:0.72rem; color:#a99cc7; margin-bottom:4px;">주장 (요약)</label>
      <textarea id="paper-draft-claim" rows="4" style="
        width:100%; padding:8px 10px; margin-bottom:6px;
        background: rgba(0,0,0,0.35); color:#fff;
        border:1px solid rgba(160, 120, 220, 0.3); border-radius:4px;
        font-size:0.82rem; resize:vertical; font-family:inherit;
      ">${escapeHtml(suggestion.suggestedClaim)}</textarea>
      <div style="font-size:0.66rem; color:#7a6d96; margin-bottom:14px;">
        프리필된 문구는 자동 생성된 초안입니다. 본인의 관측·해석으로 수정하세요.
      </div>

      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button id="paper-draft-cancel" style="${buttonStyle()}">취소</button>
        <button id="paper-draft-reset" style="${buttonStyle()}">프리필 복원</button>
        <button id="paper-draft-submit" style="${buttonStyle()}; background: rgba(80, 130, 200, 0.5);">초안 작성·제출</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#paper-draft-close').addEventListener('click', close);
  overlay.querySelector('#paper-draft-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  const titleEl = overlay.querySelector('#paper-draft-title');
  const claimEl = overlay.querySelector('#paper-draft-claim');

  overlay.querySelector('#paper-draft-reset').addEventListener('click', () => {
    titleEl.value = suggestion.suggestedTitle;
    claimEl.value = suggestion.suggestedClaim;
  });

  overlay.querySelector('#paper-draft-submit').addEventListener('click', () => {
    const title = titleEl.value.trim();
    const claim = claimEl.value.trim();
    if (!title) { titleEl.focus(); return; }
    if (!claim) { claimEl.focus(); return; }

    const draft = createPaperDraft({
      discoverySignature: signature,
      type,
      targetSociety,
      title,
      claim,
    });
    if (draft) submitPaper(draft.id);
    close();
    refreshPaperList();
  });

  setTimeout(() => titleEl.focus(), 0);
}

function refreshExpeditionList() {
  const list = document.getElementById('expedition-list');
  if (!list) return;

  const sites = getExpeditionSites();
  const grants = getGrantOffers();
  const contracts = getContractOffers();
  const phaseInfo = getCurrentPhaseInfo();
  const active = gameState.expeditions.active;
  const completed = gameState.expeditions.completed.slice(0, 3);

  const activeHtml = active.length
    ? active.map((item) => `
        <div style="padding:6px 0; border-top:1px solid rgba(255,255,255,0.08);">
          <div style="color:#9de8ff;font-size:0.8rem;">진행 중: ${item.siteName}</div>
          <div style="color:#7aa0af;font-size:0.68rem;">남은 시간 ${item.remainingDays}일</div>
        </div>
      `).join('')
    : '<div style="color:#666;font-size:0.72rem;padding:6px 0;">진행 중인 탐사가 없습니다.</div>';

  const sitesHtml = sites.map((site) => `
    <div class="expedition-card" data-site="${site.id}" style="
      background: rgba(10, 30, 35, 0.65);
      border: 1px solid rgba(0, 200, 180, 0.22);
      border-radius: 6px;
      padding: 8px 10px;
      margin-bottom: 8px;
    ">
      <div style="display:flex; justify-content:space-between; gap:8px;">
        <span style="color:#c8fff2;font-size:0.82rem;font-weight:600;">${site.name}</span>
        <span style="color:#6fa69c;font-size:0.68rem;">${site.cost.funds}G / ${site.cost.days}일</span>
      </div>
      <div style="color:#7daaa1;font-size:0.7rem;margin-top:4px;">${site.region} 계열 · Phase ${site.phase}</div>
      <button class="expedition-start" style="${buttonStyle('teal')}; margin-top:8px;">탐사 시작</button>
    </div>
  `).join('');

  const grantsHtml = grants.map((grant) => `
    <div class="grant-card" data-grant="${grant.id}" style="padding:6px 0; border-top:1px solid rgba(255,255,255,0.08);">
      <div style="display:flex; justify-content:space-between;">
        <span style="color:#ffe4a8;font-size:0.76rem;">${grant.name}</span>
        <button class="grant-accept" style="${buttonStyle('gold')}">수주</button>
      </div>
      <div style="color:#a99462;font-size:0.68rem;">즉시 ${grant.payout}G · ${grant.durationWeeks}주</div>
    </div>
  `).join('');

  const contractsHtml = contracts.map((contract) => `
    <div class="contract-card" data-contract="${contract.id}" style="padding:6px 0; border-top:1px solid rgba(255,255,255,0.08);">
      <div style="display:flex; justify-content:space-between;">
        <span style="color:#ffd4c8;font-size:0.76rem;">${contract.name}</span>
        <button class="contract-accept" style="${buttonStyle('coral')}">계약</button>
      </div>
      <div style="color:#b28782;font-size:0.68rem;">선금 ${contract.upfront}G · 주당 ${contract.weeklyIncome}G</div>
    </div>
  `).join('');

  const completedHtml = completed.map((item) => `
    <div style="padding:6px 0; border-top:1px solid rgba(255,255,255,0.08);">
      <div style="color:#98f6d7;font-size:0.76rem;">완료: ${item.expeditionId}</div>
      <div style="color:#7ea18f;font-size:0.68rem;">${item.finds.map((find) => find.title).join(', ')}</div>
    </div>
  `).join('');

  list.innerHTML = `
    <div class="scene-meta-card">
      <div class="scene-meta-row">
        <span class="scene-meta-title">${phaseInfo.name}</span>
        <span class="scene-meta-phase">Phase ${phaseInfo.phase}</span>
      </div>
      <div class="scene-meta-note">다음 승급 조건 — ${renderPhaseRequirement(phaseInfo.requirements)}</div>
      <div class="scene-meta-note scene-meta-hint">중간/기말고사는 학기 일정상 8주차·16주차에 지도교수가 자동으로 시행합니다.</div>
    </div>
    <div class="scene-section-label">진행 중 탐사</div>
    ${activeHtml}
    <div class="scene-section-label">탐사지</div>
    ${sitesHtml || '<div style="color:#666;font-size:0.72rem;padding:6px 0;">현재 해금된 탐사지가 없습니다.</div>'}
    <div class="scene-section-label scene-section-label-warm">연구비</div>
    ${grantsHtml}
    ${contractsHtml}
    <div style="margin-top:10px;">
      <button id="btn-sell-scroll" style="${buttonStyle('purple')}">현재 현상 스크롤 판매</button>
    </div>
    <div class="scene-section-label scene-section-label-cool">최근 탐사 결과</div>
    ${completedHtml || '<div style="color:#666;font-size:0.72rem;padding:6px 0;">아직 탐사 완료 기록이 없습니다.</div>'}
  `;

  list.querySelectorAll('.expedition-start').forEach((button) => {
    button.addEventListener('click', (event) => {
      const siteId = event.currentTarget.closest('.expedition-card')?.dataset.site;
      startExpedition(siteId);
      refreshExpeditionList();
      refreshResourceHUD();
    });
  });
  list.querySelectorAll('.grant-accept').forEach((button) => {
    button.addEventListener('click', (event) => {
      const grantId = event.currentTarget.closest('.grant-card')?.dataset.grant;
      applyForGrant(grantId);
      refreshExpeditionList();
      refreshResourceHUD();
    });
  });
  list.querySelectorAll('.contract-accept').forEach((button) => {
    button.addEventListener('click', (event) => {
      const contractId = event.currentTarget.closest('.contract-card')?.dataset.contract;
      signContract(contractId);
      refreshExpeditionList();
      refreshResourceHUD();
    });
  });

  const sellScrollBtn = document.getElementById('btn-sell-scroll');
  if (sellScrollBtn) {
    sellScrollBtn.addEventListener('click', () => {
      const latestSig = gameState.discoveries.recentSignatures[0];
      if (!latestSig || !window.__ARCANE_LAST_ANALYSIS__) return;
      sellScroll(latestSig, window.__ARCANE_LAST_ANALYSIS__);
      refreshExpeditionList();
      refreshResourceHUD();
    });
  }
}

function renderPaperHistory(accepted, rejected, mismatches) {
  const acceptedHtml = accepted.slice(0, 4).map((paper) => renderReviewedCard(paper, 'accepted')).join('');
  const rejectedHtml = rejected.slice(0, 4).map((paper) => renderReviewedCard(paper, 'rejected')).join('');
  const mismatchHtml = mismatches.slice(0, 3).map((item) => `
    <div style="padding:6px 0; border-top:1px solid rgba(255,255,255,0.08);">
      <div style="color:#ffcc88; font-size:0.78rem;">도전 후보: ${item.canonOfficialName}</div>
      <div style="color:#b79a75; font-size:0.68rem;">${item.reasons.join(', ')}</div>
    </div>
  `).join('');

  return `
    <div style="margin-top:10px;">
      <div style="color:#8fd4ff; font-size:0.74rem; font-family:var(--font-data, monospace);">최근 심사</div>
      ${acceptedHtml || '<div style="color:#666;font-size:0.72rem;padding-top:6px;">수락 기록 없음</div>'}
      ${rejectedHtml}
      ${mismatchHtml}
    </div>
  `;
}

// PR-H: review 결과 카드. score(0–100) 배지 + 학회 + 사유 + classification
// 페널티 표시 + canonOverride 등재 노트 + reviewer voice 인용 + grantedRewards.
function renderReviewedCard(paper, kind) {
  const review = paper.review || {};
  const score = typeof review.score === 'number' ? review.score : null;
  const societyName = review.society?.name || '';
  const reasons = review.reasons || [];
  const accepted = kind === 'accepted';
  const titleColor = accepted ? '#a8ffd1' : '#ffb6b6';
  const subColor = accepted ? '#7aa18b' : '#b68c8c';
  const labelText = accepted ? '수락' : '반려';

  const scoreBadge = score !== null
    ? `<span style="
        background: ${accepted ? 'rgba(80, 180, 130, 0.18)' : 'rgba(220, 110, 110, 0.18)'};
        border: 1px solid ${accepted ? 'rgba(80, 180, 130, 0.4)' : 'rgba(220, 110, 110, 0.4)'};
        border-radius: 4px;
        padding: 1px 6px;
        font-size: 0.66rem;
        font-family: var(--font-data, monospace);
        color: ${accepted ? '#b8ffd9' : '#ffd0d0'};
        margin-left: 6px;
      ">${score}/100</span>`
    : '';

  const penaltyBadge = review.canonPenaltyApplied
    ? `<span style="
        background: rgba(255, 170, 60, 0.16);
        border: 1px solid rgba(255, 170, 60, 0.4);
        border-radius: 4px;
        padding: 1px 6px;
        font-size: 0.66rem;
        color: #ffd58a;
        margin-left: 6px;
      ">정설 검증 -30%</span>`
    : '';

  const overrideHtml = review.canonOverride
    ? `<div style="color:#9fffe1;font-size:0.68rem;margin-top:2px;">정설 갱신: "${escapeHtml(review.canonOverride.canonTitle || '')}" 가 본 논문으로 대체됨</div>`
    : '';

  const voiceHtml = review.reviewerVoice
    ? `<div style="color:#a9c5e0;font-size:0.66rem;margin-top:2px;font-style:italic;">— ${escapeHtml(review.reviewerVoice)}</div>`
    : '';

  const rewardsHtml = accepted && review.grantedRewards
    ? `<div style="color:#9adfb8;font-size:0.66rem;margin-top:2px;">보상 ${formatRewards(review.grantedRewards)}</div>`
    : '';

  const reasonHtml = reasons.length
    ? `<div style="color:${subColor};font-size:0.68rem;">${escapeHtml(reasons[reasons.length - 1])}</div>`
    : '';

  const registerCanonHtml = accepted ? renderRegisterCanonControl(paper, review) : '';

  return `
    <div style="padding:6px 0; border-top:1px solid rgba(255,255,255,0.08);">
      <div style="color:${titleColor}; font-size:0.78rem;">
        ${labelText}: ${escapeHtml(paper.title)}${scoreBadge}${penaltyBadge}
      </div>
      ${societyName ? `<div style="color:${subColor}; font-size:0.68rem;">${escapeHtml(societyName)}</div>` : ''}
      ${reasonHtml}
      ${overrideHtml}
      ${rewardsHtml}
      ${voiceHtml}
      ${registerCanonHtml}
    </div>
  `;
}

// PR-I: 수락된 도전/보완 논문에 대해 Phase 5 능력으로 정설을 등재하는
// 컨트롤. canRegisterCanon=false 이면 disabled, 이미 등재되었으면 완료 배지로 전환.
function renderRegisterCanonControl(paper, review) {
  if (paper.type !== 'challenge' && paper.type !== 'refinement') return '';
  const override = review?.canonOverride;
  if (!override) return '';

  if (override.registered) {
    const author = override.registeredByAuthor || '플레이어';
    return `
      <div style="
        margin-top:4px;
        padding:4px 8px;
        background: rgba(150, 220, 255, 0.10);
        border: 1px solid rgba(150, 220, 255, 0.32);
        border-radius: 4px;
        color: #cfe9ff;
        font-size: 0.68rem;
      ">★ 정설 등재 완료 — ${escapeHtml(author)} 명의로 "${escapeHtml(override.newOfficialName || override.canonTitle || '')}" 등재</div>
    `;
  }

  const canRegister = !!gameState.progression?.canRegisterCanon;
  const tooltip = canRegister
    ? '정설 등재 (5일 소모 · 학위+50 / 평판+20 / 연구비+500G)'
    : '석학(Phase 5) 진입 이후 공개됨';
  const cursor = canRegister ? 'pointer' : 'not-allowed';
  const opacity = canRegister ? '1' : '0.55';
  return `
    <div style="margin-top:6px;">
      <button class="paper-register-canon" data-paper-id="${escapeHtml(paper.id)}"
        ${canRegister ? '' : 'disabled'}
        title="${tooltip}"
        style="
          background: rgba(150, 220, 255, 0.14);
          border: 1px solid rgba(150, 220, 255, 0.4);
          border-radius: 4px;
          color: #cfe9ff;
          font-size: 0.7rem;
          padding: 4px 8px;
          cursor: ${cursor};
          opacity: ${opacity};
          font-family: var(--font-text, system-ui), sans-serif;
        ">★ 정설 등재 (5일)</button>
    </div>
  `;
}

function handleRegisterCanonClick(paperId) {
  if (!paperId) return;
  const result = registerCanon(paperId);
  if (!result.ok) {
    showToast(`정설 등재 실패: ${result.reason}`, 'warn', 4000);
    return;
  }
  refreshPaperList();
  refreshResourceHUD();
}

function renderClassificationBadge(classification) {
  if (!classification || classification.classification !== 'known_disputed') return '';
  const canonTitle = classification.canon?.title || '기존 정설';
  return `
    <div style="
      margin-top:6px;
      padding:4px 8px;
      background: rgba(255, 170, 60, 0.10);
      border: 1px solid rgba(255, 170, 60, 0.32);
      border-radius: 4px;
      color: #ffd58a;
      font-size: 0.7rem;
    ">정설 검증 후보 — ${escapeHtml(canonTitle)} (new_discovery 시 점수·보상 30% 차감)</div>
  `;
}

function renderModalClassificationWarning(classification, type) {
  if (!classification) return '';
  const cls = classification.classification;
  const canonTitle = classification.canon?.title || '';

  if (cls === 'known_correct' && type === 'new_discovery') {
    return `
      <div style="
        margin-bottom:12px; padding:8px 10px;
        background: rgba(220, 80, 80, 0.14);
        border: 1px solid rgba(220, 80, 80, 0.4);
        border-radius: 4px;
        font-size: 0.72rem; color: #ffb6b6;
      ">⚠ 이미 "${escapeHtml(canonTitle)}" 로 등재된 정설입니다. 신규 발견 등재가 즉시 거절됩니다.</div>
    `;
  }

  if (cls === 'known_disputed' && type === 'new_discovery') {
    return `
      <div style="
        margin-bottom:12px; padding:8px 10px;
        background: rgba(255, 170, 60, 0.10);
        border: 1px solid rgba(255, 170, 60, 0.4);
        border-radius: 4px;
        font-size: 0.72rem; color: #ffd58a;
      ">⚠ "${escapeHtml(canonTitle)}" 와 매칭됩니다. 신규 발견으로 제출하면 점수·보상 30% 차감 (도전·보완 논문은 페널티 없음).</div>
    `;
  }

  return '';
}

function formatRewards(rewards) {
  const parts = [];
  if (rewards.degreeScore) parts.push(`학위 ${rewards.degreeScore}`);
  if (rewards.reputation) parts.push(`평판 ${rewards.reputation}`);
  if (rewards.researchFunds) parts.push(`연구비 ${rewards.researchFunds}G`);
  return parts.join(' · ') || '없음';
}

function openNamingInline(card, signature) {
  const entry = gameState.discoveries.bySignature[signature];
  if (!entry) return;

  // 이미 입력 필드가 열려 있으면 무시
  if (card.querySelector('.naming-input')) return;

  const inputRow = document.createElement('div');
  inputRow.style.cssText = 'margin-top: 6px; display: flex; gap: 4px;';
  inputRow.innerHTML = `
    <input class="naming-input" type="text" placeholder="현상 이름을 붙이세요..."
           value="${entry.playerName || ''}"
           style="
      flex: 1;
      background: rgba(0,0,0,0.5);
      border: 1px solid rgba(138,43,226,0.5);
      border-radius: 4px;
      color: #fff;
      padding: 4px 8px;
      font-size: 0.75rem;
      font-family: var(--font-data, monospace);
      outline: none;
    " />
    <button class="naming-save" style="
      background: rgba(138,43,226,0.6);
      border: none;
      border-radius: 4px;
      color: #fff;
      padding: 4px 10px;
      font-size: 0.75rem;
      cursor: pointer;
    ">저장</button>
  `;

  card.appendChild(inputRow);

  const input = inputRow.querySelector('.naming-input');
  const saveBtn = inputRow.querySelector('.naming-save');

  input.focus();

  const doSave = () => {
    const name = input.value.trim();
    if (name) {
      nameDiscovery(signature, name);
      refreshNotebookList();
    } else {
      inputRow.remove();
    }
  };

  saveBtn.addEventListener('click', doSave);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSave();
    if (e.key === 'Escape') inputRow.remove();
  });
}

// ── 자원 HUD 바 ──────────────────────────────────────────────────
function createResourceHUD() {
  const hud = document.createElement('div');
  hud.id = 'resource-hud';
  hud.className = 'top-status-bar';

  const phaseInfo = getCurrentPhaseInfo();
  hud.innerHTML = `
    <nav class="scene-nav" aria-label="현재 위치">
      <button class="scene-btn active" type="button" data-scene="lab">🜂 연구실</button>
      <button class="scene-btn" type="button" data-scene="expedition">🧭 답사</button>
      <button class="scene-btn" type="button" data-scene="inbox">📬 메일<span class="scene-btn-badge" id="scene-inbox-badge" hidden>0</span></button>
      <button class="scene-btn" type="button" data-scene="journal">📰 학계</button>
      <button class="scene-btn" type="button" data-scene="settings">⚙ 환경설정</button>
    </nav>
    <span class="hud-divider" aria-hidden="true"></span>
    <span class="hud-chip" title="연구비">💰 <span id="hud-funds">${gameState.resources.researchFunds}</span>G</span>
    <span class="hud-chip" title="명성">⭐ <span id="hud-rep">${gameState.resources.reputation}</span></span>
    <span class="hud-chip" title="학위 점수">🎓 <span id="hud-degree">${gameState.resources.degreeScore}</span></span>
    <span class="hud-divider" aria-hidden="true"></span>
    <span class="hud-chip" title="누적 발견">🔬 발견 <span id="hud-discoveries">0</span></span>
    <span class="hud-chip" title="수락된 논문">📜 논문 <span id="hud-papers">0</span></span>
    <span class="hud-chip" title="진행 중인 답사">🧭 답사 <span id="hud-expeditions">0</span></span>
    <span class="hud-chip" title="정설 불일치">⚠ 불일치 <span id="hud-mismatches">0</span></span>
    <span class="hud-spacer" aria-hidden="true"></span>
    <span class="hud-chip hud-phase-chip" title="학적 / 학기">🎓 <span id="hud-phase-name">${phaseInfo.name}</span> · <span id="hud-week">${gameState.progression.currentWeek}</span>주 <span id="hud-day">${gameState.progression.currentDay}</span>일</span>
    <button id="btn-next-day" class="hud-action" type="button" title="하루 진행">다음 날 ▶</button>
  `;

  const nextDayBtn = hud.querySelector('#btn-next-day');
  if (nextDayBtn) {
    nextDayBtn.addEventListener('click', () => {
      advanceDay(1);
      refreshResourceHUD();
      refreshExpeditionList();
    });
  }

  document.body.appendChild(hud);
}

export function refreshResourceHUD() {
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('hud-funds', gameState.resources.researchFunds);
  setText('hud-rep', gameState.resources.reputation);
  setText('hud-degree', gameState.resources.degreeScore);
  setText('hud-week', gameState.progression.currentWeek);
  setText('hud-day', gameState.progression.currentDay);
  setText('hud-phase-name', getCurrentPhaseInfo().name);
}

// ── 씬 시스템 (연구실 / 답사 / 학회) ──────────────────────────────
const LAB_SCENE_IDS = ['rift-container', 'magic-canvas', 'ui-layer'];

function setupScenes() {
  // 답사 씬 컨테이너 생성
  const expeditionScene = document.createElement('div');
  expeditionScene.id = 'scene-expedition';
  expeditionScene.className = 'app-scene';
  expeditionScene.dataset.scene = 'expedition';
  expeditionScene.innerHTML = `
    <div class="scene-frame">
      <header class="scene-header">
        <span class="scene-eyebrow">현장 조사</span>
        <h1>답사</h1>
        <p>학과 외부의 현장을 직접 답사하여 자료와 발견을 수집합니다.</p>
      </header>
      <div class="scene-body" id="scene-expedition-body"></div>
    </div>
  `;
  document.body.appendChild(expeditionScene);

  // archive 패널의 expedition-panel 을 답사 씬으로 이동
  const expPanel = document.getElementById('expedition-panel');
  const sceneBody = expeditionScene.querySelector('#scene-expedition-body');
  if (expPanel && sceneBody) {
    expPanel.style.display = '';
    sceneBody.appendChild(expPanel);
  }

  // archive 의 탐사 탭 버튼 숨김 (답사는 이제 별도 씬)
  const expTab = document.querySelector('.archive-tab[data-tab="expedition"]');
  if (expTab) expTab.style.display = 'none';

  // 메일함 씬
  const inboxScene = document.createElement('div');
  inboxScene.id = 'scene-inbox';
  inboxScene.className = 'app-scene';
  inboxScene.dataset.scene = 'inbox';
  inboxScene.innerHTML = `
    <div class="scene-frame inbox-frame">
      <header class="scene-header">
        <span class="scene-eyebrow">학내 통신</span>
        <h1>메일함</h1>
        <p>학과 사무실·지도교수·학회·후원 기관에서 발신한 공식 통신을 확인합니다.</p>
      </header>
      <div class="inbox-layout">
        <div class="inbox-list" id="inbox-list" aria-label="메일 목록"></div>
        <div class="inbox-detail" id="inbox-detail" aria-live="polite">
          <div class="inbox-detail-empty">왼쪽에서 메일을 선택하세요.</div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(inboxScene);

  // 환경설정 씬
  const settingsScene = document.createElement('div');
  settingsScene.id = 'scene-settings';
  settingsScene.className = 'app-scene';
  settingsScene.dataset.scene = 'settings';
  settingsScene.innerHTML = `
    <div class="scene-frame settings-frame">
      <header class="scene-header">
        <span class="scene-eyebrow">시스템</span>
        <h1>환경설정</h1>
        <p>저장 동작과 표시 옵션을 조정합니다. 변경 사항은 즉시 반영됩니다.</p>
      </header>
      <section class="settings-section">
        <h2 class="settings-section-title">저장</h2>
        <label class="settings-row" for="set-autosave">
          <span class="settings-row-text">
            <span class="settings-row-title">자동 저장</span>
            <span class="settings-row-desc">5분 간격 + 주요 행동 시 localStorage 에 자동 저장합니다.</span>
          </span>
          <input type="checkbox" id="set-autosave" class="settings-toggle">
        </label>
      </section>
      <section class="settings-section">
        <h2 class="settings-section-title">표시</h2>
        <label class="settings-row" for="set-blind">
          <span class="settings-row-text">
            <span class="settings-row-title">미공개 발견 가리기</span>
            <span class="settings-row-desc">아직 명명되지 않은 발견의 정식 이름·메커니즘을 숨깁니다.</span>
          </span>
          <input type="checkbox" id="set-blind" class="settings-toggle">
        </label>
        <label class="settings-row" for="set-debug">
          <span class="settings-row-text">
            <span class="settings-row-title">디버그: 내부 명칭 표시</span>
            <span class="settings-row-desc">개발용 룬/효과의 코드명을 함께 표시합니다.</span>
          </span>
          <input type="checkbox" id="set-debug" class="settings-toggle">
        </label>
      </section>
      <section class="settings-section settings-danger">
        <h2 class="settings-section-title">위험 영역</h2>
        <div class="settings-row settings-row-stack">
          <span class="settings-row-text">
            <span class="settings-row-title">전체 초기화</span>
            <span class="settings-row-desc">모든 저장 데이터(자원·진행도·발견·논문·메일 등)를 지우고 처음부터 다시 시작합니다. 되돌릴 수 없습니다.</span>
          </span>
          <button id="btn-reset-all" type="button" class="settings-danger-btn">전체 초기화</button>
        </div>
      </section>
    </div>
  `;
  document.body.appendChild(settingsScene);

  // 학계(저널) 씬
  const journalScene = document.createElement('div');
  journalScene.id = 'scene-journal';
  journalScene.className = 'app-scene';
  journalScene.dataset.scene = 'journal';
  journalScene.innerHTML = `
    <div class="scene-frame">
      <header class="scene-header">
        <span class="scene-eyebrow">학술 정기간행물</span>
        <h1>학계 저널</h1>
        <p>다른 학파·연구실이 발표한 논문을 열람합니다. 정설과 충돌하는 관측이 있다면 도전 논문 작성을 검토하세요.</p>
      </header>
      <div class="journal-grid" id="journal-grid"></div>
    </div>
  `;
  document.body.appendChild(journalScene);

  // 씬 전환 버튼 클릭 처리
  document.querySelectorAll('.scene-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.scene;
      if (!target || btn.disabled) return;
      setActiveScene(target);
    });
  });

  setActiveScene('lab');
}

function setActiveScene(name) {
  document.body.dataset.scene = name;

  LAB_SCENE_IDS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = name === 'lab' ? '' : 'none';
  });

  document.querySelectorAll('.app-scene').forEach((scene) => {
    scene.style.display = scene.dataset.scene === name ? '' : 'none';
  });

  document.querySelectorAll('.scene-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.scene === name);
  });

  if (name === 'expedition') refreshExpeditionList();
  if (name === 'inbox') refreshInbox();
  if (name === 'journal') refreshJournal();
  if (name === 'settings') refreshSettings();
}

// ── 환경설정 ──────────────────────────────────────────────────────
let settingsBound = false;

function refreshSettings() {
  const autosaveEl = document.getElementById('set-autosave');
  const blindEl = document.getElementById('set-blind');
  const debugEl = document.getElementById('set-debug');
  if (!autosaveEl || !blindEl || !debugEl) return;

  autosaveEl.checked = !!gameState.settings.autosave;
  blindEl.checked = !!gameState.settings.blindDiscovery;
  debugEl.checked = !!gameState.settings.debugShowLegacyNames;

  if (settingsBound) return;
  settingsBound = true;

  autosaveEl.addEventListener('change', () => {
    gameState.settings.autosave = autosaveEl.checked;
    saveGame();
    showToast(autosaveEl.checked ? '자동 저장 켜짐' : '자동 저장 꺼짐', 'info');
  });
  blindEl.addEventListener('change', () => {
    gameState.settings.blindDiscovery = blindEl.checked;
    saveGame();
    refreshNotebookList();
  });
  debugEl.addEventListener('change', () => {
    gameState.settings.debugShowLegacyNames = debugEl.checked;
    saveGame();
    refreshNotebookList();
    refreshDictionaryList();
  });

  const resetBtn = document.getElementById('btn-reset-all');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => handleResetAll(resetBtn));
  }
}

function handleResetAll(btn) {
  const confirmed = window.confirm(
    '모든 저장 데이터가 삭제됩니다.\n\n' +
    '· 자원 / 학적 / 발견 / 논문 / 답사 / 메일\n' +
    '· 정설 갱신 내역, 인용\n\n' +
    '되돌릴 수 없습니다. 정말 진행할까요?'
  );
  if (!confirmed) return;

  try {
    clearSave();
    resetState();
  } catch (err) {
    console.error('[Settings] reset 실패:', err);
    showToast('초기화 실패 — 콘솔 확인', 'error');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.textContent = '초기화 중…';
  }
  setTimeout(() => {
    window.location.reload();
  }, 200);
}

// ── 메일함 ────────────────────────────────────────────────────────
let selectedMailId = null;

function refreshInbox() {
  const listEl = document.getElementById('inbox-list');
  const detailEl = document.getElementById('inbox-detail');
  if (!listEl || !detailEl) return;

  const messages = getMessages();
  if (messages.length === 0) {
    listEl.innerHTML = '<div class="inbox-empty">받은 메일이 없습니다.</div>';
    detailEl.innerHTML = '<div class="inbox-detail-empty">받은 메일이 없습니다.</div>';
    return;
  }

  listEl.innerHTML = messages.map((m) => {
    const role = SENDER_ROLES[m.senderRole] || SENDER_ROLES.system;
    return `
      <button type="button" class="inbox-item${m.read ? '' : ' inbox-item-unread'}${selectedMailId === m.id ? ' inbox-item-active' : ''}"
              data-mail-id="${m.id}" style="--inbox-accent:${role.accent};">
        <span class="inbox-item-meta">
          <span class="inbox-item-sender">${escapeHtml(m.sender)}</span>
          <span class="inbox-item-when">${m.receivedWeek}주 ${m.receivedDay}일</span>
        </span>
        <span class="inbox-item-subject">${escapeHtml(m.subject)}</span>
      </button>
    `;
  }).join('');

  listEl.querySelectorAll('.inbox-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.mailId;
      selectMail(id);
    });
  });

  if (!selectedMailId || !messages.find((m) => m.id === selectedMailId)) {
    selectMail(messages[0].id);
  } else {
    renderMailDetail(messages.find((m) => m.id === selectedMailId));
  }
}

function selectMail(id) {
  selectedMailId = id;
  const mail = getMessages().find((m) => m.id === id);
  if (!mail) return;
  if (!mail.read) {
    markRead(id);
  }
  renderMailDetail(mail);
  document.querySelectorAll('#inbox-list .inbox-item').forEach((btn) => {
    btn.classList.toggle('inbox-item-active', btn.dataset.mailId === id);
    if (btn.dataset.mailId === id) btn.classList.remove('inbox-item-unread');
  });
}

function renderMailDetail(mail) {
  const detailEl = document.getElementById('inbox-detail');
  if (!detailEl || !mail) return;
  const role = SENDER_ROLES[mail.senderRole] || SENDER_ROLES.system;
  detailEl.innerHTML = `
    <div class="inbox-detail-header">
      <div class="inbox-detail-sender" style="color:${role.accent};">${escapeHtml(mail.sender)}</div>
      <div class="inbox-detail-when">${mail.receivedWeek}주 ${mail.receivedDay}일 수신</div>
    </div>
    <h2 class="inbox-detail-subject">${escapeHtml(mail.subject)}</h2>
    <div class="inbox-detail-body">${escapeHtml(mail.body).replace(/\n/g, '<br>')}</div>
  `;
}

function refreshInboxBadge() {
  const badge = document.getElementById('scene-inbox-badge');
  if (!badge) return;
  const unread = getUnreadCount();
  if (unread > 0) {
    badge.hidden = false;
    badge.textContent = unread > 99 ? '99+' : String(unread);
  } else {
    badge.hidden = true;
  }
}

function handleInboxChange() {
  refreshInboxBadge();
  if (document.body.dataset.scene === 'inbox') {
    refreshInbox();
  }
}

// ── 학계 저널 ──────────────────────────────────────────────────────
function refreshJournal() {
  const grid = document.getElementById('journal-grid');
  if (!grid) return;

  const papers = getJournalPapers();
  grid.innerHTML = papers.map((p) => {
    const canon = getCanonForPaper(p);
    const challengeable = !!(p.challengeable && canon?.challengeable);
    const cta = challengeable
      ? `<button class="journal-cta" type="button" data-paper-id="${p.id}">반박 초안 작성</button>`
      : `<span class="journal-cta journal-cta-disabled" title="${canon ? '현 정설은 반박 대상으로 분류되지 않습니다.' : '관련 정설이 없는 일반 논문입니다.'}">열람만 가능</span>`;
    return `
      <article class="journal-card">
        <div class="journal-card-meta">
          <span class="journal-card-society">${escapeHtml(p.society)}</span>
          <span class="journal-card-year">${p.year}년 · 인용 ${p.citations}</span>
        </div>
        <h3 class="journal-card-title">${escapeHtml(p.title)}</h3>
        <div class="journal-card-authors">${escapeHtml(p.authors.join(', '))}</div>
        <p class="journal-card-abstract">${escapeHtml(p.abstract)}</p>
        <div class="journal-card-conclusion"><strong>결론</strong> · ${escapeHtml(p.conclusion)}</div>
        ${canon ? `<div class="journal-card-canon">정설: ${escapeHtml(canon.title)}</div>` : ''}
        <div class="journal-card-actions">${cta}</div>
      </article>
    `;
  }).join('');

  grid.querySelectorAll('.journal-cta:not(.journal-cta-disabled)').forEach((btn) => {
    btn.addEventListener('click', () => {
      handleRebuttalRequest(btn.dataset.paperId);
    });
  });
}

function handleRebuttalRequest(paperId) {
  const paper = getJournalPapers().find((p) => p.id === paperId);
  if (!paper) return;
  const canon = getCanonForPaper(paper);
  setActiveScene('lab');
  showToast(
    `반박 대상: ${canon ? canon.title : paper.title} — 관측을 재현해 도전 논문 요건을 채우세요.`,
    'mismatch'
  );
}

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── 이벤트 핸들러 ─────────────────────────────────────────────────
function handleNewDiscovery({ signature, entry, analysis }) {
  showToast('미확인 반응 감지! 연구 노트를 확인하세요.', 'discovery', 4000);
  updateNotebookBadge();
}

function handleReproduction({ signature, entry, reproCount, analysis }) {
  const name = entry.playerName || '미확인 현상';
  if (reproCount >= 3 && entry.status === 'reproducible') {
    showToast(`"${name}" 재현 ${reproCount}회 달성! 논문 제출 가능`, 'paper', 5000);
  } else {
    showToast(`"${name}" 재현 성공 (${reproCount}/${entry.reproducibility.requiredForPaper})`, 'repro', 3000);
  }
  updateNotebookBadge();
}

function handleNamed({ signature, name }) {
  showToast(`현상 명명: "${name}"`, 'info', 2500);
}

function handleDictionaryUnlocked({ runeName }) {
  showToast(`기초 룬 도감 해금: ${runeName}`, 'discovery', 5000);
  const panel = document.getElementById('dictionary-panel');
  if (panel && panel.style.display !== 'none') {
    refreshDictionaryList();
  }
}

function handleCanonMismatch(mismatch) {
  showToast('학술 정설과 불일치하는 현상이 감지되었습니다.', 'warn', 4500);
  updatePaperBadge();
}

function handlePaperDrafted() {
  updatePaperBadge();
}

function handlePaperSubmitted() {
  showToast('논문이 제출되었습니다. 심사를 진행합니다.', 'paper', 3500);
  updatePaperBadge();
}

function handlePaperAccepted({ paper, review }) {
  const score = typeof review?.score === 'number' ? ` (${review.score}점)` : '';
  const penalty = review?.canonPenaltyApplied ? ' — 정설 검증 -30%' : '';
  showToast(`논문 수락: "${paper.title}"${score}${penalty}`, 'paper', 4500);
  refreshResourceHUD();
  updatePaperBadge();
}

function handlePaperRejected({ paper, review }) {
  const score = typeof review?.score === 'number' ? `[${review.score}점] ` : '';
  showToast(`논문 반려: ${score}${(review.reasons || ['심사 기준 미달']).join(' / ')}`, 'warn', 4500);
  updatePaperBadge();
}

function handleCanonRegistered({ paper, override, rewards }) {
  const newName = override?.newOfficialName || paper?.title || '정설';
  const reward = rewards
    ? ` (+학위 ${rewards.degreeScore} / +평판 ${rewards.reputation} / +연구비 ${rewards.researchFunds}G)`
    : '';
  showToast(`★ 정설 등재: "${newName}"${reward}`, 'discovery', 5500);
  refreshResourceHUD();
  updatePaperBadge();
}

function handleExpeditionStarted(expedition) {
  showToast(`탐사 출발: ${expedition.siteName}`, 'info', 3000);
}

function handleExpeditionCompleted(result) {
  showToast(`탐사 완료: ${result.finds.map((find) => find.title).join(', ')}`, 'discovery', 4500);
  refreshExpeditionList();
}

function handleEconomyUpdate() {
  refreshResourceHUD();
  refreshExpeditionList();
}

function handleScrollSold({ price }) {
  showToast(`스크롤 판매 완료: ${price}G`, 'paper', 3500);
  refreshResourceHUD();
}

function handleScheduleUpdate() {
  refreshResourceHUD();
  refreshExpeditionList();
}

function handlePhaseAdvanced({ phase, name }) {
  showToast(`Phase 상승: ${name} (Phase ${phase})`, 'discovery', 5000);
  refreshResourceHUD();
  refreshExpeditionList();
}

function handleMidtermTaken({ score, passed }) {
  showToast(`중간고사 ${passed ? '통과' : '미달'}: ${score}점`, passed ? 'repro' : 'warn', 3500);
}

function handleFinalTaken({ score, passed }) {
  showToast(`기말고사 ${passed ? '통과' : '미달'}: ${score}점`, passed ? 'repro' : 'warn', 3500);
}

function updateNotebookBadge() {
  const badge = document.getElementById('notebook-badge');
  if (!badge) return;
  const count = Object.keys(gameState.discoveries.bySignature).length;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'inline' : 'none';

  // 노트 패널이 보이고 있으면 갱신
  const panel = document.getElementById('notebook-panel');
  if (panel && panel.style.display !== 'none') {
    refreshNotebookList();
  }
  updatePaperBadge();
  refreshExpeditionList();
}

function updatePaperBadge() {
  const badge = document.getElementById('paper-badge');
  if (!badge) return;
  const eligible = getEligiblePaperPlans().length;
  const mismatches = getCanonMismatches().length;
  const count = eligible + mismatches;
  badge.textContent = count;
  badge.style.display = count > 0 ? 'inline' : 'none';

  const panel = document.getElementById('paper-panel');
  if (panel && panel.style.display !== 'none') {
    refreshPaperList();
  }
}

function renderPhaseRequirement(requirements) {
  if (!requirements) return '다음 승급 조건 없음';
  return `학위 ${requirements.minDegreeScore}, 논문 ${requirements.minAcceptedPapers}, 발견 ${requirements.requiredDiscoveryCount}, 시험 ${requirements.requiredExamPassed ? '필수' : '선택'}`;
}

// ── CSS 주입 (토스트 애니메이션) ──────────────────────────────────
const style = document.createElement('style');
style.textContent = `
  @keyframes toastSlideIn {
    from {
      transform: translateY(-20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  .archive-tab {
    background: rgba(20, 10, 40, 0.6);
    border: 1px solid rgba(255,255,255,0.15);
    border-bottom: none;
    border-radius: 4px 4px 0 0;
    color: #888;
    padding: 4px 10px;
    font-family: var(--font-data, 'Share Tech Mono', monospace);
    font-size: 0.7rem;
    cursor: pointer;
    transition: all 0.2s;
  }
  .archive-tab:hover {
    color: #ccc;
    background: rgba(40, 20, 60, 0.6);
  }
  .archive-tab.active {
    color: #e0d0ff;
    background: rgba(60, 20, 100, 0.4);
    border-color: rgba(138, 43, 226, 0.4);
  }

  .discovery-card:hover {
    border-color: rgba(138, 43, 226, 0.7) !important;
  }
  .discovery-card.repro-ready {
    border-color: rgba(0, 200, 100, 0.4) !important;
  }
  .discovery-card.repro-ready:hover {
    border-color: rgba(0, 255, 130, 0.7) !important;
  }

  #notebook-list::-webkit-scrollbar {
    width: 4px;
  }
  #notebook-list::-webkit-scrollbar-thumb {
    background: rgba(138, 43, 226, 0.3);
    border-radius: 2px;
  }
`;
document.head.appendChild(style);

function selectStyle() {
  return `
    background: rgba(0,0,0,0.45);
    color: #fff;
    border: 1px solid rgba(0,180,255,0.28);
    border-radius: 4px;
    padding: 4px 6px;
    font-size: 0.72rem;
    font-family: var(--font-data, monospace);
  `;
}

function buttonStyle(theme = 'blue') {
  const themes = {
    blue: {
      bg: 'rgba(0, 180, 255, 0.18)',
      color: '#d7ecff',
      border: 'rgba(0, 180, 255, 0.35)',
    },
    teal: {
      bg: 'rgba(0, 200, 180, 0.16)',
      color: '#c8fff2',
      border: 'rgba(0, 200, 180, 0.32)',
    },
    gold: {
      bg: 'rgba(255, 191, 71, 0.14)',
      color: '#ffe4a8',
      border: 'rgba(255, 191, 71, 0.28)',
    },
    coral: {
      bg: 'rgba(255, 120, 100, 0.14)',
      color: '#ffd4c8',
      border: 'rgba(255, 120, 100, 0.28)',
    },
    purple: {
      bg: 'rgba(138, 43, 226, 0.18)',
      color: '#ecd6ff',
      border: 'rgba(138, 43, 226, 0.34)',
    },
    neutral: {
      bg: 'rgba(255, 255, 255, 0.08)',
      color: '#ddd',
      border: 'rgba(255, 255, 255, 0.16)',
    },
  };
  const palette = themes[theme] || themes.blue;
  return `
    background: ${palette.bg};
    color: ${palette.color};
    border: 1px solid ${palette.border};
    border-radius: 4px;
    padding: 4px 8px;
    font-size: 0.72rem;
    cursor: pointer;
    font-family: var(--font-data, monospace);
  `;
}
