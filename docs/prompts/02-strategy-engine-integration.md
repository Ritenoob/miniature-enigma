# Prompt: Strategy Engine Integration

## Objective
Integrate LiveOptimizerController into `server.js` to run parallel experiments alongside the main trading strategy without interference.

## System Context
- **Base**: MIRKO V3.6.1+ KuCoin Futures Bot
- **Language**: Node.js ES6+, async/await
- **Entry Point**: server.js
- **Integration Pattern**: Non-blocking, event-driven

## Requirements

### 1. Module Import and Initialization

```javascript
const LiveOptimizerController = require('./src/optimizer/LiveOptimizerController');

// Configuration from environment
const OPTIMIZER_ENABLED = process.env.OPTIMIZER_ENABLED === 'true';
const OPTIMIZER_MODE = process.env.OPTIMIZER_MODE || 'paper';

let optimizerController = null;

if (OPTIMIZER_ENABLED) {
  optimizerController = new LiveOptimizerController({
    maxVariants: parseInt(process.env.OPTIMIZER_MAX_VARIANTS) || 5,
    paperTrading: OPTIMIZER_MODE !== 'live',
    initialCapital: parseFloat(process.env.OPTIMIZER_INITIAL_CAPITAL) || 10000
  });
}
```

### 2. Market Data Feed Integration

**Hook into existing WebSocket handler:**

```javascript
// In WebSocket message handler
wsClient.on('message', async (data) => {
  const parsed = JSON.parse(data);
  
  // Existing main strategy logic
  await processMainStrategy(parsed);
  
  // Feed to optimizer (non-blocking)
  if (optimizerController && optimizerController.isRunning) {
    setImmediate(() => {
      optimizerController.onMarketData({
        symbol: parsed.topic,
        price: parsed.data.price,
        volume: parsed.data.volume,
        timestamp: parsed.data.ts
      }).catch(err => {
        console.error('Optimizer market data error:', err);
      });
    });
  }
});
```

### 3. API Endpoints

Add optimizer control endpoints:

```javascript
// GET /api/optimizer/status
app.get('/api/optimizer/status', (req, res) => {
  if (!OPTIMIZER_ENABLED) {
    return res.json({enabled: false});
  }
  
  res.json({
    enabled: true,
    running: optimizerController.isRunning,
    mode: OPTIMIZER_MODE,
    variants: optimizerController.variants.size
  });
});

// GET /api/optimizer/results
app.get('/api/optimizer/results', (req, res) => {
  if (!optimizerController) {
    return res.status(404).json({error: 'Optimizer not enabled'});
  }
  
  const results = optimizerController.getResults();
  const topPerformers = optimizerController.getTopPerformers(3);
  
  res.json({
    results,
    topPerformers,
    timestamp: new Date().toISOString()
  });
});

// POST /api/optimizer/start
app.post('/api/optimizer/start', async (req, res) => {
  if (!optimizerController) {
    return res.status(404).json({error: 'Optimizer not enabled'});
  }
  
  if (optimizerController.isRunning) {
    return res.status(400).json({error: 'Optimizer already running'});
  }
  
  try {
    await optimizerController.start();
    res.json({status: 'started', timestamp: new Date().toISOString()});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

// POST /api/optimizer/stop
app.post('/api/optimizer/stop', async (req, res) => {
  if (!optimizerController) {
    return res.status(404).json({error: 'Optimizer not enabled'});
  }
  
  try {
    await optimizerController.stop();
    res.json({status: 'stopped', timestamp: new Date().toISOString()});
  } catch (err) {
    res.status(500).json({error: err.message});
  }
});

// POST /api/optimizer/promote
app.post('/api/optimizer/promote', (req, res) => {
  if (!optimizerController) {
    return res.status(404).json({error: 'Optimizer not enabled'});
  }
  
  const {variantId} = req.body;
  
  if (!variantId) {
    return res.status(400).json({error: 'variantId required'});
  }
  
  // Promote winning variant config to main strategy
  // This requires careful implementation to avoid disrupting live trading
  
  res.json({status: 'promotion queued', variantId});
});
```

### 4. Graceful Shutdown

Update server shutdown to stop optimizer:

```javascript
async function shutdown() {
  console.log('Shutting down server...');
  
  // Stop optimizer first
  if (optimizerController && optimizerController.isRunning) {
    console.log('Stopping optimizer...');
    await optimizerController.stop();
  }
  
  // Existing shutdown logic
  // ...
  
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

### 5. Event Logging

Log optimizer events for monitoring:

```javascript
if (optimizerController) {
  optimizerController.on('variantStarted', (data) => {
    console.log(`[Optimizer] Variant ${data.id} started`);
  });
  
  optimizerController.on('variantStopped', (data) => {
    console.log(`[Optimizer] Variant ${data.id} stopped: ${data.reason}`);
  });
  
  optimizerController.on('tradeExecuted', (data) => {
    console.log(`[Optimizer] Variant ${data.id} executed trade`);
  });
  
  optimizerController.on('promotionCandidate', (data) => {
    console.log(`[Optimizer] Variant ${data.id} is promotion candidate (confidence: ${data.confidence})`);
  });
}
```

### 6. Environment Variables

Add to `.env.example`:

```bash
# Live Optimizer Configuration
OPTIMIZER_ENABLED=false
OPTIMIZER_MODE=paper  # paper or live
OPTIMIZER_MAX_VARIANTS=5
OPTIMIZER_INITIAL_CAPITAL=10000
```

### 7. Startup Banner

Update startup banner to show optimizer status:

```javascript
console.log(`
╔═══════════════════════════════════════════════════════╗
║   MIRKO v3.6.1 - KuCoin Futures Trading Bot          ║
╠═══════════════════════════════════════════════════════╣
║   Mode: ${DEMO_MODE ? 'DEMO' : 'LIVE'}
║   Optimizer: ${OPTIMIZER_ENABLED ? `ENABLED (${OPTIMIZER_MODE})` : 'DISABLED'}
║   Port: ${PORT}
╚═══════════════════════════════════════════════════════╝
`);
```

## Testing Requirements

### Unit Tests
- Test optimizer initialization
- Test API endpoint responses
- Test event logging

### Integration Tests
- Test market data flow to optimizer
- Test optimizer doesn't block main strategy
- Test graceful shutdown with optimizer running

### Manual Tests
1. Start server with `OPTIMIZER_ENABLED=true OPTIMIZER_MODE=paper npm start`
2. Verify startup banner shows optimizer status
3. POST to `/api/optimizer/start` and verify variants start
4. Watch logs for variant activity
5. GET `/api/optimizer/results` and verify metrics
6. POST to `/api/optimizer/stop` and verify graceful shutdown
7. Test with main strategy executing trades simultaneously

## Integration Points

### Isolation Requirements
- Optimizer must NOT interfere with main strategy execution
- Use `setImmediate()` or `process.nextTick()` to defer optimizer processing
- Catch and log all optimizer errors without crashing server
- Ensure optimizer API calls use separate rate limit budget (via PingBudgetManager)

### Resource Management
- Monitor memory usage as variants accumulate data
- Implement periodic cleanup of old trade data
- Limit concurrent API calls from optimizer variants

### Safety Checks
- Verify OPTIMIZER_MODE before executing real trades
- Implement kill switch via `/api/optimizer/stop`
- Add circuit breaker if optimizer causes repeated errors
- Log all optimizer trades to separate audit log

## Code Structure

The integration should be minimal and non-invasive:
1. Add imports at top of server.js
2. Add initialization after config loading
3. Add market data hook in existing WebSocket handler
4. Add API endpoints in Express routes section
5. Add shutdown hook in existing shutdown handler
6. Add event listeners after initialization

## Safety Notes
⚠️ **CRITICAL**: Optimizer runs in parallel - ensure no shared state with main strategy  
⚠️ Always default to paper trading mode  
⚠️ Real mode requires explicit opt-in and testing  
⚠️ Monitor for performance impact on main strategy  
⚠️ Implement emergency stop if optimizer causes errors
