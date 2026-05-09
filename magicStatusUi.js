// 캔버스 하단 상태바(systemStatus)와 마법 주입 메시지의 텍스트 포매팅.
//
// 블라인드 모드(계획서 §11): 플레이어 UI에는 룬의 정답명(예: '이사(|)',
// '나우디즈(+)') 또는 복합 룬 명(예: '마그마', '봉인된 태양')을 절대 노출하지
// 않는다. 같은 정보가 필요하면 관측 가능한 값(불안정성·동역학·공명 등)으로
// 대체한다. 디버그 모드(`settings.debugShowLegacyNames`)일 때만 정답명을 함께
// 보여 개발 검증을 돕는다.
//
// 이 모듈은 DOM에 손대지 않고 순수하게 `{ text, color, showCast }`만
// 반환하므로 node 단위 테스트에서 검증 가능하다 (tests/run-tests.js의
// `[blind mode §11]` 케이스 참고).

export function formatCanvasStatus(input, settings = {}) {
    const debug = !!settings.debugShowLegacyNames;
    const instability = Number(input.instability) || 0;
    const meaning = input.currentMeaning || '';
    const compound = input.currentCompound || '';
    const dynamics = input.currentDynamics || '';
    const hasLiveStroke = !!input.hasLiveStroke;
    const canCast = !!input.canCast;

    if (instability > 80) {
        return {
            text: debug && meaning
                ? `[경고] 붕괴 임박! (${meaning})`
                : `[경고] 붕괴 임박! (불안정성 ${Math.round(instability)}%)`,
            color: '#8b0000',
            showCast: false,
        };
    }

    if (compound) {
        const prefix = canCast ? '결합 발현' : '결합 감지';
        const tail = dynamics || '관측 중';
        return {
            text: debug
                ? `${prefix}: ${compound} — ${tail}`
                : `${prefix} — ${tail}`,
            color: '#ffaa00',
            showCast: canCast,
        };
    }

    if (canCast) {
        const tail = dynamics || '관측 중';
        return {
            text: debug && meaning
                ? `발현 중: ${meaning} — ${tail}`
                : `발현 중 — ${tail}`,
            color: '#8a2be2',
            showCast: true,
        };
    }

    if (hasLiveStroke) {
        return {
            text: debug && meaning ? `분석 중: ${meaning}` : '분석 중...',
            color: '#00ffff',
            showCast: false,
        };
    }

    return {
        text: '대기 중...',
        color: '#8a2be2',
        showCast: false,
    };
}

export function formatCastInjection(input, settings = {}) {
    const debug = !!settings.debugShowLegacyNames;
    const meaning = input.currentMeaning || '';
    return debug && meaning
        ? `[마법 주입!] ${meaning}이(가) 균열로 빨려들어갑니다!`
        : `[마법 주입!] 룬이 균열로 빨려들어갑니다!`;
}
