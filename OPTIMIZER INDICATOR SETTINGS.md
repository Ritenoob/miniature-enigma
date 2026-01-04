# OPTIMIZER — INDICATOR SETTINGS + COMBINATION EXPERIMENTS

Build a multi-stage optimizer that explores:
- Indicator parameters
- Indicator combinations
- Signal wiring templates
- MTF pairs (entry TF + filter TF)

Indicators included:
AO (Awesome Oscillator), W%R, KDJ, RSI, MACD, EMA stack, Bollinger, ATR, ADX/DI, OBV

Templates to search (must be supported as switchable config):
T1 Mean Reversion Extremes (RSI + W%R + BB, ADX range filter)
T2 Trend Continuation (EMA + MACD + ADX/DI, OBV confirm)
T3 Weighted Score/Voting (-100..+100) with thresholds and confidence
T4 Add DOM Gate (LIVE only; optimizer should mark as “forward-required”)

Parameter ranges:
- Define bounded search spaces (sane defaults) but allow override in config JSON.

Search strategy:
Stage A: random/LHS screening (2,000–50,000 configs, parallel)
Stage B: refinement using NSGA-II or TPE Bayesian, multi-objective
Return Pareto set + top 20 ranked by out-of-sample + stability

Important:
- Since DOM is not historical, optimizer must:
  - optimize DOM OFFLINE only via proxies (spread/volatility)
  - output DOM-gated candidates as “requires live-forward validation”
- Must include ablation testing:
  - rerun winners with each indicator removed to measure true contribution

Deliver:
- research/optimize/search_space.ts
- research/optimize/optimizer.ts
- research/optimize/templates/
- research/optimize/ablation.ts
- worker_threads parallel runner
- exports:
  - reports/leaderboard.csv
  - reports/pareto.json
  - configs/top_configs/*.json

