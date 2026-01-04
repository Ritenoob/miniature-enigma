# Signal Configuration Guide

## Overview

The trading signal generator now supports **configurable indicator weights** that can be switched dynamically without code changes. This allows you to test different trading strategies (conservative, aggressive, balanced, etc.) by simply switching profiles.

## Available Profiles

### 1. Default Profile
The baseline configuration with balanced weights:
- **RSI**: 25 points (oversold < 30, overbought > 70)
- **Williams %R**: 20 points
- **MACD**: 20 points
- **Awesome Oscillator**: 15 points
- **EMA Trend**: 20 points
- **Stochastic**: 10 points
- **Bollinger Bands**: 10 points
- **Total**: ~120 points

### 2. Conservative Profile
Emphasizes trend-following indicators over momentum:
- **Higher weights**: MACD (25), EMA Trend (30)
- **Lower weights**: RSI (15), Williams %R (10), Stochastic (5)
- **Best for**: Lower volatility markets, longer timeframes

### 3. Aggressive Profile
Favors momentum indicators for quick signals:
- **Higher weights**: RSI (30), Williams %R (25), AO (20)
- **Lower weights**: EMA Trend (10), MACD (15)
- **Best for**: High volatility markets, shorter timeframes

### 4. Balanced Profile
Equal distribution across all indicators:
- **All weights**: 15-20 points each
- **Best for**: General purpose trading

### 5. Scalping Profile
Optimized for quick trades with tighter thresholds:
- **Tighter levels**: RSI oversold at 35 (vs 30), overbought at 65 (vs 70)
- **Higher weights**: Williams %R (25), Stochastic (15)
- **Lower weights**: EMA Trend (5), MACD (10)
- **Best for**: 1m-5m timeframes

### 6. Swing Trading Profile
Optimized for longer-term positions:
- **Wider levels**: RSI oversold at 25, overbought at 75
- **Higher weights**: MACD (30), EMA Trend (25)
- **Lower weights**: Stochastic (5)
- **Best for**: 1h-4h timeframes

## Switching Profiles

### Via API (HTTP)

**Get current configuration:**
```bash
curl http://localhost:3000/api/signal/config
```

Response:
```json
{
  "activeProfile": {
    "name": "default",
    "weights": { ... },
    "thresholds": { ... }
  },
  "availableProfiles": [
    "default",
    "conservative",
    "aggressive",
    "balanced",
    "scalping",
    "swingTrading"
  ],
  "thresholds": {
    "strongBuy": 70,
    "buy": 50,
    "buyWeak": 30,
    "strongSell": -70,
    "sell": -50,
    "sellWeak": -30
  }
}
```

**Switch profile:**
```bash
curl -X POST http://localhost:3000/api/signal/config \
  -H "Content-Type: application/json" \
  -d '{"profile": "aggressive"}'
```

Response:
```json
{
  "success": true,
  "profile": {
    "name": "aggressive",
    "weights": { ... },
    "thresholds": { ... }
  }
}
```

### Via WebSocket

Send a message to the WebSocket connection:
```javascript
ws.send(JSON.stringify({
  type: 'set_signal_profile',
  profile: 'conservative'
}));
```

The server will broadcast a confirmation:
```javascript
{
  type: 'signal_profile_changed',
  profile: 'conservative',
  config: { ... }
}
```

### Via Code

If you're integrating programmatically:
```javascript
const SignalGenerator = require('./src/lib/SignalGenerator');

// Initialize (loads config from signal-weights.js)
SignalGenerator.initialize();

// Switch profile
SignalGenerator.setProfile('aggressive');

// Get current profile
const profile = SignalGenerator.getActiveProfile();
console.log(profile.name);        // 'aggressive'
console.log(profile.weights.rsi); // { max: 30, oversold: 30, ... }

// Generate signal with active profile
const signal = SignalGenerator.generate(indicators);
```

## Creating Custom Profiles

Edit `signal-weights.js` to add your own profiles:

```javascript
profiles: {
  // ... existing profiles ...
  
  // Your custom profile
  myCustom: {
    rsi: { 
      max: 20, 
      oversold: 28, 
      oversoldMild: 38, 
      overbought: 72, 
      overboughtMild: 62 
    },
    williamsR: { max: 18, oversold: -82, overbought: -18 },
    macd: { max: 22 },
    ao: { max: 12 },
    emaTrend: { max: 18 },
    stochastic: { max: 8, oversold: 18, overbought: 82 },
    bollinger: { max: 12 }
  }
}
```

**Required fields for each indicator:**
- `rsi`: max, oversold, oversoldMild, overbought, overboughtMild
- `williamsR`: max, oversold, overbought
- `macd`: max
- `ao`: max
- `emaTrend`: max
- `stochastic`: max, oversold, overbought
- `bollinger`: max

## Signal Calculation

The signal score ranges from **-120 to +120** (approximately):

1. Each indicator contributes points based on its conditions
2. Bullish conditions add points, bearish conditions subtract
3. Total score determines signal type:
   - **STRONG_BUY** (score ≥ 70, HIGH confidence)
   - **BUY** (score ≥ 50, MEDIUM confidence)
   - **BUY** (score ≥ 30, LOW confidence)
   - **NEUTRAL** (score between -30 and 30)
   - **SELL** (score ≤ -30, LOW confidence)
   - **SELL** (score ≤ -50, MEDIUM confidence)
   - **STRONG_SELL** (score ≤ -70, HIGH confidence)

## Testing Signal Quality

To compare profile performance:

1. **Run in DEMO_MODE** to avoid real trades
2. **Switch profile** before new market data arrives
3. **Record signals** over time:
   ```bash
   # Test aggressive profile for 1 hour
   curl -X POST http://localhost:3000/api/signal/config \
     -d '{"profile": "aggressive"}'
   
   # Wait and observe...
   
   # Switch to conservative
   curl -X POST http://localhost:3000/api/signal/config \
     -d '{"profile": "conservative"}'
   ```
4. **Compare results**: Check signal accuracy vs actual price movements

## Weight Tuning Tips

### Increasing Signal Sensitivity
- **Increase** RSI/Williams %R weights
- **Decrease** trend indicator weights (EMA, MACD)
- **Tighten** threshold levels (e.g., RSI oversold from 30 → 35)

### Reducing False Signals
- **Increase** trend indicator weights
- **Decrease** momentum indicator weights
- **Widen** threshold levels (e.g., RSI oversold from 30 → 25)

### Total Weight Budget
Keep total max points around **100-120**:
- Too low: Signals may never reach STRONG_BUY/SELL thresholds
- Too high: Most signals become STRONG, losing nuance

## Troubleshooting

### Problem: Invalid profile error
**Error**: `Invalid profile 'xyz'. Available profiles: ...`

**Solution**: Check spelling and ensure profile exists in `signal-weights.js`

### Problem: Signals seem wrong after switching
**Cause**: Using stale indicator data

**Solution**: Wait for next indicator calculation cycle (happens on new candle)

### Problem: Config not loading
**Error**: `Failed to load config: Cannot find module`

**Solution**: Ensure `signal-weights.js` exists in project root and has valid syntax

### Problem: Server crashes on profile switch
**Cause**: Malformed profile in `signal-weights.js`

**Solution**: Validate profile structure:
```javascript
const { validateWeights } = require('./signal-weights');
try {
  validateWeights(myProfile);
  console.log('✓ Valid');
} catch (error) {
  console.error('✗ Invalid:', error.message);
}
```

## Advanced Usage

### A/B Testing Profiles

Run multiple instances with different profiles:
```bash
# Terminal 1: Conservative profile
PORT=3000 node server.js &
curl -X POST http://localhost:3000/api/signal/config -d '{"profile": "conservative"}'

# Terminal 2: Aggressive profile
PORT=3001 node server.js &
curl -X POST http://localhost:3001/api/signal/config -d '{"profile": "aggressive"}'
```

### Programmatic Weight Updates

```javascript
const config = require('./signal-weights');

// Temporarily boost RSI importance
const originalMax = config.weights.rsi.max;
config.weights.rsi.max = 35;

// Generate signal
const signal = SignalGenerator.generate(indicators);

// Restore
config.weights.rsi.max = originalMax;
```

⚠️ **Warning**: Direct config modification bypasses validation. Use `setProfile()` for safety.

## Future Enhancements

The signal generator is designed to support:
- **Live optimizer**: Automatic weight adjustment based on performance
- **Backtesting**: Historical signal quality analysis
- **Multi-symbol profiles**: Different weights per trading pair
- **Time-based profiles**: Auto-switch based on time of day/market conditions

## Configuration Persistence

**Current behavior**: Profile resets to `activeProfile` in `signal-weights.js` on server restart.

**To persist profile changes**: Edit `signal-weights.js` and set `activeProfile`:
```javascript
module.exports = {
  // ...
  activeProfile: 'aggressive',  // Change this
  // ...
};
```

## Performance Impact

Profile switching is **fast and safe**:
- **Latency**: < 1ms (atomic operation)
- **Memory**: ~1KB per profile
- **Thread-safe**: Yes (single-threaded Node.js)
- **State**: Stateless (no impact on open positions)

## Safety Notes

✅ **Safe operations**:
- Switching profiles during active trading
- Changing weights between trades
- Multiple profile switches per session

⚠️ **Cautions**:
- Profile changes **do not** affect open positions
- Signal changes **do not** trigger immediate trades (unless auto-trading enabled)
- Always test new profiles in DEMO_MODE first

## Support

For issues or questions:
1. Check server logs for detailed error messages
2. Verify `signal-weights.js` syntax (valid JavaScript object)
3. Test profiles individually with sample data
4. Review indicator values to ensure they're in expected ranges

---

**Last Updated**: 2026-01-01  
**Version**: 3.5.2
