import { on, emit } from './eventBus.js';
import { gameState } from './gameState.js';

const STROKE = 'rgba(44, 36, 27, 0.8)';
const STROKE_W = 4;

function lineSvg(segments) {
    const lines = segments.map(([x1, y1, x2, y2]) =>
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${STROKE_W}" stroke-linecap="round"/>`
    ).join('');
    return `<svg width="80" height="80" viewBox="0 0 100 100">${lines}</svg>`;
}

function circleSvg() {
    return `<svg width="80" height="80" viewBox="0 0 100 100"><circle cx="50" cy="50" r="35" stroke="${STROKE}" stroke-width="${STROKE_W}" fill="none"/></svg>`;
}

function compoundSvg(svg) {
    return `<svg width="80" height="80" viewBox="0 0 100 100">${svg}</svg>`;
}

// 블라인드 모드 (계획서 §11): 일일 과제 라벨에는 정답명을 절대 노출하지 않는다.
// `match`는 내부 매칭에만 쓰이고, 플레이어에게는 `label`(관측 가능한 형태 묘사)와
// `sketch`(SVG)만 표시한다.
const RUNE_DEMANDS = [
    { match: '이사(|)',    label: 'Ⅰ — 수직 직선 1획',           sketch: lineSvg([[50,10,50,90]]) },
    { match: '대지(ㅡ)',   label: '— — 수평 직선 1획',           sketch: lineSvg([[10,50,90,50]]) },
    { match: '원(○)',      label: '○ — 닫힌 원 형태',            sketch: circleSvg() },
    { match: '게보(X)',    label: 'X — 두 사선이 교차',          sketch: lineSvg([[20,20,80,80],[80,20,20,80]]) },
    { match: '알기즈(Y)',  label: 'Y — 수직선 + 위 양 갈래',     sketch: lineSvg([[50,90,50,50],[50,50,20,10],[50,50,80,10]]) },
    { match: '티와즈(↑)',  label: '↑ — 수직선 + 위 좁은 갈래',   sketch: lineSvg([[50,90,50,10],[50,10,20,40],[50,10,80,40]]) },
    { match: '하갈라즈(H)', label: 'H — 수직 두 획 + 가운데 가로', sketch: lineSvg([[15,15,15,85],[85,15,85,85],[15,50,85,50]]) },
    { match: '에와즈(M)',  label: 'M — 지그재그 4획',            sketch: lineSvg([[15,85,15,15],[15,15,50,85],[50,85,85,15],[85,15,85,85]]) },
    { match: '열기(△)',    label: '△ — 삼각형',                  sketch: lineSvg([[50,15,15,85],[15,85,85,85],[85,85,50,15]]) },
    { match: '나우디즈(+)', label: '+ — 수직 + 수평 십자',        sketch: lineSvg([[50,15,50,85],[15,50,85,50]]) },
    { match: '라구즈(L)',  label: 'L — 수직 + 아래 수평',         sketch: lineSvg([[15,15,15,85],[15,85,85,85]]) },
    { match: '케나즈(<)',  label: '< — 좌측으로 꺾인 두 사선',    sketch: lineSvg([[80,15,20,50],[20,50,80,85]]) },
    { match: '다가즈(◇)',  label: '◇ — 마름모',                  sketch: lineSvg([[50,15,85,50],[85,50,50,85],[50,85,15,50],[15,50,50,15]]) }
];

// 복합 룬 과제도 정답명 대신 "복합 형태 #N — 관측되는 형상" 으로만 표시한다.
const COMPOUND_DEMANDS = [
    {
        match: '마그마',
        label: '복합 형태 #A — △ + 아래 가로 빗금',
        sketch: compoundSvg(
            '<line x1="50" y1="20" x2="20" y2="65" stroke="rgba(44, 36, 27, 0.8)" stroke-width="4"/>' +
            '<line x1="20" y1="65" x2="80" y2="65" stroke="rgba(44, 36, 27, 0.8)" stroke-width="4"/>' +
            '<line x1="80" y1="65" x2="50" y2="20" stroke="rgba(44, 36, 27, 0.8)" stroke-width="4"/>' +
            '<line x1="20" y1="82" x2="80" y2="82" stroke="rgba(139, 0, 0, 0.8)" stroke-width="4"/>'
        ),
        compound: true
    },
    {
        match: '폭발',
        label: '복합 형태 #B — 위 가로 빗금 + △',
        sketch: compoundSvg(
            '<line x1="20" y1="22" x2="80" y2="22" stroke="rgba(139, 0, 0, 0.8)" stroke-width="4"/>' +
            '<line x1="50" y1="35" x2="20" y2="80" stroke="rgba(44, 36, 27, 0.8)" stroke-width="4"/>' +
            '<line x1="20" y1="80" x2="80" y2="80" stroke="rgba(44, 36, 27, 0.8)" stroke-width="4"/>' +
            '<line x1="80" y1="80" x2="50" y2="35" stroke="rgba(44, 36, 27, 0.8)" stroke-width="4"/>'
        ),
        compound: true
    },
    {
        match: '봉인된 태양',
        label: '복합 형태 #C — ○ + 가운데 가로 빗금',
        sketch: compoundSvg(
            '<circle cx="50" cy="50" r="28" stroke="rgba(44, 36, 27, 0.8)" stroke-width="4" fill="none"/>' +
            '<line x1="15" y1="50" x2="85" y2="50" stroke="rgba(139, 0, 0, 0.8)" stroke-width="4"/>'
        ),
        compound: true
    }
];

// ── 과제 생성 유틸 ─────────────────────────────────────────────────

/** 중복 없이 퀘스트 N개를 뽑는다 */
function pickDailyQuests(level, count) {
    const unlocked = gameState.progression.unlockedRunes || [];
    const notUnlocked = RUNE_DEMANDS.filter(d => !unlocked.includes(d.match));
    const pool = [];

    // 아직 도감에 없는 기초 룬 우선
    if (notUnlocked.length > 0) {
        const shuffled = [...notUnlocked].sort(() => Math.random() - 0.5);
        for (const d of shuffled) {
            if (pool.length >= count) break;
            pool.push({ ...d, isStudy: true, done: false });
        }
    }

    // 빈 슬롯이 남으면 복합 룬이나 기본 룬으로 채움
    if (pool.length < count) {
        const candidates = level >= 2
            ? [...RUNE_DEMANDS, ...COMPOUND_DEMANDS]
            : [...RUNE_DEMANDS];
        const shuffled = candidates.sort(() => Math.random() - 0.5);
        for (const d of shuffled) {
            if (pool.length >= count) break;
            if (pool.some(q => q.match === d.match)) continue; // 중복 방지
            pool.push({ ...d, isStudy: false, done: false });
        }
    }

    return pool;
}

// ── 일일 퀘스트 시스템 ─────────────────────────────────────────────

export class AssignmentSystem {
    constructor() {
        this.status = 'active';
        this.score = 500;
        this.level = 1;

        /** @type {Array<{match:string, label:string, sketch:string, compound?:boolean, isStudy:boolean, done:boolean}>} */
        this.dailyQuests = [];
        this.message = '연구실에 온 것을 환영하네. 오늘의 과제를 확인하게.';
        this.lastResult = null;

        // 호환용 — UI에서 this.demand를 참조하는 곳이 있을 수 있음
        this.demand = null;
        this.daysRemaining = 0;

        on('day:ticked', () => this._tickDay());

        // 초기 과제 부여 (DOM 준비 이후)
        setTimeout(() => {
            if (this.dailyQuests.length === 0) this._generateDailyQuests();
        }, 100);
    }

    tick(now) { return false; }

    /** 하루가 지나면 미완료 과제에 패널티를 주고 새 퀘스트 발급 */
    _tickDay() {
        const incomplete = this.dailyQuests.filter(q => !q.done);
        if (incomplete.length > 0) {
            const penalty = incomplete.length * 100;
            this.score = Math.max(0, this.score - penalty);
            // 블라인드 모드 — `q.label`은 정답명이 아닌 관측 묘사이므로 그대로 노출 가능.
            const names = incomplete.map(q => q.label).join(', ');
            this.message = `지도교수: "어제 [${names}] 과제를 완료하지 못했군. 실망이네." (-${penalty}G)`;
            this.lastResult = 'expired';
            emit('assignment:expired', { incomplete, penalty });
        }
        this._generateDailyQuests();
    }

    /** 오늘의 과제 1~3개를 생성 */
    _generateDailyQuests() {
        const count = 1 + Math.floor(Math.random() * 3); // 1~3
        this.dailyQuests = pickDailyQuests(this.level, count);
        this.demand = this.dailyQuests[0] || null; // 호환용
        this.daysRemaining = 1;

        const labels = this.dailyQuests.map((q, i) => `${i + 1}. ${q.label}`).join('\n');
        this.message = `지도교수: "오늘의 과제 ${this.dailyQuests.length}건이다."\n${labels}`;
        this.lastResult = null;
        emit('assignment:newDay', { quests: this.dailyQuests });
    }

    /** 마법진 제출 시 미완료 퀘스트 중 매칭되는 것을 찾아 완료 처리 */
    cast(analysis) {
        if (this.dailyQuests.length === 0) {
            return { result: 'idle' };
        }

        const pending = this.dailyQuests.filter(q => !q.done);
        if (pending.length === 0) {
            this.message = '지도교수: "오늘 과제는 모두 끝났군. 자유 연구 시간이다."';
            return { result: 'allDone' };
        }

        // 미완료 퀘스트 중 매칭되는 것을 찾는다
        const matched = pending.find(q => this._matches(analysis, q));

        if (matched) {
            // 도감 학습 과제는 3회 재현(도감 해금)이 완료되어야 완료 처리
            if (matched.isStudy) {
                const unlocked = gameState.progression.unlockedRunes || [];
                if (!unlocked.includes(matched.match)) {
                    // 아직 도감에 해금되지 않음 — 진행 중 메시지
                    this.message = `지도교수: "좋아, ${matched.label} 연습 중이군. 도감에 등록될 때까지 반복하게."`;
                    this.lastResult = null;
                    return { result: 'practicing' };
                }
            }

            matched.done = true;
            const isCompound = matched.compound === true;
            const reward = isCompound ? 600 : 300;
            this.score += reward;

            const remaining = this.dailyQuests.filter(q => !q.done);
            const doneCount = this.dailyQuests.filter(q => q.done).length;

            if (remaining.length === 0) {
                this.message = `지도교수: "훌륭하군! 오늘 과제 ${doneCount}건 모두 완료했네. 연구 자금 +${reward}G"`;
                this.demand = null;
            } else {
                this.message = `지도교수: "${matched.label} 완료! 연구 자금 +${reward}G. 남은 과제 ${remaining.length}건."`;
                this.demand = remaining[0];
            }

            this.lastResult = 'success';

            if (this.score > 2000 * this.level) {
                this.level += 1;
            }

            emit('assignment:completed', { quest: matched, reward, remaining: remaining.length });
            return { result: 'success', score: this.score };
        }

        // 매칭 실패 — 과제와 무관한 형태를 그린 경우 감점하지 않고 안내만.
        // 블라인드 모드(계획서 §11): 그린 룬의 정답명은 노출하지 않는다.
        this.message = `지도교수: "오늘 과제 형태와 일치하지 않는 문양이군. 과제 목록을 다시 확인해보게."`;
        this.lastResult = null;
        return { result: 'miss' };
    }

    _matches(analysis, quest) {
        if (!analysis) return false;
        if (quest.compound) {
            return analysis.compoundName === quest.match;
        }
        return typeof analysis.meaning === 'string' && analysis.meaning.includes(quest.match);
    }

    getLevel() {
        return this.level;
    }

    /** 오늘의 과제 진행 상태 요약 */
    getProgress() {
        const total = this.dailyQuests.length;
        const done = this.dailyQuests.filter(q => q.done).length;
        return { total, done, remaining: total - done };
    }
}

export const assignmentSystem = new AssignmentSystem();
