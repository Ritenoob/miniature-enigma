// IMPORTANT: When using fc.float(), wrap all min/max values with Math.fround()
// Example: fc.float({ min: Math.fround(0.1), max: Math.fround(100) })

process.env.DEMO_MODE = 'true';
process.env.RUN_INTERVALS = 'false';

const fc = require('fast-check');
const { test, describe } = require('node:test');
const assert = require('node:assert');
const DecimalMath = require('../src/lib/DecimalMath');

describe('TradeMath Property-Based Tests', () => {
  
  test('SL price is always less than entry for longs, more for shorts', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 100, max: 100000, noNaN: true }),  // entry price
        fc.double({ min: 0.1, max: 50, noNaN: true }),      // ROI risk
        fc.integer({ min: 1, max: 100 }),                  // leverage
        (entry, roi, leverage) => {
          const longSL = DecimalMath.calculateStopLossPrice('long', entry, roi, leverage);
          const shortSL = DecimalMath.calculateStopLossPrice('short', entry, roi, leverage);
          
          return longSL < entry && shortSL > entry;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('TP price is always more than entry for longs, less for shorts', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(100), max: Math.fround(100000), noNaN: true }),
        fc.float({ min: Math.fround(0.1), max: Math.fround(50), noNaN: true }),
        fc.integer({ min: 1, max: 100 }),
        (entry, roi, leverage) => {
          const longTP = DecimalMath.calculateTakeProfitPrice('long', entry, roi, leverage);
          const shortTP = DecimalMath.calculateTakeProfitPrice('short', entry, roi, leverage);
          
          return longTP > entry && shortTP < entry;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Liquidation price is always beyond SL for proper risk', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(1000), max: Math.fround(100000), noNaN: true }),
        fc.integer({ min: 2, max: 50 }),
        fc.float({ min: Math.fround(0.1), max: Math.fround(2), noNaN: true }),
        (entry, leverage, maintMargin) => {
          const longLiq = DecimalMath.calculateLiquidationPrice('long', entry, leverage, maintMargin);
          const longSL = DecimalMath.calculateStopLossPrice('long', entry, 50, leverage); // 50% ROI SL
          
          // Liquidation should be beyond any reasonable SL
          return longLiq < longSL;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Fee-adjusted break-even increases with leverage', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(0.0001), max: Math.fround(0.01), noNaN: true }),  // entry fee
        fc.float({ min: Math.fround(0.0001), max: Math.fround(0.01), noNaN: true }),  // exit fee
        fc.integer({ min: 1, max: 99 }),                    // leverage
        (entryFee, exitFee, leverage) => {
          const be1 = DecimalMath.calculateFeeAdjustedBreakEven(entryFee, exitFee, leverage, 0);
          const be2 = DecimalMath.calculateFeeAdjustedBreakEven(entryFee, exitFee, leverage + 1, 0);
          
          return be2 > be1;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Trailing steps is always non-negative', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(-100), max: Math.fround(100), noNaN: true }),
        fc.float({ min: Math.fround(-100), max: Math.fround(100), noNaN: true }),
        fc.float({ min: Math.fround(0.01), max: Math.fround(10), noNaN: true }),
        (currentROI, lastROI, step) => {
          const steps = DecimalMath.calculateTrailingSteps(currentROI, lastROI, step);
          return steps >= 0;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Trailed SL moves in correct direction', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(100), max: Math.fround(100000), noNaN: true }),
        fc.integer({ min: 1, max: 10 }),
        fc.float({ min: Math.fround(0.01), max: Math.fround(1), noNaN: true }),
        (currentSL, steps, movePercent) => {
          const longNewSL = DecimalMath.calculateTrailedStopLoss('long', currentSL, steps, movePercent);
          const shortNewSL = DecimalMath.calculateTrailedStopLoss('short', currentSL, steps, movePercent);
          
          return longNewSL >= currentSL && shortNewSL <= currentSL;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Position value equals margin times leverage', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(100), max: Math.fround(1000000), noNaN: true }),
        fc.float({ min: Math.fround(0.1), max: Math.fround(100), noNaN: true }),
        fc.integer({ min: 1, max: 100 }),
        (balance, percent, leverage) => {
          const margin = DecimalMath.calculateMarginUsed(balance, percent);
          const value = DecimalMath.calculatePositionValue(margin, leverage);
          
          // Account for floating point with decimal.js (should be exact)
          return Math.abs(value - margin * leverage) < 0.0001;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Net PnL is always less than or equal to gross PnL (fees are non-negative)', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(-10000), max: Math.fround(10000), noNaN: true }),  // gross PnL
        fc.float({ min: Math.fround(100), max: Math.fround(100000), noNaN: true }),     // position value
        fc.float({ min: Math.fround(0.0001), max: Math.fround(0.01), noNaN: true }),    // entry fee
        fc.float({ min: Math.fround(0.0001), max: Math.fround(0.01), noNaN: true }),    // exit fee
        (gross, posValue, entryFee, exitFee) => {
          const net = DecimalMath.calculateNetPnl(gross, posValue, entryFee, exitFee, 0);
          return net <= gross;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Slippage-adjusted stop widens the stop distance', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(100), max: Math.fround(100000), noNaN: true }),
        fc.float({ min: Math.fround(0.01), max: Math.fround(2), noNaN: true }),
        (stopPrice, slippage) => {
          const longAdjusted = DecimalMath.calculateSlippageAdjustedStop('long', stopPrice, slippage);
          const shortAdjusted = DecimalMath.calculateSlippageAdjustedStop('short', stopPrice, slippage);
          
          // Slippage should make longs lower and shorts higher
          return longAdjusted < stopPrice && shortAdjusted > stopPrice;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Round to tick size produces values divisible by tick size', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(1), max: Math.fround(100000), noNaN: true }),
        fc.float({ min: Math.fround(0.01), max: Math.fround(10), noNaN: true }),
        (price, tickSize) => {
          const rounded = DecimalMath.roundToTickSize(price, tickSize);
          const ratio = rounded / tickSize;
          
          // Should be within floating point precision of an integer
          return Math.abs(ratio - Math.round(ratio)) < 0.0001;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Unrealized PnL has correct sign based on price movement', () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }),  // entry
        fc.float({ min: Math.fround(100), max: Math.fround(10000), noNaN: true }),  // current
        fc.integer({ min: 1, max: 1000 }),                // size
        (entry, current, size) => {
          const longDiff = DecimalMath.calculatePriceDiff('long', entry, current);
          const shortDiff = DecimalMath.calculatePriceDiff('short', entry, current);
          const longPnl = DecimalMath.calculateUnrealizedPnl(longDiff, size, 1);
          const shortPnl = DecimalMath.calculateUnrealizedPnl(shortDiff, size, 1);
          
          if (current > entry) {
            return longPnl > 0 && shortPnl < 0;
          } else if (current < entry) {
            return longPnl < 0 && shortPnl > 0;
          } else {
            return longPnl === 0 && shortPnl === 0;
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Stop Monotonic Property: LONG SL only increases (never decreases)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 100, max: 100000, noNaN: true }),  // current SL
        fc.integer({ min: 1, max: 10 }),                    // steps
        fc.double({ min: 0.01, max: 1, noNaN: true }),     // move percent
        (currentSL, steps, movePercent) => {
          const newSL = DecimalMath.calculateTrailedStopLoss('long', currentSL, steps, movePercent);
          
          // For LONG: new SL must be >= current SL (monotonic non-decreasing)
          return newSL >= currentSL;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Stop Monotonic Property: SHORT SL only decreases (never increases)', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 100, max: 100000, noNaN: true }),  // current SL
        fc.integer({ min: 1, max: 10 }),                    // steps
        fc.double({ min: 0.01, max: 1, noNaN: true }),     // move percent
        (currentSL, steps, movePercent) => {
          const newSL = DecimalMath.calculateTrailedStopLoss('short', currentSL, steps, movePercent);
          
          // For SHORT: new SL must be <= current SL (monotonic non-increasing)
          return newSL <= currentSL;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Break-Even Fee Coverage Property: cannot trigger before fees covered', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.0001, max: 0.01, noNaN: true }),  // entry fee
        fc.double({ min: 0.0001, max: 0.01, noNaN: true }),  // exit fee
        fc.integer({ min: 1, max: 100 }),                    // leverage
        fc.double({ min: 0, max: 1, noNaN: true }),          // buffer
        (entryFee, exitFee, leverage, buffer) => {
          const breakEvenROI = DecimalMath.calculateFeeAdjustedBreakEven(
            entryFee, 
            exitFee, 
            leverage, 
            buffer
          );
          
          // Break-even ROI must be >= fees * leverage * 100
          const minRequiredROI = (entryFee + exitFee) * leverage * 100;
          
          // Use small epsilon for floating point comparison
          return breakEvenROI >= minRequiredROI - 0.000001;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Break-Even with buffer prevents premature trigger', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.0001, max: 0.01, noNaN: true }),  // entry fee
        fc.double({ min: 0.0001, max: 0.01, noNaN: true }),  // exit fee
        fc.integer({ min: 1, max: 100 }),                    // leverage
        fc.double({ min: 0.1, max: 1, noNaN: true }),        // buffer (positive)
        (entryFee, exitFee, leverage, buffer) => {
          const breakEvenWithBuffer = DecimalMath.calculateFeeAdjustedBreakEven(
            entryFee, 
            exitFee, 
            leverage, 
            buffer
          );
          
          const breakEvenNoBuffer = DecimalMath.calculateFeeAdjustedBreakEven(
            entryFee, 
            exitFee, 
            leverage, 
            0
          );
          
          // With buffer should always be higher than without
          return breakEvenWithBuffer > breakEvenNoBuffer;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Trailing steps calculation is deterministic and repeatable', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0.1, max: 10, noNaN: true }),
        (currentROI, lastROI, stepPercent) => {
          const steps1 = DecimalMath.calculateTrailingSteps(currentROI, lastROI, stepPercent);
          const steps2 = DecimalMath.calculateTrailingSteps(currentROI, lastROI, stepPercent);
          
          // Must be deterministic
          return steps1 === steps2;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Stop loss never crosses entry price in wrong direction', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 100, max: 100000, noNaN: true }),  // entry price
        fc.double({ min: 0.1, max: 50, noNaN: true }),      // ROI risk
        fc.integer({ min: 1, max: 100 }),                   // leverage
        (entry, roiRisk, leverage) => {
          const longSL = DecimalMath.calculateStopLossPrice('long', entry, roiRisk, leverage);
          const shortSL = DecimalMath.calculateStopLossPrice('short', entry, roiRisk, leverage);
          
          // LONG SL must always be below entry
          // SHORT SL must always be above entry
          return longSL < entry && shortSL > entry;
        }
      ),
      { numRuns: 100 }
    );
  });

  test('Take profit never crosses entry price in wrong direction', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 100, max: 100000, noNaN: true }),  // entry price
        fc.double({ min: 0.1, max: 50, noNaN: true }),      // ROI reward
        fc.integer({ min: 1, max: 100 }),                   // leverage
        (entry, roiReward, leverage) => {
          const longTP = DecimalMath.calculateTakeProfitPrice('long', entry, roiReward, leverage);
          const shortTP = DecimalMath.calculateTakeProfitPrice('short', entry, roiReward, leverage);
          
          // LONG TP must always be above entry
          // SHORT TP must always be below entry
          return longTP > entry && shortTP < entry;
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ============================================================================
// Integration Tests for API Failure Handling
// ============================================================================
describe('StopReplaceCoordinator Integration Tests', () => {
  const StopReplaceCoordinator = require('../src/lib/StopReplaceCoordinator');

  test('Integration: Handles API 429 rate limiting and recovers', async () => {
    let attempts = 0;
    const mockApi = {
      placeStopOrder: async (params) => {
        attempts++;
        if (attempts <= 2) {
          const error = new Error('Too Many Requests');
          error.code = 429;
          throw error;
        }
        return { data: { orderId: 'recovered_order' } };
      }
    };
    
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const coordinator = new StopReplaceCoordinator(mockApi, mockLog, mockAlert);
    coordinator.baseDelay = 10; // Speed up test
    
    const stopParams = {
      side: 'sell',
      symbol: 'XBTUSDTM',
      type: 'market',
      stop: 'down',
      stopPrice: '50000',
      stopPriceType: 'TP',
      size: '1',
      reduceOnly: true
    };
    
    const result = await coordinator.replaceStopOrder('XBTUSDTM', stopParams);
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(attempts, 3);
    assert.strictEqual(result.orderId, 'recovered_order');
  });

  test('Integration: Temporary failure recovery with retry queue', async () => {
    let attempts = 0;
    let failureCount = 3;
    
    const mockApi = {
      placeStopOrder: async (params) => {
        attempts++;
        if (attempts <= failureCount) {
          throw new Error('Temporary network failure');
        }
        return { data: { orderId: `order_${attempts}` } };
      }
    };
    
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const coordinator = new StopReplaceCoordinator(mockApi, mockLog, mockAlert);
    coordinator.baseDelay = 10; // Speed up test
    
    const stopParams = {
      side: 'buy',
      symbol: 'ETHUSDTM',
      type: 'market',
      stop: 'up',
      stopPrice: '3000',
      stopPriceType: 'TP',
      size: '10',
      reduceOnly: true
    };
    
    const result = await coordinator.replaceStopOrder('ETHUSDTM', stopParams);
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(attempts, failureCount + 1);
    assert.ok(result.orderId.startsWith('order_'));
  });

  test('Integration: Emergency close triggered after max retries protects position', async () => {
    let stopAttempts = 0;
    let emergencyExecuted = false;
    
    const mockApi = {
      placeStopOrder: async (params) => {
        stopAttempts++;
        throw new Error('Persistent API failure');
      },
      placeOrder: async (params) => {
        emergencyExecuted = true;
        // Verify emergency order properties
        assert.strictEqual(params.type, 'market');
        assert.strictEqual(params.reduceOnly, true);
        return { data: { orderId: 'emergency_protective_order' } };
      }
    };
    
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const coordinator = new StopReplaceCoordinator(mockApi, mockLog, mockAlert);
    coordinator.baseDelay = 5;
    coordinator.maxRetries = 3; // Reduce for faster test
    
    const stopParams = {
      side: 'sell',
      symbol: 'XBTUSDTM',
      type: 'market',
      stop: 'down',
      stopPrice: '50000',
      stopPriceType: 'TP',
      size: '1',
      reduceOnly: true
    };
    
    try {
      await coordinator.replaceStopOrder('XBTUSDTM', stopParams);
      assert.fail('Should have thrown error after emergency close');
    } catch (error) {
      assert.ok(error.message.includes('emergency close executed'));
      assert.strictEqual(emergencyExecuted, true);
      assert.ok(stopAttempts > coordinator.maxRetries);
    }
  });

  test('Integration: Retry queue protects position during concurrent updates', async () => {
    let orderCounter = 0;
    const mockApi = {
      placeStopOrder: async (params) => {
        // Simulate realistic API delay
        await new Promise(resolve => setTimeout(resolve, 30));
        orderCounter++;
        return { data: { orderId: `order_${orderCounter}_${params.stopPrice}` } };
      }
    };
    
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const coordinator = new StopReplaceCoordinator(mockApi, mockLog, mockAlert);
    
    // Fire off 3 concurrent stop updates
    const promises = [];
    for (let i = 1; i <= 3; i++) {
      const stopParams = {
        side: 'sell',
        symbol: 'XBTUSDTM',
        type: 'market',
        stop: 'down',
        stopPrice: `${50000 + i * 100}`,
        stopPriceType: 'TP',
        size: '1',
        reduceOnly: true
      };
      promises.push(coordinator.replaceStopOrder('XBTUSDTM', stopParams));
    }
    
    const results = await Promise.all(promises);
    
    // All should succeed
    results.forEach(result => {
      assert.strictEqual(result.success, true);
    });
    
    // Orders should be placed sequentially
    assert.strictEqual(orderCounter, 3);
    
    // Final order should be the last requested
    assert.ok(coordinator.currentOrderId.includes('50300'));
  });
});
