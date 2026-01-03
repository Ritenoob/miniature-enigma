# BASELINE INTEGRATION — USE EXISTING DASHBOARD REPO

Work off Mirko’s existing repo structure from kucoin-analysis-dashboard-main.zip:

- server.js (backend runtime)
- index.html (UI)
- signal-weights.js (weighting/scoring)
- positions.json + retry_queue.json (state artifacts)

Create a new /research (or /optimizer) subsystem without breaking existing runtime:
- Keep server.js and existing functionality working.
- Add research modules in a separable folder and expose minimal hooks:
  - “StrategyConfig loader” so optimized configs can be loaded at runtime
  - “Signal engine adapter” so backtester and live engine share the same signal logic (no divergence)

Required new folders:
research/
  data/
  backtest/
  optimize/
  forward/
  reports/
  configs/
  scripts/
tests/

Add npm scripts for:
- npm run research:fetch-ohlcv
- npm run research:backtest
- npm run research:optimize
- npm run research:forward-shadow
- npm run research:report

If you decide to refactor into TypeScript:
- do it incrementally (keep server.js operational).
- Create TS modules that server.js can import (or transpile to dist/).

