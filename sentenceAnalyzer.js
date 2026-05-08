/**
 * Sentence Analyzer Adapter
 *
 * Bridges the raw `sentence.js` output to the normalized sentence structure
 * from the implementation spec.
 */

const GRADE_MAP = {
  word: 'single_rune',
  phrase: 'compound_word',
  clause: 'phrase',
  sentence: 'sentence',
  incantation: 'incantation',
};

const ORDER_MAP = {
  leftToRight: 'left_to_right',
  rightToLeft: 'right_to_left',
  topToBottom: 'top_to_bottom',
  bottomToTop: 'bottom_to_top',
  clockwise: 'center_outward',
  counterClockwise: 'outside_inward',
};

const PATTERN_MAP = {
  'S-V': 'SVO',
  'S-V-O': 'SVO',
  '조건-결과': 'CONDITION_THEN_EFFECT',
  '봉인': 'CORE_ORBITAL',
  '순환': 'CORE_ORBITAL',
};

export function analyzeSentence({
  units = [],
  arrangement = null,
  connectors = null,
  grammar = null,
  boneInteractions = [],
  material = 'parchment',
  rawSentence = null,
} = {}) {
  const mainUnits = rawSentence?.mainUnits || units || [];
  const orderedUnits = orderUnits({
    mainUnits,
    rawSentence,
    arrangement,
  });

  if (!rawSentence || rawSentence.kind === 'none') {
    const fallbackGrade = classifySentenceGrade({
      units: mainUnits,
      grammar: grammar || { operators: [], roles: [] },
      boneInteractions,
      legacy: { compoundName: arrangement?.kind === 'overlapping' ? arrangement?.detail : null },
    });
    return {
      readingOrder: 'left_to_right',
      orderedUnits,
      grade: fallbackGrade,
      pattern: 'unknown',
      normalizedText: '',
      semanticTags: material ? [material] : [],
      confidence: 0,
      warnings: ['문법 불명확'],
    };
  }

  const readingOrder = ORDER_MAP[rawSentence.directionKey] || 'left_to_right';
  const pattern = PATTERN_MAP[rawSentence.pattern] || rawSentence.pattern || 'unknown';
  const grade = classifySentenceGrade({
    units: mainUnits,
    grammar: grammar || { operators: [], roles: [] },
    boneInteractions,
    legacy: { compoundName: arrangement?.kind === 'overlapping' ? arrangement?.detail : null },
  });

  const semanticTags = [];
  mainUnits.forEach((unit) => semanticTags.push(unit.name));
  (grammar?.operators || []).forEach((op) => semanticTags.push(op.toLowerCase()));
  (grammar?.roles || []).forEach((role) => semanticTags.push(role.role));
  (grammar?.transforms || []).forEach((transform) => semanticTags.push(transform.toLowerCase()));
  if (arrangement?.kind && arrangement.kind !== 'none') semanticTags.push(arrangement.kind);
  if (material) semanticTags.push(material);

  const warnings = [];
  if (!rawSentence.pattern) warnings.push('조사 또는 접속사가 없어 주체/대상이 모호함');
  if ((grammar?.roles || []).length === 0 && mainUnits.length >= 3) warnings.push('문법 불명확');

  return {
    readingOrder,
    orderedUnits,
    grade,
    pattern,
    normalizedText: rawSentence.detail || '',
    semanticTags: [...new Set(semanticTags)],
    confidence: rawSentence.pattern ? 0.82 : 0.5,
    warnings,
  };
}

export function classifySentenceGrade(ctx) {
  const n = ctx.units?.length || 0;
  const opCount = ctx.grammar?.operators?.length || 0;
  const roleCount = ctx.grammar?.roles?.length || 0;
  const hasBone = (ctx.boneInteractions?.length || 0) > 0;

  if (n <= 1) return 'single_rune';
  if (n === 2 || ctx.legacy?.compoundName) return 'compound_word';
  if (n <= 4) return 'phrase';
  if (n <= 7 && roleCount >= 2) return 'sentence';
  if (n >= 8 || (opCount >= 2 && hasBone)) return 'incantation';
  return 'phrase';
}

function orderUnits({ mainUnits, rawSentence, arrangement }) {
  if (!Array.isArray(mainUnits) || mainUnits.length === 0) return [];
  const ordered = [...mainUnits];
  const orderKey = ORDER_MAP[rawSentence?.directionKey] || 'left_to_right';

  if (orderKey === 'right_to_left') {
    ordered.sort((a, b) => b.center.x - a.center.x);
  } else if (orderKey === 'top_to_bottom') {
    ordered.sort((a, b) => a.center.y - b.center.y);
  } else if (orderKey === 'bottom_to_top') {
    ordered.sort((a, b) => b.center.y - a.center.y);
  } else if (orderKey === 'center_outward' || orderKey === 'outside_inward') {
    const center = arrangement?.units?.length
      ? arrangement.units.reduce((acc, unit) => ({
          x: acc.x + unit.center.x,
          y: acc.y + unit.center.y,
        }), { x: 0, y: 0 })
      : ordered.reduce((acc, unit) => ({
          x: acc.x + unit.center.x,
          y: acc.y + unit.center.y,
        }), { x: 0, y: 0 });
    const div = arrangement?.units?.length || ordered.length;
    const cx = center.x / div;
    const cy = center.y / div;
    ordered.sort((a, b) => distance(a.center, { x: cx, y: cy }) - distance(b.center, { x: cx, y: cy }));
    if (orderKey === 'outside_inward') ordered.reverse();
  } else {
    ordered.sort((a, b) => a.center.x - b.center.x);
  }

  return ordered.map((unit) => unit.name);
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}
