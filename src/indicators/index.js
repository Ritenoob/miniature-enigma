/**
 * Indicator Registry
 * Central export point for all technical indicators
 */

const RSIIndicator = require('./RSIIndicator');
const MACDIndicator = require('./MACDIndicator');
const WilliamsRIndicator = require('./WilliamsRIndicator');
const AwesomeOscillator = require('./AwesomeOscillator');

/**
 * Factory function to create an indicator instance
 * @param {string} type - Indicator type (rsi, macd, williamsR, ao, kdj, obv, adx)
 * @param {Object} config - Indicator configuration
 * @returns {Object} Indicator instance
 */
function createIndicator(type, config = {}) {
  const indicatorMap = {
    rsi: RSIIndicator,
    macd: MACDIndicator,
    williamsR: WilliamsRIndicator,
    ao: AwesomeOscillator,
    awesomeOscillator: AwesomeOscillator
  };

  const IndicatorClass = indicatorMap[type.toLowerCase()];
  
  if (!IndicatorClass) {
    throw new Error(`Unknown indicator type: ${type}. Available: ${Object.keys(indicatorMap).join(', ')}`);
  }

  return new IndicatorClass(config);
}

/**
 * Get list of available indicator types
 * @returns {Array<string>} List of indicator type names
 */
function getAvailableIndicators() {
  return [
    'rsi',
    'macd',
    'williamsR',
    'ao',
    'awesomeOscillator'
  ];
}

module.exports = {
  // Individual indicators
  RSIIndicator,
  MACDIndicator,
  WilliamsRIndicator,
  AwesomeOscillator,
  
  // Factory and helpers
  createIndicator,
  getAvailableIndicators
};
