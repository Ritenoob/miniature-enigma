/**
 * TELEMETRY
 * Event bus for optimizer telemetry and system metrics
 */

const { EventEmitter } = require('events');

class Telemetry extends EventEmitter {
  constructor() {
    super();
    this.metrics = new Map();
    this.subscribers = new Map();
  }

  /**
   * Publish a metric
   * @param {string} metricName - Name of metric
   * @param {any} value - Metric value
   * @param {Object} metadata - Additional metadata
   */
  publish(metricName, value, metadata = {}) {
    const event = {
      metric: metricName,
      value,
      metadata,
      timestamp: Date.now()
    };

    // Store in metrics map
    if (!this.metrics.has(metricName)) {
      this.metrics.set(metricName, []);
    }
    
    const history = this.metrics.get(metricName);
    history.push(event);
    
    // Keep only last 1000 events per metric
    if (history.length > 1000) {
      history.shift();
    }

    // Emit event
    this.emit('metric', event);
    this.emit(metricName, event);
  }

  /**
   * Subscribe to a metric
   * @param {string} metricName - Name of metric to subscribe to
   * @param {Function} callback - Callback function
   * @returns {Function} Unsubscribe function
   */
  subscribe(metricName, callback) {
    this.on(metricName, callback);
    
    // Return unsubscribe function
    return () => {
      this.off(metricName, callback);
    };
  }

  /**
   * Get metric history
   * @param {string} metricName - Name of metric
   * @param {number} limit - Maximum number of events to return
   * @returns {Array} Array of metric events
   */
  getHistory(metricName, limit = 100) {
    const history = this.metrics.get(metricName) || [];
    return history.slice(-limit);
  }

  /**
   * Get latest value for a metric
   * @param {string} metricName - Name of metric
   * @returns {any} Latest value or null
   */
  getLatest(metricName) {
    const history = this.metrics.get(metricName);
    if (!history || history.length === 0) return null;
    
    return history[history.length - 1].value;
  }

  /**
   * Clear metric history
   * @param {string} metricName - Name of metric to clear (or all if not specified)
   */
  clear(metricName = null) {
    if (metricName) {
      this.metrics.delete(metricName);
    } else {
      this.metrics.clear();
    }
  }

  /**
   * Get all metric names
   * @returns {Array} Array of metric names
   */
  getMetricNames() {
    return Array.from(this.metrics.keys());
  }

  /**
   * Get summary statistics for a metric
   * @param {string} metricName - Name of metric
   * @returns {Object|null} Summary statistics or null
   */
  getSummary(metricName) {
    const history = this.metrics.get(metricName);
    if (!history || history.length === 0) return null;

    const values = history.map(e => e.value).filter(v => typeof v === 'number');
    if (values.length === 0) return null;

    const sum = values.reduce((acc, v) => acc + v, 0);
    const mean = sum / values.length;
    const sorted = [...values].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const min = sorted[0];
    const max = sorted[sorted.length - 1];

    return {
      count: values.length,
      mean,
      median,
      min,
      max,
      sum
    };
  }
}

// Export singleton instance
const telemetry = new Telemetry();

module.exports = telemetry;
module.exports.Telemetry = Telemetry;
