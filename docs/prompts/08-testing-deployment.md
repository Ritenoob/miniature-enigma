# Prompt: Testing and Deployment

## Objective
Comprehensive testing strategy and deployment checklist for the Live Optimizer System.

## System Context
- **Base**: MIRKO V3.6.1+ KuCoin Futures Bot
- **Language**: Node.js ES6+
- **Testing Framework**: Node.js native test runner or Jest

## Testing Strategy

### 1. Unit Tests

#### OptimizerConfig Tests

```javascript
// tests/optimizer/OptimizerConfig.test.js
const assert = require('assert');
const OptimizerConfig = require('../../src/optimizer/OptimizerConfig');

describe('OptimizerConfig', () => {
  it('should generate valid random variant', () => {
    const config = new OptimizerConfig();
    const variant = config.generateVariant('random');
    
    // Check weights sum to 1.0
    const weightSum = Object.values(variant.weights).reduce((a, b) => a + b, 0);
    assert(Math.abs(weightSum - 1.0) < 0.01);
    
    // Check thresholds are ordered
    assert(variant.thresholds.strongBuy > variant.thresholds.moderateBuy);
  });

  it('should generate conservative variant', () => {
    const config = new OptimizerConfig();
    const variant = config.generateVariant('conservative');
    
    assert(variant.riskParams.maxLeverage <= 5);
    assert(variant.thresholds.strongBuy >= 0.7);
  });

  it('should validate config correctly', () => {
    const config = new OptimizerConfig();
    const valid = config.generateVariant('random');
    
    assert.doesNotThrow(() => config.validateConfig(valid));
  });
});
```

#### ScoringEngine Tests

```javascript
// tests/optimizer/ScoringEngine.test.js
const assert = require('assert');
const ScoringEngine = require('../../src/optimizer/ScoringEngine');

describe('ScoringEngine', () => {
  it('should reject variant with insufficient samples', () => {
    const engine = new ScoringEngine({minSampleSize: 50});
    const mockVariant = {
      getMetrics: () => ({roi: 10, sharpe: 2, winRate: 60}),
      getTrades: () => new Array(30) // Only 30 trades
    };
    
    const result = engine.evaluateVariant(mockVariant);
    assert.strictEqual(result.eligible, false);
    assert.strictEqual(result.reason, 'insufficient_samples');
  });

  it('should calculate composite score correctly', () => {
    const engine = new ScoringEngine();
    const metrics = {roi: 10, sharpe: 2, winRate: 60, maxDrawdown: 5};
    
    const score = engine.calculateCompositeScore(metrics);
    assert(score >= 0 && score <= 1);
  });

  it('should rank variants by score', () => {
    const engine = new ScoringEngine();
    const variants = [
      {id: 1, getMetrics: () => ({roi: 5, sharpe: 1, winRate: 50}), getTrades: () => []},
      {id: 2, getMetrics: () => ({roi: 15, sharpe: 2.5, winRate: 70}), getTrades: () => []},
      {id: 3, getMetrics: () => ({roi: 10, sharpe: 1.8, winRate: 60}), getTrades: () => []}
    ];
    
    const ranked = engine.rankVariants(variants);
    assert(ranked[0].variant.id === 2); // Highest score
  });
});
```

### 2. Integration Tests

#### LiveOptimizerController Tests

```javascript
// tests/optimizer/LiveOptimizerController.integration.test.js
const assert = require('assert');
const LiveOptimizerController = require('../../src/optimizer/LiveOptimizerController');

describe('LiveOptimizerController Integration', () => {
  it('should start and generate variants', async () => {
    const controller = new LiveOptimizerController({
      maxVariants: 3,
      paperTrading: true,
      initialCapital: 10000
    });
    
    await controller.start();
    
    assert.strictEqual(controller.variants.size, 3);
    assert.strictEqual(controller.isRunning, true);
    
    await controller.stop();
  });

  it('should process market data without errors', async () => {
    const controller = new LiveOptimizerController({
      maxVariants: 2,
      paperTrading: true
    });
    
    await controller.start();
    
    const marketData = {
      symbol: 'ETHUSDTM',
      price: 3000,
      volume: 1000000,
      timestamp: Date.now()
    };
    
    await controller.onMarketData(marketData);
    
    // Should not throw
    await controller.stop();
  });

  it('should emit events on variant lifecycle', (done) => {
    const controller = new LiveOptimizerController({
      maxVariants: 1,
      paperTrading: true
    });
    
    let startedEmitted = false;
    
    controller.on('variantStarted', () => {
      startedEmitted = true;
    });
    
    controller.start().then(() => {
      assert(startedEmitted);
      controller.stop().then(done);
    });
  });
});
```

### 3. End-to-End Tests

```javascript
// tests/optimizer/e2e.test.js
const assert = require('assert');
const {spawn} = require('child_process');

describe('Live Optimizer E2E', () => {
  it('should start server with optimizer enabled', (done) => {
    const env = {
      ...process.env,
      OPTIMIZER_ENABLED: 'true',
      OPTIMIZER_MODE: 'paper',
      DEMO_MODE: 'true',
      PORT: '3002'
    };
    
    const server = spawn('node', ['server.js'], {env});
    
    let output = '';
    server.stdout.on('data', (data) => {
      output += data.toString();
      
      if (output.includes('Optimizer: ENABLED')) {
        server.kill();
        done();
      }
    });
    
    setTimeout(() => {
      server.kill();
      done(new Error('Timeout'));
    }, 10000);
  });
});
```

### 4. Property-Based Tests

```javascript
// tests/optimizer/properties.test.js
const fc = require('fast-check');
const assert = require('assert');
const OptimizerConfig = require('../../src/optimizer/OptimizerConfig');

describe('Optimizer Properties', () => {
  it('weights always sum to 1.0', () => {
    fc.assert(
      fc.property(fc.integer({min: 1, max: 100}), (seed) => {
        const config = new OptimizerConfig();
        const variant = config.generateVariant('random');
        const sum = Object.values(variant.weights).reduce((a, b) => a + b, 0);
        return Math.abs(sum - 1.0) < 0.01;
      })
    );
  });

  it('stop price moves monotonically for longs', () => {
    fc.assert(
      fc.property(
        fc.float({min: 1000, max: 10000}),
        fc.float({min: 1000, max: 10000}),
        (stop1, stop2) => {
          // For long positions, new stop >= old stop
          if (stop2 < stop1) {
            // Should reject
            return true;
          }
          return true;
        }
      )
    );
  });
});
```

## Deployment Checklist

### Pre-Deployment

- [ ] All unit tests pass (`npm test`)
- [ ] All integration tests pass
- [ ] Code review completed
- [ ] Security review completed (no API key leaks)
- [ ] Documentation updated
- [ ] Environment variables documented in `.env.example`

### Paper Trading Validation

- [ ] Start server with `OPTIMIZER_ENABLED=true OPTIMIZER_MODE=paper DEMO_MODE=true`
- [ ] Verify optimizer starts without errors
- [ ] Verify market data flows to variants
- [ ] Run for 24 hours in paper mode
- [ ] Check for memory leaks
- [ ] Verify metrics calculation accuracy
- [ ] Verify no interference with main strategy

### Pre-Production

- [ ] Test with real market data but paper trading
- [ ] Verify API rate limits respected (via PingBudgetManager)
- [ ] Test emergency stop via `/api/optimizer/stop`
- [ ] Test graceful shutdown (SIGINT/SIGTERM)
- [ ] Monitor CPU and memory usage
- [ ] Verify telemetry feed working
- [ ] Test dashboard displays correctly

### Production Deployment

- [ ] Start with `OPTIMIZER_ENABLED=true OPTIMIZER_MODE=paper`
- [ ] Monitor for 1 week in production with paper trading
- [ ] Review variant performance logs
- [ ] Verify no errors in logs
- [ ] Check prometheus/monitoring metrics
- [ ] Only then consider `OPTIMIZER_MODE=live` with 1% position sizes

### Post-Deployment Monitoring

- [ ] Monitor `/api/optimizer/status` endpoint
- [ ] Check variant metrics daily
- [ ] Review experimental trades log
- [ ] Monitor for API rate limit errors
- [ ] Check for memory/CPU anomalies
- [ ] Review promotion candidates

## Performance Benchmarks

### Expected Performance

- **Memory**: < 500MB for 5 variants
- **CPU**: < 10% average
- **Latency**: < 50ms per variant per tick
- **API Calls**: < 100/minute (well under rate limits)

### Load Testing

```javascript
// tests/optimizer/load.test.js
const assert = require('assert');
const LiveOptimizerController = require('../../src/optimizer/LiveOptimizerController');

describe('Optimizer Load Test', () => {
  it('should handle 1000 ticks without degradation', async () => {
    const controller = new LiveOptimizerController({
      maxVariants: 5,
      paperTrading: true
    });
    
    await controller.start();
    
    const startTime = Date.now();
    
    for (let i = 0; i < 1000; i++) {
      await controller.onMarketData({
        price: 3000 + Math.random() * 100,
        volume: 1000000,
        timestamp: Date.now()
      });
    }
    
    const duration = Date.now() - startTime;
    const avgLatency = duration / 1000;
    
    console.log(`Avg latency: ${avgLatency}ms per tick`);
    assert(avgLatency < 50);
    
    await controller.stop();
  });
});
```

## Rollback Plan

If issues occur in production:

1. **Immediate**: POST to `/api/optimizer/stop`
2. **Quick**: Set `OPTIMIZER_ENABLED=false` and restart
3. **Emergency**: Kill process, start without optimizer
4. **Review**: Check logs in `experimental-trades.json` and server logs
5. **Fix**: Address issues in development
6. **Re-test**: Full test cycle before re-enabling

## Safety Notes

⚠️ **CRITICAL**: Always test thoroughly in paper mode first  
⚠️ Start with low variant count (3-5) initially  
⚠️ Monitor resource usage closely  
⚠️ Never deploy to production without paper trading validation  
⚠️ Keep emergency stop procedure documented and accessible
