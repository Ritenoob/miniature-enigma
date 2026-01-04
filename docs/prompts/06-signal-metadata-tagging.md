# Prompt: Signal Metadata Tagging

## Objective
Add experimental tracking to signal generation - tag each signal with variant ID and experimental flags for audit trail.

## System Context
- **Base**: MIRKO V3.6.1+ KuCoin Futures Bot
- **Language**: Node.js ES6+
- **Purpose**: Track which variant generated each signal/trade

## Requirements

### 1. Signal Metadata Structure

```javascript
// Enhanced signal object with metadata
const signal = {
  // Existing signal fields
  strength: 0.75,
  direction: 'long',
  timestamp: Date.now(),
  indicators: {
    macd: 0.8,
    rsi: 0.7,
    volumeSpike: 0.6
  },
  
  // New metadata fields
  metadata: {
    variantId: 'abc123def456',     // Which variant generated this
    isExperimental: true,           // Is this from optimizer?
    variantConfig: {                // Snapshot of variant config
      weights: {...},
      thresholds: {...}
    },
    generationMethod: 'optimizer',  // 'main' or 'optimizer'
    confidence: 0.95                // Statistical confidence
  }
};
```

### 2. Signal Tagging in Variant

```javascript
// In StrategyVariant class
class StrategyVariant {
  generateSignal(marketData) {
    const signal = this.calculateSignal(marketData);
    
    // Tag with variant metadata
    signal.metadata = {
      variantId: this.id,
      isExperimental: true,
      variantConfig: {
        weights: this.config.weights,
        thresholds: this.config.thresholds
      },
      generationMethod: 'optimizer',
      confidence: this.getConfidence(),
      timestamp: Date.now()
    };
    
    return signal;
  }

  getConfidence() {
    // Calculate confidence based on sample size and performance
    if (this.trades.length < 30) return 0;
    
    const sharpe = this.metrics.sharpe;
    const sampleSize = this.trades.length;
    
    // Simple confidence heuristic
    return Math.min(
      (sampleSize / 100) * (sharpe / 2),
      0.99
    );
  }
}
```

### 3. Trade Logging with Metadata

```javascript
// Enhanced trade record
const trade = {
  // Existing trade fields
  entryPrice: 50000,
  exitPrice: 51000,
  roi: 0.02,
  pnl: 200,
  
  // Metadata
  metadata: {
    variantId: 'abc123def456',
    isExperimental: true,
    signalStrength: 0.75,
    configSnapshot: {...},
    entryTimestamp: Date.now(),
    exitTimestamp: Date.now() + 3600000
  }
};

// Log to separate experimental trades file
function logExperimentalTrade(trade) {
  const logEntry = {
    timestamp: Date.now(),
    trade,
    variant: trade.metadata.variantId,
    performance: {
      roi: trade.roi,
      duration: trade.metadata.exitTimestamp - trade.metadata.entryTimestamp
    }
  };
  
  // Append to experimental-trades.json
  appendToLog('experimental-trades.json', logEntry);
}
```

### 4. Main Strategy Tagging

Update main strategy to tag its signals too:

```javascript
// In main strategy signal generation
function generateMainSignal(marketData) {
  const signal = calculateSignalFromWeights(marketData);
  
  // Tag main strategy signals
  signal.metadata = {
    variantId: 'main',
    isExperimental: false,
    variantConfig: getCurrentMainConfig(),
    generationMethod: 'main',
    confidence: 1.0,
    timestamp: Date.now()
  };
  
  return signal;
}
```

### 5. Audit Log API

Add endpoint to query tagged signals:

```javascript
// GET /api/signals/history?variantId=abc123
app.get('/api/signals/history', (req, res) => {
  const {variantId, startTime, endTime} = req.query;
  
  const signals = loadSignalHistory()
    .filter(s => {
      if (variantId && s.metadata.variantId !== variantId) return false;
      if (startTime && s.timestamp < parseInt(startTime)) return false;
      if (endTime && s.timestamp > parseInt(endTime)) return false;
      return true;
    });
  
  res.json({
    signals,
    count: signals.length
  });
});

// GET /api/trades/experimental
app.get('/api/trades/experimental', (req, res) => {
  const experimentalTrades = loadExperimentalTrades();
  
  const summary = {
    total: experimentalTrades.length,
    byVariant: {},
    performance: {
      totalROI: 0,
      avgROI: 0,
      winRate: 0
    }
  };
  
  for (const trade of experimentalTrades) {
    const variantId = trade.metadata.variantId;
    
    if (!summary.byVariant[variantId]) {
      summary.byVariant[variantId] = {
        trades: 0,
        roi: 0,
        wins: 0
      };
    }
    
    summary.byVariant[variantId].trades++;
    summary.byVariant[variantId].roi += trade.roi;
    if (trade.roi > 0) summary.byVariant[variantId].wins++;
  }
  
  res.json({
    trades: experimentalTrades,
    summary
  });
});
```

### 6. Dashboard Display

Add to frontend to show experimental vs main signals:

```html
<div id="signal-sources">
  <h3>Signal Sources</h3>
  <div class="signal-breakdown">
    <div class="source">
      <span>Main Strategy:</span>
      <strong id="main-signals-count">0</strong>
    </div>
    <div class="source">
      <span>Experimental:</span>
      <strong id="experimental-signals-count">0</strong>
    </div>
  </div>
  
  <table id="recent-signals">
    <thead>
      <tr>
        <th>Time</th>
        <th>Source</th>
        <th>Variant</th>
        <th>Strength</th>
        <th>Direction</th>
      </tr>
    </thead>
    <tbody id="signals-body">
    </tbody>
  </table>
</div>

<script>
function updateSignalDisplay(signal) {
  const tbody = document.getElementById('signals-body');
  const row = tbody.insertRow(0);
  
  const source = signal.metadata.isExperimental ? 'Experimental' : 'Main';
  const variantId = signal.metadata.variantId.substring(0, 8);
  
  row.innerHTML = `
    <td>${new Date(signal.timestamp).toLocaleTimeString()}</td>
    <td class="${signal.metadata.isExperimental ? 'experimental' : 'main'}">${source}</td>
    <td>${variantId}</td>
    <td>${signal.strength.toFixed(2)}</td>
    <td class="${signal.direction === 'long' ? 'long' : 'short'}">${signal.direction}</td>
  `;
  
  // Keep only last 20 signals
  while (tbody.rows.length > 20) {
    tbody.deleteRow(tbody.rows.length - 1);
  }
}
</script>
```

## Testing Requirements
- Test signal tagging for all variants
- Test metadata persistence in logs
- Test audit log query API
- Test main strategy tagging
- Test dashboard display

## Integration Points
- Integrate with StrategyVariant signal generation
- Add to main strategy signal generation
- Create separate log file for experimental trades
- Add API endpoints for querying tagged data

## Safety Notes
- Always include variant ID in metadata
- Log experimental trades separately from main
- Retain config snapshots for reproducibility
- Enable audit trail for regulatory compliance
