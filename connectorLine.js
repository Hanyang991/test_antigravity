/**
 * Connector Line Adapter
 *
 * Spec alignment layer for chapter 10 connector lines.
 * The live geometry/classification stays in `bone-interaction.js`; this file
 * normalizes the result into the `connectorLine.js`-style structure described
 * in the implementation spec so later systems can depend on a stable schema.
 */

const BRIDGE_TYPE_BY_DETAIL = [
  ['단선', 'direct', 'AND'],
  ['이중선', 'double', 'AND'],
  ['삼중선', 'double', 'AND'],
  ['점선', 'dotted', 'IF'],
  ['파선', 'broken', 'THEN'],
  ['물결선', 'wavy', 'WHILE'],
  ['나선', 'spiral', 'LOOP'],
  ['갈래선', 'chain', 'BIND'],
  ['고리선', 'chain', 'BIND'],
];

const CONNECTOR_TYPE_BY_OPERATOR = {
  AND: 'double',
  THEN: 'broken',
  INTO: 'arrow',
  BIND: 'chain',
  TOWARD: 'arrow',
  SHIFT: 'direct',
};

export function analyzeConnectorLines({
  boneInteraction = null,
  sentence = null,
} = {}) {
  const links = [];
  const operators = [];

  if (boneInteraction && boneInteraction.kind === 'bridging') {
    const [type, operatorHint] = classifyBridgeDetail(boneInteraction.detail);
    links.push({
      id: `conn_${type}_0`,
      type,
      fromUnitId: null,
      toUnitId: null,
      direction: 'undirected',
      confidence: 0.8,
      geometry: {
        strokeIndex: null,
        length: null,
        curvature: null,
        intersections: [],
      },
      operatorHint,
      detail: boneInteraction.detail,
      powerMul: boneInteraction.powerMul,
      instabilityDelta: boneInteraction.instabilityDelta,
    });
    if (operatorHint) operators.push(operatorHint);
  }

  if (sentence && Array.isArray(sentence.connectors)) {
    sentence.connectors.forEach((connector, index) => {
      const op = connector.english || connector.fn || null;
      if (op) operators.push(op);
      links.push({
        id: `conn_sentence_${index}`,
        type: CONNECTOR_TYPE_BY_OPERATOR[op] || 'direct',
        fromUnitId: connector.between?.[0] || null,
        toUnitId: connector.between?.[1] || null,
        direction: inferDirection(op),
        confidence: 0.9,
        geometry: {
          strokeIndex: null,
          length: null,
          curvature: null,
          intersections: [],
        },
        operatorHint: op,
        detail: connector.desc || connector.fn || '',
      });
    });
  }

  return {
    links,
    operators: [...new Set(operators)],
  };
}

function classifyBridgeDetail(detail = '') {
  for (const [needle, type, operator] of BRIDGE_TYPE_BY_DETAIL) {
    if (detail.includes(needle)) return [type, operator];
  }
  return ['direct', null];
}

function inferDirection(operator) {
  if (operator === 'INTO' || operator === 'TOWARD' || operator === 'THEN') {
    return 'a_to_b';
  }
  return 'undirected';
}
