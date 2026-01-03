# MIRKO OPTIMIZATION ENGINE v2 — GROUNDED IN EXISTING SIGNAL FILES + RATE-LIMIT SAFE

You must build an optimization and experimentation subsystem around Mirko’s existing signal system:

Canonical files (do not reinvent scoring):
- signal-weights.js (weights/profiles/thresholds) — treat as the config surface
- SignalGenerator-configurable.js — treat as the scoring truth source
- adjust-weights.js — keep as manual tuning + reference serializer
- WEIGHT_ADJUSTMENT_GUIDE.md — preserve intent (weights-based composite scoring)

GOAL:
Experiment with indicator settings + combinations to optimize real-world profitability and robustness for KuCoin Futures perpetuals:
Universe: ETH, SOL, WIF, FARTCOIN, LA, SHIB, LTC, BEAT, FOLKS, XRP, RAVE, POWER, ADA, BCH, RIVER, TON, AVAX, plus MYX when available.

NON-NEGOTIABLES:
- Futures only.
- Leverage-aware ROI SL/TP remains intact. Auto leverage (ATR% tiered) with manual override.
- Prefer rapid stop tightening: small loss > larger loss; break-even and profit-lock as early as feasible via stop tightening (not forced time exit).
- Exit logic remains: trailing SL/TP + break-even + staircase/scale-lock; reduceOnly on exits.
- DOM has no historical dataset: DOM logic may be proposed, but must be validated via LIVE forward-shadow testing; never claim DOM “optimized” from backtests.

PART A — RATE LIMIT + PING/HEARTBEAT DESIGN (MANDATORY)
Implement a PingBudgetManager:
- WebSocket heartbeat must follow server-provided pingInterval (18s) and pingTimeout (10s).
- REST polling must use Adaptive Token Bucket with headroom:
  - Determine Futures pool quota from env (default 2000/30s for VIP0).
  - Use utilization_target default 0.70 and keep 30% headroom.
  - Priority queues: Critical (cancel/replace) > High (orders) > Medium (sync) > Low (health pings).
  - On HTTP 429: immediately lower utilization_target and backoff; recover gradually.
Expose metrics: event-loop lag p95/p99, message jitter, reconnect count, 429 rate.

PART B — EXPAND SIGNAL CONFIG FOR KDJ, OBV, DOM
Extend signal-weights.js schema to add:
- kdj, obv, dom sections with max points and thresholds.
Update SignalGenerator-configurable.js to compute contributions and include them in breakdown.
DOM scoring must be behind a feature flag and marked “live-only validation required”.

PART C — OPTIMIZATION MODES
1) OFFLINE Optimization (OHLCV only):
- Optimize RSI, W%R, MACD, AO, EMA, Bollinger, ATR, ADX, OBV, KDJ parameters and weight maxima.
- Optimize thresholds (strongBuy/buy/etc.).
- Optimize MTF pairing: entry TF + filter TF (toggleable).
- Use walk-forward with purge; multi-objective ranking (net return, PF, expectancy, maxDD, stability).
- Enforce minimum-trades-per-fold internally to avoid false winners.

2) LIVE Forward-Shadow Optimization (DOM + latency reality):
- Run top N configs simultaneously in shadow mode.
- Collect DOM metrics and apply DOM gate variants.
- A/B compare configs and output live leaderboards.

OUTPUTS:
- Top 20 configs + Pareto set
- CSV + JSON reports
- Versioned config packs saved to research/configs/
- Reproducibility: fixed seeds and rerun commands

DELIVERABLES:
- research/backtest engine (deterministic)
- optimizer (random/LHS screen + Bayesian/NSGA refinement)
- forward shadow runner for DOM
- README scripts and tests (Jest + property-based invariants)

