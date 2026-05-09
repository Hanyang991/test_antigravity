import { CONTRACT_OFFERS, GRANT_OFFERS } from './data/economyData.js';
import { gameState } from './gameState.js';
import { getDiscovery } from './discoverySystem.js';
import { emit } from './eventBus.js';
import { saveGame } from './saveLoad.js';
import { consumeForAction } from './actionCosts.js';

const GRADE_BONUS = {
  single_rune: 0,
  compound_word: 50,
  phrase: 120,
  sentence: 300,
  incantation: 800,
};

export function getGrantOffers() {
  return GRANT_OFFERS.filter((offer) => offer.phase <= gameState.progression.currentPhase);
}

export function getContractOffers() {
  return CONTRACT_OFFERS.filter((offer) => offer.phase <= gameState.progression.currentPhase);
}

export function applyForGrant(grantId) {
  const grant = GRANT_OFFERS.find((item) => item.id === grantId);
  if (!grant) return { ok: false, reason: '과제를 찾을 수 없습니다.' };
  if (gameState.economy.activeGrants.some((item) => item.id === grantId)) {
    return { ok: false, reason: '이미 진행 중인 과제입니다.' };
  }

  const active = {
    ...grant,
    acceptedAtWeek: gameState.progression.currentWeek,
    remainingWeeks: grant.durationWeeks,
  };
  gameState.economy.activeGrants.push(active);
  gameState.resources.researchFunds += grant.payout;
  gameState.resources.reputation += grant.reputationDelta || 0;
  emit('economy:grantAccepted', active);
  saveGame();
  const timeConsumed = consumeForAction('applyForGrant');
  return { ok: true, grant: active, timeConsumed };
}

export function signContract(contractId) {
  const contract = CONTRACT_OFFERS.find((item) => item.id === contractId);
  if (!contract) return { ok: false, reason: '계약을 찾을 수 없습니다.' };
  if (gameState.economy.activeContracts.some((item) => item.id === contractId)) {
    return { ok: false, reason: '이미 체결된 계약입니다.' };
  }

  const active = {
    ...contract,
    acceptedAtWeek: gameState.progression.currentWeek,
    remainingWeeks: contract.durationWeeks,
  };
  gameState.economy.activeContracts.push(active);
  gameState.resources.researchFunds += contract.upfront;
  emit('economy:contractSigned', active);
  saveGame();
  const timeConsumed = consumeForAction('signContract');
  return { ok: true, contract: active, timeConsumed };
}

export function canSellScroll(analysis, discovery) {
  return analysis?.observables?.instability <= 25
    && (discovery?.reproducibility?.count || 0) >= 3
    && discovery?.status !== 'disputed';
}

export function sellScroll(signature, analysis) {
  const discovery = getDiscovery(signature);
  if (!discovery) return { ok: false, reason: '발견 기록이 없습니다.' };
  if (!canSellScroll(analysis, discovery)) {
    return { ok: false, reason: '스크롤 판매 조건을 충족하지 못했습니다.' };
  }

  const price = calculateScrollPrice(analysis, discovery);
  gameState.resources.researchFunds += price;
  gameState.economy.scrollOrders.unshift({
    id: `scroll_${Date.now().toString(36)}`,
    signature,
    soldAtWeek: gameState.progression.currentWeek,
    price,
  });
  emit('economy:scrollSold', { signature, price });
  saveGame();
  const timeConsumed = consumeForAction('sellScroll');
  return { ok: true, price, timeConsumed };
}

export function tickEconomyWeek() {
  let weeklyIncome = 0;

  gameState.economy.activeGrants = gameState.economy.activeGrants.filter((grant) => {
    grant.remainingWeeks -= 1;
    return grant.remainingWeeks > 0;
  });

  gameState.economy.activeContracts = gameState.economy.activeContracts.filter((contract) => {
    weeklyIncome += contract.weeklyIncome;
    contract.remainingWeeks -= 1;
    return contract.remainingWeeks > 0;
  });

  if (weeklyIncome > 0) {
    gameState.resources.researchFunds += weeklyIncome;
    gameState.economy.weeklyIncome.unshift({
      week: gameState.progression.currentWeek,
      amount: weeklyIncome,
    });
  }

  emit('economy:weekProcessed', { weeklyIncome });
  saveGame();
  return weeklyIncome;
}

function calculateScrollPrice(analysis, discovery) {
  const resonance = analysis?.observables?.resonance || 0;
  const instability = analysis?.observables?.instability || 0;
  const grade = analysis?.sentence?.grade || 'single_rune';
  const noveltyBonus = discovery?.reproducibility?.count >= 10 ? 120 : 40;
  return Math.max(50, Math.round(100 + resonance * 2 - instability * 3 + (GRADE_BONUS[grade] || 0) + noveltyBonus));
}
