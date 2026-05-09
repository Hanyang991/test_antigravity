import { gameState } from './gameState.js';
import { emit } from './eventBus.js';
import { tickExpeditions } from './expedition.js';
import { tickEconomyWeek } from './economy.js';
import { checkPhaseProgress, takeMidtermExam, takeFinalExam } from './phase.js';
import { saveGame } from './saveLoad.js';

// 한 학기 = 16주 가정. 8주차 중간고사, 16주차 기말고사를 지도교수가 자동 시행.
const MIDTERM_WEEK = 8;
const FINAL_WEEK = 16;

function getDayIndex(week, day) {
  return ((week - 1) * 7) + day;
}

function getCurrentDayIndex() {
  return getDayIndex(gameState.progression.currentWeek, gameState.progression.currentDay);
}

function ensureScheduleSlot() {
  if (!gameState.schedule || typeof gameState.schedule !== 'object') {
    gameState.schedule = { events: [], lastDayIndex: 0 };
  }
  if (!Array.isArray(gameState.schedule.events)) gameState.schedule.events = [];
  if (typeof gameState.schedule.lastDayIndex !== 'number') {
    gameState.schedule.lastDayIndex = getCurrentDayIndex();
  }
  return gameState.schedule;
}

/**
 * 일정 이벤트 큐에 이벤트를 등록한다. atDayIndex(절대) 혹은 delayDays(상대) 중 하나로 지정.
 * 같은 날에 여러 이벤트가 있어도 atDayIndex 순서대로 dispatch한다.
 *
 * @param {Object} options
 * @param {number} [options.atDayIndex]   절대 dayIndex (week-1)*7 + day
 * @param {number} [options.delayDays]    현재 시점 기준 N일 후 (atDayIndex 미지정 시 사용)
 * @param {string} options.type           'paper:review_due' / 'expedition:return' / 'lecture' 등
 * @param {Object} [options.payload]      이벤트 핸들러가 사용하는 부속 데이터
 * @param {string} [options.label]        UI 표시용 짧은 설명
 * @returns {Object} 등록된 이벤트
 */
export function enqueueEvent({ atDayIndex, delayDays, type, payload = null, label = '' }) {
  const slot = ensureScheduleSlot();
  const now = getCurrentDayIndex();
  const target = typeof atDayIndex === 'number'
    ? atDayIndex
    : now + Math.max(1, Number(delayDays) || 1);

  const event = {
    id: `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
    type,
    payload,
    label,
    atDayIndex: target,
    enqueuedAt: now,
    fired: false,
  };
  slot.events.push(event);
  slot.events.sort((a, b) => a.atDayIndex - b.atDayIndex);
  emit('schedule:enqueued', event);
  return event;
}

/**
 * 큐에서 미발생 이벤트만 반환 (UI 표시용).
 */
export function getPendingEvents() {
  const slot = ensureScheduleSlot();
  return slot.events.filter((e) => !e.fired);
}

/**
 * 지정 dayIndex 이전(<=)에 도래한 모든 이벤트를 시간순으로 fire한다.
 * 큐 자체에는 fired:true로 남기고, 다음 dispatch에서는 건너뛴다.
 */
function dispatchDueEvents(dayIndex) {
  const slot = ensureScheduleSlot();
  const due = slot.events.filter((e) => !e.fired && e.atDayIndex <= dayIndex);
  due.sort((a, b) => a.atDayIndex - b.atDayIndex);
  const fired = [];
  for (const event of due) {
    event.fired = true;
    event.firedAt = dayIndex;
    emit('schedule:event', event);
    emit(event.type, event);
    fired.push(event);
  }
  return fired;
}

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
  ensureScheduleSlot();
  const completedExpeditions = [];
  const firedEvents = [];

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

    const nowIndex = getCurrentDayIndex();
    emit('day:ticked', {
      week: gameState.progression.currentWeek,
      day: gameState.progression.currentDay,
    });

    completedExpeditions.push(...tickExpeditions());
    firedEvents.push(...dispatchDueEvents(nowIndex));
    gameState.schedule.lastDayIndex = nowIndex;
  }

  const phaseResult = checkPhaseProgress();
  saveGame();
  return { completedExpeditions, firedEvents, phaseResult };
}

/**
 * 시간 진행 자동화 — 어떤 액션이 N일을 소비할 때 호출자가 이 함수를 호출하면
 * advanceDay와 동일한 효과로 시간이 흐르고 그 사이의 모든 큐 이벤트가 dispatch된다.
 * UI의 수동 버튼이 아니라 게임 시스템이 시간을 진행시키는 채널.
 *
 * @param {number} days
 * @param {{ source?: string }} [options]
 */
export function consumeTime(days, options = {}) {
  const result = advanceDay(days);
  emit('time:consumed', {
    days,
    source: options.source || 'system',
    week: gameState.progression.currentWeek,
    day: gameState.progression.currentDay,
  });
  return result;
}
