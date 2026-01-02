/**
 * OBV (On Balance Volume) Indicator Engine
 * ----------------------------------------
 * Implements On Balance Volume with optional smoothing and slope analysis
 * 
 * OBV tracks cumulative volume based on price direction:
 * - If close > previous close: OBV += volume
 * - If close < previous close: OBV -= volume
 * - If close = previous close: OBV unchanged
 * 
 * Optional features:
 * - EMA smoothing for noise reduction
 * - Slope calculation for trend direction
 */

class OBVIndicator {
  constructor(config = {}) {
    this.useSmoothing = config.useSmoothing !== false;
    this.smoothingPeriod = config.smoothingPeriod || 10;
    this.slopeThreshold = config.slopeThreshold || 0;
    this.slopePeriod = config.slopePeriod || 5;
    
    // History buffers
    this.closeBuffer = [];
    this.volumeBuffer = [];
    this.obvBuffer = [];
    this.smoothedObvBuffer = [];
    
    this.currentObv = 0;
    this.currentSmoothedObv = 0;
    this.emaMultiplier = null;
  }

  /**
   * Update indicator with new OHLC data
   * @param {Object} candle - OHLC candle with volume
   * @returns {Object} Current OBV values
   */
  update(candle) {
    const { close, volume } = candle;
    
    // Add to buffers
    this.closeBuffer.push(close);
    this.volumeBuffer.push(volume);
    
    // Keep reasonable buffer size
    const maxLen = Math.max(this.smoothingPeriod, this.slopePeriod) + 20;
    if (this.closeBuffer.length > maxLen) {
      this.closeBuffer.shift();
      this.volumeBuffer.shift();
    }
    
    // Calculate OBV
    if (this.closeBuffer.length === 1) {
      // First candle - initialize OBV
      this.currentObv = volume;
    } else {
      const prevClose = this.closeBuffer[this.closeBuffer.length - 2];
      const currentClose = close;
      
      if (currentClose > prevClose) {
        this.currentObv += volume;
      } else if (currentClose < prevClose) {
        this.currentObv -= volume;
      }
      // If equal, OBV unchanged
    }
    
    this.obvBuffer.push(this.currentObv);
    if (this.obvBuffer.length > maxLen) {
      this.obvBuffer.shift();
    }
    
    // Calculate smoothed OBV if enabled
    if (this.useSmoothing) {
      this.currentSmoothedObv = this._calculateSmoothedObv();
      this.smoothedObvBuffer.push(this.currentSmoothedObv);
      if (this.smoothedObvBuffer.length > maxLen) {
        this.smoothedObvBuffer.shift();
      }
    } else {
      this.currentSmoothedObv = this.currentObv;
    }
    
    return this.getCurrentValues();
  }

  /**
   * Calculate EMA-smoothed OBV
   * @private
   */
  _calculateSmoothedObv() {
    if (!this.emaMultiplier) {
      this.emaMultiplier = 2 / (this.smoothingPeriod + 1);
    }
    
    if (this.smoothedObvBuffer.length === 0) {
      // First smoothed value = current OBV
      return this.currentObv;
    }
    
    const prevEma = this.smoothedObvBuffer[this.smoothedObvBuffer.length - 1];
    const ema = (this.currentObv - prevEma) * this.emaMultiplier + prevEma;
    return ema;
  }

  /**
   * Calculate OBV slope (rate of change)
   * @private
   */
  _calculateSlope() {
    const buffer = this.useSmoothing ? this.smoothedObvBuffer : this.obvBuffer;
    
    if (buffer.length < this.slopePeriod) {
      return 0;
    }
    
    // Calculate linear regression slope over slopePeriod
    const recentObv = buffer.slice(-this.slopePeriod);
    const n = recentObv.length;
    
    // Use simple slope: (last - first) / period
    const slope = (recentObv[n - 1] - recentObv[0]) / n;
    
    // Normalize by current OBV value to get percentage change
    const currentValue = Math.abs(recentObv[n - 1]) || 1;
    const normalizedSlope = (slope / currentValue) * 100;
    
    return normalizedSlope;
  }

  /**
   * Get current OBV values and signal
   * @returns {Object} Current indicator state
   */
  getCurrentValues() {
    const slope = this._calculateSlope();
    const signal = this._getSignal(slope);
    
    return {
      obv: this.currentObv,
      smoothedObv: this.currentSmoothedObv,
      slope: slope,
      signal: signal,
      ready: this.closeBuffer.length >= Math.max(this.smoothingPeriod, this.slopePeriod)
    };
  }

  /**
   * Determine signal based on OBV slope
   * @private
   */
  _getSignal(slope) {
    if (!this.getCurrentValues().ready) {
      return 'neutral';
    }
    
    // Strong signals for significant slope
    if (slope > this.slopeThreshold * 2) {
      return 'strong_bullish';
    }
    if (slope < -this.slopeThreshold * 2) {
      return 'strong_bearish';
    }
    
    // Normal signals
    if (slope > this.slopeThreshold) {
      return 'bullish';
    }
    if (slope < -this.slopeThreshold) {
      return 'bearish';
    }
    
    // Check for divergence with price
    if (this.closeBuffer.length >= this.slopePeriod) {
      const priceSlope = this._getPriceSlope();
      
      // Bullish divergence: price falling but OBV rising
      if (priceSlope < -0.5 && slope > 0.5) {
        return 'bullish_divergence';
      }
      
      // Bearish divergence: price rising but OBV falling
      if (priceSlope > 0.5 && slope < -0.5) {
        return 'bearish_divergence';
      }
    }
    
    return 'neutral';
  }

  /**
   * Calculate price slope for divergence detection
   * @private
   */
  _getPriceSlope() {
    if (this.closeBuffer.length < this.slopePeriod) {
      return 0;
    }
    
    const recentClose = this.closeBuffer.slice(-this.slopePeriod);
    const n = recentClose.length;
    
    const priceChange = (recentClose[n - 1] - recentClose[0]) / recentClose[0] * 100;
    return priceChange / n;
  }

  /**
   * Get indicator contribution for signal scoring
   * @param {number} maxPoints - Maximum points this indicator can contribute
   * @returns {number} Points contributed (-maxPoints to +maxPoints)
   */
  getContribution(maxPoints) {
    const signal = this.getCurrentValues().signal;
    
    switch (signal) {
      case 'strong_bullish':
        return maxPoints;
      case 'bullish':
        return maxPoints * 0.7;
      case 'bullish_divergence':
        return maxPoints * 0.85;  // Divergences are strong signals
      case 'bearish_divergence':
        return -maxPoints * 0.85;
      case 'bearish':
        return -maxPoints * 0.7;
      case 'strong_bearish':
        return -maxPoints;
      default:
        return 0;
    }
  }

  /**
   * Reset indicator state
   */
  reset() {
    this.closeBuffer = [];
    this.volumeBuffer = [];
    this.obvBuffer = [];
    this.smoothedObvBuffer = [];
    this.currentObv = 0;
    this.currentSmoothedObv = 0;
    this.emaMultiplier = null;
  }
}

module.exports = OBVIndicator;
