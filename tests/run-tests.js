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
const { createPaperDraft, getPaperSuggestion, submitPaper } = await import('../paperSystem.js');
const { applyForGrant, signContract, sellScroll, tickEconomyWeek } = await import('../economy.js');
const { startExpedition } = await import('../expedition.js');
const { advanceDay, enqueueEvent, getPendingEvents, consumeTime } = await import('../schedule.js');
const { on: onBus, off: offBus } = await import('../eventBus.js');
const { checkPhaseProgress, takeMidtermExam, takeFinalExam } = await import('../phase.js');
const { analyzeConnectorLines } = await import('../connectorLine.js');
const { analyzeGrammarTokens } = await import('../grammarTokens.js');
const { analyzeSentence: analyzeSentenceStructure } = await import('../sentenceAnalyzer.js');
const { RecognitionEngine } = await import('../recognition.js');
const { analyzeArrangement } = await import('../arrangement.js');
const { analyzeBoneInteraction } = await import('../bone-interaction.js');
const { analyzeMagic } = await import('../magicPipeline.js');
const { RiftGame } = await import('../rift.js');
const { AssignmentSystem } = await import('../assignmentSystem.js');

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

  ['paper system drafts and accepts a basic society submission', () => {
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

    const review = submitPaper(draft.id);
    assert.ok(review);
    assert.equal(review.accepted, true);
    assert.equal(gameState.papers.accepted.length, 1);
    assert.equal(gameState.resources.degreeScore, 15);
    assert.equal(gameState.resources.researchFunds, 800);
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
