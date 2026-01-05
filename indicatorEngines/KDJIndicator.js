/**
 * KDJIndicator - Stochastic Variant with J-Line
 * 
 * Institutional-grade KDJ implementation (K, D, J lines).
 * Extended stochastic oscillator with J-line for early signals.
 * 
 * Features:
 * - K-line: Fast stochastic
 * - D-line: Smoothed K-line
 * - J-line: 3*K - 2*D (leading indicator)
 * - Rolling window for high/low tracking
 * - O(1) updates after warmup
 */

class KDJIndicator {
  constructor({
    kPeriod = 9,
    dPeriod = 3,
    smoothK = 3
  } = {}) {
    this.kPeriod = kPeriod;
    this.dPeriod = dPeriod;
    this.smoothK = smoothK;

    this.highs = [];
    this.lows = [];
    this.closes = [];
    this.kValues = [];

    this.k = null;
    this.d = null;
    this.j = null;
  }

  /**
   * Update KDJ with new candle
   * @param {Object} candle - Candle data { close, open, high, low, time }
   * @returns {Object|null} - KDJ data { k, d, j } or null if not ready
   */
  update(candle) {
    this.highs.push(candle.high);
    this.lows.push(candle.low);
    this.closes.push(candle.close);

    // Maintain rolling window for K period
    if (this.highs.length > this.kPeriod) {
      this.highs.shift();
      this.lows.shift();
      this.closes.shift();
    }

    // Need full K period before calculating
    if (this.highs.length < this.kPeriod) {
      return null;
    }

    const highestHigh = Math.max(...this.highs);
    const lowestLow = Math.min(...this.lows);
    const close = candle.close;

    // Calculate raw stochastic %K (RSV - Raw Stochastic Value)
    let rsv = 50; // Default to midpoint if range is zero
    if (highestHigh !== lowestLow) {
      rsv = ((close - lowestLow) / (highestHigh - lowestLow)) * 100;
    }

    // Smooth K using SMA
    this.kValues.push(rsv);
    if (this.kValues.length > this.smoothK) {
      this.kValues.shift();
    }

    if (this.kValues.length < this.smoothK) {
      return null;
    }

    // K = SMA of RSV
    this.k = this.kValues.reduce((sum, val) => sum + val, 0) / this.smoothK;

    // Initialize D if not set
    if (this.d === null) {
      this.d = this.k;
      this.j = 3 * this.k - 2 * this.d;
      return { k: this.k, d: this.d, j: this.j };
    }

    // D = SMA of K (exponential moving average for smoothness)
    const alpha = 2 / (this.dPeriod + 1);
    this.d = this.k * alpha + this.d * (1 - alpha);

    // J = 3*K - 2*D (leading indicator)
    this.j = 3 * this.k - 2 * this.d;

    return {
      k: this.k,
      d: this.d,
      j: this.j
    };
  }

  /**
   * Get current KDJ values
   * @returns {Object|null} - KDJ data or null if not ready
   */
  getValue() {
    if (this.k === null || this.d === null) {
      return null;
    }
    return {
      k: this.k,
      d: this.d,
      j: this.j
    };
  }

  /**
   * Check if indicator is ready
   * @returns {boolean} - True if KDJ is ready
   */
  isReady() {
    return this.k !== null && this.d !== null;
  }

  /**
   * Reset indicator state
   */
  reset() {
    this.highs = [];
    this.lows = [];
    this.closes = [];
    this.kValues = [];
    this.k = null;
    this.d = null;
    this.j = null;
  }

  /**
   * Get indicator state for serialization
   * @returns {Object} - State object
   */
  getState() {
    return {
      kPeriod: this.kPeriod,
      dPeriod: this.dPeriod,
      smoothK: this.smoothK,
      highs: [...this.highs],
      lows: [...this.lows],
      closes: [...this.closes],
      kValues: [...this.kValues],
      k: this.k,
      d: this.d,
      j: this.j
    };
  }

  /**
   * Restore indicator from saved state
   * @param {Object} state - State object
   */
  setState(state) {
    this.kPeriod = state.kPeriod;
    this.dPeriod = state.dPeriod;
    this.smoothK = state.smoothK;
    this.highs = [...state.highs];
    this.lows = [...state.lows];
    this.closes = [...state.closes];
    this.kValues = [...state.kValues];
    this.k = state.k;
    this.d = state.d;
    this.j = state.j;
  }
}

module.exports = KDJIndicator;
