/**
 * AwesomeOscillator - Fast/Slow SMA with O(1) Updates
 * 
 * Institutional-grade Awesome Oscillator implementation using median price.
 * True O(1) calculation using running sums and circular buffers.
 * 
 * Features:
 * - O(1) updates per candle (after warmup)
 * - Fast SMA (5) - Slow SMA (34)
 * - Uses median price (high + low) / 2
 * - No window recomputation required
 */

class AwesomeOscillator {
  constructor({ fast = 5, slow = 34 } = {}) {
    this.fast = fast;
    this.slow = slow;

    this.fastQueue = [];
    this.slowQueue = [];

    this.fastSum = 0;
    this.slowSum = 0;

    this.value = null;
  }

  /**
   * Update Awesome Oscillator with new candle
   * @param {Object} candle - Candle data { close, open, high, low, time }
   * @returns {number|null} - AO value or null if not ready
   */
  update(candle) {
    const median = (candle.high + candle.low) / 2;

    // Update fast SMA
    this.fastQueue.push(median);
    this.fastSum += median;
    if (this.fastQueue.length > this.fast) {
      this.fastSum -= this.fastQueue.shift();
    }

    // Update slow SMA
    this.slowQueue.push(median);
    this.slowSum += median;
    if (this.slowQueue.length > this.slow) {
      this.slowSum -= this.slowQueue.shift();
    }

    // Need both SMAs ready
    if (this.fastQueue.length < this.fast || this.slowQueue.length < this.slow) {
      return null;
    }

    const fastSMA = this.fastSum / this.fast;
    const slowSMA = this.slowSum / this.slow;

    this.value = fastSMA - slowSMA;
    return this.value;
  }

  /**
   * Get current AO value
   * @returns {number|null} - Current value or null if not ready
   */
  getValue() {
    return this.value;
  }

  /**
   * Check if indicator is ready
   * @returns {boolean} - True if AO is ready
   */
  isReady() {
    return this.value !== null;
  }

  /**
   * Reset indicator state
   */
  reset() {
    this.fastQueue = [];
    this.slowQueue = [];
    this.fastSum = 0;
    this.slowSum = 0;
    this.value = null;
  }

  /**
   * Get indicator state for serialization
   * @returns {Object} - State object
   */
  getState() {
    return {
      fast: this.fast,
      slow: this.slow,
      fastQueue: [...this.fastQueue],
      slowQueue: [...this.slowQueue],
      fastSum: this.fastSum,
      slowSum: this.slowSum,
      value: this.value
    };
  }

  /**
   * Restore indicator from saved state
   * @param {Object} state - State object
   */
  setState(state) {
    this.fast = state.fast;
    this.slow = state.slow;
    this.fastQueue = [...state.fastQueue];
    this.slowQueue = [...state.slowQueue];
    this.fastSum = state.fastSum;
    this.slowSum = state.slowSum;
    this.value = state.value;
  }
}

module.exports = AwesomeOscillator;
