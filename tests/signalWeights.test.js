process.env.DEMO_MODE = 'true';
process.env.RUN_INTERVALS = 'false';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const signalWeights = require('../signal-weights');

describe('Signal Weights Schema', () => {
  test('has required top-level structure', () => {
    assert.ok('weights' in signalWeights);
    assert.ok('profiles' in signalWeights);
    assert.ok('thresholds' in signalWeights);
    assert.ok('activeProfile' in signalWeights);
  });

  test('default weights include all indicators', () => {
    const weights = signalWeights.weights;

    assert.ok('rsi' in weights);
    assert.ok('williamsR' in weights);
    assert.ok('macd' in weights);
    assert.ok('ao' in weights);
    assert.ok('emaTrend' in weights);
    assert.ok('stochastic' in weights);
    assert.ok('bollinger' in weights);
    assert.ok('kdj' in weights);
    assert.ok('obv' in weights);
    assert.ok('dom' in weights);
  });

  test('KDJ configuration has required fields', () => {
    const kdj = signalWeights.weights.kdj;

    assert.strictEqual(typeof kdj.max, 'number');
    assert.strictEqual(typeof kdj.kPeriod, 'number');
    assert.strictEqual(typeof kdj.dPeriod, 'number');
    assert.strictEqual(typeof kdj.smooth, 'number');
    assert.strictEqual(typeof kdj.jOversold, 'number');
    assert.strictEqual(typeof kdj.jOverbought, 'number');
    assert.strictEqual(typeof kdj.crossWeight, 'number');

    assert.strictEqual(kdj.max, 15);
    assert.strictEqual(kdj.kPeriod, 9);
    assert.strictEqual(kdj.dPeriod, 3);
    assert.strictEqual(kdj.smooth, 3);
    assert.strictEqual(kdj.jOversold, 20);
    assert.strictEqual(kdj.jOverbought, 80);
    assert.strictEqual(kdj.crossWeight, 5);
  });

  test('OBV configuration has required fields', () => {
    const obv = signalWeights.weights.obv;

    assert.strictEqual(typeof obv.max, 'number');
    assert.strictEqual(typeof obv.slopeWindow, 'number');
    assert.strictEqual(typeof obv.smoothingEma, 'number');
    assert.strictEqual(typeof obv.zScoreCap, 'number');
    assert.strictEqual(typeof obv.confirmTrend, 'boolean');

    assert.strictEqual(obv.max, 10);
    assert.strictEqual(obv.slopeWindow, 14);
    assert.strictEqual(obv.smoothingEma, 5);
    assert.strictEqual(obv.zScoreCap, 2.0);
    assert.strictEqual(obv.confirmTrend, true);
  });

  test('DOM configuration has required fields', () => {
    const dom = signalWeights.weights.dom;

    assert.strictEqual(typeof dom.max, 'number');
    assert.strictEqual(typeof dom.enabled, 'boolean');
    assert.strictEqual(typeof dom.liveOnlyValidation, 'boolean');
    assert.ok(Array.isArray(dom.depthLevels));
    assert.strictEqual(typeof dom.imbalanceThresholdLong, 'number');
    assert.strictEqual(typeof dom.imbalanceThresholdShort, 'number');
    assert.strictEqual(typeof dom.spreadMaxPercent, 'number');
    assert.strictEqual(typeof dom.wallDetectionEnabled, 'boolean');
    assert.strictEqual(typeof dom.micropriceBias, 'boolean');

    assert.strictEqual(dom.max, 15);
    assert.strictEqual(dom.enabled, false);
    assert.strictEqual(dom.liveOnlyValidation, true);
    assert.deepStrictEqual(dom.depthLevels, [5, 10, 25]);
    assert.strictEqual(dom.imbalanceThresholdLong, 0.60);
    assert.strictEqual(dom.imbalanceThresholdShort, 0.40);
    assert.strictEqual(dom.spreadMaxPercent, 0.05);
    assert.strictEqual(dom.wallDetectionEnabled, false);
    assert.strictEqual(dom.micropriceBias, true);
  });

  test('DOM has liveOnlyValidation flag set to true', () => {
    assert.strictEqual(signalWeights.weights.dom.liveOnlyValidation, true);
  });

  test('all profiles have KDJ, OBV, and DOM sections', () => {
    const profiles = signalWeights.profiles;
    const profileNames = ['conservative', 'aggressive', 'balanced', 'scalping', 'swingTrading'];

    for (const profileName of profileNames) {
      const profile = profiles[profileName];

      assert.ok('kdj' in profile, `${profileName} missing kdj`);
      assert.ok('obv' in profile, `${profileName} missing obv`);
      assert.ok('dom' in profile, `${profileName} missing dom`);

      // Verify DOM has liveOnlyValidation in all profiles
      assert.strictEqual(
        profile.dom.liveOnlyValidation,
        true,
        `${profileName} DOM liveOnlyValidation should be true`
      );
    }
  });

  test('conservative profile has DOM disabled', () => {
    const conservative = signalWeights.profiles.conservative;

    assert.strictEqual(conservative.dom.max, 0);
    assert.strictEqual(conservative.dom.enabled, false);
  });

  test('aggressive profile has DOM enabled', () => {
    const aggressive = signalWeights.profiles.aggressive;

    assert.strictEqual(aggressive.dom.max, 15);
    assert.strictEqual(aggressive.dom.enabled, true);
  });

  test('all weight max values are non-negative numbers', () => {
    const weights = signalWeights.weights;

    for (const [indicator, config] of Object.entries(weights)) {
      assert.strictEqual(
        typeof config.max,
        'number',
        `${indicator} max should be a number`
      );
      assert.ok(
        config.max >= 0,
        `${indicator} max should be non-negative`
      );
    }
  });

  test('thresholds are properly ordered', () => {
    const t = signalWeights.thresholds;

    assert.ok(t.strongBuy > t.buy);
    assert.ok(t.buy > t.buyWeak);
    assert.ok(t.sellWeak > t.sell);
    assert.ok(t.sell > t.strongSell);
  });

  test('KDJ jOversold is less than jOverbought', () => {
    const kdj = signalWeights.weights.kdj;
    assert.ok(kdj.jOversold < kdj.jOverbought);
  });

  test('DOM imbalanceThresholdShort is less than imbalanceThresholdLong', () => {
    const dom = signalWeights.weights.dom;
    assert.ok(dom.imbalanceThresholdShort < dom.imbalanceThresholdLong);
  });

  test('all profiles have consistent indicator structure', () => {
    const profiles = signalWeights.profiles;
    const expectedIndicators = Object.keys(signalWeights.weights);

    for (const [profileName, profile] of Object.entries(profiles)) {
      for (const indicator of expectedIndicators) {
        assert.ok(
          indicator in profile,
          `${profileName} missing ${indicator}`
        );

        assert.ok(
          'max' in profile[indicator],
          `${profileName}.${indicator} missing max`
        );
      }
    }
  });
});
