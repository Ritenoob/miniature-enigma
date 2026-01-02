// RSIIndicator.js
// Production-grade Wilder RSI engine (incremental, deterministic, O(1))

class RSIIndicator {
  constructor(config = {}) {
    const {
      period = 14,
      overbought = 70,
      oversold = 30,
      seedCloses = null
    } = config;

    if (!Number.isInteger(period) || period <= 0) {
      throw new Error("RSI period must be a positive integer");
    }

    this.period = period;
    this.overbought = overbought;
    this.oversold = oversold;

    // Persistent internal state
    this.prevClose = null;
    this.avgGain = null;
    this.avgLoss = null;
    this.rsi = null;

    // Bootstrap state (constant memory)
    this._initialized = false;
    this._seedCount = 0;
    this._seedGainSum = 0;
    this._seedLossSum = 0;

    if (Array.isArray(seedCloses) && seedCloses.length >= period + 1) {
      this._bootstrapFromHistory(seedCloses);
    }
  }

  /**
   * Bootstrap RSI from seeded historical closes (Wilder canonical)
   */
  _bootstrapFromHistory(closes) {
    let gainSum = 0;
    let lossSum = 0;

    for (let i = 1; i <= this.period; i++) {
      const delta = closes[i] - closes[i - 1];
      if (delta > 0) gainSum += delta;
      else lossSum += -delta;
    }

    this.avgGain = gainSum / this.period;
    this.avgLoss = lossSum / this.period;
    this.prevClose = closes[this.period];
    this._initialized = true;

    this._computeRSI();
  }

  /**
   * Incremental update with streaming candle or close price
   * @param {Object|number} candle - candle with { close } or raw close
   * @returns {number|null} RSI value or null if not ready
   */
  update(candle) {
    const close =
      typeof candle === "number"
        ? candle
        : candle && typeof candle.close === "number"
        ? candle.close
        : null;

    if (close === null) {
      throw new Error("RSI update requires a close price");
    }

    if (this.prevClose === null) {
      this.prevClose = close;
      return null;
    }

    const change = close - this.prevClose;
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? -change : 0;

    // Bootstrap accumulation phase
    if (!this._initialized) {
      this._seedGainSum += gain;
      this._seedLossSum += loss;
      this._seedCount++;

      if (this._seedCount === this.period) {
        this.avgGain = this._seedGainSum / this.period;
        this.avgLoss = this._seedLossSum / this.period;
        this._initialized = true;
        this._computeRSI();
      }

      this.prevClose = close;
      return null;
    }

    // Wilder smoothing (O(1))
    this.avgGain =
      (this.avgGain * (this.period - 1) + gain) / this.period;

    this.avgLoss =
      (this.avgLoss * (this.period - 1) + loss) / this.period;

    this.prevClose = close;
    this._computeRSI();

    return this.rsi;
  }

  /**
   * RSI calculation with full edge-case protection
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
   * Current RSI value (no mutation)
   */
  getValue() {
    return this.rsi;
  }

  /**
   * Initialization status
   */
  isReady() {
    return this._initialized;
  }

  /**
   * Lightweight immutable state snapshot for telemetry/debugging
   */
  getState() {
    return {
      period: this.period,
      prevClose: this.prevClose,
      avgGain: this.avgGain,
      avgLoss: this.avgLoss,
      rsi: this.rsi,
      initialized: this._initialized
    };
  }
}

module.exports = RSIIndicator;

