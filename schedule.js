import { gameState } from './gameState.js';
import { emit } from './eventBus.js';
import { tickExpeditions } from './expedition.js';
import { tickEconomyWeek } from './economy.js';
import { checkPhaseProgress } from './phase.js';
import { saveGame } from './saveLoad.js';

export function advanceDay(days = 1) {
  const completedExpeditions = [];

  for (let i = 0; i < days; i++) {
    gameState.progression.currentDay += 1;
    if (gameState.progression.currentDay > 7) {
      gameState.progression.currentDay = 1;
      gameState.progression.currentWeek += 1;
      const weeklyIncome = tickEconomyWeek();
      emit('week:ticked', {
        week: gameState.progression.currentWeek,
        weeklyIncome,
      });
    }

    emit('day:ticked', {
      week: gameState.progression.currentWeek,
      day: gameState.progression.currentDay,
    });

    completedExpeditions.push(...tickExpeditions());
  }

  const phaseResult = checkPhaseProgress();
  saveGame();
  return { completedExpeditions, phaseResult };
}
