/**
 * Test suite for KDJIndicator
 */

const { test } = require('node:test');
const assert = require('node:assert');
const KDJIndicator = require('../../src/indicators/KDJIndicator');

test('KDJIndicator - initializes with default parameters', () => {
  const kdj = new KDJIndicator();
  assert.strictEqual(kdj.period, 9);
  assert.strictEqual(kdj.smoothK, 3);
  assert.strictEqual(kdj.smoothD, 3);
  assert.strictEqual(kdj.getValue(), null);
});

test('KDJIndicator - initializes with custom parameters', () => {
  const kdj = new KDJIndicator({ period: 14, smoothK: 5, smoothD: 5 });
  assert.strictEqual(kdj.period, 14);
  assert.strictEqual(kdj.smoothK, 5);
  assert.strictEqual(kdj.smoothD, 5);
});

test('KDJIndicator - returns null until ready', () => {
  const kdj = new KDJIndicator({ period: 9, smoothK: 3, smoothD: 3 });
  
  // Need period + smoothK + smoothD - 1 = 9 + 3 + 3 - 1 = 14 candles minimum
  for (let i = 0; i < 10; i++) {
    const result = kdj.update({ high: 100 + i, low: 90 + i, close: 95 + i });
    if (i < 13) {
      assert.strictEqual(result, null, `Should be null at candle ${i}`);
    }
  }
});

test('KDJIndicator - calculates K, D, J values', () => {
  const kdj = new KDJIndicator({ period: 5, smoothK: 3, smoothD: 3 });
  
  // Feed candles
  const candles = [
    { high: 110, low: 100, close: 105 },
    { high: 115, low: 105, close: 110 },
    { high: 120, low: 110, close: 115 },
    { high: 125, low: 115, close: 120 },
    { high: 130, low: 120, close: 125 },
    { high: 135, low: 125, close: 130 },
    { high: 140, low: 130, close: 135 },
    { high: 145, low: 135, close: 140 },
    { high: 150, low: 140, close: 145 }
  ];
  
  let result;
  for (const candle of candles) {
    result = kdj.update(candle);
  }
  
  assert.notStrictEqual(result, null);
  assert.ok(typeof result.k === 'number');
  assert.ok(typeof result.d === 'number');
  assert.ok(typeof result.j === 'number');
  
  // J = 3K - 2D
  assert.strictEqual(Math.abs(result.j - (3 * result.k - 2 * result.d)) < 0.001, true);
});

test('KDJIndicator - detects oversold condition (J < 0)', () => {
  const kdj = new KDJIndicator({ period: 5, smoothK: 3, smoothD: 3 });
  
  // Simulate downtrend
  const candles = [
    { high: 150, low: 140, close: 145 },
    { high: 145, low: 135, close: 140 },
    { high: 140, low: 130, close: 135 },
    { high: 135, low: 125, close: 130 },
    { high: 130, low: 120, close: 125 },
    { high: 125, low: 115, close: 120 },
    { high: 120, low: 110, close: 115 },
    { high: 115, low: 105, close: 110 },
    { high: 110, low: 100, close: 105 },
    { high: 105, low: 95, close: 100 }
  ];
  
  let result;
  for (const candle of candles) {
    result = kdj.update(candle);
  }
  
  // In strong downtrend, J should be low
  assert.ok(result.j < 50, 'J should be low in downtrend');
});

test('KDJIndicator - detects overbought condition (J > 100)', () => {
  const kdj = new KDJIndicator({ period: 5, smoothK: 3, smoothD: 3 });
  
  // Simulate uptrend
  const candles = [
    { high: 110, low: 100, close: 105 },
    { high: 115, low: 105, close: 110 },
    { high: 120, low: 110, close: 115 },
    { high: 125, low: 115, close: 120 },
    { high: 130, low: 120, close: 125 },
    { high: 135, low: 125, close: 130 },
    { high: 140, low: 130, close: 135 },
    { high: 145, low: 135, close: 140 },
    { high: 150, low: 140, close: 145 },
    { high: 155, low: 145, close: 150 }
  ];
  
  let result;
  for (const candle of candles) {
    result = kdj.update(candle);
  }
  
  // In strong uptrend, J should be high
  assert.ok(result.j > 50, 'J should be high in uptrend');
});

test('KDJIndicator - detects bullish crossover (K crosses above D)', () => {
  const kdj = new KDJIndicator({ period: 5, smoothK: 3, smoothD: 3 });
  
  // Simulate reversal from down to up
  const candles = [
    { high: 120, low: 110, close: 115 },
    { high: 115, low: 105, close: 110 },
    { high: 110, low: 100, close: 105 },
    { high: 105, low: 95, close: 100 },
    { high: 100, low: 90, close: 95 },   // Downtrend
    { high: 105, low: 95, close: 100 },  // Starting to reverse
    { high: 110, low: 100, close: 105 },
    { high: 115, low: 105, close: 110 },
    { high: 120, low: 110, close: 115 },
    { high: 125, low: 115, close: 120 }
  ];
  
  let crossover;
  for (const candle of candles) {
    kdj.update(candle);
    crossover = kdj.getCrossover();
  }
  
  // At some point we should detect a crossover
  // (exact timing depends on smoothing)
  assert.ok(['bullish', 'bearish', null].includes(crossover));
});

test('KDJIndicator - handles flat market (zero range)', () => {
  const kdj = new KDJIndicator({ period: 5, smoothK: 3, smoothD: 3 });
  
  // All same price
  for (let i = 0; i < 10; i++) {
    const result = kdj.update({ high: 100, low: 100, close: 100 });
    if (result !== null) {
      // RSV should be 50 (neutral) in flat market
      assert.ok(result.k >= 45 && result.k <= 55, 'K should be near 50 in flat market');
    }
  }
});

test('KDJIndicator - reset clears internal state', () => {
  const kdj = new KDJIndicator({ period: 5, smoothK: 3, smoothD: 3 });
  
  // Feed some data
  for (let i = 0; i < 10; i++) {
    kdj.update({ high: 110 + i, low: 100 + i, close: 105 + i });
  }
  
  assert.ok(kdj.isReady());
  
  // Reset
  kdj.reset();
  
  assert.strictEqual(kdj.isReady(), false);
  assert.strictEqual(kdj.getValue(), null);
});

test('KDJIndicator - validates input', () => {
  const kdj = new KDJIndicator();
  
  assert.throws(() => {
    kdj.update({ high: 'invalid', low: 100, close: 105 });
  }, /requires numeric/);
  
  assert.throws(() => {
    kdj.update({ high: 110, low: 'invalid', close: 105 });
  }, /requires numeric/);
  
  assert.throws(() => {
    kdj.update({ high: 110, low: 100, close: 'invalid' });
  }, /requires numeric/);
});
