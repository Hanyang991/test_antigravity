import { consumeTime } from './schedule.js';

/**
 * 액션별 시간 비용(일).
 *
 * 시스템 디자인:
 *   - 게임 내 모든 "액션"이 즉시 처리되면 학기 시간 흐름이 의미를 잃는다.
 *   - 따라서 자원 영향이 큰 작업(논문 작성, 과제 신청, 계약 체결, 스크롤 판매)은
 *     consumeForAction 헬퍼를 통해 schedule.consumeTime 으로 시간을 흘려
 *     그 사이의 큐 이벤트(논문 심사, 탐험 귀환, 주간 수익 정산 등)를 같이 dispatch 한다.
 *   - 각 핸들러는 결과 객체에 `timeConsumed` 필드를 채워 UI 가 "X일 소비" 안내를 띄운다.
 *
 * 0 또는 음수 값을 가진 액션은 시간이 흐르지 않는 즉시 액션이다.
 *
 * 추가 액션을 도입할 때는 이 표에만 등록하면 되도록 키 이름을 안정적으로 유지한다.
 */
export const ACTION_COSTS = {
  createPaperDraft: 2,
  submitPaper: 0,
  applyForGrant: 1,
  signContract: 1,
  sellScroll: 1,
  registerCanon: 5,
  // PR-J: NPC 학회지 논문에 대한 반박 게시. 반박은 즉시 결과(채택 또는 오반박)
  // 가 결정되지만 결과를 학계에 알리는 데 5일이 소비된다 — registerCanon 과 동일.
  submitRebuttal: 5,
  castMagic: 0,
};

/**
 * 등록된 액션의 시간 비용을 schedule 에 적용한다.
 *
 * @param {keyof typeof ACTION_COSTS} actionName  ACTION_COSTS 의 키
 * @returns {number}  실제로 소비한 일수 (0 이면 즉시 액션이라 schedule 호출이 일어나지 않음)
 */
export function consumeForAction(actionName) {
  const days = ACTION_COSTS[actionName];
  if (typeof days !== 'number' || days <= 0) return 0;
  consumeTime(days, { source: `action:${actionName}` });
  return days;
}
