# Backtesting Guide

## Overview

The backtesting system provides deterministic, realistic simulation of trading strategies on historical data. It uses the same indicator and signal logic as live trading to ensure consistency.

## Quick Start

### 1. Fetch Historical Data

```bash
npm run research:fetch-ohlcv
```

This fetches 30 days of OHLCV data for configured symbols and timeframes.

### 2. Run Backtest

```bash
npm run research:backtest
```

This runs walk-forward validation on the fetched data.

### 3. View Results

Results are saved to `research/reports/` as JSON files.

## Backtest Engine

### Basic Usage

```javascript
const BacktestEngine = require('./research/backtest/engine');

const config = {
  initialBalance: 10000,
  positionSizePercent: 1.0,
  leverage: 10,
  maxPositions: 5,
  fillModel: 'taker',
  slippagePercent: 0.02,
  makerFee: 0.0002,
  takerFee: 0.0006,
  initialSLROI: 0.5,
  initialTPROI: 2.0,
  breakEvenBuffer: 0.1,
  trailingStepPercent: 0.15,
  trailingMovePercent: 0.05,
  signalProfile: 'balanced',
  seed: 42
};

const engine = new BacktestEngine(config);
const results = await engine.run(candles, indicators);

console.log(`Return: ${results.returnPercent.toFixed(2)}%`);
console.log(`Win Rate: ${results.winRate.toFixed(2)}%`);
console.log(`Profit Factor: ${results.profitFactor.toFixed(2)}`);
```

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `initialBalance` | 10000 | Starting capital (USDT) |
| `positionSizePercent` | 1.0 | % of balance per trade |
| `leverage` | 10 | Position leverage |
| `maxPositions` | 5 | Max concurrent positions |
| `fillModel` | 'taker' | 'taker' or 'probabilistic_limit' |
| `slippagePercent` | 0.02 | Slippage % (2 basis points) |
| `makerFee` | 0.0002 | Maker fee (0.02%) |
| `takerFee` | 0.0006 | Taker fee (0.06%) |
| `initialSLROI` | 0.5 | Initial stop loss ROI % |
| `initialTPROI` | 2.0 | Initial take profit ROI % |
| `breakEvenBuffer` | 0.1 | Break-even buffer ROI % |
| `trailingStepPercent` | 0.15 | Trailing step % |
| `trailingMovePercent` | 0.05 | Trailing move % |
| `signalProfile` | 'balanced' | Signal profile |
| `seed` | 42 | RNG seed for determinism |

## Walk-Forward Validation

Walk-forward validation prevents overfitting by testing on out-of-sample data.

### Usage

```javascript
const WalkForward = require('./research/backtest/walkforward');

const walkForward = new WalkForward({
  nFolds: 5,
  trainPercent: 0.7,
  purgePercent: 0.05,
  minTradesPerFold: 10
});

const results = await walkForward.run(candles, indicators, config);

if (results.valid) {
  console.log(`Average Return: ${results.avgReturn.toFixed(2)}%`);
  console.log(`Stability: ${(results.stability * 100).toFixed(2)}%`);
  console.log(`Worst Fold: ${results.worstFold.returnPercent.toFixed(2)}%`);
}
```

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `nFolds` | 5 | Number of walk-forward folds |
| `trainPercent` | 0.7 | % of fold for training (unused in backtest) |
| `purgePercent` | 0.05 | % gap between folds (prevents leakage) |
| `minTradesPerFold` | 10 | Minimum trades required per fold |

### Fold Structure

```
Fold 1: |----train----|--purge--|----test----|
Fold 2:                          |----train----|--purge--|----test----|
Fold 3:                                                    |----train----|--purge--|----test----|
...
```

## Performance Metrics

### Usage

```javascript
const Metrics = require('./research/backtest/metrics');

const metrics = Metrics.calculate(results);

console.log(Metrics.format(metrics));
```

### Available Metrics

**Returns**:
- `totalNetPnl` - Total profit/loss after fees
- `totalGrossPnl` - Total profit/loss before fees
- `returnPercent` - % return on initial capital
- `returnPerTrade` - Average P&L per trade

**Win Metrics**:
- `winRate` - % of winning trades
- `profitFactor` - Gross profit / Gross loss
- `payoffRatio` - Average win / Average loss

**Risk Metrics**:
- `sharpeRatio` - Risk-adjusted return
- `sortinoRatio` - Downside risk-adjusted return
- `maxDrawdown` - Maximum % drawdown
- `calmarRatio` - Return / Max drawdown

**Expectancy**:
- `expectancy` - Expected $ per trade
- `rMultiple` - Expectancy as multiple of risk

**Tail Risk**:
- `maxLoss` - Largest losing trade
- `maxWin` - Largest winning trade
- `tailRatio` - Max win / Max loss

**Stability**:
- `consistency` - Variance in rolling returns (0-1)
- `maxWinStreak` - Longest winning streak
- `maxLossStreak` - Longest losing streak

## Fill Models

### Taker Model

Immediate market order fills with taker fees and slippage.

```javascript
fillModel: 'taker'
```

**Characteristics**:
- Guaranteed fill
- Uses taker fees (0.06%)
- Slippage applied in adverse direction
- Entry: Longs pay more, shorts receive less
- Exit: Longs receive less, shorts pay more

### Probabilistic Limit Model

Limit orders with probabilistic fills.

```javascript
fillModel: 'probabilistic_limit',
limitFillProbability: 0.5  // 50% chance of fill
```

**Characteristics**:
- Not guaranteed to fill
- Uses maker fees (0.02%) if filled
- Falls back to taker if not filled
- More realistic for limit order strategies

## Slippage Models

### Fixed Slippage

Constant % slippage on all orders.

```javascript
slippageModel: 'fixed',
slippagePercent: 0.02  // 2 basis points
```

### No Slippage

Zero slippage (optimistic).

```javascript
slippageModel: 'none'
```

## Example: Full Backtest Workflow

```javascript
const { RSIIndicator, MACDIndicator } = require('../indicatorEngines');
const BacktestEngine = require('./research/backtest/engine');
const WalkForward = require('./research/backtest/walkforward');
const Metrics = require('./research/backtest/metrics');

// Load historical data
const candles = JSON.parse(
  fs.readFileSync('./research/data/XBTUSDTM_1hour.json', 'utf8')
);

// Calculate indicators
const rsi = new RSIIndicator({ period: 14 });
const macd = new MACDIndicator();

const indicators = {};
candles.forEach(candle => {
  const rsiValue = rsi.update(candle);
  const macdValue = macd.update(candle);
  
  indicators[candle.symbol] = {
    rsi: rsiValue,
    macd: macdValue,
    williamsR: -50,  // Placeholder
    ao: 0,
    ema50: candle.close,
    ema200: candle.close,
    bollinger: { upper: candle.close * 1.02, lower: candle.close * 0.98 },
    stochastic: { k: 50, d: 50 },
    atr: candle.close * 0.01,
    atrPercent: 1.0
  };
});

// Run walk-forward validation
const walkForward = new WalkForward();
const results = await walkForward.run(candles, indicators, {
  initialBalance: 10000,
  positionSizePercent: 1.0,
  leverage: 10
});

// Calculate comprehensive metrics
const allTrades = results.foldResults.flatMap(f => f.trades);
const metrics = Metrics.calculate({
  ...results,
  trades: allTrades,
  initialBalance: 10000
});

// Display results
console.log('=== Backtest Results ===');
console.log(`Valid Folds: ${results.validFolds}/${results.nFolds}`);
console.log(`Average Return: ${results.avgReturn.toFixed(2)}%`);
console.log(`Win Rate: ${results.avgWinRate.toFixed(2)}%`);
console.log(`Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}`);
console.log(`Max Drawdown: ${results.avgMaxDrawdown.toFixed(2)}%`);
console.log(`Stability: ${(results.stability * 100).toFixed(2)}%`);

// Save report
fs.writeFileSync(
  './research/reports/backtest.json',
  JSON.stringify({ results, metrics }, null, 2)
);
```

## Best Practices

### 1. Always Use Walk-Forward

```javascript
// ❌ BAD: In-sample testing
const engine = new BacktestEngine(config);
const results = await engine.run(allCandles, indicators);

// ✅ GOOD: Walk-forward validation
const walkForward = new WalkForward();
const results = await walkForward.run(allCandles, indicators, config);
```

### 2. Check Minimum Trades

```javascript
if (results.valid && results.avgTrades >= 30) {
  // Sufficient sample size
} else {
  console.warn('Insufficient trades for statistical significance');
}
```

### 3. Validate Stability

```javascript
if (results.stability > 0.6 && results.worstFold.returnPercent > 0) {
  console.log('Strategy appears robust');
} else {
  console.warn('High variance or losing folds detected');
}
```

### 4. Use Realistic Fees

```javascript
// KuCoin Futures fees (VIP 0)
makerFee: 0.0002,  // 0.02%
takerFee: 0.0006,  // 0.06%
```

### 5. Model Slippage

```javascript
// Conservative slippage estimate
slippagePercent: 0.02  // 2 basis points
```

## Troubleshooting

### "No folds met minimum trade requirement"

Reduce `minTradesPerFold` or increase data range:

```javascript
minTradesPerFold: 5  // Lower threshold
```

### "High variance in fold results"

Strategy may be overfit or market-regime dependent:

```javascript
// Check regime breakdown
const regimeResults = walkForward.analyzeRegimes(results.foldResults, regimeData);
```

### "Negative returns in all folds"

Strategy parameters need optimization:

```bash
npm run research:optimize
```

---

**Version**: 1.0.0
**Last Updated**: January 2026
**Status**: Production Ready
