// ============================================================================
// SignalGenerator - Configurable Signal Generation
// ============================================================================
// Generates trading signals using configurable indicator weights from
// signal-weights.js. Supports multiple profiles (conservative, aggressive, etc.)
// and maintains exact same calculation logic as the hardcoded version.

const path = require('path');

/**
 * SignalGenerator class with configurable weights
 * Loads configuration from signal-weights.js and supports profile switching
 */
class SignalGenerator {
  static config = null;
  static activeProfile = 'default';
  static configPath = null;

  /**
   * Initialize and load configuration from signal-weights.js
   * @param {string} configPath - Optional path to config file (defaults to signal-weights.js)
   */
  static initialize(configPath = null) {
    try {
      // Resolve config path
      this.configPath = configPath || path.resolve(__dirname, '../../signal-weights.js');

      // Load config file
      delete require.cache[require.resolve(this.configPath)];
      const loadedConfig = require(this.configPath);

      // Validate config
      this.validateConfig(loadedConfig);

      // Store config and set active profile
      this.config = loadedConfig;
      this.activeProfile = loadedConfig.activeProfile || 'default';

      return true;
    } catch (error) {
      console.error(`[SignalGenerator] Failed to load config: ${error.message}`);
      // Fallback to safe defaults
      this.loadDefaults();
      return false;
    }
  }

  /**
   * Load safe default configuration as fallback
   */
  static loadDefaults() {
    this.config = {
      weights: {
        rsi: { max: 25, oversold: 30, oversoldMild: 40, overbought: 70, overboughtMild: 60 },
        williamsR: { max: 20, oversold: -80, overbought: -20 },
        macd: { max: 20 },
        ao: { max: 15 },
        emaTrend: { max: 20 },
        stochastic: { max: 10, oversold: 20, overbought: 80 },
        bollinger: { max: 10 }
      },
      profiles: {},
      thresholds: {
        strongBuy: 70,
        buy: 50,
        buyWeak: 30,
        strongSell: -70,
        sell: -50,
        sellWeak: -30
      }
    };
    this.activeProfile = 'default';
  }

  /**
   * Get the active weights based on current profile
   * @returns {Object} Active weight configuration
   */
  static getActiveWeights() {
    if (!this.config) {
      this.initialize();
    }

    if (this.activeProfile === 'default') {
      return this.config.weights;
    } else if (this.config.profiles && this.config.profiles[this.activeProfile]) {
      return this.config.profiles[this.activeProfile];
    } else {
      console.warn(`[SignalGenerator] Profile '${this.activeProfile}' not found, using default`);
      return this.config.weights;
    }
  }

  /**
   * Generate trading signal from indicators using configured weights
   * @param {Object} indicators - Technical indicators
   * @param {Object} configOverride - Optional config override (not recommended)
   * @returns {Object} Signal with type, score, confidence, breakdown, timestamp
   */
  static generate(indicators, configOverride = null) {
    // Initialize if not already done
    if (!this.config) {
      this.initialize();
    }

    // Get active weights
    const weights = configOverride || this.getActiveWeights();
    const thresholds = this.config.thresholds;

    let score = 0;
    const breakdown = [];

    // RSI (±weights.rsi.max points)
    if (indicators.rsi < weights.rsi.oversold) {
      score += weights.rsi.max;
      breakdown.push({
        indicator: 'RSI',
        value: indicators.rsi.toFixed(1),
        contribution: weights.rsi.max,
        reason: `Oversold (<${weights.rsi.oversold})`,
        type: 'bullish'
      });
    } else if (indicators.rsi < weights.rsi.oversoldMild) {
      const contribution = Math.round(weights.rsi.max * 0.6); // 60% of max
      score += contribution;
      breakdown.push({
        indicator: 'RSI',
        value: indicators.rsi.toFixed(1),
        contribution,
        reason: 'Approaching oversold',
        type: 'bullish'
      });
    } else if (indicators.rsi > weights.rsi.overbought) {
      score -= weights.rsi.max;
      breakdown.push({
        indicator: 'RSI',
        value: indicators.rsi.toFixed(1),
        contribution: -weights.rsi.max,
        reason: `Overbought (>${weights.rsi.overbought})`,
        type: 'bearish'
      });
    } else if (indicators.rsi > weights.rsi.overboughtMild) {
      const contribution = Math.round(weights.rsi.max * 0.6); // 60% of max
      score -= contribution;
      breakdown.push({
        indicator: 'RSI',
        value: indicators.rsi.toFixed(1),
        contribution: -contribution,
        reason: 'Approaching overbought',
        type: 'bearish'
      });
    } else {
      breakdown.push({
        indicator: 'RSI',
        value: indicators.rsi.toFixed(1),
        contribution: 0,
        reason: `Neutral (${weights.rsi.oversoldMild}-${weights.rsi.overboughtMild})`,
        type: 'neutral'
      });
    }

    // Williams %R (±weights.williamsR.max points)
    if (indicators.williamsR < weights.williamsR.oversold) {
      score += weights.williamsR.max;
      breakdown.push({
        indicator: 'Williams %R',
        value: indicators.williamsR.toFixed(1),
        contribution: weights.williamsR.max,
        reason: `Oversold (<${weights.williamsR.oversold})`,
        type: 'bullish'
      });
    } else if (indicators.williamsR > weights.williamsR.overbought) {
      score -= weights.williamsR.max;
      breakdown.push({
        indicator: 'Williams %R',
        value: indicators.williamsR.toFixed(1),
        contribution: -weights.williamsR.max,
        reason: `Overbought (>${weights.williamsR.overbought})`,
        type: 'bearish'
      });
    } else {
      breakdown.push({
        indicator: 'Williams %R',
        value: indicators.williamsR.toFixed(1),
        contribution: 0,
        reason: 'Neutral',
        type: 'neutral'
      });
    }

    // MACD (±weights.macd.max points)
    if (indicators.macd > 0 && indicators.macdHistogram > 0) {
      score += weights.macd.max;
      breakdown.push({
        indicator: 'MACD',
        value: indicators.macd.toFixed(2),
        contribution: weights.macd.max,
        reason: 'Bullish momentum',
        type: 'bullish'
      });
    } else if (indicators.macd < 0 && indicators.macdHistogram < 0) {
      score -= weights.macd.max;
      breakdown.push({
        indicator: 'MACD',
        value: indicators.macd.toFixed(2),
        contribution: -weights.macd.max,
        reason: 'Bearish momentum',
        type: 'bearish'
      });
    } else {
      breakdown.push({
        indicator: 'MACD',
        value: indicators.macd.toFixed(2),
        contribution: 0,
        reason: 'Neutral/Crossover',
        type: 'neutral'
      });
    }

    // Awesome Oscillator (±weights.ao.max points)
    if (indicators.ao > 0) {
      score += weights.ao.max;
      breakdown.push({
        indicator: 'AO',
        value: indicators.ao.toFixed(2),
        contribution: weights.ao.max,
        reason: 'Positive momentum',
        type: 'bullish'
      });
    } else {
      score -= weights.ao.max;
      breakdown.push({
        indicator: 'AO',
        value: indicators.ao.toFixed(2),
        contribution: -weights.ao.max,
        reason: 'Negative momentum',
        type: 'bearish'
      });
    }

    // EMA Trend (±weights.emaTrend.max points)
    if (indicators.ema50 > indicators.ema200) {
      score += weights.emaTrend.max;
      breakdown.push({
        indicator: 'EMA Trend',
        value: 'EMA50 > EMA200',
        contribution: weights.emaTrend.max,
        reason: 'Bullish trend (Golden Cross)',
        type: 'bullish'
      });
    } else if (indicators.ema50 < indicators.ema200) {
      score -= weights.emaTrend.max;
      breakdown.push({
        indicator: 'EMA Trend',
        value: 'EMA50 < EMA200',
        contribution: -weights.emaTrend.max,
        reason: 'Bearish trend (Death Cross)',
        type: 'bearish'
      });
    } else {
      breakdown.push({
        indicator: 'EMA Trend',
        value: 'EMA50 ≈ EMA200',
        contribution: 0,
        reason: 'Neutral',
        type: 'neutral'
      });
    }

    // Stochastic (±weights.stochastic.max points)
    if (indicators.stochK < weights.stochastic.oversold && indicators.stochK > indicators.stochD) {
      score += weights.stochastic.max;
      breakdown.push({
        indicator: 'Stochastic',
        value: indicators.stochK.toFixed(1),
        contribution: weights.stochastic.max,
        reason: 'Oversold + bullish crossover',
        type: 'bullish'
      });
    } else if (indicators.stochK > weights.stochastic.overbought && indicators.stochK < indicators.stochD) {
      score -= weights.stochastic.max;
      breakdown.push({
        indicator: 'Stochastic',
        value: indicators.stochK.toFixed(1),
        contribution: -weights.stochastic.max,
        reason: 'Overbought + bearish crossover',
        type: 'bearish'
      });
    } else {
      breakdown.push({
        indicator: 'Stochastic',
        value: indicators.stochK.toFixed(1),
        contribution: 0,
        reason: 'Neutral',
        type: 'neutral'
      });
    }

    // Bollinger Bands (±weights.bollinger.max points)
    if (indicators.price < indicators.bollingerLower) {
      score += weights.bollinger.max;
      breakdown.push({
        indicator: 'Bollinger',
        value: 'Below lower',
        contribution: weights.bollinger.max,
        reason: 'Price below lower band',
        type: 'bullish'
      });
    } else if (indicators.price > indicators.bollingerUpper) {
      score -= weights.bollinger.max;
      breakdown.push({
        indicator: 'Bollinger',
        value: 'Above upper',
        contribution: -weights.bollinger.max,
        reason: 'Price above upper band',
        type: 'bearish'
      });
    } else {
      breakdown.push({
        indicator: 'Bollinger',
        value: 'Within bands',
        contribution: 0,
        reason: 'Price within bands',
        type: 'neutral'
      });
    }

    // Determine signal type based on thresholds
    let type = 'NEUTRAL';
    let confidence = 'LOW';

    if (score >= thresholds.strongBuy) {
      type = 'STRONG_BUY';
      confidence = 'HIGH';
    } else if (score >= thresholds.buy) {
      type = 'BUY';
      confidence = 'MEDIUM';
    } else if (score >= thresholds.buyWeak) {
      type = 'BUY';
      confidence = 'LOW';
    } else if (score <= thresholds.strongSell) {
      type = 'STRONG_SELL';
      confidence = 'HIGH';
    } else if (score <= thresholds.sell) {
      type = 'SELL';
      confidence = 'MEDIUM';
    } else if (score <= thresholds.sellWeak) {
      type = 'SELL';
      confidence = 'LOW';
    }

    return {
      type,
      score,
      confidence,
      breakdown,
      timestamp: Date.now()
    };
  }

  /**
   * Switch to a different profile
   * @param {string} profileName - Name of profile to switch to
   * @throws {Error} If profile doesn't exist
   */
  static setProfile(profileName) {
    if (!this.config) {
      this.initialize();
    }

    // Validate profile exists
    if (profileName !== 'default' && (!this.config.profiles || !this.config.profiles[profileName])) {
      const available = ['default', ...(this.config.profiles ? Object.keys(this.config.profiles) : [])];
      throw new Error(`Invalid profile '${profileName}'. Available profiles: ${available.join(', ')}`);
    }

    // Switch profile (atomic update)
    this.activeProfile = profileName;
  }

  /**
   * Get current active profile information
   * @returns {Object} Profile name and weights
   */
  static getActiveProfile() {
    if (!this.config) {
      this.initialize();
    }

    return {
      name: this.activeProfile,
      weights: this.getActiveWeights(),
      thresholds: this.config.thresholds
    };
  }

  /**
   * Validate configuration structure
   * @param {Object} config - Configuration to validate
   * @throws {Error} If configuration is invalid
   */
  static validateConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('Config must be an object');
    }

    // Check required fields
    if (!config.weights || typeof config.weights !== 'object') {
      throw new Error('Config must have weights object');
    }

    if (!config.thresholds || typeof config.thresholds !== 'object') {
      throw new Error('Config must have thresholds object');
    }

    // Validate weights structure
    const requiredIndicators = ['rsi', 'williamsR', 'macd', 'ao', 'emaTrend', 'stochastic', 'bollinger'];
    for (const indicator of requiredIndicators) {
      if (!config.weights[indicator] || typeof config.weights[indicator] !== 'object') {
        throw new Error(`Missing or invalid weights.${indicator}`);
      }

      // Check max field exists and is a positive number
      if (typeof config.weights[indicator].max !== 'number' || config.weights[indicator].max <= 0) {
        throw new Error(`weights.${indicator}.max must be a positive number`);
      }
    }

    // Validate thresholds
    const requiredThresholds = ['strongBuy', 'buy', 'buyWeak', 'strongSell', 'sell', 'sellWeak'];
    for (const threshold of requiredThresholds) {
      if (typeof config.thresholds[threshold] !== 'number') {
        throw new Error(`thresholds.${threshold} must be a number`);
      }
    }

    // Validate profiles if they exist
    if (config.profiles && typeof config.profiles === 'object') {
      for (const [profileName, profileWeights] of Object.entries(config.profiles)) {
        for (const indicator of requiredIndicators) {
          if (!profileWeights[indicator] || typeof profileWeights[indicator] !== 'object') {
            throw new Error(`Profile '${profileName}' missing weights.${indicator}`);
          }
          if (typeof profileWeights[indicator].max !== 'number' || profileWeights[indicator].max <= 0) {
            throw new Error(`Profile '${profileName}' weights.${indicator}.max must be a positive number`);
          }
        }
      }
    }
  }

  /**
   * Get list of available profiles
   * @returns {Array} List of profile names
   */
  static getAvailableProfiles() {
    if (!this.config) {
      this.initialize();
    }

    const profiles = ['default'];
    if (this.config.profiles) {
      profiles.push(...Object.keys(this.config.profiles));
    }
    return profiles;
  }
}

module.exports = SignalGenerator;
