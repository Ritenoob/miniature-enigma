/**
 * Indicator Engines Module
 * 
 * Institutional-grade incremental technical indicators.
 * All indicators use true incremental calculation with O(1) updates.
 * 
 * Features:
 * - No window recomputation
 * - Deterministic startup behavior
 * - No hidden allocations per tick
 * - Safe for 40+ live WebSocket streams
 * - State serialization support
 * - Identical behavior across timeframes
 */

module.exports = {
  RSIIndicator: require('./RSIIndicator'),
  MACDIndicator: require('./MACDIndicator'),
  WilliamsRIndicator: require('./WilliamsRIndicator'),
  AwesomeOscillator: require('./AwesomeOscillator'),
  KDJIndicator: require('./KDJIndicator'),
  OBVIndicator: require('./OBVIndicator'),
  ADXIndicator: require('./ADXIndicator')
};
