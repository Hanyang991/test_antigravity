import { EXPEDITION_SITES } from './data/expeditionData.js';
import { gameState } from './gameState.js';
import { emit, on as onBus } from './eventBus.js';
import { saveGame } from './saveLoad.js';
import { enqueueEvent } from './schedule.js';

// schedule 큐가 dispatch한 'expedition:return' 이벤트를 처리하는 동안 완료된
// 답사 결과를 모았다가 advanceDay/tickExpeditions에 한 번에 돌려준다. 이 버퍼는
// 같은 advanceDay 호출 내에서만 의미가 있고, 매 호출 끌마다 비워진다.
let _completionBuffer = [];

export function getExpeditionSites() {
  return EXPEDITION_SITES.filter((site) => site.phase <= gameState.progression.currentPhase);
}

export function startExpedition(siteId) {
  const site = EXPEDITION_SITES.find((item) => item.id === siteId);
  if (!site) return { ok: false, reason: '탐사지를 찾을 수 없습니다.' };
  if (site.phase > gameState.progression.currentPhase) {
    return { ok: false, reason: '현재 Phase에서 접근할 수 없는 탐사지입니다.' };
  }
  if (gameState.resources.researchFunds < site.cost.funds) {
    return { ok: false, reason: '연구비가 부족합니다.' };
  }

  gameState.resources.researchFunds -= site.cost.funds;
  const days = site.cost.days;
  const active = {
    expeditionId: site.id,
    siteName: site.name,
    phase: site.phase,
    region: site.region,
    startedAt: {
      week: gameState.progression.currentWeek,
      day: gameState.progression.currentDay,
    },
    endsAtDayIndex: getCurrentDayIndex() + days,
    remainingDays: days,
  };
  gameState.expeditions.active.push(active);
  emit('expedition:started', active);

  // M8: 자기만의 카운터로 만료 판정하지 않고 schedule 큐에 귀환 이벤트를 예약한다.
  // consumeTime/advanceDay가 큐를 dispatch하면서 'expedition:return'을 fire하면
  // 모듈 하단의 onBus 리스너가 completeExpedition을 호출한다.
  enqueueEvent({
    delayDays: days,
    type: 'expedition:return',
    payload: { expeditionId: site.id },
    label: `${site.name} 답사 귀환`,
  });

  saveGame();
  return { ok: true, expedition: active };
}

/**
 * advanceDay 루프가 매일 호출. 'expedition:return' 이벤트가 dispatch되어
 * completeExpedition을 거쳐 _completionBuffer에 쌓인 결과를 비워서 돌려주고,
 * 활성 답사들의 remainingDays(UI 카운트다운)를 현재 day 기준으로 갱신한다.
 *
 * 호출 순서: schedule.js의 advanceDay에서 dispatchDueEvents가 먼저 돌고
 * tickExpeditions가 그 다음에 호출되어야 같은 날 귀환분이 누락되지 않는다.
 */
export function tickExpeditions() {
  const drained = _completionBuffer;
  _completionBuffer = [];

  const nowIndex = getCurrentDayIndex();
  for (const active of gameState.expeditions.active) {
    const ends = typeof active.endsAtDayIndex === 'number' ? active.endsAtDayIndex : nowIndex;
    active.remainingDays = Math.max(ends - nowIndex, 0);
  }

  return drained;
}

export function completeExpedition(expeditionId) {
  const activeIndex = gameState.expeditions.active.findIndex(
    (item) => item.expeditionId === expeditionId,
  );
  const active = activeIndex >= 0
    ? gameState.expeditions.active[activeIndex]
    : gameState.expeditions.completed.find((item) => item.expeditionId === expeditionId);
  const site = EXPEDITION_SITES.find((item) => item.id === expeditionId);
  if (!active || !site) return null;

  // 활성 답사 목록에서 제거 — 기존엔 tickExpeditions의 filter에서 제거됐지만,
  // 이벤트 기반으로 옮긴 뒤엔 completeExpedition이 직접 책임진다.
  if (activeIndex >= 0) {
    gameState.expeditions.active.splice(activeIndex, 1);
  }

  const result = {
    expeditionId: site.id,
    completedAt: {
      week: gameState.progression.currentWeek,
      day: gameState.progression.currentDay,
    },
    finds: drawFinds(site),
  };

  result.finds.forEach((find) => {
    if (find.type === 'material') {
      if (find.title.includes('정령의 수면') && !gameState.progression.unlockedMaterials.includes('water')) {
        gameState.progression.unlockedMaterials.push('water');
      }
      if (find.title.includes('흑요석') && !gameState.progression.unlockedMaterials.includes('obsidian')) {
        gameState.progression.unlockedMaterials.push('obsidian');
      }
    }
  });

  gameState.expeditions.completed.unshift(result);
  emit('expedition:completed', result);
  saveGame();
  return result;
}

// 모듈 로드 시 한 번 등록되는 리스너. schedule.js가 큐에서 'expedition:return'
// 이벤트를 dispatch하면 즉시 completeExpedition을 호출해 결과를 버퍼에 쌓고,
// 같은 advanceDay 사이클의 tickExpeditions에서 호출자에게 돌려준다.
onBus('expedition:return', (event) => {
  const id = event?.payload?.expeditionId;
  if (!id) return;
  const result = completeExpedition(id);
  if (result) _completionBuffer.push(result);
});

function drawFinds(site) {
  const roll = Math.random();
  let cumulative = 0;
  let chosen = null;
  for (const find of site.possibleFinds) {
    cumulative += find.probability;
    if (roll <= cumulative) {
      chosen = {
        type: find.type,
        title: find.title,
        content: find.content,
        addedToArchive: find.type === 'ancient_record' || find.type === 'canon_evidence',
      };
      break;
    }
  }
  if (!chosen && site.possibleFinds.length > 0) {
    const fallback = site.possibleFinds[site.possibleFinds.length - 1];
    chosen = {
      type: fallback.type,
      title: fallback.title,
      content: fallback.content,
      addedToArchive: fallback.type === 'ancient_record' || fallback.type === 'canon_evidence',
    };
  }
  return chosen ? [chosen] : [];
}

function getCurrentDayIndex() {
  return ((gameState.progression.currentWeek - 1) * 7) + gameState.progression.currentDay;
}
