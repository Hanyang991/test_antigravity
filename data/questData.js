/**
 * Phase 진급 요구치.
 *
 * 키는 *진입할* 단계 번호(nextPhase). checkPhaseProgress 는 currentPhase+1 에 해당하는
 * 항목을 조회한다.
 *
 * Phase 5는 "석학(원로)" 단계로, 자기 발견을 정설로 등재할 수 있는 권한
 * (gameState.progression.canRegisterCanon) 이 해금된다 — phase.js 의 promotion 분기
 * 참고. requirement 수치는 박사 임용(Phase 4) 이후 한참 누적이 더 필요한 수준으로 잡았다.
 */
export const PHASE_REQUIREMENTS = {
  2: {
    minDegreeScore: 100,
    minAcceptedPapers: 2,
    requiredExamPassed: true,
    requiredDiscoveryCount: 3,
  },
  3: {
    minDegreeScore: 220,
    minAcceptedPapers: 4,
    requiredExamPassed: true,
    requiredDiscoveryCount: 6,
  },
  4: {
    minDegreeScore: 420,
    minAcceptedPapers: 7,
    requiredExamPassed: true,
    requiredDiscoveryCount: 10,
  },
  5: {
    minDegreeScore: 700,
    minAcceptedPapers: 12,
    requiredExamPassed: true,
    requiredDiscoveryCount: 15,
  },
};
