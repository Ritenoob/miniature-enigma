/**
 * OBV Indicator (On-Balance Volume)
 * 
 * Volume-based momentum indicator that accumulates volume on up days
 * and subtracts volume on down days.
 * 
 * Formula:
 *   If close > prevClose: OBV = prevOBV + volume
 *   If close < prevClose: OBV = prevOBV - volume
 *   If close = prevClose: OBV = prevOBV
 * 
 * Optional EMA smoothing to reduce noise.
 * 
 * Interpretation:
 *   - Rising OBV + Rising Price: Bullish confirmation
 *   - Falling OBV + Falling Price: Bearish confirmation
 *   - Divergence (price up, OBV down): Potential reversal
 * 
 * Slope detection using linear regression to identify trends.
 */

class OBVIndicator {
  constructor(config = {}) {
    this.useEma = config.useEma || false;
    this.emaPeriod = config.emaPeriod || 20;
    this.slopePeriod = config.slopePeriod || 14; // Period for slope calculation
    
    // OBV state
    this.obv = 0;
    this.prevClose = null;
    
    // EMA smoothing
    this.emaAlpha = 2 / (this.emaPeriod + 1);
    this.emaObv = null;
    
    // Slope calculation buffer
    this.obvHistory = [];
    this.currentSlope = null;
  }

  /**
   * Update indicator with a new candle
   * @param {Object} candle - OHLC candle with volume
   * @param {number} candle.close
   * @param {number} candle.volume
   * @returns {Object|null} {obv, emaObv (if enabled), slope} or null if not ready
   */
  update(candle) {
    const { close, volume } = candle;

    if (typeof close !== 'number' || typeof volume !== 'number') {
      throw new Error('OBVIndicator.update requires numeric close and volume');
    }

    // Initialize on first candle
    if (this.prevClose === null) {
      this.prevClose = close;
      this.obv = 0;
      return null;
    }

    // Update OBV based on price direction
    if (close > this.prevClose) {
      this.obv += volume;
    } else if (close < this.prevClose) {
      this.obv -= volume;
    }
    // If close === prevClose, OBV stays the same

    this.prevClose = close;

    // Apply EMA smoothing if enabled
    if (this.useEma) {
      if (this.emaObv === null) {
        this.emaObv = this.obv; // Initialize with first OBV value
      } else {
        this.emaObv = this.obv * this.emaAlpha + this.emaObv * (1 - this.emaAlpha);
      }
    }

    // Update history for slope calculation
    this.obvHistory.push(this.obv);
    if (this.obvHistory.length > this.slopePeriod) {
      this.obvHistory.shift();
    }

    // Calculate slope using linear regression
    if (this.obvHistory.length >= this.slopePeriod) {
      this.currentSlope = this._calculateSlope();
    }

    return {
      obv: this.obv,
      emaObv: this.emaObv,
      slope: this.currentSlope
    };
  }

  /**
   * Calculate slope using simple linear regression
   * @returns {number} Slope value
   * @private
   */
  _calculateSlope() {
    const n = this.obvHistory.length;
    if (n < 2) return 0;

    // Use index as x-values (0, 1, 2, ...)
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += this.obvHistory[i];
      sumXY += i * this.obvHistory[i];
      sumX2 += i * i;
    }

    // Slope formula: (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const numerator = n * sumXY - sumX * sumY;
    const denominator = n * sumX2 - sumX * sumX;

    if (denominator === 0) return 0;

    return numerator / denominator;
  }

  /**
   * Get current OBV value
   * @returns {number}
   */
  getValue() {
    return this.obv;
  }

  /**
   * Get current EMA-smoothed OBV (if enabled)
   * @returns {number|null}
   */
  getEmaValue() {
    return this.emaObv;
  }

  /**
   * Get current slope
   * @returns {number|null}
   */
  getSlope() {
    return this.currentSlope;
  }

  /**
   * Check if OBV is bullish (positive slope)
   * @param {number} threshold - Minimum slope to be considered bullish
   * @returns {boolean}
   */
  isBullish(threshold = 0) {
    return this.currentSlope !== null && this.currentSlope > threshold;
  }

  /**
   * Check if OBV is bearish (negative slope)
   * @param {number} threshold - Maximum slope to be considered bearish (negative)
   * @returns {boolean}
   */
  isBearish(threshold = 0) {
    return this.currentSlope !== null && this.currentSlope < -threshold;
  }

  /**
   * Check if indicator is ready
   * @returns {boolean}
   */
  isReady() {
    return this.obv !== 0 || this.prevClose !== null;
  }

  /**
   * Reset internal state
   */
  reset() {
    this.obv = 0;
    this.prevClose = null;
    this.emaObv = null;
    this.obvHistory = [];
    this.currentSlope = null;
  }
}

module.exports = OBVIndicator;
