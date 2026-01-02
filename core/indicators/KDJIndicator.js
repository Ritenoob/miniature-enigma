/**
 * KDJ Indicator Engine
 * --------------------
 * Implements the KDJ indicator (Stochastic derivative with J line)
 * 
 * KDJ is similar to Stochastic Oscillator but includes a J line:
 * K = Current %K (fast stochastic)
 * D = SMA of K (slow stochastic)
 * J = 3*K - 2*D (momentum extension)
 * 
 * The J line is more sensitive and can exceed 0-100 range,
 * providing earlier signals for potential reversals.
 */

class KDJIndicator {
  constructor(config = {}) {
    this.period = config.period || 9;
    this.kPeriod = config.kPeriod || 3;  // Smoothing period for K
    this.dPeriod = config.dPeriod || 3;  // Smoothing period for D
    
    // Thresholds
    this.oversold = config.oversold || 20;
    this.overbought = config.overbought || 80;
    this.jOversold = config.jOversold || 0;
    this.jOverbought = config.jOverbought || 100;
    
    // History buffers
    this.highBuffer = [];
    this.lowBuffer = [];
    this.closeBuffer = [];
    this.rsvBuffer = [];    // Raw Stochastic Value
    this.kBuffer = [];
    this.dBuffer = [];
    this.jBuffer = [];
    
    this.lastK = 50;        // Initialize to neutral
    this.lastD = 50;
    this.lastJ = 50;
  }

  /**
   * Update indicator with new OHLC data
   * @param {Object} candle - OHLC candle
   * @returns {Object} Current KDJ values
   */
  update(candle) {
    const { high, low, close } = candle;
    
    // Add to buffers
    this.highBuffer.push(high);
    this.lowBuffer.push(low);
    this.closeBuffer.push(close);
    
    // Keep only necessary history
    const maxLen = Math.max(this.period, this.kPeriod, this.dPeriod) + 10;
    if (this.highBuffer.length > maxLen) {
      this.highBuffer.shift();
      this.lowBuffer.shift();
      this.closeBuffer.shift();
    }
    
    // Need at least 'period' candles
    if (this.closeBuffer.length < this.period) {
      return this.getCurrentValues();
    }
    
    // Calculate RSV (Raw Stochastic Value)
    const rsv = this._calculateRSV();
    this.rsvBuffer.push(rsv);
    if (this.rsvBuffer.length > maxLen) {
      this.rsvBuffer.shift();
    }
    
    // Calculate K (smoothed RSV)
    const k = this._calculateK(rsv);
    this.kBuffer.push(k);
    if (this.kBuffer.length > maxLen) {
      this.kBuffer.shift();
    }
    this.lastK = k;
    
    // Calculate D (smoothed K)
    const d = this._calculateD();
    this.dBuffer.push(d);
    if (this.dBuffer.length > maxLen) {
      this.dBuffer.shift();
    }
    this.lastD = d;
    
    // Calculate J (3K - 2D)
    const j = 3 * k - 2 * d;
    this.jBuffer.push(j);
    if (this.jBuffer.length > maxLen) {
      this.jBuffer.shift();
    }
    this.lastJ = j;
    
    return this.getCurrentValues();
  }

  /**
   * Calculate Raw Stochastic Value (RSV)
   * RSV = (Close - Lowest Low) / (Highest High - Lowest Low) * 100
   * @private
   */
  _calculateRSV() {
    const recentHigh = this.highBuffer.slice(-this.period);
    const recentLow = this.lowBuffer.slice(-this.period);
    const close = this.closeBuffer[this.closeBuffer.length - 1];
    
    const highestHigh = Math.max(...recentHigh);
    const lowestLow = Math.min(...recentLow);
    
    if (highestHigh === lowestLow) {
      return 50;  // Neutral when no range
    }
    
    const rsv = ((close - lowestLow) / (highestHigh - lowestLow)) * 100;
    return rsv;
  }

  /**
   * Calculate K line (smoothed RSV)
   * K = (Previous K * (kPeriod - 1) + RSV) / kPeriod
   * @private
   */
  _calculateK(rsv) {
    if (this.kBuffer.length === 0) {
      return rsv;  // First K = RSV
    }
    
    const prevK = this.lastK;
    const k = (prevK * (this.kPeriod - 1) + rsv) / this.kPeriod;
    return k;
  }

  /**
   * Calculate D line (smoothed K)
   * D = SMA of K over dPeriod
   * @private
   */
  _calculateD() {
    if (this.kBuffer.length < this.dPeriod) {
      return this.lastK;  // Not enough data, return K
    }
    
    const recentK = this.kBuffer.slice(-this.dPeriod);
    const sum = recentK.reduce((a, b) => a + b, 0);
    return sum / recentK.length;
  }

  /**
   * Get current KDJ values
   * @returns {Object} Current indicator state
   */
  getCurrentValues() {
    return {
      k: this.lastK,
      d: this.lastD,
      j: this.lastJ,
      signal: this._getSignal(),
      ready: this.closeBuffer.length >= this.period
    };
  }

  /**
   * Determine signal based on KDJ values
   * @private
   */
  _getSignal() {
    if (this.closeBuffer.length < this.period) {
      return 'neutral';
    }
    
    const { k, d, j } = this;
    
    // Strong bullish: K and D both oversold, J extremely oversold
    if (this.lastK < this.oversold && 
        this.lastD < this.oversold && 
        this.lastJ < this.jOversold) {
      return 'strong_bullish';
    }
    
    // Strong bearish: K and D both overbought, J extremely overbought
    if (this.lastK > this.overbought && 
        this.lastD > this.overbought && 
        this.lastJ > this.jOverbought) {
      return 'strong_bearish';
    }
    
    // Bullish: K crosses above D in oversold region
    if (this.kBuffer.length >= 2 && this.dBuffer.length >= 2) {
      const prevK = this.kBuffer[this.kBuffer.length - 2];
      const prevD = this.dBuffer[this.dBuffer.length - 2];
      
      if (prevK <= prevD && this.lastK > this.lastD && this.lastD < 50) {
        return 'bullish';
      }
      
      // Bearish: K crosses below D in overbought region
      if (prevK >= prevD && this.lastK < this.lastD && this.lastD > 50) {
        return 'bearish';
      }
    }
    
    // Mild signals based on levels
    if (this.lastK < this.oversold || this.lastJ < this.jOversold) {
      return 'mild_bullish';
    }
    
    if (this.lastK > this.overbought || this.lastJ > this.jOverbought) {
      return 'mild_bearish';
    }
    
    return 'neutral';
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
    this.rsvBuffer = [];
    this.kBuffer = [];
    this.dBuffer = [];
    this.jBuffer = [];
    this.lastK = 50;
    this.lastD = 50;
    this.lastJ = 50;
  }
}

module.exports = KDJIndicator;
