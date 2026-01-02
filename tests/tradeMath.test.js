process.env.DEMO_MODE = 'true';
process.env.RUN_INTERVALS = 'false';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { TradeMath } = require('../server');

describe('TradeMath core formulas', () => {
  test('calculates position sizing using account percentage and leverage', () => {
    const marginUsed = TradeMath.calculateMarginUsed(10000, 0.5);
    assert.strictEqual(marginUsed, 50);

    const positionValue = TradeMath.calculatePositionValue(marginUsed, 10);
    assert.strictEqual(positionValue, 500);
  });

  test('derives leveraged ROI from price change', () => {
    const priceDiff = TradeMath.calculatePriceDiff('long', 100, 102);
    const unrealized = TradeMath.calculateUnrealizedPnl(priceDiff, 2);
    const roi = TradeMath.calculateLeveragedPnlPercent(unrealized, 50);
    assert.strictEqual(unrealized, 4);
    assert.strictEqual(roi, 8);
  });

  test('adds fee-adjusted break-even buffer', () => {
    const breakEven = TradeMath.calculateFeeAdjustedBreakEven(0.0006, 0.0006, 10, 0.1);
    assert.strictEqual(breakEven, 1.3);
  });

  test('computes ROI-based stop loss and take profit prices', () => {
    const sl = TradeMath.calculateStopLossPrice('long', 100, 0.5, 10);
    const tp = TradeMath.calculateTakeProfitPrice('long', 100, 2, 10);
    assert.strictEqual(sl, 99.95);
    assert.strictEqual(tp, 100.2);
  });

  test('calculates liquidation price with maintenance margin', () => {
    const liq = TradeMath.calculateLiquidationPrice('long', 10000, 10, 0.5);
    assert.strictEqual(Number(liq.toFixed(0)), 8995);
  });

  test('applies slippage buffer to stop orders', () => {
    const adjusted = TradeMath.calculateSlippageAdjustedStop('long', 100, 0.02);
    assert.strictEqual(adjusted, 99.98);
  });

  test('derives auto-leverage recommendation from ATR%', () => {
    const leverage = TradeMath.calculateAutoLeverage(0.7, 1.5);
    assert.strictEqual(leverage, 38);
  });
});
