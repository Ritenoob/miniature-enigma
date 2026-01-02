/**
 * Test suite for DOMScoring
 */

const { test } = require('node:test');
const assert = require('node:assert');
const DOMScoring = require('../../src/scoring/DOMScoring');

// Helper to temporarily set environment variable
function withEnv(key, value, fn) {
  const original = process.env[key];
  process.env[key] = value;
  try {
    fn();
  } finally {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

test('DOMScoring - throws error when not in LIVE_MODE', () => {
  withEnv('LIVE_MODE', 'false', () => {
    const scorer = new DOMScoring();
    
    const features = {
      imbalance_5: 0.3,
      spread_bps: 2.0,
      walls: { hasBidWall: false, hasAskWall: false },
      microprice: 50000,
      midPrice: 50000
    };
    
    assert.throws(() => {
      scorer.computeContribution(features, null, 'long');
    }, /requires LIVE_MODE/);
  });
});

test('DOMScoring - works when LIVE_MODE is true', () => {
  withEnv('LIVE_MODE', 'true', () => {
    const scorer = new DOMScoring();
    
    const features = {
      imbalance_5: 0.3,
      spread_bps: 2.0,
      walls: { hasBidWall: false, hasAskWall: false },
      microprice: 50000,
      midPrice: 50000
    };
    
    const result = scorer.computeContribution(features, null, 'long');
    
    assert.ok(typeof result.score === 'number');
    assert.ok(result.breakdown);
    assert.strictEqual(result.type, 'LIVE_ONLY_VALIDATION_REQUIRED');
  });
});

test('DOMScoring - positive imbalance favors long positions', () => {
  withEnv('LIVE_MODE', 'true', () => {
    const scorer = new DOMScoring();
    
    const features = {
      imbalance_5: 0.3,  // Positive = more bids (buying pressure)
      spread_bps: 2.0,
      walls: { hasBidWall: false, hasAskWall: false },
      microprice: 50000,
      midPrice: 50000
    };
    
    const result = scorer.computeContribution(features, null, 'long');
    
    assert.ok(result.score > 0, 'Score should be positive for long with positive imbalance');
  });
});

test('DOMScoring - negative imbalance favors short positions', () => {
  withEnv('LIVE_MODE', 'true', () => {
    const scorer = new DOMScoring();
    
    const features = {
      imbalance_5: -0.3,  // Negative = more asks (selling pressure)
      spread_bps: 2.0,
      walls: { hasBidWall: false, hasAskWall: false },
      microprice: 50000,
      midPrice: 50000
    };
    
    const result = scorer.computeContribution(features, null, 'short');
    
    assert.ok(result.score > 0, 'Score should be positive for short with negative imbalance');
  });
});

test('DOMScoring - tight spread increases score', () => {
  withEnv('LIVE_MODE', 'true', () => {
    const scorer = new DOMScoring({
      weights: {
        max: 20,
        imbalance_5_threshold: 0.2,
        spread_threshold_bps: 5.0
      }
    });
    
    const featuresTight = {
      imbalance_5: 0,
      spread_bps: 2.0,  // Tight spread
      walls: { hasBidWall: false, hasAskWall: false },
      microprice: 50000,
      midPrice: 50000
    };
    
    const featuresWide = {
      imbalance_5: 0,
      spread_bps: 15.0,  // Wide spread
      walls: { hasBidWall: false, hasAskWall: false },
      microprice: 50000,
      midPrice: 50000
    };
    
    const resultTight = scorer.computeContribution(featuresTight, null, 'long');
    const resultWide = scorer.computeContribution(featuresWide, null, 'long');
    
    assert.ok(resultTight.score > resultWide.score, 'Tight spread should score higher');
  });
});

test('DOMScoring - bid wall positive for long positions', () => {
  withEnv('LIVE_MODE', 'true', () => {
    const scorer = new DOMScoring();
    
    const features = {
      imbalance_5: 0,
      spread_bps: 2.0,
      walls: { 
        hasBidWall: true,  // Support
        hasAskWall: false,
        bidWalls: [{ price: 49900, size: 100, level: 5 }],
        askWalls: []
      },
      microprice: 50000,
      midPrice: 50000
    };
    
    const result = scorer.computeContribution(features, null, 'long');
    
    assert.ok(result.breakdown.walls > 0, 'Bid wall should be positive for long');
  });
});

test('DOMScoring - provides warning message', () => {
  const warning = DOMScoring.getLiveModeWarning();
  assert.ok(warning.includes('LIVE_MODE'));
  assert.ok(warning.includes('backtest'));
});
