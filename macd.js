// indicatorEngines/MACDIndicator.js

/**
 * MACDIndicator Class
 *
 * Incremental MACD calculator using the standard EMA formula.
 * Designed for real-time/incremental updates (O(1) per new price).
 *
 * Default parameters (configurable):
 *   - fastPeriod   = 12
 *   - slowPeriod   = 26
 *   - signalPeriod = 9
 *
 * Returns on each update:
 *   {
 *     macd:      number | null,  // MACD line (fast EMA - slow EMA)
 *     signal:    number | null,  // Signal line (EMA of MACD)
 *     histogram: number | null   // macd - signal
 *   }
 *
 * Values are null until the required history is built.
 */

class MACDIndicator {
  /**
   * @param {Object} config
   * @param {number} [config.fastPeriod=12]
   * @param {number} [config.slowPeriod=26]
   * @param {number} [config.signalPeriod=9]
   */
  constructor({
    fastPeriod = 12,
    slowPeriod = 26,
    signalPeriod = 9
  } = {}) {
    if (fastPeriod <= 0 || slowPeriod <= 0 || signalPeriod <= 0) {
      throw new Error('Periods must be positive integers');
    }

    this.fastPeriod = fastPeriod;
    this.slowPeriod = slowPeriod;
    this.signalPeriod = signalPeriod;

    // Multipliers (α = 2 / (period + 1))
    this.alphaFast = 2 / (fastPeriod + 1);
    this.alphaSlow = 2 / (slowPeriod + 1);
    this.alphaSignal = 2 / (signalPeriod + 1);

    // State
    this.emaFast = null;
    this.emaSlow = null;
    this.macd = null;
    this.signal = null;
    this.histogram = null;

    // Counters for bootstrap phases
    this.fastCount = 0;
    this.slowCount = 0;
    this.signalCount = 0;
  }

  /**
   * Bootstrap the indicator with historical closing prices.
   * This is optional but recommended to avoid long warm-up delay.
   *
   * @param {number[]} closes - Array of historical closing prices (oldest first)
   */
  bootstrap(closes) {
    if (!Array.isArray(closes) || closes.length === 0) return;

    // Reset state
    this.reset();

    for (const close of closes) {
      this.update(close);
      // Early exit if we already have all values populated
      if (this.histogram !== null) {
        // Continue feeding remaining prices to stabilize signal line
        continue;
      }
    }
  }

  /**
   * Reset internal state (useful for testing or restarting)
   */
  reset() {
    this.emaFast = null;
    this.emaSlow = null;
    this.macd = null;
    this.signal = null;
    this.histogram = null;

    this.fastCount = 0;
    this.slowCount = 0;
    this.signalCount = 0;
  }

  /**
   * Update with a new closing price
   *
   * @param {number} close - Latest closing price
   * @returns {{macd: number|null, signal: number|null, histogram: number|null}}
   */
  update(close) {
    if (typeof close !== 'number' || isNaN(close)) {
      throw new Error('Invalid close price');
    }

    // --- Update Fast EMA ---
    if (this.emaFast === null) {
      this.fastCount++;
      // Use SMA as seed for first EMA value
      if (this.fastCount === this.fastPeriod) {
        // Note: in incremental mode we can't compute SMA here without history.
        // We'll initialize EMA with the current close when we reach the period.
        // This is a common practical approximation.
        this.emaFast = close;
      }
    } else {
      this.emaFast = close * this.alphaFast + this.emaFast * (1 - this.alphaFast);
    }

    // --- Update Slow EMA ---
    if (this.emaSlow === null) {
      this.slowCount++;
      if (this.slowCount === this.slowPeriod) {
        this.emaSlow = close;
      }
    } else {
      this.emaSlow = close * this.alphaSlow + this.emaSlow * (1 - this.alphaSlow);
    }

    // --- MACD line (only when both EMAs exist) ---
    if (this.emaFast !== null && this.emaSlow !== null) {
      this.macd = this.emaFast - this.emaSlow;
    } else {
      this.macd = null;
    }

    // --- Signal line (EMA of MACD) ---
    if (this.macd !== null) {
      if (this.signal === null) {
        this.signalCount++;
        if (this.signalCount === this.signalPeriod) {
          this.signal = this.macd; // seed with current MACD
        }
      } else {
        this.signal = this.macd * this.alphaSignal + this.signal * (1 - this.alphaSignal);
      }
    } else {
      this.signal = null;
      this.signalCount = 0;
    }

    // --- Histogram ---
    if (this.macd !== null && this.signal !== null) {
      this.histogram = this.macd - this.signal;
    } else {
      this.histogram = null;
    }

    return {
      macd: this.macd,
      signal: this.signal,
      histogram: this.histogram
    };
  }

  /**
   * Convenience: check current bullish/bearish state
   * @returns {'bullish' | 'bearish' | 'neutral' | null}
   */
  getCurrentState() {
    if (this.histogram === null) return null;
    if (this.histogram > 0) return 'bullish';
    if (this.histogram < 0) return 'bearish';
    return 'neutral';
  }
}

module.exports = MACDIndicator;
