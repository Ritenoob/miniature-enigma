/**
 * Awesome Oscillator (AO)
 *
 * AO = SMA(fastPeriod) - SMA(slowPeriod)
 * Median Price = (high + low) / 2
 *
 * Default: fast = 5, slow = 34
 *
 * Emits:
 *  - null until slow window is fully initialized
 *  - number once valid
 */
class AwesomeOscillator {
  constructor(config = {}) {
    this.fastPeriod = config.fastPeriod || 5;
    this.slowPeriod = config.slowPeriod || 34;

    if (this.fastPeriod >= this.slowPeriod) {
      throw new Error(
        'AwesomeOscillator: fastPeriod must be less than slowPeriod'
      );
    }

    // Rolling windows
    this.fastWindow = [];
    this.slowWindow = [];

    // Running sums for O(1) SMA updates
    this.fastSum = 0;
    this.slowSum = 0;

    this.currentAO = null;
  }

  /**
   * Update with a new candle
   * @param {Object} candle
   * @param {number} candle.high
   * @param {number} candle.low
   * @returns {number|null} AO value
   */
  update(candle) {
    if (
      candle.high === undefined ||
      candle.low === undefined
    ) {
      throw new Error(
        'AwesomeOscillator update requires candle.high and candle.low'
      );
    }

    const median = (candle.high + candle.low) / 2;

    // --- FAST WINDOW (SMA fastPeriod) ---
    this.fastWindow.push(median);
    this.fastSum += median;

    if (this.fastWindow.length > this.fastPeriod) {
      this.fastSum -= this.fastWindow.shift();
    }

    // --- SLOW WINDOW (SMA slowPeriod) ---
    this.slowWindow.push(median);
    this.slowSum += median;

    if (this.slowWindow.length > this.slowPeriod) {
      this.slowSum -= this.slowWindow.shift();
    }

    // --- AO only valid after slow SMA initialized ---
    if (this.slowWindow.length < this.slowPeriod) {
      this.currentAO = null;
      return null;
    }

    const fastSMA = this.fastSum / this.fastPeriod;
    const slowSMA = this.slowSum / this.slowPeriod;

    this.currentAO = fastSMA - slowSMA;
    return this.currentAO;
  }

  /**
   * Get last computed AO value
   * @returns {number|null}
   */
  getValue() {
    return this.currentAO;
  }

  /**
   * Reset indicator state
   */
  reset() {
    this.fastWindow = [];
    this.slowWindow = [];
    this.fastSum = 0;
    this.slowSum = 0;
    this.currentAO = null;
  }
}

module.exports = AwesomeOscillator;

