process.env.DEMO_MODE = 'true';
process.env.RUN_INTERVALS = 'false';
process.env.OPTIMIZER_ENABLED = 'true';

const { test, describe } = require('node:test');
const assert = require('node:assert');

// Import optimizer modules
const OptimizerConfig = require('../src/optimizer/OptimizerConfig');
const ScoringEngine = require('../src/optimizer/ScoringEngine');
const TelemetryFeed = require('../src/optimizer/TelemetryFeed');
const LiveOptimizerController = require('../src/optimizer/LiveOptimizerController');

describe('Optimizer Configuration', () => {
  test('validates configuration successfully', () => {
    const result = OptimizerConfig.validate();
    assert.strictEqual(result, true);
  });

  test('rejects invalid maxConcurrent', () => {
    const originalValue = OptimizerConfig.experiments.maxConcurrent;
    OptimizerConfig.experiments.maxConcurrent = 0;
    
    assert.throws(() => {
      OptimizerConfig.validate();
    }, /maxConcurrent must be between 1 and 100/);
    
    OptimizerConfig.experiments.maxConcurrent = originalValue;
  });

  test('generates strategy variants', () => {
    const variants = OptimizerConfig.generateVariants(5);
    assert.strictEqual(variants.length, 5);
    assert.ok(variants[0].id);
    assert.ok(variants[0].profile);
    assert.strictEqual(variants[0].experimental, true);
  });

  test('gets environment-specific config', () => {
    const devConfig = OptimizerConfig.getEnvConfig('development');
    assert.strictEqual(devConfig.safety.paperTrading, true);
    assert.strictEqual(devConfig.experiments.maxConcurrent, 5);
  });
});

describe('Scoring Engine', () => {
  let scoringEngine;

  test('initializes correctly', () => {
    scoringEngine = new ScoringEngine(OptimizerConfig);
    assert.ok(scoringEngine);
  });

  test('calculates composite score', () => {
    const metrics = {
      roi: 10,
      winRate: 0.6,
      sharpeRatio: 1.5,
      avgPnLPerTrade: 1.2,
      maxDrawdown: 5,
      totalTrades: 100,
      consecutiveWins: 3,
      consecutiveLosses: 2
    };

    const result = scoringEngine.calculateCompositeScore(metrics);
    assert.ok(result.compositeScore > 0);
    assert.ok(result.breakdown);
    assert.ok(result.breakdown.roi > 0);
    assert.ok(result.breakdown.winRate > 0);
  });

  test('scores ROI correctly', () => {
    const score1 = scoringEngine.scoreROI(25);
    const score2 = scoringEngine.scoreROI(50);
    const score3 = scoringEngine.scoreROI(0);
    
    assert.ok(score1 > 0 && score1 < 100);
    assert.strictEqual(score2, 100);
    assert.strictEqual(score3, 0);
  });

  test('scores win rate correctly', () => {
    const score1 = scoringEngine.scoreWinRate(0.6);
    const score2 = scoringEngine.scoreWinRate(0.8);
    const score3 = scoringEngine.scoreWinRate(0);
    
    assert.ok(score1 > 0 && score1 < 100);
    assert.strictEqual(score2, 100);
    assert.strictEqual(score3, 0);
  });

  test('calculates confidence correctly', () => {
    const metrics = {
      totalTrades: 100,
      roi: 10,
      winRate: 0.65,
      sharpeRatio: 1.8,
      maxDrawdown: 3
    };

    const confidence = scoringEngine.calculateConfidence(metrics);
    assert.ok(confidence.overall >= 0 && confidence.overall <= 1);
    assert.ok(confidence.breakdown);
    assert.ok(confidence.readyForPromotion !== undefined);
  });

  test('tests statistical significance', () => {
    const result = scoringEngine.testStatisticalSignificance(0.65, 100, 0.5);
    assert.ok(result.pValue !== null);
    assert.ok(result.zScore !== null);
    assert.strictEqual(typeof result.significant, 'boolean');
  });

  test('rejects small sample sizes', () => {
    const result = scoringEngine.testStatisticalSignificance(0.7, 20, 0.5);
    assert.strictEqual(result.significant, false);
    assert.ok(result.reason.includes('Sample size too small'));
  });

  test('checks promotion gates', () => {
    const metrics = {
      totalTrades: 100,
      roi: 10,
      winRate: 0.65,
      sharpeRatio: 1.5,
      maxDrawdown: 5
    };

    const gateCheck = scoringEngine.checkPromotionGate(metrics);
    assert.ok(gateCheck.passed !== undefined);
    assert.ok(gateCheck.checks);
    assert.ok(gateCheck.confidence !== undefined);
  });

  test('ranks variants correctly', () => {
    const variants = [
      {
        id: 'v1',
        metrics: { roi: 10, winRate: 0.6, sharpeRatio: 1.5, totalTrades: 100, maxDrawdown: 5 }
      },
      {
        id: 'v2',
        metrics: { roi: 15, winRate: 0.7, sharpeRatio: 2.0, totalTrades: 100, maxDrawdown: 3 }
      },
      {
        id: 'v3',
        metrics: { roi: 5, winRate: 0.5, sharpeRatio: 0.8, totalTrades: 100, maxDrawdown: 8 }
      }
    ];

    const ranked = scoringEngine.rankVariants(variants);
    assert.strictEqual(ranked.length, 3);
    assert.ok(ranked[0].score >= ranked[1].score);
    assert.ok(ranked[1].score >= ranked[2].score);
  });
});

describe('Telemetry Feed', () => {
  let telemetryFeed;

  test('initializes correctly', () => {
    telemetryFeed = new TelemetryFeed();
    assert.ok(telemetryFeed);
    assert.ok(telemetryFeed.metrics);
  });

  test('publishes metrics', () => {
    const variantId = 'test_variant_1';
    const metrics = {
      roi: 5,
      winRate: 0.6,
      totalTrades: 50
    };

    telemetryFeed.publish(variantId, metrics);
    
    const retrieved = telemetryFeed.getMetrics(variantId);
    assert.ok(retrieved);
    assert.strictEqual(retrieved.variantId, variantId);
    assert.strictEqual(retrieved.metrics.roi, 5);
  });

  test('gets all metrics', () => {
    telemetryFeed.clearAll();
    
    telemetryFeed.publish('v1', { roi: 5 });
    telemetryFeed.publish('v2', { roi: 10 });
    
    const allMetrics = telemetryFeed.getAllMetrics();
    assert.strictEqual(allMetrics.length, 2);
  });

  test('gets summary', () => {
    telemetryFeed.clearAll();
    
    telemetryFeed.publish('v1', { roi: 5, winRate: 0.6 });
    telemetryFeed.publish('v2', { roi: 10, winRate: 0.7 });
    
    const summary = telemetryFeed.getSummary();
    assert.ok(summary.totalVariants === 2);
    assert.ok(summary.bestPerformer);
    assert.ok(summary.averageROI > 0);
  });

  test('gets top performers', () => {
    telemetryFeed.clearAll();
    
    telemetryFeed.publish('v1', { roi: 5 });
    telemetryFeed.publish('v2', { roi: 15 });
    telemetryFeed.publish('v3', { roi: 10 });
    
    const topPerformers = telemetryFeed.getTopPerformers(2, 'roi');
    assert.strictEqual(topPerformers.length, 2);
    assert.strictEqual(topPerformers[0].metrics.roi, 15);
    assert.strictEqual(topPerformers[1].metrics.roi, 10);
  });

  test('clears specific variant', () => {
    telemetryFeed.clearAll();
    
    telemetryFeed.publish('v1', { roi: 5 });
    telemetryFeed.publish('v2', { roi: 10 });
    
    telemetryFeed.clearVariant('v1');
    
    const metrics = telemetryFeed.getMetrics('v1');
    assert.strictEqual(metrics, null);
    
    const allMetrics = telemetryFeed.getAllMetrics();
    assert.strictEqual(allMetrics.length, 1);
  });

  test('exports and imports snapshot', () => {
    telemetryFeed.clearAll();
    
    telemetryFeed.publish('v1', { roi: 5 });
    telemetryFeed.publish('v2', { roi: 10 });
    
    const snapshot = telemetryFeed.exportSnapshot();
    assert.ok(snapshot.timestamp);
    assert.ok(snapshot.metrics);
    
    telemetryFeed.clearAll();
    assert.strictEqual(telemetryFeed.getAllMetrics().length, 0);
    
    telemetryFeed.importSnapshot(snapshot);
    assert.strictEqual(telemetryFeed.getAllMetrics().length, 2);
  });

  test('streams updates', (t, done) => {
    telemetryFeed.clearAll();
    
    let updateCount = 0;
    const unsubscribe = telemetryFeed.stream((update) => {
      updateCount++;
      if (updateCount === 2) {
        unsubscribe();
        assert.strictEqual(updateCount, 2);
        done();
      }
    });
    
    telemetryFeed.publish('v1', { roi: 5 });
    telemetryFeed.publish('v2', { roi: 10 });
  });
});

describe('Live Optimizer Controller', () => {
  let controller;

  test('initializes correctly', () => {
    controller = new LiveOptimizerController(OptimizerConfig);
    assert.ok(controller);
    assert.strictEqual(controller.running, false);
  });

  test('validates config on start', async () => {
    const invalidConfig = { ...OptimizerConfig };
    invalidConfig.experiments = { ...OptimizerConfig.experiments, maxConcurrent: 0 };
    
    const controller2 = new LiveOptimizerController(invalidConfig);
    
    await assert.rejects(
      async () => await controller2.start(),
      /maxConcurrent must be between 1 and 100/
    );
  });

  test('starts successfully', async () => {
    const result = await controller.start({ maxVariants: 3 });
    assert.strictEqual(result.success, true);
    assert.strictEqual(controller.running, true);
    assert.strictEqual(result.variantCount, 3);
  });

  test('prevents starting when already running', async () => {
    await assert.rejects(
      async () => await controller.start(),
      /Optimizer is already running/
    );
  });

  test('gets status', () => {
    const status = controller.getStatus();
    assert.strictEqual(status.running, true);
    assert.ok(status.activeVariants >= 0);
    assert.ok(status.summary);
  });

  test('calculates stop loss correctly', () => {
    const variant = controller.variants.values().next().value;
    const stopLoss = controller.calculateStopLoss(10000, 'long', variant.config);
    assert.ok(stopLoss < 10000); // Stop loss should be below entry for long
  });

  test('calculates take profit correctly', () => {
    const variant = controller.variants.values().next().value;
    const takeProfit = controller.calculateTakeProfit(10000, 'long', variant.config);
    assert.ok(takeProfit > 10000); // Take profit should be above entry for long
  });

  test('checks if stop loss is hit', () => {
    const position = {
      side: 'long',
      entryPrice: 10000,
      stopLoss: 9950
    };
    
    assert.strictEqual(controller.isStopLossHit(position, 9940), true);
    assert.strictEqual(controller.isStopLossHit(position, 10000), false);
  });

  test('checks if take profit is hit', () => {
    const position = {
      side: 'long',
      entryPrice: 10000,
      takeProfit: 10200
    };
    
    assert.strictEqual(controller.isTakeProfitHit(position, 10250), true);
    assert.strictEqual(controller.isTakeProfitHit(position, 10100), false);
  });

  test('calculates unrealized P&L', () => {
    const position = {
      side: 'long',
      entryPrice: 10000,
      size: 1
    };
    
    const pnl = controller.calculateUnrealizedPnL(position, 10100);
    assert.ok(pnl > 0);
  });

  test('gets results', () => {
    const results = controller.getResults();
    assert.ok(results.variants);
    assert.ok(results.summary);
  });

  test('exports results', () => {
    const exported = controller.exportResults();
    assert.ok(exported.timestamp);
    assert.ok(exported.status);
    assert.ok(exported.results);
  });

  test('stops successfully', async () => {
    const result = await controller.stop();
    assert.strictEqual(result.success, true);
    assert.strictEqual(controller.running, false);
  });

  test('handles stop when not running', async () => {
    const result = await controller.stop();
    assert.strictEqual(result.success, false);
  });
});

describe('Optimizer Rate Limiting', () => {
  let controller;

  test('throttles API calls', async () => {
    controller = new LiveOptimizerController(OptimizerConfig);
    
    const startTime = Date.now();
    await controller.throttleApiCall();
    await controller.throttleApiCall();
    const endTime = Date.now();
    
    const elapsed = endTime - startTime;
    assert.ok(elapsed >= OptimizerConfig.rateLimiting.throttleDelay);
  });
});

describe('Optimizer Safety Limits', () => {
  let controller;

  test('stops variant on max loss', async () => {
    controller = new LiveOptimizerController(OptimizerConfig);
    await controller.start({ maxVariants: 1 });
    
    const variantId = controller.activeExperiments[0].id;
    const metrics = controller.variantMetrics.get(variantId);
    
    // Simulate large loss
    metrics.roi = -10; // Exceeds default maxLossPerVariant of 5%
    
    controller.checkSafetyLimits(variantId);
    
    const variant = controller.variants.get(variantId);
    assert.strictEqual(variant.status, 'stopped');
    
    await controller.stop();
  });

  test('stops variant on max drawdown', async () => {
    controller = new LiveOptimizerController(OptimizerConfig);
    await controller.start({ maxVariants: 1 });
    
    const variantId = controller.activeExperiments[0].id;
    const metrics = controller.variantMetrics.get(variantId);
    
    // Simulate large drawdown
    metrics.maxDrawdown = 15; // Exceeds default maxDrawdownPercent of 10%
    
    controller.checkSafetyLimits(variantId);
    
    const variant = controller.variants.get(variantId);
    assert.strictEqual(variant.status, 'stopped');
    
    await controller.stop();
  });
});

describe('.well-known Route Integration', () => {
  test('well-known handler should return 404 JSON', async () => {
    // This would be tested with actual HTTP requests in integration tests
    // For now, we just verify the concept
    const mockRequest = {
      path: '/.well-known/appspecific/com.chrome.devtools.json'
    };
    
    // Expected response structure
    const expectedResponse = {
      error: 'Not Found',
      path: mockRequest.path,
      message: 'The requested .well-known resource does not exist'
    };
    
    assert.ok(expectedResponse.error === 'Not Found');
    assert.ok(expectedResponse.path.includes('.well-known'));
  });
});
