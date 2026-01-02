/**
 * RUNTIME CONFIGURATION
 * ----------------------
 * Feature flags and runtime toggles for optimization and research subsystems
 * All new features are disabled by default to maintain backward compatibility
 */

module.exports = {
  // ============================================================================
  // FEATURE FLAGS
  // ============================================================================
  
  /**
   * DOM (Depth of Market) Features
   * Enable order book depth analysis and signals
   * NOTE: DOM requires live data and cannot be backtested historically
   */
  DOM_ENABLED: process.env.DOM_ENABLED === 'true' || false,

  /**
   * Optimizer Mode
   * Enable live optimizer controller for multi-profile testing
   */
  OPTIMIZER_MODE: process.env.OPTIMIZER_MODE === 'true' || false,

  /**
   * OHLC Data Source
   * Options: 'kucoin' (default), 'binance', 'alphaVantage', 'local'
   */
  OHLC_SOURCE: process.env.OHLC_SOURCE || 'kucoin',

  /**
   * Ping Budget Headroom
   * Percentage of rate limit budget to reserve (0.0-1.0)
   * Default: 0.3 (30% headroom)
   */
  PING_BUDGET_HEADROOM: parseFloat(process.env.PING_BUDGET_HEADROOM || '0.3'),

  /**
   * Margin Mode
   * Options: 'CROSS' (default), 'ISOLATED'
   */
  MARGIN_MODE: process.env.MARGIN_MODE || 'CROSS',

  // ============================================================================
  // RESEARCH SUBSYSTEM FLAGS
  // ============================================================================

  /**
   * Enable Research Data Pipeline
   * Activates OHLCV fetcher and live recorder
   */
  RESEARCH_MODE: process.env.RESEARCH_MODE === 'true' || false,

  /**
   * Enable Backtesting Engine
   */
  BACKTEST_ENABLED: process.env.BACKTEST_ENABLED === 'true' || false,

  /**
   * Enable Forward Testing (Shadow Mode)
   * Records hypothetical trades without placing real orders
   */
  FORWARD_TEST_ENABLED: process.env.FORWARD_TEST_ENABLED === 'true' || false,

  /**
   * Enable Optimization Engine
   * Runs parameter search and strategy optimization
   */
  OPTIMIZATION_ENABLED: process.env.OPTIMIZATION_ENABLED === 'true' || false,

  // ============================================================================
  // INDICATOR FLAGS
  // ============================================================================

  /**
   * Enable KDJ Indicator
   * Stochastic derivative with J line
   */
  KDJ_ENABLED: process.env.KDJ_ENABLED === 'true' || false,

  /**
   * Enable OBV Indicator
   * On Balance Volume with optional smoothing
   */
  OBV_ENABLED: process.env.OBV_ENABLED === 'true' || false,

  /**
   * Enable ADX Indicator
   * Average Directional Index for trend strength
   */
  ADX_ENABLED: process.env.ADX_ENABLED === 'true' || false,

  // ============================================================================
  // BACKTESTING CONFIGURATION
  // ============================================================================

  /**
   * Fill Model for Backtesting
   * Options: 'taker' (default), 'probabilistic_limit'
   */
  FILL_MODEL: process.env.FILL_MODEL || 'taker',

  /**
   * Slippage Model for Backtesting
   * Options: 'none', 'fixed', 'spread_based', 'vol_scaled'
   */
  SLIPPAGE_MODEL: process.env.SLIPPAGE_MODEL || 'fixed',

  /**
   * Fixed Slippage (basis points)
   * Only used when SLIPPAGE_MODEL='fixed'
   */
  FIXED_SLIPPAGE_BPS: parseFloat(process.env.FIXED_SLIPPAGE_BPS || '2.0'),

  // ============================================================================
  // PING BUDGET MANAGER CONFIGURATION
  // ============================================================================

  /**
   * Enable Ping Budget Manager
   * Adaptive rate limiting with priority classes
   */
  PING_BUDGET_ENABLED: process.env.PING_BUDGET_ENABLED === 'true' || false,

  /**
   * Ping Budget - Critical Priority Tokens/Second
   */
  PING_BUDGET_CRITICAL: parseInt(process.env.PING_BUDGET_CRITICAL || '10'),

  /**
   * Ping Budget - High Priority Tokens/Second
   */
  PING_BUDGET_HIGH: parseInt(process.env.PING_BUDGET_HIGH || '20'),

  /**
   * Ping Budget - Medium Priority Tokens/Second
   */
  PING_BUDGET_MEDIUM: parseInt(process.env.PING_BUDGET_MEDIUM || '30'),

  /**
   * Ping Budget - Low Priority Tokens/Second
   */
  PING_BUDGET_LOW: parseInt(process.env.PING_BUDGET_LOW || '50'),

  // ============================================================================
  // OHLC PROVIDER CONFIGURATION
  // ============================================================================

  /**
   * OHLC Cache Enabled
   */
  OHLC_CACHE_ENABLED: process.env.OHLC_CACHE_ENABLED !== 'false',

  /**
   * OHLC Cache TTL (milliseconds)
   */
  OHLC_CACHE_TTL: parseInt(process.env.OHLC_CACHE_TTL || '60000'),

  /**
   * OHLC Rate Limit Delay (milliseconds)
   */
  OHLC_RATE_LIMIT_DELAY: parseInt(process.env.OHLC_RATE_LIMIT_DELAY || '100'),

  /**
   * OHLC Max Retries
   */
  OHLC_MAX_RETRIES: parseInt(process.env.OHLC_MAX_RETRIES || '3'),

  // ============================================================================
  // SCREENER CONFIGURATION
  // ============================================================================

  /**
   * Screener WebSocket Reconnect Enabled
   */
  SCREENER_WS_RECONNECT: process.env.SCREENER_WS_RECONNECT !== 'false',

  /**
   * Screener WebSocket Heartbeat Interval (milliseconds)
   */
  SCREENER_WS_HEARTBEAT_INTERVAL: parseInt(process.env.SCREENER_WS_HEARTBEAT_INTERVAL || '18000'),

  /**
   * Screener Buffer Capacity (candles per symbol per timeframe)
   */
  SCREENER_BUFFER_CAPACITY: parseInt(process.env.SCREENER_BUFFER_CAPACITY || '1000'),

  /**
   * Screener Signal Cooldown (milliseconds)
   */
  SCREENER_SIGNAL_COOLDOWN: parseInt(process.env.SCREENER_SIGNAL_COOLDOWN || '60000'),

  // ============================================================================
  // VALIDATOR
  // ============================================================================

  /**
   * Validate configuration on load
   */
  validate() {
    const errors = [];

    // Validate PING_BUDGET_HEADROOM
    if (this.PING_BUDGET_HEADROOM < 0 || this.PING_BUDGET_HEADROOM > 1) {
      errors.push('PING_BUDGET_HEADROOM must be between 0 and 1');
    }

    // Validate MARGIN_MODE
    if (!['CROSS', 'ISOLATED'].includes(this.MARGIN_MODE)) {
      errors.push('MARGIN_MODE must be CROSS or ISOLATED');
    }

    // Validate OHLC_SOURCE
    if (!['kucoin', 'binance', 'alphaVantage', 'local'].includes(this.OHLC_SOURCE)) {
      errors.push('OHLC_SOURCE must be kucoin, binance, alphaVantage, or local');
    }

    // Validate FILL_MODEL
    if (!['taker', 'probabilistic_limit'].includes(this.FILL_MODEL)) {
      errors.push('FILL_MODEL must be taker or probabilistic_limit');
    }

    // Validate SLIPPAGE_MODEL
    if (!['none', 'fixed', 'spread_based', 'vol_scaled'].includes(this.SLIPPAGE_MODEL)) {
      errors.push('SLIPPAGE_MODEL must be none, fixed, spread_based, or vol_scaled');
    }

    // Validate numeric ranges
    if (this.FIXED_SLIPPAGE_BPS < 0 || this.FIXED_SLIPPAGE_BPS > 100) {
      errors.push('FIXED_SLIPPAGE_BPS must be between 0 and 100');
    }

    if (this.OHLC_CACHE_TTL < 1000 || this.OHLC_CACHE_TTL > 3600000) {
      errors.push('OHLC_CACHE_TTL must be between 1000 and 3600000 milliseconds');
    }

    if (this.OHLC_RATE_LIMIT_DELAY < 0 || this.OHLC_RATE_LIMIT_DELAY > 10000) {
      errors.push('OHLC_RATE_LIMIT_DELAY must be between 0 and 10000 milliseconds');
    }

    if (errors.length > 0) {
      throw new Error(`Runtime configuration validation failed:\n${errors.join('\n')}`);
    }

    return true;
  }
};

// Auto-validate on require
try {
  module.exports.validate();
} catch (error) {
  console.error(`[RuntimeConfig] ${error.message}`);
  // Don't throw - allow server to start with defaults
}
