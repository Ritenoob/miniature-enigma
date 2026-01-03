# DETERMINISTIC BACKTEST ENGINE (NO OVERFITTING)

Build a backtester that reuses the SAME indicator + signal code as live.

Must simulate:
- Entry model:
  - Config toggle: FILL_MODEL=taker OR probabilistic_limit
  - If probabilistic_limit: simulate a 9th-level limit entry proxy via:
    - offset_bps or synthetic depth offset
    - fill probability based on candle volatility, spread proxy, and time-to-fill max
- Fees (maker/taker)
- Slippage model toggles (none/fixed/spread_based/vol_scaled)
- Leverage-aware ROI SL/TP
- Immediate “loss-tightening preference” support:
  - optional: tighten initial SL after N adverse ticks or if momentum flips (implemented as stop tightening, not forced exit)
- Break-even move (fee-aware available, but allow “aggressive” mode)
- Staircase trailing (step+move) and scale/lock profit function
- reduceOnly semantics, and stop-update coordinator behavior (no double stops)
- Multi-symbol concurrency and max positions if enabled

Evaluation:
- Walk-forward with purged splits:
  - choose window sizes automatically by testing stability across multiple candidates
  - enforce minimum trades per fold (you decide a sane floor; must prevent “one lucky trade” configs)
- Regime breakdown:
  - trend vs range (ADX)
  - volatility buckets (ATR%)
- Metrics:
  - net return, profit factor, expectancy (R), max DD, tail loss, stability score
  - out-of-sample gap, worst-fold performance

Deliver:
- research/backtest/engine.ts
- research/backtest/walkforward.ts
- research/backtest/metrics.ts
- trade log CSV export + summary JSON
- tests for determinism (same seed => same output)
- fast-check invariants:
  - stop monotonic (never loosens)
  - leverage bounded
  - no negative equity

