// ============================================================================
// DecimalMath.js - Precision-safe Financial Math with decimal.js
// ============================================================================
const Decimal = require('decimal.js');

// Configure Decimal.js for financial precision
Decimal.set({ 
  precision: 20, 
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -9,
  toExpPos: 9
});

/**
 * Wrapper for TradeMath that uses Decimal.js internally for precision
 * All functions accept and return plain JavaScript numbers for API compatibility
 * but perform calculations using Decimal type internally
 */
class DecimalMath {
  /**
   * Calculate margin used for a position
   * Formula: marginUsed = accountBalance × (positionPercent / 100)
   */
  static calculateMarginUsed(accountBalance, positionPercent) {
    const balance = new Decimal(accountBalance);
    const percent = new Decimal(positionPercent);
    const result = balance.times(percent.dividedBy(100));
    return result.toNumber();
  }

  /**
   * Calculate position value with leverage
   * Formula: positionValueUSD = marginUsed × leverage
   */
  static calculatePositionValue(marginUsed, leverage) {
    const margin = new Decimal(marginUsed);
    const lev = new Decimal(leverage);
    const result = margin.times(lev);
    return result.toNumber();
  }

  /**
   * Calculate contract size (lots)
   * Formula: size = floor(positionValueUSD / (entryPrice × multiplier))
   */
  static calculateLotSize(positionValueUSD, entryPrice, multiplier = 1) {
    const posValue = new Decimal(positionValueUSD);
    const entry = new Decimal(entryPrice);
    const mult = new Decimal(multiplier);
    const result = posValue.dividedBy(entry.times(mult)).floor();
    return result.toNumber();
  }

  /**
   * Calculate price difference based on position side
   * Long: priceDiff = currentPrice - entryPrice
   * Short: priceDiff = entryPrice - currentPrice
   */
  static calculatePriceDiff(side, entryPrice, currentPrice) {
    const entry = new Decimal(entryPrice);
    const current = new Decimal(currentPrice);
    const result = side === 'long' 
      ? current.minus(entry)
      : entry.minus(current);
    return result.toNumber();
  }

  /**
   * Calculate unrealized P&L in USDT
   * Formula: unrealizedPnl = priceDiff × size × multiplier
   */
  static calculateUnrealizedPnl(priceDiff, size, multiplier = 1) {
    const diff = new Decimal(priceDiff);
    const sz = new Decimal(size);
    const mult = new Decimal(multiplier);
    const result = diff.times(sz).times(mult);
    return result.toNumber();
  }

  /**
   * Calculate leveraged P&L percentage (ROI)
   * Formula: leveragedPnlPercent = (unrealizedPnl / marginUsed) × 100
   */
  static calculateLeveragedPnlPercent(unrealizedPnl, marginUsed) {
    if (marginUsed === 0) return 0;
    const pnl = new Decimal(unrealizedPnl);
    const margin = new Decimal(marginUsed);
    const result = pnl.dividedBy(margin).times(100);
    return result.toNumber();
  }

  /**
   * Calculate fee-adjusted break-even threshold
   * Formula: breakEvenROI = (entryFee + exitFee) × leverage × 100 + buffer
   */
  static calculateFeeAdjustedBreakEven(entryFee, exitFee, leverage, buffer = 0.1) {
    const entry = new Decimal(entryFee);
    const exit = new Decimal(exitFee);
    const lev = new Decimal(leverage);
    const buff = new Decimal(buffer);
    const result = entry.plus(exit).times(lev).times(100).plus(buff);
    return result.toNumber();
  }

  /**
   * Calculate total trading fees
   * Fees are charged on notional value (margin × leverage)
   */
  static calculateTotalFees(positionValueUSD, entryFee, exitFee) {
    const posValue = new Decimal(positionValueUSD);
    const entry = new Decimal(entryFee);
    const exit = new Decimal(exitFee);
    const result = posValue.times(entry.plus(exit));
    return result.toNumber();
  }

  /**
   * Calculate net P&L after fees
   * Formula: netPnl = grossPnl - entryFee - exitFee - fundingFees
   */
  static calculateNetPnl(grossPnl, positionValueUSD, entryFee, exitFee, fundingFees = 0) {
    const gross = new Decimal(grossPnl);
    const totalFees = this.calculateTotalFees(positionValueUSD, entryFee, exitFee);
    const funding = new Decimal(fundingFees);
    const result = gross.minus(totalFees).minus(funding);
    return result.toNumber();
  }

  /**
   * Calculate ROI-based stop loss price
   * Formula (Long): SL = entry × (1 - ROI_risk / leverage / 100)
   * Formula (Short): SL = entry × (1 + ROI_risk / leverage / 100)
   */
  static calculateStopLossPrice(side, entryPrice, roiRisk, leverage) {
    const entry = new Decimal(entryPrice);
    const roi = new Decimal(roiRisk);
    const lev = new Decimal(leverage);
    const pricePercent = roi.dividedBy(lev).dividedBy(100);
    
    const result = side === 'long'
      ? entry.times(new Decimal(1).minus(pricePercent))
      : entry.times(new Decimal(1).plus(pricePercent));
    
    return result.toNumber();
  }

  /**
   * Calculate ROI-based take profit price
   * Formula (Long): TP = entry × (1 + ROI_reward / leverage / 100)
   * Formula (Short): TP = entry × (1 - ROI_reward / leverage / 100)
   */
  static calculateTakeProfitPrice(side, entryPrice, roiReward, leverage) {
    const entry = new Decimal(entryPrice);
    const roi = new Decimal(roiReward);
    const lev = new Decimal(leverage);
    const pricePercent = roi.dividedBy(lev).dividedBy(100);
    
    const result = side === 'long'
      ? entry.times(new Decimal(1).plus(pricePercent))
      : entry.times(new Decimal(1).minus(pricePercent));
    
    return result.toNumber();
  }

  /**
   * Calculate liquidation price with maintenance margin
   * Formula (Long): liqPrice = entry - (entry / leverage × (1 + maintMargin))
   * Formula (Short): liqPrice = entry + (entry / leverage × (1 + maintMargin))
   */
  static calculateLiquidationPrice(side, entryPrice, leverage, maintMarginPercent = 0.5) {
    const entry = new Decimal(entryPrice);
    const lev = new Decimal(leverage);
    const maintMargin = new Decimal(maintMarginPercent);
    
    const maintMarginFactor = new Decimal(1).plus(maintMargin.dividedBy(100));
    const leverageImpact = entry.dividedBy(lev).times(maintMarginFactor);
    
    const result = side === 'long'
      ? entry.minus(leverageImpact)
      : entry.plus(leverageImpact);
    
    return result.toNumber();
  }

  /**
   * Calculate slippage-adjusted stop price
   * Adds a buffer to account for market order execution slippage
   */
  static calculateSlippageAdjustedStop(side, stopPrice, slippagePercent) {
    const stop = new Decimal(stopPrice);
    const slippage = new Decimal(slippagePercent);
    const slippageFactor = slippage.dividedBy(100);
    
    const result = side === 'long'
      ? stop.times(new Decimal(1).minus(slippageFactor))
      : stop.times(new Decimal(1).plus(slippageFactor));
    
    return result.toNumber();
  }

  /**
   * Calculate trailing stop steps (staircase algorithm)
   * Formula: steps = floor((currentROI - lastTrailedROI) / stepPercent)
   */
  static calculateTrailingSteps(currentROI, lastTrailedROI, stepPercent) {
    const current = new Decimal(currentROI);
    const last = new Decimal(lastTrailedROI);
    const step = new Decimal(stepPercent);
    
    if (current.lte(last)) return 0;
    
    const result = current.minus(last).dividedBy(step).floor();
    return result.toNumber();
  }

  /**
   * Calculate new stop loss after trailing
   * Formula (Long): newSL = currentSL × (1 + steps × movePercent / 100)
   * Formula (Short): newSL = currentSL × (1 - steps × movePercent / 100)
   */
  static calculateTrailedStopLoss(side, currentSL, steps, movePercent) {
    const sl = new Decimal(currentSL);
    const stepsDecimal = new Decimal(steps);
    const move = new Decimal(movePercent);
    
    const totalMove = stepsDecimal.times(move).dividedBy(100);
    
    const result = side === 'long'
      ? sl.times(new Decimal(1).plus(totalMove))
      : sl.times(new Decimal(1).minus(totalMove));
    
    return result.toNumber();
  }

  /**
   * Calculate ATR-based trailing distance
   * Formula: trailingDistance = ATR × multiplier
   */
  static calculateATRTrailingDistance(atr, multiplier = 1.5) {
    const atrDecimal = new Decimal(atr);
    const mult = new Decimal(multiplier);
    const result = atrDecimal.times(mult);
    return result.toNumber();
  }

  /**
   * Calculate volatility-based recommended leverage
   * Uses ATR percentage to determine safe leverage tier
   */
  static calculateAutoLeverage(atrPercent, riskMultiplier, tiers) {
    const atr = new Decimal(atrPercent);
    
    let baseLeverage = 3; // Default to safest
    for (const tier of tiers) {
      if (atr.lt(tier.maxVolatility)) {
        baseLeverage = tier.leverage;
        break;
      }
    }
    
    // Apply risk multiplier and clamp between 1-100
    const mult = new Decimal(riskMultiplier);
    const adjustedLeverage = new Decimal(baseLeverage).times(mult).round();
    const clamped = Decimal.max(1, Decimal.min(100, adjustedLeverage));
    
    return clamped.toNumber();
  }

  /**
   * Round price to tick size and clean floating point errors
   */
  static roundToTickSize(price, tickSize) {
    const priceDecimal = new Decimal(price);
    const tick = new Decimal(tickSize);
    
    const rounded = priceDecimal.dividedBy(tick).round().times(tick);
    
    // Determine decimals from tick size
    const tickStr = tick.toString();
    const decimals = tickStr.includes('.') ? tickStr.split('.')[1].length : 0;
    
    return rounded.toDecimalPlaces(decimals).toNumber();
  }

  /**
   * Round lots to lot size
   */
  static roundToLotSize(lots, lotSize) {
    const lotsDecimal = new Decimal(lots);
    const lotSizeDecimal = new Decimal(lotSize);
    
    const result = lotsDecimal.dividedBy(lotSizeDecimal).floor().times(lotSizeDecimal);
    return result.toNumber();
  }
}

module.exports = DecimalMath;
