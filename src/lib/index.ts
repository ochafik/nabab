// Public API for the nabab library
export type { Variable, CPT, Evidence, LikelihoodEvidence, Distribution } from './types.js';
export type { Factor } from './factor.js';
export {
  createFactor,
  constantFactor,
  cptToFactor,
  multiplyFactors,
  marginalize,
  invertFactor,
  normalizeFactor,
  applyEvidence,
  applyLikelihood,
  evaluateFactor,
  extractDistribution,
  tableSize,
} from './factor.js';
export type { DirectedGraph, UndirectedGraph, Clique, JunctionTree } from './graph.js';
export {
  buildDirectedGraph,
  moralize,
  triangulate,
  findMaximalCliques,
  buildJunctionTree,
} from './graph.js';
export type { InferenceResult } from './inference.js';
export { infer } from './inference.js';
export type { ParsedNetwork } from './xmlbif-parser.js';
export { parseXmlBif } from './xmlbif-parser.js';
export { parseBif } from './bif-parser.js';
export { BayesianNetwork } from './network.js';
export { CachedInferenceEngine } from './cached-inference.js';
