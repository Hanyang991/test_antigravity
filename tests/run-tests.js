import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  },
  clear() {
    storage.clear();
  },
};

const { gameState, resetState } = await import('../gameState.js');
const { recordDiscovery, getDiscovery } = await import('../discoverySystem.js');
const { createPaperDraft, getPaperSuggestion, submitPaper, runDuePaperReview, initPaperSystem } = await import('../paperSystem.js');
const { applyForGrant, signContract, sellScroll, tickEconomyWeek } = await import('../economy.js');
const { startExpedition } = await import('../expedition.js');
const { advanceDay, enqueueEvent, getPendingEvents, consumeTime } = await import('../schedule.js');
const { on: onBus, off: offBus } = await import('../eventBus.js');
const { checkPhaseProgress, takeMidtermExam, takeFinalExam } = await import('../phase.js');
const { getCanonEntries, classifyDiscoveryAgainstCanon, getCanonMatchForSignature, inspectCanonMismatch, registerCanon, REGISTER_CANON_REWARDS } = await import('../academicCanon.js');
const { reviewPaper, getEligiblePaperPlans } = await import('../paperSystem.js');
const { ACTION_COSTS, consumeForAction } = await import('../actionCosts.js');
const { analyzeConnectorLines } = await import('../connectorLine.js');
const { analyzeGrammarTokens } = await import('../grammarTokens.js');
const { analyzeSentence: analyzeSentenceStructure } = await import('../sentenceAnalyzer.js');
const { RecognitionEngine } = await import('../recognition.js');
const { analyzeArrangement } = await import('../arrangement.js');
const { analyzeBoneInteraction } = await import('../bone-interaction.js');
const { analyzeMagic } = await import('../magicPipeline.js');
const { RiftGame } = await import('../rift.js');
const { AssignmentSystem } = await import('../assignmentSystem.js');
const { formatCanvasStatus, formatCastInjection } = await import('../magicStatusUi.js');

function resetAll() {
  resetState();
  storage.clear();
  gameState.papers.drafts = [];
  gameState.papers.submitted = [];
  gameState.papers.accepted = [];
  gameState.papers.rejected = [];
  gameState.papers.disputes = [];
  gameState.expeditions.active = [];
  gameState.expeditions.completed = [];
  gameState.economy.activeGrants = [];
  gameState.economy.activeContracts = [];
  gameState.economy.scrollOrders = [];
  gameState.economy.weeklyIncome = [];
  gameState.academic.canonMismatches = [];
  gameState.academic.canonMatches = {};
  gameState.academic.canonOverrides = {};
}

function makeAnalysis(overrides = {}) {
  const signature = overrides.signature ?? `sig_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id: `analysis_${signature}`,
    createdAt: Date.now(),
    input: {
      material: overrides.material ?? 'parchment',
      runeStrokeCount: 3,
      boneStrokeCount: 1,
      assistMode: 'free',
    },
    legacy: {
      meaning: overrides.meaning ?? '열기(△)',
      compoundName: overrides.compoundName ?? null,
      dynamics: overrides.dynamics ?? '투사',
      instabilityModifier: 0,
      radicals: [],
    },
    observables: {
      resonance: overrides.resonance ?? 24,
      heat: overrides.heat ?? 40,
      pressure: 0,
      instability: overrides.instability ?? 20,
      dynamics: overrides.dynamics ?? '투사',
      overloaded: false,
      maxHeat: 150,
    },
    arrangement: {
      kind: overrides.arrangementKind ?? 'none',
      label: '',
      detail: '',
      powerMul: 1,
      instabilityDelta: 0,
      runeCount: 1,
      units: [],
    },
    bone: {
      interactions: [],
      totalInstabilityDelta: 0,
      totalResonanceMul: 1,
    },
    connectors: {
      links: [],
      operators: overrides.operators ?? [],
    },
    grammar: {
      tokens: [],
      roles: overrides.roles ?? [],
      modifiers: [],
      operators: overrides.operators ?? [],
      transforms: [],
    },
    sentence: {
      readingOrder: 'left_to_right',
      orderedUnits: ['열기(△)'],
      grade: overrides.grade ?? 'single_rune',
      pattern: overrides.pattern ?? 'unknown',
      normalizedText: '',
      semanticTags: [],
      confidence: 0.5,
      warnings: [],
    },
    discovery: {
      signature,
      knownToPlayer: false,
      knownToAcademy: false,
      displayName: null,
      status: 'unknown',
    },
    _raw: {
      boneInteraction: { kind: 'none' },
      sentence: { kind: 'word', grade: overrides.rawSentenceGrade ?? '단어' },
      particles: { kind: 'none' },
    },
  };
}

function makeLineStroke(x1, y1, x2, y2, mode = 'rune', startT = 0, points = 16, duration = 160) {
  const stroke = [];
  for (let i = 0; i < points; i++) {
    const a = i / (points - 1);
    stroke.push({
      x: x1 + (x2 - x1) * a,
      y: y1 + (y2 - y1) * a,
      t: startT + Math.round(duration * a),
      mode,
    });
  }
  return stroke;
}

function makeCircleStroke(cx, cy, r, mode = 'bone', startT = 0, points = 36, duration = 240) {
  const stroke = [];
  for (let i = 0; i <= points; i++) {
    const a = i / points;
    const theta = a * Math.PI * 2;
    stroke.push({
      x: cx + Math.cos(theta) * r,
      y: cy + Math.sin(theta) * r,
      t: startT + Math.round(duration * a),
      mode,
    });
  }
  return stroke;
}

function makeTiwaz(offsetX = 0, offsetY = 0, mode = 'rune') {
  return [
    makeLineStroke(50 + offsetX, 100 + offsetY, 50 + offsetX, 0 + offsetY, mode, 0),
    makeLineStroke(50 + offsetX, 0 + offsetY, 20 + offsetX, 30 + offsetY, mode, 200),
    makeLineStroke(50 + offsetX, 0 + offsetY, 80 + offsetX, 30 + offsetY, mode, 400),
  ];
}

function makeIsa(offsetX = 0, offsetY = 0, mode = 'rune') {
  return [
    makeLineStroke(50 + offsetX, 0 + offsetY, 50 + offsetX, 100 + offsetY, mode, 0),
  ];
}

function makeTriangleBones(offsetX = 0, offsetY = 0) {
  return [
    makeLineStroke(50 + offsetX, 10 + offsetY, 15 + offsetX, 85 + offsetY, 'bone', 0),
    makeLineStroke(15 + offsetX, 85 + offsetY, 85 + offsetX, 85 + offsetY, 'bone', 150),
    makeLineStroke(85 + offsetX, 85 + offsetY, 50 + offsetX, 10 + offsetY, 'bone', 300),
  ];
}

// paperSystem.js no longer auto-registers its 'paper:review_due' listener at
// module load — initPaperSystem() does. Call it once here so all schedule-driven
// review tests work the same as before.
initPaperSystem();

const tests = [
  ['recordDiscovery stores and reproduces a phenomenon', () => {
    resetAll();
    const analysis = makeAnalysis({ signature: 'sig_discovery' });

    const first = recordDiscovery(analysis);
    assert.equal(first.isNew, true);
    assert.equal(first.reproCount, 1);

    const second = recordDiscovery(analysis);
    assert.equal(second.isNew, false);
    assert.equal(second.reproCount, 2);

    const entry = getDiscovery('sig_discovery');
    assert.ok(entry);
    assert.equal(entry.reproducibility.count, 2);
  }],

  ['compound rune dictionary unlocks after 3 reproductions (M6)', () => {
    resetAll();
    const analysis = makeAnalysis({
      signature: 'sig_compound_unlock',
      meaning: '열기(△) + 대지(ㅡ)',
      compoundName: '마그마',
      grade: 'compound_word',
    });

    recordDiscovery(analysis);
    recordDiscovery(analysis);
    const third = recordDiscovery(analysis);

    assert.equal(third.entry.reproducibility.count, 3);
    assert.equal(third.entry.status, 'reproducible');

    const compounds = gameState.progression.unlockedCompounds;
    assert.ok(Array.isArray(compounds), 'unlockedCompounds must be an array');
    assert.ok(compounds.includes('마그마'), `expected '마그마' in unlockedCompounds, got ${JSON.stringify(compounds)}`);

    // 단일 룬 도감엔 들어가지 않아야 함
    assert.ok(!gameState.progression.unlockedRunes.includes('열기(△) + 대지(ㅡ)'),
      'compound discoveries must not pollute unlockedRunes');

    // 4번째 재현해도 중복 추가되지 않아야 함
    recordDiscovery(analysis);
    const occurrences = compounds.filter((c) => c === '마그마').length;
    assert.equal(occurrences, 1, 'compound name must not be duplicated on further reproductions');
  }],

  ['single rune dictionary unlock still works alongside compound unlock (M6)', () => {
    resetAll();
    const single = makeAnalysis({ signature: 'sig_single_unlock', meaning: '이사(|)', grade: 'single_rune' });
    recordDiscovery(single);
    recordDiscovery(single);
    recordDiscovery(single);

    assert.ok(gameState.progression.unlockedRunes.includes('이사(|)'));
    assert.equal(gameState.progression.unlockedCompounds.length, 0);
  }],

  ['paper submission defers review to the schedule queue (M8)', () => {
    resetAll();
    const analysis = makeAnalysis({ signature: 'sig_paper', instability: 18, grade: 'single_rune' });
    recordDiscovery(analysis);
    recordDiscovery(analysis);
    const third = recordDiscovery(analysis);
    assert.equal(third.entry.status, 'reproducible');

    const draft = createPaperDraft({
      discoverySignature: 'sig_paper',
      type: 'new_discovery',
      targetSociety: 'basic_magic_society',
    });
    assert.ok(draft);
    assert.equal(gameState.papers.drafts.length, 1);

    const submitted = submitPaper(draft.id);
    assert.ok(submitted, 'submitPaper should return the paper');
    assert.equal(submitted.status, 'submitted');
    assert.equal(submitted.reviewDelayDays, 3, 'basic society should default to 3 day review delay');
    assert.equal(gameState.papers.submitted.length, 1, 'paper sits in submitted before review fires');
    assert.equal(gameState.papers.accepted.length, 0, 'no immediate accept');
    assert.equal(gameState.papers.rejected.length, 0, 'no immediate reject');

    const pending = getPendingEvents().filter((e) => e.type === 'paper:review_due');
    assert.equal(pending.length, 1, 'a paper:review_due event must be enqueued');
    assert.equal(pending[0].payload.paperId, submitted.id);

    // 2일만 흘려서는 심사가 끝나지 않는다 (delay=3).
    const partial = advanceDay(2);
    assert.equal(partial.firedEvents.length, 0, 'review must not fire before delay elapses');
    assert.equal(gameState.papers.accepted.length, 0);

    // 1일 더 흐르면 review_due가 fire되고 paperSystem 리스너가 심사 마무리.
    const final = advanceDay(1);
    assert.equal(final.firedEvents.length, 1, 'review_due must fire on the 3rd day');
    assert.equal(gameState.papers.submitted.length, 0, 'submitted is drained after review');
    assert.equal(gameState.papers.accepted.length, 1, 'paper is moved to accepted after review fires');
    assert.equal(gameState.resources.degreeScore, 15);
    assert.equal(gameState.resources.researchFunds, 800);
  }],

  ['runDuePaperReview can force a review without waiting (M8)', () => {
    resetAll();
    const analysis = makeAnalysis({ signature: 'sig_force', instability: 18, grade: 'single_rune' });
    recordDiscovery(analysis);
    recordDiscovery(analysis);
    recordDiscovery(analysis);

    const draft = createPaperDraft({
      discoverySignature: 'sig_force',
      type: 'new_discovery',
      targetSociety: 'basic_magic_society',
    });
    submitPaper(draft.id);
    assert.equal(gameState.papers.submitted.length, 1);

    const review = runDuePaperReview(draft.id);
    assert.ok(review, 'runDuePaperReview should return the review object');
    assert.equal(review.accepted, true);
    assert.equal(gameState.papers.accepted.length, 1);
  }],

  ['paper draft preserves user-provided title and claim (M7 modal flow)', () => {
    resetAll();
    const analysis = makeAnalysis({ signature: 'sig_modal', instability: 18, grade: 'single_rune' });
    recordDiscovery(analysis);
    recordDiscovery(analysis);
    recordDiscovery(analysis);

    const userTitle = '플레이어가 직접 작성한 제목';
    const userClaim = '관측한 결과 X 조건에서 Y 패턴이 일관되게 재현됨을 보고한다.';

    const draft = createPaperDraft({
      discoverySignature: 'sig_modal',
      type: 'new_discovery',
      targetSociety: 'basic_magic_society',
      title: userTitle,
      claim: userClaim,
    });

    assert.ok(draft);
    assert.equal(draft.title, userTitle, 'user-provided title must be preserved verbatim');
    assert.equal(draft.claim, userClaim, 'user-provided claim must be preserved verbatim');
  }],

  ['getPaperSuggestion returns prefill values for the modal (M7)', () => {
    resetAll();
    const analysis = makeAnalysis({ signature: 'sig_suggestion', instability: 18, grade: 'single_rune' });
    recordDiscovery(analysis);
    recordDiscovery(analysis);
    recordDiscovery(analysis);

    const suggestion = getPaperSuggestion('sig_suggestion', 'new_discovery');
    assert.equal(suggestion.ok, true);
    assert.ok(suggestion.discovery, 'discovery must be returned');
    assert.equal(suggestion.evidence.reproductionCount, 3);
    assert.equal(typeof suggestion.suggestedTitle, 'string');
    assert.ok(suggestion.suggestedTitle.length > 0, 'suggested title must be non-empty prefill');
    assert.equal(typeof suggestion.suggestedClaim, 'string');
    assert.ok(suggestion.suggestedClaim.length > 0, 'suggested claim must be non-empty prefill');

    // 알 수 없는 signature는 ok:false 로 반환
    const missing = getPaperSuggestion('sig_does_not_exist', 'new_discovery');
    assert.equal(missing.ok, false);
  }],

  ['economy grants, contracts, and scroll sales update funds', () => {
    resetAll();
    const analysis = makeAnalysis({ signature: 'sig_scroll', instability: 15, resonance: 30, grade: 'phrase' });
    recordDiscovery(analysis);
    recordDiscovery(analysis);
    recordDiscovery(analysis);

    const grant = applyForGrant('grant_foundation_basic');
    assert.equal(grant.ok, true);
    assert.equal(gameState.resources.researchFunds, 800);

    const contract = signContract('contract_barrier_maintenance');
    assert.equal(contract.ok, true);
    assert.equal(gameState.resources.researchFunds, 1050);

    const sold = sellScroll('sig_scroll', analysis);
    assert.equal(sold.ok, true);
    assert.ok(sold.price >= 50);
    assert.ok(gameState.resources.researchFunds > 1050);

    const weeklyIncome = tickEconomyWeek();
    assert.equal(weeklyIncome, 90);
  }],

  ['schedule event queue dispatches due events on advanceDay (M8)', () => {
    resetAll();
    const startWeek = gameState.progression.currentWeek;
    const startDay = gameState.progression.currentDay;

    const fired = [];
    const handler = (e) => fired.push(e);
    onBus('paper:review_due', handler);

    enqueueEvent({ delayDays: 3, type: 'paper:review_due', payload: { paperId: 'p_42' }, label: 'review' });
    enqueueEvent({ delayDays: 5, type: 'paper:review_due', payload: { paperId: 'p_99' }, label: 'review' });

    assert.equal(getPendingEvents().length, 2);

    const r1 = advanceDay(2);
    assert.equal(r1.firedEvents.length, 0, 'no event should fire before delay');
    assert.equal(fired.length, 0);
    assert.equal(getPendingEvents().length, 2);

    const r2 = advanceDay(2);
    assert.equal(r2.firedEvents.length, 1, 'first event should fire on day 4 (delay=3 from start day+1)');
    assert.equal(fired.length, 1);
    assert.equal(fired[0].payload.paperId, 'p_42');
    assert.equal(getPendingEvents().length, 1);

    const r3 = advanceDay(3);
    assert.equal(r3.firedEvents.length, 1);
    assert.equal(fired.length, 2);
    assert.equal(fired[1].payload.paperId, 'p_99');
    assert.equal(getPendingEvents().length, 0);

    // 같은 이벤트가 중복 발사되지 않아야 함
    advanceDay(5);
    assert.equal(fired.length, 2, 'fired events must not refire on subsequent advanceDay');

    // 시간이 흘렀음을 확인
    assert.ok(gameState.progression.currentWeek > startWeek
      || gameState.progression.currentDay > startDay,
      'time must have progressed');

    offBus('paper:review_due', handler);
  }],

  ['initPaperSystem is idempotent — review listener is registered exactly once', () => {
    resetAll();
    // 단위 테스트 진입 시점에 이미 한 번 호출된 상태. 다시 100번 호출해도
    // 'paper:review_due' 핸들러가 중복 등록되지 않아야 한다.
    for (let i = 0; i < 100; i++) initPaperSystem();

    const analysis = makeAnalysis({ signature: 'sig_idempotent', instability: 18, grade: 'single_rune' });
    recordDiscovery(analysis);
    recordDiscovery(analysis);
    recordDiscovery(analysis);

    const draft = createPaperDraft({
      discoverySignature: 'sig_idempotent',
      type: 'new_discovery',
      targetSociety: 'basic_magic_society',
    });
    submitPaper(draft.id);

    // submitPaper 가 정확히 1개의 review_due 이벤트를 enqueue 한다.
    const before = gameState.papers.accepted.length;
    advanceDay(3);
    // 만약 listener 가 중복 등록됐다면 runDuePaperReview 가 N번 불려서 finalize
    // 가 N번 일어나고 accepted 도 중복으로 push 되어 카운트가 2 이상이 된다.
    assert.equal(gameState.papers.accepted.length - before, 1,
      `expected exactly one accept after schedule fires (listener double-fire?), got delta=${gameState.papers.accepted.length - before}`);
    assert.equal(gameState.papers.submitted.length, 0,
      'submitted must be drained exactly once');
  }],

  ['consumeTime auto-progresses time and dispatches events between (M8)', () => {
    resetAll();
    const fired = [];
    const handler = (e) => fired.push(e.payload?.tag);
    onBus('lecture:scheduled', handler);

    enqueueEvent({ delayDays: 1, type: 'lecture:scheduled', payload: { tag: 'A' } });
    enqueueEvent({ delayDays: 4, type: 'lecture:scheduled', payload: { tag: 'B' } });

    const result = consumeTime(5, { source: 'expedition_test' });
    assert.equal(fired.length, 2, `expected both events to fire, got ${JSON.stringify(fired)}`);
    assert.deepEqual(fired, ['A', 'B'], 'events must fire in chronological order');
    assert.ok(Array.isArray(result.firedEvents));
    assert.equal(result.firedEvents.length, 2);

    offBus('lecture:scheduled', handler);
  }],

  ['expeditions complete through schedule progression and unlock materials', () => {
    resetAll();
    const originalRandom = Math.random;
    Math.random = () => 0.95;

    try {
      const started = startExpedition('site_ruins_of_ignar');
      assert.equal(started.ok, true);
      assert.equal(gameState.expeditions.active.length, 1);
      assert.equal(gameState.resources.researchFunds, 300);

      const progressed = advanceDay(3);
      assert.equal(progressed.completedExpeditions.length, 1);
      assert.equal(gameState.expeditions.completed.length, 1);
      assert.ok(gameState.progression.unlockedMaterials.includes('water'));
    } finally {
      Math.random = originalRandom;
    }
  }],

  ['phase progression advances when score, papers, discoveries, and exams are satisfied', () => {
    resetAll();
    gameState.resources.degreeScore = 120;
    gameState.papers.accepted = [{ id: 'p1' }, { id: 'p2' }];
    gameState.discoveries.bySignature = { a: {}, b: {}, c: {} };
    gameState.discoveries.recentSignatures = ['a', 'b', 'c'];

    const midterm = takeMidtermExam();
    const final = takeFinalExam();
    assert.equal(midterm.passed, true);
    assert.equal(final.passed, true);

    const phase = checkPhaseProgress();
    assert.equal(phase.promoted, true);
    assert.equal(gameState.progression.currentPhase, 2);
    assert.ok(gameState.progression.unlockedMaterials.includes('water'));
  }],

  ['grammar adapters normalize connectors, roles, and sentence structure', () => {
    resetAll();

    const rawSentence = {
      kind: 'sentence',
      directionKey: 'leftToRight',
      pattern: 'S-V-O',
      detail: '열기 THEN 대지',
      mainUnits: [
        { name: '열기(△)', center: { x: 10, y: 10 } },
        { name: '대지(ㅡ)', center: { x: 50, y: 10 } },
        { name: '이사(|)', center: { x: 30, y: 10 } },
      ],
      connectors: [
        { english: 'THEN', fn: '순차', between: ['열기(△)', '대지(ㅡ)'], desc: '왼→오 차례로' },
      ],
    };

    const boneInteraction = {
      kind: 'bridging',
      detail: '점선 (···)',
      powerMul: 0.5,
      instabilityDelta: -5,
    };

    const connectors = analyzeConnectorLines({ boneInteraction, sentence: rawSentence });
    assert.equal(connectors.operators.includes('THEN'), true);
    assert.equal(connectors.operators.includes('IF'), true);

    const particles = {
      kind: 'particle',
      runes: [
        {
          unit: { name: '열기(△)' },
          powerMul: 1.5,
          particles: [
            { family: 'case', key: 'nominative', meta: {} },
            { family: 'intensity', key: 'strong', meta: { powerMul: 1.5 } },
          ],
        },
        {
          unit: { name: '대지(ㅡ)' },
          powerMul: 1,
          particles: [
            { family: 'case', key: 'accusative', meta: {} },
          ],
        },
      ],
    };

    const grammar = analyzeGrammarTokens({
      sentence: rawSentence,
      particles,
      connectorLines: connectors,
    });
    assert.equal(grammar.operators.includes('THEN'), true);
    assert.equal(grammar.roles.some((role) => role.role === 'subject'), true);
    assert.equal(grammar.roles.some((role) => role.role === 'object'), true);

    const sentence = analyzeSentenceStructure({
      units: rawSentence.mainUnits,
      arrangement: { kind: 'linear', units: rawSentence.mainUnits },
      connectors,
      grammar,
      boneInteractions: [{ type: 'bridging' }],
      material: 'parchment',
      rawSentence,
    });
    assert.equal(sentence.readingOrder, 'left_to_right');
    assert.equal(sentence.pattern, 'SVO');
    assert.equal(sentence.grade, 'phrase');
  }],

  ['rune drawing strokes are recognized as known runes', () => {
    resetAll();
    const recognizer = new RecognitionEngine();
    const tiwaz = makeTiwaz();
    const isa = makeIsa();

    assert.equal(recognizer.identifyRune(tiwaz), '티와즈(↑)');
    assert.equal(recognizer.identifyRune(isa), '이사(|)');

    const analyzed = recognizer.analyzeRune(tiwaz, []);
    assert.equal(analyzed.meaning.includes('티와즈(↑)'), true);
  }],

  ['arrangement analyzer detects linear rune layouts from drawn strokes', () => {
    resetAll();
    const recognizer = new RecognitionEngine();
    const runeStrokes = [
      ...makeIsa(0, 0),
      ...makeIsa(140, 0),
      ...makeIsa(280, 0),
    ];

    const arrangement = analyzeArrangement({
      runeStrokes,
      boneStrokes: [],
      recognizer,
      compoundName: null,
    });

    assert.equal(arrangement.kind, 'linear');
    assert.equal(arrangement.runeCount >= 3, true);
  }],

  ['bone interaction detects enclosing circle around a rune', () => {
    resetAll();
    const runeStrokes = makeIsa(0, 0);
    const boneStrokes = [makeCircleStroke(50, 50, 70)];

    const interaction = analyzeBoneInteraction({
      runeStrokes,
      boneStrokes,
      boneFirst: true,
    });

    assert.equal(interaction.kind, 'enclosing');
    assert.equal(interaction.label, '가두기');
  }],

  ['magic pipeline integrates drawn strokes into a structured analysis', () => {
    resetAll();
    const recognizer = new RecognitionEngine();
    const runeStrokes = makeTiwaz(0, 0);
    const boneStrokes = makeTriangleBones(0, 10);
    const allStrokes = [...boneStrokes, ...runeStrokes];

    const analysis = analyzeMagic({
      runeStrokes,
      boneStrokes,
      allStrokes,
      material: 'parchment',
      recognizer,
    });

    assert.equal(typeof analysis.discovery.signature, 'string');
    assert.equal(analysis.legacy.meaning.includes('티와즈(↑)'), true);
    assert.equal(analysis._raw.boneInteraction.shape, 'triangle');
    assert.equal(analysis.legacy.meaning.includes('[관통]'), true);
    assert.equal(typeof analysis.observables.heat, 'number');
  }],

  ['assignment daily quest labels do not leak legacy answer names (blind mode §11)', () => {
    resetAll();
    const sys = new AssignmentSystem();
    sys._generateDailyQuests();

    const LEGACY_NAMES = [
      '이사', '대지', '게보', '알기즈', '티와즈',
      '하갈라즈', '에와즈', '열기', '나우디즈',
      '라구즈', '케나즈', '다가즈',
      '마그마', '폭발', '봉인된 태양',
    ];

    assert.ok(sys.dailyQuests.length > 0, 'expected at least one daily quest');

    for (const quest of sys.dailyQuests) {
      for (const legacy of LEGACY_NAMES) {
        assert.ok(
          !quest.label.includes(legacy),
          `quest.label "${quest.label}" leaks legacy name "${legacy}"`
        );
      }
    }

    for (const legacy of LEGACY_NAMES) {
      assert.ok(
        !sys.message.includes(legacy),
        `message "${sys.message}" leaks legacy name "${legacy}"`
      );
    }
  }],

  ['assignment cast miss message hides the legacy meaning of drawn rune (blind mode §11)', () => {
    resetAll();
    const sys = new AssignmentSystem();
    sys.dailyQuests = [
      { match: '이사(|)', label: 'Ⅰ — 수직 직선 1획', sketch: '', isStudy: false, done: false },
    ];

    const result = sys.cast({
      meaning: '열기(△)',
      compoundName: null,
    });

    assert.equal(result.result, 'miss');
    assert.ok(!sys.message.includes('열기'), `miss message leaks "열기": ${sys.message}`);
    assert.ok(!sys.message.includes('△'), `miss message leaks "△": ${sys.message}`);

    const compoundResult = sys.cast({
      meaning: '열기(△) + 대지(ㅡ)',
      compoundName: '마그마',
    });

    assert.equal(compoundResult.result, 'miss');
    assert.ok(!sys.message.includes('마그마'), `miss message leaks "마그마": ${sys.message}`);
  }],

  ['canvas systemStatus does not leak legacy rune names by default (blind mode §11)', () => {
    resetAll();

    const LEGACY_NAMES = [
      '이사', '대지', '게보', '알기즈', '티와즈',
      '하갈라즈', '에와즈', '열기', '나우디즈',
      '라구즈', '케나즈', '다가즈',
      '마그마', '폭발', '봉인된 태양',
    ];

    // 5가지 분기를 모두 통과시켜 §11 위반이 한 곳도 없는지 확인.
    const cases = [
      { instability: 95, currentMeaning: '이사(|)', currentDynamics: '관통', hasLiveStroke: true, canCast: false }, // 붕괴 임박
      { instability: 30, currentCompound: '마그마', currentDynamics: '분출', hasLiveStroke: true, canCast: true },   // 결합 발현
      { instability: 30, currentCompound: '마그마', currentDynamics: '분출', hasLiveStroke: true, canCast: false },  // 결합 감지
      { instability: 30, currentMeaning: '나우디즈(+)', currentDynamics: '집중', hasLiveStroke: true, canCast: true }, // 발현 중
      { instability: 30, currentMeaning: '열기(△)', currentDynamics: '', hasLiveStroke: true, canCast: false },     // 분석 중
      { instability: 0,  currentMeaning: '', currentCompound: '', currentDynamics: '', hasLiveStroke: false, canCast: false }, // 대기
    ];

    for (const input of cases) {
      const out = formatCanvasStatus(input, { debugShowLegacyNames: false });
      for (const legacy of LEGACY_NAMES) {
        assert.ok(
          !out.text.includes(legacy),
          `formatCanvasStatus("${out.text}") leaks legacy name "${legacy}" for input ${JSON.stringify(input)}`
        );
      }
    }

    const cast = formatCastInjection({ currentMeaning: '나우디즈(+)' }, { debugShowLegacyNames: false });
    for (const legacy of LEGACY_NAMES) {
      assert.ok(
        !cast.includes(legacy),
        `formatCastInjection("${cast}") leaks legacy name "${legacy}"`
      );
    }
  }],

  ['canvas systemStatus appends legacy names when debugShowLegacyNames is on (M6 dev toggle)', () => {
    resetAll();
    const status = formatCanvasStatus(
      { instability: 30, currentMeaning: '나우디즈(+)', currentDynamics: '집중', hasLiveStroke: true, canCast: true },
      { debugShowLegacyNames: true }
    );
    assert.ok(status.text.includes('나우디즈'), `debug status should include legacy: ${status.text}`);

    const cast = formatCastInjection({ currentMeaning: '나우디즈(+)' }, { debugShowLegacyNames: true });
    assert.ok(cast.includes('나우디즈'), `debug cast injection should include legacy: ${cast}`);
  }],

  ['rift game rewards a correctly drawn rune cast', () => {
    resetAll();
    const rift = new RiftGame();
    const originalNow = globalThis.performance.now.bind(globalThis.performance);
    globalThis.performance.now = () => 0;

    try {
      rift.start();
      rift.demand = {
        match: '이사(|)',
        label: '이사 (Ⅰ)',
        sketch: '',
      };
      rift.timeRemaining = 10;

      const result = rift.cast({
        meaning: '이사(|)',
        compoundName: null,
        arrangement: { kind: 'none', powerMul: 1 },
        boneInteraction: { kind: 'none', powerMul: 1 },
        sentence: { kind: 'word', powerMul: 1, label: '단어' },
        particles: { kind: 'none', powerMul: 1 },
      });

      assert.equal(result.result, 'success');
      assert.ok(rift.score > 0);
      assert.ok(rift.threat <= 0);
    } finally {
      globalThis.performance.now = originalNow;
    }
  }],

  ['paperSystem returns score and reviewerVoice for basic society (M7)', () => {
    resetAll();
    const analysis = makeAnalysis({ signature: 'sig_voice', instability: 18, grade: 'single_rune' });
    recordDiscovery(analysis);
    recordDiscovery(analysis);
    recordDiscovery(analysis);

    const draft = createPaperDraft({
      discoverySignature: 'sig_voice',
      type: 'new_discovery',
      targetSociety: 'basic_magic_society',
    });
    submitPaper(draft.id);
    const review = runDuePaperReview(draft.id);
    assert.ok(review, 'review must be produced after submission');
    assert.equal(review.accepted, true);
    assert.equal(typeof review.score, 'number');
    assert.ok(review.score >= 60, `expected score >= acceptThreshold, got ${review.score}`);
    assert.ok(review.score <= 100);
    assert.equal(typeof review.reviewerVoice, 'string');
    assert.ok(review.reviewerVoice.length > 0, 'reviewerVoice must be non-empty for accepted basic submission');
  }],

  ['canon data exposes 5+ entries spanning thermo/forbidden coverage (M7)', () => {
    const entries = getCanonEntries();
    assert.ok(entries.length >= 5, `expected at least 5 canon entries, got ${entries.length}`);
    const ids = entries.map((c) => c.id);
    assert.ok(ids.includes('canon_004'), 'canon_004 (서리 결정 정설) must be present');
    assert.ok(ids.includes('canon_005'), 'canon_005 (심연 종소리 정설) must be present');
    const c4 = entries.find((c) => c.id === 'canon_004');
    assert.equal(c4.challengeable, true, 'canon_004 must be challengeable');
    const c5 = entries.find((c) => c.id === 'canon_005');
    assert.equal(c5.discoveredBy, '금서 마법 학회');
  }],

  ['challenge paper accepted on high society writes canon override (M7)', () => {
    resetAll();
    const sig = 'sig_canon_challenge';
    // 10회 재현된 sentence-grade 발견을 만들어 high society 가산점 확보
    const analysis = makeAnalysis({ signature: sig, instability: 30, grade: 'sentence', rawSentenceGrade: '문장' });
    recordDiscovery(analysis);
    for (let i = 0; i < 11; i++) recordDiscovery(analysis);
    assert.ok(getDiscovery(sig).reproducibility.count >= 10);

    // 정설 미스매치를 직접 주입 (academicCanon 분석 경로를 우회)
    gameState.academic.canonMismatches.push({
      id: `mismatch_canon_004_${sig}`,
      canonId: 'canon_004',
      canonTitle: '서리 결정 정설',
      canonOfficialName: '서리 결정',
      signature: sig,
      discoverySignature: sig,
      reasons: ['dynamics mismatch'],
      actualObservables: { dynamics: '냉각', instabilityBand: 30 },
      message: 'test mismatch',
      createdAt: Date.now(),
    });

    const draft = createPaperDraft({
      discoverySignature: sig,
      type: 'challenge',
      targetSociety: 'high_magic_society',
      title: '서리 결정 정설 반박',
    });
    submitPaper(draft.id);
    const review = runDuePaperReview(draft.id);
    assert.ok(review, 'review must be produced after submission');

    assert.equal(review.accepted, true, `expected accept; got reasons=${JSON.stringify(review.reasons)} score=${review.score}`);
    assert.ok(review.canonOverride, 'canonOverride must be recorded on accepted challenge');
    assert.equal(review.canonOverride.canonId, 'canon_004');
    assert.equal(gameState.academic.canonOverrides['canon_004'].overriddenByTitle, '서리 결정 정설 반박');
    assert.equal(review.reviewerVoice.length > 0, true);
  }],

  ['challenge paper to high society falls into disputed when score is mid-range (M7)', () => {
    resetAll();
    const sig = 'sig_disputed';
    // 5회 재현 sentence-grade — high society 점수가 60점 부근으로 acceptThreshold 70 미달, rejectThreshold 45 초과
    const analysis = makeAnalysis({ signature: sig, instability: 30, grade: 'sentence', rawSentenceGrade: '문장' });
    for (let i = 0; i < 5; i++) recordDiscovery(analysis);

    gameState.academic.canonMismatches.push({
      id: `mismatch_canon_005_${sig}`,
      canonId: 'canon_005',
      canonTitle: '심연 종소리 정설',
      canonOfficialName: '심연 종소리',
      signature: sig,
      discoverySignature: sig,
      reasons: ['dynamics mismatch'],
      actualObservables: { dynamics: '냉각', instabilityBand: 30 },
      message: 'test mismatch',
      createdAt: Date.now(),
    });

    const draft = createPaperDraft({
      discoverySignature: sig,
      type: 'challenge',
      targetSociety: 'high_magic_society',
    });

    let disputedFired = null;
    const handler = (e) => { disputedFired = e; };
    onBus('paper:disputed', handler);

    submitPaper(draft.id);
    const review = runDuePaperReview(draft.id);
    assert.ok(review, 'review must be produced after submission');

    assert.equal(review.accepted, false);
    assert.equal(review.disputed, true, `expected disputed; got score=${review.score} reasons=${JSON.stringify(review.reasons)}`);
    assert.ok(review.score >= 45 && review.score < 70, `disputed score must be mid-range, got ${review.score}`);
    assert.equal(gameState.papers.disputes.length, 1);
    assert.equal(gameState.papers.disputes[0].status, 'disputed');
    assert.equal(gameState.papers.accepted.length, 0);
    assert.equal(gameState.papers.rejected.length, 0);
    assert.ok(disputedFired, 'paper:disputed event must fire');
    assert.ok(!gameState.academic.canonOverrides['canon_005'], 'no override should be written for disputed challenge');

    offBus('paper:disputed', handler);
  }],

  ['basic society rejects challenge paper via hard gate (M7)', () => {
    resetAll();
    const sig = 'sig_basic_challenge';
    const analysis = makeAnalysis({ signature: sig, instability: 18, grade: 'single_rune' });
    for (let i = 0; i < 5; i++) recordDiscovery(analysis);

    gameState.academic.canonMismatches.push({
      id: `mismatch_canon_001_${sig}`,
      canonId: 'canon_001',
      canonTitle: '봉인된 달 정설',
      canonOfficialName: '봉인된 달',
      signature: sig,
      discoverySignature: sig,
      reasons: ['dynamics mismatch'],
      actualObservables: {},
      message: 'test mismatch',
      createdAt: Date.now(),
    });

    const draft = createPaperDraft({
      discoverySignature: sig,
      type: 'challenge',
      targetSociety: 'basic_magic_society',
    });
    submitPaper(draft.id);
    const review = runDuePaperReview(draft.id);
    assert.ok(review, 'review must be produced after submission');

    assert.equal(review.accepted, false);
    assert.equal(review.disputed, false, 'hard-gate rejection must not become disputed');
    assert.equal(review.score, 0);
    assert.ok(review.reasons.some((r) => r.includes('도전 논문')), `expected hard-gate reason, got ${JSON.stringify(review.reasons)}`);
    assert.equal(gameState.papers.rejected.length, 1);
  }],

  ['ACTION_COSTS exposes positive day costs for paper / grant / contract / scroll (M8)', () => {
    assert.equal(typeof ACTION_COSTS, 'object');
    assert.ok(ACTION_COSTS.createPaperDraft >= 1, 'createPaperDraft must consume >= 1 day');
    assert.ok(ACTION_COSTS.applyForGrant >= 1, 'applyForGrant must consume >= 1 day');
    assert.ok(ACTION_COSTS.signContract >= 1, 'signContract must consume >= 1 day');
    assert.ok(ACTION_COSTS.sellScroll >= 1, 'sellScroll must consume >= 1 day');
    assert.equal(ACTION_COSTS.submitPaper, 0, 'submitPaper must be free since review queue handles its own delay');
  }],

  ['consumeForAction(unknown) is a no-op and returns 0 days (M8)', () => {
    resetAll();
    const startWeek = gameState.progression.currentWeek;
    const startDay = gameState.progression.currentDay;
    const consumed = consumeForAction('this_action_does_not_exist');
    assert.equal(consumed, 0);
    assert.equal(gameState.progression.currentWeek, startWeek);
    assert.equal(gameState.progression.currentDay, startDay);
  }],

  ['createPaperDraft consumes ACTION_COSTS.createPaperDraft days and dispatches due events (M8)', () => {
    resetAll();
    const analysis = makeAnalysis({ signature: 'sig_paper_time', instability: 18, grade: 'single_rune' });
    recordDiscovery(analysis);
    recordDiscovery(analysis);
    recordDiscovery(analysis);

    const startDayIndex = (gameState.progression.currentWeek - 1) * 7 + gameState.progression.currentDay;

    const fired = [];
    const handler = (e) => fired.push(e.payload?.tag);
    onBus('lecture:scheduled', handler);
    enqueueEvent({ delayDays: 1, type: 'lecture:scheduled', payload: { tag: 'within_draft' } });
    enqueueEvent({ delayDays: ACTION_COSTS.createPaperDraft + 5, type: 'lecture:scheduled', payload: { tag: 'after_draft' } });

    const draft = createPaperDraft({
      discoverySignature: 'sig_paper_time',
      type: 'new_discovery',
      targetSociety: 'basic_magic_society',
    });

    const endDayIndex = (gameState.progression.currentWeek - 1) * 7 + gameState.progression.currentDay;
    assert.equal(endDayIndex - startDayIndex, ACTION_COSTS.createPaperDraft,
      `createPaperDraft must advance ${ACTION_COSTS.createPaperDraft} days, advanced ${endDayIndex - startDayIndex}`);
    assert.equal(draft.timeConsumed, ACTION_COSTS.createPaperDraft);
    assert.deepEqual(fired, ['within_draft'], 'queued event within draft window must fire; the later event must wait');

    offBus('lecture:scheduled', handler);
  }],

  ['applyForGrant / signContract / sellScroll each consume time and report timeConsumed (M8)', () => {
    resetAll();
    const startDayIndex = (gameState.progression.currentWeek - 1) * 7 + gameState.progression.currentDay;

    const grantResult = applyForGrant('grant_foundation_basic');
    assert.equal(grantResult.ok, true);
    assert.equal(grantResult.timeConsumed, ACTION_COSTS.applyForGrant);

    const contractResult = signContract('contract_barrier_maintenance');
    assert.equal(contractResult.ok, true);
    assert.equal(contractResult.timeConsumed, ACTION_COSTS.signContract);

    const analysis = makeAnalysis({ signature: 'sig_scroll_time', instability: 15, resonance: 30, grade: 'phrase' });
    recordDiscovery(analysis);
    recordDiscovery(analysis);
    recordDiscovery(analysis);
    const sold = sellScroll('sig_scroll_time', analysis);
    assert.equal(sold.ok, true);
    assert.equal(sold.timeConsumed, ACTION_COSTS.sellScroll);

    const endDayIndex = (gameState.progression.currentWeek - 1) * 7 + gameState.progression.currentDay;
    const expected = ACTION_COSTS.applyForGrant + ACTION_COSTS.signContract + ACTION_COSTS.sellScroll;
    assert.equal(endDayIndex - startDayIndex, expected,
      `combined economy actions must advance ${expected} days, advanced ${endDayIndex - startDayIndex}`);
  }],

  ['Phase 5 promotion unlocks voidstone material and canon registration ability (M8)', () => {
    resetAll();
    gameState.progression.currentPhase = 4;
    gameState.resources.degreeScore = 800;
    gameState.papers.accepted = Array.from({ length: 14 }, (_, i) => ({ id: `p${i}` }));
    gameState.discoveries.bySignature = Object.fromEntries(
      Array.from({ length: 16 }, (_, i) => [`sig_${i}`, { signature: `sig_${i}` }])
    );
    gameState.discoveries.recentSignatures = Object.keys(gameState.discoveries.bySignature);
    gameState.progression.exams = { midtermPassed: true, finalPassed: true };

    const phase5Events = [];
    const phaseHandler = (e) => phase5Events.push(e);
    onBus('phase:advanced', phaseHandler);

    const result = checkPhaseProgress();
    assert.equal(result.promoted, true);
    assert.equal(result.phase, 5);
    assert.deepEqual(result.abilities, ['register_canon']);
    assert.equal(gameState.progression.currentPhase, 5);
    assert.equal(gameState.progression.canRegisterCanon, true);
    assert.ok(gameState.progression.unlockedMaterials.includes('voidstone'),
      `voidstone must unlock at Phase 5; got ${JSON.stringify(gameState.progression.unlockedMaterials)}`);
    assert.equal(phase5Events.length, 1);
    assert.deepEqual(phase5Events[0].abilities, ['register_canon']);

    offBus('phase:advanced', phaseHandler);
  }],

  ['Phase 5 promotion is gated by full requirement set (M8)', () => {
    resetAll();
    gameState.progression.currentPhase = 4;
    // 점수만 충족, 논문/발견 부족
    gameState.resources.degreeScore = 800;
    gameState.papers.accepted = [{ id: 'p1' }];
    gameState.discoveries.bySignature = { only_one: {} };
    gameState.discoveries.recentSignatures = ['only_one'];
    gameState.progression.exams = { midtermPassed: true, finalPassed: true };

    const result = checkPhaseProgress();
    assert.equal(result.promoted, false);
    assert.equal(gameState.progression.currentPhase, 4);
    assert.notEqual(gameState.progression.canRegisterCanon, true,
      'canRegisterCanon must remain false until Phase 5 promotion');
  }],

  ['classifyDiscoveryAgainstCanon returns unknown when no canon hint matches (M7 PR-F)', () => {
    resetAll();
    const result = classifyDiscoveryAgainstCanon('sig_no_canon_match');
    assert.equal(result.classification, 'unknown');
    assert.equal(result.canon, null);
    assert.equal(getCanonMatchForSignature('sig_no_canon_match'), null);
  }],

  ['classifyDiscoveryAgainstCanon returns known_correct when canon.isCorrect=true and observables match (M7 PR-F)', () => {
    resetAll();
    // canon_002 (기초 결계 정설, isCorrect=true) 와 일치하는 분석 시뮬레이션
    const sig = 'sig_known_correct';
    gameState.academic.canonMatches[sig] = {
      canonId: 'canon_002',
      observed: 'consistent',
      recordedAt: Date.now(),
    };

    const result = classifyDiscoveryAgainstCanon(sig);
    assert.equal(result.classification, 'known_correct');
    assert.ok(result.canon, 'canon must be returned');
    assert.equal(result.canon.id, 'canon_002');
    assert.equal(result.canon.isCorrect, true);
    assert.ok(result.reason.includes(result.canon.title));
  }],

  ['classifyDiscoveryAgainstCanon returns known_disputed when canon.isCorrect=false (M7 PR-F)', () => {
    resetAll();
    // canon_001 (봉인된 달, isCorrect=false) 매칭. observables 일치 여부와 무관하게 disputed.
    const sig = 'sig_known_disputed_wrong';
    gameState.academic.canonMatches[sig] = {
      canonId: 'canon_001',
      observed: 'consistent',
      recordedAt: Date.now(),
    };

    const result = classifyDiscoveryAgainstCanon(sig);
    assert.equal(result.classification, 'known_disputed');
    assert.equal(result.canon.id, 'canon_001');
    assert.equal(result.canon.isCorrect, false);
  }],

  ['classifyDiscoveryAgainstCanon returns known_disputed when observables conflict with correct canon (M7 PR-F)', () => {
    resetAll();
    const sig = 'sig_known_disputed_observed';
    // canon_002 (isCorrect=true) 매칭이지만 mismatch 도 등록된 경우 → disputed.
    gameState.academic.canonMatches[sig] = {
      canonId: 'canon_002',
      observed: 'inconsistent',
      recordedAt: Date.now(),
    };
    gameState.academic.canonMismatches.push({
      id: `mismatch_canon_002_${sig}`,
      canonId: 'canon_002',
      canonTitle: '기초 결계 정설',
      signature: sig,
      reasons: ['observable conflict'],
      createdAt: Date.now(),
    });

    const result = classifyDiscoveryAgainstCanon(sig);
    assert.equal(result.classification, 'known_disputed');
    assert.equal(result.canon.id, 'canon_002');
  }],

  ['reviewPaper hard-rejects new_discovery on known_correct canon (M7 PR-F)', () => {
    resetAll();
    const sig = 'sig_pr_f_known_correct';
    const analysis = makeAnalysis({ signature: sig, instability: 18, grade: 'single_rune' });
    recordDiscovery(analysis);
    recordDiscovery(analysis);
    recordDiscovery(analysis);

    // canon_002 매칭 (정설로 등재된 현상)
    gameState.academic.canonMatches[sig] = {
      canonId: 'canon_002',
      observed: 'consistent',
      recordedAt: Date.now(),
    };

    const draft = createPaperDraft({
      discoverySignature: sig,
      type: 'new_discovery',
      targetSociety: 'basic_magic_society',
    });
    submitPaper(draft.id);
    const review = runDuePaperReview(draft.id);

    assert.ok(review, 'review must be produced');
    assert.equal(review.accepted, false, 'known_correct + new_discovery must hard-reject');
    assert.equal(review.disputed, false);
    assert.equal(review.score, 0);
    assert.equal(review.classification.classification, 'known_correct');
    assert.ok(
      review.reasons.some((r) => r.includes('정설') && r.includes('등재')),
      `expected canon-rejection reason, got ${JSON.stringify(review.reasons)}`,
    );
    assert.equal(gameState.papers.rejected.length, 1);
    assert.equal(gameState.papers.accepted.length, 0);
    // 보상이 들어가지 않아야 함
    assert.equal(gameState.resources.degreeScore, 0);
  }],

  ['reviewPaper accepts new_discovery on known_disputed canon with score+reward penalty (M7 PR-F option B)', () => {
    resetAll();
    const sig = 'sig_pr_f_known_disputed';
    const analysis = makeAnalysis({ signature: sig, instability: 18, grade: 'single_rune' });
    recordDiscovery(analysis);
    recordDiscovery(analysis);
    recordDiscovery(analysis);

    // canon_001 매칭 (isCorrect=false, challengeable=true)
    gameState.academic.canonMatches[sig] = {
      canonId: 'canon_001',
      observed: 'consistent',
      recordedAt: Date.now(),
    };

    // 비교군: 페널티 없는 상태에서 같은 paper 가 받았을 base 점수/보상
    const baselineDraft = createPaperDraft({
      discoverySignature: sig,
      type: 'new_discovery',
      targetSociety: 'basic_magic_society',
    });
    // 비교만 위해 직접 reviewPaper 를 임시로 호출 (canonMatches 가 잡고 있어 이미 페널티 반영됨)
    const draftReview = reviewPaper({
      ...baselineDraft,
      discoverySignature: sig,
      evidence: baselineDraft.evidence,
    });
    // 위 시뮬레이션 review 는 finalize 안 했으므로 gameState 영향 없음 — draft 도 정리
    gameState.papers.drafts = gameState.papers.drafts.filter((p) => p.id !== baselineDraft.id);

    assert.equal(draftReview.classification.classification, 'known_disputed');
    assert.equal(draftReview.canonPenaltyApplied, true);
    assert.ok(
      draftReview.reasons.some((r) => r.includes('미세 기여') || r.includes('차감')),
      `expected penalty reason, got ${JSON.stringify(draftReview.reasons)}`,
    );

    // 실제 흐름: submitPaper → runDuePaperReview
    const draft = createPaperDraft({
      discoverySignature: sig,
      type: 'new_discovery',
      targetSociety: 'basic_magic_society',
    });
    submitPaper(draft.id);
    const review = runDuePaperReview(draft.id);

    assert.ok(review);
    assert.equal(review.classification.classification, 'known_disputed');
    assert.equal(review.canonPenaltyApplied, true);

    // multiplier=0.7 → 잘 쓴 disputed paper 는 basic 학회 (acceptThreshold=60) 통과 가능.
    // 위 reproduction 3회 + single_rune + instability=18 + new_discovery 조합의
    // raw score 는 90 (=25+25+25+15). 0.7 곱 → 63 으로 60 통과.
    assert.equal(review.accepted, true,
      `disputed paper with raw=90 must pass basic acceptThreshold=60 after 0.7 multiplier (got score=${review.score})`);
    assert.ok(review.score >= 60 && review.score < 90,
      `disputed score must be reduced from raw 90 but >= 60, got ${review.score}`);

    // basic_magic_society base rewards: degreeScore=15, reputation=8, researchFunds=300.
    // multiplier=0.7 → round(15*0.7)=11 / round(8*0.7)=6 / round(300*0.7)=210.
    assert.ok(review.grantedRewards, 'grantedRewards must be present on accepted disputed paper');
    assert.ok(
      review.grantedRewards.degreeScore < 15,
      `degreeScore reward must be reduced (<15), got ${review.grantedRewards.degreeScore}`,
    );
    assert.ok(
      review.grantedRewards.researchFunds < 300,
      `researchFunds reward must be reduced (<300), got ${review.grantedRewards.researchFunds}`,
    );
    assert.equal(gameState.resources.degreeScore, review.grantedRewards.degreeScore);
    assert.equal(gameState.resources.researchFunds, 500 + review.grantedRewards.researchFunds);
  }],

  ['reviewPaper accepts new_discovery on unknown signature with full rewards (M7 PR-F)', () => {
    resetAll();
    const sig = 'sig_pr_f_unknown';
    const analysis = makeAnalysis({ signature: sig, instability: 18, grade: 'single_rune' });
    recordDiscovery(analysis);
    recordDiscovery(analysis);
    recordDiscovery(analysis);

    // canonMatches 가 비어있는 상태 → unknown
    assert.equal(getCanonMatchForSignature(sig), null);

    const draft = createPaperDraft({
      discoverySignature: sig,
      type: 'new_discovery',
      targetSociety: 'basic_magic_society',
    });
    submitPaper(draft.id);
    const review = runDuePaperReview(draft.id);

    assert.ok(review);
    assert.equal(review.classification.classification, 'unknown');
    assert.equal(review.canonPenaltyApplied, false);
    assert.equal(review.accepted, true);
    // 풀 보상이 들어와야 함 (basic society: 15 / 8 / 300)
    assert.equal(gameState.resources.degreeScore, 15);
    assert.equal(gameState.resources.reputation, 8);
    assert.equal(gameState.resources.researchFunds, 500 + 300);
  }],

  ['getEligiblePaperPlans hides new_discovery for known_correct canon (M7 PR-F)', () => {
    resetAll();
    const sig = 'sig_pr_f_eligible_correct';
    const analysis = makeAnalysis({ signature: sig, instability: 18, grade: 'single_rune' });
    recordDiscovery(analysis);
    recordDiscovery(analysis);
    recordDiscovery(analysis);

    gameState.academic.canonMatches[sig] = {
      canonId: 'canon_002',
      observed: 'consistent',
      recordedAt: Date.now(),
    };

    const plans = getEligiblePaperPlans();
    const plan = plans.find((p) => p.signature === sig);
    // mismatch 도 sentence_formula 도 없으므로 plan 자체가 비어있어야 함 (types 0개 → plans 에서 제외)
    assert.equal(plan, undefined,
      `known_correct discovery must not surface as a paper plan (got ${JSON.stringify(plan)})`);
  }],

  ['getEligiblePaperPlans keeps new_discovery for known_disputed canon (M7 PR-F)', () => {
    resetAll();
    const sig = 'sig_pr_f_eligible_disputed';
    const analysis = makeAnalysis({ signature: sig, instability: 18, grade: 'single_rune' });
    recordDiscovery(analysis);
    recordDiscovery(analysis);
    recordDiscovery(analysis);

    // canon_001 (isCorrect=false) → disputed. new_discovery 옵션은 살아있어야 함.
    gameState.academic.canonMatches[sig] = {
      canonId: 'canon_001',
      observed: 'consistent',
      recordedAt: Date.now(),
    };

    const plans = getEligiblePaperPlans();
    const plan = plans.find((p) => p.signature === sig);
    assert.ok(plan, 'known_disputed discovery must still surface as a paper plan');
    assert.ok(plan.types.includes('new_discovery'),
      `new_discovery must remain available for disputed canon, got types=${JSON.stringify(plan.types)}`);
    assert.equal(plan.classification.classification, 'known_disputed');
  }],

  ['getEligiblePaperPlans gates refinement on repro >= 3 (balance)', () => {
    resetAll();
    const sig = 'sig_refinement_repro_gate';
    // 단 1회 관측만 한 시그니처. mismatch 가 있어도 표본이 부족하므로 refinement
    // 옵션이 노출되어선 안 된다 (단발 관측으로 basic 학회 통과를 막기 위한 floor).
    // grade='sentence' 로 두면 sentence_formula 가 fallback type 으로 살아있어서
    // plan 자체는 surface 되고, refinement 만 정확히 빠져 있는지 검증할 수 있다.
    const analysis = makeAnalysis({ signature: sig, instability: 30, grade: 'sentence', rawSentenceGrade: '문장' });
    recordDiscovery(analysis);
    assert.equal(getDiscovery(sig).reproducibility.count, 1);

    gameState.academic.canonMismatches.push({
      id: `mismatch_canon_004_${sig}`,
      canonId: 'canon_004',
      canonTitle: '서리 결정 정설',
      canonOfficialName: '서리 결정',
      signature: sig,
      discoverySignature: sig,
      reasons: ['dynamics mismatch'],
      actualObservables: { dynamics: '냉각', instabilityBand: 30 },
      message: 'test mismatch',
      createdAt: Date.now(),
    });

    let plans = getEligiblePaperPlans();
    let plan = plans.find((p) => p.signature === sig);
    assert.ok(plan, 'plan must surface (sentence_formula keeps it alive)');
    assert.ok(!plan.types.includes('refinement'),
      `refinement must be gated until repro >= 3, got types=${JSON.stringify(plan.types)}`);
    assert.ok(!plan.types.includes('new_discovery'),
      `new_discovery must also be gated at repro=1, got types=${JSON.stringify(plan.types)}`);

    // 재현 2회 더 누적 → repro=3 → refinement 가 풀린다.
    recordDiscovery(analysis);
    recordDiscovery(analysis);
    assert.equal(getDiscovery(sig).reproducibility.count, 3);

    plans = getEligiblePaperPlans();
    plan = plans.find((p) => p.signature === sig);
    assert.ok(plan, 'plan must still surface at repro=3');
    assert.ok(plan.types.includes('refinement'),
      `refinement must unlock at repro=3, got types=${JSON.stringify(plan.types)}`);
  }],

  ['inspectCanonMismatch records canonMatches entry on hint match (M7 PR-F)', () => {
    resetAll();
    // canon_001 legacyHint = { mainRune: '원(○)', radical: '이사(|)', position: 'middle' }
    // matchesCanonHint 는 둘 다 legacyMeaning 안에 들어 있어야 통과한다.
    const sig = 'sig_pr_f_match_record';
    const analysis = makeAnalysis({
      signature: sig,
      meaning: '원(○) + 이사(|)',
      dynamics: '갇힘(침묵)',
      instability: 35,
    });
    inspectCanonMismatch(analysis);

    const match = getCanonMatchForSignature(sig);
    assert.ok(match, 'inspectCanonMismatch must record a canonMatch when hint matches');
    assert.equal(match.canonId, 'canon_001');
    // 관측값이 정설과 정확히 일치 (dynamics='갇힘(침묵)', instability~=35) → 'consistent' 으로 기록
    assert.equal(match.observed, 'consistent');
  }],

  ['registerCanon hard-rejects when canRegisterCanon flag is off (M9 PR-I)', () => {
    resetAll();
    gameState.progression.canRegisterCanon = false;
    gameState.papers.accepted.unshift({
      id: 'paper_test_phase_gate',
      type: 'challenge',
      title: '서리 결정 정설 반박',
      review: { canonOverride: { canonId: 'canon_004', canonTitle: '서리 결정 정설' } },
    });
    const result = registerCanon('paper_test_phase_gate');
    assert.equal(result.ok, false);
    assert.match(result.reason, /Phase 5/);
  }],

  ['registerCanon rejects new_discovery papers (M9 PR-I)', () => {
    resetAll();
    gameState.progression.canRegisterCanon = true;
    gameState.papers.accepted.unshift({
      id: 'paper_test_wrong_type',
      type: 'new_discovery',
      title: '신규 현상 보고',
      review: { canonOverride: { canonId: 'canon_004', canonTitle: '서리 결정 정설' } },
    });
    const result = registerCanon('paper_test_wrong_type');
    assert.equal(result.ok, false);
    assert.match(result.reason, /도전·보완/);
  }],

  ['registerCanon rejects when paper has no canonOverride (M9 PR-I)', () => {
    resetAll();
    gameState.progression.canRegisterCanon = true;
    gameState.papers.accepted.unshift({
      id: 'paper_test_no_override',
      type: 'challenge',
      title: '갱신 대상 없는 도전',
      review: { /* canonOverride absent */ },
    });
    const result = registerCanon('paper_test_no_override');
    assert.equal(result.ok, false);
    assert.match(result.reason, /갱신 대상/);
  }],

  ['registerCanon grants rewards / writes registered slot / fires event / consumes 5 days (M9 PR-I)', () => {
    resetAll();
    gameState.progression.canRegisterCanon = true;
    const baselineDegree = gameState.resources.degreeScore;
    const baselineRep = gameState.resources.reputation;
    const baselineFunds = gameState.resources.researchFunds;
    const baselineWeek = gameState.progression.currentWeek;
    const baselineDay = gameState.progression.currentDay;

    gameState.academic.canonOverrides['canon_004'] = {
      canonId: 'canon_004',
      canonTitle: '서리 결정 정설',
      overriddenBy: 'paper_test_full',
      overriddenByTitle: '서리 결정 정설 반박',
      score: 85,
    };
    gameState.papers.accepted.unshift({
      id: 'paper_test_full',
      type: 'challenge',
      title: '서리 결정 정설 반박',
      authorName: '플레이어',
      review: {
        canonOverride: gameState.academic.canonOverrides['canon_004'],
      },
    });

    let firedEvent = null;
    const handler = (e) => { firedEvent = e; };
    onBus('canon:registered', handler);

    const result = registerCanon('paper_test_full');
    assert.equal(result.ok, true);
    assert.equal(result.rewards.degreeScore, REGISTER_CANON_REWARDS.degreeScore);
    assert.equal(result.timeConsumed, ACTION_COSTS.registerCanon);

    // resources increased
    assert.equal(gameState.resources.degreeScore, baselineDegree + REGISTER_CANON_REWARDS.degreeScore);
    assert.equal(gameState.resources.reputation, baselineRep + REGISTER_CANON_REWARDS.reputation);
    assert.equal(gameState.resources.researchFunds, baselineFunds + REGISTER_CANON_REWARDS.researchFunds);

    // override slot enriched
    const slot = gameState.academic.canonOverrides['canon_004'];
    assert.equal(slot.registered, true);
    assert.equal(slot.registeredByPaper, 'paper_test_full');
    assert.equal(slot.newOfficialName, '서리 결정 정설 반박');

    // event fired
    assert.ok(firedEvent, 'canon:registered event must fire');
    assert.equal(firedEvent.canonId, 'canon_004');

    // schedule advanced by 5 days (registerCanon cost)
    const dayDelta = (gameState.progression.currentWeek - baselineWeek) * 7 + (gameState.progression.currentDay - baselineDay);
    assert.equal(dayDelta, ACTION_COSTS.registerCanon, `expected ${ACTION_COSTS.registerCanon}d advance, got ${dayDelta}`);

    offBus('canon:registered', handler);
  }],

  ['registerCanon is idempotent — second call rejects with already-registered reason (M9 PR-I)', () => {
    resetAll();
    gameState.progression.canRegisterCanon = true;
    gameState.academic.canonOverrides['canon_005'] = {
      canonId: 'canon_005',
      canonTitle: '심연 종소리 정설',
      overriddenBy: 'paper_test_idem',
      overriddenByTitle: '심연 종소리 반박',
      score: 78,
    };
    gameState.papers.accepted.unshift({
      id: 'paper_test_idem',
      type: 'challenge',
      title: '심연 종소리 반박',
      review: { canonOverride: gameState.academic.canonOverrides['canon_005'] },
    });

    const first = registerCanon('paper_test_idem');
    assert.equal(first.ok, true);
    const second = registerCanon('paper_test_idem');
    assert.equal(second.ok, false);
    assert.match(second.reason, /이미 등재/);
  }],

  // ── PR-J: NPC 학회지 논문 + 반박 ──────────────────────────────
  ['publications: tickPublicationsForWeek releases papers up to current week (idempotent) (M9 PR-J)', async () => {
    resetAll();
    gameState.publications = { entries: {} };
    gameState.academic.failedRebuttals = 0;
    gameState.academic.successfulRebuttals = 0;

    const { tickPublicationsForWeek, getActivePublications, getPublicationTemplates } = await import('../societyPublications.js');

    // Week 1 → only week-1 publications (none in pool — earliest is week 2)
    tickPublicationsForWeek(1);
    let active = getActivePublications();
    assert.equal(active.length, 0, 'no publications scheduled for week 1');

    // Week 5 → everything with releaseWeek <= 5 should be released
    tickPublicationsForWeek(5);
    active = getActivePublications();
    const expectedCount = getPublicationTemplates().filter((p) => p.releaseWeek <= 5).length;
    assert.equal(active.length, expectedCount, `expected ${expectedCount} active by week 5, got ${active.length}`);
    assert.ok(expectedCount >= 3, 'at least 3 publications by week 5');

    // Idempotent: re-ticking same week doesn't double-release
    const before = active.length;
    tickPublicationsForWeek(5);
    assert.equal(getActivePublications().length, before, 'idempotent re-tick must not duplicate');

    // Tick to week 16 → all publications released
    tickPublicationsForWeek(16);
    const allCount = getPublicationTemplates().length;
    assert.equal(getActivePublications().length, allCount, `all ${allCount} publications must be active by week 16`);
  }],

  ['publications: rebutting a truthful=false NPC paper grants exposed reward (M9 PR-J)', async () => {
    resetAll();
    gameState.publications = { entries: {} };
    gameState.academic.failedRebuttals = 0;
    gameState.academic.successfulRebuttals = 0;

    const { tickPublicationsForWeek, submitRebuttal, getPublicationTemplate } = await import('../societyPublications.js');
    const { REBUTTAL_OUTCOMES } = await import('../data/societyPublicationsData.js');

    // pub_basic_002 defends canon_001 (canon.isCorrect=false), so truthful=false → exposed reward
    tickPublicationsForWeek(16);
    const tpl = getPublicationTemplate('pub_basic_002');
    assert.equal(tpl.truthful, false, 'fixture sanity: pub_basic_002 should be truthful=false');

    const baselineDegree = gameState.resources.degreeScore;
    const baselineRep = gameState.resources.reputation;
    const baselineFunds = gameState.resources.researchFunds;

    let firedRebuttalEvent = null;
    const handler = (e) => { firedRebuttalEvent = e; };
    onBus('publication:rebutted', handler);

    const result = submitRebuttal('pub_basic_002');
    assert.equal(result.ok, true);
    assert.equal(result.outcome, 'exposed');
    assert.deepEqual(result.deltas, REBUTTAL_OUTCOMES.exposed);
    assert.equal(result.timeConsumed, ACTION_COSTS.submitRebuttal);

    // resources increased
    assert.equal(gameState.resources.degreeScore, baselineDegree + REBUTTAL_OUTCOMES.exposed.degreeScore);
    assert.equal(gameState.resources.reputation, baselineRep + REBUTTAL_OUTCOMES.exposed.reputation);
    assert.equal(gameState.resources.researchFunds, baselineFunds + REBUTTAL_OUTCOMES.exposed.researchFunds);

    // counters
    assert.equal(gameState.academic.successfulRebuttals, 1);
    assert.equal(gameState.academic.failedRebuttals, 0);

    // paper goes to accepted bucket
    assert.ok(gameState.papers.accepted.find((p) => p.id === result.paper.id));

    // event fired
    assert.ok(firedRebuttalEvent, 'publication:rebutted event must fire');
    assert.equal(firedRebuttalEvent.outcome, 'exposed');

    offBus('publication:rebutted', handler);
  }],

  ['publications: rebutting a truthful=true NPC paper applies wrongful penalty (M9 PR-J)', async () => {
    resetAll();
    gameState.publications = { entries: {} };
    gameState.academic.failedRebuttals = 0;
    gameState.academic.successfulRebuttals = 0;
    // pad reputation so penalty is visible (not clamped at 0)
    gameState.resources.reputation = 50;
    gameState.resources.degreeScore = 50;

    const { tickPublicationsForWeek, submitRebuttal, getPublicationTemplate } = await import('../societyPublications.js');
    const { REBUTTAL_OUTCOMES } = await import('../data/societyPublicationsData.js');

    // pub_basic_001 defends canon_002 (canon.isCorrect=true), so truthful=true → wrongful penalty
    tickPublicationsForWeek(16);
    const tpl = getPublicationTemplate('pub_basic_001');
    assert.equal(tpl.truthful, true, 'fixture sanity: pub_basic_001 should be truthful=true');

    const baselineDegree = gameState.resources.degreeScore;
    const baselineRep = gameState.resources.reputation;

    const result = submitRebuttal('pub_basic_001');
    assert.equal(result.ok, true);
    assert.equal(result.outcome, 'wrongful');
    assert.deepEqual(result.deltas, REBUTTAL_OUTCOMES.wrongful);

    // resources decreased
    assert.equal(gameState.resources.degreeScore, baselineDegree + REBUTTAL_OUTCOMES.wrongful.degreeScore);
    assert.equal(gameState.resources.reputation, baselineRep + REBUTTAL_OUTCOMES.wrongful.reputation);

    // counters
    assert.equal(gameState.academic.failedRebuttals, 1);
    assert.equal(gameState.academic.successfulRebuttals, 0);

    // paper goes to rejected bucket
    assert.ok(gameState.papers.rejected.find((p) => p.id === result.paper.id));
    assert.equal(result.paper.status, 'rejected');
    assert.equal(result.review.accepted, false);
  }],

  ['publications: failedRebuttals counter accumulates across multiple wrongful rebuttals (M9 PR-J)', async () => {
    resetAll();
    gameState.publications = { entries: {} };
    gameState.academic.failedRebuttals = 0;
    gameState.academic.successfulRebuttals = 0;
    gameState.resources.reputation = 200;
    gameState.resources.degreeScore = 200;

    const { tickPublicationsForWeek, submitRebuttal, getPublicationTemplates } = await import('../societyPublications.js');
    tickPublicationsForWeek(16);

    const truthfulIds = getPublicationTemplates().filter((p) => p.truthful).map((p) => p.id);
    assert.ok(truthfulIds.length >= 2, 'need at least 2 truthful publications for accumulation test');

    const r1 = submitRebuttal(truthfulIds[0]);
    assert.equal(r1.outcome, 'wrongful');
    assert.equal(gameState.academic.failedRebuttals, 1);

    const r2 = submitRebuttal(truthfulIds[1]);
    assert.equal(r2.outcome, 'wrongful');
    assert.equal(gameState.academic.failedRebuttals, 2);
  }],

  ['publications: cannot rebut same publication twice (idempotent guard) (M9 PR-J)', async () => {
    resetAll();
    gameState.publications = { entries: {} };
    gameState.academic.failedRebuttals = 0;
    gameState.academic.successfulRebuttals = 0;

    const { tickPublicationsForWeek, submitRebuttal, getActivePublications } = await import('../societyPublications.js');
    tickPublicationsForWeek(16);
    const activeBefore = getActivePublications().length;

    const first = submitRebuttal('pub_basic_002');
    assert.equal(first.ok, true);

    // Active list shrinks by 1 (the rebutted one disappears)
    assert.equal(getActivePublications().length, activeBefore - 1);

    const second = submitRebuttal('pub_basic_002');
    assert.equal(second.ok, false);
    assert.match(second.reason, /이미 반박/);
  }],

  ['publications: cannot rebut a publication that has not been released (M9 PR-J)', async () => {
    resetAll();
    gameState.publications = { entries: {} };

    const { tickPublicationsForWeek, submitRebuttal, getPublicationTemplates } = await import('../societyPublications.js');
    // Tick only to week 1 — most publications still pending
    tickPublicationsForWeek(1);

    const lateTpl = getPublicationTemplates().find((p) => p.releaseWeek > 10);
    assert.ok(lateTpl, 'fixture must contain at least one late-release publication');

    const result = submitRebuttal(lateTpl.id);
    assert.equal(result.ok, false);
    assert.match(result.reason, /출간되지 않은/);
  }],

  ['publications: unknown publication id returns ok=false (M9 PR-J)', async () => {
    resetAll();
    gameState.publications = { entries: {} };
    const { submitRebuttal } = await import('../societyPublications.js');
    const result = submitRebuttal('pub_does_not_exist');
    assert.equal(result.ok, false);
    assert.match(result.reason, /찾을 수 없습니다/);
  }],

  ['publications: ACTION_COSTS.submitRebuttal is exposed and positive (M9 PR-J)', () => {
    assert.equal(typeof ACTION_COSTS.submitRebuttal, 'number');
    assert.ok(ACTION_COSTS.submitRebuttal > 0, 'submitRebuttal cost must be positive');
  }],

  ['publications: rebuttal advances schedule by ACTION_COSTS.submitRebuttal days (M9 PR-J)', async () => {
    resetAll();
    gameState.publications = { entries: {} };
    gameState.resources.reputation = 100;
    gameState.resources.degreeScore = 100;

    const { tickPublicationsForWeek, submitRebuttal } = await import('../societyPublications.js');
    tickPublicationsForWeek(16);

    const baselineWeek = gameState.progression.currentWeek;
    const baselineDay = gameState.progression.currentDay;

    const result = submitRebuttal('pub_basic_002');
    assert.equal(result.ok, true);

    const dayDelta = (gameState.progression.currentWeek - baselineWeek) * 7 + (gameState.progression.currentDay - baselineDay);
    assert.equal(dayDelta, ACTION_COSTS.submitRebuttal, `expected ${ACTION_COSTS.submitRebuttal}d advance, got ${dayDelta}`);
  }],
];

let failed = 0;

for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${tests.length} tests passed.`);
