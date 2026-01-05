/**
 * ADXIndicator - Average Directional Index with DI+/DI-
 * 
 * Institutional-grade ADX implementation with directional indicators.
 * Measures trend strength and direction using Wilder's smoothing.
 * 
 * Features:
 * - ADX: Trend strength (0-100, >25 = trending)
 * - +DI: Uptrend strength
 * - -DI: Downtrend strength
 * - Wilder's smoothing for stability
 * - O(1) updates after warmup
 */

class ADXIndicator {
  constructor({ period = 14 } = {}) {
    this.period = period;

    this.prevHigh = null;
    this.prevLow = null;
    this.prevClose = null;

    this.trSum = 0;
    this.plusDMSum = 0;
    this.minusDMSum = 0;

    this.atr = null;
    this.plusDI = null;
    this.minusDI = null;
    
    this.dxHistory = [];
    this.adx = null;

    this.samples = 0;
  }

  /**
   * Update ADX with new candle
   * @param {Object} candle - Candle data { close, open, high, low, time }
   * @returns {Object|null} - ADX data or null if not ready
   */
  update(candle) {
    const high = candle.high;
    const low = candle.low;
    const close = candle.close;

    if (this.prevClose === null) {
      this.prevHigh = high;
      this.prevLow = low;
      this.prevClose = close;
      return null;
    }

    // Calculate True Range (TR)
    const tr = Math.max(
      high - low,
      Math.abs(high - this.prevClose),
      Math.abs(low - this.prevClose)
    );

    // Calculate Directional Movement
    const upMove = high - this.prevHigh;
    const downMove = this.prevLow - low;

    let plusDM = 0;
    let minusDM = 0;

    if (upMove > downMove && upMove > 0) {
      plusDM = upMove;
    }
    if (downMove > upMove && downMove > 0) {
      minusDM = downMove;
    }

    // Accumulate sums during initial period
    if (this.samples < this.period) {
      this.trSum += tr;
      this.plusDMSum += plusDM;
      this.minusDMSum += minusDM;
      this.samples++;

      if (this.samples === this.period) {
        // First calculation
        this.atr = this.trSum / this.period;
        const smoothedPlusDM = this.plusDMSum / this.period;
        const smoothedMinusDM = this.minusDMSum / this.period;

        this.plusDI = (smoothedPlusDM / this.atr) * 100;
        this.minusDI = (smoothedMinusDM / this.atr) * 100;

        // Calculate DX
        const dx = this.calculateDX(this.plusDI, this.minusDI);
        this.dxHistory.push(dx);
      }
    } else {
      // Wilder's smoothing
      this.atr = ((this.atr * (this.period - 1)) + tr) / this.period;
      
      const smoothedPlusDM = ((this.plusDMSum * (this.period - 1)) + plusDM) / this.period;
      const smoothedMinusDM = ((this.minusDMSum * (this.period - 1)) + minusDM) / this.period;
      
      this.plusDMSum = smoothedPlusDM;
      this.minusDMSum = smoothedMinusDM;

      this.plusDI = (smoothedPlusDM / this.atr) * 100;
      this.minusDI = (smoothedMinusDM / this.atr) * 100;

      // Calculate DX
      const dx = this.calculateDX(this.plusDI, this.minusDI);
      this.dxHistory.push(dx);

      // Calculate ADX (average of DX)
      if (this.dxHistory.length >= this.period) {
        if (this.adx === null) {
          // First ADX is simple average
          this.adx = this.dxHistory.slice(-this.period).reduce((sum, val) => sum + val, 0) / this.period;
        } else {
          // Subsequent ADX uses Wilder's smoothing
          this.adx = ((this.adx * (this.period - 1)) + dx) / this.period;
        }
      }

      // Keep only necessary history
      if (this.dxHistory.length > this.period * 2) {
        this.dxHistory.shift();
      }
    }

    this.prevHigh = high;
    this.prevLow = low;
    this.prevClose = close;

    if (this.adx === null) {
      return null;
    }

    return {
      adx: this.adx,
      plusDI: this.plusDI,
      minusDI: this.minusDI,
      trend: this.detectTrend()
    };
  }

  /**
   * Calculate Directional Index (DX)
   * @param {number} plusDI - +DI value
   * @param {number} minusDI - -DI value
   * @returns {number} - DX value
   */
  calculateDX(plusDI, minusDI) {
    const diSum = plusDI + minusDI;
    if (diSum === 0) return 0;

    const diDiff = Math.abs(plusDI - minusDI);
    return (diDiff / diSum) * 100;
  }

  /**
   * Detect trend based on ADX and DI lines
   * @returns {string} - Trend: 'strong_uptrend', 'strong_downtrend', 'weak_trend', 'no_trend'
   */
  detectTrend() {
    if (this.adx === null) return 'no_trend';

    const strongThreshold = 25;
    const veryStrongThreshold = 50;

    if (this.adx < strongThreshold) {
      return 'no_trend';
    }

    // Strong trend detected
    if (this.plusDI > this.minusDI) {
      return this.adx > veryStrongThreshold ? 'very_strong_uptrend' : 'strong_uptrend';
    } else {
      return this.adx > veryStrongThreshold ? 'very_strong_downtrend' : 'strong_downtrend';
    }
  }

  /**
   * Get current ADX values
   * @returns {Object|null} - ADX data or null if not ready
   */
  getValue() {
    if (this.adx === null) {
      return null;
    }
    return {
      adx: this.adx,
      plusDI: this.plusDI,
      minusDI: this.minusDI,
      trend: this.detectTrend()
    };
  }

  /**
   * Check if indicator is ready
   * @returns {boolean} - True if ADX is ready
   */
  isReady() {
    return this.adx !== null;
  }

  /**
   * Reset indicator state
   */
  reset() {
    this.prevHigh = null;
    this.prevLow = null;
    this.prevClose = null;
    this.trSum = 0;
    this.plusDMSum = 0;
    this.minusDMSum = 0;
    this.atr = null;
    this.plusDI = null;
    this.minusDI = null;
    this.dxHistory = [];
    this.adx = null;
    this.samples = 0;
  }

  /**
   * Get indicator state for serialization
   * @returns {Object} - State object
   */
  getState() {
    return {
      period: this.period,
      prevHigh: this.prevHigh,
      prevLow: this.prevLow,
      prevClose: this.prevClose,
      trSum: this.trSum,
      plusDMSum: this.plusDMSum,
      minusDMSum: this.minusDMSum,
      atr: this.atr,
      plusDI: this.plusDI,
      minusDI: this.minusDI,
      dxHistory: [...this.dxHistory],
      adx: this.adx,
      samples: this.samples
    };
  }

  /**
   * Restore indicator from saved state
   * @param {Object} state - State object
   */
  setState(state) {
    this.period = state.period;
    this.prevHigh = state.prevHigh;
    this.prevLow = state.prevLow;
    this.prevClose = state.prevClose;
    this.trSum = state.trSum;
    this.plusDMSum = state.plusDMSum;
    this.minusDMSum = state.minusDMSum;
    this.atr = state.atr;
    this.plusDI = state.plusDI;
    this.minusDI = state.minusDI;
    this.dxHistory = [...state.dxHistory];
    this.adx = state.adx;
    this.samples = state.samples;
  }
}

module.exports = ADXIndicator;
