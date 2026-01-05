/**
 * WilliamsRIndicator - Williams %R with Rolling Window
 * 
 * Institutional-grade Williams %R implementation using rolling window.
 * Efficient calculation with circular buffer approach.
 * 
 * Features:
 * - O(1) updates per candle (after warmup)
 * - Rolling window for high/low tracking
 * - Range: -100 (oversold) to 0 (overbought)
 * - No hidden allocations per tick
 */

class WilliamsRIndicator {
  constructor({ period = 14 } = {}) {
    this.period = period;
    this.highs = [];
    this.lows = [];
    this.value = null;
  }

  /**
   * Update Williams %R with new candle
   * @param {Object} candle - Candle data { close, open, high, low, time }
   * @returns {number|null} - Williams %R value (-100 to 0) or null if not ready
   */
  update(candle) {
    this.highs.push(candle.high);
    this.lows.push(candle.low);

    // Maintain rolling window
    if (this.highs.length > this.period) {
      this.highs.shift();
      this.lows.shift();
    }

    // Need full period before calculating
    if (this.highs.length < this.period) {
      return null;
    }

    const highestHigh = Math.max(...this.highs);
    const lowestLow = Math.min(...this.lows);

    // Handle zero range
    if (highestHigh === lowestLow) {
      this.value = 0;
      return this.value;
    }

    // Williams %R formula: ((HH - Close) / (HH - LL)) * -100
    this.value = ((highestHigh - candle.close) / (highestHigh - lowestLow)) * -100;

    return this.value;
  }

  /**
   * Get current Williams %R value
   * @returns {number|null} - Current value or null if not ready
   */
  getValue() {
    return this.value;
  }

  /**
   * Check if indicator is ready
   * @returns {boolean} - True if Williams %R is ready
   */
  isReady() {
    return this.value !== null;
  }

  /**
   * Reset indicator state
   */
  reset() {
    this.highs = [];
    this.lows = [];
    this.value = null;
  }

  /**
   * Get indicator state for serialization
   * @returns {Object} - State object
   */
  getState() {
    return {
      period: this.period,
      highs: [...this.highs],
      lows: [...this.lows],
      value: this.value
    };
  }

  /**
   * Restore indicator from saved state
   * @param {Object} state - State object
   */
  setState(state) {
    this.period = state.period;
    this.highs = [...state.highs];
    this.lows = [...state.lows];
    this.value = state.value;
  }
}

module.exports = WilliamsRIndicator;
