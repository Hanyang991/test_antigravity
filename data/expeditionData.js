export const EXPEDITION_SITES = [
  {
    id: 'site_ruins_of_ignar',
    name: '이그나르 폐허',
    phase: 1,
    cost: { funds: 200, days: 3 },
    region: 'fire',
    possibleFinds: [
      { type: 'rune_fragment', title: '룬 파편', content: '상단이 갈라진 수직선 형태의 흔적.', probability: 0.45 },
      { type: 'ancient_record', title: '고문헌 단편 #14-A', content: '열기와 (판독불가)의 결합은 균열을 밀어낸다.', probability: 0.35 },
      { type: 'material', title: '정령의 수면 샘플', content: '물 계열 바탕재 연구 자료를 확보했다.', probability: 0.20 },
    ],
  },
  {
    id: 'site_basal_library',
    name: '현무암 지하서고',
    phase: 2,
    cost: { funds: 420, days: 4 },
    region: 'earth',
    possibleFinds: [
      { type: 'failed_note', title: '실패 실험 노트', content: '봉인 계열이 과열 없이 유지되는 조건 메모.', probability: 0.40 },
      { type: 'canon_evidence', title: '정설 원본 사본', content: '오래된 정설의 관측치가 일부 위조되었을 가능성.', probability: 0.25 },
      { type: 'material', title: '흑요석 석판 표본', content: '안정성이 높은 바탕재 사용법이 기록되어 있다.', probability: 0.35 },
    ],
  },
  {
    id: 'site_veiled_orchard',
    name: '장막의 과수정원',
    phase: 3,
    cost: { funds: 700, days: 5 },
    region: 'life',
    possibleFinds: [
      { type: 'ancient_record', title: '억압된 논문 초록', content: '문장 술식이 결실을 맺는 배치 패턴에 대한 기록.', probability: 0.40 },
      { type: 'rune_fragment', title: '세계수 파편', content: '에이와즈 계열 룬 해석에 도움이 되는 궤적.', probability: 0.30 },
      { type: 'material', title: '정제 수액 잉크', content: '고위 문장식의 재현률을 높이는 특수 재료.', probability: 0.30 },
    ],
  },
];
