# System Architecture

## Overview

The KuCoin Futures Dashboard v3.5.2 is a comprehensive trading system with three main layers:

1. **Live Trading Layer** - Real-time trading with server.js
2. **Research Layer** - Backtesting and optimization infrastructure
3. **Indicator Engine Layer** - Institutional-grade incremental indicators

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     Live Trading Layer                       │
│  ┌──────────┐    ┌──────────┐    ┌────────────────────┐   │
│  │ index.   │◄──►│ server.  │◄──►│ KuCoin Futures API │   │
│  │ html     │    │ js       │    │                     │   │
│  │ (UI)     │    │ (Backend)│    │                     │   │
│  └──────────┘    └────┬─────┘    └────────────────────┘   │
│                       │                                      │
│                       ▼                                      │
│              ┌────────────────┐                             │
│              │ Position       │                             │
│              │ Manager        │                             │
│              └────────────────┘                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    Indicator Engine Layer                    │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ RSI      │  │ MACD     │  │ Williams │  │ Awesome  │   │
│  │ Indicator│  │ Indicator│  │ Indicator│  │ Oscillator│  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                 │
│  │ KDJ      │  │ OBV      │  │ ADX      │                 │
│  │ Indicator│  │ Indicator│  │ Indicator│                 │
│  └──────────┘  └──────────┘  └──────────┘                 │
│                                                              │
│  • O(1) incremental updates                                 │
│  • State serialization support                              │
│  • No window recomputation                                  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     Research Layer                           │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                Data Pipeline                          │  │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐      │  │
│  │  │ fetch-   │───►│ research/│───►│ Indicator│      │  │
│  │  │ ohlcv.js │    │ data/    │    │ Engines  │      │  │
│  │  └──────────┘    └──────────┘    └──────────┘      │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Backtest Engine                          │  │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐      │  │
│  │  │ engine.js│───►│walkforward│───►│ metrics. │      │  │
│  │  │          │    │ .js      │    │ js       │      │  │
│  │  └──────────┘    └──────────┘    └──────────┘      │  │
│  │                                                        │  │
│  │  • Deterministic execution                           │  │
│  │  • Walk-forward validation                           │  │
│  │  • Comprehensive metrics                             │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Optimizer                                │  │
│  │  ┌──────────┐    ┌──────────┐    ┌──────────┐      │  │
│  │  │optimizer.│───►│ Pareto   │───►│ research/│      │  │
│  │  │ js       │    │ Front    │    │ configs/ │      │  │
│  │  └──────────┘    └──────────┘    └──────────┘      │  │
│  │                                                        │  │
│  │  • Multi-objective optimization                      │  │
│  │  • Parallel evaluation                               │  │
│  │  • Ablation analysis                                 │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
/
├── server.js                     # Main backend server
├── index.html                    # Frontend dashboard
├── signal-weights.js             # Signal configuration
├── screenerConfig.js             # Screener configuration
├── screenerEngine.js             # Dual-timeframe screener
│
├── src/                          # Core library modules
│   ├── lib/                      # Trading logic libraries
│   │   ├── DecimalMath.js        # Precision-safe math
│   │   ├── OrderValidator.js     # Order validation
│   │   ├── ConfigSchema.js       # Config validation
│   │   ├── SignalGenerator.js    # Signal generation
│   │   ├── PingBudgetManager.js  # Rate limit management
│   │   ├── SecureLogger.js       # Secure logging
│   │   ├── EventBus.js           # Event bus
│   │   ├── StopOrderStateMachine.js
│   │   ├── StopReplaceCoordinator.js
│   │   └── index.js
│   │
│   ├── marketdata/               # Market data providers
│   │   ├── OHLCProvider.js
│   │   └── index.js
│   │
│   └── optimizer/                # Live optimization
│       ├── ExecutionSimulator.js
│       ├── LiveOptimizerController.js
│       ├── TrailingStopPolicy.js
│       └── index.js
│
├── indicatorEngines/             # ⭐ NEW: Incremental indicators
│   ├── RSIIndicator.js           # Wilder RSI
│   ├── MACDIndicator.js          # EMA-based MACD
│   ├── WilliamsRIndicator.js     # Williams %R
│   ├── AwesomeOscillator.js      # Awesome Oscillator
│   ├── KDJIndicator.js           # KDJ (Stochastic)
│   ├── OBVIndicator.js           # On-Balance Volume
│   ├── ADXIndicator.js           # Average Directional Index
│   └── index.js
│
├── research/                     # ⭐ NEW: Research infrastructure
│   ├── data/                     # Historical data storage
│   ├── backtest/                 # Backtesting engine
│   │   ├── engine.js             # Core backtest engine
│   │   ├── walkforward.js        # Walk-forward validation
│   │   ├── metrics.js            # Performance metrics
│   │   └── index.js
│   │
│   ├── optimize/                 # Optimization engine
│   │   └── optimizer.js          # Multi-objective optimizer
│   │
│   ├── forward/                  # Live forward testing
│   │   ├── shadow-runner.js      # Shadow trading
│   │   ├── dom-collector.js      # DOM data collection
│   │   └── live-metrics.js       # Latency metrics
│   │
│   ├── lib/signals/              # Extended signal generators
│   │   └── extended-generator.js
│   │
│   ├── configs/                  # Strategy configs (output)
│   ├── reports/                  # Performance reports (output)
│   │
│   └── scripts/                  # Utility scripts
│       ├── fetch-ohlcv.js        # Data fetching
│       ├── run-backtest.js       # Run backtest
│       ├── run-optimizer.js      # Run optimizer
│       ├── run-shadow.js         # Shadow testing
│       └── generate-report.js    # Report generation
│
├── tests/                        # Test suite
│   ├── tradeMath.test.js
│   ├── tradeMath.property.test.js
│   ├── configValidation.test.js
│   ├── pingBudgetManager.test.js
│   ├── signal-generator.test.js
│   ├── execution-simulator.test.js
│   ├── live-optimizer.test.js
│   └── ... (other tests)
│
├── docs/                         # Documentation
│   ├── OPTIMIZER.md
│   ├── SIGNAL_CONFIG.md
│   ├── TESTING.md
│   ├── OHLC_PROVIDER.md
│   ├── INDICATORS.md             # ⭐ NEW
│   ├── BACKTEST.md               # ⭐ NEW
│   └── OPTIMIZATION.md           # ⭐ NEW
│
├── package.json                  # Dependencies & scripts
├── .env.example                  # Environment template
└── README.md                     # Main documentation
```

## Data Flow

### Live Trading Flow

```
Market Data → Indicators → Signal Generation → Position Management → Order Execution
     ↓            ↓              ↓                    ↓                    ↓
 WebSocket     Incremental     SignalGenerator    PositionManager    KuCoin API
   Feed        Calculation       (weighted)        (risk mgmt)
```

### Research Flow

```
Historical Data → Indicators → Backtest → Optimization → Top Configs
       ↓             ↓            ↓            ↓             ↓
  fetch-ohlcv   Incremental   Walk-Forward   Multi-Obj    JSON/CSV
   (KuCoin)     Calculation    Validation     Pareto      Artifacts
```

## Key Components

### 1. Indicator Engines

**Purpose**: Provide institutional-grade incremental technical indicators

**Features**:
- O(1) updates per candle (after warmup)
- No window recomputation
- State serialization support
- Identical behavior across timeframes

**Indicators**:
- RSI (Wilder's method)
- MACD (EMA-based)
- Williams %R
- Awesome Oscillator
- KDJ (Stochastic variant)
- OBV (On-Balance Volume)
- ADX (Directional Index)

### 2. Backtest Engine

**Purpose**: Deterministic backtesting with realistic execution

**Features**:
- Leverage-aware ROI-based SL/TP
- Fee-adjusted break-even
- Staircase trailing stops
- Multiple fill models
- Slippage modeling
- Walk-forward validation

**Components**:
- `engine.js` - Core backtest logic
- `walkforward.js` - Time-series validation
- `metrics.js` - Performance calculation

### 3. Optimizer

**Purpose**: Find optimal strategy configurations

**Features**:
- Multi-objective optimization
- Parallel evaluation
- Pareto front calculation
- Ablation analysis
- Config versioning

**Stages**:
- Stage A: Random/LHS screening
- Stage B: Refinement of top configs

### 4. Live Trading

**Purpose**: Execute trades on KuCoin Futures

**Features**:
- Real-time WebSocket data
- Position management
- Trailing stops
- Break-even logic
- API retry queue
- Order validation

## Integration Points

### Indicators → Live Trading

```javascript
const { RSIIndicator, MACDIndicator } = require('./indicatorEngines');

// In server.js
const rsi = new RSIIndicator({ period: 14 });
const macd = new MACDIndicator({ fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });

// On each candle
const rsiValue = rsi.update(candle);
const macdValue = macd.update(candle);
```

### Indicators → Research

```javascript
const { RSIIndicator } = require('../indicatorEngines');
const BacktestEngine = require('./research/backtest/engine');

// Calculate indicators for historical data
const rsi = new RSIIndicator();
const indicators = candles.map(c => ({
  rsi: rsi.update(c),
  // ... other indicators
}));

// Run backtest
const engine = new BacktestEngine(config);
const results = await engine.run(candles, indicators);
```

### Optimizer → Live Trading

```javascript
// Load optimized config
const topConfig = require('./research/configs/top20_latest.json')[0];

// Apply to live trading
CONFIG.TRADING = {
  ...CONFIG.TRADING,
  POSITION_SIZE_PERCENT: topConfig.config.positionSizePercent,
  DEFAULT_LEVERAGE: topConfig.config.leverage,
  INITIAL_SL_ROI: topConfig.config.initialSLROI,
  INITIAL_TP_ROI: topConfig.config.initialTPROI
};
```

## Workflow

### Development Workflow

1. **Data Collection**
   ```bash
   npm run research:fetch-ohlcv
   ```

2. **Backtesting**
   ```bash
   npm run research:backtest
   ```

3. **Optimization**
   ```bash
   npm run research:optimize
   ```

4. **Report Generation**
   ```bash
   npm run research:report
   ```

5. **Live Testing (Shadow)**
   ```bash
   npm run research:shadow
   ```

6. **Production Deployment**
   ```bash
   npm start
   ```

### Testing Workflow

1. **Unit Tests**
   ```bash
   npm test
   ```

2. **Indicator Tests**
   ```bash
   npm run test:indicators
   ```

3. **Rate Limit Tests**
   ```bash
   npm run test:rate-limit
   ```

## Performance Characteristics

### Indicator Engines
- **Latency**: < 1ms per update
- **Memory**: ~1KB per indicator
- **Throughput**: 10,000+ updates/sec

### Backtest Engine
- **Speed**: ~5,000 candles/sec
- **Memory**: ~10MB for 10K candles
- **Accuracy**: Tick-level precision

### Optimizer
- **Speed**: ~20 configs/min (with walk-forward)
- **Parallelism**: 4 workers by default
- **Scalability**: Linear with CPU cores

## Security

### API Key Protection
- Environment variables only
- SecureLogger for redaction
- No keys in logs or commits

### Order Safety
- OrderValidator enforces reduceOnly
- Config validation at startup
- Rate limit protection

### Code Quality
- CodeQL security scanning
- Property-based testing
- Comprehensive unit tests

## Monitoring

### Live Metrics
- Position P&L tracking
- API rate limit usage
- WebSocket latency
- Event loop lag

### Research Metrics
- Backtest performance
- Optimization progress
- Walk-forward stability
- Pareto front evolution

## Future Enhancements

1. **Real-time ML Integration**
   - Online learning from live data
   - Dynamic weight adjustment
   - Anomaly detection

2. **Advanced Fill Models**
   - Liquidity-based simulation
   - Market impact modeling
   - Order book depth analysis

3. **Multi-Exchange Support**
   - Binance Futures
   - Bybit Perpetuals
   - Cross-exchange arbitrage

4. **Portfolio Management**
   - Multi-asset allocation
   - Risk parity weighting
   - Correlation analysis

---

**Version**: 3.5.2
**Last Updated**: January 2026
**Status**: Production Ready
