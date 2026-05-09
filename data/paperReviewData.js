/**
 * 학회별 심사 메타데이터.
 *
 * 각 학회는 다음을 갖는다:
 *   - id / name              : 식별자와 표시 이름
 *   - rewards                : 수락 시 자원 보상 (degreeScore / reputation / researchFunds)
 *   - acceptThreshold        : score >= 이 값이면 수락 (0~100)
 *   - rejectThreshold        : score <  이 값이면 단순 반려.
 *                              그 사이 구간은 challenge/refinement에 한해 'disputed'로 큐잉,
 *                              아니면 reject로 떨어진다.
 *   - challengeable          : challenge 논문을 받는 학회인가
 *   - reviewerVoice          : 심사위원 코멘트 템플릿. {accepted, disputed, rejected} key별로
 *                              짧은 한 줄 평이 들어가며 reviewPaper가 score/사유와 함께 전달.
 *
 * UI(논문 결과 패널)는 review.reviewerVoice 를 그대로 노출해 학회 색깔을 살린다.
 *
 * 보상은 reviewPaper에서 score 가중치(grade/repro/instability fitness)에 따라
 * 추가 modulation 될 수 있으며, 여기 정의된 값은 base reward이다.
 */
export const PAPER_SOCIETIES = {
  basic_magic_society: {
    id: 'basic_magic_society',
    name: '기초 마법 학회',
    rewards: { degreeScore: 15, reputation: 8, researchFunds: 300 },
    acceptThreshold: 60,
    rejectThreshold: 40,
    challengeable: false,
    reviewerVoice: {
      accepted: '기초 학회 심사위원: 명쾌한 재현입니다. 학사 기록에 등재합니다.',
      disputed: '기초 학회 심사위원: 본 학회 권한 밖의 주장이라 판단을 보류합니다.',
      rejected: '기초 학회 심사위원: 추가 재현과 안정성 보강이 선행되어야 합니다.',
    },
  },
  thermodynamic_magic_society: {
    id: 'thermodynamic_magic_society',
    name: '열역학 마법 학회',
    rewards: { degreeScore: 25, reputation: 15, researchFunds: 800 },
    acceptThreshold: 65,
    rejectThreshold: 40,
    challengeable: true,
    reviewerVoice: {
      accepted: '열역학 학회 심사위원: 바탕재 의존도가 모형과 들어맞습니다. 채택합니다.',
      disputed: '열역학 학회 심사위원: 정설을 흔들 수치이지만, 재현 표본이 부족합니다. 차기 회기에서 재논의.',
      rejected: '열역학 학회 심사위원: 열량 곡선과 표본 다양성이 기준에 미치지 못합니다.',
    },
  },
  high_magic_society: {
    id: 'high_magic_society',
    name: '고위 마법 학회',
    rewards: { degreeScore: 50, reputation: 30, researchFunds: 1200 },
    acceptThreshold: 70,
    rejectThreshold: 45,
    challengeable: true,
    reviewerVoice: {
      accepted: '고위 학회 의장: 문장의 격조와 재현 정밀도 모두 합격선입니다.',
      disputed: '고위 학회 의장: 도전적 주장이지만 NPC 상임위원 반론이 거셉니다. 재반박을 기다립니다.',
      rejected: '고위 학회 의장: 본 학회의 격에 미치지 못하는 보고입니다.',
    },
  },
  forbidden_magic_society: {
    id: 'forbidden_magic_society',
    name: '금서 마법 학회',
    rewards: { degreeScore: 100, reputation: 45, researchFunds: 1800 },
    acceptThreshold: 75,
    rejectThreshold: 50,
    challengeable: true,
    reviewerVoice: {
      accepted: '금서 학회 (비공개): 위험을 감수한 보고를 받아들입니다. 출처는 기록되지 않습니다.',
      disputed: '금서 학회 (비공개): 금기를 흔들 만한 증거지만, 외부 공개는 봉인합니다.',
      rejected: '금서 학회 (비공개): 본 학회의 봉인선 안쪽으로 들이지 못합니다.',
    },
  },
};
