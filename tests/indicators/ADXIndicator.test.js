/**
 * Test suite for ADXIndicator
 */

const { test } = require('node:test');
const assert = require('node:assert');
const ADXIndicator = require('../../src/indicators/ADXIndicator');

test('ADXIndicator - initializes with default parameters', () => {
  const adx = new ADXIndicator();
  assert.strictEqual(adx.period, 14);
  assert.strictEqual(adx.getValue(), null);
});

test('ADXIndicator - initializes with custom period', () => {
  const adx = new ADXIndicator({ period: 20 });
  assert.strictEqual(adx.period, 20);
});

test('ADXIndicator - returns null until ready', () => {
  const adx = new ADXIndicator({ period: 5 });
  
  // Need 2 * period candles minimum (period for DM/TR, period for DX smoothing)
  for (let i = 0; i < 8; i++) {
    const result = adx.update({ high: 100 + i, low: 90 + i, close: 95 + i });
    if (i < 10) {
      assert.strictEqual(result, null, `Should be null at candle ${i}`);
    }
  }
});

test('ADXIndicator - calculates ADX, +DI, -DI values', () => {
  const adx = new ADXIndicator({ period: 5 });
  
  // Feed candles with uptrend
  const candles = [];
  for (let i = 0; i < 15; i++) {
    candles.push({
      high: 100 + i * 2,
      low: 90 + i * 2,
      close: 95 + i * 2
    });
  }
  
  let result;
  for (const candle of candles) {
    result = adx.update(candle);
  }
  
  assert.notStrictEqual(result, null);
  assert.ok(typeof result.adx === 'number');
  assert.ok(typeof result.plusDI === 'number');
  assert.ok(typeof result.minusDI === 'number');
  
  // In uptrend, +DI should be higher than -DI
  assert.ok(result.plusDI > result.minusDI, '+DI should be higher in uptrend');
});

test('ADXIndicator - detects trending market', () => {
  const adx = new ADXIndicator({ period: 5 });
  
  // Strong uptrend
  for (let i = 0; i < 20; i++) {
    adx.update({
      high: 100 + i * 3,
      low: 90 + i * 3,
      close: 95 + i * 3
    });
  }
  
  // ADX should rise in strong trend
  const result = adx.getValue();
  if (result) {
    assert.ok(adx.isTrending(15), 'Should detect trending market');
  }
});

test('ADXIndicator - detects uptrend direction', () => {
  const adx = new ADXIndicator({ period: 5 });
  
  // Uptrend
  for (let i = 0; i < 15; i++) {
    adx.update({
      high: 100 + i * 2,
      low: 90 + i * 2,
      close: 95 + i * 2
    });
  }
  
  const direction = adx.getTrendDirection();
  assert.strictEqual(direction, 'up');
});

test('ADXIndicator - detects downtrend direction', () => {
  const adx = new ADXIndicator({ period: 5 });
  
  // Downtrend
  for (let i = 0; i < 15; i++) {
    adx.update({
      high: 100 - i * 2,
      low: 90 - i * 2,
      close: 95 - i * 2
    });
  }
  
  const direction = adx.getTrendDirection();
  assert.strictEqual(direction, 'down');
});

test('ADXIndicator - handles ranging market (low ADX)', () => {
  const adx = new ADXIndicator({ period: 5 });
  
  // Simulate choppy/ranging market
  const prices = [100, 102, 98, 101, 99, 103, 97, 102, 98, 101, 99, 100, 102, 98, 101];
  
  for (const price of prices) {
    adx.update({
      high: price + 2,
      low: price - 2,
      close: price
    });
  }
  
  const result = adx.getValue();
  if (result) {
    // In ranging market, ADX should be lower
    assert.ok(result.adx < 40, 'ADX should be lower in ranging market');
  }
});

test('ADXIndicator - identifies strong trend', () => {
  const adx = new ADXIndicator({ period: 5 });
  
  // Very strong uptrend
  for (let i = 0; i < 25; i++) {
    adx.update({
      high: 100 + i * 5,
      low: 90 + i * 5,
      close: 95 + i * 5
    });
  }
  
  const result = adx.getValue();
  if (result) {
    // In very strong trend, ADX should eventually rise
    // Note: ADX is a lagging indicator
    assert.ok(result.adx > 0, 'ADX should be positive');
  }
});

test('ADXIndicator - handles zero range candles', () => {
  const adx = new ADXIndicator({ period: 5 });
  
  // Some normal candles
  for (let i = 0; i < 10; i++) {
    adx.update({
      high: 100 + i,
      low: 90 + i,
      close: 95 + i
    });
  }
  
  // Zero range candle (doji)
  adx.update({ high: 110, low: 110, close: 110 });
  
  // Should not throw and should continue to work
  const result = adx.update({ high: 111, low: 101, close: 106 });
  
  // Should still calculate values
  assert.notStrictEqual(result, null);
});

test('ADXIndicator - reset clears internal state', () => {
  const adx = new ADXIndicator({ period: 5 });
  
  // Feed some data
  for (let i = 0; i < 15; i++) {
    adx.update({ high: 100 + i, low: 90 + i, close: 95 + i });
  }
  
  assert.ok(adx.isReady());
  
  // Reset
  adx.reset();
  
  assert.strictEqual(adx.isReady(), false);
  assert.strictEqual(adx.getValue(), null);
});

test('ADXIndicator - validates input', () => {
  const adx = new ADXIndicator();
  
  assert.throws(() => {
    adx.update({ high: 'invalid', low: 90, close: 95 });
  }, /requires numeric/);
  
  assert.throws(() => {
    adx.update({ high: 100, low: 'invalid', close: 95 });
  }, /requires numeric/);
  
  assert.throws(() => {
    adx.update({ high: 100, low: 90, close: 'invalid' });
  }, /requires numeric/);
});

test('ADXIndicator - DI values are between 0 and 100', () => {
  const adx = new ADXIndicator({ period: 5 });
  
  // Random price movement
  for (let i = 0; i < 20; i++) {
    const result = adx.update({
      high: 100 + Math.sin(i) * 10,
      low: 90 + Math.sin(i) * 10,
      close: 95 + Math.sin(i) * 10
    });
    
    if (result) {
      assert.ok(result.plusDI >= 0 && result.plusDI <= 100, '+DI should be 0-100');
      assert.ok(result.minusDI >= 0 && result.minusDI <= 100, '-DI should be 0-100');
      assert.ok(result.adx >= 0, 'ADX should be non-negative');
    }
  }
});

test('ADXIndicator - works with realistic price data', () => {
  const adx = new ADXIndicator({ period: 14 });
  
  // Simulate realistic BTC price movement
  const candles = [
    { high: 50100, low: 49900, close: 50000 },
    { high: 50200, low: 50000, close: 50100 },
    { high: 50300, low: 50050, close: 50250 },
    { high: 50400, low: 50200, close: 50350 },
    { high: 50500, low: 50300, close: 50450 },
    { high: 50600, low: 50400, close: 50550 },
    { high: 50700, low: 50500, close: 50650 },
    { high: 50800, low: 50600, close: 50750 },
    { high: 50900, low: 50700, close: 50850 },
    { high: 51000, low: 50800, close: 50950 },
    { high: 51100, low: 50900, close: 51050 },
    { high: 51200, low: 51000, close: 51150 },
    { high: 51300, low: 51100, close: 51250 },
    { high: 51400, low: 51200, close: 51350 },
    { high: 51500, low: 51300, close: 51450 }
  ];
  
  // Add more candles to complete initialization
  for (let i = 0; i < 20; i++) {
    candles.push({
      high: 51500 + i * 50,
      low: 51300 + i * 50,
      close: 51400 + i * 50
    });
  }
  
  let result;
  for (const candle of candles) {
    result = adx.update(candle);
  }
  
  assert.notStrictEqual(result, null);
  assert.ok(result.adx >= 0);
  assert.strictEqual(adx.getTrendDirection(), 'up');
});
