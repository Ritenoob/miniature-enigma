# Weight Adjustment Guide

## Overview

MIRKO V3.5 uses a weighted scoring system to generate trading signals. Each technical indicator contributes a score based on its current value, and these scores are summed to produce a final signal.

This guide explains how to tune indicator weights to optimize performance for different market conditions.

## Weight Configuration

Weights are configured in `core/signal-weights.js`. Each indicator has:

- `max`: Maximum points the indicator can contribute
- Additional parameters specific to the indicator (e.g., oversold/overbought thresholds)

### Total Points

The sum of all `max` values should be approximately **100-150 points**. This provides good signal resolution while avoiding over-sensitivity.

## Available Indicators

### RSI (Relative Strength Index)
- **Purpose**: Identifies overbought/oversold conditions
- **Default max**: 25 points
- **Best for**: Mean reversion strategies
- **Parameters**:
  - `oversold`: Below this = bullish (default: 30)
  - `overbought`: Above this = bearish (default: 70)

### Williams %R
- **Purpose**: Momentum oscillator
- **Default max**: 20 points
- **Best for**: Short-term momentum
- **Parameters**:
  - `oversold`: Below this = bullish (default: -80)
  - `overbought`: Above this = bearish (default: -20)

### MACD
- **Purpose**: Trend following
- **Default max**: 20 points
- **Best for**: Identifying trend changes
- **Note**: Crossovers are particularly important

### Awesome Oscillator (AO)
- **Purpose**: Momentum indicator
- **Default max**: 15 points
- **Best for**: Confirming trend direction

### EMA Trend
- **Purpose**: Long-term trend direction
- **Default max**: 20 points
- **Best for**: Trend following strategies
- **Note**: Price position relative to EMA fast/slow

### Stochastic
- **Purpose**: Momentum with crossovers
- **Default max**: 10 points
- **Best for**: Overbought/oversold conditions

### Bollinger Bands
- **Purpose**: Volatility and mean reversion
- **Default max**: 10 points
- **Best for**: Range-bound markets

### KDJ (K%D%J Stochastic)
- **Purpose**: Enhanced stochastic with J line
- **Default max**: 15 points
- **Best for**: Early momentum signals
- **Parameters**:
  - `kPeriod`: K line period (default: 9)
  - `dPeriod`: D line smoothing (default: 3)
  - `jOversold`: J line oversold threshold (default: 20)
  - `jOverbought`: J line overbought threshold (default: 80)

### OBV (On-Balance Volume)
- **Purpose**: Volume-based momentum
- **Default max**: 10 points
- **Best for**: Confirming price moves with volume
- **Parameters**:
  - `slopeWindow`: Window for slope calculation (default: 14)
  - `smoothingEma`: EMA smoothing period (default: 5)
  - `zScoreCap`: Z-score normalization cap (default: 2.0)

### DOM (Depth of Market)
- **Purpose**: Order book imbalance detection
- **Default max**: 15 points
- **IMPORTANT**: Requires live WebSocket data feed
- **Flag**: `liveOnlyValidation: true`
- **Parameters**:
  - `enabled`: Must be `true` when live data available (default: false)
  - `depthLevels`: Depth levels to analyze (default: [5, 10, 25])
  - `imbalanceThreshold`: Threshold for significant imbalance (default: 0.3)

## Strategy Profiles

MIRKO V3.5 includes five pre-configured profiles:

### 1. Conservative
- **Focus**: Trend indicators (MACD, EMA)
- **Total Points**: ~100
- **Risk**: Low
- **Best for**: Stable, trending markets
- **Max Leverage**: 5x

### 2. Aggressive
- **Focus**: Momentum indicators (RSI, Williams %R, KDJ)
- **Total Points**: ~140
- **Risk**: High
- **Best for**: Volatile markets with strong moves
- **Max Leverage**: 20x

### 3. Balanced
- **Focus**: Equal distribution
- **Total Points**: ~125
- **Risk**: Medium
- **Best for**: General purpose trading
- **Max Leverage**: 10x

### 4. Scalping
- **Focus**: Quick signals (Williams %R, KDJ, DOM)
- **Total Points**: ~120
- **Risk**: Medium-High
- **Best for**: 1-5 minute timeframes
- **Max Leverage**: 15x
- **Note**: Tighter oversold/overbought thresholds

### 5. Swing Trading
- **Focus**: Longer timeframes (MACD, EMA, OBV)
- **Total Points**: ~110
- **Risk**: Low-Medium
- **Best for**: 1-4 hour timeframes
- **Max Leverage**: 5x
- **Note**: Wider oversold/overbought thresholds

## Using the CLI Tool

The `adjust-weights.js` CLI tool helps tune weights interactively:

```bash
# Start interactive mode
node core/adjust-weights.js

# Export a specific profile
node core/adjust-weights.js --profile=aggressive --export=my-config.json
```

### Commands
- `adjust <indicator>`: Adjust weight for an indicator
- `show`: Display current weights
- `export <file>`: Export to JSON file
- `quit`: Exit

## Tuning Process

### Step 1: Analyze Market Conditions
- **Trending**: Increase MACD, EMA weights
- **Range-bound**: Increase RSI, Bollinger weights
- **Volatile**: Increase momentum indicators (Williams %R, KDJ)
- **High volume**: Increase OBV weight

### Step 2: Backtest
```bash
# Fetch historical data
npm run fetch-data -- --pair=XBTUSDTM --timeframe=5m --days=30

# Run backtest
npm run backtest -- --config=strategy/signalProfiles/balanced.js --data=research/data/XBTUSDTM_5m.jsonl
```

### Step 3: Measure Performance
Key metrics:
- **Win Rate**: Target 50-60%
- **Profit Factor**: Target 1.5-2.5
- **Max Drawdown**: Keep below 20%
- **Sharpe Ratio**: Target > 1.0

### Step 4: Iterate
- Increase weights for indicators with positive impact
- Decrease weights for indicators with negative impact
- Use ablation testing to identify low-value indicators

## Advanced: Ablation Testing

Ablation testing removes indicators one at a time to measure their impact:

```javascript
const AblationTester = require('./research/optimize/ablation');

const tester = new AblationTester();
const results = await tester.runTests(evaluator, baseConfig);
const ranking = tester.getImportanceRanking();
```

## Signal Thresholds

Thresholds determine when a score translates to a signal:

```javascript
thresholds: {
  strongBuy: 70,    // Score >= 70 = STRONG_BUY
  buy: 50,          // Score >= 50 = BUY
  buyWeak: 30,      // Score >= 30 = BUY (weak)
  strongSell: -70,  // Score <= -70 = STRONG_SELL
  sell: -50,        // Score <= -50 = SELL
  sellWeak: -30     // Score <= -30 = SELL (weak)
}
```

### Tuning Thresholds
- **Higher thresholds**: Fewer but stronger signals
- **Lower thresholds**: More signals but lower quality
- **Recommended range**: 60-80 for strong signals, 40-60 for normal signals

## DOM Integration Notes

DOM (Depth of Market) provides powerful signals but requires:

1. **Live WebSocket connection** to exchange
2. **Order book subscription** for target pairs
3. **Real-time processing** of level 2 data

### Enabling DOM
```javascript
dom: {
  max: 15,
  enabled: true,  // Set to true ONLY when live data available
  liveOnlyValidation: true,  // Must remain true
  depthLevels: [5, 10, 25],
  imbalanceThreshold: 0.3
}
```

### DOM Signals
- **Positive imbalance**: More bids = bullish
- **Negative imbalance**: More asks = bearish
- **Large walls**: Potential support/resistance

## Best Practices

1. **Start conservative**: Use balanced profile as baseline
2. **Test thoroughly**: Backtest on at least 30 days of data
3. **Monitor live**: Track live performance for 1 week before full deployment
4. **Adjust gradually**: Change weights by 5-10 points at a time
5. **Document changes**: Keep notes on what works and what doesn't
6. **Consider correlations**: Some indicators provide redundant information
7. **Market-specific**: Different weights work for different pairs

## Example Workflow

```bash
# 1. Start with balanced profile
npm start

# 2. Monitor signals
tail -f logs/screener-signals.jsonl

# 3. Adjust weights based on observation
node core/adjust-weights.js

# 4. Export custom configuration
# (in adjust-weights CLI)
> export my-custom.json

# 5. Test with optimizer
npm run optimizer

# 6. Deploy best performing configuration
```

## Troubleshooting

### Too many false signals
- Increase thresholds
- Reduce weights on noisy indicators
- Add trend filter (increase EMA weight)

### Missing good opportunities
- Decrease thresholds
- Increase weights on leading indicators (RSI, Williams %R)
- Consider adding KDJ for earlier signals

### Signals always bullish/bearish
- Check indicator implementations
- Verify data quality
- Review threshold balance

## Resources

- Main documentation: `README.md`
- Research module: `research/README.md`
- Strategy profiles: `strategy/signalProfiles/`
- Live optimization: `strategy/optimizer/`

## Support

For questions or issues:
1. Review this guide
2. Check existing strategy profiles
3. Run ablation tests to identify issues
4. Consult research module documentation
