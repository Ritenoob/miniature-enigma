/**
 * MACDIndicator
 *
 * Incremental, stateful MACD engine for real-time trading systems.
 * Designed for WebSocket candle feeds and multi-timeframe screening.
 *
 * Computes:
 *  - Fast EMA
 *  - Slow EMA
 *  - MACD Line
 *  - Signal Line (EMA of MACD)
 *  - Histogram
 *
 * Characteristics:
 *  - O(1) update complexity
 *  - No rolling arrays for EMA
 *  - Only last EMA values stored
 *  - Deterministic numerical behavior
 *  - Warm-up safe
 */

class MACDIndicator {
  constructor({
    fastPeriod = 12,
    slowPeriod = 26,
    signalPeriod = 9,
    seedCloses = null
  } = {}) {
    this.fastPeriod = fastPeriod;
    this.slowPeriod = slowPeriod;
    this.signalPeriod = signalPeriod;

    this.alphaFast = 2 / (fastPeriod + 1);
    this.alphaSlow = 2 / (slowPeriod + 1);
    this.alphaSignal = 2 / (signalPeriod + 1);

    this.emaFast = null;
    this.emaSlow = null;
    this.signalEMA = null;

    this.macd = null;
    this.histogram = null;

    this._fastSeedCount = 0;
    this._slowSeedCount = 0;
    this._signalSeedCount = 0;

    this._fastSeedSum = 0;
    this._slowSeedSum = 0;

    if (Array.isArray(seedCloses) && seedCloses.length >= slowPeriod) {
      this._seedFromHistory(seedCloses);
    }
  }

  _seedFromHistory(closes) {
    // Seed EMA Fast
    for (let i = 0; i < this.fastPeriod; i++) {
      this._fastSeedSum += closes[i];
    }
    this.emaFast = this._fastSeedSum / this.fastPeriod;

    // Seed EMA Slow
    for (let i = 0; i < this.slowPeriod; i++) {
      this._slowSeedSum += closes[i];
    }
    this.emaSlow = this._slowSeedSum / this.slowPeriod;

    // Advance EMAs to latest close
    for (let i = this.slowPeriod; i < closes.length; i++) {
      this.emaFast =
        closes[i] * this.alphaFast +
        this.emaFast * (1 - this.alphaFast);

      this.emaSlow =
        closes[i] * this.alphaSlow +
        this.emaSlow * (1 - this.alphaSlow);

      this.macd = this.emaFast - this.emaSlow;

      if (this.signalEMA === null) {
        this.signalEMA = this.macd;
      } else {
        this.signalEMA =
          this.macd * this.alphaSignal +
          this.signalEMA * (1 - this.alphaSignal);
      }
    }

    this.histogram =
      this.signalEMA !== null ? this.macd - this.signalEMA : null;
  }

  /**
   * Incremental update per closed candle
   * @param {Object} candle
   * @param {number} candle.close
   * @returns {Object|null}
   */
  update(candle) {
    const close = candle?.close;
    if (typeof close !== "number") return null;

    // --- FAST EMA WARM-UP ---
    if (this.emaFast === null) {
      this._fastSeedSum += close;
      this._fastSeedCount++;

      if (this._fastSeedCount === this.fastPeriod) {
        this.emaFast = this._fastSeedSum / this.fastPeriod;
      }
      return null;
    }

    // --- SLOW EMA WARM-UP ---
    if (this.emaSlow === null) {
      this._slowSeedSum += close;
      this._slowSeedCount++;

      if (this._slowSeedCount === this.slowPeriod) {
        this.emaSlow = this._slowSeedSum / this.slowPeriod;
      }
      return null;
    }

    // --- EMA UPDATES ---
    this.emaFast =
      close * this.alphaFast + this.emaFast * (1 - this.alphaFast);

    this.emaSlow =
      close * this.alphaSlow + this.emaSlow * (1 - this.alphaSlow);

    this.macd = this.emaFast - this.emaSlow;

    // --- SIGNAL LINE WARM-UP ---
    if (this.signalEMA === null) {
      this._signalSeedCount++;

      if (this._signalSeedCount === this.signalPeriod) {
        this.signalEMA = this.macd;
      }
      return null;
    }

    // --- SIGNAL EMA UPDATE ---
    this.signalEMA =
      this.macd * this.alphaSignal +
      this.signalEMA * (1 - this.alphaSignal);

    this.histogram = this.macd - this.signalEMA;

    return {
      macd: this.macd,
      signal: this.signalEMA,
      histogram: this.histogram
    };
  }

  /**
   * Non-mutating snapshot of current state
   */
  getValue() {
    if (
      this.macd === null ||
      this.signalEMA === null ||
      this.histogram === null
    ) {
      return null;
    }

    return {
      macd: this.macd,
      signal: this.signalEMA,
      histogram: this.histogram
    };
  }
}

module.exports = MACDIndicator;

