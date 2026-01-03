/**
 * Williams %R Indicator
 *
 * %R = (HighestHigh - Close) / (HighestHigh - LowestLow) * -100
 *
 * Output range: 0 to -100
 *   0     = price at highest high of window
 *  -100   = price at lowest low of window
 *
 * Typical interpretation:
 *   %R < -80  -> oversold (bullish context)
 *   %R > -20  -> overbought (bearish context)
 */

class WilliamsRIndicator {
  constructor(config = {}) {
    this.period = config.period || 14;

    // Rolling window of highs and lows
    this.highs = [];
    this.lows = [];

    this.currentValue = null;
  }

  /**
   * Update indicator with a new candle
   * @param {Object} candle
   * @param {number} candle.high
   * @param {number} candle.low
   * @param {number} candle.close
   * @returns {number|null} latest %R value
   */
  update(candle) {
    const { high, low, close } = candle;

    if (
      typeof high !== 'number' ||
      typeof low !== 'number' ||
      typeof close !== 'number'
    ) {
      throw new Error('WilliamsRIndicator.update requires numeric high, low, close');
    }

    // Push new values
    this.highs.push(high);
    this.lows.push(low);

    // Enforce rolling window size
    if (this.highs.length > this.period) this.highs.shift();
    if (this.lows.length > this.period) this.lows.shift();

    // Need at least 1 value, but reliability improves after full period
    const highestHigh = Math.max(...this.highs);
    const lowestLow = Math.min(...this.lows);

    const range = highestHigh - lowestLow;

    // Prevent division by zero (flat market edge case)
    if (range === 0) {
      this.currentValue = 0;
      return this.currentValue;
    }

    const percentR = ((highestHigh - close) / range) * -100;

    this.currentValue = percentR;
    return percentR;
  }

  /**
   * Returns the latest computed %R value
   * @returns {number|null}
   */
  getValue() {
    return this.currentValue;
  }

  /**
   * Optional helper methods for alignment logic
   */
  isOversold(threshold = -80) {
    return this.currentValue !== null && this.currentValue < threshold;
  }

  isOverbought(threshold = -20) {
    return this.currentValue !== null && this.currentValue > threshold;
  }

  /**
   * Reset internal state (useful on symbol/timeframe reset)
   */
  reset() {
    this.highs = [];
    this.lows = [];
    this.currentValue = null;
  }
}

module.exports = WilliamsRIndicator;

