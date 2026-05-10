/**
 * Inbox seed templates.
 * 게임 이벤트에 반응해 자동으로 메일을 생성할 때 쓰는 정적 템플릿 모음.
 */

export const SENDER_ROLES = {
  office: { name: '학과 사무실', accent: '#7d5a35' },
  supervisor: { name: '지도교수', accent: '#6e2933' },
  society: { name: '학회', accent: '#3d5a78' },
  grant: { name: '후원 기관', accent: '#5d6d2c' },
  expedition: { name: '답사 파트너', accent: '#4a6457' },
  system: { name: '시스템', accent: '#3a2c1a' },
};

export const WELCOME_MAIL = {
  sender: '학과 사무실',
  senderRole: 'office',
  subject: '환영합니다, 신입 연구자님',
  kind: 'announcement',
  body: [
    '학과 사무실에서 인사드립니다.',
    '',
    '본 학과의 일정상 8주차에는 중간고사, 16주차에는 기말고사가 자동 시행되며',
    '학적·후원·학회 관련 모든 공지는 이 학내 메일함을 통해 전달됩니다.',
    '',
    '발견·논문 활동은 메일로 즉시 통보됩니다. 신중한 연구를 부탁드립니다.',
  ].join('\n'),
};

/**
 * 이벤트 → 메일 템플릿 변환.
 * @param {string} kind - 이벤트 종류
 * @param {object} payload - 이벤트 페이로드
 * @returns {{ sender, senderRole, subject, body, kind } | null}
 */
export function buildMailFromEvent(kind, payload) {
  switch (kind) {
    case 'paper:accepted': {
      const { paper, review } = payload;
      const society = review?.society?.name || '학회';
      return {
        sender: society,
        senderRole: 'society',
        subject: `[채택] ${paper.title}`,
        kind: 'review',
        body: [
          `${society} 편집위원회입니다.`,
          '',
          `귀하의 논문 "${paper.title}" 가 채택되었습니다.`,
          `학위 +${review.society.rewards.degreeScore}, 명성 +${review.society.rewards.reputation}, 연구비 +${review.society.rewards.researchFunds}G`,
          '',
          '추후 게재 일정은 학회지 다음 호에 공지됩니다.',
        ].join('\n'),
      };
    }
    case 'paper:rejected': {
      const { paper, review } = payload;
      const society = review?.society?.name || '학회';
      const reasons = (review?.reasons || []).map((r) => ` - ${r}`).join('\n');
      return {
        sender: society,
        senderRole: 'society',
        subject: `[반려] ${paper.title}`,
        kind: 'review',
        body: [
          `${society} 편집위원회입니다.`,
          '',
          `귀하의 논문 "${paper.title}" 가 반려되었습니다.`,
          '',
          '심사 의견:',
          reasons || ' - (사유 없음)',
          '',
          '재제출을 원하실 경우 보완 자료를 첨부해 다시 투고해 주십시오.',
        ].join('\n'),
      };
    }
    case 'exam:midtermTaken': {
      const { score, passed } = payload;
      return {
        sender: '지도교수',
        senderRole: 'supervisor',
        subject: `중간고사 결과 — ${passed ? '통과' : '미달'} (${score}점)`,
        kind: 'announcement',
        body: [
          `중간고사 채점이 완료되어 결과를 통지합니다.`,
          '',
          `점수: ${score}`,
          `결과: ${passed ? '통과' : '미달 — 다음 학기 학사 경고 가능성'}`,
          '',
          '발견·논문 실적이 점수에 반영됩니다. 꾸준한 연구를 부탁합니다.',
        ].join('\n'),
      };
    }
    case 'exam:finalTaken': {
      const { score, passed } = payload;
      return {
        sender: '지도교수',
        senderRole: 'supervisor',
        subject: `기말고사 결과 — ${passed ? '통과' : '미달'} (${score}점)`,
        kind: 'announcement',
        body: [
          `기말고사 채점이 완료되어 결과를 통지합니다.`,
          '',
          `점수: ${score}`,
          `결과: ${passed ? '통과 — 다음 Phase 승급 시 시험 요건 충족' : '미달'}`,
          '',
          '결과는 자동으로 학적부에 기록되었습니다.',
        ].join('\n'),
      };
    }
    case 'phase:advanced': {
      const { phase, name } = payload;
      return {
        sender: '학과 사무실',
        senderRole: 'office',
        subject: `Phase ${phase} 승급 — ${name}`,
        kind: 'announcement',
        body: [
          `학과 사무실에서 알려드립니다.`,
          '',
          `귀하는 ${name} (Phase ${phase}) 으로 승급되었습니다.`,
          `해당 Phase 부터는 신규 룬·바탕재가 해금되며, 일부 학회·답사가 추가 개방됩니다.`,
        ].join('\n'),
      };
    }
    case 'economy:grantAccepted': {
      const { grant } = payload;
      return {
        sender: '후원 기관',
        senderRole: 'grant',
        subject: `연구비 수주 완료 — ${grant.name}`,
        kind: 'grant',
        body: [
          '후원 기관입니다.',
          '',
          `귀하의 신청이 승인되어 즉시 ${grant.payout}G 가 지급되었습니다.`,
          `유효기간 ${grant.durationWeeks}주 동안 진행 보고서를 제출해 주십시오.`,
        ].join('\n'),
      };
    }
    case 'economy:contractSigned': {
      const { contract } = payload;
      return {
        sender: '후원 기관',
        senderRole: 'grant',
        subject: `계약 체결 — ${contract.name}`,
        kind: 'grant',
        body: [
          '후원 기관입니다.',
          '',
          `계약이 체결되어 선금 ${contract.upfront}G 가 지급되었습니다.`,
          `이후 매주 ${contract.weeklyIncome}G 가 정산됩니다.`,
        ].join('\n'),
      };
    }
    case 'expedition:completed': {
      const { record } = payload;
      const findTitles = (record.finds || []).map((f) => ` - ${f.title}`).join('\n');
      return {
        sender: '답사 파트너',
        senderRole: 'expedition',
        subject: `답사 결과 보고 — ${record.expeditionId}`,
        kind: 'expedition_report',
        body: [
          '답사 파트너입니다.',
          '',
          '답사가 완료되어 결과를 동봉합니다.',
          '',
          '주요 수습:',
          findTitles || ' - (수습 없음)',
        ].join('\n'),
      };
    }
    case 'canon:mismatch': {
      const m = payload;
      return {
        sender: '지도교수',
        senderRole: 'supervisor',
        subject: `정설 불일치 보고 — ${m.canonOfficialName || m.canonTitle}`,
        kind: 'rebuttal',
        body: [
          `귀하의 관측이 ${m.canonTitle} 와 충돌합니다.`,
          '',
          '도전 논문(challenge) 또는 보완 보고(refinement) 작성을 검토해 보십시오.',
          '관측치와 정설의 차이점을 명확히 기술해야 채택 가능성이 높아집니다.',
        ].join('\n'),
      };
    }
    // PR-J: 학회지 NPC 논문 출간 알림.
    case 'publication:released': {
      const { publication, society } = payload;
      const societyName = society?.name || publication.society;
      return {
        sender: societyName,
        senderRole: 'society',
        subject: `[학회지] ${publication.title}`,
        kind: 'announcement',
        body: [
          `${societyName} 회지가 새 논문을 게재했습니다.`,
          '',
          `제목: ${publication.title}`,
          `저자: ${publication.author}`,
          '',
          publication.abstract,
          '',
          '학회지 패널에서 본문을 확인하고 필요 시 반박 논문을 제출할 수 있습니다.',
          '※ 이미 학계에서 사실로 인정된 논문을 잘못 반박할 경우 학위·평판이 손상될 수 있습니다.',
        ].join('\n'),
      };
    }
    // PR-J: 반박 결과 통보.
    case 'publication:rebutted': {
      const { publication, society, outcome, deltas } = payload;
      const societyName = society?.name || publication.society;
      const isWrongful = outcome === 'wrongful';
      const deltaSummary = `학위 ${deltas.degreeScore >= 0 ? '+' : ''}${deltas.degreeScore} / 평판 ${deltas.reputation >= 0 ? '+' : ''}${deltas.reputation} / 연구비 ${deltas.researchFunds >= 0 ? '+' : ''}${deltas.researchFunds}G`;
      return {
        sender: societyName,
        senderRole: 'society',
        subject: isWrongful
          ? `[오반박] ${publication.title}`
          : `[정확한 반박] ${publication.title}`,
        kind: 'review',
        body: [
          `${societyName} 편집위원회입니다.`,
          '',
          isWrongful
            ? `귀하는 사실에 부합하는 ${publication.author}의 논문을 잘못 반박했습니다. 이는 학내 신뢰도에 부정적으로 작용합니다.`
            : `귀하의 반박이 ${publication.author}의 부정확한 논문을 학계 앞에 노출시켰습니다. 본 학회는 귀하의 기여를 채택합니다.`,
          '',
          `결과: ${deltaSummary}`,
        ].join('\n'),
      };
    }
    default:
      return null;
  }
}
