# Mirko Strategy Optimization Engine

Institutional-grade optimization and experimentation subsystem for KuCoin Futures perpetual trading dashboard.

## Overview

This research module provides a complete backtesting, optimization, and forward-testing framework for developing and validating algorithmic trading strategies. It integrates seamlessly with the main `server.js` runtime without modifications.

## Features

### ✅ Implemented

- **TypeScript Support**: Full TypeScript implementation with type definitions
- **Missing Technical Indicators**: KDJ, ADX+DI, OBV with EMA smoothing
- **Configurable Signal Generator**: Supports multiple weight profiles and strategy templates
- **Strategy Templates**:
  - T1: Mean Reversion (RSI/W%R/BB with ADX filter)
  - T2: Trend Continuation (EMA/MACD/ADX with OBV)
  - T3: Hybrid Voting (balanced multi-indicator)
  - T4: Order Flow Gate (LIVE-ONLY with DOM validation)
- **Deterministic Backtest Engine**:
  - Leverage-aware ROI-based SL/TP (preserves execution semantics)
  - Multiple fill models (taker, probabilistic_limit for 9th-level proxy)
  - Fee and slippage modeling (configurable models)
  - Break-even moves, staircase trailing stops
  - Position management constraints (max positions, cooldown, daily limits)
- **Regime Classification**: ADX/ATR-based trending/ranging/high-vol detection
- **Performance Metrics**: Comprehensive risk-adjusted returns, Sharpe, Sortino, Calmar, tail risk
- **Seeded Randomness**: Fully deterministic with seed control

### 🚧 In Progress

- Walk-Forward Evaluation with purged splits
- Multi-objective optimization (NSGA-II)
- Latin Hypercube Sampling for coarse screening
- Data fetching and caching
- Forward shadow testing
- Sample config generation

## Installation

```bash
# Install dependencies (from project root)
npm install

# TypeScript compilation
npx tsc
```

## Project Structure

```
research/
├── lib/
│   ├── indicators/          # KDJ, ADX, OBV implementations
│   ├── signals/             # Signal generator + strategy templates
│   ├── math/                # DecimalMath re-export + backtest math utils
│   └── types/               # TypeScript type definitions
├── backtest/
│   ├── engine.ts            # Main backtest engine
│   ├── fill-model.ts        # Taker/limit fill simulation
│   ├── position-simulator.ts # Position lifecycle with ROI SL/TP
│   ├── metrics.ts           # Performance metrics calculator
│   └── regime-labeler.ts    # Market regime detection
├── optimize/                # (Coming soon) Optimization modules
├── forward/                 # (Coming soon) Live testing modules
├── data/                    # Historical data storage
├── configs/
│   └── top_configs/         # Optimized configurations (versioned)
├── reports/                 # Generated reports
└── scripts/                 # Automation scripts
```

## Usage

### Basic Backtest

```typescript
import { BacktestEngine } from './research/backtest/engine';
import { T2_TREND_CONTINUATION } from './research/lib/signals/templates';

const config = {
  symbols: ['BTCUSDT', 'ETHUSDT'],
  startDate: Date.now() - 90 * 24 * 60 * 60 * 1000, // 90 days ago
  endDate: Date.now(),
  initialBalance: 10000,
  positionSizePercent: 0.5,
  maxPositions: 3,
  leverage: 10,
  stopLossROI: 0.5,
  takeProfitROI: 2.0,
  fillModel: 'taker' as const,
  makerFee: 0.0002,
  takerFee: 0.0006,
  slippageModel: 'vol_scaled' as const,
  signalConfig: T2_TREND_CONTINUATION.signalConfig,
  signalThreshold: 50,
  seed: 42 // For reproducibility
};

const engine = new BacktestEngine(config);
const result = await engine.run(candlesBySymbol);

console.log('Net Return:', result.metrics.netReturnPercent.toFixed(2) + '%');
console.log('Sharpe Ratio:', result.metrics.sharpeRatio.toFixed(2));
console.log('Max Drawdown:', result.metrics.maxDrawdownPercent.toFixed(2) + '%');
console.log('Win Rate:', (result.metrics.winRate * 100).toFixed(1) + '%');
```

### Custom Signal Configuration

```typescript
import { SignalGenerator } from './research/lib/signals';

const customConfig = {
  weights: {
    rsi: { max: 25, oversold: 30, overbought: 70 },
    williamsR: { max: 20, oversold: -80, overbought: -20 },
    macd: { max: 20 },
    ao: { max: 15 },
    emaTrend: { max: 20 },
    stochastic: { max: 10, oversold: 20, overbought: 80 },
    bollinger: { max: 10 }
  },
  thresholds: {
    strongBuy: 70,
    buy: 50,
    buyWeak: 30,
    strongSell: -70,
    sell: -50,
    sellWeak: -30
  }
};

const generator = new SignalGenerator(customConfig);
const signal = generator.generate(indicators);
```

### Regime Filtering

```typescript
import { RegimeLabeler } from './research/backtest/regime-labeler';

// Label regimes in time series
const regimes = RegimeLabeler.labelTimeSeriesRegimes(candles, 14, 14, 50);

// Filter to only trade in trending markets
const config = {
  // ... other config
  useRegimeFilter: true,
  allowedRegimes: ['trending']
};
```

## Strategy Templates

### T1: Mean Reversion
- **Best for**: Ranging markets with clear support/resistance
- **Indicators**: Heavy RSI, W%R, Bollinger Bands
- **Filter**: Low ADX (< 20)
- **Risk**: Moderate leverage, tight stops

### T2: Trend Continuation
- **Best for**: Strong trending markets
- **Indicators**: EMA crossovers, MACD, ADX confirmation
- **Filter**: High ADX (>= 25)
- **Risk**: Higher leverage, wider stops

### T3: Hybrid Voting
- **Best for**: All market conditions
- **Indicators**: Balanced weight distribution
- **Filter**: Optional
- **Risk**: Medium leverage, adaptive

### T4: Order Flow Gate (LIVE-ONLY)
- **Best for**: High-frequency scalping
- **Indicators**: Technical signals + DOM imbalance
- **Filter**: None
- **Risk**: High leverage, very tight stops
- **Note**: DOM features have NO historical data - must be validated via LIVE forward-shadow testing only

## Non-Negotiable Constraints

✅ **Preserved Execution Semantics**: ROI-based SL/TP with inverse leverage scaling
✅ **Preserved Risk Features**: Fee-adjusted break-even, staircase trailing, reduceOnly semantics
✅ **Trading Frictions Included**: Taker fees (default), configurable slippage, latency proxy
✅ **Overtrading Prevention**: Cooldown, max positions, max trades/day enforced
✅ **DOM Features**: Validated LIVE-ONLY (no backtest optimization claims)

## Performance Metrics

The engine calculates:

- **Returns**: Net/gross return, return percentage
- **Risk Metrics**: Max drawdown, average drawdown, tail loss (worst 1%)
- **Trade Statistics**: Win rate, average win/loss, largest win/loss
- **Risk-Adjusted**: Sharpe, Sortino, Calmar ratios
- **Other**: Profit factor, expectancy, average R-multiple, average holding period
- **Regime Performance**: Breakdown by market regime

## Fill Models

### Taker Model (Conservative)
- Immediate market order execution
- Full slippage applied
- Taker fees on all fills
- **Use for**: Realistic worst-case estimates

### Probabilistic Limit Model (Optimistic)
- 9th-level depth proxy with ~70% fill rate
- Maker fees when filled
- Smaller slippage
- **Use for**: Best-case limit order estimates

## Slippage Models

- **None**: No slippage (unrealistic)
- **Fixed**: Constant percentage (e.g., 0.02%)
- **Spread-based**: Estimated from bar high-low range
- **Vol-scaled**: Scaled by recent volatility (recommended)

## NPM Scripts

```bash
# Research commands (Coming soon - scripts under development)
npm run research:fetch-ohlcv      # Fetch historical data
npm run research:backtest         # Run backtest
npm run research:optimize         # Run optimization
npm run research:forward-shadow   # Shadow trading
npm run research:report           # Generate report

# Testing
npm run test:research             # Run all research tests
npm run test:invariants           # Run property-based tests
```

## Reproducibility

All results are fully reproducible:

1. **Seeded Randomness**: Use `seed` parameter in config
2. **Deterministic Engine**: Same seed → same results
3. **Version Control**: Save configs as JSON with timestamps
4. **Rerun Command**: Store config hash and parameters

Example:
```typescript
const config = {
  // ... your config
  seed: 42
};

// Save config
fs.writeFileSync('config_20231215_v1.json', JSON.stringify(config, null, 2));

// Results are reproducible
const result1 = await engine.run(data);
const result2 = await engine.run(data); // Identical to result1
```

## Integration with Main Server

This research module is **completely isolated** from the main `server.js`:

- ✅ No modifications to server.js required
- ✅ Uses same DecimalMath library for consistency
- ✅ Compatible with signal-weights.js configuration
- ✅ Can import existing TechnicalIndicators if needed
- ✅ Runs independently in /research folder

## Best Practices

1. **Always include fees and slippage** in backtests
2. **Use walk-forward validation** to avoid overfitting
3. **Test across multiple regimes** (trending, ranging, high-vol)
4. **Enforce position limits** to prevent overtrading
5. **Use deterministic seeds** for reproducibility
6. **Validate live** before production (especially DOM features)
7. **Monitor tail risk** (worst 1% outcomes)
8. **Check regime consistency** across symbols

## Development Status

- ✅ Phase 1-3: Infrastructure, types, indicators, signals (COMPLETE)
- ✅ Phase 4: Backtest engine core (COMPLETE)
- 🚧 Phase 5-6: Walk-forward, optimization (IN PROGRESS)
- ⏳ Phase 7-9: Forward testing, data management, scripts (PLANNED)
- ⏳ Phase 10-11: Sample configs, tests, docs (PLANNED)

## Contributing

When adding new features:

1. Follow existing TypeScript patterns
2. Add comprehensive type definitions
3. Include property-based tests with fast-check
4. Document with examples
5. Ensure determinism (use SeededRandom)
6. Include trading frictions (fees, slippage)

## License

MIT (same as main project)

## Contact

See main project README for contact information.
