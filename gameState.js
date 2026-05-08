/**
 * Game State — 장기 진행 상태의 단일 출처 (Single Source of Truth).
 *
 * main.js의 `state`는 캔버스/분석기 순간 상태만 관리한다.
 * 이 파일은 새로고침 후에도 유지되어야 하는 모든 장기 데이터를 담는다.
 *
 * 구조는 arcane_sandbox_detailed_implementation_spec.md §371~435 기준.
 */

export const gameState = {
  version: 2,

  resources: {
    researchFunds: 500,
    reputation: 0,
    degreeScore: 0,
    mentalHealth: 100,
    stamina: 100,
  },

  progression: {
    currentPhase: 1,
    currentWeek: 1,
    currentDay: 1,
    warnings: 0,
    exams: {
      midtermPassed: false,
      finalPassed: false,
    },
    unlockedRunes: [],
    unlockedMaterials: ['parchment'],
    unlockedEquipment: [],
  },

  discoveries: {
    /** @type {Object<string, DiscoveryEntry>} signature → entry */
    bySignature: {},
    /** @type {string[]} 최근 발견된 signature (최신 먼저) */
    recentSignatures: [],
  },

  papers: {
    drafts: [],
    submitted: [],
    accepted: [],
    rejected: [],
    disputes: [],
  },

  expeditions: {
    active: [],
    completed: [],
    unlockedSiteIds: [],
  },

  economy: {
    activeGrants: [],
    activeContracts: [],
    scrollOrders: [],
    weeklyIncome: [],
  },

  academic: {
    canonOverrides: {},
    canonMismatches: [],
    npcRelations: {},
    citations: [],
  },

  inbox: {
    messages: [],
  },

  settings: {
    blindDiscovery: true,
    debugShowLegacyNames: false,
    autosave: true,
  },
};

// 디버그용 전역 노출
if (typeof window !== 'undefined') {
  window.__ARCANE_STATE__ = gameState;
}

/**
 * gameState를 직렬화 가능한 plain object로 복사해 반환.
 * saveLoad.js에서 사용한다.
 */
export function serializeState() {
  return JSON.parse(JSON.stringify(gameState));
}

/**
 * 저장된 데이터로 gameState를 덮어씌운다.
 * 기존 키 구조를 유지하면서 저장된 값만 반영한다 (신규 필드 보호).
 * @param {Object} saved  localStorage에서 파싱한 객체
 */
export function hydrateState(saved) {
  if (!saved || typeof saved !== 'object') return;
  deepMerge(gameState, saved);
}

/**
 * gameState를 초기값으로 리셋한다.
 */
export function resetState() {
  const fresh = {
    version: 2,
    resources: { researchFunds: 500, reputation: 0, degreeScore: 0, mentalHealth: 100, stamina: 100 },
    progression: { currentPhase: 1, currentWeek: 1, currentDay: 1, warnings: 0, exams: { midtermPassed: false, finalPassed: false }, unlockedRunes: [], unlockedMaterials: ['parchment'], unlockedEquipment: [] },
    discoveries: { bySignature: {}, recentSignatures: [] },
    papers: { drafts: [], submitted: [], accepted: [], rejected: [], disputes: [] },
    expeditions: { active: [], completed: [], unlockedSiteIds: [] },
    economy: { activeGrants: [], activeContracts: [], scrollOrders: [], weeklyIncome: [] },
    academic: { canonOverrides: {}, canonMismatches: [], npcRelations: {}, citations: [] },
    inbox: { messages: [] },
    settings: { blindDiscovery: true, debugShowLegacyNames: false, autosave: true },
  };
  deepMerge(gameState, fresh);
}

// 재귀적 병합. target의 키 구조를 유지하면서 source 값을 덮어씀.
function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    if (!(key in target)) {
      target[key] = source[key];
    } else if (
      typeof target[key] === 'object' && target[key] !== null &&
      typeof source[key] === 'object' && source[key] !== null &&
      !Array.isArray(target[key]) && !Array.isArray(source[key])
    ) {
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
}
