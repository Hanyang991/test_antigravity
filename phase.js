import { PHASE_REQUIREMENTS } from './data/questData.js';
import { gameState } from './gameState.js';
import { emit } from './eventBus.js';
import { saveGame } from './saveLoad.js';

const PHASE_LABELS = {
  1: '석사 1년차',
  2: '석사 졸업반',
  3: '박사 과정',
  4: '교수 임용',
};

export function getCurrentPhaseInfo() {
  const phase = gameState.progression.currentPhase;
  return {
    phase,
    name: PHASE_LABELS[phase] || `Phase ${phase}`,
    requirements: PHASE_REQUIREMENTS[phase + 1] || null,
  };
}

export function takeMidtermExam() {
  const score = calculateExamScore();
  const passed = score >= 80;
  ensureExamState();
  gameState.progression.exams.midtermPassed = passed;
  if (score < 50) gameState.progression.warnings += 1;
  emit('exam:midtermTaken', { score, passed });
  saveGame();
  return { score, passed, grade: score >= 80 ? 'A' : score >= 50 ? 'C' : 'F' };
}

export function takeFinalExam() {
  const score = calculateExamScore(true);
  const passed = score >= 70;
  ensureExamState();
  gameState.progression.exams.finalPassed = passed;
  if (!passed) gameState.progression.warnings += 1;
  emit('exam:finalTaken', { score, passed });
  saveGame();
  return { score, passed };
}

export function checkPhaseProgress() {
  ensureExamState();
  const nextPhase = gameState.progression.currentPhase + 1;
  const requirements = PHASE_REQUIREMENTS[nextPhase];
  if (!requirements) return { promoted: false, reason: '최종 Phase입니다.' };

  const acceptedPapers = gameState.papers.accepted.length;
  const discoveryCount = Object.keys(gameState.discoveries.bySignature).length;
  const examsPassed = gameState.progression.exams.midtermPassed && gameState.progression.exams.finalPassed;

  const eligible =
    gameState.resources.degreeScore >= requirements.minDegreeScore &&
    acceptedPapers >= requirements.minAcceptedPapers &&
    discoveryCount >= requirements.requiredDiscoveryCount &&
    (!requirements.requiredExamPassed || examsPassed);

  if (!eligible) {
    return {
      promoted: false,
      reason: '승급 조건 미충족',
      progress: {
        degreeScore: gameState.resources.degreeScore,
        acceptedPapers,
        discoveryCount,
        examsPassed,
      },
    };
  }

  gameState.progression.currentPhase = nextPhase;
  if (nextPhase >= 2 && !gameState.progression.unlockedMaterials.includes('water')) {
    gameState.progression.unlockedMaterials.push('water');
  }
  if (nextPhase >= 3 && !gameState.progression.unlockedMaterials.includes('obsidian')) {
    gameState.progression.unlockedMaterials.push('obsidian');
  }

  emit('phase:advanced', { phase: nextPhase, name: PHASE_LABELS[nextPhase] });
  saveGame();
  return { promoted: true, phase: nextPhase, name: PHASE_LABELS[nextPhase] };
}

function calculateExamScore(isFinal = false) {
  const discoveryCount = Object.keys(gameState.discoveries.bySignature).length;
  const acceptedPapers = gameState.papers.accepted.length;
  const base = isFinal ? 45 : 55;
  return Math.min(100, base + discoveryCount * 7 + acceptedPapers * 8 + Math.floor(gameState.resources.degreeScore / 20));
}

function ensureExamState() {
  if (!gameState.progression.exams) {
    gameState.progression.exams = {
      midtermPassed: false,
      finalPassed: false,
    };
  }
}
