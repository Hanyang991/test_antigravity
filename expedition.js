import { EXPEDITION_SITES } from './data/expeditionData.js';
import { gameState } from './gameState.js';
import { emit } from './eventBus.js';
import { saveGame } from './saveLoad.js';

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
  const active = {
    expeditionId: site.id,
    siteName: site.name,
    phase: site.phase,
    region: site.region,
    startedAt: {
      week: gameState.progression.currentWeek,
      day: gameState.progression.currentDay,
    },
    endsAtDayIndex: getCurrentDayIndex() + site.cost.days,
    remainingDays: site.cost.days,
  };
  gameState.expeditions.active.push(active);
  emit('expedition:started', active);
  saveGame();
  return { ok: true, expedition: active };
}

export function tickExpeditions() {
  const completed = [];
  const nowIndex = getCurrentDayIndex();
  gameState.expeditions.active = gameState.expeditions.active.filter((active) => {
    active.remainingDays = Math.max(active.endsAtDayIndex - nowIndex, 0);
    if (active.endsAtDayIndex > nowIndex) return true;
    completed.push(completeExpedition(active.expeditionId));
    return false;
  });
  return completed.filter(Boolean);
}

export function completeExpedition(expeditionId) {
  const active = gameState.expeditions.active.find((item) => item.expeditionId === expeditionId)
    || gameState.expeditions.completed.find((item) => item.expeditionId === expeditionId);
  const site = EXPEDITION_SITES.find((item) => item.id === expeditionId);
  if (!active || !site) return null;

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
