/**
 * Spec-aligned alias module.
 *
 * The codebase historically implemented chapter 10 in `bone-interaction.js`,
 * while the implementation spec refers to `boneInteraction.js`.
 * Re-exporting here lets newer modules follow the spec path without changing
 * the proven analyzer implementation.
 */

export { analyzeBoneInteraction, classifyBoneShape, __INTERNAL__BONE } from './bone-interaction.js';
