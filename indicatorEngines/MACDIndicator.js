/**
 * MACDIndicator - EMA-based MACD with Full Incremental Calculation
 * 
 * Institutional-grade MACD implementation using exponential moving averages.
 * True incremental calculation - no window recomputation required.
 * 
 * Features:
 * - O(1) updates per candle
 * - Fast/Slow EMA tracking
 * - Signal line with histogram
 * - No hidden allocations per tick
 */

class MACDIndicator {
  constructor({
    fastPeriod = 12,
    slowPeriod = 26,
    signalPeriod = 9
  } = {}) {
    this.fastPeriod = fastPeriod;
    this.slowPeriod = slowPeriod;
    this.signalPeriod = signalPeriod;

    this.alphaFast = 2 / (fastPeriod + 1);
    this.alphaSlow = 2 / (slowPeriod + 1);
    this.alphaSignal = 2 / (signalPeriod + 1);

    this.emaFast = null;
    this.emaSlow = null;
    this.signal = null;

    this.macd = null;
    this.histogram = null;
  }

  /**
   * Update MACD with new candle
   * @param {Object} candle - Candle data { close, open, high, low, time }
   * @returns {Object|null} - MACD data { macd, signal, histogram } or null if not ready
   */
  update(candle) {
    const price = candle.close;

    if (this.emaFast === null) {
      // Initialize EMAs with first price
      this.emaFast = price;
      this.emaSlow = price;
      return null;
    }

    // Update fast and slow EMAs
    this.emaFast = price * this.alphaFast + this.emaFast * (1 - this.alphaFast);
    this.emaSlow = price * this.alphaSlow + this.emaSlow * (1 - this.alphaSlow);

    // Calculate MACD line
    this.macd = this.emaFast - this.emaSlow;

    if (this.signal === null) {
      // Initialize signal line with first MACD value
      this.signal = this.macd;
      return null;
    }

    // Update signal line (EMA of MACD)
    this.signal = this.macd * this.alphaSignal + this.signal * (1 - this.alphaSignal);

    // Calculate histogram (MACD - Signal)
    this.histogram = this.macd - this.signal;

    return {
      macd: this.macd,
      signal: this.signal,
      histogram: this.histogram
    };
  }

  /**
   * Get current MACD values
   * @returns {Object|null} - MACD data or null if not ready
   */
  getValue() {
    if (this.macd === null || this.signal === null) {
      return null;
    }
    return {
      macd: this.macd,
      signal: this.signal,
      histogram: this.histogram
    };
  }

  /**
   * Check if indicator is ready
   * @returns {boolean} - True if MACD is ready
   */
  isReady() {
    return this.macd !== null && this.signal !== null;
  }

  /**
   * Reset indicator state
   */
  reset() {
    this.emaFast = null;
    this.emaSlow = null;
    this.signal = null;
    this.macd = null;
    this.histogram = null;
  }

  /**
   * Get indicator state for serialization
   * @returns {Object} - State object
   */
  getState() {
    return {
      fastPeriod: this.fastPeriod,
      slowPeriod: this.slowPeriod,
      signalPeriod: this.signalPeriod,
      alphaFast: this.alphaFast,
      alphaSlow: this.alphaSlow,
      alphaSignal: this.alphaSignal,
      emaFast: this.emaFast,
      emaSlow: this.emaSlow,
      signal: this.signal,
      macd: this.macd,
      histogram: this.histogram
    };
  }

  /**
   * Restore indicator from saved state
   * @param {Object} state - State object
   */
  setState(state) {
    this.fastPeriod = state.fastPeriod;
    this.slowPeriod = state.slowPeriod;
    this.signalPeriod = state.signalPeriod;
    this.alphaFast = state.alphaFast;
    this.alphaSlow = state.alphaSlow;
    this.alphaSignal = state.alphaSignal;
    this.emaFast = state.emaFast;
    this.emaSlow = state.emaSlow;
    this.signal = state.signal;
    this.macd = state.macd;
    this.histogram = state.histogram;
  }
}

module.exports = MACDIndicator;
