/**
 * ADX Indicator (Average Directional Index)
 * 
 * Measures trend strength regardless of direction.
 * Also computes DI+ and DI- for directional information.
 * 
 * Formulas:
 *   TR = max(high - low, |high - prevClose|, |low - prevClose|)
 *   +DM = high - prevHigh (if positive, else 0)
 *   -DM = prevLow - low (if positive, else 0)
 *   
 *   Smoothed TR, +DM, -DM using Wilder's smoothing
 *   +DI = 100 * smoothed(+DM) / smoothed(TR)
 *   -DI = 100 * smoothed(-DM) / smoothed(TR)
 *   
 *   DX = 100 * |+DI - -DI| / (+DI + -DI)
 *   ADX = smoothed(DX)
 * 
 * Interpretation:
 *   - ADX < 20: Weak trend or ranging market
 *   - ADX 20-25: Emerging trend
 *   - ADX 25-50: Strong trend
 *   - ADX > 50: Very strong trend
 *   - +DI > -DI: Uptrend
 *   - -DI > +DI: Downtrend
 * 
 * Default period: 14
 */

class ADXIndicator {
  constructor(config = {}) {
    this.period = config.period || 14;
    
    // Previous candle data for calculations
    this.prevHigh = null;
    this.prevLow = null;
    this.prevClose = null;
    
    // Smoothed values (using Wilder's method)
    this.smoothedTR = null;
    this.smoothedPlusDM = null;
    this.smoothedMinusDM = null;
    
    // DX buffer for ADX smoothing
    this.dxBuffer = [];
    this.smoothedDX = null; // This is ADX
    
    // Current values
    this.plusDI = null;
    this.minusDI = null;
    this.adx = null;
    
    // Initialization counters
    this.initCount = 0;
    this.trBuffer = [];
    this.plusDMBuffer = [];
    this.minusDMBuffer = [];
  }

  /**
   * Update indicator with a new candle
   * @param {Object} candle - OHLC candle
   * @param {number} candle.high
   * @param {number} candle.low
   * @param {number} candle.close
   * @returns {Object|null} {adx, plusDI, minusDI} or null if not ready
   */
  update(candle) {
    const { high, low, close } = candle;

    if (
      typeof high !== 'number' ||
      typeof low !== 'number' ||
      typeof close !== 'number'
    ) {
      throw new Error('ADXIndicator.update requires numeric high, low, close');
    }

    // Need previous candle to calculate
    if (this.prevHigh === null) {
      this.prevHigh = high;
      this.prevLow = low;
      this.prevClose = close;
      return null;
    }

    // Calculate True Range
    const tr = Math.max(
      high - low,
      Math.abs(high - this.prevClose),
      Math.abs(low - this.prevClose)
    );

    // Calculate Directional Movement
    const highDiff = high - this.prevHigh;
    const lowDiff = this.prevLow - low;
    
    let plusDM = 0;
    let minusDM = 0;
    
    if (highDiff > lowDiff && highDiff > 0) {
      plusDM = highDiff;
    }
    if (lowDiff > highDiff && lowDiff > 0) {
      minusDM = lowDiff;
    }

    // Store for next iteration
    this.prevHigh = high;
    this.prevLow = low;
    this.prevClose = close;

    // Initialization phase - collect first period values
    if (this.smoothedTR === null) {
      this.trBuffer.push(tr);
      this.plusDMBuffer.push(plusDM);
      this.minusDMBuffer.push(minusDM);
      
      if (this.trBuffer.length === this.period) {
        // Initialize smoothed values with sum of first period
        this.smoothedTR = this.trBuffer.reduce((sum, val) => sum + val, 0);
        this.smoothedPlusDM = this.plusDMBuffer.reduce((sum, val) => sum + val, 0);
        this.smoothedMinusDM = this.minusDMBuffer.reduce((sum, val) => sum + val, 0);
        
        // Clear buffers
        this.trBuffer = [];
        this.plusDMBuffer = [];
        this.minusDMBuffer = [];
      } else {
        return null;
      }
    } else {
      // Wilder's smoothing: smoothed = prev - (prev / period) + current
      this.smoothedTR = this.smoothedTR - (this.smoothedTR / this.period) + tr;
      this.smoothedPlusDM = this.smoothedPlusDM - (this.smoothedPlusDM / this.period) + plusDM;
      this.smoothedMinusDM = this.smoothedMinusDM - (this.smoothedMinusDM / this.period) + minusDM;
    }

    // Calculate DI+ and DI-
    if (this.smoothedTR === 0) {
      this.plusDI = 0;
      this.minusDI = 0;
    } else {
      this.plusDI = 100 * (this.smoothedPlusDM / this.smoothedTR);
      this.minusDI = 100 * (this.smoothedMinusDM / this.smoothedTR);
    }

    // Calculate DX
    const diSum = this.plusDI + this.minusDI;
    let dx = 0;
    
    if (diSum > 0) {
      dx = 100 * Math.abs(this.plusDI - this.minusDI) / diSum;
    }

    // Smooth DX to get ADX
    this.dxBuffer.push(dx);
    
    if (this.dxBuffer.length < this.period) {
      // Not enough DX values yet
      return null;
    }
    
    if (this.dxBuffer.length === this.period) {
      // Initialize ADX with average of first period DX values
      this.smoothedDX = this.dxBuffer.reduce((sum, val) => sum + val, 0) / this.period;
      this.adx = this.smoothedDX;
    } else {
      // Wilder's smoothing for ADX
      this.dxBuffer.shift(); // Keep only last period values
      this.smoothedDX = this.smoothedDX - (this.smoothedDX / this.period) + dx;
      this.adx = this.smoothedDX;
    }

    return {
      adx: this.adx,
      plusDI: this.plusDI,
      minusDI: this.minusDI
    };
  }

  /**
   * Get current ADX, +DI, -DI values
   * @returns {Object|null} {adx, plusDI, minusDI} or null if not ready
   */
  getValue() {
    if (this.adx === null) {
      return null;
    }
    return {
      adx: this.adx,
      plusDI: this.plusDI,
      minusDI: this.minusDI
    };
  }

  /**
   * Check if market is trending
   * @param {number} threshold - ADX threshold for trend (default 25)
   * @returns {boolean}
   */
  isTrending(threshold = 25) {
    return this.adx !== null && this.adx > threshold;
  }

  /**
   * Check if trend is strong
   * @param {number} threshold - ADX threshold for strong trend (default 40)
   * @returns {boolean}
   */
  isStrongTrend(threshold = 40) {
    return this.adx !== null && this.adx > threshold;
  }

  /**
   * Get trend direction based on DI+ and DI-
   * @returns {string|null} 'up', 'down', or null if not ready
   */
  getTrendDirection() {
    if (this.plusDI === null || this.minusDI === null) {
      return null;
    }
    
    if (this.plusDI > this.minusDI) {
      return 'up';
    } else if (this.minusDI > this.plusDI) {
      return 'down';
    }
    
    return null;
  }

  /**
   * Check if indicator is ready
   * @returns {boolean}
   */
  isReady() {
    return this.adx !== null;
  }

  /**
   * Reset internal state
   */
  reset() {
    this.prevHigh = null;
    this.prevLow = null;
    this.prevClose = null;
    this.smoothedTR = null;
    this.smoothedPlusDM = null;
    this.smoothedMinusDM = null;
    this.dxBuffer = [];
    this.smoothedDX = null;
    this.plusDI = null;
    this.minusDI = null;
    this.adx = null;
    this.initCount = 0;
    this.trBuffer = [];
    this.plusDMBuffer = [];
    this.minusDMBuffer = [];
  }
}

module.exports = ADXIndicator;
