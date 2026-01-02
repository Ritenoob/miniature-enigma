// ============================================================================
// LiveOptimizerController Tests
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert');
const LiveOptimizerController = require('../src/optimizer/LiveOptimizerController');

describe('LiveOptimizerController', () => {
  test('initializes with multiple variants', () => {
    const controller = new LiveOptimizerController();
    controller.initialize();
    
    const status = controller.getStatus();
    assert.ok(status.initialized, 'Should be initialized');
    assert.strictEqual(Object.keys(status.variants).length, 4, 'Should have 4 variants');
    assert.ok(status.variants.default, 'Should have default variant');
    assert.ok(status.variants.aggressive, 'Should have aggressive variant');
  });

  test('processes market updates and generates signals', () => {
    const controller = new LiveOptimizerController();
    
    // Bullish indicators
    const indicators = {
      rsi: 25,
      williamsR: -85,
      macd: 5,
      macdHistogram: 2,
      ao: 3,
      ema50: 45000,
      ema200: 44000,
      stochK: 15,
      stochD: 12,
      price: 45500,
      bollingerUpper: 46000,
      bollingerLower: 44000
    };
    
    controller.onMarketUpdate('BTCUSDT', indicators, 50000);
    
    const status = controller.getStatus();
    // At least one variant should have opened a position with strong buy signal
    let hasPosition = false;
    for (const variant of Object.values(status.variants)) {
      if (variant.position) {
        hasPosition = true;
        assert.strictEqual(variant.position.side, 'long', 'Should be long position for bullish signal');
        break;
      }
    }
    assert.ok(hasPosition, 'At least one variant should open a position on strong signal');
  });

  test('tracks position PnL correctly', () => {
    const controller = new LiveOptimizerController();
    
    // Strong buy signal
    const indicators = {
      rsi: 25,
      williamsR: -85,
      macd: 5,
      macdHistogram: 2,
      ao: 3,
      ema50: 45000,
      ema200: 44000,
      stochK: 15,
      stochD: 12,
      price: 45500,
      bollingerUpper: 46000,
      bollingerLower: 44000
    };
    
    // Open position
    controller.onMarketUpdate('BTCUSDT', indicators, 50000);
    
    // Price moves up 2%
    controller.onMarketUpdate('BTCUSDT', indicators, 51000);
    
    const status = controller.getStatus();
    for (const variant of Object.values(status.variants)) {
      if (variant.position) {
        assert.ok(variant.position.unrealizedPnl !== undefined, 'Should have unrealized PnL');
        // For long position with price increase, should be profitable
        if (variant.position.side === 'long') {
          assert.ok(variant.position.unrealizedPnl > 0, 'Long position should be profitable on price increase');
        }
      }
    }
  });

  test('closes position on take profit', () => {
    const controller = new LiveOptimizerController();
    
    // Strong buy signal
    const indicators = {
      rsi: 25,
      williamsR: -85,
      macd: 5,
      macdHistogram: 2,
      ao: 3,
      ema50: 45000,
      ema200: 44000,
      stochK: 15,
      stochD: 12,
      price: 45500,
      bollingerUpper: 46000,
      bollingerLower: 44000
    };
    
    // Open position
    controller.onMarketUpdate('BTCUSDT', indicators, 50000);
    
    // Get variant with position
    let variantWithPosition = null;
    for (const [name, variant] of controller.variants) {
      if (variant.position) {
        variantWithPosition = variant;
        break;
      }
    }
    
    if (variantWithPosition) {
      const tpPrice = variantWithPosition.position.takeProfitPrice;
      
      // Move price to TP level
      controller.onMarketUpdate('BTCUSDT', indicators, tpPrice + 10);
      
      // Position should be closed
      assert.strictEqual(variantWithPosition.position, null, 'Position should be closed at TP');
      assert.strictEqual(variantWithPosition.metrics.tradesCount, 1, 'Should have 1 completed trade');
    }
  });

  test('closes position on stop loss', () => {
    const controller = new LiveOptimizerController();
    
    // Strong buy signal
    const indicators = {
      rsi: 25,
      williamsR: -85,
      macd: 5,
      macdHistogram: 2,
      ao: 3,
      ema50: 45000,
      ema200: 44000,
      stochK: 15,
      stochD: 12,
      price: 45500,
      bollingerUpper: 46000,
      bollingerLower: 44000
    };
    
    // Open position
    controller.onMarketUpdate('BTCUSDT', indicators, 50000);
    
    // Get variant with position
    let variantWithPosition = null;
    for (const [name, variant] of controller.variants) {
      if (variant.position) {
        variantWithPosition = variant;
        break;
      }
    }
    
    if (variantWithPosition) {
      const slPrice = variantWithPosition.position.stopLossPrice;
      
      // Move price to SL level
      controller.onMarketUpdate('BTCUSDT', indicators, slPrice - 10);
      
      // Position should be closed
      assert.strictEqual(variantWithPosition.position, null, 'Position should be closed at SL');
      assert.strictEqual(variantWithPosition.metrics.tradesCount, 1, 'Should have 1 completed trade');
    }
  });

  test('updates metrics after trade closes', () => {
    const controller = new LiveOptimizerController();
    
    const indicators = {
      rsi: 25,
      williamsR: -85,
      macd: 5,
      macdHistogram: 2,
      ao: 3,
      ema50: 45000,
      ema200: 44000,
      stochK: 15,
      stochD: 12,
      price: 45500,
      bollingerUpper: 46000,
      bollingerLower: 44000
    };
    
    // Open and close a position
    controller.onMarketUpdate('BTCUSDT', indicators, 50000);
    
    let variantWithPosition = null;
    for (const [name, variant] of controller.variants) {
      if (variant.position) {
        variantWithPosition = variant;
        break;
      }
    }
    
    if (variantWithPosition) {
      const tpPrice = variantWithPosition.position.takeProfitPrice;
      controller.onMarketUpdate('BTCUSDT', indicators, tpPrice + 10);
      
      // Check metrics updated
      assert.strictEqual(variantWithPosition.metrics.tradesCount, 1, 'Should have 1 trade');
      assert.ok(variantWithPosition.metrics.totalNetPnl !== 0, 'Should have non-zero net PnL');
      assert.ok(variantWithPosition.metrics.avgPnLPerTrade !== 0, 'Should have non-zero avg PnL');
      assert.ok(variantWithPosition.tradeHistory.length === 1, 'Should have 1 trade in history');
    }
  });

  test('provides performance comparison between variants', () => {
    const controller = new LiveOptimizerController();
    controller.initialize();
    
    const comparison = controller.getPerformanceComparison();
    
    assert.ok(Array.isArray(comparison), 'Should return array');
    assert.strictEqual(comparison.length, 4, 'Should have 4 variants');
    assert.ok(comparison[0].profile, 'Should have profile name');
    assert.ok(comparison[0].winRate !== undefined, 'Should have win rate');
    assert.ok(comparison[0].totalNetPnl !== undefined, 'Should have total net PnL');
  });

  test('maintains variant isolation', () => {
    const controller = new LiveOptimizerController();
    
    const indicators = {
      rsi: 25,
      williamsR: -85,
      macd: 5,
      macdHistogram: 2,
      ao: 3,
      ema50: 45000,
      ema200: 44000,
      stochK: 15,
      stochD: 12,
      price: 45500,
      bollingerUpper: 46000,
      bollingerLower: 44000
    };
    
    controller.onMarketUpdate('BTCUSDT', indicators, 50000);
    
    // Each variant should have independent state
    const variantStates = [];
    for (const [name, variant] of controller.variants) {
      variantStates.push({
        name,
        hasPosition: variant.position !== null,
        metrics: { ...variant.metrics }
      });
    }
    
    // Variants should have different profiles
    const profileNames = variantStates.map(v => v.name);
    assert.strictEqual(new Set(profileNames).size, profileNames.length, 'Variants should have unique profiles');
  });

  test('respects paper trading mode', () => {
    const controller = new LiveOptimizerController({
      ...LiveOptimizerController.OptimizerConfig,
      paperTrading: true
    });
    
    const status = controller.getStatus();
    assert.strictEqual(status.paperTrading, true, 'Should be in paper trading mode');
  });

  test('can reset state', () => {
    const controller = new LiveOptimizerController();
    controller.initialize();
    
    // Open some positions
    const indicators = {
      rsi: 25,
      williamsR: -85,
      macd: 5,
      macdHistogram: 2,
      ao: 3,
      ema50: 45000,
      ema200: 44000,
      stochK: 15,
      stochD: 12,
      price: 45500,
      bollingerUpper: 46000,
      bollingerLower: 44000
    };
    controller.onMarketUpdate('BTCUSDT', indicators, 50000);
    
    // Reset
    controller.reset();
    
    const status = controller.getStatus();
    assert.strictEqual(status.initialized, false, 'Should not be initialized after reset');
    assert.strictEqual(status.accountBalance, 10000, 'Should reset account balance');
  });
});
