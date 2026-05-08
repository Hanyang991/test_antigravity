export const GRANT_OFFERS = [
  {
    id: 'grant_foundation_basic',
    name: '기초 마법 장려금',
    phase: 1,
    payout: 300,
    durationWeeks: 2,
    reputationDelta: 2,
    description: '안정적인 기초 실험을 장려하는 소형 연구비.',
  },
  {
    id: 'grant_thermo_fieldwork',
    name: '열역학 현장 연구비',
    phase: 2,
    payout: 700,
    durationWeeks: 3,
    reputationDelta: 5,
    description: '고열/불안정 계열 관측을 요구하는 중형 과제.',
  },
];

export const CONTRACT_OFFERS = [
  {
    id: 'contract_barrier_maintenance',
    name: '결계 유지 산학 협력',
    phase: 1,
    upfront: 250,
    weeklyIncome: 90,
    durationWeeks: 3,
    description: '안정적 결계 술식을 납품하는 계약.',
  },
  {
    id: 'contract_rift_survey',
    name: '균열 측량 위탁',
    phase: 2,
    upfront: 450,
    weeklyIncome: 160,
    durationWeeks: 4,
    description: '위험하지만 수익이 높은 균열 분석 계약.',
  },
];
