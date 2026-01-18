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
