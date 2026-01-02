/**
 * Test suite for OBVIndicator
 */

const { test } = require('node:test');
const assert = require('node:assert');
const OBVIndicator = require('../../src/indicators/OBVIndicator');

test('OBVIndicator - initializes with default parameters', () => {
  const obv = new OBVIndicator();
  assert.strictEqual(obv.useEma, false);
  assert.strictEqual(obv.getValue(), 0);
});

test('OBVIndicator - initializes with EMA enabled', () => {
  const obv = new OBVIndicator({ useEma: true, emaPeriod: 10 });
  assert.strictEqual(obv.useEma, true);
  assert.strictEqual(obv.emaPeriod, 10);
});

test('OBVIndicator - returns null on first candle', () => {
  const obv = new OBVIndicator();
  const result = obv.update({ close: 100, volume: 1000 });
  assert.strictEqual(result, null);
});

test('OBVIndicator - accumulates volume on up days', () => {
  const obv = new OBVIndicator();
  
  obv.update({ close: 100, volume: 1000 }); // Initialize
  obv.update({ close: 101, volume: 500 });  // Up day: +500
  
  assert.strictEqual(obv.getValue(), 500);
  
  obv.update({ close: 102, volume: 300 });  // Up day: +300
  assert.strictEqual(obv.getValue(), 800);
});

test('OBVIndicator - subtracts volume on down days', () => {
  const obv = new OBVIndicator();
  
  obv.update({ close: 100, volume: 1000 }); // Initialize
  obv.update({ close: 99, volume: 500 });   // Down day: -500
  
  assert.strictEqual(obv.getValue(), -500);
  
  obv.update({ close: 98, volume: 300 });   // Down day: -300
  assert.strictEqual(obv.getValue(), -800);
});

test('OBVIndicator - keeps same value on unchanged close', () => {
  const obv = new OBVIndicator();
  
  obv.update({ close: 100, volume: 1000 }); // Initialize
  obv.update({ close: 101, volume: 500 });  // Up day: +500
  
  assert.strictEqual(obv.getValue(), 500);
  
  obv.update({ close: 101, volume: 300 });  // Unchanged: no change
  assert.strictEqual(obv.getValue(), 500);
});

test('OBVIndicator - calculates EMA when enabled', () => {
  const obv = new OBVIndicator({ useEma: true, emaPeriod: 5 });
  
  obv.update({ close: 100, volume: 1000 }); // Initialize
  
  for (let i = 0; i < 10; i++) {
    obv.update({ close: 100 + i, volume: 500 });
  }
  
  const emaValue = obv.getEmaValue();
  assert.notStrictEqual(emaValue, null);
  assert.ok(typeof emaValue === 'number');
});

test('OBVIndicator - calculates slope after enough data', () => {
  const obv = new OBVIndicator({ slopePeriod: 5 });
  
  obv.update({ close: 100, volume: 1000 }); // Initialize
  
  // Uptrend - should have positive slope
  for (let i = 1; i <= 6; i++) {
    obv.update({ close: 100 + i, volume: 500 });
  }
  
  const slope = obv.getSlope();
  assert.notStrictEqual(slope, null);
  assert.ok(slope > 0, 'Slope should be positive in uptrend');
});

test('OBVIndicator - detects bullish trend (positive slope)', () => {
  const obv = new OBVIndicator({ slopePeriod: 5 });
  
  obv.update({ close: 100, volume: 1000 }); // Initialize
  
  // Consistent uptrend
  for (let i = 1; i <= 10; i++) {
    obv.update({ close: 100 + i, volume: 500 });
  }
  
  assert.ok(obv.isBullish(0), 'Should detect bullish trend');
  assert.strictEqual(obv.isBearish(0), false);
});

test('OBVIndicator - detects bearish trend (negative slope)', () => {
  const obv = new OBVIndicator({ slopePeriod: 5 });
  
  obv.update({ close: 100, volume: 1000 }); // Initialize
  
  // Consistent downtrend
  for (let i = 1; i <= 10; i++) {
    obv.update({ close: 100 - i, volume: 500 });
  }
  
  assert.ok(obv.isBearish(0), 'Should detect bearish trend');
  assert.strictEqual(obv.isBullish(0), false);
});

test('OBVIndicator - handles zero slope (flat market)', () => {
  const obv = new OBVIndicator({ slopePeriod: 5 });
  
  obv.update({ close: 100, volume: 1000 }); // Initialize
  
  // Alternating up/down - should result in near-zero slope
  for (let i = 1; i <= 10; i++) {
    const close = i % 2 === 0 ? 101 : 99;
    obv.update({ close, volume: 500 });
  }
  
  const slope = obv.getSlope();
  // Slope should be close to zero
  assert.ok(Math.abs(slope) < 1000, 'Slope should be small in flat market');
});

test('OBVIndicator - reset clears internal state', () => {
  const obv = new OBVIndicator();
  
  obv.update({ close: 100, volume: 1000 });
  obv.update({ close: 101, volume: 500 });
  
  assert.notStrictEqual(obv.getValue(), 0);
  
  obv.reset();
  
  assert.strictEqual(obv.getValue(), 0);
  assert.strictEqual(obv.getSlope(), null);
  assert.strictEqual(obv.getEmaValue(), null);
});

test('OBVIndicator - validates input', () => {
  const obv = new OBVIndicator();
  
  assert.throws(() => {
    obv.update({ close: 'invalid', volume: 1000 });
  }, /requires numeric/);
  
  assert.throws(() => {
    obv.update({ close: 100, volume: 'invalid' });
  }, /requires numeric/);
});

test('OBVIndicator - handles large volume swings', () => {
  const obv = new OBVIndicator();
  
  obv.update({ close: 100, volume: 1000 });
  obv.update({ close: 101, volume: 1000000 }); // Large volume up
  
  assert.strictEqual(obv.getValue(), 1000000);
  
  obv.update({ close: 100, volume: 500000 }); // Large volume down
  
  assert.strictEqual(obv.getValue(), 500000);
});

test('OBVIndicator - works with EMA and slope together', () => {
  const obv = new OBVIndicator({ 
    useEma: true, 
    emaPeriod: 5,
    slopePeriod: 5
  });
  
  obv.update({ close: 100, volume: 1000 });
  
  for (let i = 1; i <= 10; i++) {
    obv.update({ close: 100 + i, volume: 500 });
  }
  
  const result = obv.update({ close: 111, volume: 500 });
  
  assert.ok(result.obv !== null);
  assert.ok(result.emaObv !== null);
  assert.ok(result.slope !== null);
  assert.ok(obv.isBullish(0));
});
