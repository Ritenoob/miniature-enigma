// ============================================================================
// LiveOptimizerController.js - Live Strategy Optimizer with Paper Trading
// ============================================================================
// Manages multiple signal profile variants for paper trading and optimization
// Uses ExecutionSimulator for realistic fee/slippage modeling
//
// ENHANCEMENTS:
// - Comprehensive parameter permutation testing (indicators, weights, thresholds)
// - Isolated state management with metadata tagging
// - Telemetry collection (Sharpe ratio, latency, resource usage)
// - Confidence-based promotion system with statistical significance
// - Graceful error handling with circuit breaker pattern
// - Lifecycle management (start/stop/cleanup)

const ExecutionSimulator = require('./ExecutionSimulator');
const SignalGenerator = require('../lib/SignalGenerator');
const DecimalMath = require('../lib/DecimalMath');
const TrailingStopPolicy = require('./TrailingStopPolicy');
const EventEmitter = require('events');
const signalWeights = require('../../signal-weights');

// Constants
const TRADING_DAYS_PER_YEAR = 250;  // Annualization factor for Sharpe ratio

/**
 * Optimizer configuration schema
 * @typedef {Object} OptimizerConfig
 */
const OptimizerConfig = {
  // Paper trading enabled by default
  paperTrading: true,
  
  // Real trading safety gates
  realTradingEnabled: false,
  realTradingMinBalance: 1000,    // Minimum balance to enable real trading
  realTradingMaxLoss: 0.1,        // Max 10% loss before stopping real trading
  
  // Position sizing bounds
  positionSize: {
    min: 0.5,      // Minimum position size % of balance
    max: 2.0,      // Maximum position size % of balance
    default: 1.0,  // Default position size %
    variations: [0.5, 1.0, 1.5, 2.0]  // Test variations
  },
  
  // Leverage bounds
  leverage: {
    min: 5,
    max: 20,
    default: 10,
    variations: [5, 10, 15, 20]  // Test variations
  },
  
  // Signal profiles to test (from signal-weights.js)
  profiles: ['default', 'conservative', 'aggressive', 'balanced', 'scalping', 'swingTrading'],
  
  // Execution model
  fillModel: 'taker',  // 'taker' or 'probabilistic_limit'
  
  // Variant isolation
  maxConcurrentVariants: 10,  // Increased for parameter testing
  maxPositionsPerVariant: 1,
  
  // Trailing stop configuration
  trailing: {
    breakEvenBuffer: 0.1,
    trailingStepPercent: 0.15,
    trailingMovePercent: 0.05,
    trailingMode: 'staircase'
  },
  
  // Parameter permutation testing
  parameterTesting: {
    enabled: true,
    // Indicator combinations to test (subset for performance)
    testIndicatorCombinations: false,  // Set true for exhaustive testing
    // Threshold variations (from signal-weights.js thresholds)
    thresholdVariations: [
      { strongBuy: 60, buy: 45, strongSell: -60, sell: -45 },  // More lenient
      { strongBuy: 70, buy: 50, strongSell: -70, sell: -50 },  // Default
      { strongBuy: 80, buy: 60, strongSell: -80, sell: -60 }   // More strict
    ]
  },
  
  // Promotion system configuration
  promotion: {
    enabled: true,
    minSampleSize: 20,              // Minimum trades before considering promotion
    minWinRate: 0.55,               // Minimum 55% win rate
    minAvgROI: 1.0,                 // Minimum 1% average ROI
    minSharpeRatio: 1.0,            // Minimum Sharpe ratio
    confidenceLevel: 0.95,          // 95% confidence for statistical tests
    gradualRolloutSteps: [0.1, 0.25, 0.5, 1.0]  // Gradual position size increases
  },
  
  // Error handling configuration
  errorHandling: {
    maxRetries: 3,
    retryBackoffMs: [1000, 2000, 4000],  // Exponential backoff
    circuitBreakerThreshold: 5,          // Failures before opening circuit
    circuitBreakerResetMs: 300000        // 5 minutes
  },
  
  // Telemetry configuration
  telemetry: {
    enabled: true,
    publishIntervalMs: 5000,             // Publish metrics every 5 seconds
    trackLatency: true,
    trackResourceUsage: true
  }
};

/**
 * Trading variant - represents one signal profile/parameter combination being tested
 * Enhanced with metadata tagging, error tracking, and telemetry
 * @class TradingVariant
 */
class TradingVariant {
  constructor(profileName, config, variantId = null, customParams = {}) {
    this.variantId = variantId || `variant_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.profileName = profileName;
    this.config = config;
    this.customParams = customParams;  // Store custom parameter overrides
    this.position = null;
    this.metrics = {
      tradesCount: 0,
      winCount: 0,
      lossCount: 0,
      totalNetPnl: 0,
      totalGrossPnl: 0,
      avgPnLPerTrade: 0,
      avgROI: 0,
      winRate: 0,
      maxDrawdown: 0,
      peakBalance: 0,
      sharpeRatio: 0,
      avgLatencyMs: 0,
      returns: []  // Track returns for Sharpe calculation
    };
    this.tradeHistory = [];
    this.errorCount = 0;
    this.lastError = null;
    this.circuitBreakerOpen = false;
    this.circuitBreakerOpenedAt = null;
    this.createdAt = Date.now();
    this.experimental = true;  // Tag as experimental
  }

  /**
   * Check if variant can open a new position
   * @returns {boolean}
   */
  canOpenPosition() {
    return this.position === null && !this.circuitBreakerOpen;
  }

  /**
   * Update metrics after a trade closes
   * @param {Object} trade - Completed trade record
   */
  updateMetrics(trade) {
    this.metrics.tradesCount++;
    this.metrics.totalNetPnl += trade.realizedNetPnl;
    this.metrics.totalGrossPnl += trade.realizedGrossPnl;
    
    // Track returns for Sharpe ratio
    this.metrics.returns.push(trade.realizedROI);
    
    if (trade.realizedNetPnl > 0) {
      this.metrics.winCount++;
    } else {
      this.metrics.lossCount++;
    }
    
    this.metrics.winRate = this.metrics.tradesCount > 0 
      ? this.metrics.winCount / this.metrics.tradesCount 
      : 0;
    
    this.metrics.avgPnLPerTrade = this.metrics.tradesCount > 0
      ? this.metrics.totalNetPnl / this.metrics.tradesCount
      : 0;
    
    this.metrics.avgROI = this.metrics.tradesCount > 0
      ? this.tradeHistory.reduce((sum, t) => sum + t.realizedROI, 0) / this.metrics.tradesCount
      : 0;
    
    // Calculate Sharpe ratio (annualized, assuming ~250 trading days, risk-free rate ~0)
    if (this.metrics.returns.length >= 2) {
      const mean = this.metrics.returns.reduce((a, b) => a + b, 0) / this.metrics.returns.length;
      const variance = this.metrics.returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / this.metrics.returns.length;
      const stdDev = Math.sqrt(variance);
      // Annualize using TRADING_DAYS_PER_YEAR constant
      this.metrics.sharpeRatio = stdDev > 0 ? (mean * Math.sqrt(TRADING_DAYS_PER_YEAR)) / stdDev : 0;
    }
    
    // Update drawdown tracking
    const currentBalance = 10000 + this.metrics.totalNetPnl;  // Starting balance + PnL
    if (currentBalance > this.metrics.peakBalance) {
      this.metrics.peakBalance = currentBalance;
    }
    const drawdown = this.metrics.peakBalance > 0 
      ? (this.metrics.peakBalance - currentBalance) / this.metrics.peakBalance 
      : 0;
    if (drawdown > this.metrics.maxDrawdown) {
      this.metrics.maxDrawdown = drawdown;
    }
    
    // Update latency if available
    if (trade.latencyMs !== undefined) {
      const totalLatency = this.metrics.avgLatencyMs * (this.metrics.tradesCount - 1) + trade.latencyMs;
      this.metrics.avgLatencyMs = totalLatency / this.metrics.tradesCount;
    }
  }

  /**
   * Record an error for this variant
   * @param {Error} error - Error object
   */
  recordError(error) {
    this.errorCount++;
    this.lastError = {
      message: error.message,
      stack: error.stack,
      timestamp: Date.now()
    };
  }

  /**
   * Open circuit breaker to stop trading this variant
   */
  openCircuitBreaker() {
    this.circuitBreakerOpen = true;
    this.circuitBreakerOpenedAt = Date.now();
  }

  /**
   * Try to close circuit breaker if enough time has passed
   * @param {number} resetMs - Reset timeout in milliseconds
   * @returns {boolean} True if circuit was closed
   */
  tryCloseCircuitBreaker(resetMs) {
    if (this.circuitBreakerOpen && this.circuitBreakerOpenedAt) {
      const elapsed = Date.now() - this.circuitBreakerOpenedAt;
      if (elapsed >= resetMs) {
        this.circuitBreakerOpen = false;
        this.circuitBreakerOpenedAt = null;
        this.errorCount = 0;  // Reset error count
        return true;
      }
    }
    return false;
  }

  /**
   * Get current state as JSON with metadata tags
   * @returns {Object}
   */
  toJSON() {
    return {
      variantId: this.variantId,
      profileName: this.profileName,
      experimental: this.experimental,
      customParams: this.customParams,
      position: this.position ? {
        side: this.position.side,
        entryPrice: this.position.entryFillPrice,
        size: this.position.size,
        leverage: this.position.leverage,
        marginUsed: this.position.marginUsed,
        unrealizedPnl: this.position.currentMtm?.unrealizedNetPnl || 0,
        unrealizedROI: this.position.currentMtm?.unrealizedROI || 0,
        experimental: true,  // Tag position as experimental
        variantId: this.variantId
      } : null,
      metrics: this.metrics,
      recentTrades: this.tradeHistory.slice(-5).map(t => ({
        ...t,
        experimental: true,  // Tag trades as experimental
        variantId: this.variantId
      })),
      errorCount: this.errorCount,
      lastError: this.lastError,
      circuitBreakerOpen: this.circuitBreakerOpen,
      createdAt: this.createdAt
    };
  }
}

/**
 * LiveOptimizerController - Manages paper trading for multiple strategy variants
 * Enhanced with comprehensive parameter testing, telemetry, and promotion system
 * @class LiveOptimizerController
 * @extends EventEmitter
 */
class LiveOptimizerController extends EventEmitter {
  /**
   * Create a new LiveOptimizerController
   * @param {Object} config - Configuration object (merged with defaults)
   */
  constructor(config = {}) {
    super();
    this.config = this._validateAndMergeConfig(config);
    this.variants = new Map();
    this.accountBalance = 10000; // Starting paper balance
    this.initialized = false;
    this.running = false;
    this.telemetryIntervalId = null;
    this.startTime = null;
    
    // Resource usage tracking
    this.resourceUsage = {
      cpu: 0,
      memory: 0,
      lastMeasurement: Date.now()
    };
    
    // Initialize SignalGenerator
    SignalGenerator.initialize();
  }

  /**
   * Validate and merge user config with defaults
   * @param {Object} userConfig - User-provided configuration
   * @returns {Object} Merged configuration
   * @private
   */
  _validateAndMergeConfig(userConfig) {
    // Deep clone defaults using structured cloning
    const merged = structuredClone(OptimizerConfig);
    
    // Merge user config (shallow merge for top-level keys)
    Object.keys(userConfig).forEach(key => {
      if (typeof userConfig[key] === 'object' && !Array.isArray(userConfig[key]) && merged[key]) {
        merged[key] = { ...merged[key], ...userConfig[key] };
      } else {
        merged[key] = userConfig[key];
      }
    });
    
    // Validate critical parameters
    if (merged.maxConcurrentVariants < 1 || merged.maxConcurrentVariants > 100) {
      throw new Error('maxConcurrentVariants must be between 1 and 100');
    }
    
    if (merged.promotion.minSampleSize < 1) {
      throw new Error('promotion.minSampleSize must be at least 1');
    }
    
    return merged;
  }

  /**
   * Start the optimizer - initialize variants and begin testing
   * @async
   * @returns {Promise<void>}
   */
  async start() {
    if (this.running) {
      console.log('[Optimizer] Already running');
      return;
    }
    
    console.log('[Optimizer] Starting live optimizer controller...');
    this.startTime = Date.now();
    this.running = true;
    
    // Initialize variants
    this.initialize();
    
    // Start telemetry publishing if enabled
    if (this.config.telemetry.enabled) {
      this.telemetryIntervalId = setInterval(() => {
        this.publishTelemetry();
      }, this.config.telemetry.publishIntervalMs);
    }
    
    // Emit lifecycle event
    this.emit('optimizer:started', {
      timestamp: Date.now(),
      variantCount: this.variants.size,
      config: this.config
    });
    
    console.log(`[Optimizer] Started with ${this.variants.size} variants`);
  }

  /**
   * Stop the optimizer - graceful shutdown with cleanup
   * @async
   * @returns {Promise<void>}
   */
  async stop() {
    if (!this.running) {
      console.log('[Optimizer] Not running');
      return;
    }
    
    console.log('[Optimizer] Stopping live optimizer controller...');
    this.running = false;
    
    // Stop telemetry publishing
    if (this.telemetryIntervalId) {
      clearInterval(this.telemetryIntervalId);
      this.telemetryIntervalId = null;
    }
    
    // Close all open positions (paper trading)
    for (const [name, variant] of this.variants) {
      if (variant.position) {
        console.log(`[Optimizer] Closing position for variant ${name} on shutdown`);
        // Note: In real implementation, would close at market price
      }
    }
    
    // Emit lifecycle event
    this.emit('optimizer:stopped', {
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      totalTrades: Array.from(this.variants.values()).reduce((sum, v) => sum + v.metrics.tradesCount, 0)
    });
    
    console.log('[Optimizer] Stopped gracefully');
  }

  /**
   * Initialize optimizer with variants
   * Creates strategy variants based on configuration
   */
  initialize() {
    if (this.initialized) return;
    
    // Create variants from profiles and parameter combinations
    const variantConfigs = this.createStrategyVariants();
    
    // Limit to maxConcurrentVariants
    const limitedConfigs = variantConfigs.slice(0, this.config.maxConcurrentVariants);
    
    for (const variantConfig of limitedConfigs) {
      const variant = new TradingVariant(
        variantConfig.profileName,
        this.config,
        variantConfig.variantId,
        variantConfig.customParams
      );
      this.variants.set(variantConfig.variantId, variant);
    }
    
    this.initialized = true;
    console.log(`[Optimizer] Initialized with ${this.variants.size} variants: ${limitedConfigs.map(v => v.profileName).join(', ')}`);
  }

  /**
   * Create strategy variants with parameter permutations
   * Generates combinations of profiles, leverage, position sizes, and thresholds
   * @returns {Array<Object>} Array of variant configurations
   */
  createStrategyVariants() {
    const variants = [];
    
    // Get available profiles from signal-weights.js
    const profiles = this.config.profiles;
    
    if (this.config.parameterTesting.enabled) {
      // Generate parameter permutations
      const leverages = this.config.leverage.variations || [this.config.leverage.default];
      const positionSizes = this.config.positionSize.variations || [this.config.positionSize.default];
      const thresholds = this.config.parameterTesting.thresholdVariations;
      
      // Create variants for each profile
      for (const profile of profiles) {
        // Base variant with default parameters
        variants.push({
          variantId: `${profile}_default`,
          profileName: profile,
          customParams: {
            leverage: this.config.leverage.default,
            positionSize: this.config.positionSize.default,
            thresholds: signalWeights.thresholds
          }
        });
        
        // Create additional variants with parameter variations (limited to avoid explosion)
        // Test one parameter at a time to keep variant count manageable
        
        // Leverage variations (only for first profile to limit combinations)
        if (profile === profiles[0]) {
          for (const lev of leverages) {
            if (lev !== this.config.leverage.default) {
              variants.push({
                variantId: `${profile}_lev${lev}`,
                profileName: profile,
                customParams: {
                  leverage: lev,
                  positionSize: this.config.positionSize.default,
                  thresholds: signalWeights.thresholds
                }
              });
            }
          }
        }
        
        // Position size variations (only for second profile)
        if (profile === profiles[1] && profiles.length > 1) {
          for (const size of positionSizes) {
            if (size !== this.config.positionSize.default) {
              variants.push({
                variantId: `${profile}_size${size}`,
                profileName: profile,
                customParams: {
                  leverage: this.config.leverage.default,
                  positionSize: size,
                  thresholds: signalWeights.thresholds
                }
              });
            }
          }
        }
        
        // Threshold variations (only for third profile)
        if (profile === profiles[2] && profiles.length > 2 && thresholds) {
          thresholds.forEach((thresh, idx) => {
            if (idx !== 1) {  // Skip default (index 1 is the default in array)
              variants.push({
                variantId: `${profile}_thresh${idx}`,
                profileName: profile,
                customParams: {
                  leverage: this.config.leverage.default,
                  positionSize: this.config.positionSize.default,
                  thresholds: thresh
                }
              });
            }
          });
        }
      }
    } else {
      // Simple mode: one variant per profile with default parameters
      for (const profile of profiles) {
        variants.push({
          variantId: `${profile}_default`,
          profileName: profile,
          customParams: {
            leverage: this.config.leverage.default,
            positionSize: this.config.positionSize.default,
            thresholds: signalWeights.thresholds
          }
        });
      }
    }
    
    console.log(`[Optimizer] Created ${variants.length} variant configurations`);
    return variants;
  }

  /**
   * Process new market data and generate signals for all variants
   * Non-blocking, runs each variant in isolation
   * @param {string} symbol - Trading symbol (e.g., 'BTCUSDT')
   * @param {Object} indicators - Market indicators
   * @param {number} currentPrice - Current market price
   */
  onMarketUpdate(symbol, indicators, currentPrice) {
    if (!this.initialized) {
      this.initialize();
    }

    if (!this.running && this.initialized) {
      // Auto-start if initialized but not running
      this.running = true;
    }

    // Update all variant positions with current price
    for (const [variantId, variant] of this.variants) {
      try {
        // Run variant processing in isolation (synchronous for now, could be async)
        this.runVariant(variant, symbol, indicators, currentPrice);
      } catch (error) {
        // Handle variant errors without affecting others
        this.handleVariantError(variant, error, 'market_update');
      }
    }
  }

  /**
   * Run a single variant in isolation
   * Processes market data, generates signals, manages positions
   * @param {TradingVariant} variant - The variant to run
   * @param {string} symbol - Trading symbol
   * @param {Object} indicators - Market indicators
   * @param {number} currentPrice - Current market price
   */
  runVariant(variant, symbol, indicators, currentPrice) {
    // Check circuit breaker
    if (variant.circuitBreakerOpen) {
      // Try to close if timeout elapsed
      if (variant.tryCloseCircuitBreaker(this.config.errorHandling.circuitBreakerResetMs)) {
        console.log(`[Optimizer] Circuit breaker closed for variant ${variant.variantId}`);
        this.emit('variant:circuit_breaker_closed', { variantId: variant.variantId, timestamp: Date.now() });
      } else {
        // Still open, skip this variant
        return;
      }
    }

    if (variant.position) {
      // Mark to market
      variant.position.currentMtm = ExecutionSimulator.markToMarket(
        variant.position,
        currentPrice
      );
      
      // Check stop loss / take profit
      this.checkExitConditions(variant, currentPrice);
    } else if (variant.canOpenPosition()) {
      // Generate signal for this profile
      // NOTE: SignalGenerator uses global state for profile, which could be a race condition
      // in truly concurrent scenarios. For now, since this runs synchronously, it's safe.
      // In future, consider making SignalGenerator instance-based or thread-safe.
      SignalGenerator.setProfile(variant.profileName);
      
      const signalStartTime = Date.now();
      const signal = SignalGenerator.generate(indicators);
      const signalLatency = Date.now() - signalStartTime;
      
      // Apply custom thresholds by comparing signal score against variant's thresholds
      // rather than modifying global state
      const customThresholds = variant.customParams.thresholds || signalWeights.thresholds;
      let adjustedSignalType = signal.type;
      
      // Re-evaluate signal type based on custom thresholds if they differ from defaults
      if (variant.customParams.thresholds) {
        const score = signal.score || 0;
        if (score >= customThresholds.strongBuy) {
          adjustedSignalType = 'STRONG_BUY';
        } else if (score >= customThresholds.buy) {
          adjustedSignalType = 'BUY';
        } else if (score <= customThresholds.strongSell) {
          adjustedSignalType = 'STRONG_SELL';
        } else if (score <= customThresholds.sell) {
          adjustedSignalType = 'SELL';
        } else {
          adjustedSignalType = 'NEUTRAL';
        }
      }
      
      // Consider entry if strong signal
      if (adjustedSignalType === 'STRONG_BUY' || adjustedSignalType === 'STRONG_SELL') {
        const adjustedSignal = { ...signal, type: adjustedSignalType };
        this.considerEntry(variant, adjustedSignal, currentPrice, symbol, signalLatency);
      }
    }
  }

  /**
   * Handle errors for a specific variant
   * Implements retry logic and circuit breaker pattern
   * @param {TradingVariant} variant - The variant that encountered an error
   * @param {Error} error - The error object
   * @param {string} context - Context where error occurred
   */
  handleVariantError(variant, error, context) {
    variant.recordError(error);
    
    console.error(`[Optimizer] Error in variant ${variant.variantId} (${context}):`, error.message);
    
    // Emit error event
    this.emit('variant:error', {
      variantId: variant.variantId,
      profileName: variant.profileName,
      error: error.message,
      context,
      errorCount: variant.errorCount,
      timestamp: Date.now()
    });
    
    // Check if should open circuit breaker
    if (variant.errorCount >= this.config.errorHandling.circuitBreakerThreshold) {
      variant.openCircuitBreaker();
      console.warn(`[Optimizer] Circuit breaker opened for variant ${variant.variantId} after ${variant.errorCount} errors`);
      
      this.emit('variant:circuit_breaker_opened', {
        variantId: variant.variantId,
        profileName: variant.profileName,
        errorCount: variant.errorCount,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Execute paper trade entry with metadata tagging
   * @param {TradingVariant} variant - Variant to execute trade for
   * @param {Object} signal - Generated signal
   * @param {number} currentPrice - Current market price
   * @param {string} symbol - Trading symbol
   * @param {number} signalLatency - Time taken to generate signal (ms)
   */
  executePaperTrade(variant, signal, currentPrice, symbol, signalLatency = 0) {
    const side = signal.type.includes('BUY') ? 'long' : 'short';
    
    // Use custom parameters from variant
    const positionSizePercent = variant.customParams.positionSize || this.config.positionSize.default;
    const leverage = variant.customParams.leverage || this.config.leverage.default;
    
    const entryStartTime = Date.now();
    
    // Simulate entry using ExecutionSimulator
    const entry = ExecutionSimulator.simulateEntry({
      accountBalance: this.accountBalance,
      positionSizePercent,
      leverage,
      side,
      midPrice: currentPrice,
      fillModel: this.config.fillModel,
      takerFee: 0.0006,
      makerFee: 0.0002,
      slippagePercent: 0.02
    });
    
    const entryLatency = Date.now() - entryStartTime;
    const totalLatency = signalLatency + entryLatency;
    
    // Calculate stop loss and take profit using ROI-based levels
    const slRoi = 0.5;  // 0.5% ROI stop loss
    const tpRoi = 2.0;  // 2.0% ROI take profit
    
    const stopLossPrice = TrailingStopPolicy.calculateInitialStop(side, entry.entryFillPrice, slRoi, leverage);
    const takeProfitPrice = DecimalMath.calculateTakeProfitPrice(side, entry.entryFillPrice, tpRoi, leverage);
    
    // Store position with metadata tags
    variant.position = {
      ...entry,
      symbol,
      stopLossPrice,
      takeProfitPrice,
      signal,
      openedAt: Date.now(),
      // Trailing stop state
      lastROIStep: 0,
      breakEvenArmed: false,
      entryFeeRate: entry.entryFeeRate || 0.0006,
      expectedExitFeeRate: 0.0006,
      // Metadata tags
      experimental: true,
      variantId: variant.variantId,
      configSnapshot: {
        profileName: variant.profileName,
        leverage,
        positionSize: positionSizePercent,
        thresholds: variant.customParams.thresholds || signalWeights.thresholds
      },
      latencyMs: totalLatency
    };
    
    console.log(
      `[Optimizer] ${variant.variantId} (${variant.profileName}): Opened ${side} position on ${symbol} @ ${entry.entryFillPrice.toFixed(2)} ` +
      `[leverage: ${leverage}x, size: ${positionSizePercent}%, latency: ${totalLatency}ms]`
    );
    
    // Emit telemetry event
    this.emit('variant:position_opened', {
      variantId: variant.variantId,
      profileName: variant.profileName,
      side,
      entryPrice: entry.entryFillPrice,
      leverage,
      positionSize: positionSizePercent,
      latencyMs: totalLatency,
      timestamp: Date.now()
    });
  }

  /**
   * Consider opening a position based on signal
   * @param {TradingVariant} variant - Variant to consider entry for
   * @param {Object} signal - Generated signal
   * @param {number} currentPrice - Current market price
   * @param {string} symbol - Trading symbol
   * @param {number} signalLatency - Time taken to generate signal (ms)
   */
  considerEntry(variant, signal, currentPrice, symbol, signalLatency = 0) {
    // Safety check: only trade if paper trading enabled
    if (!this.config.paperTrading) {
      return;
    }
    
    // Check variant limits
    if (!variant.canOpenPosition()) {
      return;
    }
    
    // Execute paper trade
    this.executePaperTrade(variant, signal, currentPrice, symbol, signalLatency);
  }

  /**
   * Update trailing stop for position and check exit conditions
   */
  checkExitConditions(variant, currentPrice) {
    if (!variant.position) return;
    
    const position = variant.position;
    const { side, stopLossPrice, takeProfitPrice } = position;
    
    // First, update trailing stop if position has current MTM
    if (position.currentMtm) {
      const currentROI = position.currentMtm.unrealizedROI;
      
      // Ask TrailingStopPolicy if stop should be updated
      const trailingUpdate = TrailingStopPolicy.nextStop({
        side,
        entryPrice: position.entryFillPrice,
        currentStop: position.stopLossPrice,
        currentROI,
        lastROIStep: position.lastROIStep || 0,
        leverage: position.leverage,
        entryFeeRate: position.entryFeeRate || 0.0006,
        exitFeeRate: position.expectedExitFeeRate || 0.0006,
        config: this.config.trailing || TrailingStopPolicy.getDefaultConfig(),
        breakEvenArmed: position.breakEvenArmed || false
      });
      
      // Update stop if it tightened
      if (trailingUpdate.reason !== 'no_change') {
        position.stopLossPrice = trailingUpdate.newStopPrice;
        position.lastROIStep = trailingUpdate.newLastROIStep;
        position.breakEvenArmed = trailingUpdate.breakEvenArmed;
        
        // Log stop update for paper trading
        if (this.config.paperTrading) {
          console.log(
            `[Optimizer] ${variant.profileName}: Trailing stop updated to ${trailingUpdate.newStopPrice.toFixed(2)} ` +
            `(${trailingUpdate.reason}, ROI: ${currentROI.toFixed(2)}%)`
          );
        }
        
        // For real trading, would call StopOrderStateMachine.updateStop() here
        // if (this.config.realTradingEnabled && variant.stopOrderStateMachine) {
        //   variant.stopOrderStateMachine.updateStop(trailingUpdate.newStopPrice, stopParams);
        // }
      }
    }
    
    let exitReason = null;
    
    // Check stop loss (using potentially updated stop price)
    if (side === 'long' && currentPrice <= position.stopLossPrice) {
      exitReason = 'stop_loss';
    } else if (side === 'short' && currentPrice >= position.stopLossPrice) {
      exitReason = 'stop_loss';
    }
    
    // Check take profit
    if (side === 'long' && currentPrice >= takeProfitPrice) {
      exitReason = 'take_profit';
    } else if (side === 'short' && currentPrice <= takeProfitPrice) {
      exitReason = 'take_profit';
    }
    
    // Exit if condition met
    if (exitReason) {
      this.closePaperPosition(variant, currentPrice, exitReason);
    }
  }

  /**
   * Close paper trading position with metadata
   * @param {TradingVariant} variant - Variant to close position for
   * @param {number} currentPrice - Current market price
   * @param {string} exitReason - Reason for exit
   */
  closePaperPosition(variant, currentPrice, exitReason) {
    if (!variant.position) return;
    
    // Simulate exit using ExecutionSimulator
    const exit = ExecutionSimulator.simulateExit(
      variant.position,
      currentPrice,
      0.0006,  // taker fee
      0.02,    // slippage %
      0,       // funding fees (placeholder)
      exitReason
    );
    
    // Create trade record with metadata tags
    const trade = {
      symbol: variant.position.symbol,
      side: variant.position.side,
      entryPrice: variant.position.entryFillPrice,
      exitPrice: exit.exitFillPrice,
      size: variant.position.size,
      leverage: variant.position.leverage,
      marginUsed: variant.position.marginUsed,
      realizedGrossPnl: exit.realizedGrossPnl,
      realizedNetPnl: exit.realizedNetPnl,
      realizedROI: exit.realizedROI,
      totalFees: exit.totalFees,
      exitReason,
      openedAt: variant.position.openedAt,
      closedAt: Date.now(),
      duration: Date.now() - variant.position.openedAt,
      latencyMs: variant.position.latencyMs || 0,
      // Metadata tags
      experimental: true,
      variantId: variant.variantId,
      configSnapshot: variant.position.configSnapshot
    };
    
    // Update variant metrics
    variant.updateMetrics(trade);
    variant.tradeHistory.push(trade);
    
    // Clear position
    variant.position = null;
    
    console.log(
      `[Optimizer] ${variant.variantId} (${variant.profileName}): Closed position @ ${exit.exitFillPrice.toFixed(2)} | ` +
      `Net P&L: ${exit.realizedNetPnl.toFixed(2)} USDT (${exit.realizedROI.toFixed(2)}%) | ${exitReason}`
    );
    
    // Emit telemetry event
    this.emit('variant:position_closed', {
      variantId: variant.variantId,
      profileName: variant.profileName,
      realizedNetPnl: exit.realizedNetPnl,
      realizedROI: exit.realizedROI,
      exitReason,
      duration: trade.duration,
      timestamp: Date.now()
    });
    
    // Check if variant is ready for promotion evaluation
    if (this.config.promotion.enabled && variant.metrics.tradesCount >= this.config.promotion.minSampleSize) {
      const promotionScore = this.evaluatePromotion(variant);
      if (promotionScore.shouldPromote) {
        this.emit('variant:promotion_eligible', {
          variantId: variant.variantId,
          profileName: variant.profileName,
          score: promotionScore,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * Collect comprehensive metrics from all variants
   * @returns {Object} Aggregated metrics
   */
  collectMetrics() {
    const metrics = {
      timestamp: Date.now(),
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      variantCount: this.variants.size,
      totalTrades: 0,
      totalNetPnl: 0,
      avgWinRate: 0,
      avgSharpeRatio: 0,
      avgLatencyMs: 0,
      activePositions: 0,
      circuitBreakersOpen: 0,
      variants: []
    };

    let winRateSum = 0;
    let sharpeSum = 0;
    let latencySum = 0;
    let validVariants = 0;

    for (const [variantId, variant] of this.variants) {
      metrics.totalTrades += variant.metrics.tradesCount;
      metrics.totalNetPnl += variant.metrics.totalNetPnl;
      
      if (variant.position) {
        metrics.activePositions++;
      }
      
      if (variant.circuitBreakerOpen) {
        metrics.circuitBreakersOpen++;
      }

      if (variant.metrics.tradesCount > 0) {
        winRateSum += variant.metrics.winRate;
        sharpeSum += variant.metrics.sharpeRatio;
        latencySum += variant.metrics.avgLatencyMs;
        validVariants++;
      }

      metrics.variants.push({
        variantId,
        profileName: variant.profileName,
        tradesCount: variant.metrics.tradesCount,
        winRate: variant.metrics.winRate,
        avgROI: variant.metrics.avgROI,
        sharpeRatio: variant.metrics.sharpeRatio,
        totalNetPnl: variant.metrics.totalNetPnl,
        avgLatencyMs: variant.metrics.avgLatencyMs,
        hasPosition: variant.position !== null,
        circuitBreakerOpen: variant.circuitBreakerOpen,
        errorCount: variant.errorCount
      });
    }

    if (validVariants > 0) {
      metrics.avgWinRate = winRateSum / validVariants;
      metrics.avgSharpeRatio = sharpeSum / validVariants;
      metrics.avgLatencyMs = latencySum / validVariants;
    }

    // Add resource usage if tracking enabled
    if (this.config.telemetry.trackResourceUsage) {
      metrics.resourceUsage = this._measureResourceUsage();
    }

    return metrics;
  }

  /**
   * Measure resource usage (CPU and memory)
   * @returns {Object} Resource usage metrics
   * @private
   */
  _measureResourceUsage() {
    const usage = process.memoryUsage();
    const now = Date.now();
    const elapsed = (now - this.resourceUsage.lastMeasurement) / 1000;  // seconds

    // Update last measurement
    this.resourceUsage.lastMeasurement = now;

    return {
      heapUsedMB: (usage.heapUsed / 1024 / 1024).toFixed(2),
      heapTotalMB: (usage.heapTotal / 1024 / 1024).toFixed(2),
      rssMB: (usage.rss / 1024 / 1024).toFixed(2),
      externalMB: (usage.external / 1024 / 1024).toFixed(2),
      timestamp: now
    };
  }

  /**
   * Evaluate variant for promotion to production
   * Uses composite scoring with statistical significance testing
   * @param {TradingVariant} variant - Variant to evaluate
   * @returns {Object} Promotion evaluation result
   */
  evaluatePromotion(variant) {
    const config = this.config.promotion;
    
    // Check minimum sample size
    if (variant.metrics.tradesCount < config.minSampleSize) {
      return {
        shouldPromote: false,
        reason: 'insufficient_sample_size',
        score: 0,
        metrics: variant.metrics
      };
    }

    // Check minimum thresholds
    const checks = {
      winRate: variant.metrics.winRate >= config.minWinRate,
      avgROI: variant.metrics.avgROI >= config.minAvgROI,
      sharpeRatio: variant.metrics.sharpeRatio >= config.minSharpeRatio
    };

    // Calculate composite score (weighted average)
    const weights = {
      winRate: 0.3,
      avgROI: 0.4,
      sharpeRatio: 0.3
    };

    const score = 
      (variant.metrics.winRate / config.minWinRate) * weights.winRate +
      (variant.metrics.avgROI / config.minAvgROI) * weights.avgROI +
      (variant.metrics.sharpeRatio / config.minSharpeRatio) * weights.sharpeRatio;

    // Statistical significance test (simple t-test approximation)
    const avgReturn = variant.metrics.avgROI;
    const returns = variant.metrics.returns;
    const n = returns.length;
    
    let isSignificant = false;
    if (n >= 2) {
      const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (n - 1);
      const stdError = Math.sqrt(variance / n);
      // Z-score for 95% confidence (1.96)
      // Check for zero to avoid division by zero
      if (stdError > 0) {
        const zScore = avgReturn / stdError;
        isSignificant = Math.abs(zScore) >= 1.96;
      } else {
        // If all returns are identical (stdError = 0), check if mean is non-zero
        isSignificant = avgReturn !== 0;
      }
    }

    // Decision: promote if all checks pass, score >= 1.0, and statistically significant
    const shouldPromote = 
      checks.winRate && 
      checks.avgROI && 
      checks.sharpeRatio && 
      score >= 1.0 && 
      isSignificant;

    return {
      shouldPromote,
      score: score.toFixed(3),
      checks,
      isStatisticallySignificant: isSignificant,
      metrics: {
        tradesCount: variant.metrics.tradesCount,
        winRate: (variant.metrics.winRate * 100).toFixed(2) + '%',
        avgROI: variant.metrics.avgROI.toFixed(2) + '%',
        sharpeRatio: variant.metrics.sharpeRatio.toFixed(2),
        totalNetPnl: variant.metrics.totalNetPnl.toFixed(2)
      },
      gradualRollout: config.gradualRolloutSteps
    };
  }

  /**
   * Publish telemetry metrics to event emitter
   * Non-blocking, emits metrics for dashboard consumption
   */
  publishTelemetry() {
    if (!this.config.telemetry.enabled || !this.running) {
      return;
    }

    try {
      const metrics = this.collectMetrics();
      
      // Emit telemetry event (non-blocking)
      this.emit('telemetry:metrics', metrics);
      
      // Also log summary periodically
      if (metrics.totalTrades > 0) {
        console.log(
          `[Optimizer] Telemetry: ${metrics.variantCount} variants, ` +
          `${metrics.totalTrades} trades, ` +
          `${metrics.activePositions} active, ` +
          `Net P&L: ${metrics.totalNetPnl.toFixed(2)} USDT, ` +
          `Avg Win Rate: ${(metrics.avgWinRate * 100).toFixed(1)}%`
        );
      }
    } catch (error) {
      console.error('[Optimizer] Error publishing telemetry:', error.message);
    }
  }

  /**
   * Get optimizer status for all variants
   * @returns {Object} Current status
   */
  getStatus() {
    const status = {
      initialized: this.initialized,
      running: this.running,
      paperTrading: this.config.paperTrading,
      accountBalance: this.accountBalance,
      uptime: this.startTime ? Date.now() - this.startTime : 0,
      variants: {}
    };
    
    for (const [name, variant] of this.variants) {
      status.variants[name] = variant.toJSON();
    }
    
    return status;
  }

  /**
   * Get performance comparison between variants
   * @returns {Array<Object>} Sorted variant performance data
   */
  getPerformanceComparison() {
    const comparison = [];
    
    for (const [variantId, variant] of this.variants) {
      comparison.push({
        variantId,
        profile: variant.profileName,
        tradesCount: variant.metrics.tradesCount,
        winRate: (variant.metrics.winRate * 100).toFixed(1) + '%',
        avgROI: variant.metrics.avgROI.toFixed(2) + '%',
        sharpeRatio: variant.metrics.sharpeRatio.toFixed(2),
        totalNetPnl: variant.metrics.totalNetPnl.toFixed(2),
        avgPnlPerTrade: variant.metrics.avgPnLPerTrade.toFixed(2),
        avgLatencyMs: variant.metrics.avgLatencyMs.toFixed(1),
        circuitBreakerOpen: variant.circuitBreakerOpen,
        errorCount: variant.errorCount
      });
    }
    
    // Sort by total net PnL descending
    comparison.sort((a, b) => parseFloat(b.totalNetPnl) - parseFloat(a.totalNetPnl));
    
    return comparison;
  }

  /**
   * Reset all variants (for testing)
   */
  reset() {
    // Stop if running
    if (this.running) {
      this.stop();
    }
    
    this.variants.clear();
    this.initialized = false;
    this.accountBalance = 10000;
    this.startTime = null;
    this.resourceUsage = {
      cpu: 0,
      memory: 0,
      lastMeasurement: Date.now()
    };
  }
}

module.exports = LiveOptimizerController;
module.exports.OptimizerConfig = OptimizerConfig;
module.exports.TradingVariant = TradingVariant;
