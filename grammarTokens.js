/**
 * Grammar Token Adapter
 *
 * Consolidates sentence-level connectors plus particle-level modifiers into
 * the normalized token grammar described by the implementation spec.
 */

const CASE_ROLE_MAP = {
  NOMINATIVE: { token: 'NOM', role: 'subject' },
  ACCUSATIVE: { token: 'ACC', role: 'object' },
  LOCATIVE: { token: 'LOC', role: 'location' },
  INSTRUMENTAL: { token: 'INS', role: 'instrument' },
  DATIVE: { token: 'DAT', role: 'target' },
  COMITATIVE: { token: 'COM', role: 'companion' },
};

const INTENSITY_TOKEN_MAP = {
  BARELYTHERE: 'BARELY',
  WEAK: 'WEAKLY',
  STRONG: 'AMPLIFY',
  INTENSE: 'INTENSELY',
  EXTREME: 'MAXIMIZE',
  RUNAWAY: 'OVERDRIVE',
};

const TENSE_TOKEN_MAP = {
  DELAYED: 'FUTURE',
  SUSTAINED: 'SUSTAIN',
  REPEATING: 'REPEAT',
  COMPLETED: 'COMPLETE',
  CONDITIONAL: 'CONDITIONAL',
};

const NEGATION_TRANSFORM_MAP = {
  NOT: 'NEGATE',
  INVERSION: 'INVERT',
  ABSORPTION: 'ABSORB',
};

export function analyzeGrammarTokens({
  sentence = null,
  particles = null,
  connectorLines = null,
} = {}) {
  const tokens = [];
  const roles = [];
  const modifiers = [];
  const operators = [];
  const transforms = [];

  if (connectorLines && Array.isArray(connectorLines.operators)) {
    operators.push(...connectorLines.operators);
  }

  if (sentence && Array.isArray(sentence.connectors)) {
    sentence.connectors.forEach((connector) => {
      const op = connector.english || connector.fn || null;
      if (!op) return;
      tokens.push({
        type: 'conjunction',
        name: op,
        from: connector.between?.[0] || null,
        to: connector.between?.[1] || null,
      });
      operators.push(op);
    });
  }

  if (particles && particles.kind === 'particle' && Array.isArray(particles.runes)) {
    particles.runes.forEach((rune) => {
      const unitId = rune.unit?.name || 'unknown';
      (rune.particles || []).forEach((particle) => {
        const key = String(particle.key || '').toUpperCase();
        if (particle.family === 'case') {
          const mapped = CASE_ROLE_MAP[key] || { token: key, role: key.toLowerCase() };
          tokens.push({ type: 'case', name: mapped.token, target: unitId });
          roles.push({ unitId, role: mapped.role });
          return;
        }

        if (particle.family === 'intensity') {
          const name = INTENSITY_TOKEN_MAP[key] || key;
          tokens.push({ type: 'adverb', name, target: unitId });
          modifiers.push({
            runeIdx: unitId,
            kind: name,
            factor: particle.meta?.powerMul ?? rune.powerMul ?? 1.0,
          });
          return;
        }

        if (particle.family === 'tense') {
          tokens.push({
            type: 'tense',
            name: TENSE_TOKEN_MAP[key] || key,
            target: unitId,
          });
          return;
        }

        if (particle.family === 'negation') {
          const transform = NEGATION_TRANSFORM_MAP[key] || key;
          tokens.push({ type: 'transform', name: transform, target: unitId });
          transforms.push(transform);
        }
      });
    });
  }

  return {
    tokens,
    roles,
    modifiers,
    operators: [...new Set(operators)],
    transforms: [...new Set(transforms)],
  };
}
