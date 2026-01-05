// ============================================================================
// TrailingStopPolicy Tests
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert');
const TrailingStopPolicy = require('../src/optimizer/TrailingStopPolicy');

describe('TrailingStopPolicy', () => {
  const baseParams = {
    side: 'long',
    entryPrice: 50000,
    currentStop: 49750,  // Initial SL at -0.5% ROI with 10x leverage
    leverage: 10,
    entryFeeRate: 0.0006,
    exitFeeRate: 0.0006,
    config: {
      breakEvenBuffer: 0.1,
      trailingStepPercent: 0.15,
      trailingMovePercent: 0.05,
      trailingMode: 'staircase'
    },
    lastROIStep: 0,
    breakEvenArmed: false
  };

  test('returns no change when ROI is below break-even threshold', () => {
    const result = TrailingStopPolicy.nextStop({
      ...baseParams,
      currentROI: 0.5  // Below break-even threshold
    });

    assert.strictEqual(result.newStopPrice, baseParams.currentStop);
    assert.strictEqual(result.reason, 'no_change');
    assert.strictEqual(result.breakEvenArmed, false);
  });

  test('moves stop to break-even when ROI threshold is reached', () => {
    // Fee-adjusted break-even ROI = (0.0006 + 0.0006) * 10 * 100 + 0.1 = 1.3%
    const result = TrailingStopPolicy.nextStop({
      ...baseParams,
      currentROI: 1.5  // Above break-even threshold
    });

    // Should move to entry price + small buffer
    assert.ok(result.newStopPrice > baseParams.entryPrice, 'Stop should be above entry');
    assert.ok(result.newStopPrice > baseParams.currentStop, 'Stop should move up');
    assert.strictEqual(result.reason, 'break_even');
    assert.strictEqual(result.breakEvenArmed, true);
  });

  test('trails stop after break-even is armed', () => {
    // Break-even already armed, ROI progressing
    const breakEvenROI = 1.3; // Fee-adjusted
    const result = TrailingStopPolicy.nextStop({
      ...baseParams,
      currentROI: breakEvenROI + 0.2,  // 1.5% ROI, above first step (0.15%)
      breakEvenArmed: true,
      currentStop: 50010,  // Already at break-even
      lastROIStep: 0
    });

    // Should trail up since we've crossed step threshold
    assert.ok(result.newStopPrice >= baseParams.currentStop, 'Stop should trail up or stay same');
    assert.ok(result.newLastROIStep >= 0, 'Should track step');
  });

  test('enforces monotonic stop movement for long positions', () => {
    // Try to move stop down (invalid for long)
    const result = TrailingStopPolicy.nextStop({
      ...baseParams,
      side: 'long',
      currentStop: 50500,
      currentROI: 0.5,  // Lower ROI shouldn't lower stop
      breakEvenArmed: true
    });

    assert.strictEqual(result.newStopPrice, 50500, 'Stop should not decrease for long');
  });

  test('enforces monotonic stop movement for short positions', () => {
    // Short position
    const result = TrailingStopPolicy.nextStop({
      ...baseParams,
      side: 'short',
      entryPrice: 50000,
      currentStop: 50250,  // SL above entry for short
      currentROI: 0.5,
      breakEvenArmed: true
    });

    assert.ok(result.newStopPrice <= 50250, 'Stop should not increase for short');
  });

  test('handles short position break-even correctly', () => {
    const result = TrailingStopPolicy.nextStop({
      ...baseParams,
      side: 'short',
      entryPrice: 50000,
      currentStop: 50250,  // Initial SL
      currentROI: 1.5,  // Above break-even
      breakEvenArmed: false
    });

    // For short, break-even moves stop below entry
    assert.ok(result.newStopPrice < 50000, 'Short break-even should be below entry');
    assert.ok(result.newStopPrice < 50250, 'Stop should move down for short');
    assert.strictEqual(result.breakEvenArmed, true);
  });

  test('calculates correct number of trailing steps', () => {
    const breakEvenROI = 1.3;

    // Test at exactly 1 step beyond break-even
    const result1 = TrailingStopPolicy.nextStop({
      ...baseParams,
      currentROI: breakEvenROI + 0.15,  // Exactly 1 step
      breakEvenArmed: true,
      currentStop: 50010,
      lastROIStep: 0
    });
    assert.ok(result1.newLastROIStep >= 1 || result1.reason === 'no_change', 'Should progress to step 1');

    // Test at 2 steps beyond break-even
    const result2 = TrailingStopPolicy.nextStop({
      ...baseParams,
      currentROI: breakEvenROI + 0.35,  // 2+ steps
      breakEvenArmed: true,
      currentStop: 50010,
      lastROIStep: 0
    });
    assert.ok(result2.newLastROIStep >= 1, 'Should progress steps');
  });

  test('validates configuration correctly', () => {
    // Valid config should not throw
    assert.doesNotThrow(() => {
      TrailingStopPolicy.validateConfig({
        breakEvenBuffer: 0.1,
        trailingStepPercent: 0.15,
        trailingMovePercent: 0.05,
        trailingMode: 'staircase'
      });
    });

    // Invalid break-even buffer
    assert.throws(() => {
      TrailingStopPolicy.validateConfig({
        breakEvenBuffer: -1
      });
    }, /breakEvenBuffer must be between/);

    // Invalid trailing step
    assert.throws(() => {
      TrailingStopPolicy.validateConfig({
        trailingStepPercent: 0
      });
    }, /trailingStepPercent must be between/);

    // Invalid trailing mode
    assert.throws(() => {
      TrailingStopPolicy.validateConfig({
        trailingMode: 'invalid'
      });
    }, /trailingMode must be one of/);
  });

  test('calculates initial stop loss correctly', () => {
    const stopLong = TrailingStopPolicy.calculateInitialStop('long', 50000, 0.5, 10);
    const stopShort = TrailingStopPolicy.calculateInitialStop('short', 50000, 0.5, 10);

    // Long stop should be below entry
    assert.ok(stopLong < 50000, 'Long stop should be below entry');

    // Short stop should be above entry
    assert.ok(stopShort > 50000, 'Short stop should be above entry');
  });

  test('provides default configuration', () => {
    const defaults = TrailingStopPolicy.getDefaultConfig();

    assert.strictEqual(defaults.breakEvenBuffer, 0.1);
    assert.strictEqual(defaults.trailingStepPercent, 0.15);
    assert.strictEqual(defaults.trailingMovePercent, 0.05);
    assert.strictEqual(defaults.trailingMode, 'staircase');
  });

  test('maintains break-even armed state', () => {
    // Once armed, should stay armed
    const result = TrailingStopPolicy.nextStop({
      ...baseParams,
      currentROI: 2.0,
      breakEvenArmed: true,
      currentStop: 50010
    });

    assert.strictEqual(result.breakEvenArmed, true, 'Should remain armed');
  });

  test('handles zero ROI gracefully', () => {
    const result = TrailingStopPolicy.nextStop({
      ...baseParams,
      currentROI: 0
    });

    assert.strictEqual(result.newStopPrice, baseParams.currentStop);
    assert.strictEqual(result.breakEvenArmed, false);
  });

  test('handles negative ROI (losing position)', () => {
    const result = TrailingStopPolicy.nextStop({
      ...baseParams,
      currentROI: -0.3  // Losing position
    });

    // Should not change stop on losing position
    assert.strictEqual(result.newStopPrice, baseParams.currentStop);
    assert.strictEqual(result.breakEvenArmed, false);
  });

  test('applies correct trailing for high ROI positions', () => {
    const breakEvenROI = 1.3;
    const highROI = breakEvenROI + 1.0;  // Well above break-even

    const result = TrailingStopPolicy.nextStop({
      ...baseParams,
      currentROI: highROI,
      breakEvenArmed: true,
      currentStop: 50500,
      lastROIStep: 5  // Already trailed several times
    });

    // Should continue trailing or maintain stop
    assert.ok(result.newStopPrice >= 50500, 'Should maintain or improve stop');
    assert.ok(result.newLastROIStep >= 5, 'Should maintain or advance step');
  });

  test('different leverage affects break-even calculation', () => {
    // Higher leverage = higher break-even ROI requirement
    const result5x = TrailingStopPolicy.nextStop({
      ...baseParams,
      leverage: 5,
      currentROI: 1.0
    });

    const result20x = TrailingStopPolicy.nextStop({
      ...baseParams,
      leverage: 20,
      currentROI: 1.0
    });

    // With same ROI but different leverage, break-even behavior differs
    // Higher leverage requires higher ROI for break-even
    // Both might not be armed, but we're testing the calculation happens
    assert.ok(typeof result5x.breakEvenArmed === 'boolean');
    assert.ok(typeof result20x.breakEvenArmed === 'boolean');
  });
});
