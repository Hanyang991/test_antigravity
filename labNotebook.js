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
import { getCanonMismatches } from './academicCanon.js';
import { createPaperDraft, getEligiblePaperPlans, getSocieties, submitPaper } from './paperSystem.js';
import { getExpeditionSites, startExpedition } from './expedition.js';
import { applyForGrant, getGrantOffers, getContractOffers, sellScroll, signContract } from './economy.js';
import { advanceDay } from './schedule.js';
import { getCurrentPhaseInfo, takeFinalExam, takeMidtermExam } from './phase.js';

// ── 초기화 ────────────────────────────────────────────────────────
let initialized = false;

export function initLabNotebook() {
  if (initialized) return;
  initialized = true;

  // DOM 요소 생성
  createToastContainer();
  createNotebookTab();
  createResourceHUD();

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

  updateNotebookBadge();
  updatePaperBadge();
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
    <button class="archive-tab" data-tab="papers">논문 <span id="paper-badge" style="
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
      else if (tab === 'papers') refreshPaperList();
      else if (tab === 'expedition') refreshExpeditionList();
      else if (tab === 'dictionary') refreshDictionaryList();
    }
  });
}

function refreshDictionaryList() {
  const list = document.getElementById('dictionary-list');
  if (!list) return;

  const unlocked = gameState.progression.unlockedRunes || [];
  if (unlocked.length === 0) {
    list.innerHTML = `
      <div style="grid-column: 1 / -1; color: #666; font-size: 0.8rem; text-align: center; padding: 20px 0;">
        아직 해금된 룬이 없습니다.<br>지도교수의 과제를 완료하여 도감을 채우세요.
      </div>
    `;
    return;
  }

  list.innerHTML = unlocked.map(runeName => `
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

  if (eligible.length === 0 && accepted.length === 0 && rejected.length === 0) {
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
        <div style="display:grid; grid-template-columns: 1fr 1fr auto; gap:6px; margin-top:8px;">
          <select class="paper-type" style="${selectStyle()}">${types}</select>
          <select class="paper-society" style="${selectStyle()}">${societyOptions}</select>
          <button class="paper-submit" style="${buttonStyle()}">작성·제출</button>
        </div>
      </div>
    `;
  }).join('');

  const resultHtml = renderPaperHistory(accepted, rejected, mismatches);

  list.innerHTML = `
    ${eligibleHtml || ''}
    ${resultHtml}
  `;

  list.querySelectorAll('.paper-card').forEach((card) => {
    const button = card.querySelector('.paper-submit');
    const typeEl = card.querySelector('.paper-type');
    const societyEl = card.querySelector('.paper-society');
    button.addEventListener('click', () => {
      const draft = createPaperDraft({
        discoverySignature: card.dataset.sig,
        type: typeEl.value,
        targetSociety: societyEl.value,
      });
      if (draft) submitPaper(draft.id);
      refreshPaperList();
    });
  });
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
    <div style="background: rgba(20,20,40,0.55); border:1px solid rgba(255,255,255,0.08); border-radius:6px; padding:8px 10px; margin-bottom:10px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="color:#e6d7ff; font-size:0.82rem; font-weight:600;">${phaseInfo.name}</span>
        <span style="color:#9a8cbc; font-size:0.68rem;">Phase ${phaseInfo.phase}</span>
      </div>
      <div style="display:flex; gap:6px; margin-top:8px;">
        <button id="btn-advance-day" style="${buttonStyle('neutral')}">하루 진행</button>
        <button id="btn-midterm" style="${buttonStyle('neutral')}">중간고사</button>
        <button id="btn-final" style="${buttonStyle('neutral')}">기말고사</button>
      </div>
      <div style="color:#8d8d9a; font-size:0.68rem; margin-top:8px;">
        다음 조건: ${renderPhaseRequirement(phaseInfo.requirements)}
      </div>
    </div>
    <div style="color:#9de8ff; font-size:0.74rem; font-family:var(--font-data, monospace);">진행 중 탐사</div>
    ${activeHtml}
    <div style="color:#9de8ff; font-size:0.74rem; font-family:var(--font-data, monospace); margin-top:10px;">탐사지</div>
    ${sitesHtml || '<div style="color:#666;font-size:0.72rem;padding:6px 0;">현재 해금된 탐사지가 없습니다.</div>'}
    <div style="color:#ffe4a8; font-size:0.74rem; font-family:var(--font-data, monospace); margin-top:10px;">연구비</div>
    ${grantsHtml}
    ${contractsHtml}
    <div style="margin-top:10px;">
      <button id="btn-sell-scroll" style="${buttonStyle('purple')}">현재 현상 스크롤 판매</button>
    </div>
    <div style="color:#98f6d7; font-size:0.74rem; font-family:var(--font-data, monospace); margin-top:10px;">최근 탐사 결과</div>
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

  const advanceDayBtn = document.getElementById('btn-advance-day');
  if (advanceDayBtn) {
    advanceDayBtn.addEventListener('click', () => {
      advanceDay(1);
      refreshExpeditionList();
      refreshResourceHUD();
    });
  }
  const midtermBtn = document.getElementById('btn-midterm');
  if (midtermBtn) {
    midtermBtn.addEventListener('click', () => takeMidtermExam());
  }
  const finalBtn = document.getElementById('btn-final');
  if (finalBtn) {
    finalBtn.addEventListener('click', () => takeFinalExam());
  }
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
  const acceptedHtml = accepted.slice(0, 4).map((paper) => `
    <div style="padding:6px 0; border-top:1px solid rgba(255,255,255,0.08);">
      <div style="color:#a8ffd1; font-size:0.78rem;">수락: ${paper.title}</div>
      <div style="color:#7aa18b; font-size:0.68rem;">${paper.review?.society?.name || ''}</div>
    </div>
  `).join('');
  const rejectedHtml = rejected.slice(0, 4).map((paper) => `
    <div style="padding:6px 0; border-top:1px solid rgba(255,255,255,0.08);">
      <div style="color:#ffb6b6; font-size:0.78rem;">반려: ${paper.title}</div>
      <div style="color:#b68c8c; font-size:0.68rem;">${(paper.review?.reasons || []).join(' / ')}</div>
    </div>
  `).join('');
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

  hud.innerHTML = `
    <span class="hud-chip" title="연구비">💰 <span id="hud-funds">${gameState.resources.researchFunds}</span>G</span>
    <span class="hud-chip" title="명성">⭐ <span id="hud-rep">${gameState.resources.reputation}</span></span>
    <span class="hud-chip" title="학위 점수">🎓 <span id="hud-degree">${gameState.resources.degreeScore}</span></span>
    <span class="hud-divider" aria-hidden="true"></span>
    <span class="hud-chip" title="누적 발견">🔬 발견 <span id="hud-discoveries">0</span></span>
    <span class="hud-chip" title="수락된 논문">📜 논문 <span id="hud-papers">0</span></span>
    <span class="hud-chip" title="진행 중인 답사">🧭 답사 <span id="hud-expeditions">0</span></span>
    <span class="hud-chip" title="정설 불일치">⚠ 불일치 <span id="hud-mismatches">0</span></span>
    <span class="hud-divider" aria-hidden="true"></span>
    <span class="hud-chip" title="현재 일정">📅 <span id="hud-week">${gameState.progression.currentWeek}</span>주 <span id="hud-day">${gameState.progression.currentDay}</span>일</span>
    <span class="hud-chip" title="현재 Phase">🜁 Phase <span id="hud-phase">${gameState.progression.currentPhase}</span></span>
  `;

  document.body.appendChild(hud);
}

export function refreshResourceHUD() {
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('hud-funds', gameState.resources.researchFunds);
  setText('hud-rep', gameState.resources.reputation);
  setText('hud-degree', gameState.resources.degreeScore);
  setText('hud-week', gameState.progression.currentWeek);
  setText('hud-day', gameState.progression.currentDay);
  setText('hud-phase', gameState.progression.currentPhase);
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

function handlePaperAccepted({ paper }) {
  showToast(`논문 수락: "${paper.title}"`, 'paper', 4500);
  refreshResourceHUD();
  updatePaperBadge();
}

function handlePaperRejected({ paper, review }) {
  showToast(`논문 반려: ${(review.reasons || ['심사 기준 미달']).join(' / ')}`, 'warn', 4500);
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
