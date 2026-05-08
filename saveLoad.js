/**
 * Save / Load — localStorage 기반 게임 상태 영속화.
 *
 * 저장 키: 'arcane-sandbox.v2'
 * 자동 저장: main.js에서 5분 간격 + cast/clear 시점에 호출.
 */

import { gameState, serializeState, hydrateState } from './gameState.js';

const STORAGE_KEY = 'arcane-sandbox.v2';

/**
 * 현재 gameState를 localStorage에 저장한다.
 */
export function saveGame() {
  try {
    const data = serializeState();
    data._savedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    console.log('[SaveLoad] 게임 저장 완료');
  } catch (err) {
    console.error('[SaveLoad] 저장 실패:', err);
  }
}

/**
 * localStorage에서 gameState를 복원한다.
 * 저장 데이터가 없으면 아무 동작도 하지 않는다.
 * @returns {boolean} 로드 성공 여부
 */
export function loadGame() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      console.log('[SaveLoad] 저장된 데이터 없음 — 신규 시작');
      return false;
    }
    const saved = JSON.parse(raw);
    // 버전 마이그레이션
    if (saved.version === 1) {
      migrateV1toV2(saved);
    }
    hydrateState(saved);
    console.log('[SaveLoad] 게임 로드 완료');
    return true;
  } catch (err) {
    console.error('[SaveLoad] 로드 실패:', err);
    return false;
  }
}

/**
 * 저장 데이터를 삭제하고 gameState를 초기화한다.
 */
export function clearSave() {
  localStorage.removeItem(STORAGE_KEY);
  console.log('[SaveLoad] 저장 데이터 삭제됨');
}

/**
 * 자동 저장 타이머를 시작한다.
 * @param {number} intervalMs  저장 간격 (기본 5분)
 * @returns {number}  타이머 ID (clearInterval로 해제 가능)
 */
export function startAutosave(intervalMs = 5 * 60 * 1000) {
  return setInterval(() => {
    if (gameState.settings.autosave) {
      saveGame();
    }
  }, intervalMs);
}

// v1 → v2 마이그레이션 (현재는 구조 차이가 크지 않아 최소 처리)
function migrateV1toV2(saved) {
  saved.version = 2;
  if (!saved.discoveries) {
    saved.discoveries = { bySignature: {}, recentSignatures: [] };
  }
  if (!saved.settings) {
    saved.settings = { blindDiscovery: true, debugShowLegacyNames: false, autosave: true };
  }
}
