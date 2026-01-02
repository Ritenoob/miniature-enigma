# Live Optimizer System Guide

## Overview

The Live Optimizer runs multiple strategy variants in parallel paper trading mode to identify optimal signal configurations. This system is fully integrated into the KuCoin Futures Dashboard v3.5.2.

## Quick Start

### 1. Enable the Optimizer

Edit your `.env` file:

```env
OPTIMIZER_ENABLED=true
OPTIMIZER_MAX_VARIANTS=4
OPTIMIZER_AUTO_PROMOTE=false
```

### 2. Start the Server

```bash
npm start
```

You should see:
```
[INIT] Live Optimizer enabled. Will run experimental strategy variants in paper trading mode.
[OPTIMIZER] Initialized with paper trading mode
```

### 3. Monitor Performance

Check the startup logs to see the optimizer in action:
```
[Optimizer] Initialized with 4 variants: default, conservative, aggressive, balanced
[Optimizer] default: Opened long position on XBTUSDTM @ 50010.00
[Optimizer] conservative: Opened long position on XBTUSDTM @ 50010.00
...
```

## API Endpoints

### Get Optimizer Status

```bash
curl http://localhost:3001/api/optimizer/status
```

Returns:
```json
{
  "enabled": true,
  "initialized": true,
  "paperTrading": true,
  "accountBalance": 10000,
  "variants": {
    "default": {
      "profileName": "default",
      "position": { ... },
      "metrics": {
        "tradesCount": 5,
        "winCount": 3,
        "lossCount": 2,
        "totalNetPnl": 123.45,
        "avgPnLPerTrade": 24.69,
        "avgROI": 2.5,
        "winRate": 0.6
      },
      "recentTrades": [ ... ]
    },
    ...
  }
}
```

### Get Performance Comparison

```bash
curl http://localhost:3001/api/optimizer/performance
```

Returns:
```json
{
  "enabled": true,
  "variants": [
    {
      "profile": "aggressive",
      "tradesCount": "5",
      "winRate": "80.0%",
      "avgROI": "3.25%",
      "totalNetPnl": "156.78",
      "avgPnlPerTrade": "31.36"
    },
    ...
  ]
}
```

### Reset All Variants

```bash
curl -X POST http://localhost:3001/api/optimizer/reset
```

## WebSocket Messages

### Request Status

```javascript
ws.send(JSON.stringify({ type: 'get_optimizer_status' }))
```

### Request Performance

```javascript
ws.send(JSON.stringify({ type: 'get_optimizer_performance' }))
```

### Reset Optimizer

```javascript
ws.send(JSON.stringify({ type: 'reset_optimizer' }))
```

## Strategy Profiles

The optimizer tests 4 different signal weight profiles:

### 1. Default
Balanced weights across all indicators.

### 2. Conservative
- Higher weight on trend indicators (MACD, EMA)
- Lower weight on momentum indicators (RSI, Williams %R)
- Wider signal thresholds

### 3. Aggressive
- Higher weight on momentum indicators
- Lower weight on trend indicators
- Tighter signal thresholds

### 4. Balanced
Equal distribution across all indicator types.

## How It Works

1. **Market Data Hook**: Optimizer receives live market data from the main WebSocket feed
2. **Signal Generation**: Each variant generates independent signals based on its profile
3. **Paper Trading**: Positions simulated with realistic fees (0.06% taker) and slippage (0.02%)
4. **Trailing Stops**: Each position uses the same trailing stop logic as the main strategy
5. **Metrics Tracking**: Win rate, avg ROI, total P&L tracked per variant
6. **Performance Comparison**: Variants ranked by total net P&L

## Safety Features

### Paper Trading Only
- ✅ All variants run in paper trading mode by default
- ✅ Real trading requires explicit configuration (not recommended)
- ✅ DEMO_MODE forces paper trading (cannot be overridden)

### Isolation
- ✅ Each variant has independent state
- ✅ Optimizer errors don't crash main system
- ✅ Variants don't interfere with each other

### Validation
- ✅ Exit orders use reduceOnly flag (for future real trading)
- ✅ Position sizing within safe bounds
- ✅ Leverage limits enforced

## Configuration

### Environment Variables

```env
# Enable/disable optimizer
OPTIMIZER_ENABLED=true

# Maximum concurrent variants (1-10)
OPTIMIZER_MAX_VARIANTS=4

# Auto-promote best strategy (not implemented yet)
OPTIMIZER_AUTO_PROMOTE=false
```

### Signal Profiles

Profiles are defined in `signal-weights.js`:

```javascript
profiles: {
  conservative: {
    rsi: { max: 15 },
    macd: { max: 25 },    // Higher weight
    emaTrend: { max: 30 } // Much higher weight
    ...
  },
  aggressive: {
    rsi: { max: 30 },     // Higher weight
    macd: { max: 15 },
    emaTrend: { max: 10 } // Lower weight
    ...
  }
}
```

## Demo Script

Run the demo to see the optimizer in action:

```bash
node examples/test-optimizer.js
```

Output:
```
╔═══════════════════════════════════════════════════════════════╗
║     Live Optimizer Demo                                       ║
║     Testing 4 Strategy Variants with Simulated Data          ║
╚═══════════════════════════════════════════════════════════════╝

📊 Simulating BULLISH market scenario...

1️⃣  Entry signal at $50,000...
   Positions opened: 4 variants

2️⃣  Price moves to $50,500 (+1%)...
3️⃣  Price moves to $51,000 (+2%)...

📈 Performance Comparison:
═══════════════════════════════════════════════════════════════
1. default         | Trades: 1 | Win Rate: 100.0% | Avg ROI: 8.40% | Net P&L: $8.40
2. conservative    | Trades: 1 | Win Rate: 100.0% | Avg ROI: 8.40% | Net P&L: $8.40
3. aggressive      | Trades: 1 | Win Rate: 100.0% | Avg ROI: 8.40% | Net P&L: $8.40
4. balanced        | Trades: 1 | Win Rate: 100.0% | Avg ROI: 8.40% | Net P&L: $8.40
═══════════════════════════════════════════════════════════════
```

## Monitoring

### Logs

The optimizer logs all activity:

```
[Optimizer] Initialized with 4 variants: default, conservative, aggressive, balanced
[Optimizer] default: Opened long position on BTCUSDT @ 50010.00
[Optimizer] default: Trailing stop updated to 50015.00 (break_even, ROI: 9.20%)
[Optimizer] default: Closed position @ 50489.90 | Net P&L: 8.40 USDT (8.40%) | take_profit
```

### Health Endpoint

Check optimizer status in health endpoint:

```bash
curl http://localhost:3001/health
```

```json
{
  "status": "ok",
  "optimizerEnabled": true,
  "optimizerStatus": true
}
```

## Troubleshooting

### Optimizer Not Starting

Check:
1. `OPTIMIZER_ENABLED=true` in `.env`
2. Server logs show `[OPTIMIZER] Initialized with paper trading mode`
3. Dependencies installed: `npm install`

### No Positions Opening

Check:
1. Market data is flowing (check logs for `[SUCCESS] Symbol initialized`)
2. Indicators are being calculated
3. Signals are being generated (check signal strength)

### API Endpoints Return 404

Ensure:
1. Server is running
2. Optimizer is enabled
3. URL is correct: `http://localhost:3001/api/optimizer/status`

## Best Practices

1. **Start in Demo Mode**: Test with `DEMO_MODE=true` first
2. **Monitor Performance**: Check API regularly for variant performance
3. **Long-Term Testing**: Let optimizer run for days/weeks to gather sufficient data
4. **Compare Variants**: Look for consistent winners across different market conditions
5. **Paper Trade First**: Never enable real trading without extensive paper trading

## Limitations

- ✅ Paper trading only (real trading not recommended)
- ✅ Single symbol at a time (multi-symbol optimization not implemented)
- ✅ Fixed position size (dynamic sizing not implemented)
- ✅ No automatic promotion (manual review required)
- ✅ No persistent state (metrics reset on restart)

## Future Enhancements

Potential additions:
- Walk-forward validation
- Parameter search (Latin Hypercube, NSGA-II)
- Multi-symbol, multi-timeframe testing
- Automatic strategy promotion
- Performance persistence
- Backtest engine integration
- Pareto front visualization

## Support

For issues or questions:
1. Check logs for error messages
2. Review API responses
3. Run demo script: `node examples/test-optimizer.js`
4. Verify configuration in `.env`

---

**Remember: The optimizer is a tool for strategy discovery. Always paper trade extensively before considering any real trading.**
