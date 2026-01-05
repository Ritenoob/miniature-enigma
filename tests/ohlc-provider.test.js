// ============================================================================
// OHLCProvider Tests
// ============================================================================

const { test, describe, mock: _mock } = require('node:test');
const assert = require('node:assert');
const OHLCProvider = require('../src/marketdata/OHLCProvider');

describe('OHLCProvider', () => {
  test('initializes with default configuration', () => {
    const provider = new OHLCProvider();

    assert.strictEqual(provider.config.source, 'kucoin');
    assert.strictEqual(provider.config.timeout, 10000);
    assert.strictEqual(provider.config.cacheEnabled, true);
    assert.strictEqual(provider.config.cacheTTL, 60000);
  });

  test('initializes with custom configuration', () => {
    const provider = new OHLCProvider({
      source: 'binance',
      timeout: 5000,
      cacheEnabled: false,
      apiKey: 'test-key'
    });

    assert.strictEqual(provider.config.source, 'binance');
    assert.strictEqual(provider.config.timeout, 5000);
    assert.strictEqual(provider.config.cacheEnabled, false);
    assert.strictEqual(provider.config.apiKey, 'test-key');
  });

  test('validates required parameters', async () => {
    const provider = new OHLCProvider();

    await assert.rejects(
      async () => provider.getCandles({}),
      /Symbol is required/
    );

    await assert.rejects(
      async () => provider.getCandles({ symbol: 'BTCUSDT' }),
      /Timeframe is required/
    );
  });

  test('validates timeframe format', async () => {
    const provider = new OHLCProvider();

    await assert.rejects(
      async () => provider.getCandles({ symbol: 'BTCUSDT', timeframe: 'invalid' }),
      /Timeframe must be in format/
    );
  });

  test('converts timeframe to minutes correctly', () => {
    const provider = new OHLCProvider();

    assert.strictEqual(provider._convertTimeframeToMinutes('1m'), 1);
    assert.strictEqual(provider._convertTimeframeToMinutes('5m'), 5);
    assert.strictEqual(provider._convertTimeframeToMinutes('15m'), 15);
    assert.strictEqual(provider._convertTimeframeToMinutes('1h'), 60);
    assert.strictEqual(provider._convertTimeframeToMinutes('4h'), 240);
    assert.strictEqual(provider._convertTimeframeToMinutes('1d'), 1440);
  });

  test('normalizes KuCoin candles correctly', () => {
    const provider = new OHLCProvider();
    const kucoinCandles = [
      [1672531200, '50000', '50100', '49900', '50050', '100.5']
    ];

    const normalized = provider._normalizeKuCoinCandles(kucoinCandles);

    assert.strictEqual(normalized.length, 1);
    assert.strictEqual(normalized[0].timestamp, 1672531200000);
    assert.strictEqual(normalized[0].open, 50000);
    assert.strictEqual(normalized[0].high, 50100);
    assert.strictEqual(normalized[0].low, 49900);
    assert.strictEqual(normalized[0].close, 50050);
    assert.strictEqual(normalized[0].volume, 100.5);
  });

  test('normalizes Binance candles correctly', () => {
    const provider = new OHLCProvider();
    const binanceCandles = [
      [1672531200000, '50000', '50100', '49900', '50050', '100.5', 1672531260000]
    ];

    const normalized = provider._normalizeBinanceCandles(binanceCandles);

    assert.strictEqual(normalized.length, 1);
    assert.strictEqual(normalized[0].timestamp, 1672531200000);
    assert.strictEqual(normalized[0].open, 50000);
    assert.strictEqual(normalized[0].high, 50100);
    assert.strictEqual(normalized[0].low, 49900);
    assert.strictEqual(normalized[0].close, 50050);
    assert.strictEqual(normalized[0].volume, 100.5);
  });

  test('normalizes Alpha Vantage candles correctly', () => {
    const provider = new OHLCProvider();
    const alphaVantageCandles = {
      '2023-01-01': {
        '1. open': '50000',
        '2. high': '50100',
        '3. low': '49900',
        '4. close': '50050',
        '5. volume': '100'
      }
    };

    const normalized = provider._normalizeAlphaVantageCandles(alphaVantageCandles);

    assert.strictEqual(normalized.length, 1);
    assert.ok(normalized[0].timestamp > 0);
    assert.strictEqual(normalized[0].open, 50000);
    assert.strictEqual(normalized[0].high, 50100);
    assert.strictEqual(normalized[0].low, 49900);
    assert.strictEqual(normalized[0].close, 50050);
    assert.strictEqual(normalized[0].volume, 100);
  });

  test('generates consistent cache keys', () => {
    const provider = new OHLCProvider();

    const key1 = provider._getCacheKey({ symbol: 'BTCUSDT', timeframe: '1m', limit: 500 });
    const key2 = provider._getCacheKey({ symbol: 'BTCUSDT', timeframe: '1m', limit: 500 });
    const key3 = provider._getCacheKey({ symbol: 'ETHUSD', timeframe: '1m', limit: 500 });

    assert.strictEqual(key1, key2, 'Same parameters should generate same key');
    assert.notStrictEqual(key1, key3, 'Different parameters should generate different keys');
  });

  test('caches and retrieves candles', () => {
    const provider = new OHLCProvider({ cacheEnabled: true, cacheTTL: 60000 });
    const params = { symbol: 'BTCUSDT', timeframe: '1m', limit: 500 };
    const mockCandles = [
      { timestamp: 1672531200000, open: 50000, high: 50100, low: 49900, close: 50050, volume: 100 }
    ];

    // Cache should be empty initially
    const cached1 = provider._getFromCache(params);
    assert.strictEqual(cached1, null);

    // Store in cache
    provider._setCache(params, mockCandles);

    // Should retrieve from cache
    const cached2 = provider._getFromCache(params);
    assert.deepStrictEqual(cached2, mockCandles);
  });

  test('cache expires after TTL', async () => {
    const provider = new OHLCProvider({ cacheEnabled: true, cacheTTL: 50 }); // 50ms TTL
    const params = { symbol: 'BTCUSDT', timeframe: '1m', limit: 500 };
    const mockCandles = [
      { timestamp: 1672531200000, open: 50000, high: 50100, low: 49900, close: 50050, volume: 100 }
    ];

    provider._setCache(params, mockCandles);

    // Should be in cache immediately
    const cached1 = provider._getFromCache(params);
    assert.deepStrictEqual(cached1, mockCandles);

    // Wait for cache to expire
    await new Promise(resolve => setTimeout(resolve, 60));

    // Should be expired
    const cached2 = provider._getFromCache(params);
    assert.strictEqual(cached2, null);
  });

  test('clears cache correctly', () => {
    const provider = new OHLCProvider();
    const params = { symbol: 'BTCUSDT', timeframe: '1m', limit: 500 };
    const mockCandles = [{ timestamp: 1672531200000, open: 50000 }];

    provider._setCache(params, mockCandles);
    assert.ok(provider.cache.size > 0);

    provider.clearCache();
    assert.strictEqual(provider.cache.size, 0);
  });

  test('provides cache statistics', () => {
    const provider = new OHLCProvider();
    const params1 = { symbol: 'BTCUSDT', timeframe: '1m', limit: 500 };
    const params2 = { symbol: 'ETHUSD', timeframe: '5m', limit: 500 };

    provider._setCache(params1, []);
    provider._setCache(params2, []);

    const stats = provider.getCacheStats();
    assert.strictEqual(stats.size, 2);
    assert.strictEqual(stats.entries.length, 2);
  });

  test('enforces rate limiting', async () => {
    const provider = new OHLCProvider({ rateLimitDelay: 100 });

    const start = Date.now();

    // First request should be immediate
    await provider._enforceRateLimit();
    const _time1 = Date.now() - start;

    // Second request should be delayed
    await provider._enforceRateLimit();
    const time2 = Date.now() - start;

    // Should have at least 100ms delay
    assert.ok(time2 >= 100, `Expected delay >= 100ms, got ${time2}ms`);
  });

  test('handles unsupported source', async () => {
    const provider = new OHLCProvider({ source: 'unsupported' });

    await assert.rejects(
      async () => provider.getCandles({ symbol: 'BTCUSDT', timeframe: '1m' }),
      /Unsupported OHLC source/
    );
  });

  test('throws error for local source without implementation', async () => {
    const provider = new OHLCProvider({ source: 'local' });

    await assert.rejects(
      async () => provider.getCandles({ symbol: 'BTCUSDT', timeframe: '1m' }),
      /Local OHLC source not yet implemented/
    );
  });

  test('handles empty candle arrays', () => {
    const provider = new OHLCProvider();

    const normalized1 = provider._normalizeCandles([], 'kucoin');
    assert.deepStrictEqual(normalized1, []);

    const normalized2 = provider._normalizeCandles(null, 'binance');
    assert.deepStrictEqual(normalized2, []);
  });

  test('cache cleanup removes old entries', () => {
    const provider = new OHLCProvider();

    // Add 105 entries to trigger cleanup (cleanup threshold is 100)
    for (let i = 0; i < 105; i++) {
      const params = { symbol: `SYM${i}`, timeframe: '1m', limit: 500 };
      provider._setCache(params, []);
    }

    // Cache should be cleaned up to prevent unbounded growth
    assert.ok(provider.cache.size <= 100, 'Cache should be cleaned up');
  });

  test('rejects Alpha Vantage without API key', async () => {
    const provider = new OHLCProvider({ source: 'alphaVantage' });

    await assert.rejects(
      async () => provider.getCandles({ symbol: 'BTCUSDT', timeframe: '1m' }),
      /Alpha Vantage requires API key/
    );
const assert = require('assert');
const OHLCProvider = require('../src/ohlc-provider');

describe('OHLCProvider', () => {
  let provider;

  beforeEach(() => {
    provider = new OHLCProvider();
  });

  afterEach(() => {
    if (provider) {
      provider.stop();
    }
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      assert.strictEqual(provider.interval, 60000);
      assert.strictEqual(provider.running, false);
      assert.strictEqual(provider.currentCandle, null);
    });

    it('should accept custom interval', () => {
      const customProvider = new OHLCProvider(30000);
      assert.strictEqual(customProvider.interval, 30000);
    });
  });

  describe('start', () => {
    it('should start the provider', () => {
      provider.start();
      assert.strictEqual(provider.running, true);
    });

    it('should not restart if already running', () => {
      provider.start();
      const firstCandle = provider.currentCandle;
      provider.start();
      assert.strictEqual(provider.currentCandle, firstCandle);
    });
  });

  describe('stop', () => {
    it('should stop the provider', () => {
      provider.start();
      provider.stop();
      assert.strictEqual(provider.running, false);
    });

    it('should clear current candle', () => {
      provider.start();
      provider.stop();
      assert.strictEqual(provider.currentCandle, null);
    });
  });

  describe('addTrade', () => {
    beforeEach(() => {
      provider.start();
    });

    it('should create first candle from trade', () => {
      provider.addTrade(100, 1);
      
      assert.ok(provider.currentCandle);
      assert.strictEqual(provider.currentCandle.open, 100);
      assert.strictEqual(provider.currentCandle.high, 100);
      assert.strictEqual(provider.currentCandle.low, 100);
      assert.strictEqual(provider.currentCandle.close, 100);
      assert.strictEqual(provider.currentCandle.volume, 1);
    });

    it('should update existing candle', () => {
      provider.addTrade(100, 1);
      provider.addTrade(105, 2);
      provider.addTrade(95, 1);
      
      assert.strictEqual(provider.currentCandle.open, 100);
      assert.strictEqual(provider.currentCandle.high, 105);
      assert.strictEqual(provider.currentCandle.low, 95);
      assert.strictEqual(provider.currentCandle.close, 95);
      assert.strictEqual(provider.currentCandle.volume, 4);
    });

    it('should not add trade when stopped', () => {
      provider.stop();
      provider.addTrade(100, 1);
      assert.strictEqual(provider.currentCandle, null);
    });
  });

  describe('getCandle', () => {
    it('should return null when no candle exists', () => {
      assert.strictEqual(provider.getCandle(), null);
    });

    it('should return current candle', () => {
      provider.start();
      provider.addTrade(100, 1);
      
      const candle = provider.getCandle();
      assert.ok(candle);
      assert.strictEqual(candle.open, 100);
    });
  });

  describe('onCandle callback', () => {
    it('should emit completed candles', (done) => {
      const shortProvider = new OHLCProvider(100);
      let candleEmitted = false;

      shortProvider.onCandle = (candle) => {
        candleEmitted = true;
        assert.ok(candle);
        assert.strictEqual(candle.open, 100);
        assert.strictEqual(candle.close, 110);
        shortProvider.stop();
        done();
      };

      shortProvider.start();
      shortProvider.addTrade(100, 1);
      shortProvider.addTrade(110, 1);
    });

    it('should start new candle after emission', (done) => {
      const shortProvider = new OHLCProvider(100);
      let emissionCount = 0;

      shortProvider.onCandle = (candle) => {
        emissionCount++;
        
        if (emissionCount === 1) {
          assert.strictEqual(candle.open, 100);
          // Add trade for next candle
          shortProvider.addTrade(200, 1);
        } else if (emissionCount === 2) {
          assert.strictEqual(candle.open, 200);
          shortProvider.stop();
          done();
        }
      };

      shortProvider.start();
      shortProvider.addTrade(100, 1);
    });
  });

  describe('interval timing', () => {
    it('should emit candle after interval expires', (done) => {
      const shortProvider = new OHLCProvider(100);
      const startTime = Date.now();

      shortProvider.onCandle = (candle) => {
        const elapsed = Date.now() - startTime;
        assert.ok(elapsed >= 100, `Expected >= 100ms, got ${elapsed}ms`);
        shortProvider.stop();
        done();
      };

      shortProvider.start();
      shortProvider.addTrade(100, 1);
    });

    it('should handle multiple intervals', (done) => {
      const shortProvider = new OHLCProvider(100);
      const startTime = Date.now();
      let count = 0;

      shortProvider.onCandle = (candle) => {
        count++;
        const elapsed = Date.now() - startTime;

        if (count === 1) {
          const time1 = elapsed;
          assert.ok(time1 >= 100, `Expected delay >= 100ms, got ${time1}ms`);
          // Add trade for next candle
          shortProvider.addTrade(200, 1);
        } else if (count === 2) {
          const time2 = elapsed - 100;
          assert.ok(time2 >= 95, `Expected delay >= 95ms, got ${time2}ms`);
          shortProvider.stop();
          done();
        }
      };

      shortProvider.start();
      shortProvider.addTrade(100, 1);
    });
  });

  describe('edge cases', () => {
    it('should handle rapid trades', () => {
      provider.start();
      
      for (let i = 0; i < 100; i++) {
        provider.addTrade(100 + i, 1);
      }

      assert.strictEqual(provider.currentCandle.volume, 100);
      assert.strictEqual(provider.currentCandle.high, 199);
      assert.strictEqual(provider.currentCandle.low, 100);
    });

    it('should handle zero volume trades', () => {
      provider.start();
      provider.addTrade(100, 0);
      
      assert.strictEqual(provider.currentCandle.volume, 0);
    });

    it('should handle negative prices', () => {
      provider.start();
      provider.addTrade(-100, 1);
      provider.addTrade(-50, 1);
      
      assert.strictEqual(provider.currentCandle.high, -50);
      assert.strictEqual(provider.currentCandle.low, -100);
    });
  });
});
