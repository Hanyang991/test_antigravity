/**
 * 학회지에 게재되는 NPC 논문 풀.
 *
 * 매 주 학회 별 회지가 출간되며, 등록된 publication 중 releaseWeek 가 도래한
 * 항목이 학내 메일함과 학회 패널에 노출된다. 플레이어는 각 publication 에
 * 대해 5일을 들여 반박(rebuttal) 논문을 제출할 수 있다.
 *
 * 반박 결과는 publication.truthful 만 보고 결정된다 — 점수 채점 없음:
 *   - truthful=true  : NPC 의 주장이 실제로 옳음. 반박 → 페널티 (오반박)
 *   - truthful=false : NPC 의 주장이 실제로 틀림. 반박 → 보너스 (정확한 반박)
 *
 * 필드:
 *   - id              : 안정 ID
 *   - society         : PAPER_SOCIETIES key
 *   - title / author  : UI 표시용
 *   - targetCanonId   : 어떤 정설을 다루는 논문인지. 정설 ID 와 매칭 (없으면 null)
 *   - stance          : 'defends' (정설 옹호) | 'challenges' (정설 도전) | 'standalone'
 *   - truthful        : 이 논문의 결론이 게임 세계 기준 사실에 부합하는가
 *   - abstract        : 메일/카드 요약 (한 단락)
 *   - releaseWeek     : 학기 N주차에 출간 (1-16). 같은 주에 여러 학회 동시 출간 가능.
 */

export const SOCIETY_PUBLICATIONS = [
  // === Week 1~4: 기초 학회지 / 가벼운 도입부 ===
  {
    id: 'pub_basic_001',
    society: 'basic_magic_society',
    title: '가시 방벽 정설의 재현성 — 200건 분석',
    author: '리오넬 카르마',
    targetCanonId: 'canon_002', // canon.isCorrect=true (정확한 정설)
    stance: 'defends',
    truthful: true,
    abstract: '알기즈(Y) 위에 대지(ㅡ)를 받친 표준 결계의 재현 200건을 종합한다. 불안정성 20% 부근에서 일관된 방어 정지 거동이 관측되며, 기존 가시 방벽 정설이 학사 단계에서 충분히 안정적임을 재확인한다.',
    releaseWeek: 2,
  },
  {
    id: 'pub_basic_002',
    society: 'basic_magic_society',
    title: '봉인된 달 정설 옹호 — 현지 사본 비교',
    author: '엘레나 두마',
    targetCanonId: 'canon_001', // canon.isCorrect=false (잘못된 정설)
    stance: 'defends',
    truthful: false,
    abstract: '오르무스 891년 봉인된 달 정설은 원본이 소실되었으나 다섯 사본이 일관된 갇힘(침묵) 거동을 기록한다. 본 논문은 이를 근거로 정설 신뢰도를 재상정한다 — 사본 간 차이는 필사 오류로 설명 가능하다.',
    releaseWeek: 4,
  },

  // === Week 4~8: 열역학 학회지 / 정설 도전과 옹호 ===
  {
    id: 'pub_thermo_001',
    society: 'thermodynamic_magic_society',
    title: '서리 결정 정설 재해석 — 냉각이 아닌 결정화',
    author: '하인츠 발덴',
    targetCanonId: 'canon_004', // canon.isCorrect=false
    stance: 'challenges',
    truthful: true,
    abstract: '하갈라즈(*)·대지(ㅡ) 결합이 냉각이 아닌 격자 결정화로 작동함을 5종 바탕재에 걸쳐 시연한다. 962년 정설의 instabilityBand 25 는 결정화 미발현 구간만을 본 것으로 추정된다. 정설 폐기를 권고한다.',
    releaseWeek: 5,
  },
  {
    id: 'pub_thermo_002',
    society: 'thermodynamic_magic_society',
    title: '마그마 융합 정설 검증 — 분출 곡선 적합도',
    author: '카탈리나 페로',
    targetCanonId: 'canon_003', // canon.isCorrect=true
    stance: 'defends',
    truthful: true,
    abstract: '열기(△)·대지(ㅡ) 아래 받침 구조 70건의 분출 거동이 944년 정설의 상승 모형과 χ² 적합도 0.92 로 일치함을 보고한다. 바탕재별 편차는 정설이 명시한 ±15% 범위 안에 모두 들어 있다.',
    releaseWeek: 7,
  },
  {
    id: 'pub_thermo_003',
    society: 'thermodynamic_magic_society',
    title: '서리 결정 정설 옹호 — 비판자에 대한 반론',
    author: '오스카 림네스',
    targetCanonId: 'canon_004', // canon.isCorrect=false
    stance: 'defends',
    truthful: false,
    abstract: '근래 발덴의 결정화 가설을 검토한다. 그의 5종 바탕재 표본은 통제 실패가 명백하며, 962년 서리 결정 정설의 냉각(하강) 거동이 여전히 유효함을 6 학회 컨센서스로 확인한다.',
    releaseWeek: 8,
  },

  // === Week 7~12: 고위 학회지 / 정설 검증의 정밀화 ===
  {
    id: 'pub_high_001',
    society: 'high_magic_society',
    title: '마그마 융합 정설은 부분 모형이다',
    author: '미카엘 솔른',
    targetCanonId: 'canon_003', // canon.isCorrect=true
    stance: 'challenges',
    truthful: false,
    abstract: '944년 정설은 단순 상승 모형으로 환원되어 있으나, 압력 의존성을 무시한 결과 본 학회의 고위급 재현 시 22%의 편차가 발생한다. 새 다변수 모형을 제안하며 기존 정설의 폐기를 주장한다.',
    releaseWeek: 9,
  },
  {
    id: 'pub_high_002',
    society: 'high_magic_society',
    title: '심연 종소리 정설은 실험적으로 재현 불가능하다',
    author: '소피아 브렌',
    targetCanonId: 'canon_005', // canon.isCorrect=false
    stance: 'challenges',
    truthful: true,
    abstract: '988년 비공개 회람본의 심연 종소리 정설은 본 학회 5개 분과 어디에서도 instabilityBand 65 의 공명(반복) 거동이 재현되지 않았다. 외부 인용을 즉시 중단하고 정설 인준을 철회할 것을 권고한다.',
    releaseWeek: 11,
  },

  // === Week 11~16: 금서 학회지 / 위험한 옹호 / 학기 마무리 ===
  {
    id: 'pub_forbidden_001',
    society: 'forbidden_magic_society',
    title: '봉인된 달 정설 — 봉인 거동의 실험적 확장',
    author: '익명 (회람본 #IV-7)',
    targetCanonId: 'canon_001', // canon.isCorrect=false
    stance: 'defends',
    truthful: false,
    abstract: '봉인된 달 정설의 갇힘(침묵) 거동을 instabilityBand 35 부근에서 확장 관측했다 — 기존 정설은 옳다. 비공개 회람본 한정 공개. 외부 인용 시 학회 봉인선 위반.',
    releaseWeek: 12,
  },
  {
    id: 'pub_forbidden_002',
    society: 'forbidden_magic_society',
    title: '심연 종소리 정설 옹호 — 회람본 외부 유출 경고',
    author: '익명 (회람본 #IX-2)',
    targetCanonId: 'canon_005', // canon.isCorrect=false
    stance: 'defends',
    truthful: false,
    abstract: '근래 고위 학회의 심연 종소리 정설 철회 요구는 본 학회의 봉인 절차를 무시한 것이다. 988년 회람본의 공명(반복) 거동은 외부에 노출되지 않은 환경에서 일관되게 재현된다.',
    releaseWeek: 14,
  },

  // === Week 13~16: 기초 학회지 / 학기 말 부담스럽지 않은 검증 논문 ===
  {
    id: 'pub_basic_003',
    society: 'basic_magic_society',
    title: '가시 방벽 정설 도전 — 4명 연구자의 새 데이터',
    author: '보리스 칼만',
    targetCanonId: 'canon_002', // canon.isCorrect=true
    stance: 'challenges',
    truthful: false,
    abstract: '4개 학부 공동 측정 결과 가시 방벽의 instabilityBand 가 35 까지 상승할 수 있음을 보고한다. 917년 정설의 안정성 주장은 더 이상 유효하지 않다 — 사실은 거짓이다.',
    releaseWeek: 13,
  },
  {
    id: 'pub_thermo_004',
    society: 'thermodynamic_magic_society',
    title: '마그마 융합 정설의 압력 의존성',
    author: '율리아 빈크만',
    targetCanonId: 'canon_003', // canon.isCorrect=true
    stance: 'defends',
    truthful: true,
    abstract: '944년 정설을 압력 변수와 함께 재검토했고, 정설 본래의 분출(상승) 거동이 0.5–3 atm 의 표준 작업 범위 안에서 모두 유효함을 확인했다. 정설은 여전히 살아있다.',
    releaseWeek: 15,
  },
];

/**
 * 반박 결과 보상/페널티 — 점수와 무관하게 truthful 플래그만 본다.
 *
 * 페널티는 음수로 직접 적용하며, 보상은 학회 보상의 ~1.5배 수준으로
 * 잡아 "잘못된 정설을 노출한 뒤 리스크 감수"가 합리적 선택이 되도록 설계.
 */
export const REBUTTAL_OUTCOMES = {
  // truthful=true 인 논문을 잘못 반박한 경우 (오반박)
  wrongful: {
    degreeScore: -10,
    reputation: -8,
    researchFunds: 0,
  },
  // truthful=false 인 논문을 정확히 반박한 경우 (정확한 반박)
  exposed: {
    degreeScore: 30,
    reputation: 18,
    researchFunds: 1000,
  },
};
