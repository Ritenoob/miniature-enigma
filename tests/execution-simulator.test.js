// ============================================================================
// ExecutionSimulator Tests
// ============================================================================

const { test, describe } = require('node:test');
const assert = require('node:assert');
const ExecutionSimulator = require('../src/optimizer/ExecutionSimulator');

describe('ExecutionSimulator', () => {
  const mockParams = {
    accountBalance: 10000,
    positionSizePercent: 10,    // 10% of balance = 1000 USDT margin
    leverage: 10,               // 10x leverage = 10000 USDT notional
    side: 'long',
    midPrice: 50000,
    makerFee: 0.0002,
    takerFee: 0.0006,
    slippagePercent: 0.02,
    multiplier: 1
  };

  test('simulates taker entry with slippage', () => {
    const result = ExecutionSimulator.simulateEntry({
      ...mockParams,
      fillModel: 'taker'
    });

    // Verify structure
    assert.ok(result.entryFillPrice, 'Should have entry fill price');
    assert.ok(result.marginUsed, 'Should have margin used');
    assert.ok(result.effectiveNotional, 'Should have effective notional');
    assert.ok(result.size, 'Should have size');
    assert.ok(result.entryFee, 'Should have entry fee');

    // Verify calculations
    assert.strictEqual(result.marginUsed, 1000, 'Margin should be 10% of 10000');
    assert.strictEqual(result.effectiveNotional, 10000, 'Notional should be margin * leverage');
    
    // Long entry with slippage should pay more
    assert.ok(result.entryFillPrice > mockParams.midPrice, 'Long entry should have slippage upward');
    
    // Fee should be notional * taker fee
    assert.strictEqual(result.entryFee, 10000 * 0.0006, 'Entry fee should be notional * taker fee');
    assert.strictEqual(result.fillType, 'taker', 'Fill type should be taker');
  });

  test('simulates maker entry without slippage', () => {
    const limitPrice = 49500;
    const result = ExecutionSimulator.simulateEntry({
      ...mockParams,
      fillModel: 'probabilistic_limit',
      limitPrice,
      limitFillProbability: 1.0  // Force maker fill
    });

    // Should fill at limit price with maker fee
    assert.strictEqual(result.entryFillPrice, limitPrice, 'Should fill at limit price');
    assert.strictEqual(result.entryFee, 10000 * 0.0002, 'Entry fee should use maker fee');
    assert.strictEqual(result.fillType, 'maker', 'Fill type should be maker');
  });

  test('marks position to market correctly', () => {
    const entry = ExecutionSimulator.simulateEntry(mockParams);
    
    // Price moves up 5% from entry
    const currentPrice = entry.entryFillPrice * 1.05;
    const mtm = ExecutionSimulator.markToMarket(entry, currentPrice);

    // Verify structure
    assert.ok(mtm.unrealizedGrossPnl !== undefined, 'Should have gross PnL');
    assert.ok(mtm.unrealizedNetPnl !== undefined, 'Should have net PnL');
    assert.ok(mtm.unrealizedROI !== undefined, 'Should have ROI');

    // For long position, price increase should be profitable
    assert.ok(mtm.unrealizedGrossPnl > 0, 'Gross PnL should be positive');
    
    // Net PnL should be less than gross (fees deducted)
    assert.ok(mtm.unrealizedNetPnl < mtm.unrealizedGrossPnl, 'Net PnL should be less than gross');
  });

  test('simulates exit with realized PnL', () => {
    const entry = ExecutionSimulator.simulateEntry(mockParams);
    
    // Exit at 2% profit
    const exitPrice = entry.entryFillPrice * 1.02;
    const exit = ExecutionSimulator.simulateExit(entry, exitPrice);

    // Verify structure
    assert.ok(exit.exitFillPrice, 'Should have exit fill price');
    assert.ok(exit.realizedGrossPnl !== undefined, 'Should have realized gross PnL');
    assert.ok(exit.realizedNetPnl !== undefined, 'Should have realized net PnL');
    assert.ok(exit.realizedROI !== undefined, 'Should have realized ROI');
    assert.ok(exit.totalFees, 'Should have total fees');

    // Net PnL should account for fees
    assert.ok(exit.realizedNetPnl < exit.realizedGrossPnl, 'Net PnL should be less than gross');
    
    // Total fees should be entry + exit
    assert.ok(exit.totalFees > 0, 'Total fees should be positive');
  });

  test('calculates correct slippage for long positions', () => {
    const price = 50000;
    const slippage = 0.02; // 2%

    // Long entry should pay more
    const longEntryPrice = ExecutionSimulator._applySlippage(price, 'long', slippage, 'entry');
    assert.strictEqual(longEntryPrice, 50000 * 1.0002, 'Long entry should add slippage');

    // Long exit should receive less
    const longExitPrice = ExecutionSimulator._applySlippage(price, 'long', slippage, 'exit');
    assert.strictEqual(longExitPrice, 50000 * 0.9998, 'Long exit should subtract slippage');
  });

  test('calculates correct slippage for short positions', () => {
    const price = 50000;
    const slippage = 0.02; // 2%

    // Short entry should receive less
    const shortEntryPrice = ExecutionSimulator._applySlippage(price, 'short', slippage, 'entry');
    assert.strictEqual(shortEntryPrice, 50000 * 0.9998, 'Short entry should subtract slippage');

    // Short exit should pay more
    const shortExitPrice = ExecutionSimulator._applySlippage(price, 'short', slippage, 'exit');
    assert.strictEqual(shortExitPrice, 50000 * 1.0002, 'Short exit should add slippage');
  });

  test('calculates break-even price correctly', () => {
    const entry = ExecutionSimulator.simulateEntry(mockParams);
    const breakEven = ExecutionSimulator.calculateBreakEven(entry);

    // Break-even should be higher than entry for long
    assert.ok(breakEven > entry.entryFillPrice, 'Break-even should be above entry for long');

    // Should account for fees and slippage
    const expectedFeeImpact = (0.0006 + 0.0006) * 10 * 100; // (entry + exit) * leverage * 100
    const expectedSlippageImpact = 0.02 * 2; // 2% slippage on entry and exit
    const totalPercent = (expectedFeeImpact + expectedSlippageImpact) / 100;
    
    const expectedBreakEven = entry.entryFillPrice * (1 + totalPercent);
    assert.ok(Math.abs(breakEven - expectedBreakEven) < 1, 'Break-even calculation should be accurate');
  });

  test('validates parameters correctly', () => {
    // Should not throw for valid params
    assert.doesNotThrow(() => {
      ExecutionSimulator.validateParams(mockParams);
    });

    // Should throw for invalid account balance
    assert.throws(() => {
      ExecutionSimulator.validateParams({ ...mockParams, accountBalance: 0 });
    }, /Account balance must be positive/);

    // Should throw for invalid position size
    assert.throws(() => {
      ExecutionSimulator.validateParams({ ...mockParams, positionSizePercent: 150 });
    }, /Position size percent must be between/);

    // Should throw for invalid leverage
    assert.throws(() => {
      ExecutionSimulator.validateParams({ ...mockParams, leverage: 0 });
    }, /Leverage must be between/);

    // Should throw for invalid side
    assert.throws(() => {
      ExecutionSimulator.validateParams({ ...mockParams, side: 'invalid' });
    }, /Side must be/);
  });

  test('net PnL is always less than or equal to gross PnL', () => {
    const entry = ExecutionSimulator.simulateEntry(mockParams);
    
    // Test with profitable position
    const profitPrice = entry.entryFillPrice * 1.1;
    const profitExit = ExecutionSimulator.simulateExit(entry, profitPrice);
    assert.ok(profitExit.realizedNetPnl <= profitExit.realizedGrossPnl, 'Net PnL should be <= gross PnL for profit');

    // Test with losing position
    const lossPrice = entry.entryFillPrice * 0.95;
    const lossExit = ExecutionSimulator.simulateExit(entry, lossPrice);
    assert.ok(lossExit.realizedNetPnl <= lossExit.realizedGrossPnl, 'Net PnL should be <= gross PnL for loss');
  });

  test('handles different leverage correctly', () => {
    const lowLevEntry = ExecutionSimulator.simulateEntry({
      ...mockParams,
      leverage: 5
    });
    
    const highLevEntry = ExecutionSimulator.simulateEntry({
      ...mockParams,
      leverage: 20
    });

    // Same margin, different notional
    assert.strictEqual(lowLevEntry.marginUsed, highLevEntry.marginUsed, 'Margin should be same');
    assert.ok(highLevEntry.effectiveNotional > lowLevEntry.effectiveNotional, 'Higher leverage = higher notional');
    
    // Higher leverage = higher fees
    assert.ok(highLevEntry.entryFee > lowLevEntry.entryFee, 'Higher leverage should have higher fees');
  });

  test('ROI scales with leverage correctly', () => {
    const entry = ExecutionSimulator.simulateEntry(mockParams);
    
    // 1% price move
    const newPrice = entry.entryFillPrice * 1.01;
    const mtm = ExecutionSimulator.markToMarket(entry, newPrice);

    // With 10x leverage, 1% price move should be ~10% ROI (minus fees)
    // Approximate check since fees reduce the ROI
    assert.ok(Math.abs(mtm.unrealizedROI) > 5, 'ROI should be amplified by leverage');
    assert.ok(Math.abs(mtm.unrealizedROI) < 15, 'ROI should be reasonable for 1% move with 10x leverage');
  });

  test('short positions work correctly', () => {
    const shortEntry = ExecutionSimulator.simulateEntry({
      ...mockParams,
      side: 'short'
    });

    // Price drops 5% - should be profitable for short
    const lowerPrice = shortEntry.entryFillPrice * 0.95;
    const mtm = ExecutionSimulator.markToMarket(shortEntry, lowerPrice);

    assert.ok(mtm.unrealizedGrossPnl > 0, 'Short should profit from price drop');

    // Price rises 5% - should be loss for short
    const higherPrice = shortEntry.entryFillPrice * 1.05;
    const mtm2 = ExecutionSimulator.markToMarket(shortEntry, higherPrice);

    assert.ok(mtm2.unrealizedGrossPnl < 0, 'Short should lose from price rise');
  });

  test('includes funding fees in net PnL', () => {
    const entry = ExecutionSimulator.simulateEntry(mockParams);
    const exitPrice = entry.entryFillPrice * 1.02;
    
    // Exit without funding fees
    const exitNoFunding = ExecutionSimulator.simulateExit(entry, exitPrice, 0.0006, 0.02, 0);
    
    // Exit with funding fees
    const fundingFees = 5; // 5 USDT in funding
    const exitWithFunding = ExecutionSimulator.simulateExit(entry, exitPrice, 0.0006, 0.02, fundingFees);

    // Net PnL should be lower with funding fees
    assert.strictEqual(
      exitWithFunding.realizedNetPnl,
      exitNoFunding.realizedNetPnl - fundingFees,
      'Funding fees should reduce net PnL'
    );
  });
});
