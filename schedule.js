import { gameState } from './gameState.js';
import { emit } from './eventBus.js';
import { tickExpeditions } from './expedition.js';
import { tickEconomyWeek } from './economy.js';
import { checkPhaseProgress, takeMidtermExam, takeFinalExam } from './phase.js';
import { saveGame } from './saveLoad.js';

// 한 학기 = 16주 가정. 8주차 중간고사, 16주차 기말고사를 지도교수가 자동 시행.
const MIDTERM_WEEK = 8;
const FINAL_WEEK = 16;

function maybeAutoExams() {
  const exams = gameState.progression.exams || (gameState.progression.exams = {
    midtermPassed: false,
    finalPassed: false,
  });
  const week = gameState.progression.currentWeek;
  if (week === MIDTERM_WEEK && !exams.midtermPassed) {
    takeMidtermExam();
  } else if (week === FINAL_WEEK && !exams.finalPassed) {
    takeFinalExam();
  }
}

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
      maybeAutoExams();
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
