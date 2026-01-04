// ============================================================================
// ExecutionSimulator.js - Paper Trading Execution Simulator
// ============================================================================
// Simulates fills, fees, slippage, leverage, and position sizing for paper trading.
// Produces net PnL and ROI consistent with leverage and account allocation.

const DecimalMath = require('../lib/DecimalMath');

/**
 * Fill model modes
 */
const FILL_MODEL = {
  TAKER: 'taker',                    // Immediate fill at market with taker fees
  PROBABILISTIC_LIMIT: 'probabilistic_limit'  // Attempt maker fill, fallback to taker
};

/**
 * ExecutionSimulator - Simulates trading execution with realistic fees and slippage
 */
class ExecutionSimulator {
  /**
   * Simulate entry fill for a paper trade
   * 
   * @param {Object} params - Entry parameters
   * @param {number} params.accountBalance - Total account balance in USDT
   * @param {number} params.positionSizePercent - Position size as % of balance (for margin)
   * @param {number} params.leverage - Leverage multiplier
   * @param {string} params.side - 'long' or 'short'
   * @param {number} params.midPrice - Current mid/mark price
   * @param {number} params.limitPrice - Optional limit price for limit orders
   * @param {number} params.makerFee - Maker fee rate (e.g., 0.0002 for 0.02%)
   * @param {number} params.takerFee - Taker fee rate (e.g., 0.0006 for 0.06%)
   * @param {number} params.slippagePercent - Slippage buffer % (e.g., 0.02 for 2%)
   * @param {string} params.fillModel - 'taker' or 'probabilistic_limit'
   * @param {number} params.limitFillProbability - Probability of limit fill (0-1) for probabilistic model
   * @param {number} params.multiplier - Contract multiplier (default 1)
   * 
   * @returns {Object} Entry execution result
   */
  static simulateEntry(params) {
    const {
      accountBalance,
      positionSizePercent,
      leverage,
      side,
      midPrice,
      limitPrice = null,
      makerFee = 0.0002,
      takerFee = 0.0006,
      slippagePercent = 0.02,
      fillModel = FILL_MODEL.TAKER,
      limitFillProbability = 0.5,
      multiplier = 1
    } = params;

    // Calculate margin used from position size percent
    const marginUsed = DecimalMath.calculateMarginUsed(accountBalance, positionSizePercent);

    // Calculate position value (notional)
    const effectiveNotional = DecimalMath.calculatePositionValue(marginUsed, leverage);

    // Determine fill price and fee based on fill model
    let entryFillPrice;
    let entryFeeRate;
    let fillType;

    if (fillModel === FILL_MODEL.PROBABILISTIC_LIMIT && limitPrice) {
      // Simulate limit order fill probability
      const filled = Math.random() < limitFillProbability;
      
      if (filled) {
        // Limit filled at specified price with maker fee
        entryFillPrice = limitPrice;
        entryFeeRate = makerFee;
        fillType = 'maker';
      } else {
        // Fallback to market order with taker fee and slippage
        entryFillPrice = this._applySlippage(midPrice, side, slippagePercent, 'entry');
        entryFeeRate = takerFee;
        fillType = 'taker_fallback';
      }
    } else {
      // Market order (taker) with slippage
      entryFillPrice = this._applySlippage(midPrice, side, slippagePercent, 'entry');
      entryFeeRate = takerFee;
      fillType = 'taker';
    }

    // Calculate size in contracts
    // Note: For paper trading, we allow fractional contracts
    // Real trading would need to respect contract minimums (lotSize)
    const size = effectiveNotional / (entryFillPrice * multiplier);

    // Calculate entry fee
    const entryFee = effectiveNotional * entryFeeRate;

    return {
      entryFillPrice,
      entryFeeRate,
      entryFee,
      effectiveNotional,
      marginUsed,
      size,
      side,
      leverage,
      multiplier,
      fillType,
      timestamp: Date.now()
    };
  }

  /**
   * Mark position to market - calculate unrealized PnL
   * 
   * @param {Object} position - Position state from simulateEntry
   * @param {number} currentPrice - Current market price
   * @param {number} fundingFees - Accumulated funding fees (optional)
   * 
   * @returns {Object} Mark-to-market result
   */
  static markToMarket(position, currentPrice, fundingFees = 0) {
    const {
      entryFillPrice,
      size,
      side,
      marginUsed,
      effectiveNotional,
      entryFee,
      multiplier = 1
    } = position;

    // Calculate price difference
    const priceDiff = DecimalMath.calculatePriceDiff(side, entryFillPrice, currentPrice);

    // Calculate unrealized gross PnL
    const unrealizedGrossPnl = DecimalMath.calculateUnrealizedPnl(priceDiff, size, multiplier);

    // Calculate unrealized net PnL (subtract entry fee and funding, but not exit fee yet)
    const unrealizedNetPnl = unrealizedGrossPnl - entryFee - fundingFees;

    // Calculate leveraged ROI% (net)
    const unrealizedROI = DecimalMath.calculateLeveragedPnlPercent(unrealizedNetPnl, marginUsed);

    return {
      currentPrice,
      unrealizedGrossPnl,
      unrealizedNetPnl,
      unrealizedROI,
      fundingFees,
      timestamp: Date.now()
    };
  }

  /**
   * Simulate exit fill for closing a position
   * 
   * @param {Object} position - Position state from simulateEntry
   * @param {number} exitPrice - Exit trigger price (SL/TP)
   * @param {number} takerFee - Taker fee rate for exit
   * @param {number} slippagePercent - Slippage buffer %
   * @param {number} fundingFees - Accumulated funding fees
   * @param {string} exitReason - 'stop_loss', 'take_profit', or 'manual'
   * 
   * @returns {Object} Exit execution result with realized PnL
   */
  static simulateExit(position, exitPrice, takerFee = 0.0006, slippagePercent = 0.02, fundingFees = 0, exitReason = 'manual') {
    const {
      entryFillPrice,
      size,
      side,
      marginUsed,
      effectiveNotional,
      entryFee,
      multiplier = 1
    } = position;

    // Apply slippage to exit price (adverse to trader)
    const exitFillPrice = this._applySlippage(exitPrice, side, slippagePercent, 'exit');

    // Calculate exit fee
    const exitFee = effectiveNotional * takerFee;

    // Calculate price difference
    const priceDiff = DecimalMath.calculatePriceDiff(side, entryFillPrice, exitFillPrice);

    // Calculate realized gross PnL
    const realizedGrossPnl = DecimalMath.calculateUnrealizedPnl(priceDiff, size, multiplier);

    // Calculate realized net PnL (subtract all fees and funding)
    const realizedNetPnl = DecimalMath.calculateNetPnl(
      realizedGrossPnl,
      effectiveNotional,
      position.entryFeeRate || takerFee,
      takerFee,
      fundingFees
    );

    // Calculate leveraged ROI% (net)
    const realizedROI = DecimalMath.calculateLeveragedPnlPercent(realizedNetPnl, marginUsed);

    return {
      exitFillPrice,
      exitFee,
      realizedGrossPnl,
      realizedNetPnl,
      realizedROI,
      totalFees: entryFee + exitFee,
      fundingFees,
      exitReason,
      timestamp: Date.now()
    };
  }

  /**
   * Apply slippage to price based on direction
   * 
   * @param {number} price - Base price
   * @param {string} side - 'long' or 'short'
   * @param {number} slippagePercent - Slippage as percentage (e.g., 0.02 for 2%)
   * @param {string} direction - 'entry' or 'exit'
   * @returns {number} Price with slippage applied
   * @private
   */
  static _applySlippage(price, side, slippagePercent, direction) {
    const slippageFactor = slippagePercent / 100;

    if (direction === 'entry') {
      // Entry slippage: adverse to trader
      // Long: pay more (price * (1 + slippage))
      // Short: receive less (price * (1 - slippage))
      return side === 'long'
        ? price * (1 + slippageFactor)
        : price * (1 - slippageFactor);
    } else {
      // Exit slippage: adverse to trader
      // Long: receive less (price * (1 - slippage))
      // Short: pay more (price * (1 + slippage))
      return side === 'long'
        ? price * (1 - slippageFactor)
        : price * (1 + slippageFactor);
    }
  }

  /**
   * Calculate break-even price for a position
   * Accounts for entry fee, exit fee, and slippage
   * 
   * @param {Object} position - Position state
   * @param {number} exitFeeRate - Exit fee rate
   * @param {number} slippagePercent - Slippage buffer %
   * @returns {number} Break-even price
   */
  static calculateBreakEven(position, exitFeeRate = 0.0006, slippagePercent = 0.02) {
    const { entryFillPrice, entryFeeRate = 0.0006, leverage, side } = position;

    // Total fee percentage impact
    const totalFeePercent = (entryFeeRate + exitFeeRate) * leverage * 100;

    // Slippage impact (applied twice: entry and exit)
    const totalSlippagePercent = slippagePercent * 2;

    // Total percentage move needed to break even
    const breakEvenPercent = (totalFeePercent + totalSlippagePercent) / 100;

    // Calculate break-even price
    if (side === 'long') {
      return entryFillPrice * (1 + breakEvenPercent);
    } else {
      return entryFillPrice * (1 - breakEvenPercent);
    }
  }

  /**
   * Validate simulation parameters
   * 
   * @param {Object} params - Parameters to validate
   * @throws {Error} If parameters are invalid
   */
  static validateParams(params) {
    const {
      accountBalance,
      positionSizePercent,
      leverage,
      side,
      midPrice
    } = params;

    if (!accountBalance || accountBalance <= 0) {
      throw new Error('Account balance must be positive');
    }

    if (!positionSizePercent || positionSizePercent <= 0 || positionSizePercent > 100) {
      throw new Error('Position size percent must be between 0 and 100');
    }

    if (!leverage || leverage < 1 || leverage > 100) {
      throw new Error('Leverage must be between 1 and 100');
    }

    if (!['long', 'short'].includes(side)) {
      throw new Error('Side must be "long" or "short"');
    }

    if (!midPrice || midPrice <= 0) {
      throw new Error('Mid price must be positive');
    }
  }
}

// Export class and constants
module.exports = ExecutionSimulator;
module.exports.FILL_MODEL = FILL_MODEL;
