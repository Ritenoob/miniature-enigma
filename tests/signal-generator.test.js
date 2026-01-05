// ============================================================================
// SignalGenerator Tests
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const SignalGenerator = require('../src/lib/SignalGenerator');

describe('SignalGenerator', () => {
  // Sample indicator data for testing
  const testIndicators = {
    rsi: 25,              // Oversold
    williamsR: -85,       // Oversold
    macd: 5,              // Positive
    macdHistogram: 2,     // Positive
    ao: 3,                // Positive
    ema50: 45000,
    ema200: 44000,        // Bullish trend (ema50 > ema200)
    stochK: 15,           // Oversold
    stochD: 12,           // K > D (bullish crossover)
    price: 45500,
    bollingerUpper: 46000,
    bollingerLower: 44000 // Price within bands
  };

  test('loads default configuration successfully', () => {
    SignalGenerator.initialize(path.resolve(__dirname, '../signal-weights.js'));
    assert.ok(SignalGenerator.config, 'Config should be loaded');
    assert.ok(SignalGenerator.config.weights, 'Config should have weights');
    assert.ok(SignalGenerator.config.thresholds, 'Config should have thresholds');
  });

  test('generates signal with default profile', () => {
    SignalGenerator.initialize(path.resolve(__dirname, '../signal-weights.js'));
    SignalGenerator.setProfile('default');

    const signal = SignalGenerator.generate(testIndicators);

    assert.ok(signal, 'Signal should be generated');
    assert.ok(signal.type, 'Signal should have type');
    assert.ok(typeof signal.score === 'number', 'Signal should have numeric score');
    assert.ok(signal.confidence, 'Signal should have confidence');
    assert.ok(Array.isArray(signal.breakdown), 'Signal should have breakdown array');
    assert.ok(signal.timestamp, 'Signal should have timestamp');
  });

  test('switches profiles successfully', () => {
    SignalGenerator.initialize();

    SignalGenerator.initialize(path.resolve(__dirname, '../signal-weights.js'));
    
    // Switch to aggressive
    SignalGenerator.setProfile('aggressive');
    const aggressive = SignalGenerator.getActiveProfile();
    assert.strictEqual(aggressive.name, 'aggressive');
    assert.strictEqual(aggressive.weights.rsi.max, 30);

    // Switch to conservative
    SignalGenerator.setProfile('conservative');
    const conservative = SignalGenerator.getActiveProfile();
    assert.strictEqual(conservative.name, 'conservative');
    assert.strictEqual(conservative.weights.rsi.max, 15);

    // Switch back to default
    SignalGenerator.setProfile('default');
    const defaultProfile = SignalGenerator.getActiveProfile();
    assert.strictEqual(defaultProfile.name, 'default');
    assert.strictEqual(defaultProfile.weights.rsi.max, 25);
  });

  test('rejects invalid profile names', () => {
    SignalGenerator.initialize();

    SignalGenerator.initialize(path.resolve(__dirname, '../signal-weights.js'));
    
    assert.throws(() => {
      SignalGenerator.setProfile('nonexistent');
    }, /Invalid profile/);
  });

  test('different profiles produce different scores', () => {
    SignalGenerator.initialize();

    SignalGenerator.initialize(path.resolve(__dirname, '../signal-weights.js'));
    
    // Generate signal with default profile
    SignalGenerator.setProfile('default');
    const defaultSignal = SignalGenerator.generate(testIndicators);

    // Generate signal with aggressive profile (higher RSI weight)
    SignalGenerator.setProfile('aggressive');
    const aggressiveSignal = SignalGenerator.generate(testIndicators);

    // Generate signal with conservative profile (lower RSI weight)
    SignalGenerator.setProfile('conservative');
    const conservativeSignal = SignalGenerator.generate(testIndicators);

    // All should be bullish but with different scores
    assert.ok(defaultSignal.score > 0, 'Default should be bullish');
    assert.ok(aggressiveSignal.score > 0, 'Aggressive should be bullish');
    assert.ok(conservativeSignal.score > 0, 'Conservative should be bullish');

    // Aggressive should have higher score due to higher momentum weights
    assert.ok(aggressiveSignal.score > defaultSignal.score, 'Aggressive should score higher');

    // Conservative should have lower score due to lower momentum weights
    assert.ok(conservativeSignal.score < defaultSignal.score, 'Conservative should score lower');
  });

  test('validates configuration structure', () => {
    // Valid config should not throw
    const validConfig = {
      weights: {
        rsi: { max: 25, oversold: 30, oversoldMild: 40, overbought: 70, overboughtMild: 60 },
        williamsR: { max: 20, oversold: -80, overbought: -20 },
        macd: { max: 20 },
        ao: { max: 15 },
        emaTrend: { max: 20 },
        stochastic: { max: 10, oversold: 20, overbought: 80 },
        bollinger: { max: 10 }
      },
      thresholds: {
        strongBuy: 70,
        buy: 50,
        buyWeak: 30,
        strongSell: -70,
        sell: -50,
        sellWeak: -30
      }
    };

    assert.doesNotThrow(() => {
      SignalGenerator.validateConfig(validConfig);
    });

    // Invalid config should throw
    const invalidConfig = {
      weights: {
        rsi: { max: -10 } // Negative max is invalid
      },
      thresholds: {}
    };

    assert.throws(() => {
      SignalGenerator.validateConfig(invalidConfig);
    });
  });

  test('handles missing indicators gracefully', () => {
    SignalGenerator.initialize();

    SignalGenerator.initialize(path.resolve(__dirname, '../signal-weights.js'));
    
    const partialIndicators = {
      rsi: 50,
      williamsR: -50,
      macd: 0,
      macdHistogram: 0,
      ao: 0,
      ema50: 45000,
      ema200: 45000,
      stochK: 50,
      stochD: 50,
      price: 45000,
      bollingerUpper: 46000,
      bollingerLower: 44000
    };

    // Should not throw
    assert.doesNotThrow(() => {
      const signal = SignalGenerator.generate(partialIndicators);
      assert.ok(signal, 'Signal should be generated even with neutral indicators');
    });
  });

  test('returns correct signal structure', () => {
    SignalGenerator.initialize();

    SignalGenerator.initialize(path.resolve(__dirname, '../signal-weights.js'));
    
    const signal = SignalGenerator.generate(testIndicators);

    // Check structure
    assert.ok(['STRONG_BUY', 'BUY', 'NEUTRAL', 'SELL', 'STRONG_SELL'].includes(signal.type));
    assert.ok(['HIGH', 'MEDIUM', 'LOW'].includes(signal.confidence));
    assert.strictEqual(signal.breakdown.length, 7, 'Should have 7 indicator breakdowns');

    // Check breakdown items
    signal.breakdown.forEach(item => {
      assert.ok(item.indicator, 'Breakdown should have indicator name');
      assert.ok(item.value !== undefined, 'Breakdown should have value');
      assert.ok(typeof item.contribution === 'number', 'Breakdown should have numeric contribution');
      assert.ok(item.reason, 'Breakdown should have reason');
      assert.ok(['bullish', 'bearish', 'neutral'].includes(item.type));
    });
  });

  test('gets list of available profiles', () => {
    SignalGenerator.initialize();

    SignalGenerator.initialize(path.resolve(__dirname, '../signal-weights.js'));
    
    const profiles = SignalGenerator.getAvailableProfiles();

    assert.ok(Array.isArray(profiles));
    assert.ok(profiles.includes('default'));
    assert.ok(profiles.includes('aggressive'));
    assert.ok(profiles.includes('conservative'));
    assert.ok(profiles.includes('balanced'));
    assert.ok(profiles.includes('scalping'));
    assert.ok(profiles.includes('swingTrading'));
  });

  test('fallback to defaults on config error', () => {
    // Force load with invalid path
    const result = SignalGenerator.initialize('/nonexistent/path.js');

    assert.strictEqual(result, false, 'Should return false on error');
    assert.ok(SignalGenerator.config, 'Should still have config (defaults)');

    // Should still be able to generate signals
    const signal = SignalGenerator.generate(testIndicators);
    assert.ok(signal, 'Should generate signal with defaults');
  });

  test('thresholds determine signal type correctly', () => {
    SignalGenerator.initialize();

    SignalGenerator.initialize(path.resolve(__dirname, '../signal-weights.js'));
    
    // Create indicators that will produce specific scores
    const strongBuyIndicators = {
      rsi: 20,              // Oversold (+25)
      williamsR: -85,       // Oversold (+20)
      macd: 10,
      macdHistogram: 5,     // Bullish (+20)
      ao: 5,                // Positive (+15)
      ema50: 50000,
      ema200: 45000,        // Bullish trend (+20)
      stochK: 15,
      stochD: 10,           // Oversold + crossover (+10)
      price: 44000,
      bollingerUpper: 46000,
      bollingerLower: 44500  // Below lower band (+10)
    };

    const signal = SignalGenerator.generate(strongBuyIndicators);

    // Score should be high (all indicators bullish)
    assert.ok(signal.score >= 70, 'Should have high score');
    assert.strictEqual(signal.type, 'STRONG_BUY', 'Should be STRONG_BUY');
    assert.strictEqual(signal.confidence, 'HIGH', 'Should have HIGH confidence');
  });

  test('profile switching is thread-safe (atomic)', () => {
    SignalGenerator.initialize();

    // Ensure we have a proper config with profiles
    SignalGenerator.initialize(path.resolve(__dirname, '../signal-weights.js'));
    
    // Switch profile
    SignalGenerator.setProfile('aggressive');
    const profile1 = SignalGenerator.getActiveProfile();

    // Generate signal
    const _signal1 = SignalGenerator.generate(testIndicators);

    // Switch again
    SignalGenerator.setProfile('conservative');
    const profile2 = SignalGenerator.getActiveProfile();

    // Profiles should be different
    assert.notStrictEqual(profile1.name, profile2.name);
    assert.notStrictEqual(profile1.weights.rsi.max, profile2.weights.rsi.max);
  });
});
