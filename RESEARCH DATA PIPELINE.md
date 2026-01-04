# RESEARCH DATA PIPELINE (OHLCV + LIVE EVENTS)

Implement:
1) OHLCV fetcher for KuCoin Futures:
- Pull historical candles for each symbol and timeframe candidate.
- Store as compact parquet or CSV (CSV acceptable first), one file per symbol+tf.
- Enforce time normalization (UTC), gap detection, and deduplication.

2) Live recorder (for forward tests, DOM + latency):
- Record:
  - websocket message timestamps: exchange_ts (if present) and local_receive_ts
  - order book snapshots (if available) and compute derived DOM features:
    - imbalance(5/10/25), spread, microprice, wall flags
  - computed indicators per tick/candle
  - generated signals and the final “would-trade” decision
- Store as JSONL in research/data/live/

Latency instrumentation:
- event loop lag (p95/p99)
- rolling websocket message interval statistics
- optional REST ping sampler (rate-limited)
Expose these as “data quality signals” for optional gating.

Deliver:
- research/data/fetch_ohlcv.ts (or .js)
- research/data/live_recorder.ts
- configs for symbols and timeframe candidates
- unit tests for gap detection and timestamp normalization

