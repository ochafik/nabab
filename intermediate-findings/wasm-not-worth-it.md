Running multiply benchmarks...
Running marginalize benchmarks...

## WASM-Style vs Regular Factor Ops Benchmark

| Operation    | Scenario                          | Result size | JS (ms) | WASM-style (ms) | Speedup | JS ops/s | WASM ops/s | JS MB/s | WASM MB/s |
|--------------|-----------------------------------|------------:|--------:|-----------------:|--------:|---------:|-----------:|--------:|----------:|
| multiply     | 2-var shared (2x2 * 2x2)          |           8 |   0.002 |            0.003 |   0.66x * |   521648 |     342936 |   33.39 |     21.95 |
| multiply     | 5-var overlap (3^5 * 3^5)         |        2187 |   0.019 |            0.019 |   0.98x |    53691 |      52403 |  939.38 |    916.84 |
| multiply     | 5-var subset (3^5 * 3^3)          |         243 |   0.002 |            0.002 |   0.84x * |   489956 |     413736 |  952.47 |     804.3 |
| multiply     | 10-var overlap (2^10 * 2^10)      |        4096 |    0.03 |            0.036 |   0.83x * |    33613 |      28037 | 1101.45 |    918.72 |
| multiply     | 10-var subset (2^10 * 2^5)        |        1024 |   0.006 |            0.009 |   0.68x * |   158957 |     108108 | 1302.18 |    885.62 |
| multiply     | 15-var overlap (2^15 * 2^15)      |      131072 |   0.913 |            0.991 |   0.92x |     1095 |       1010 | 1148.13 |   1058.54 |
| marginalize  | 2-var remove last (4x4)           |           4 |       0 |            0.002 |   0.23x * |  2000000 |     452899 |      64 |     14.49 |
| marginalize  | 2-var remove first (4x4)          |           4 |   0.001 |            0.001 |   0.95x |  1142857 |    1090513 |   36.57 |      34.9 |
| marginalize  | 5-var remove 2 trailing (3^5)     |          27 |   0.001 |            0.003 |   0.39x * |  1000000 |     387147 |     216 |     83.62 |
| marginalize  | 5-var remove 2 middle (3^5)       |          27 |   0.002 |            0.002 |   0.87x * |   461467 |     400000 |   99.68 |      86.4 |
| marginalize  | 10-var remove 3 trailing (2^10)   |         128 |   0.001 |            0.006 |   0.21x * |   800000 |     169033 |   819.2 |    173.09 |
| marginalize  | 10-var remove 3 general (2^10)    |         128 |   0.005 |            0.006 |   0.89x * |   190476 |     169005 |  195.05 |    173.06 |
| marginalize  | 10-var remove 9 trailing (2^10)   |           2 |   0.001 |            0.006 |   0.22x * |   750188 |     163265 |      12 |      2.61 |
| marginalize  | 15-var remove 5 general (2^15)    |        1024 |    0.15 |            0.154 |   0.98x |     6646 |       6495 |   54.45 |     53.21 |

_Legend: ** = WASM-style faster, * = JS faster_

## Analysis

Average multiply speedup:    0.82x
Average marginalize speedup: 0.59x
Average overall speedup:     0.69x
Average large-table speedup: 0.88x (result >= 1024 entries)

## Theoretical WASM Projection

Known JS-to-WASM performance ratios for tight numeric loops:
  - V8 JIT on hot loops: WASM is typically 1.0x-1.3x vs optimized JS
  - SIMD (f64x2 multiply): ~1.5x-2.0x on large arrays
  - No GC pressure: saves ~5-15% on allocation-heavy paths
  - Fixed-width i32 index math: ~1.0x-1.1x (V8 already uses i32 internally)

Projected real WASM speedup over JS Factor ops: ~1.14x

RECOMMENDATION: Marginal gains. WASM might help for very large networks
(high treewidth > 15) but the JS implementation is already well-optimized.
Consider WASM only if profiling shows factor ops as the clear bottleneck.

_Measured on 2026-03-27T02:02:08.712Z, 300 iterations, median time._
