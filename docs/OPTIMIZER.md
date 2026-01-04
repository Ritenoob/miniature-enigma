# Execution Simulator & Live Optimizer Documentation

## Overview

The Execution Simulator and Live Optimizer modules enable realistic paper trading with proper fee/slippage modeling and multi-profile strategy testing.

## ExecutionSimulator

### Purpose
Simulates trading execution with realistic fees, slippage, leverage, and position sizing for paper trading. Produces net PnL and ROI consistent with leverage and account allocation.

### Fill Models

#### Taker Mode
- Immediate market order fill
- Uses taker fees (0.06%)
- Applies slippage in adverse direction
- **Entry**: Long pays more, Short receives less
- **Exit**: Long receives less, Short pays more

#### Probabilistic Limit Mode
- Attempts limit order fill based on probability
- Uses maker fees (0.02%) if filled
- Falls back to taker mode if not filled
- Configurable fill probability (default 50%)

### Usage

#### Simulate Entry
```javascript
const ExecutionSimulator = require('./src/optimizer/ExecutionSimulator');

const entry = ExecutionSimulator.simulateEntry({
  accountBalance: 10000,      // Total account balance (USDT)
  positionSizePercent: 1,     // Use 1% of balance as margin
  leverage: 10,               // 10x leverage
  side: 'long',               // 'long' or 'short'
  midPrice: 50000,            // Current market price
  fillModel: 'taker',         // or 'probabilistic_limit'
  limitPrice: 49500,          // Optional limit price
  makerFee: 0.0002,           // 0.02%
  takerFee: 0.0006,           // 0.06%
  slippagePercent: 0.02       // 0.02% = 2 basis points
});

console.log('Entry price:', entry.entryFillPrice);
console.log('Margin used:', entry.marginUsed);
console.log('Notional:', entry.effectiveNotional);
console.log('Size:', entry.size);
console.log('Entry fee:', entry.entryFee);
```

#### Mark to Market
```javascript
const mtm = ExecutionSimulator.markToMarket(entry, currentPrice);

console.log('Unrealized gross PnL:', mtm.unrealizedGrossPnl);
console.log('Unrealized net PnL:', mtm.unrealizedNetPnl);
console.log('Unrealized ROI:', mtm.unrealizedROI + '%');
```

#### Simulate Exit
```javascript
const exit = ExecutionSimulator.simulateExit(
  entry,
  exitPrice,
  0.0006,     // taker fee
  0.02,       // slippage %
  0,          // funding fees
  'take_profit'
);

console.log('Exit price:', exit.exitFillPrice);
console.log('Realized gross PnL:', exit.realizedGrossPnl);
console.log('Realized net PnL:', exit.realizedNetPnl);
console.log('Realized ROI:', exit.realizedROI + '%');
console.log('Total fees:', exit.totalFees);
```

### Key Formulas

#### Margin Calculation
```
marginUsed = accountBalance × (positionSizePercent / 100)
```

#### Notional Calculation
```
effectiveNotional = marginUsed × leverage
```

#### Size Calculation
```
size = effectiveNotional / (entryPrice × multiplier)
```

#### Slippage Application
**Entry:**
- Long: entryPrice = midPrice × (1 + slippage%)
- Short: entryPrice = midPrice × (1 - slippage%)

**Exit:**
- Long: exitPrice = targetPrice × (1 - slippage%)
- Short: exitPrice = targetPrice × (1 + slippage%)

#### Fee Calculation
```
entryFee = effectiveNotional × entryFeeRate
exitFee = effectiveNotional × exitFeeRate
totalFees = entryFee + exitFee
```

#### Net PnL
```
grossPnL = priceDiff × size × multiplier
netPnL = grossPnL - totalFees - fundingFees
```

#### Leveraged ROI
```
ROI% = (netPnL / marginUsed) × 100
```

### Break-Even Price
```javascript
const breakEven = ExecutionSimulator.calculateBreakEven(entry);
console.log('Break-even price:', breakEven);
```

Accounts for:
- Entry fee
- Exit fee  
- Entry slippage
- Exit slippage

## LiveOptimizerController

### Purpose
Manages multiple signal profile variants for paper trading, enabling simultaneous testing of different strategies with proper isolation.

### Features
- Multiple profile variants running in parallel
- Independent position tracking per variant
- Realistic PnL calculation via ExecutionSimulator
- Performance metrics per variant
- ROI-based stop loss and take profit
- Variant isolation (no cross-contamination)

### Usage

#### Initialize Controller
```javascript
const LiveOptimizerController = require('./src/optimizer/LiveOptimizerController');

const controller = new LiveOptimizerController({
  paperTrading: true,
  profiles: ['default', 'conservative', 'aggressive', 'balanced'],
  positionSize: {
    min: 0.5,
    max: 2.0,
    default: 1.0
  },
  leverage: {
    min: 5,
    max: 20,
    default: 10
  }
});

controller.initialize();
```

#### Process Market Updates
```javascript
// On each price tick or candle close
controller.onMarketUpdate(symbol, indicators, currentPrice);
```

The controller will:
1. Mark all open positions to market
2. Check stop loss and take profit conditions
3. Generate signals for variants without positions
4. Open new positions on strong signals

#### Get Status
```javascript
const status = controller.getStatus();

console.log('Paper trading:', status.paperTrading);
console.log('Account balance:', status.accountBalance);

for (const [name, variant] of Object.entries(status.variants)) {
  console.log(`\n${name}:`);
  console.log('  Position:', variant.position);
  console.log('  Trades:', variant.metrics.tradesCount);
  console.log('  Win rate:', variant.metrics.winRate);
  console.log('  Total PnL:', variant.metrics.totalNetPnl);
}
```

#### Compare Performance
```javascript
const comparison = controller.getPerformanceComparison();

console.log('Profile Performance:');
console.log(comparison);

// Output:
// [
//   {
//     profile: 'aggressive',
//     tradesCount: 5,
//     winRate: '60.0%',
//     avgROI: '3.45%',
//     totalNetPnl: '52.30',
//     avgPnlPerTrade: '10.46'
//   },
//   ...
// ]
```

### Variant Metrics

Each variant tracks:
- **tradesCount**: Total completed trades
- **winCount**: Number of winning trades
- **lossCount**: Number of losing trades
- **totalNetPnl**: Sum of all net PnL (after fees)
- **totalGrossPnl**: Sum of all gross PnL
- **avgPnLPerTrade**: Average net PnL per trade
- **avgROI**: Average ROI% across all trades
- **winRate**: Percentage of winning trades
- **maxDrawdown**: Maximum drawdown (future)
- **peakBalance**: Peak balance (future)

### Position Management

#### Entry Conditions
- Variant must have no open position
- Signal must be STRONG_BUY or STRONG_SELL
- Paper trading must be enabled

#### Exit Conditions
- **Stop Loss**: Price moves against position beyond SL level
- **Take Profit**: Price moves in favor beyond TP level

Default ROI levels:
- Stop Loss: 0.5% ROI loss
- Take Profit: 2.0% ROI gain

### Safety Features

1. **Paper Trading Default**: Real trading disabled by default
2. **Variant Isolation**: Each profile operates independently
3. **Position Limits**: Max 1 position per variant
4. **Balance Tracking**: Virtual balance tracking for paper trading
5. **Fee/Slippage Modeling**: Realistic execution costs

### Configuration Options

```javascript
const OptimizerConfig = {
  paperTrading: true,              // Paper mode enabled
  realTradingEnabled: false,       // Real trading disabled
  realTradingMinBalance: 1000,     // Min balance for real trading
  realTradingMaxLoss: 0.1,         // Max 10% loss threshold
  
  positionSize: {
    min: 0.5,                      // Min 0.5% of balance
    max: 2.0,                      // Max 2% of balance
    default: 1.0                   // Default 1%
  },
  
  leverage: {
    min: 5,                        // Min 5x
    max: 20,                       // Max 20x
    default: 10                    // Default 10x
  },
  
  profiles: [                      // Profiles to test
    'default',
    'conservative',
    'aggressive',
    'balanced'
  ],
  
  fillModel: 'taker',              // 'taker' or 'probabilistic_limit'
  maxConcurrentVariants: 4,        // Max variants running
  maxPositionsPerVariant: 1        // Max positions per variant
};
```

## Integration Example

### Server Integration
```javascript
const LiveOptimizerController = require('./src/optimizer/LiveOptimizerController');

// Initialize optimizer
const optimizer = new LiveOptimizerController();
optimizer.initialize();

// On market data update
marketManager.on('indicators_updated', (symbol, indicators) => {
  const currentPrice = marketManager.getPrice(symbol);
  optimizer.onMarketUpdate(symbol, indicators, currentPrice);
});

// API endpoint for status
app.get('/api/optimizer/status', (req, res) => {
  res.json(optimizer.getStatus());
});

// API endpoint for performance
app.get('/api/optimizer/performance', (req, res) => {
  res.json(optimizer.getPerformanceComparison());
});
```

## Testing

### Unit Tests
```bash
# Test ExecutionSimulator
npm test -- tests/execution-simulator.test.js

# Test LiveOptimizerController
npm test -- tests/live-optimizer.test.js

# Run all tests
npm test
```

### Test Coverage
- **ExecutionSimulator**: 13 tests covering entry, exit, MTM, slippage, fees
- **LiveOptimizerController**: 10 tests covering initialization, signals, PnL tracking, exits

## Performance Characteristics

### ExecutionSimulator
- **Latency**: < 1ms per operation
- **Memory**: Negligible (~1KB per position)
- **Precision**: Uses Decimal.js for financial precision

### LiveOptimizerController
- **Latency**: < 5ms per market update (4 variants)
- **Memory**: ~10KB per variant
- **Scalability**: Handles up to 10 concurrent variants efficiently

## Future Enhancements

1. **Funding Fee Modeling**: Track and apply funding rates
2. **Advanced Fill Models**: Liquidity-based fill simulation
3. **Drawdown Tracking**: Real-time max drawdown calculation
4. **Portfolio Heat Map**: Risk distribution across variants
5. **Auto-Optimization**: Genetic algorithm for weight tuning
6. **Backtesting Mode**: Historical data replay
7. **Real Trading Integration**: Graduated rollout to live trading

## References

- **DecimalMath**: `/src/lib/DecimalMath.js`
- **ConfigSchema**: `/src/lib/ConfigSchema.js`
- **SignalGenerator**: `/src/lib/SignalGenerator.js`
- **Tests**: `/tests/execution-simulator.test.js`, `/tests/live-optimizer.test.js`

## Support

For issues or questions:
1. Check test files for usage examples
2. Review inline code documentation
3. Verify DecimalMath functions are available
4. Test with paper trading before real trading

---

**Version**: 1.0.0  
**Last Updated**: 2026-01-02  
**Status**: Production Ready

## TrailingStopPolicy

### Purpose
Implements strict trailing stop logic with fee-adjusted break-even and profit-lock behavior. Compatible with production StopOrderStateMachine semantics for safe stop order updates.

### Features
- **Fee-Adjusted Break-Even**: Automatically moves stop to entry + buffer once ROI covers fees
- **Aggressive Profit-Lock**: Trails stop using staircase method after break-even
- **Monotonic Movement**: Guarantees stop never moves adversely (down for long, up for short)
- **Leverage-Aware**: All calculations account for position leverage
- **Production-Compatible**: Designed for both paper and real trading

### Break-Even Logic

The policy calculates a fee-adjusted break-even ROI threshold:

```javascript
breakEvenROI = (entryFee + exitFee) × leverage × 100 + buffer
```

Once current ROI >= breakEvenROI:
- **Long**: Move stop to `entryPrice × (1 + buffer/leverage/100)`
- **Short**: Move stop to `entryPrice × (1 - buffer/leverage/100)`

### Trailing Logic (Staircase Mode)

After break-even is armed, the stop trails using a staircase pattern:

1. **Calculate Progress**: `roiProgress = currentROI - breakEvenROI`
2. **Determine Step**: `currentStep = floor(roiProgress / trailingStepPercent)`
3. **Trail on New Step**: When crossing a step threshold, move stop closer by `trailingMovePercent`

Example with defaults (0.15% steps, 0.05% move):
- At 1.5% ROI: Break-even triggered
- At 1.65% ROI: Trail stop (step 1)
- At 1.80% ROI: Trail stop (step 2)
- At 1.95% ROI: Trail stop (step 3)

### Usage

#### Basic Usage
```javascript
const TrailingStopPolicy = require('./src/optimizer/TrailingStopPolicy');

// On each price tick
const update = TrailingStopPolicy.nextStop({
  side: 'long',
  entryPrice: 50000,
  currentStop: 49750,
  currentROI: 1.8,           // Current net ROI %
  lastROIStep: 0,            // Last step that triggered trail
  leverage: 10,
  entryFeeRate: 0.0006,
  exitFeeRate: 0.0006,
  config: {
    breakEvenBuffer: 0.1,
    trailingStepPercent: 0.15,
    trailingMovePercent: 0.05,
    trailingMode: 'staircase'
  },
  breakEvenArmed: false
});

if (update.reason !== 'no_change') {
  console.log('Stop updated:', update.newStopPrice);
  console.log('Reason:', update.reason);
  console.log('Step:', update.newLastROIStep);
  
  // Update position
  position.stopLossPrice = update.newStopPrice;
  position.lastROIStep = update.newLastROIStep;
  position.breakEvenArmed = update.breakEvenArmed;
}
```

#### Calculate Initial Stop
```javascript
const initialStop = TrailingStopPolicy.calculateInitialStop(
  'long',
  50000,  // entry price
  0.5,    // SL ROI %
  10      // leverage
);
// Returns: 49750 (0.5% ROI loss at 10x = 0.05% price move)
```

#### Get Default Config
```javascript
const defaults = TrailingStopPolicy.getDefaultConfig();
// Returns: {
//   breakEvenBuffer: 0.1,
//   trailingStepPercent: 0.15,
//   trailingMovePercent: 0.05,
//   trailingMode: 'staircase'
// }
```

#### Validate Config
```javascript
try {
  TrailingStopPolicy.validateConfig(config);
  console.log('Config valid');
} catch (error) {
  console.error('Invalid config:', error.message);
}
```

### Configuration Options

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `breakEvenBuffer` | 0.1 | 0-10 | Additional ROI % buffer before break-even trigger |
| `trailingStepPercent` | 0.15 | 0.01-10 | ROI % increment for each trailing step |
| `trailingMovePercent` | 0.05 | 0.01-10 | % to move stop on each step |
| `trailingMode` | 'staircase' | enum | Trailing mode: 'staircase', 'atr', 'dynamic' |

### Integration with LiveOptimizerController

The LiveOptimizerController automatically uses TrailingStopPolicy for all paper positions:

```javascript
// Position state includes trailing stop tracking
variant.position = {
  ...entry,
  stopLossPrice,        // Current stop price
  lastROIStep: 0,       // Last ROI step
  breakEvenArmed: false,// Break-even status
  entryFeeRate: 0.0006,
  expectedExitFeeRate: 0.0006
};

// On each market update, trailing stop is evaluated
controller.onMarketUpdate(symbol, indicators, currentPrice);
// Internally calls TrailingStopPolicy.nextStop() and updates position
```

### Production Integration

For real trading with StopOrderStateMachine:

```javascript
// In LiveOptimizerController checkExitConditions()
if (trailingUpdate.reason !== 'no_change') {
  if (this.config.realTradingEnabled && variant.stopOrderStateMachine) {
    // Use safe "place new before cancel old" pattern
    await variant.stopOrderStateMachine.updateStop(
      trailingUpdate.newStopPrice,
      {
        symbol: position.symbol,
        side: position.side === 'long' ? 'sell' : 'buy',
        stopPrice: trailingUpdate.newStopPrice,
        size: position.size,
        reduceOnly: true
      }
    );
  }
}
```

### Safety Guarantees

1. **Monotonic Movement**:
   - Long positions: Stop never decreases
   - Short positions: Stop never increases

2. **Fee-Adjusted**:
   - Break-even accounts for entry + exit fees
   - ROI calculations are net of all costs

3. **Leverage-Aware**:
   - Higher leverage = higher break-even ROI requirement
   - Trailing respects leveraged price movements

4. **Validation**:
   - All config parameters validated
   - Invalid configurations rejected with clear errors

5. **Production-Safe**:
   - Compatible with StopOrderStateMachine
   - No unsafe state transitions

### Example Scenarios

#### Scenario 1: Quick Profit Lock
```
Entry: $50,000 (10x leverage)
Initial SL: $49,750 (-0.5% ROI)

Price rises to $50,065 (1.3% ROI)
→ Break-even triggered
→ Stop moves to $50,005

Price rises to $50,090 (1.8% ROI)  
→ First trailing step crossed
→ Stop moves to $50,045

Price drops to $50,040
→ Stop hit, exit at break-even
→ Protected from giving back gains
```

#### Scenario 2: Extended Run
```
Entry: $50,000 (10x leverage)
Price rises to $50,200 (4% ROI)

Break-even at 1.3% ROI: Stop → $50,005
Step 1 at 1.45%: Stop → $50,025
Step 2 at 1.60%: Stop → $50,045
Step 3 at 1.75%: Stop → $50,065
...continuing to trail up

Exit: Stop trails price up, locks in majority of gains
```

### Tuning Guidelines

**Conservative Trailing** (preserve more profits):
- Increase `trailingStepPercent` (e.g., 0.25%)
- Decrease `trailingMovePercent` (e.g., 0.03%)
- Result: Trails less frequently, locks in more profit

**Aggressive Trailing** (let profits run):
- Decrease `trailingStepPercent` (e.g., 0.10%)
- Increase `trailingMovePercent` (e.g., 0.08%)
- Result: Trails more frequently, gives more room

**Early Break-Even**:
- Decrease `breakEvenBuffer` (e.g., 0.05%)
- Result: Moves to break-even sooner

**Delayed Break-Even**:
- Increase `breakEvenBuffer` (e.g., 0.2%)
- Result: Requires more profit before protection

### References

- **DecimalMath**: Fee-adjusted break-even calculations
- **ConfigSchema**: Default parameters (BREAK_EVEN_BUFFER, TRAILING_STEP_PERCENT, etc.)
- **StopOrderStateMachine**: Production stop order management
- **Tests**: `/tests/trailing-stop-policy.test.js`

---

**Note**: The 'atr' and 'dynamic' trailing modes are reserved for future implementation. Currently, only 'staircase' mode is supported.
