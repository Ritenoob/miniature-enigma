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
        fc.float({ min: 100, max: 100000, noNaN: true }),  // entry price
        fc.float({ min: Math.fround(0.1), max: 50, noNaN: true }),      // ROI risk
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
        fc.double({ min: 100, max: 100000, noNaN: true }),
        fc.double({ min: 0.1, max: 50, noNaN: true }),
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
        fc.double({ min: 1000, max: 100000, noNaN: true }),
        fc.integer({ min: 2, max: 50 }),
        fc.double({ min: 0.1, max: 2, noNaN: true }),
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
        fc.double({ min: 0.0001, max: 0.01, noNaN: true }),  // entry fee
        fc.double({ min: 0.0001, max: 0.01, noNaN: true }),  // exit fee
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
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: -100, max: 100, noNaN: true }),
        fc.double({ min: 0.01, max: 10, noNaN: true }),
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
        fc.double({ min: 100, max: 100000, noNaN: true }),
        fc.integer({ min: 1, max: 10 }),
        fc.double({ min: 0.01, max: 1, noNaN: true }),
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
        fc.double({ min: 100, max: 1000000, noNaN: true }),
        fc.double({ min: 0.1, max: 100, noNaN: true }),
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
        fc.double({ min: -10000, max: 10000, noNaN: true }),  // gross PnL
        fc.double({ min: 100, max: 100000, noNaN: true }),     // position value
        fc.double({ min: 0.0001, max: 0.01, noNaN: true }),    // entry fee
        fc.double({ min: 0.0001, max: 0.01, noNaN: true }),    // exit fee
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
        fc.double({ min: 100, max: 100000, noNaN: true }),
        fc.double({ min: 0.01, max: 2, noNaN: true }),
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
        fc.double({ min: 1, max: 100000, noNaN: true }),
        fc.double({ min: 0.01, max: 10, noNaN: true }),
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
        fc.double({ min: 100, max: 10000, noNaN: true }),  // entry
        fc.double({ min: 100, max: 10000, noNaN: true }),  // current
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
});
