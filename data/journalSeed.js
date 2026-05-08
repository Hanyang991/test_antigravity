/**
 * Journal seed papers.
 * NPC/타 학파가 발표한 정설·연구 논문 시드 데이터.
 * 각 항목은 학계(저널) 씬에서 카드로 노출되며, 일부는 정설 데이터(canonData)에 연결되어
 * '반박 초안 작성' CTA 로 도전 논문 흐름을 시작할 수 있다.
 */

export const JOURNAL_PAPERS = [
  {
    id: 'jp_canon_001',
    title: '봉인된 달 — 침묵 동역학의 재확인',
    authors: ['리시아 베르낙', '오르무스 아카데미'],
    society: '오르무스 아카데미',
    year: 891,
    citations: 27,
    abstract:
      '원(○)을 중심으로 이사(|) 부수가 결합한 시그니처는 갇힘 동역학과 약 35의 불안정성을 보인다. 본 논문은 이를 봉인된 달이라 명명한다.',
    conclusion: '관측 가능 동역학: 갇힘(침묵) · 불안정성 35 ± 5',
    canonRef: 'canon_001',
    challengeable: true,
  },
  {
    id: 'jp_canon_002',
    title: '가시 방벽 정설 — 초급 결계의 표준화',
    authors: ['기초 마법 학회'],
    society: '기초 마법 학회',
    year: 917,
    citations: 84,
    abstract:
      '알기즈(Y)와 대지(ㅡ) 부수의 결합은 정지 방어 동역학과 안정성 80% 이상을 보장한다. 본 논문은 이를 초급 결계의 표준 정설로 제안한다.',
    conclusion: '권장 표준: 정지(방어) · 불안정성 20 이하',
    canonRef: 'canon_002',
    challengeable: false,
  },
  {
    id: 'jp_canon_003',
    title: '마그마 융합 — 바탕재 의존성에 대한 보고',
    authors: ['카르빈 토르브', '열역학 마법 학회'],
    society: '열역학 마법 학회',
    year: 944,
    citations: 51,
    abstract:
      '열기(△)+대지(ㅡ) 시그니처에서 바탕재 변화가 결과 동역학에 미치는 영향을 보고한다. 본 논문은 이를 마그마 융합으로 통칭한다.',
    conclusion: '주된 동역학: 분출(상승) · 불안정성 55 ± 10',
    canonRef: 'canon_003',
    challengeable: true,
  },
  {
    id: 'jp_misc_010',
    title: '문장급 시그니처에서의 조사(助辭) 처리',
    authors: ['엘레나 카드미아'],
    society: '고위 마법 학회',
    year: 953,
    citations: 12,
    abstract:
      '다중 룬 문장에서 부수와 본룬 사이의 조사 토큰이 해석에 미치는 영향을 통계적으로 분석한다.',
    conclusion: '조사 누락 시 문장 등급이 단어급으로 강등되는 비율이 41%.',
    canonRef: null,
    challengeable: false,
  },
  {
    id: 'jp_misc_011',
    title: '도전 논문 작성을 위한 관측 가이드',
    authors: ['편집부'],
    society: '고위 마법 학회',
    year: 955,
    citations: 6,
    abstract:
      '정설과 충돌하는 관측을 도전 논문으로 정리하기 위한 데이터·증거 요건을 안내한다.',
    conclusion:
      '재현 10회 이상 + 정설 동역학·불안정성 차이의 명시 + 단어급 이상 시그니처가 권장.',
    canonRef: null,
    challengeable: false,
  },
];
