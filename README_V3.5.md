# MIRKO V3.5 - KuCoin Futures Trading System

## 🚀 V3.5.0 Complete System

MIRKO V3.5 is a comprehensive KuCoin Perpetual Futures trading system with advanced screener, multi-strategy support, and live optimization capabilities.

### Key Features

| Feature | Description |
|---------|-------------|
| **Dual-Timeframe Screener** | Monitors multiple pairs across two timeframes for signal alignment |
| **10 Technical Indicators** | RSI, MACD, Williams %R, AO, KDJ, OBV, Stochastic, Bollinger, EMA, DOM* |
| **5 Strategy Profiles** | Conservative, Aggressive, Balanced, Scalping, Swing Trading |
| **Live Optimizer** | Automatically evaluates and switches between strategies |
| **Configurable Weights** | CLI tool for tuning indicator importance |
| **Leverage Calculator** | Volatility-aware position sizing with risk adjustment |
| **Rate Limit Manager** | Adaptive token bucket with priority queues |
| **Precision Math** | Decimal.js for error-free financial calculations |
| **Research Pipeline** | Data fetching, backtesting, and parameter optimization |

\* DOM (Depth of Market) requires live WebSocket feed

---

## 📁 Repository Structure

```
kucoin-bot-v3.5/
├── 📂 core/                        # Core trading engine
│   ├── server.js                   # Main bot entry point
│   ├── signal-weights.js           # Weight configuration (with KDJ/OBV/DOM)
│   ├── SignalGenerator-configurable.js  # Configurable signal generator
│   ├── adjust-weights.js           # CLI for tuning weights
│   ├── leverage-calculator.js      # Leverage-aware sizing logic
│   ├── positions.json              # Persistent position store
│   └── retry_queue.json            # Orders needing retry
│
├── 📂 screener/                    # Dual-Timeframe Screener Module
│   ├── screenerEngine.js           # Main screener orchestration
│   ├── screenerConfig.js           # Screener configuration
│   ├── signalEmitter.js            # Signal output handler
│   ├── dataFeed.js                 # KuCoin WebSocket data feed
│   ├── timeframeAligner.js         # Dual-timeframe alignment logic
│   └── indicatorEngines/
│       ├── BaseIndicator.js        # Base class for indicators
│       ├── RSIIndicator.js         # RSI with incremental calc
│       ├── MACDIndicator.js        # MACD indicator
│       ├── WilliamsRIndicator.js   # Williams %R
│       ├── AwesomeOscillator.js    # AO indicator
│       ├── KDJIndicator.js         # KDJ (K%D%J stochastic)
│       ├── OBVIndicator.js         # On-Balance Volume
│       └── index.js                # Export all indicators
│
├── 📂 strategy/                    # Strategy Management
│   ├── strategyRouter.js           # Strategy switching logic
│   ├── signalProfiles/
│   │   ├── conservative.js         # Low-risk trend following
│   │   ├── aggressive.js           # High-risk momentum
│   │   ├── balanced.js             # General purpose
│   │   └── scalping.js             # Short-term trading
│   └── optimizer/
│       ├── optimizerEngine.js      # Live optimizer controller
│       ├── optimizerConfig.js      # Optimizer settings
│       ├── optimizerScoring.js     # Scoring and confidence gating
│       └── results/                # Optimization results
│
├── 📂 dashboard/
│   └── index.html                  # Web UI Dashboard
│
├── 📂 config/
│   ├── .env.example                # Environment template
│   ├── pairs.json                  # Trading pairs configuration
│   └── runtimeConfig.js            # Runtime toggles and settings
│
├── 📂 src/lib/                     # Core Utilities
│   ├── DecimalMath.js              # Precision-safe math
│   ├── ConfigSchema.js             # Config validation
│   ├── EventBus.js                 # Event system
│   ├── OrderValidator.js           # Order validation
│   ├── SecureLogger.js             # Secure logging
│   ├── StopOrderStateMachine.js    # Stop order protection
│   ├── PingBudgetManager.js        # Rate limiting
│   ├── telemetry.js                # Telemetry pub/sub
│   └── index.js                    # Module exports
│
├── 📂 research/                    # Research & Optimization
│   ├── README.md
│   ├── data/
│   │   ├── fetch_ohlcv.js          # OHLCV data fetcher
│   │   └── live_recorder.js        # Live event recorder
│   ├── optimize/
│   │   ├── search-space.js         # Parameter bounds
│   │   ├── optimizer.js            # Multi-objective optimizer
│   │   ├── ablation.js             # Ablation testing
│   │   └── worker-pool.js          # Parallel evaluation
│   └── configs/
│       └── top_configs/            # Optimized configs storage
│
├── 📂 test/
│   ├── unit/                       # Unit tests
│   ├── integration/                # Integration tests
│   ├── mocks/                      # Mock data
│   └── property/                   # Property-based tests
│
├── 📂 scripts/
│   ├── backtest-runner.js          # Backtest executor
│   ├── export-signals.js           # Signal exporter
│   └── deploy.sh                   # Deployment script
│
├── 📂 logs/                        # Log files
│
├── 📄 package.json                 # v3.5.0 with all dependencies
├── 📄 README.md                    # This file
├── 📄 WEIGHT_ADJUSTMENT_GUIDE.md   # Weight tuning guide
└── 📄 .github/
    └── workflows/ci.yml            # CI configuration
```

---

## 🚦 Quick Start

### 1. Installation

```bash
# Clone repository
git clone https://github.com/Ritenoob/miniature-enigma.git
cd miniature-enigma

# Install dependencies
npm install

# Copy environment template
cp config/.env.example .env

# Edit .env with your KuCoin API credentials
nano .env
```

### 2. Configuration

Edit `.env`:
```env
KUCOIN_API_KEY=your_api_key
KUCOIN_SECRET_KEY=your_secret_key
KUCOIN_PASSPHRASE=your_passphrase
PORT=3001
```

### 3. Run the System

```bash
# Start main trading bot
npm start

# OR start the screener (monitors market for signals)
npm run screener

# OR run the optimizer (evaluates strategies)
npm run optimizer
```

---

## 📊 Usage Examples

### Main Trading Bot
```bash
npm start
```
Opens dashboard at `http://localhost:3001`

### Market Screener
```bash
npm run screener
```
Monitors configured pairs and outputs signals to:
- Console (colored output)
- File: `logs/screener-signals.jsonl`
- WebSocket (if enabled)

### Weight Adjustment
```bash
# Interactive mode
npm run adjust-weights

# Export specific profile
node core/adjust-weights.js --profile=aggressive --export=my-config.json
```

### Data Collection
```bash
# Fetch historical data
npm run fetch-data -- --pair=XBTUSDTM --timeframe=5m --days=30

# Export signals
npm run export-signals -- --input=logs/screener-signals.jsonl --output=signals.csv --format=csv
```

### Backtesting
```bash
npm run backtest -- --config=strategy/signalProfiles/balanced.js --data=research/data/XBTUSDTM_5m.jsonl
```

---

## 🎯 Strategy Profiles

### Conservative
- **Focus**: Trend indicators (MACD 25pts, EMA 30pts)
- **Risk**: Low
- **Leverage**: Max 5x
- **Best for**: Stable trending markets

### Aggressive
- **Focus**: Momentum (RSI 30pts, Williams %R 25pts, KDJ 20pts)
- **Risk**: High
- **Leverage**: Max 20x
- **Best for**: Volatile markets

### Balanced
- **Focus**: Equal distribution
- **Risk**: Medium
- **Leverage**: Max 10x
- **Best for**: General purpose

### Scalping
- **Focus**: Quick signals (Williams %R, KDJ, DOM)
- **Risk**: Medium-High
- **Leverage**: Max 15x
- **Best for**: 1-5 minute timeframes

### Swing Trading
- **Focus**: Longer timeframes (MACD, EMA, OBV)
- **Risk**: Low-Medium
- **Leverage**: Max 5x
- **Best for**: 1-4 hour timeframes

---

## 📈 Indicators

| Indicator | Purpose | Default Weight |
|-----------|---------|----------------|
| RSI | Overbought/oversold | 25 pts |
| Williams %R | Momentum | 20 pts |
| MACD | Trend following | 20 pts |
| Awesome Oscillator | Momentum | 15 pts |
| EMA Trend | Long-term direction | 20 pts |
| Stochastic | Momentum crossovers | 10 pts |
| Bollinger Bands | Volatility | 10 pts |
| KDJ | Enhanced stochastic | 15 pts |
| OBV | Volume momentum | 10 pts |
| DOM* | Order book imbalance | 15 pts |

\* DOM requires live WebSocket feed (`enabled: false` by default)

---

## 🔧 Configuration

### Runtime Configuration
Edit `config/runtimeConfig.js`:

```javascript
module.exports = {
  features: {
    screener: { enabled: true },
    optimizer: { enabled: false },
    dom: { enabled: false }  // Requires live data
  },
  strategy: {
    activeProfile: 'balanced'
  }
};
```

### Trading Pairs
Edit `config/pairs.json`:

```json
[
  "XBTUSDTM",
  "ETHUSDTM",
  "SOLUSDTM"
]
```

### Screener Settings
Edit `screener/screenerConfig.js` for:
- Timeframes
- Indicator parameters
- Signal output options
- Volume/spread filters

---

## 📚 Documentation

- **[Weight Adjustment Guide](WEIGHT_ADJUSTMENT_GUIDE.md)**: Complete guide to tuning indicator weights
- **[Research Module](research/README.md)**: Data collection, backtesting, and optimization
- **Strategy Profiles**: See `strategy/signalProfiles/` for examples

---

## 🧪 Testing

```bash
# Run all tests
npm test

# Unit tests only
npm run test:unit

# Property-based tests
npm run test:property
```

---

## 🔐 Security Features

- **API Key Redaction**: Automatic redaction in logs
- **Order Validation**: `reduceOnly` enforcement on all exit orders
- **Config Validation**: Schema validation at startup
- **Rate Limiting**: Adaptive token bucket with 70% target utilization

---

## 📦 Dependencies

- **axios**: HTTP client for API requests
- **decimal.js**: Precision arithmetic
- **dotenv**: Environment variable management
- **express**: Web server
- **ws**: WebSocket client
- **fast-check**: Property-based testing (dev)

---

## 🚀 Deployment

```bash
# Run deployment script
./scripts/deploy.sh
```

This will:
1. Check Node.js version
2. Install dependencies
3. Run tests
4. Verify environment configuration

---

## 📝 NPM Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Start main trading bot |
| `npm run screener` | Start market screener |
| `npm run optimizer` | Start strategy optimizer |
| `npm run backtest` | Run backtests |
| `npm test` | Run all tests |
| `npm run adjust-weights` | Interactive weight tuning |
| `npm run fetch-data` | Fetch historical OHLCV data |
| `npm run export-signals` | Export signals to CSV/JSON |

---

## 🛠️ Advanced Features

### Live Optimization
The optimizer evaluates strategy performance in real-time and can automatically switch to the best-performing profile:

```javascript
// In strategy/optimizer/optimizerConfig.js
module.exports = {
  enabled: true,
  autoSwitch: true,
  minTradesForEvaluation: 20,
  minConfidenceScore: 0.7
};
```

### Leverage Calculator
Automatic leverage adjustment based on volatility:

```javascript
const { calculateAutoLeverage } = require('./core/leverage-calculator');

const leverage = calculateAutoLeverage(atrPercent, leverageTiers);
```

### Rate Limit Management
Adaptive rate limiting with priority queues:

```javascript
const PingBudgetManager = require('./src/lib/PingBudgetManager');

const manager = new PingBudgetManager();
const allowed = await manager.request('high', 1);  // Priority: critical/high/medium/low
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

---

## 📄 License

MIT License - see LICENSE file for details

---

## ⚠️ Disclaimer

This software is for educational and research purposes only. Trading cryptocurrencies involves substantial risk. Use at your own risk. The authors are not responsible for any financial losses incurred.

---

## 🔗 Links

- **Repository**: https://github.com/Ritenoob/miniature-enigma
- **KuCoin API**: https://docs.kucoin.com/futures
- **Issues**: https://github.com/Ritenoob/miniature-enigma/issues

---

## 📞 Support

For questions or issues:
1. Check the [Weight Adjustment Guide](WEIGHT_ADJUSTMENT_GUIDE.md)
2. Review the [Research Module README](research/README.md)
3. Open an issue on GitHub

---

**MIRKO V3.5** - Advanced KuCoin Futures Trading System
