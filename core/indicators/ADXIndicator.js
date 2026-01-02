/**
 * ADX (Average Directional Index) Indicator Engine
 * -------------------------------------------------
 * Implements ADX with +DI and -DI for trend strength analysis
 * 
 * ADX measures trend strength (0-100):
 * - Below 20: Weak/no trend (range-bound)
 * - 20-25: Emerging trend
 * - 25-50: Strong trend
 * - Above 50: Very strong trend
 * 
 * +DI and -DI indicate trend direction:
 * - +DI > -DI: Bullish trend
 * - -DI > +DI: Bearish trend
 */

class ADXIndicator {
  constructor(config = {}) {
    this.period = config.period || 14;
    this.trendThreshold = config.trendThreshold || 25;
    this.strongTrend = config.strongTrend || 40;
    
    // History buffers
    this.highBuffer = [];
    this.lowBuffer = [];
    this.closeBuffer = [];
    this.trBuffer = [];      // True Range
    this.plusDMBuffer = [];  // +DM (Directional Movement)
    this.minusDMBuffer = []; // -DM
    this.plusDIBuffer = [];  // +DI (Directional Indicator)
    this.minusDIBuffer = []; // -DI
    this.dxBuffer = [];      // DX (Directional Index)
    this.adxBuffer = [];     // ADX
    
    this.currentADX = 0;
    this.currentPlusDI = 0;
    this.currentMinusDI = 0;
  }

  /**
   * Update indicator with new OHLC data
   * @param {Object} candle - OHLC candle
   * @returns {Object} Current ADX values
   */
  update(candle) {
    const { high, low, close } = candle;
    
    // Add to buffers
    this.highBuffer.push(high);
    this.lowBuffer.push(low);
    this.closeBuffer.push(close);
    
    // Keep reasonable buffer size
    const maxLen = this.period * 3;
    if (this.highBuffer.length > maxLen) {
      this.highBuffer.shift();
      this.lowBuffer.shift();
      this.closeBuffer.shift();
    }
    
    // Need at least 2 candles to start
    if (this.closeBuffer.length < 2) {
      return this.getCurrentValues();
    }
    
    // Calculate True Range (TR)
    const tr = this._calculateTR();
    this.trBuffer.push(tr);
    if (this.trBuffer.length > maxLen) {
      this.trBuffer.shift();
    }
    
    // Calculate Directional Movement (+DM and -DM)
    const { plusDM, minusDM } = this._calculateDM();
    this.plusDMBuffer.push(plusDM);
    this.minusDMBuffer.push(minusDM);
    if (this.plusDMBuffer.length > maxLen) {
      this.plusDMBuffer.shift();
      this.minusDMBuffer.shift();
    }
    
    // Need period candles to calculate smoothed values
    if (this.trBuffer.length < this.period) {
      return this.getCurrentValues();
    }
    
    // Calculate smoothed TR, +DM, -DM
    const smoothedTR = this._calculateSmoothed(this.trBuffer);
    const smoothedPlusDM = this._calculateSmoothed(this.plusDMBuffer);
    const smoothedMinusDM = this._calculateSmoothed(this.minusDMBuffer);
    
    // Calculate +DI and -DI
    this.currentPlusDI = smoothedTR > 0 ? (smoothedPlusDM / smoothedTR) * 100 : 0;
    this.currentMinusDI = smoothedTR > 0 ? (smoothedMinusDM / smoothedTR) * 100 : 0;
    
    this.plusDIBuffer.push(this.currentPlusDI);
    this.minusDIBuffer.push(this.currentMinusDI);
    if (this.plusDIBuffer.length > maxLen) {
      this.plusDIBuffer.shift();
      this.minusDIBuffer.shift();
    }
    
    // Calculate DX (Directional Index)
    const dx = this._calculateDX();
    this.dxBuffer.push(dx);
    if (this.dxBuffer.length > maxLen) {
      this.dxBuffer.shift();
    }
    
    // Calculate ADX (smoothed DX)
    if (this.dxBuffer.length >= this.period) {
      this.currentADX = this._calculateSmoothed(this.dxBuffer);
      this.adxBuffer.push(this.currentADX);
      if (this.adxBuffer.length > maxLen) {
        this.adxBuffer.shift();
      }
    }
    
    return this.getCurrentValues();
  }

  /**
   * Calculate True Range
   * TR = max(high - low, |high - prevClose|, |low - prevClose|)
   * @private
   */
  _calculateTR() {
    const high = this.highBuffer[this.highBuffer.length - 1];
    const low = this.lowBuffer[this.lowBuffer.length - 1];
    const prevClose = this.closeBuffer[this.closeBuffer.length - 2];
    
    const tr1 = high - low;
    const tr2 = Math.abs(high - prevClose);
    const tr3 = Math.abs(low - prevClose);
    
    return Math.max(tr1, tr2, tr3);
  }

  /**
   * Calculate Directional Movement
   * +DM = current high - previous high (if positive and > -DM, else 0)
   * -DM = previous low - current low (if positive and > +DM, else 0)
   * @private
   */
  _calculateDM() {
    const currentHigh = this.highBuffer[this.highBuffer.length - 1];
    const currentLow = this.lowBuffer[this.lowBuffer.length - 1];
    const prevHigh = this.highBuffer[this.highBuffer.length - 2];
    const prevLow = this.lowBuffer[this.lowBuffer.length - 2];
    
    const upMove = currentHigh - prevHigh;
    const downMove = prevLow - currentLow;
    
    let plusDM = 0;
    let minusDM = 0;
    
    if (upMove > downMove && upMove > 0) {
      plusDM = upMove;
    }
    if (downMove > upMove && downMove > 0) {
      minusDM = downMove;
    }
    
    return { plusDM, minusDM };
  }

  /**
   * Calculate Wilder's smoothing (similar to EMA)
   * @private
   */
  _calculateSmoothed(buffer) {
    if (buffer.length < this.period) {
      return 0;
    }
    
    // For first calculation, use simple average
    if (buffer.length === this.period) {
      return buffer.reduce((a, b) => a + b, 0) / this.period;
    }
    
    // Wilder's smoothing: (prevSmoothed * (period - 1) + current) / period
    const recent = buffer.slice(-this.period);
    const sum = recent.reduce((a, b) => a + b, 0);
    return sum / this.period;
  }

  /**
   * Calculate DX (Directional Index)
   * DX = (|+DI - -DI| / |+DI + -DI|) * 100
   * @private
   */
  _calculateDX() {
    const diSum = this.currentPlusDI + this.currentMinusDI;
    if (diSum === 0) {
      return 0;
    }
    
    const diDiff = Math.abs(this.currentPlusDI - this.currentMinusDI);
    const dx = (diDiff / diSum) * 100;
    return dx;
  }

  /**
   * Get current ADX values and signal
   * @returns {Object} Current indicator state
   */
  getCurrentValues() {
    const signal = this._getSignal();
    
    return {
      adx: this.currentADX,
      plusDI: this.currentPlusDI,
      minusDI: this.currentMinusDI,
      signal: signal,
      trendStrength: this._getTrendStrength(),
      ready: this.adxBuffer.length > 0
    };
  }

  /**
   * Get trend strength classification
   * @private
   */
  _getTrendStrength() {
    if (this.currentADX < 20) {
      return 'no_trend';
    } else if (this.currentADX < this.trendThreshold) {
      return 'weak_trend';
    } else if (this.currentADX < this.strongTrend) {
      return 'trend';
    } else {
      return 'strong_trend';
    }
  }

  /**
   * Determine signal based on ADX and DI
   * @private
   */
  _getSignal() {
    if (!this.getCurrentValues().ready) {
      return 'neutral';
    }
    
    const trendStrength = this._getTrendStrength();
    
    // No clear trend
    if (trendStrength === 'no_trend') {
      return 'neutral';
    }
    
    // Determine direction from DI
    const isUptrend = this.currentPlusDI > this.currentMinusDI;
    const diDiff = Math.abs(this.currentPlusDI - this.currentMinusDI);
    
    // Need significant DI difference for clear signal
    if (diDiff < 5) {
      return 'neutral';
    }
    
    // Strong trend signals
    if (trendStrength === 'strong_trend') {
      return isUptrend ? 'strong_bullish' : 'strong_bearish';
    }
    
    // Normal trend signals
    if (trendStrength === 'trend') {
      return isUptrend ? 'bullish' : 'bearish';
    }
    
    // Weak trend signals
    return isUptrend ? 'mild_bullish' : 'mild_bearish';
  }

  /**
   * Get indicator contribution for signal scoring
   * @param {number} maxPoints - Maximum points this indicator can contribute
   * @returns {number} Points contributed (-maxPoints to +maxPoints)
   */
  getContribution(maxPoints) {
    const signal = this._getSignal();
    
    switch (signal) {
      case 'strong_bullish':
        return maxPoints;
      case 'bullish':
        return maxPoints * 0.7;
      case 'mild_bullish':
        return maxPoints * 0.4;
      case 'mild_bearish':
        return -maxPoints * 0.4;
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
    this.highBuffer = [];
    this.lowBuffer = [];
    this.closeBuffer = [];
    this.trBuffer = [];
    this.plusDMBuffer = [];
    this.minusDMBuffer = [];
    this.plusDIBuffer = [];
    this.minusDIBuffer = [];
    this.dxBuffer = [];
    this.adxBuffer = [];
    this.currentADX = 0;
    this.currentPlusDI = 0;
    this.currentMinusDI = 0;
  }
}

module.exports = ADXIndicator;
