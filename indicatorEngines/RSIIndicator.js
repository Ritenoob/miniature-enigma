/**
 * RSIIndicator - Wilder RSI with Incremental Calculation
 * 
 * Institutional-grade RSI implementation using Wilder's smoothing method.
 * True incremental calculation - no window recomputation required.
 * 
 * Features:
 * - O(1) updates per candle
 * - Deterministic startup behavior
 * - No hidden allocations per tick
 * - Safe for 40+ live WebSocket streams
 */

class RSIIndicator {
  constructor({ period = 14 } = {}) {
    this.period = period;
    this.prevClose = null;

    this.avgGain = null;
    this.avgLoss = null;

    this.gainSum = 0;
    this.lossSum = 0;
    this.samples = 0;

    this.value = null;
  }

  /**
   * Update RSI with new candle
   * @param {Object} candle - Candle data { close, open, high, low, time }
   * @returns {number|null} - RSI value (0-100) or null if not ready
   */
  update(candle) {
    const close = candle.close;

    if (this.prevClose === null) {
      this.prevClose = close;
      return null;
    }

    const change = close - this.prevClose;
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    if (this.samples < this.period) {
      // Initial period: accumulate gains and losses
      this.gainSum += gain;
      this.lossSum += loss;
      this.samples++;

      if (this.samples === this.period) {
        // First RSI calculation
        this.avgGain = this.gainSum / this.period;
        this.avgLoss = this.lossSum / this.period;
        this.value = this.computeRSI();
      }
    } else {
      // Wilder's smoothing: incremental average
      this.avgGain = ((this.avgGain * (this.period - 1)) + gain) / this.period;
      this.avgLoss = ((this.avgLoss * (this.period - 1)) + loss) / this.period;

      this.value = this.computeRSI();
    }

    this.prevClose = close;
    return this.value;
  }

  /**
   * Compute RSI from current averages
   * @returns {number} - RSI value (0-100)
   */
  computeRSI() {
    if (this.avgLoss === 0) return 100;
    if (this.avgGain === 0) return 0;

    const rs = this.avgGain / this.avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * Get current RSI value
   * @returns {number|null} - Current RSI or null if not ready
   */
  getValue() {
    return this.value;
  }

  /**
   * Check if indicator is ready
   * @returns {boolean} - True if RSI is ready
   */
  isReady() {
    return this.value !== null;
  }

  /**
   * Reset indicator state
   */
  reset() {
    this.prevClose = null;
    this.avgGain = null;
    this.avgLoss = null;
    this.gainSum = 0;
    this.lossSum = 0;
    this.samples = 0;
    this.value = null;
  }

  /**
   * Get indicator state for serialization
   * @returns {Object} - State object
   */
  getState() {
    return {
      period: this.period,
      prevClose: this.prevClose,
      avgGain: this.avgGain,
      avgLoss: this.avgLoss,
      gainSum: this.gainSum,
      lossSum: this.lossSum,
      samples: this.samples,
      value: this.value
    };
  }

  /**
   * Restore indicator from saved state
   * @param {Object} state - State object
   */
  setState(state) {
    this.period = state.period;
    this.prevClose = state.prevClose;
    this.avgGain = state.avgGain;
    this.avgLoss = state.avgLoss;
    this.gainSum = state.gainSum;
    this.lossSum = state.lossSum;
    this.samples = state.samples;
    this.value = state.value;
  }
}

module.exports = RSIIndicator;
