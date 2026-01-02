/**
 * KDJ Indicator (K-D-J Stochastic Oscillator)
 * 
 * Enhanced stochastic oscillator used in Asian markets.
 * 
 * Formulas:
 *   RSV = (Close - Lowest Low) / (Highest High - Lowest Low) * 100
 *   K = SMA(RSV, smoothK)
 *   D = SMA(K, smoothD)
 *   J = 3 * K - 2 * D
 * 
 * Interpretation:
 *   - J < 0: Extreme oversold (strong buy signal)
 *   - J > 100: Extreme overbought (strong sell signal)
 *   - K crosses above D: Bullish signal
 *   - K crosses below D: Bearish signal
 * 
 * Default parameters:
 *   - period: 9 (lookback window for high/low)
 *   - smoothK: 3 (K smoothing period)
 *   - smoothD: 3 (D smoothing period)
 */

class KDJIndicator {
  constructor(config = {}) {
    this.period = config.period || 9;
    this.smoothK = config.smoothK || 3;
    this.smoothD = config.smoothD || 3;

    // Rolling windows
    this.highs = [];
    this.lows = [];
    this.closes = [];
    
    // RSV values for K smoothing
    this.rsvBuffer = [];
    
    // K values for D smoothing
    this.kBuffer = [];

    // Current values
    this.k = null;
    this.d = null;
    this.j = null;
    
    // Previous values for crossover detection
    this.prevK = null;
    this.prevD = null;
  }

  /**
   * Update indicator with a new candle
   * @param {Object} candle - OHLC candle
   * @param {number} candle.high
   * @param {number} candle.low
   * @param {number} candle.close
   * @returns {Object|null} {k, d, j} or null if not ready
   */
  update(candle) {
    const { high, low, close } = candle;

    if (
      typeof high !== 'number' ||
      typeof low !== 'number' ||
      typeof close !== 'number'
    ) {
      throw new Error('KDJIndicator.update requires numeric high, low, close');
    }

    // Store previous values for crossover detection
    this.prevK = this.k;
    this.prevD = this.d;

    // Add to rolling windows
    this.highs.push(high);
    this.lows.push(low);
    this.closes.push(close);

    // Maintain window size
    if (this.highs.length > this.period) this.highs.shift();
    if (this.lows.length > this.period) this.lows.shift();
    if (this.closes.length > this.period) this.closes.shift();

    // Need full period to calculate
    if (this.highs.length < this.period) {
      return null;
    }

    // Calculate RSV (Raw Stochastic Value)
    const highestHigh = Math.max(...this.highs);
    const lowestLow = Math.min(...this.lows);
    const range = highestHigh - lowestLow;

    let rsv;
    if (range === 0) {
      // Flat market edge case
      rsv = 50; // Neutral value
    } else {
      rsv = ((close - lowestLow) / range) * 100;
    }

    // Add RSV to buffer for K calculation
    this.rsvBuffer.push(rsv);
    if (this.rsvBuffer.length > this.smoothK) {
      this.rsvBuffer.shift();
    }

    // Calculate K (smoothed RSV)
    if (this.rsvBuffer.length === this.smoothK) {
      this.k = this.rsvBuffer.reduce((sum, val) => sum + val, 0) / this.smoothK;
    } else {
      // Not enough data for K yet
      return null;
    }

    // Add K to buffer for D calculation
    this.kBuffer.push(this.k);
    if (this.kBuffer.length > this.smoothD) {
      this.kBuffer.shift();
    }

    // Calculate D (smoothed K)
    if (this.kBuffer.length === this.smoothD) {
      this.d = this.kBuffer.reduce((sum, val) => sum + val, 0) / this.smoothD;
    } else {
      // Not enough data for D yet
      return null;
    }

    // Calculate J (divergence indicator)
    this.j = 3 * this.k - 2 * this.d;

    return {
      k: this.k,
      d: this.d,
      j: this.j
    };
  }

  /**
   * Get current KDJ values
   * @returns {Object|null} {k, d, j} or null if not ready
   */
  getValue() {
    if (this.k === null || this.d === null || this.j === null) {
      return null;
    }
    return {
      k: this.k,
      d: this.d,
      j: this.j
    };
  }

  /**
   * Detect K-D crossover
   * @returns {string|null} 'bullish', 'bearish', or null
   */
  getCrossover() {
    if (this.prevK === null || this.prevD === null || this.k === null || this.d === null) {
      return null;
    }

    // Bullish crossover: K crosses above D
    if (this.prevK <= this.prevD && this.k > this.d) {
      return 'bullish';
    }

    // Bearish crossover: K crosses below D
    if (this.prevK >= this.prevD && this.k < this.d) {
      return 'bearish';
    }

    return null;
  }

  /**
   * Check if J indicates extreme oversold condition
   * @param {number} threshold - Default 0
   * @returns {boolean}
   */
  isOversold(threshold = 0) {
    return this.j !== null && this.j < threshold;
  }

  /**
   * Check if J indicates extreme overbought condition
   * @param {number} threshold - Default 100
   * @returns {boolean}
   */
  isOverbought(threshold = 100) {
    return this.j !== null && this.j > threshold;
  }

  /**
   * Check if indicator is ready
   * @returns {boolean}
   */
  isReady() {
    return this.k !== null && this.d !== null && this.j !== null;
  }

  /**
   * Reset internal state
   */
  reset() {
    this.highs = [];
    this.lows = [];
    this.closes = [];
    this.rsvBuffer = [];
    this.kBuffer = [];
    this.k = null;
    this.d = null;
    this.j = null;
    this.prevK = null;
    this.prevD = null;
  }
}

module.exports = KDJIndicator;
