/**
 * "WASM-style" factor operations: operate on raw ArrayBuffer with manual memory layout.
 *
 * This module simulates what a true WASM implementation would do:
 * - All data lives in a flat ArrayBuffer (no JS objects in the hot loop)
 * - Index arithmetic is done manually via DataView / typed array overlays
 * - No Map, Array, or object allocation in the inner loops
 *
 * The purpose is to measure whether eliminating JS object overhead in favor
 * of raw typed-array math gives meaningful speedup. If it does, a real WASM
 * (AssemblyScript / C) module would likely be even faster due to SIMD and
 * no GC pauses.
 *
 * Buffer layout (all little-endian):
 *   Offset 0:                  nVars        (Int32)
 *   Offset 4:                  cardinalities (nVars x Int32)
 *   Offset 4 + nVars*4:        strides       (nVars x Int32)
 *   <padding to 8-byte alignment>
 *   Offset align8(4+nVars*8):  values        (tableSize x Float64)
 *
 * The values section is 8-byte aligned for Float64Array overlay compatibility.
 */

// ─── Layout helpers ────────────────────────────────────────────────

const INT32_SIZE = 4;
const FLOAT64_SIZE = 8;

/** Byte offset of the cardinalities array inside a packed buffer. */
function cardOffset(): number {
  return INT32_SIZE; // skip nVars
}

/** Byte offset of the strides array inside a packed buffer. */
function stridesOffset(nVars: number): number {
  return INT32_SIZE + nVars * INT32_SIZE;
}

/** Byte offset of the values array inside a packed buffer (8-byte aligned). */
function valuesOffset(nVars: number): number {
  const raw = INT32_SIZE + nVars * INT32_SIZE * 2;
  // Round up to next multiple of 8 for Float64Array alignment
  return (raw + 7) & ~7;
}

/** Compute strides from cardinalities (row-major, last dimension fastest). */
function computePackedStrides(cards: Int32Array): Int32Array {
  const n = cards.length;
  const strides = new Int32Array(n);
  let stride = 1;
  for (let i = n - 1; i >= 0; i--) {
    strides[i] = stride;
    stride *= cards[i];
  }
  return strides;
}

/** Compute total table size from cardinalities. */
function tableSizeFromCards(cards: Int32Array): number {
  let size = 1;
  for (let i = 0; i < cards.length; i++) size *= cards[i];
  return size;
}

// ─── Pack / Unpack ─────────────────────────────────────────────────

export interface PackedFactor {
  readonly buffer: ArrayBuffer;
  readonly nVars: number;
  readonly tableSize: number;
}

/**
 * Pack variable cardinalities and values into a flat ArrayBuffer.
 * This is the "serialization" step that a real WASM bridge would do once
 * when handing data from JS-land to WASM linear memory.
 */
export function packFactor(
  cardinalities: readonly number[],
  values: Float64Array,
): PackedFactor {
  const nVars = cardinalities.length;
  const tSize = values.length;
  const totalBytes = valuesOffset(nVars) + tSize * FLOAT64_SIZE;
  const buf = new ArrayBuffer(totalBytes);
  const dv = new DataView(buf);

  // nVars
  dv.setInt32(0, nVars, true);

  // cardinalities
  const cOff = cardOffset();
  for (let i = 0; i < nVars; i++) {
    dv.setInt32(cOff + i * INT32_SIZE, cardinalities[i], true);
  }

  // strides
  const cards = new Int32Array(nVars);
  for (let i = 0; i < nVars; i++) cards[i] = cardinalities[i];
  const strides = computePackedStrides(cards);
  const sOff = stridesOffset(nVars);
  for (let i = 0; i < nVars; i++) {
    dv.setInt32(sOff + i * INT32_SIZE, strides[i], true);
  }

  // values
  const vOff = valuesOffset(nVars);
  const f64 = new Float64Array(buf, vOff, tSize);
  f64.set(values);

  return { buffer: buf, nVars, tableSize: tSize };
}

/** Read nVars from a packed buffer. */
function readNVars(buf: ArrayBuffer): number {
  return new DataView(buf).getInt32(0, true);
}

/** Get a typed overlay on the cardinalities section. */
function getCards(buf: ArrayBuffer, nVars: number): Int32Array {
  return new Int32Array(buf, cardOffset(), nVars);
}

/** Get a typed overlay on the strides section. */
function getStrides(buf: ArrayBuffer, nVars: number): Int32Array {
  return new Int32Array(buf, stridesOffset(nVars), nVars);
}

/** Get a typed overlay on the values section. */
function getValues(buf: ArrayBuffer, nVars: number, tSize: number): Float64Array {
  return new Float64Array(buf, valuesOffset(nVars), tSize);
}

/**
 * Unpack a buffer back to cardinalities and values.
 * Useful for verification / bridging back to the Factor API.
 */
export function unpackFactor(buf: ArrayBuffer): { cardinalities: number[]; values: Float64Array } {
  const nVars = readNVars(buf);
  const cards = getCards(buf, nVars);
  const tSize = tableSizeFromCards(cards);
  const values = getValues(buf, nVars, tSize);
  return {
    cardinalities: Array.from(cards),
    values: new Float64Array(values), // copy so caller owns it
  };
}

// ─── WASM-style Multiply ──────────────────────────────────────────

/**
 * Multiply two packed factors.
 *
 * Variable identity is determined by *position*: variable i in buf1
 * corresponds to variable i in buf2 when their indices match in the
 * `varMap1` / `varMap2` arrays.
 *
 * For a simpler API: we assume the caller provides a mapping that tells
 * us the union variable set and how each source variable maps into it.
 *
 * BUT to keep this self-contained (no JS object overhead), we implement
 * the "general case" that takes:
 *   - Two packed factors
 *   - A shared-variable mapping: for each variable in buf1, the
 *     corresponding index in buf2 (or -1 if not present), and vice versa.
 *
 * ACTUALLY, the simplest approach that mirrors the real WASM case:
 * Accept precomputed metadata (union cardinalities, stride maps) as Int32Arrays
 * and do the hot loop entirely on typed arrays.
 */
export function wasmStyleMultiply(
  buf1: ArrayBuffer,
  buf2: ArrayBuffer,
  /** For each variable in the result, the stride into factor 1 (0 if absent). */
  f1StridesMap: Int32Array,
  /** For each variable in the result, the stride into factor 2 (0 if absent). */
  f2StridesMap: Int32Array,
  /** Cardinalities of the result variables. */
  resultCards: Int32Array,
): ArrayBuffer {
  const nVars1 = readNVars(buf1);
  const nVars2 = readNVars(buf2);
  const tSize1 = tableSizeFromCards(getCards(buf1, nVars1));
  const tSize2 = tableSizeFromCards(getCards(buf2, nVars2));
  const vals1 = getValues(buf1, nVars1, tSize1);
  const vals2 = getValues(buf2, nVars2, tSize2);

  const nVarsResult = resultCards.length;
  const resultSize = tableSizeFromCards(resultCards);

  // Allocate result buffer
  const result = packFactor(Array.from(resultCards), new Float64Array(resultSize));
  const resultVals = getValues(result.buffer, nVarsResult, resultSize);

  // --- Hot loop: odometer with incremental index ---
  const indices = new Int32Array(nVarsResult);
  let idx1 = 0;
  let idx2 = 0;

  for (let i = 0; i < resultSize; i++) {
    resultVals[i] = vals1[idx1] * vals2[idx2];

    // Tick odometer
    for (let j = nVarsResult - 1; j >= 0; j--) {
      indices[j]++;
      idx1 += f1StridesMap[j];
      idx2 += f2StridesMap[j];
      if (indices[j] < resultCards[j]) break;
      idx1 -= resultCards[j] * f1StridesMap[j];
      idx2 -= resultCards[j] * f2StridesMap[j];
      indices[j] = 0;
    }
  }

  return result.buffer;
}

/**
 * Convenience wrapper that builds stride maps automatically.
 *
 * `varIndices1` and `varIndices2` map each source variable to its index
 * in the result variable list (length = nVars in the respective source).
 */
export function wasmStyleMultiplyAuto(
  buf1: ArrayBuffer,
  buf2: ArrayBuffer,
  resultCardinalities: readonly number[],
  varIndices1: readonly number[],
  varIndices2: readonly number[],
): ArrayBuffer {
  const nVars1 = readNVars(buf1);
  const nVars2 = readNVars(buf2);
  const strides1 = getStrides(buf1, nVars1);
  const strides2 = getStrides(buf2, nVars2);

  const nResult = resultCardinalities.length;
  const resultCards = new Int32Array(nResult);
  for (let i = 0; i < nResult; i++) resultCards[i] = resultCardinalities[i];

  // Build stride maps: for each result variable, what stride in source?
  const f1Map = new Int32Array(nResult); // default 0
  const f2Map = new Int32Array(nResult); // default 0
  for (let i = 0; i < nVars1; i++) {
    f1Map[varIndices1[i]] = strides1[i];
  }
  for (let i = 0; i < nVars2; i++) {
    f2Map[varIndices2[i]] = strides2[i];
  }

  return wasmStyleMultiply(buf1, buf2, f1Map, f2Map, resultCards);
}

// ─── WASM-style Marginalize ───────────────────────────────────────

/**
 * Marginalize (sum out) variables from a packed factor.
 *
 * `resultMap`: for each source variable, the corresponding stride in the
 * result factor (0 if marginalized out). Length = nVars of source.
 *
 * `resultCards`: cardinalities of the remaining variables.
 */
export function wasmStyleMarginalize(
  buf: ArrayBuffer,
  resultMap: Int32Array,
  resultCards: Int32Array,
): ArrayBuffer {
  const nVarsSrc = readNVars(buf);
  const srcCards = getCards(buf, nVarsSrc);
  const srcSize = tableSizeFromCards(srcCards);
  const srcVals = getValues(buf, nVarsSrc, srcSize);

  const resultSize = tableSizeFromCards(resultCards);

  // Allocate result
  const result = packFactor(Array.from(resultCards), new Float64Array(resultSize));
  const resultVals = getValues(result.buffer, resultCards.length, resultSize);

  // --- Hot loop: odometer with incremental result index ---
  const indices = new Int32Array(nVarsSrc);
  let resultIdx = 0;

  for (let i = 0; i < srcSize; i++) {
    resultVals[resultIdx] += srcVals[i];

    // Tick odometer
    for (let j = nVarsSrc - 1; j >= 0; j--) {
      indices[j]++;
      resultIdx += resultMap[j];
      if (indices[j] < srcCards[j]) break;
      resultIdx -= srcCards[j] * resultMap[j];
      indices[j] = 0;
    }
  }

  return result.buffer;
}

/**
 * Convenience wrapper: marginalize removing variables at given indices.
 *
 * `removeIndices` lists which variable positions (0-based) to sum out.
 */
export function wasmStyleMarginalizeAuto(
  buf: ArrayBuffer,
  removeIndices: readonly number[],
): ArrayBuffer {
  const nVarsSrc = readNVars(buf);
  const srcCards = getCards(buf, nVarsSrc);

  const removeSet = new Set(removeIndices);
  const remainingCards: number[] = [];
  const remainingOrigIndices: number[] = [];
  for (let i = 0; i < nVarsSrc; i++) {
    if (!removeSet.has(i)) {
      remainingCards.push(srcCards[i]);
      remainingOrigIndices.push(i);
    }
  }

  // Compute result strides
  const nResult = remainingCards.length;
  const resultCardsArr = new Int32Array(nResult);
  for (let i = 0; i < nResult; i++) resultCardsArr[i] = remainingCards[i];
  const resultStrides = computePackedStrides(resultCardsArr);

  // Build resultMap: for each source variable, the result stride (0 if removed)
  const resultMap = new Int32Array(nVarsSrc); // default 0
  for (let i = 0; i < nResult; i++) {
    resultMap[remainingOrigIndices[i]] = resultStrides[i];
  }

  return wasmStyleMarginalize(buf, resultMap, resultCardsArr);
}
