/**
 * 학술 정설(Canon) 데이터.
 *
 * 정설은 게임 세계에서 학계가 이미 받아들인 현상 해석이다. 일부는 정확하고
 * 일부는 부정확하며, challengeable=true 인 항목은 도전 논문(`type:'challenge'`) 의
 * 표적이 될 수 있다. 도전 논문이 학회에서 수락되면 academicCanon 측 override 슬롯이
 * 채워지고, UI는 해당 정설 옆에 "○○○에 의해 갱신됨" 표시를 띄운다.
 *
 * 필드:
 *   - legacyHint.{mainRune, radical, position}  분석 결과의 legacy meaning 과 비교
 *   - officialObservables.{dynamics, instabilityBand}  관측값 비교 기준
 *   - isCorrect / actualSignature                       내부 정답 (UI 노출 금지)
 *   - challengeable                                     도전 논문 가능 여부
 *   - discoveredBy / year / notes                       UI 인용용 메타
 */
export const CANON_DATA = [
  {
    id: 'canon_001',
    title: '봉인된 달 정설',
    expectedSignature: null,
    legacyHint: {
      mainRune: '원(○)',
      radical: '이사(|)',
      position: 'middle',
    },
    officialName: '봉인된 달',
    officialObservables: {
      dynamics: '갇힘(침묵)',
      instabilityBand: 35,
    },
    isCorrect: false,
    actualSignature: null,
    challengeable: true,
    discoveredBy: '오르무스 아카데미',
    year: 891,
    notes: '원본 논문 소실. 사본만 존재.',
  },
  {
    id: 'canon_002',
    title: '가시 방벽 정설',
    expectedSignature: null,
    legacyHint: {
      mainRune: '알기즈(Y)',
      radical: '대지(ㅡ)',
      position: 'below',
    },
    officialName: '가시 방벽',
    officialObservables: {
      dynamics: '방어(정지)',
      instabilityBand: 20,
    },
    isCorrect: true,
    actualSignature: null,
    challengeable: false,
    discoveredBy: '기초 마법 학회',
    year: 917,
    notes: '초급 결계 정설로 널리 전파됨.',
  },
  {
    id: 'canon_003',
    title: '마그마 융합 정설',
    expectedSignature: null,
    legacyHint: {
      mainRune: '열기(△)',
      radical: '대지(ㅡ)',
      position: 'below',
    },
    officialName: '마그마 융합',
    officialObservables: {
      dynamics: '분출(상승)',
      instabilityBand: 55,
    },
    isCorrect: true,
    actualSignature: null,
    challengeable: true,
    discoveredBy: '열역학 마법 학회',
    year: 944,
    notes: '바탕재에 따라 결과 편차가 큰 편.',
  },
  {
    id: 'canon_004',
    title: '서리 결정 정설',
    expectedSignature: null,
    legacyHint: {
      mainRune: '하갈라즈(*)',
      radical: '대지(ㅡ)',
      position: 'below',
    },
    officialName: '서리 결정',
    officialObservables: {
      dynamics: '냉각(하강)',
      instabilityBand: 25,
    },
    isCorrect: false,
    actualSignature: null,
    challengeable: true,
    discoveredBy: '열역학 마법 학회',
    year: 962,
    notes: '논문 인용은 많지만 1차 자료가 부재. 도전 후보.',
  },
  {
    id: 'canon_005',
    title: '심연 종소리 정설',
    expectedSignature: null,
    legacyHint: {
      mainRune: '나우디즈(=)',
      radical: '이사(|)',
      position: 'middle',
    },
    officialName: '심연 종소리',
    officialObservables: {
      dynamics: '공명(반복)',
      instabilityBand: 65,
    },
    isCorrect: false,
    actualSignature: null,
    challengeable: true,
    discoveredBy: '금서 마법 학회',
    year: 988,
    notes: '비공개 회람본만 존재. 외부 인용 시 평판 위험.',
  },
];
