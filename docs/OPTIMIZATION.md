# Optimization Guide

## Overview

The optimization system finds optimal strategy configurations using multi-objective optimization. It explores parameter spaces, evaluates performance with walk-forward validation, and produces ranked configurations.

## Quick Start

### 1. Prepare Data

```bash
npm run research:fetch-ohlcv
```

### 2. Run Optimization

```bash
npm run research:optimize
```

### 3. View Results

Results are saved to:
- `research/configs/top20_<timestamp>.json` - Top 20 configs
- `research/configs/pareto_<timestamp>.json` - Pareto front
- `research/configs/leaderboard_<timestamp>.csv` - CSV leaderboard

## Optimizer

### Basic Usage

```javascript
const Optimizer = require('./research/optimize/optimizer');

const optimizer = new Optimizer({
  populationSize: 100,
  nGenerations: 20,
  nParallel: 4,
  objectives: ['return', 'sharpe', 'stability'],
  seed: 42
});

const results = await optimizer.run(candles, indicators);

// Top configurations
results.top20.forEach((config, i) => {
  console.log(`${i + 1}. Return: ${config.metrics.returnPercent.toFixed(2)}%`);
  console.log(`   Sharpe: ${config.metrics.sharpe.toFixed(2)}`);
  console.log(`   Stability: ${(config.metrics.stability * 100).toFixed(2)}%`);
});
```

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `populationSize` | 100 | Number of configs to test in Stage A |
| `nGenerations` | 20 | Number of refinement iterations |
| `nParallel` | 4 | Parallel worker threads |
| `objectives` | `['return', 'sharpe', 'stability']` | Optimization objectives |
| `seed` | 42 | RNG seed for reproducibility |

## Optimization Stages

### Stage A: Random Screening

Explores parameter space with random sampling.

**Search Space**:
- Position size: 0.5% - 2.0%
- Leverage: 5x - 20x
- Initial SL ROI: 0.3% - 1.0%
- Initial TP ROI: 1.5% - 5.0%
- Break-even buffer: 0.05% - 0.3%
- Trailing step: 0.1% - 0.3%
- Trailing move: 0.03% - 0.1%
- Signal profile: conservative, balanced, aggressive

**Output**: 100 tested configurations, sorted by return

### Stage B: Refinement

Refines top 20% from Stage A using parameter perturbation.

**Process**:
1. Take top 20 configs from Stage A
2. Generate 5 variations per config (small parameter changes)
3. Evaluate 100 refined configs
4. Combine with Stage A results

**Output**: Combined result set, sorted by multi-objective score

## Multi-Objective Optimization

### Pareto Front

Configurations where no other config is better in all objectives.

```javascript
const paretoFront = optimizer.calculateParetoFront(results);

// Example: Config A dominates Config B if:
// - A.return >= B.return
// - A.sharpe >= B.sharpe
// - A.stability >= B.stability
// - At least one is strictly better
```

### Objectives

**Return** (returnPercent):
- Primary profitability metric
- Higher is better
- Walk-forward average

**Sharpe Ratio**:
- Risk-adjusted return
- Higher is better
- Accounts for volatility

**Stability**:
- Consistency across folds
- 0-1, higher is better
- Low variance in returns

**Win Rate** (optional):
- % of winning trades
- Higher is better
- Secondary metric

**Profit Factor** (optional):
- Gross profit / Gross loss
- > 1.5 is good
- > 2.0 is excellent

**Max Drawdown** (optional):
- Maximum % decline
- Lower is better
- Risk metric

## Parameter Search Ranges

### Position Sizing

```javascript
positionSizePercent: {
  min: 0.5,   // 0.5% of balance
  max: 2.0,   // 2% of balance
  default: 1.0
}
```

**Impact**:
- Lower: More conservative, lower volatility
- Higher: More aggressive, higher returns (and risk)

### Leverage

```javascript
leverage: {
  min: 5,     // 5x leverage
  max: 20,    // 20x leverage
  default: 10
}
```

**Impact**:
- Lower: Less capital efficiency, lower risk
- Higher: More capital efficiency, higher risk

### Stop Loss ROI

```javascript
initialSLROI: {
  min: 0.3,   // 0.3% ROI loss
  max: 1.0,   // 1% ROI loss
  default: 0.5
}
```

**Impact**:
- Tighter: More stops, lower losses per trade
- Wider: Fewer stops, larger losses per trade

### Take Profit ROI

```javascript
initialTPROI: {
  min: 1.5,   // 1.5% ROI gain
  max: 5.0,   // 5% ROI gain
  default: 2.0
}
```

**Impact**:
- Tighter: More wins, smaller profit per trade
- Wider: Fewer wins, larger profit per trade

### Break-Even Buffer

```javascript
breakEvenBuffer: {
  min: 0.05,  // 0.05% buffer
  max: 0.3,   // 0.3% buffer
  default: 0.1
}
```

**Impact**:
- Lower: Faster break-even, more protection
- Higher: Delayed break-even, more room to run

### Trailing Stop Parameters

```javascript
trailingStepPercent: {
  min: 0.1,   // Trail every 0.1% ROI
  max: 0.3,   // Trail every 0.3% ROI
  default: 0.15
}

trailingMovePercent: {
  min: 0.03,  // Move SL by 0.03% price
  max: 0.1,   // Move SL by 0.1% price
  default: 0.05
}
```

**Impact**:
- Tighter step: Trail more often, lock profits faster
- Wider step: Trail less often, give more room
- Larger move: More aggressive trailing
- Smaller move: More conservative trailing

### Signal Profile

```javascript
signalProfile: ['conservative', 'balanced', 'aggressive']
```

**Impact**:
- Conservative: Fewer trades, higher confidence
- Balanced: Moderate trade frequency
- Aggressive: More trades, lower confidence threshold

## Evaluation Process

### Walk-Forward Validation

Each config is evaluated using walk-forward:

```javascript
const walkForward = new WalkForward({
  nFolds: 5,
  trainPercent: 0.7,
  purgePercent: 0.05,
  minTradesPerFold: 10
});

const results = await walkForward.run(candles, indicators, config);
```

### Metrics Calculation

Comprehensive metrics calculated for each config:

```javascript
const metrics = Metrics.calculate({
  ...results,
  trades: results.foldResults.flatMap(f => f.trades)
});

return {
  returnPercent: results.avgReturn,
  sharpe: metrics.sharpeRatio,
  stability: results.stability,
  winRate: results.avgWinRate,
  profitFactor: results.avgProfitFactor,
  maxDrawdown: results.avgMaxDrawdown
};
```

## Ablation Analysis

Ablation measures indicator contribution by removing each one.

**Process**:
1. Run backtest with all indicators
2. Remove indicator A, re-run
3. Remove indicator B, re-run
4. ... for each indicator
5. Measure performance delta

**Example Results**:
```
All indicators: 15.2% return
Without RSI:    12.1% return  → RSI contributes 3.1%
Without MACD:   14.8% return  → MACD contributes 0.4%
Without ADX:    10.3% return  → ADX contributes 4.9%
```

## Results Format

### Top 20 JSON

```json
[
  {
    "config": {
      "positionSizePercent": 1.2,
      "leverage": 12,
      "initialSLROI": 0.45,
      "initialTPROI": 2.5,
      "breakEvenBuffer": 0.12,
      "trailingStepPercent": 0.18,
      "trailingMovePercent": 0.06,
      "signalProfile": "balanced"
    },
    "metrics": {
      "returnPercent": 18.5,
      "sharpe": 1.82,
      "stability": 0.74,
      "winRate": 58.2,
      "profitFactor": 2.15,
      "maxDrawdown": 8.3
    }
  },
  // ... 19 more configs
]
```

### CSV Leaderboard

```csv
rank,returnPercent,sharpe,stability,winRate,profitFactor,maxDrawdown,positionSize,leverage,slROI,tpROI,breakEvenBuffer,trailingStep,trailingMove,profile
1,18.50,1.82,0.74,58.20,2.15,8.30,1.20,12,0.45,2.50,0.12,0.18,0.06,balanced
2,17.80,1.95,0.81,61.50,2.32,6.20,0.80,10,0.40,2.00,0.10,0.15,0.05,conservative
...
```

## Loading Optimized Configs

### In Live Trading

```javascript
// Load top config
const configs = require('./research/configs/top20_latest.json');
const topConfig = configs[0];

// Apply to live trading
CONFIG.TRADING = {
  ...CONFIG.TRADING,
  POSITION_SIZE_PERCENT: topConfig.config.positionSizePercent,
  DEFAULT_LEVERAGE: topConfig.config.leverage,
  INITIAL_SL_ROI: topConfig.config.initialSLROI,
  INITIAL_TP_ROI: topConfig.config.initialTPROI,
  BREAK_EVEN_BUFFER: topConfig.config.breakEvenBuffer,
  TRAILING_STEP_PERCENT: topConfig.config.trailingStepPercent,
  TRAILING_MOVE_PERCENT: topConfig.config.trailingMovePercent
};

// Apply signal profile
const signalWeights = require('./signal-weights');
signalWeights.activeProfile = topConfig.config.signalProfile;
```

### Config Versioning

```javascript
// Save with version tag
const version = 'v1.0-20260105';
fs.writeFileSync(
  `./research/configs/optimized_${version}.json`,
  JSON.stringify(topConfig, null, 2)
);

// Load specific version
const config = require(`./research/configs/optimized_${version}.json`);
```

## Best Practices

### 1. Use Sufficient Data

```javascript
// ❌ BAD: Too little data
const candles = last7Days;

// ✅ GOOD: At least 30 days
const candles = last30Days;
```

### 2. Validate on Different Market Regimes

```javascript
// Test on:
// - Trending markets
// - Ranging markets
// - High volatility periods
// - Low volatility periods
```

### 3. Check Fold Consistency

```javascript
if (results.validFolds < results.nFolds * 0.8) {
  console.warn('Many folds failed minimum trades');
}

if (results.worstFold.returnPercent < -10) {
  console.warn('Worst fold has large loss');
}
```

### 4. Consider Risk-Adjusted Metrics

```javascript
// Don't just maximize return
// Also consider Sharpe ratio and stability
objectives: ['return', 'sharpe', 'stability']
```

### 5. Run Multiple Seeds

```javascript
const seeds = [42, 123, 456, 789, 1011];
const results = [];

for (const seed of seeds) {
  const optimizer = new Optimizer({ seed });
  const result = await optimizer.run(candles, indicators);
  results.push(result);
}

// Find configs that appear in multiple runs
const consistentConfigs = findCommonConfigs(results);
```

## Advanced Usage

### Custom Objectives

```javascript
class CustomOptimizer extends Optimizer {
  evaluateConfig(config, candles, indicators) {
    const results = await super.evaluateConfig(config, candles, indicators);
    
    // Add custom objective
    results.metrics.calmarRatio = 
      results.metrics.returnPercent / results.metrics.maxDrawdown;
    
    return results;
  }
  
  calculateParetoFront(results) {
    // Use custom objectives in Pareto calculation
    // ...
  }
}
```

### Parallel Optimization

```javascript
const { Worker } = require('worker_threads');

// Split symbols across workers
const symbols = ['XBTUSDTM', 'ETHUSDTM', 'SOLUSDTM'];
const workers = symbols.map(symbol => {
  return new Worker('./optimize-worker.js', {
    workerData: { symbol }
  });
});

// Aggregate results
const allResults = await Promise.all(workers);
```

## Troubleshooting

### "Optimization takes too long"

Reduce population size or use fewer folds:

```javascript
populationSize: 50,  // Instead of 100
nFolds: 3            // Instead of 5
```

### "All configs have similar performance"

Widen search ranges or add more objectives:

```javascript
positionSizePercent: { min: 0.1, max: 5.0 },  // Wider range
objectives: ['return', 'sharpe', 'stability', 'maxDrawdown']
```

### "Unstable results across runs"

Increase minimum trades per fold:

```javascript
minTradesPerFold: 30  // More stringent
```

---

**Version**: 1.0.0
**Last Updated**: January 2026
**Status**: Production Ready
