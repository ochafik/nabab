# Structure Learning Performance

All algorithms tested on Apple Silicon (M-series), Node.js v23.

## Native Algorithms (zero deps)

| Dataset | Rows | Vars | HC | GES | GRaSP |
|---|---|---|---|---|---|
| weather | 200 | 5 | 1.6ms | 1.3ms | 0.8ms |
| students | 300 | 5 | 1.0ms | 0.9ms | 0.9ms |
| chain | 1000 | 3 | 0.4ms | 0.4ms | 0.9ms |
| diamond | 2000 | 4 | 3.5ms | 3.1ms | 1.5ms |
| alarm5 | 2000 | 5 | 7.1ms | 6.7ms | 2.5ms |

## vs @kanaries/causal (weather dataset)

| Algorithm | Native | @kanaries | Speedup |
|---|---|---|---|
| GES | 1.3ms | 4.4ms | 3.4x |
| GRaSP | 0.8ms | 4.3ms | 5.4x |
| PC | n/a | 4.2ms | — |

## Verdict

- All native algorithms are <10ms on 5-variable datasets
- GRaSP is fastest native, especially on larger data
- @kanaries/causal adds value for FCI (latent confounders) and statistical CI tests, not speed
- tfjs irrelevant for structure learning (bottleneck is BIC on small tables)
