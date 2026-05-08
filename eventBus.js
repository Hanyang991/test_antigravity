/**
 * Event Bus — 시스템 간 느슨한 연결을 위한 pub/sub 허브.
 *
 * 모든 게임 시스템(발견, 논문, 균열, 경제 등)은 서로 직접 import하지 않고
 * eventBus를 통해 이벤트를 주고받는다.
 *
 * 주요 이벤트:
 *   'magic:analyzed'   — 분석 완료 시 (payload: MagicAnalysis)
 *   'magic:cast'       — 마법 주입 시 (payload: { analysis, week, day })
 *   'discovery:new'    — 새 현상 발견 시
 *   'discovery:reproduced' — 재현 성공 시
 *   'paper:submitted'  — 논문 제출 시
 *   'paper:accepted'   — 논문 수락 시
 *   'week:ticked'      — 주차 경과 시
 */

const listeners = new Map();

/**
 * 이벤트 리스너 등록.
 * @param {string} name  이벤트 이름
 * @param {Function} fn  콜백
 */
export function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
}

/**
 * 이벤트 리스너 해제.
 * @param {string} name  이벤트 이름
 * @param {Function} fn  등록했던 콜백
 */
export function off(name, fn) {
  const set = listeners.get(name);
  if (set) set.delete(fn);
}

/**
 * 이벤트 발행. 등록된 모든 리스너에 payload를 전달한다.
 * @param {string} name     이벤트 이름
 * @param {*}      payload  전달할 데이터
 */
export function emit(name, payload) {
  const set = listeners.get(name);
  if (!set) return;
  for (const fn of set) {
    try {
      fn(payload);
    } catch (err) {
      console.error(`[EventBus] Error in listener for '${name}':`, err);
    }
  }
}
