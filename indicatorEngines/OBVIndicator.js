/**
 * OBVIndicator - On-Balance Volume with Slope Analysis
 * 
 * Institutional-grade OBV implementation with trend detection.
 * Tracks cumulative volume flow with optional EMA smoothing.
 * 
 * Features:
 * - Cumulative volume based on price direction
 * - Slope calculation over configurable window
 * - Optional EMA smoothing
 * - Trend confirmation flags
 * - O(1) updates per candle
 */

class OBVIndicator {
  constructor({
    slopeWindow = 14,
    useEMASmoothing = false,
    emaPeriod = 10
  } = {}) {
    this.slopeWindow = slopeWindow;
    this.useEMASmoothing = useEMASmoothing;
    this.emaPeriod = emaPeriod;
    this.emaAlpha = 2 / (emaPeriod + 1);

    this.obv = 0;
    this.obvSmoothed = null;
    this.obvHistory = [];
    this.prevClose = null;
    
    this.slope = null;
    this.trend = 'neutral'; // 'bullish', 'bearish', 'neutral'
  }

  /**
   * Update OBV with new candle
   * @param {Object} candle - Candle data { close, open, high, low, volume, time }
   * @returns {Object|null} - OBV data or null if not ready
   */
  update(candle) {
    const close = candle.close;
    const volume = candle.volume || 0;

    if (this.prevClose === null) {
      this.prevClose = close;
      this.obv = 0;
      this.obvSmoothed = 0;
      return null;
    }

    // Update OBV based on price direction
    if (close > this.prevClose) {
      this.obv += volume;
    } else if (close < this.prevClose) {
      this.obv -= volume;
    }
    // If close === prevClose, OBV unchanged

    // Apply EMA smoothing if enabled
    if (this.useEMASmoothing) {
      if (this.obvSmoothed === null) {
        this.obvSmoothed = this.obv;
      } else {
        this.obvSmoothed = this.obv * this.emaAlpha + this.obvSmoothed * (1 - this.emaAlpha);
      }
    } else {
      this.obvSmoothed = this.obv;
    }

    // Track OBV history for slope calculation
    this.obvHistory.push(this.obvSmoothed);
    if (this.obvHistory.length > this.slopeWindow) {
      this.obvHistory.shift();
    }

    // Calculate slope if we have enough data
    if (this.obvHistory.length >= this.slopeWindow) {
      this.slope = this.calculateSlope();
      this.trend = this.detectTrend();
    }

    this.prevClose = close;

    return {
      obv: this.obv,
      obvSmoothed: this.obvSmoothed,
      slope: this.slope,
      trend: this.trend
    };
  }

  /**
   * Calculate slope using linear regression
   * @returns {number} - Slope value
   */
  calculateSlope() {
    const n = this.obvHistory.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;

    for (let i = 0; i < n; i++) {
      const x = i;
      const y = this.obvHistory[i];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    // Linear regression slope: (n*sumXY - sumX*sumY) / (n*sumX2 - sumX*sumX)
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    return slope;
  }

  /**
   * Detect trend based on slope
   * @returns {string} - Trend: 'bullish', 'bearish', or 'neutral'
   */
  detectTrend() {
    if (this.slope === null) return 'neutral';

    // Calculate threshold as percentage of average OBV
    const avgOBV = this.obvHistory.reduce((sum, val) => sum + Math.abs(val), 0) / this.obvHistory.length;
    const threshold = avgOBV * 0.001; // 0.1% of average OBV

    if (this.slope > threshold) {
      return 'bullish';
    } else if (this.slope < -threshold) {
      return 'bearish';
    } else {
      return 'neutral';
    }
  }

  /**
   * Get current OBV values
   * @returns {Object|null} - OBV data or null if not ready
   */
  getValue() {
    if (this.obv === 0 && this.prevClose === null) {
      return null;
    }
    return {
      obv: this.obv,
      obvSmoothed: this.obvSmoothed,
      slope: this.slope,
      trend: this.trend
    };
  }

  /**
   * Check if indicator is ready
   * @returns {boolean} - True if OBV is ready
   */
  isReady() {
    return this.prevClose !== null;
  }

  /**
   * Reset indicator state
   */
  reset() {
    this.obv = 0;
    this.obvSmoothed = null;
    this.obvHistory = [];
    this.prevClose = null;
    this.slope = null;
    this.trend = 'neutral';
  }

  /**
   * Get indicator state for serialization
   * @returns {Object} - State object
   */
  getState() {
    return {
      slopeWindow: this.slopeWindow,
      useEMASmoothing: this.useEMASmoothing,
      emaPeriod: this.emaPeriod,
      emaAlpha: this.emaAlpha,
      obv: this.obv,
      obvSmoothed: this.obvSmoothed,
      obvHistory: [...this.obvHistory],
      prevClose: this.prevClose,
      slope: this.slope,
      trend: this.trend
    };
  }

  /**
   * Restore indicator from saved state
   * @param {Object} state - State object
   */
  setState(state) {
    this.slopeWindow = state.slopeWindow;
    this.useEMASmoothing = state.useEMASmoothing;
    this.emaPeriod = state.emaPeriod;
    this.emaAlpha = state.emaAlpha;
    this.obv = state.obv;
    this.obvSmoothed = state.obvSmoothed;
    this.obvHistory = [...state.obvHistory];
    this.prevClose = state.prevClose;
    this.slope = state.slope;
    this.trend = state.trend;
  }
}

module.exports = OBVIndicator;
