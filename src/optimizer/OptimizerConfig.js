/**
 * OPTIMIZER CONFIGURATION
 * Central config manager for the Live Optimizer system
 * Defines parameter constraints, bounds, and environment settings.
 * Note: The actual enable/disable flag for the optimizer is controlled
 *       via the main server configuration (CONFIG.OPTIMIZER.ENABLED).
 */

module.exports = {
  // Environment-specific settings
  environment: process.env.NODE_ENV || 'development',
  
  // Experiment settings
  experiments: {
    maxConcurrent: 10,              // Maximum parallel strategy variants to test
    minSampleSize: 50,              // Minimum trades before considering results
    testDurationMinutes: 1440,      // 24 hours default test duration
    cooldownMinutes: 30,            // Wait time between experiment batches
  },
  
  // Parameter constraints for strategy variants
  parameters: {
    // Indicator weights (from signal-weights.js)
    weights: {
      rsi: { min: 0, max: 40, step: 5 },
      williamsR: { min: 0, max: 30, step: 5 },
      macd: { min: 0, max: 35, step: 5 },
      ao: { min: 0, max: 25, step: 5 },
      emaTrend: { min: 0, max: 40, step: 5 },
      stochastic: { min: 0, max: 20, step: 5 },
      bollinger: { min: 0, max: 20, step: 5 }
    },
    
    // RSI thresholds
    rsi: {
      oversold: { min: 20, max: 35, step: 5 },
      overbought: { min: 65, max: 80, step: 5 }
    },
    
    // Signal thresholds
    thresholds: {
      strongBuy: { min: 60, max: 80, step: 5 },
      buy: { min: 40, max: 60, step: 5 },
      strongSell: { min: -80, max: -60, step: 5 },
      sell: { min: -60, max: -40, step: 5 }
    },
    
    // Timeframe combinations to test
    timeframes: ['1min', '5min', '15min', '30min', '1hour'],
    dualTimeframes: [
      { fast: '1min', slow: '5min' },
      { fast: '5min', slow: '15min' },
      { fast: '15min', slow: '30min' },
      { fast: '30min', slow: '1hour' }
    ],
    
    // Risk management bounds
    risk: {
      stopLossROI: { min: 0.3, max: 2.0, step: 0.1 },
      takeProfitROI: { min: 1.0, max: 5.0, step: 0.5 },
      trailingStep: { min: 0.05, max: 0.3, step: 0.05 },
      trailingMove: { min: 0.02, max: 0.1, step: 0.02 }
    },
    
    // Position sizing
    positionSize: {
      min: 0.1,  // 0.1% of balance
      max: 1.0,  // 1.0% of balance
      step: 0.1
    },
    
    // Leverage bounds
    leverage: {
      min: 3,
      max: 20,
      step: 1
    }
  },
  
  // Safety mechanisms
  safety: {
    maxLossPerVariant: 5.0,           // Max % loss per variant before stopping
    maxDrawdownPercent: 10.0,         // Max drawdown before halting all tests
    enableStopLoss: true,             // Always use stop-loss in experiments
    paperTrading: true,               // Use paper trading by default
    realTradingOrderSize: 0.1,        // If real trading: 0.1% position size
  },
  
  // Rate limiting - reuse main WebSocket feeds
  rateLimiting: {
    reuseMainFeed: true,              // Don't create new WebSocket connections
    apiCallsPerMinute: 30,            // Max API calls per minute for experiments
    throttleDelay: 2000,              // 2 second delay between API calls
  },
  
  // Metrics tracking
  metrics: {
    trackingInterval: 5000,           // Update metrics every 5 seconds
    snapshotInterval: 300000,         // Save snapshots every 5 minutes
    metricsToTrack: [
      'roi',
      'winRate',
      'sharpeRatio',
      'avgPnLPerTrade',
      'maxDrawdown',
      'totalTrades',
      'consecutiveWins',
      'consecutiveLosses'
    ]
  },
  
  // Confidence gating thresholds
  confidence: {
    minSampleSize: 50,                // Minimum trades for statistical significance
    minWinRate: 0.55,                 // 55% minimum win rate
    minSharpe: 1.0,                   // Minimum Sharpe ratio
    minROI: 5.0,                      // Minimum 5% ROI over test period
    consistencyThreshold: 0.7,        // 70% consistency score
    promotionThreshold: 0.8           // 80% overall confidence for promotion
  },
  
  /**
   * Validate configuration
   */
  validate() {
    const errors = [];
    
    if (this.experiments.maxConcurrent < 1 || this.experiments.maxConcurrent > 100) {
      errors.push('maxConcurrent must be between 1 and 100');
    }
    
    if (this.experiments.minSampleSize < 10) {
      errors.push('minSampleSize must be at least 10');
    }
    
    if (this.safety.maxLossPerVariant < 0 || this.safety.maxLossPerVariant > 50) {
      errors.push('maxLossPerVariant must be between 0 and 50');
    }
    
    if (this.confidence.minWinRate < 0 || this.confidence.minWinRate > 1) {
      errors.push('minWinRate must be between 0 and 1');
    }
    
    if (errors.length > 0) {
      throw new Error(`Optimizer config validation failed:\n${errors.join('\n')}`);
    }
    
    return true;
  },
  
  /**
   * Generate strategy variants from parameter ranges
   * @param {number} maxVariants - Maximum number of variants to generate
   * @returns {Array} Array of strategy variant configurations
   */
  generateVariants(maxVariants = 10) {
    const variants = [];
    const params = this.parameters;
    
    // Simple variant generation - in production this would be more sophisticated
    // Using a subset of combinations to keep it manageable
    
    // Generate weight distribution variants
    const weightProfiles = ['default', 'conservative', 'aggressive', 'balanced'];
    
    for (let i = 0; i < Math.min(maxVariants, weightProfiles.length * 2); i++) {
      const profile = weightProfiles[i % weightProfiles.length];
      const timeframe = params.timeframes[i % params.timeframes.length];
      
      variants.push({
        id: `variant_${i + 1}`,
        profile,
        timeframe,
        weightMultiplier: 0.8 + (i * 0.1), // Vary weights slightly
        rsiOversold: params.rsi.oversold.min + (i % 3) * params.rsi.oversold.step,
        rsiOverbought: params.rsi.overbought.min + (i % 3) * params.rsi.overbought.step,
        stopLossROI: params.risk.stopLossROI.min + (i % 5) * params.risk.stopLossROI.step,
        takeProfitROI: params.risk.takeProfitROI.min + (i % 5) * params.risk.takeProfitROI.step,
        leverage: params.leverage.min + (i % 3) * params.leverage.step,
        experimental: true
      });
    }
    
    return variants;
  },
  
  /**
   * Get configuration for specific environment
   */
  getEnvConfig(env = null) {
    const environment = env || this.environment;
    
    const envConfigs = {
      development: {
        ...this,
        experiments: {
          ...this.experiments,
          maxConcurrent: 5,
          testDurationMinutes: 60  // 1 hour for dev
        },
        safety: {
          ...this.safety,
          paperTrading: true,
          realTradingOrderSize: 0.05
        }
      },
      production: {
        ...this,
        experiments: {
          ...this.experiments,
          maxConcurrent: 10,
          testDurationMinutes: 1440  // 24 hours for prod
        },
        safety: {
          ...this.safety,
          paperTrading: false,
          realTradingOrderSize: 0.1
        }
      }
    };
    
    return envConfigs[environment] || this;
  }
};
