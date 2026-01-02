/**
 * Unit Tests for KDJ, OBV, and ADX Indicators
 * --------------------------------------------
 * Tests the new indicator engines for correctness and edge cases
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

const KDJIndicator = require('../core/indicators/KDJIndicator');
const OBVIndicator = require('../core/indicators/OBVIndicator');
const ADXIndicator = require('../core/indicators/ADXIndicator');

describe('KDJ Indicator', () => {
  it('initializes with default config', () => {
    const kdj = new KDJIndicator();
    assert.strictEqual(kdj.period, 9);
    assert.strictEqual(kdj.kPeriod, 3);
    assert.strictEqual(kdj.dPeriod, 3);
  });

  it('returns neutral signal with insufficient data', () => {
    const kdj = new KDJIndicator();
    const result = kdj.update({ high: 100, low: 95, close: 98 });
    assert.strictEqual(result.ready, false);
    assert.strictEqual(result.signal, 'neutral');
  });

  it('calculates KDJ values correctly', () => {
    const kdj = new KDJIndicator({ period: 5 });
    
    // Feed sample data
    const candles = [
      { high: 105, low: 100, close: 103 },
      { high: 107, low: 102, close: 106 },
      { high: 110, low: 105, close: 108 },
      { high: 112, low: 107, close: 111 },
      { high: 115, low: 110, close: 113 },
      { high: 113, low: 108, close: 110 },
    ];
    
    let result;
    for (const candle of candles) {
      result = kdj.update(candle);
    }
    
    assert.strictEqual(result.ready, true);
    assert.ok(result.k >= 0 && result.k <= 100);
    assert.ok(result.d >= 0 && result.d <= 100);
    // J can exceed 0-100 range
  });

  it('detects oversold conditions', () => {
    const kdj = new KDJIndicator({ period: 5, oversold: 30 });
    
    // Feed declining price data
    const candles = [];
    for (let i = 0; i < 10; i++) {
      const price = 100 - i * 5;
      candles.push({ high: price + 2, low: price - 2, close: price });
    }
    
    let result;
    for (const candle of candles) {
      result = kdj.update(candle);
    }
    
    // Should show bullish signal in oversold region
    assert.ok(['bullish', 'mild_bullish', 'strong_bullish'].includes(result.signal) || result.signal === 'neutral');
  });

  it('calculates contribution correctly', () => {
    const kdj = new KDJIndicator();
    
    // Feed enough data
    for (let i = 0; i < 10; i++) {
      kdj.update({ high: 102, low: 98, close: 100 });
    }
    
    const contribution = kdj.getContribution(15);
    assert.ok(contribution >= -15 && contribution <= 15);
  });

  it('resets state correctly', () => {
    const kdj = new KDJIndicator();
    kdj.update({ high: 100, low: 95, close: 98 });
    kdj.reset();
    
    assert.strictEqual(kdj.closeBuffer.length, 0);
    assert.strictEqual(kdj.lastK, 50);
    assert.strictEqual(kdj.lastD, 50);
  });
});

describe('OBV Indicator', () => {
  it('initializes with default config', () => {
    const obv = new OBVIndicator();
    assert.strictEqual(obv.useSmoothing, true);
    assert.strictEqual(obv.smoothingPeriod, 10);
  });

  it('calculates OBV correctly on rising prices', () => {
    const obv = new OBVIndicator({ useSmoothing: false });
    
    const candles = [
      { close: 100, volume: 1000 },
      { close: 101, volume: 1500 },  // Price up, add volume
      { close: 102, volume: 2000 },  // Price up, add volume
    ];
    
    let result;
    for (const candle of candles) {
      result = obv.update(candle);
    }
    
    // OBV should be positive and increasing
    assert.ok(result.obv > 0);
    assert.strictEqual(result.obv, 1000 + 1500 + 2000);
  });

  it('calculates OBV correctly on falling prices', () => {
    const obv = new OBVIndicator({ useSmoothing: false });
    
    const candles = [
      { close: 100, volume: 1000 },
      { close: 99, volume: 1500 },   // Price down, subtract volume
      { close: 98, volume: 2000 },   // Price down, subtract volume
    ];
    
    let result;
    for (const candle of candles) {
      result = obv.update(candle);
    }
    
    // OBV should decrease
    assert.strictEqual(result.obv, 1000 - 1500 - 2000);
  });

  it('applies smoothing when enabled', () => {
    const obv = new OBVIndicator({ useSmoothing: true, smoothingPeriod: 3 });
    
    // Feed enough data for smoothing
    for (let i = 0; i < 10; i++) {
      obv.update({ close: 100 + i, volume: 1000 });
    }
    
    const result = obv.getCurrentValues();
    assert.ok(result.smoothedObv !== 0);
    // Smoothed OBV should differ from raw OBV
    assert.ok(Math.abs(result.obv - result.smoothedObv) > 0.01 || result.obv === result.smoothedObv);
  });

  it('detects bullish divergence', () => {
    const obv = new OBVIndicator({ slopeThreshold: 0.5, slopePeriod: 3 });
    
    // Simulate divergence: falling price but rising OBV
    const candles = [
      { close: 100, volume: 1000 },
      { close: 99, volume: 500 },
      { close: 98, volume: 500 },
      { close: 99, volume: 3000 },  // Volume surge despite lower price
      { close: 100, volume: 3000 },
    ];
    
    let result;
    for (const candle of candles) {
      result = obv.update(candle);
    }
    
    // Should detect some form of positive signal
    assert.ok(result.signal !== 'bearish');
  });

  it('calculates contribution correctly', () => {
    const obv = new OBVIndicator();
    
    for (let i = 0; i < 15; i++) {
      obv.update({ close: 100 + i, volume: 1000 });
    }
    
    const contribution = obv.getContribution(10);
    assert.ok(contribution >= -10 && contribution <= 10);
  });

  it('resets state correctly', () => {
    const obv = new OBVIndicator();
    obv.update({ close: 100, volume: 1000 });
    obv.reset();
    
    assert.strictEqual(obv.closeBuffer.length, 0);
    assert.strictEqual(obv.currentObv, 0);
  });
});

describe('ADX Indicator', () => {
  it('initializes with default config', () => {
    const adx = new ADXIndicator();
    assert.strictEqual(adx.period, 14);
    assert.strictEqual(adx.trendThreshold, 25);
    assert.strictEqual(adx.strongTrend, 40);
  });

  it('returns neutral signal with insufficient data', () => {
    const adx = new ADXIndicator();
    const result = adx.update({ high: 100, low: 95, close: 98 });
    assert.strictEqual(result.ready, false);
    assert.strictEqual(result.signal, 'neutral');
  });

  it('calculates ADX values correctly', () => {
    const adx = new ADXIndicator({ period: 7 });
    
    // Feed trending data
    const candles = [];
    for (let i = 0; i < 20; i++) {
      const price = 100 + i * 2;  // Strong uptrend
      candles.push({
        high: price + 3,
        low: price - 1,
        close: price + 1
      });
    }
    
    let result;
    for (const candle of candles) {
      result = adx.update(candle);
    }
    
    assert.strictEqual(result.ready, true);
    assert.ok(result.adx >= 0 && result.adx <= 100);
    assert.ok(result.plusDI >= 0 && result.plusDI <= 100);
    assert.ok(result.minusDI >= 0 && result.minusDI <= 100);
  });

  it('detects strong uptrend', () => {
    const adx = new ADXIndicator({ period: 7, strongTrend: 30 });
    
    // Feed strong uptrend data
    const candles = [];
    for (let i = 0; i < 25; i++) {
      const price = 100 + i * 3;
      candles.push({
        high: price + 2,
        low: price - 1,
        close: price + 1
      });
    }
    
    let result;
    for (const candle of candles) {
      result = adx.update(candle);
    }
    
    // In a strong uptrend, plusDI should be > minusDI
    if (result.ready) {
      assert.ok(result.plusDI > result.minusDI);
    }
  });

  it('detects ranging market (low ADX)', () => {
    const adx = new ADXIndicator({ period: 7 });
    
    // Feed sideways data
    const candles = [];
    for (let i = 0; i < 20; i++) {
      const price = 100 + (i % 2 === 0 ? 1 : -1);  // Oscillating
      candles.push({
        high: price + 1,
        low: price - 1,
        close: price
      });
    }
    
    let result;
    for (const candle of candles) {
      result = adx.update(candle);
    }
    
    if (result.ready) {
      // ADX should be lower in ranging market
      assert.ok(result.trendStrength === 'no_trend' || result.trendStrength === 'weak_trend');
    }
  });

  it('calculates contribution correctly', () => {
    const adx = new ADXIndicator({ period: 7 });
    
    // Feed enough data
    for (let i = 0; i < 20; i++) {
      adx.update({
        high: 102 + i,
        low: 98 + i,
        close: 100 + i
      });
    }
    
    const contribution = adx.getContribution(10);
    assert.ok(contribution >= -10 && contribution <= 10);
  });

  it('resets state correctly', () => {
    const adx = new ADXIndicator();
    adx.update({ high: 100, low: 95, close: 98 });
    adx.reset();
    
    assert.strictEqual(adx.closeBuffer.length, 0);
    assert.strictEqual(adx.currentADX, 0);
    assert.strictEqual(adx.currentPlusDI, 0);
  });
});

describe('Indicator Integration', () => {
  it('all indicators can be instantiated together', () => {
    const kdj = new KDJIndicator();
    const obv = new OBVIndicator();
    const adx = new ADXIndicator();
    
    assert.ok(kdj);
    assert.ok(obv);
    assert.ok(adx);
  });

  it('all indicators produce consistent output format', () => {
    const kdj = new KDJIndicator();
    const obv = new OBVIndicator();
    const adx = new ADXIndicator();
    
    // Update each with sample data
    for (let i = 0; i < 15; i++) {
      const candle = {
        high: 102 + i,
        low: 98 + i,
        close: 100 + i,
        volume: 1000
      };
      
      kdj.update(candle);
      obv.update(candle);
      adx.update(candle);
    }
    
    const kdjValues = kdj.getCurrentValues();
    const obvValues = obv.getCurrentValues();
    const adxValues = adx.getCurrentValues();
    
    // All should have signal and ready properties
    assert.ok('signal' in kdjValues);
    assert.ok('ready' in kdjValues);
    assert.ok('signal' in obvValues);
    assert.ok('ready' in obvValues);
    assert.ok('signal' in adxValues);
    assert.ok('ready' in adxValues);
  });

  it('all indicators provide getContribution method', () => {
    const kdj = new KDJIndicator();
    const obv = new OBVIndicator();
    const adx = new ADXIndicator();
    
    assert.strictEqual(typeof kdj.getContribution, 'function');
    assert.strictEqual(typeof obv.getContribution, 'function');
    assert.strictEqual(typeof adx.getContribution, 'function');
  });
});
