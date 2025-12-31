# Research Module

This module contains tools for backtesting, optimization, and data collection for the MIRKO V3.5 trading system.

## Directory Structure

```
research/
├── lib/              # Indicator and signal libraries
│   ├── indicators/   # Technical indicator implementations
│   ├── signals/      # Signal generation logic
│   └── math/         # Mathematical utilities
├── data/             # Data fetching and recording
│   ├── fetch_ohlcv.js    # OHLCV data fetcher
│   └── live_recorder.js  # Live event recorder
├── backtest/         # Backtesting engine
├── forward/          # Forward testing (paper trading)
├── optimize/         # Parameter optimization
│   ├── search-space.js   # Parameter bounds
│   ├── optimizer.js      # Multi-objective optimizer
│   ├── ablation.js       # Ablation testing
│   └── worker-pool.js    # Parallel evaluation
└── configs/          # Optimized configurations
    └── top_configs/  # Best performing configs
```

## Usage

### Data Collection

```bash
# Fetch historical OHLCV data
node research/data/fetch_ohlcv.js --pair XBTUSDTM --timeframe 5m --days 30

# Record live events
node research/data/live_recorder.js --pair XBTUSDTM
```

### Backtesting

```bash
# Run backtest with specific configuration
node scripts/backtest-runner.js --config configs/balanced.json --data data/btc_5m.csv
```

### Optimization

```bash
# Run parameter optimization
node research/optimize/optimizer.js --method nsga2 --generations 100
```

## Optimizer Templates

### T1: Mean Reversion
- Indicators: RSI, Williams %R, Bollinger Bands
- Filter: ADX range filter
- Best for: Choppy markets

### T2: Trend Continuation
- Indicators: EMA, MACD, ADX/DI
- Confirmation: OBV
- Best for: Trending markets

### T3: Weighted Score/Voting
- All indicators with configurable weights
- Score range: -100 to +100
- Threshold-based signals

### T4: DOM Gate (LIVE only)
- Requires live order book data
- Imbalance detection at multiple depth levels
- Microprice calculation
- Wall detection (optional)

## Rate Limit Compliance

The PingBudgetManager ensures compliance with exchange rate limits:

- Adaptive Token Bucket algorithm
- 70% target utilization with 30% headroom
- Priority queues: Critical > High > Medium > Low
- Graceful degradation on 429 errors
- Event loop lag monitoring (p95/p99)
- Message jitter tracking

## Notes

- Most components are placeholder implementations
- Extend with actual logic as needed
- See main documentation for integration details
