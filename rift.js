// Abyssal Rift — game loop module.
// Core idea: a dimensional rift sits in the center of the canvas. Threat ticks
// up over time. Periodically the rift "demands" a specific rune (or, at higher
// score levels, a positional radical compound). The player must draw that rune
// and Cast it before the timer runs out. Correct casts knock threat down and
// award score; wrong/expired casts push it up. When threat hits 100% the run
// ends and the canvas is left scarred (visual marker for the future Scarred
// Canvas feature) until the player restarts.
//
// This module is deliberately self-contained: it exposes a small RiftGame class
// that main.js drives via tick() each frame, cast() on every cast button press,
// and start()/stop() to toggle the run. Main owns DOM updates; this module
// owns state transitions and decisions.

const STROKE = 'rgba(255,255,255,0.6)';
const STROKE_W = 3;

function lineSvg(segments) {
    const lines = segments.map(([x1, y1, x2, y2]) =>
        `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${STROKE}" stroke-width="${STROKE_W}"/>`
    ).join('');
    return `<svg width="80" height="80" viewBox="0 0 100 100">${lines}</svg>`;
}

function circleSvg() {
    return `<svg width="80" height="80" viewBox="0 0 100 100"><circle cx="50" cy="50" r="35" stroke="${STROKE}" stroke-width="${STROKE_W}" fill="none"/></svg>`;
}

function compoundSvg(svg) {
    return `<svg width="80" height="80" viewBox="0 0 100 100">${svg}</svg>`;
}

// Single-rune demands. `match` MUST equal the rune name exactly as recognition.js
// returns it in `analysis.meaning` so that includes() lookups succeed.
const RUNE_DEMANDS = [
    { match: '이사(|)',    label: '이사 (Ⅰ)',     sketch: lineSvg([[50,10,50,90]]) },
    { match: '대지(ㅡ)',   label: '대지 (—)',     sketch: lineSvg([[10,50,90,50]]) },
    { match: '원(○)',      label: '원 (○)',       sketch: circleSvg() },
    { match: '게보(X)',    label: '게보 (X)',     sketch: lineSvg([[20,20,80,80],[80,20,20,80]]) },
    { match: '알기즈(Y)',  label: '알기즈 (Y)',   sketch: lineSvg([[50,90,50,50],[50,50,20,10],[50,50,80,10]]) },
    { match: '티와즈(↑)',  label: '티와즈 (↑)',   sketch: lineSvg([[50,90,50,10],[50,10,20,40],[50,10,80,40]]) },
    { match: '하갈라즈(H)', label: '하갈라즈 (H)', sketch: lineSvg([[15,15,15,85],[85,15,85,85],[15,50,85,50]]) },
    { match: '에와즈(M)',  label: '에와즈 (M)',   sketch: lineSvg([[15,85,15,15],[15,15,50,85],[50,85,85,15],[85,15,85,85]]) },
    { match: '열기(△)',    label: '열기 (△)',     sketch: lineSvg([[50,15,15,85],[15,85,85,85],[85,85,50,15]]) },
    { match: '나우디즈(+)', label: '나우디즈 (+)', sketch: lineSvg([[50,15,50,85],[15,50,85,50]]) },
    { match: '라구즈(L)',  label: '라구즈 (L)',   sketch: lineSvg([[15,15,15,85],[15,85,85,85]]) },
    { match: '케나즈(<)',  label: '케나즈 (<)',   sketch: lineSvg([[80,15,20,50],[20,50,80,85]]) },
    { match: '다가즈(◇)',  label: '다가즈 (◇)',   sketch: lineSvg([[50,15,85,50],[85,50,50,85],[50,85,15,50],[15,50,50,15]]) }
];

// Compound demands. These appear once score >= COMPOUND_UNLOCK_SCORE. `match`
// is checked against analysis.compoundName.
const COMPOUND_DEMANDS = [
    {
        match: '마그마',
        label: '결합: 마그마 (△ 아래에 ㅡ)',
        sketch: compoundSvg(
            '<line x1="50" y1="20" x2="20" y2="65" stroke="rgba(255,255,255,0.6)" stroke-width="3"/>' +
            '<line x1="20" y1="65" x2="80" y2="65" stroke="rgba(255,255,255,0.6)" stroke-width="3"/>' +
            '<line x1="80" y1="65" x2="50" y2="20" stroke="rgba(255,255,255,0.6)" stroke-width="3"/>' +
            '<line x1="20" y1="82" x2="80" y2="82" stroke="rgba(255,170,0,0.9)" stroke-width="3"/>'
        ),
        compound: true
    },
    {
        match: '폭발',
        label: '결합: 폭발 (△ 위에 ㅡ)',
        sketch: compoundSvg(
            '<line x1="20" y1="22" x2="80" y2="22" stroke="rgba(255,170,0,0.9)" stroke-width="3"/>' +
            '<line x1="50" y1="35" x2="20" y2="80" stroke="rgba(255,255,255,0.6)" stroke-width="3"/>' +
            '<line x1="20" y1="80" x2="80" y2="80" stroke="rgba(255,255,255,0.6)" stroke-width="3"/>' +
            '<line x1="80" y1="80" x2="50" y2="35" stroke="rgba(255,255,255,0.6)" stroke-width="3"/>'
        ),
        compound: true
    },
    {
        match: '봉인된 태양',
        label: '결합: 봉인된 태양 (○ 가운데를 ㅡ가 관통)',
        sketch: compoundSvg(
            '<circle cx="50" cy="50" r="28" stroke="rgba(255,255,255,0.6)" stroke-width="3" fill="none"/>' +
            '<line x1="15" y1="50" x2="85" y2="50" stroke="rgba(255,170,0,0.9)" stroke-width="3"/>'
        ),
        compound: true
    }
];

// Score thresholds at which difficulty steps up. Each step shortens the timer
// floor and shrinks the reward-to-penalty ratio so longer runs feel tense.
const LEVEL_THRESHOLDS = [0, 100, 250, 500, 800];

const COMPOUND_UNLOCK_SCORE = 250;

const PASSIVE_THREAT_PER_SEC = 0.35; // baseline drift toward overload

function pickDemand(score) {
    const compoundsUnlocked = score >= COMPOUND_UNLOCK_SCORE;
    // 25% chance to demand a compound once unlocked, else single rune.
    if (compoundsUnlocked && Math.random() < 0.25) {
        return COMPOUND_DEMANDS[Math.floor(Math.random() * COMPOUND_DEMANDS.length)];
    }
    return RUNE_DEMANDS[Math.floor(Math.random() * RUNE_DEMANDS.length)];
}

function levelFor(score) {
    let lvl = 0;
    for (let i = 0; i < LEVEL_THRESHOLDS.length; i++) {
        if (score >= LEVEL_THRESHOLDS[i]) lvl = i;
    }
    return lvl;
}

function timerForLevel(level) {
    // 30s at level 0, dropping 4s per level, floor 14s.
    return Math.max(14, 30 - level * 4);
}

export class RiftGame {
    constructor() {
        this.status = 'idle'; // 'idle' | 'active' | 'gameover'
        this.threat = 0;
        this.score = 0;
        this.demand = null;
        this.timeRemaining = 0;
        this.lastTickAt = 0;
        this.message = '';
        this.lastResult = null; // 'success' | 'wrong' | 'expired' | null
    }

    start() {
        this.status = 'active';
        this.threat = 0;
        this.score = 0;
        this.message = '균열이 깨어났다. 첫 요구를 기다려라.';
        this.lastResult = null;
        this._newDemand();
        this.lastTickAt = performance.now();
    }

    stop() {
        this.status = 'idle';
        this.demand = null;
        this.timeRemaining = 0;
        this.message = '균열이 잠잠해졌다.';
        this.lastResult = null;
    }

    // Called every frame from the render loop. Returns true if anything
    // user-visible changed (so main.js can avoid redundant DOM writes).
    tick(now) {
        if (this.status !== 'active') return false;

        const dtSec = Math.max(0, (now - this.lastTickAt) / 1000);
        this.lastTickAt = now;

        const level = levelFor(this.score);
        const passive = PASSIVE_THREAT_PER_SEC * (1 + level * 0.25);
        this.threat = Math.min(100, this.threat + passive * dtSec);

        if (this.demand) {
            this.timeRemaining = Math.max(0, this.timeRemaining - dtSec);
            if (this.timeRemaining <= 0) {
                this._expire();
            }
        }

        if (this.threat >= 100) {
            this._gameOver();
        }

        return true;
    }

    // Called when the user clicks Cast. `analysis` is the recognizer output for
    // the current canvas: { meaning, compoundName, arrangement, boneInteraction,
    // sentence, ... }. Returns a result object so main.js can play a
    // corresponding visual cue. When the analyzer reports a non-trivial
    // arrangement (§9), bone interaction (§10), and/or sentence grade
    // (§§11-12), their powerMuls multiply together and scale both score
    // reward and threat relief — so a bone-triangle 삼중 강화 (×2.0) inside a
    // rhombus 공명 (×1.8) on a 절 sentence (×1.1) hits 3.96× as hard as a
    // plain solo cast.
    cast(analysis) {
        if (this.status !== 'active' || !this.demand) {
            return { result: 'idle' };
        }

        const matched = this._matches(analysis, this.demand);
        const arr = analysis && analysis.arrangement;
        const bone = analysis && analysis.boneInteraction;
        const sentence = analysis && analysis.sentence;
        const arrMul = (arr && typeof arr.powerMul === 'number') ? arr.powerMul : 1.0;
        const boneMul = (bone && typeof bone.powerMul === 'number') ? bone.powerMul : 1.0;
        const sentMul = (sentence && typeof sentence.powerMul === 'number') ? sentence.powerMul : 1.0;
        const powerMul = arrMul * boneMul * sentMul;
        if (matched) {
            const level = levelFor(this.score);
            const isCompound = this.demand.compound === true;
            const baseReward = isCompound ? 60 : 30;
            const baseRelief = isCompound ? 35 : 25;
            const totalReward = Math.round((baseReward + level * 5) * powerMul);
            const totalRelief = baseRelief * powerMul;
            this.score += totalReward;
            this.threat = Math.max(0, this.threat - totalRelief);
            // Build a single bonus tag listing each contributor that's not ×1.0,
            // so the player sees what scaled the cast (and how the systems
            // interacted): "[삼각 배열 ×2.0 · 공명 ×1.8 · 절 ×1.1]".
            const tags = [];
            if (arr && arr.kind && arr.kind !== 'none' && arrMul !== 1.0) {
                tags.push(`${arr.label} ×${arrMul.toFixed(1)}`);
            }
            if (bone && bone.kind && bone.kind !== 'none' && boneMul !== 1.0) {
                const detail = bone.detail ? ` ${bone.detail}` : '';
                tags.push(`${bone.label}${detail} ×${boneMul.toFixed(1)}`);
            }
            if (sentence && sentence.kind === 'sentence' && sentMul !== 1.0) {
                tags.push(`${sentence.label} ×${sentMul.toFixed(1)}`);
            }
            const bonus = tags.length > 0 ? ` [${tags.join(' · ')}]` : '';
            this.message = `${this.demand.label} 봉합 성공!${bonus} +${totalReward}점`;
            this.lastResult = 'success';
            this._newDemand();
            return { result: 'success', score: this.score, powerMul };
        }

        // Wrong cast — heavier penalty than passive drift but lighter than expire.
        this.threat = Math.min(100, this.threat + 12);
        const got = analysis.compoundName || analysis.meaning || '알 수 없는 문양';
        this.message = `엇나간 봉합 (${got}). 위협 +12`;
        this.lastResult = 'wrong';
        if (this.threat >= 100) {
            this._gameOver();
        }
        return { result: 'wrong', threat: this.threat };
    }

    _matches(analysis, demand) {
        if (!analysis) return false;
        if (demand.compound) {
            return analysis.compoundName === demand.match;
        }
        // Single-rune demand: recognition.js puts the rune name into meaning,
        // possibly wrapped with a modifier prefix like '[광역]' or '[응축된]'.
        return typeof analysis.meaning === 'string' && analysis.meaning.includes(demand.match);
    }

    _expire() {
        this.threat = Math.min(100, this.threat + 22);
        this.message = `시간 초과: ${this.demand.label} 미봉합. 위협 +22`;
        this.lastResult = 'expired';
        this._newDemand();
    }

    _newDemand() {
        this.demand = pickDemand(this.score);
        this.timeRemaining = timerForLevel(levelFor(this.score));
    }

    _gameOver() {
        this.status = 'gameover';
        this.threat = 100;
        this.message = `균열 붕괴. 최종 점수 ${this.score}.`;
        this.demand = null;
        this.lastResult = null;
    }

    getLevel() {
        return levelFor(this.score);
    }
}
