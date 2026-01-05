// indicatorEngines/RSIIndicator.js

class RSIIndicator {
  constructor(options = {}) {
    const {
      period = 14,
      history = null // optional array of historical closes
    } = options;

    if (period <= 0) {
      throw new Error('RSI period must be > 0');
    }

    this.period = period;

    // Internal state
    this.prevClose = null;
    this.avgGain = null;
    this.avgLoss = null;
    this.rsi = null;

    // Warm-up buffers
    this._gains = [];
    this._losses = [];
    this._initialized = false;

    if (Array.isArray(history) && history.length >= period + 1) {
      this._initializeFromHistory(history);
    }
  }

  /**
   * Initialize RSI using historical closes.
   * Uses classic Wilder method:
   * - First avgGain/avgLoss = simple average of first period gains/losses
   */
  _initializeFromHistory(closes) {
    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= this.period; i++) {
      const change = closes[i] - closes[i - 1];
      if (change >= 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    this.avgGain = gains / this.period;
    this.avgLoss = losses / this.period;
    this.prevClose = closes[this.period];
    this._initialized = true;

    this._computeRSI();
  }

  /**
   * Update RSI with a new candle or close price.
   * @param {Object|number} input - candle object with close or raw close price
   * @returns {number|null} RSI value (0–100) or null if not ready
   */
  update(input) {
    const close =
      typeof input === 'number'
        ? input
        : input && typeof input.close === 'number'
          ? input.close
          : null;

    if (close === null) {
      throw new Error('RSI update requires a close price');
    }

    if (this.prevClose === null) {
      this.prevClose = close;
      return null;
    }

    const change = close - this.prevClose;
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);

    // Warm-up phase (collect first period gains/losses)
    if (!this._initialized) {
      this._gains.push(gain);
      this._losses.push(loss);

      if (this._gains.length === this.period) {
        const sumGain = this._gains.reduce((a, b) => a + b, 0);
        const sumLoss = this._losses.reduce((a, b) => a + b, 0);

        this.avgGain = sumGain / this.period;
        this.avgLoss = sumLoss / this.period;
        this._initialized = true;

        this._computeRSI();
      }

      this.prevClose = close;
      return null;
    }

    // Wilder smoothing update
    this.avgGain =
      ((this.avgGain * (this.period - 1)) + gain) / this.period;

    this.avgLoss =
      ((this.avgLoss * (this.period - 1)) + loss) / this.period;

    this.prevClose = close;
    this._computeRSI();

    return this.rsi;
  }

  /**
   * Compute RSI from avgGain / avgLoss
   */
  _computeRSI() {
    if (this.avgLoss === 0) {
      this.rsi = 100;
      return;
    }

    if (this.avgGain === 0) {
      this.rsi = 0;
      return;
    }

    const rs = this.avgGain / this.avgLoss;
    this.rsi = 100 - (100 / (1 + rs));
  }

  /**
   * Get last RSI value without updating
   */
  getValue() {
    return this.rsi;
  }

  /**
   * Whether RSI is fully initialized and valid
   */
  isReady() {
    return this._initialized;
  }
}

module.exports = RSIIndicator;

