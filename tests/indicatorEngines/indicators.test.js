/**
 * Indicator Engines Tests
 * 
 * Tests for institutional-grade incremental indicators.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');

const {
  RSIIndicator,
  MACDIndicator,
  WilliamsRIndicator,
  AwesomeOscillator,
  KDJIndicator,
  OBVIndicator,
  ADXIndicator
} = require('../../indicatorEngines');

// Sample candle data
const sampleCandles = [
  { time: 1, open: 100, high: 105, low: 98, close: 103, volume: 1000 },
  { time: 2, open: 103, high: 107, low: 101, close: 105, volume: 1200 },
  { time: 3, open: 105, high: 106, low: 102, close: 102, volume: 900 },
  { time: 4, open: 102, high: 108, low: 101, close: 107, volume: 1500 },
  { time: 5, open: 107, high: 110, low: 106, close: 109, volume: 1800 },
  { time: 6, open: 109, high: 111, low: 107, close: 108, volume: 1100 },
  { time: 7, open: 108, high: 109, low: 104, close: 104, volume: 1300 },
  { time: 8, open: 104, high: 106, low: 102, close: 105, volume: 1000 },
  { time: 9, open: 105, high: 107, low: 103, close: 106, volume: 1400 },
  { time: 10, open: 106, high: 108, low: 105, close: 107, volume: 1200 }
];

// Generate more candles for indicators with longer periods
function generateCandles(count, startPrice = 100) {
  const candles = [];
  let price = startPrice;
  
  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 5;
    price = Math.max(50, price + change);
    
    candles.push({
      time: i + 1,
      open: price,
      high: price * 1.02,
      low: price * 0.98,
      close: price,
      volume: 1000 + Math.random() * 1000
    });
  }
  
  return candles;
}

describe('RSIIndicator', () => {
  it('should initialize correctly', () => {
    const rsi = new RSIIndicator({ period: 14 });
    assert.strictEqual(rsi.isReady(), false);
    assert.strictEqual(rsi.getValue(), null);
  });

  it('should return null during warmup', () => {
    const rsi = new RSIIndicator({ period: 14 });
    const candles = generateCandles(10);
    
    candles.forEach(candle => {
      const value = rsi.update(candle);
      // Should be null until period is reached
      if (candles.indexOf(candle) < 14) {
        assert.strictEqual(value, null);
      }
    });
  });

  it('should return value between 0 and 100', () => {
    const rsi = new RSIIndicator({ period: 14 });
    const candles = generateCandles(30);
    
    candles.forEach(candle => {
      const value = rsi.update(candle);
      if (value !== null) {
        assert.ok(value >= 0 && value <= 100, `RSI ${value} out of range`);
      }
    });
  });

  it('should support state serialization', () => {
    const rsi1 = new RSIIndicator({ period: 14 });
    const candles = generateCandles(20);
    
    candles.forEach(c => rsi1.update(c));
    
    const state = rsi1.getState();
    const rsi2 = new RSIIndicator({ period: 14 });
    rsi2.setState(state);
    
    assert.deepStrictEqual(rsi1.getValue(), rsi2.getValue());
  });
});

describe('MACDIndicator', () => {
  it('should initialize correctly', () => {
    const macd = new MACDIndicator();
    assert.strictEqual(macd.isReady(), false);
    assert.strictEqual(macd.getValue(), null);
  });

  it('should return MACD, signal, and histogram', () => {
    const macd = new MACDIndicator();
    const candles = generateCandles(40);
    
    let lastValue = null;
    candles.forEach(candle => {
      const value = macd.update(candle);
      if (value !== null) {
        assert.ok(typeof value.macd === 'number');
        assert.ok(typeof value.signal === 'number');
        assert.ok(typeof value.histogram === 'number');
        lastValue = value;
      }
    });
    
    assert.ok(lastValue !== null, 'MACD should be ready after 40 candles');
  });

  it('histogram should equal MACD minus signal', () => {
    const macd = new MACDIndicator();
    const candles = generateCandles(40);
    
    candles.forEach(candle => {
      const value = macd.update(candle);
      if (value !== null) {
        const expectedHistogram = value.macd - value.signal;
        assert.ok(
          Math.abs(value.histogram - expectedHistogram) < 0.0001,
          'Histogram calculation incorrect'
        );
      }
    });
  });
});

describe('WilliamsRIndicator', () => {
  it('should return value between -100 and 0', () => {
    const willR = new WilliamsRIndicator({ period: 14 });
    const candles = generateCandles(30);
    
    candles.forEach(candle => {
      const value = willR.update(candle);
      if (value !== null) {
        assert.ok(value >= -100 && value <= 0, `Williams %R ${value} out of range`);
      }
    });
  });
});

describe('AwesomeOscillator', () => {
  it('should initialize correctly', () => {
    const ao = new AwesomeOscillator();
    assert.strictEqual(ao.isReady(), false);
  });

  it('should return numeric value after warmup', () => {
    const ao = new AwesomeOscillator({ fast: 5, slow: 34 });
    const candles = generateCandles(50);
    
    let valueCount = 0;
    candles.forEach(candle => {
      const value = ao.update(candle);
      if (value !== null) {
        assert.ok(typeof value === 'number');
        valueCount++;
      }
    });
    
    assert.ok(valueCount > 0, 'AO should produce values after warmup');
  });
});

describe('KDJIndicator', () => {
  it('should return K, D, and J values', () => {
    const kdj = new KDJIndicator();
    const candles = generateCandles(30);
    
    let lastValue = null;
    candles.forEach(candle => {
      const value = kdj.update(candle);
      if (value !== null) {
        assert.ok(typeof value.k === 'number');
        assert.ok(typeof value.d === 'number');
        assert.ok(typeof value.j === 'number');
        lastValue = value;
      }
    });
    
    assert.ok(lastValue !== null, 'KDJ should be ready');
  });

  it('J should equal 3K - 2D', () => {
    const kdj = new KDJIndicator();
    const candles = generateCandles(30);
    
    candles.forEach(candle => {
      const value = kdj.update(candle);
      if (value !== null) {
        const expectedJ = 3 * value.k - 2 * value.d;
        assert.ok(
          Math.abs(value.j - expectedJ) < 0.0001,
          'J calculation incorrect'
        );
      }
    });
  });
});

describe('OBVIndicator', () => {
  it('should track cumulative volume', () => {
    const obv = new OBVIndicator();
    const candles = generateCandles(30);
    
    let lastOBV = 0;
    candles.forEach(candle => {
      const value = obv.update(candle);
      if (value !== null) {
        assert.ok(typeof value.obv === 'number');
        assert.ok(typeof value.slope === 'number' || value.slope === null);
        assert.ok(['bullish', 'bearish', 'neutral'].includes(value.trend));
        lastOBV = value.obv;
      }
    });
    
    assert.ok(lastOBV !== 0, 'OBV should change from initial value');
  });
});

describe('ADXIndicator', () => {
  it('should return ADX, +DI, and -DI', () => {
    const adx = new ADXIndicator({ period: 14 });
    const candles = generateCandles(50);
    
    let lastValue = null;
    candles.forEach(candle => {
      const value = adx.update(candle);
      if (value !== null) {
        assert.ok(typeof value.adx === 'number');
        assert.ok(typeof value.plusDI === 'number');
        assert.ok(typeof value.minusDI === 'number');
        assert.ok(typeof value.trend === 'string');
        lastValue = value;
      }
    });
    
    assert.ok(lastValue !== null, 'ADX should be ready after warmup');
  });

  it('ADX should be between 0 and 100', () => {
    const adx = new ADXIndicator({ period: 14 });
    const candles = generateCandles(50);
    
    candles.forEach(candle => {
      const value = adx.update(candle);
      if (value !== null) {
        assert.ok(value.adx >= 0 && value.adx <= 100, `ADX ${value.adx} out of range`);
      }
    });
  });
});

describe('All Indicators - State Persistence', () => {
  it('should restore exact state from serialization', () => {
    const indicators = {
      rsi: new RSIIndicator(),
      macd: new MACDIndicator(),
      willR: new WilliamsRIndicator(),
      ao: new AwesomeOscillator(),
      kdj: new KDJIndicator(),
      obv: new OBVIndicator(),
      adx: new ADXIndicator()
    };
    
    const candles = generateCandles(50);
    
    // Process candles
    candles.forEach(candle => {
      Object.values(indicators).forEach(ind => ind.update(candle));
    });
    
    // Save states
    const states = {};
    Object.keys(indicators).forEach(key => {
      states[key] = indicators[key].getState();
    });
    
    // Create new indicators and restore
    const newIndicators = {
      rsi: new RSIIndicator(),
      macd: new MACDIndicator(),
      willR: new WilliamsRIndicator(),
      ao: new AwesomeOscillator(),
      kdj: new KDJIndicator(),
      obv: new OBVIndicator(),
      adx: new ADXIndicator()
    };
    
    Object.keys(newIndicators).forEach(key => {
      newIndicators[key].setState(states[key]);
    });
    
    // Verify values match
    Object.keys(indicators).forEach(key => {
      const original = indicators[key].getValue();
      const restored = newIndicators[key].getValue();
      
      if (typeof original === 'object' && original !== null) {
        assert.deepStrictEqual(original, restored, `${key} state mismatch`);
      } else {
        assert.strictEqual(original, restored, `${key} value mismatch`);
      }
    });
  });
});

describe('All Indicators - Reset Functionality', () => {
  it('should reset to initial state', () => {
    const rsi = new RSIIndicator();
    const candles = generateCandles(30);
    
    // Process candles
    candles.forEach(c => rsi.update(c));
    assert.ok(rsi.isReady(), 'RSI should be ready');
    
    // Reset
    rsi.reset();
    assert.strictEqual(rsi.isReady(), false, 'RSI should not be ready after reset');
    assert.strictEqual(rsi.getValue(), null, 'RSI value should be null after reset');
  });
});
