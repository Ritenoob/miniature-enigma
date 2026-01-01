# Live Optimizer System Guide

## Overview

The Live Optimizer System is a sophisticated strategy testing and optimization framework built for the KuCoin Perpetual Futures Dashboard. It enables parallel testing of multiple strategy variants using live market data, with comprehensive safety mechanisms and statistical validation.

## Architecture

### Core Components

1. **OptimizerConfig** (`src/optimizer/OptimizerConfig.js`)
   - Central configuration management
   - Parameter constraints and bounds
   - Environment-specific settings
   - Strategy variant generation

2. **LiveOptimizerController** (`src/optimizer/LiveOptimizerController.js`)
   - Main orchestration controller
   - Manages parallel strategy testing
   - Handles live market data processing
   - Enforces safety limits

3. **ScoringEngine** (`src/optimizer/ScoringEngine.js`)
   - Calculates composite performance scores
   - Statistical significance testing
   - Confidence threshold gating
   - Strategy ranking

4. **TelemetryFeed** (`src/optimizer/TelemetryFeed.js`)
   - Real-time metrics streaming
   - In-memory pub/sub system
   - WebSocket integration for dashboards
   - Historical data tracking

### Data Flow

```
Market Data → LiveOptimizerController → Strategy Variants
                      ↓
              Trade Execution (Paper)
                      ↓
              Metrics Collection
                      ↓
              ScoringEngine → Confidence Scores
                      ↓
              TelemetryFeed → Dashboard
```

## Getting Started

### Enable the Optimizer

The optimizer is **disabled by default**. To enable it:

1. Set environment variable:
   ```bash
   OPTIMIZER_ENABLED=true
   ```

2. Or modify `server.js`:
   ```javascript
   CONFIG.OPTIMIZER.ENABLED = true
   ```

### Start the Optimizer

Using API endpoints:

```bash
# Check status
curl http://localhost:3001/api/optimizer/status

# Start optimizer with 5 variants
curl -X POST http://localhost:3001/api/optimizer/start \
  -H "Content-Type: application/json" \
  -d '{"maxVariants": 5}'

# Get results
curl http://localhost:3001/api/optimizer/results

# Stop optimizer
curl -X POST http://localhost:3001/api/optimizer/stop
```

### Configuration

Edit `src/optimizer/OptimizerConfig.js` to customize:

#### Experiment Settings

```javascript
experiments: {
  maxConcurrent: 10,              // Max parallel variants
  minSampleSize: 50,              // Min trades for significance
  testDurationMinutes: 1440,      // Test duration (24 hours)
  cooldownMinutes: 30             // Wait between batches
}
```

#### Parameter Ranges

```javascript
parameters: {
  weights: {
    rsi: { min: 0, max: 40, step: 5 },
    macd: { min: 0, max: 35, step: 5 },
    // ... other indicators
  },
  risk: {
    stopLossROI: { min: 0.3, max: 2.0, step: 0.1 },
    takeProfitROI: { min: 1.0, max: 5.0, step: 0.5 }
  }
}
```

#### Safety Limits

```javascript
safety: {
  maxLossPerVariant: 5.0,         // 5% max loss per variant
  maxDrawdownPercent: 10.0,       // 10% max drawdown
  enableStopLoss: true,           // Always use stop-loss
  paperTrading: true              // Paper trading by default
}
```

## How Strategy Variants Work

### Variant Generation

The system generates strategy variants by combining:

1. **Indicator Weight Profiles**
   - Default, Conservative, Aggressive, Balanced

2. **Timeframes**
   - 1min, 5min, 15min, 30min, 1hour

3. **Parameter Variations**
   - RSI thresholds
   - Stop-loss/take-profit levels
   - Leverage settings

Example variant:
```javascript
{
  id: 'variant_1',
  profile: 'aggressive',
  timeframe: '5min',
  rsiOversold: 30,
  rsiOverbought: 70,
  stopLossROI: 0.5,
  takeProfitROI: 2.0,
  leverage: 10,
  experimental: true
}
```

### Testing Process

1. **Initialization**
   - Generate N strategy variants
   - Initialize isolated state for each
   - Subscribe to market data feed

2. **Live Execution**
   - Process market data ticks
   - Generate signals per variant
   - Execute paper trades
   - Track P&L and metrics

3. **Continuous Monitoring**
   - Update metrics every 5 seconds
   - Check safety limits
   - Stop underperforming variants
   - Stream to telemetry feed

4. **Results Analysis**
   - Calculate composite scores
   - Rank variants by performance
   - Test statistical significance
   - Assess promotion readiness

## Interpreting Results

### Key Metrics

1. **ROI (Return on Investment)**
   - Total percentage return over test period
   - Target: > 5%

2. **Win Rate**
   - Percentage of profitable trades
   - Target: > 55%

3. **Sharpe Ratio**
   - Risk-adjusted return measure
   - Target: > 1.0

4. **Max Drawdown**
   - Largest peak-to-trough decline
   - Target: < 15%

5. **Average P&L per Trade**
   - Average profit/loss per trade
   - Target: > $0.50

### Composite Score

The scoring engine calculates a weighted composite score:

```
Score = (ROI × 30%) + (WinRate × 25%) + (Sharpe × 20%) +
        (Consistency × 15%) + (AvgPnL × 10%)
```

Adjusted by drawdown penalty:
```
FinalScore = Score × (1 - min(drawdown, 20%) / 40)
```

### Confidence Score

Confidence measures readiness for promotion:

```
Confidence = (SampleSize × 30%) + (ROI × 25%) + 
             (WinRate × 20%) + (Sharpe × 15%) + 
             (Drawdown × 10%)
```

Requirements for promotion:
- Overall confidence: ≥ 80%
- Minimum trades: ≥ 50
- Win rate: ≥ 55%
- Sharpe ratio: ≥ 1.0
- ROI: ≥ 5%
- Max drawdown: ≤ 15%

## Promoting a Strategy

### Check Readiness

```bash
curl http://localhost:3001/api/optimizer/results
```

Look for variants with `readyForPromotion: true` in the confidence breakdown.

### Promote Strategy

```bash
curl -X POST http://localhost:3001/api/optimizer/promote \
  -H "Content-Type: application/json" \
  -d '{"variantId": "variant_3"}'
```

Response:
```json
{
  "success": true,
  "message": "Strategy variant promoted to production",
  "variantId": "variant_3",
  "metrics": { ... },
  "confidence": 0.85
}
```

### Manual Application

After promotion:

1. Review the variant configuration
2. Update `signal-weights.js` with the winning parameters
3. Adjust CONFIG in `server.js` for risk settings
4. Monitor production performance
5. Gradually increase position sizes

## Safety Mechanisms

### Rate Limiting

- Reuses main WebSocket feed (no new connections)
- API calls throttled to 30 per minute
- 2-second delay between calls

### Automatic Stops

Variants are automatically stopped if:
- Loss exceeds 5% (configurable)
- Drawdown exceeds 10% (configurable)
- Safety limits are breached

### Isolation

- Each variant has isolated state
- Paper trading prevents real losses
- No interference with production trades

### Graceful Degradation

- Missed ticks are handled gracefully
- Failed API calls don't crash system
- State is persisted periodically

## API Endpoints

### GET `/api/optimizer/status`

Returns current optimizer status.

**Response:**
```json
{
  "enabled": true,
  "running": true,
  "activeVariants": 5,
  "stoppedVariants": 2,
  "totalTrades": 234,
  "summary": { ... }
}
```

### GET `/api/optimizer/results`

Returns detailed results for all variants.

**Response:**
```json
{
  "variants": [
    {
      "id": "variant_1",
      "config": { ... },
      "metrics": { ... },
      "score": 75.4,
      "confidence": 0.82
    }
  ],
  "topPerformers": [ ... ],
  "summary": { ... }
}
```

### POST `/api/optimizer/start`

Start the optimizer.

**Request:**
```json
{
  "maxVariants": 10
}
```

**Response:**
```json
{
  "success": true,
  "variantCount": 10,
  "variants": [ ... ]
}
```

### POST `/api/optimizer/stop`

Stop the optimizer.

**Response:**
```json
{
  "success": true,
  "finalResults": { ... }
}
```

### POST `/api/optimizer/promote`

Promote a strategy variant to production.

**Request:**
```json
{
  "variantId": "variant_3"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Strategy variant promoted to production",
  "variantId": "variant_3",
  "confidence": 0.85
}
```

## Troubleshooting

### Optimizer Won't Start

**Issue:** "Optimizer is disabled"

**Solution:** Set `OPTIMIZER_ENABLED=true` in environment or config.

---

**Issue:** "Optimizer is already running"

**Solution:** Stop the optimizer first with `/api/optimizer/stop`.

---

### No Results After Running

**Issue:** All variants show 0 trades

**Solution:**
- Verify market data feed is active
- Check that signals are being generated
- Ensure timeframe has market activity
- Review logs for errors

---

### Variants Stopping Immediately

**Issue:** All variants stop within minutes

**Solution:**
- Adjust `maxLossPerVariant` to be less restrictive
- Check if paper trading is enabled
- Verify stop-loss calculations are correct
- Review safety limits in config

---

### Low Confidence Scores

**Issue:** No variants reach promotion threshold

**Solution:**
- Increase test duration (more trades needed)
- Adjust parameter ranges to explore better strategies
- Lower confidence threshold (not recommended)
- Verify signal generation is working correctly

---

### Memory Issues

**Issue:** High memory usage

**Solution:**
- Reduce `maxConcurrent` variants
- Decrease `maxHistorySize` in TelemetryFeed
- Clear old experiment data periodically
- Limit telemetry retention

## Best Practices

### Development Phase

1. Start with paper trading enabled
2. Use small variant counts (3-5)
3. Test for short durations (1-2 hours)
4. Review results frequently
5. Iterate on parameter ranges

### Production Phase

1. Test strategies for 24+ hours
2. Require high confidence scores (>80%)
3. Validate statistical significance
4. Start with small position sizes
5. Monitor performance continuously

### Parameter Tuning

1. Test one dimension at a time
2. Use reasonable step sizes
3. Don't over-optimize (risk overfitting)
4. Validate on different market conditions
5. Consider walk-forward optimization

### Risk Management

1. Never disable safety limits
2. Set conservative loss thresholds
3. Monitor global drawdown
4. Use stop-losses on all trades
5. Start with paper trading

## Advanced Usage

### Custom Variant Generation

Modify `OptimizerConfig.generateVariants()` to create custom strategy combinations:

```javascript
generateVariants(maxVariants) {
  const variants = [];
  // Your custom logic here
  return variants;
}
```

### Event Listeners

Listen to optimizer events:

```javascript
optimizerController.on('variant:promoted', (data) => {
  console.log('Variant promoted:', data.variantId);
  // Send notification, log to database, etc.
});

optimizerController.on('trade:closed', (data) => {
  console.log('Trade closed:', data.position);
  // Custom analytics, alerting, etc.
});
```

### WebSocket Integration

Subscribe to telemetry feed:

```javascript
const ws = new WebSocket('ws://localhost:3001');
ws.on('message', (data) => {
  const message = JSON.parse(data);
  if (message.type === 'metrics:update') {
    // Handle real-time metrics
  }
});
```

## Limitations

1. **Historical Data**: Optimizer uses live data only, no backtesting
2. **Market Conditions**: Results depend on market conditions during test
3. **Sample Size**: Requires sufficient trades for statistical validity
4. **Computational**: Limited by available CPU/memory resources
5. **Network**: Dependent on stable market data feed

## Future Enhancements

Potential improvements:
- Walk-forward optimization
- Multi-symbol testing
- ML-based parameter search
- Genetic algorithm optimization
- Cloud-based distributed testing
- Historical backtest integration
- Risk-adjusted position sizing per variant

## Support

For issues or questions:
1. Check server logs for errors
2. Review this documentation
3. Test with paper trading first
4. Verify configuration settings
5. Open an issue on GitHub

## License

Part of the KuCoin Perpetual Futures Dashboard v3.5.2
MIT License
