/**
 * LIVE OPTIMIZER CONTROLLER
 * Runs parallel strategy variant testing using live market data
 * Never blocks main trading loop, respects rate limits, includes safety mechanisms
 */

const { EventEmitter } = require('events');
const OptimizerConfig = require('./OptimizerConfig');
const ScoringEngine = require('./ScoringEngine');
const TelemetryFeed = require('./TelemetryFeed');

class LiveOptimizerController extends EventEmitter {
  constructor(config = OptimizerConfig, marketDataManager = null, technicalIndicators = null) {
    super();
    
    this.config = config;
    this.scoringEngine = new ScoringEngine(config);
    this.telemetryFeed = new TelemetryFeed();
    this.marketDataManager = marketDataManager;
    this.technicalIndicators = technicalIndicators;
    
    // Experiment state
    this.running = false;
    this.variants = new Map(); // variantId -> variant state
    this.variantMetrics = new Map(); // variantId -> metrics
    this.activeExperiments = [];
    
    // Rate limiting
    this.lastApiCall = 0;
    
    // Safety tracking
    this.globalDrawdown = 0;
    this.stoppedVariants = new Set();
    
    // Price feed subscription
    this.priceSubscription = null;
    this.lastPrice = null;
  }
  
  /**
   * Start the optimizer with given configuration
   * @param {Object} options - Optimizer options
   */
  async start(options = {}) {
    if (this.running) {
      throw new Error('Optimizer is already running');
    }
    
    // Validate config
    this.config.validate();
    
    this.running = true;
    this.emit('optimizer:started', { timestamp: Date.now() });
    
    // Generate strategy variants
    const maxVariants = options.maxVariants || this.config.experiments.maxConcurrent;
    this.activeExperiments = this.config.generateVariants(maxVariants);
    
    // Initialize variant states
    for (const experiment of this.activeExperiments) {
      this.initializeVariant(experiment);
    }
    
    // Subscribe to price feed
    this.subscribeToPriceFeed();
    
    // Start metrics tracking
    this.startMetricsTracking();
    
    console.log(`[Optimizer] Started with ${this.activeExperiments.length} strategy variants`);
    
    return {
      success: true,
      variantCount: this.activeExperiments.length,
      variants: this.activeExperiments.map(v => ({ id: v.id, profile: v.profile, timeframe: v.timeframe }))
    };
  }
  
  /**
   * Stop the optimizer
   */
  async stop() {
    if (!this.running) {
      return { success: false, message: 'Optimizer is not running' };
    }
    
    this.running = false;
    
    // Unsubscribe from price feed
    if (this.priceSubscription) {
      this.priceSubscription();
      this.priceSubscription = null;
    }
    
    // Stop metrics tracking
    this.stopMetricsTracking();
    
    // Export final snapshot
    const finalSnapshot = this.exportResults();
    
    this.emit('optimizer:stopped', { 
      timestamp: Date.now(),
      finalSnapshot 
    });
    
    console.log('[Optimizer] Stopped');
    
    return {
      success: true,
      finalResults: finalSnapshot
    };
  }
  
  /**
   * Initialize a strategy variant
   * @param {Object} experiment - Experiment configuration
   */
  initializeVariant(experiment) {
    const variantState = {
      id: experiment.id,
      config: experiment,
      status: 'active',
      trades: [],
      positions: [],
      startTime: Date.now(),
      lastUpdate: Date.now()
    };
    
    const metrics = {
      roi: 0,
      winRate: 0,
      sharpeRatio: 0,
      avgPnLPerTrade: 0,
      maxDrawdown: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      totalPnL: 0,
      consecutiveWins: 0,
      consecutiveLosses: 0,
      currentStreak: 0
    };
    
    this.variants.set(experiment.id, variantState);
    this.variantMetrics.set(experiment.id, metrics);
    
    // Publish initial metrics
    this.telemetryFeed.publish(experiment.id, metrics);
  }
  
  /**
   * Subscribe to price feed (reuses main WebSocket feed)
   */
  subscribeToPriceFeed() {
    // This would subscribe to the existing WebSocket feed from server.js
    // For now, we'll use a simulated subscription
    this.emit('feed:subscribed');
  }
  
  /**
   * Process incoming price tick
   * @param {Object} tick - Price tick data
   */
  async processPriceTick(tick) {
    if (!this.running) return;
    
    this.lastPrice = tick.price;
    
    // Process each active variant
    for (const [variantId, variant] of this.variants.entries()) {
      if (variant.status !== 'active') continue;
      if (this.stoppedVariants.has(variantId)) continue;
      
      try {
        await this.processVariantTick(variantId, tick);
      } catch (error) {
        console.error(`[Optimizer] Error processing variant ${variantId}:`, error.message);
      }
    }
  }
  
  /**
   * Process tick for a specific variant
   * @param {string} variantId - Variant identifier
   * @param {Object} tick - Price tick data
   */
  async processVariantTick(variantId, tick) {
    const variant = this.variants.get(variantId);
    if (!variant) return;
    
    // Generate signal using variant's configuration
    const signal = await this.generateSignal(variant, tick);
    
    if (signal) {
      // Paper trading: simulate trade execution
      await this.executePaperTrade(variantId, signal, tick.price);
    }
    
    // Update position P&L
    this.updateVariantPositions(variantId, tick.price);
    
    // Check safety limits
    this.checkSafetyLimits(variantId);
  }
  
  /**
   * Generate trading signal for a variant (PLACEHOLDER)
   * 
   * WARNING: This is a placeholder implementation that returns null.
   * The optimizer cannot execute actual trades until this is implemented.
   * 
   * NOTE: This is a placeholder for signal generation integration.
   * In production, this should call TechnicalIndicators with variant-specific
   * weights and configuration from signal-weights.js.
   * 
   * @param {Object} variant - Strategy variant
   * @param {Object} tick - Price tick data
   * @returns {Object|null} Trading signal or null
   */
  async generateSignal(variant, tick) {
    // TODO: Implement variant-specific signal generation
    // This would use the variant's configuration to generate signals:
    // 1. Apply variant weight profile from signal-weights.js
    // 2. Use variant-specific RSI/MACD/etc thresholds
    // 3. Calculate signal score with variant parameters
    // 4. Return signal with experimental metadata
    
    // For now, return null (no signal)
    // NOTE: Until this is implemented, the optimizer will track metrics
    // but will not execute any trades (paper or live).
    return null;
  }
  
  /**
   * Execute paper trade for a variant
   * @param {string} variantId - Variant identifier
   * @param {Object} signal - Trading signal
   * @param {number} price - Current price
   */
  async executePaperTrade(variantId, signal, price) {
    const variant = this.variants.get(variantId);
    const metrics = this.variantMetrics.get(variantId);
    
    if (!variant || !metrics) return;
    
    // Respect rate limits
    await this.throttleApiCall();
    
    // Create paper trade
    const trade = {
      id: `trade_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      variantId,
      side: signal.side,
      entryPrice: price,
      size: this.config.safety.realTradingOrderSize,
      timestamp: Date.now(),
      status: 'open',
      stopLoss: this.calculateStopLoss(price, signal.side, variant.config),
      takeProfit: this.calculateTakeProfit(price, signal.side, variant.config),
      experimental: true,
      strategyVariantId: variantId
    };
    
    variant.trades.push(trade);
    variant.positions.push(trade);
    
    this.emit('trade:opened', { variantId, trade });
  }
  
  /**
   * Calculate stop loss price
   * @param {number} entryPrice - Entry price
   * @param {string} side - Trade side (long/short)
   * @param {Object} config - Variant configuration
   * @returns {number} Stop loss price
   */
  calculateStopLoss(entryPrice, side, config) {
    const slROI = config.stopLossROI || 0.5;
    const leverage = config.leverage || 10;
    const slPercent = slROI / leverage;
    
    if (side === 'long') {
      return entryPrice * (1 - slPercent / 100);
    } else {
      return entryPrice * (1 + slPercent / 100);
    }
  }
  
  /**
   * Calculate take profit price
   * @param {number} entryPrice - Entry price
   * @param {string} side - Trade side (long/short)
   * @param {Object} config - Variant configuration
   * @returns {number} Take profit price
   */
  calculateTakeProfit(entryPrice, side, config) {
    const tpROI = config.takeProfitROI || 2.0;
    const leverage = config.leverage || 10;
    const tpPercent = tpROI / leverage;
    
    if (side === 'long') {
      return entryPrice * (1 + tpPercent / 100);
    } else {
      return entryPrice * (1 - tpPercent / 100);
    }
  }
  
  /**
   * Update positions for a variant based on current price
   * @param {string} variantId - Variant identifier
   * @param {number} currentPrice - Current market price
   */
  updateVariantPositions(variantId, currentPrice) {
    const variant = this.variants.get(variantId);
    if (!variant) return;
    
    for (const position of variant.positions) {
      if (position.status !== 'open') continue;
      
      // Check stop loss
      if (this.isStopLossHit(position, currentPrice)) {
        this.closePosition(variantId, position, currentPrice, 'stop_loss');
        continue;
      }
      
      // Check take profit
      if (this.isTakeProfitHit(position, currentPrice)) {
        this.closePosition(variantId, position, currentPrice, 'take_profit');
        continue;
      }
      
      // Update unrealized P&L
      position.unrealizedPnL = this.calculateUnrealizedPnL(position, currentPrice);
    }
  }
  
  /**
   * Check if stop loss is hit
   * @param {Object} position - Position object
   * @param {number} currentPrice - Current price
   * @returns {boolean} True if stop loss hit
   */
  isStopLossHit(position, currentPrice) {
    if (position.side === 'long') {
      return currentPrice <= position.stopLoss;
    } else {
      return currentPrice >= position.stopLoss;
    }
  }
  
  /**
   * Check if take profit is hit
   * @param {Object} position - Position object
   * @param {number} currentPrice - Current price
   * @returns {boolean} True if take profit hit
   */
  isTakeProfitHit(position, currentPrice) {
    if (position.side === 'long') {
      return currentPrice >= position.takeProfit;
    } else {
      return currentPrice <= position.takeProfit;
    }
  }
  
  /**
   * Calculate unrealized P&L
   * @param {Object} position - Position object
   * @param {number} currentPrice - Current price
   * @returns {number} Unrealized P&L
   */
  calculateUnrealizedPnL(position, currentPrice) {
    const priceDiff = position.side === 'long' 
      ? currentPrice - position.entryPrice
      : position.entryPrice - currentPrice;
    
    return (priceDiff / position.entryPrice) * 100 * position.size;
  }
  
  /**
   * Close a position
   * @param {string} variantId - Variant identifier
   * @param {Object} position - Position to close
   * @param {number} exitPrice - Exit price
   * @param {string} reason - Reason for closing
   */
  closePosition(variantId, position, exitPrice, reason) {
    position.status = 'closed';
    position.exitPrice = exitPrice;
    position.closeReason = reason;
    position.realizedPnL = this.calculateUnrealizedPnL(position, exitPrice);
    position.closedAt = Date.now();
    
    // Update metrics
    this.updateMetrics(variantId, position);
    
    this.emit('trade:closed', { variantId, position });
  }
  
  /**
   * Update metrics for a variant after trade close
   * @param {string} variantId - Variant identifier
   * @param {Object} trade - Closed trade
   */
  updateMetrics(variantId, trade) {
    const metrics = this.variantMetrics.get(variantId);
    if (!metrics) return;
    
    metrics.totalTrades++;
    metrics.totalPnL += trade.realizedPnL;
    
    if (trade.realizedPnL > 0) {
      metrics.winningTrades++;
      metrics.consecutiveWins++;
      metrics.consecutiveLosses = 0;
    } else {
      metrics.losingTrades++;
      metrics.consecutiveLosses++;
      metrics.consecutiveWins = 0;
    }
    
    // Update win rate
    metrics.winRate = metrics.winningTrades / metrics.totalTrades;
    
    // Update ROI
    metrics.roi = metrics.totalPnL;
    
    // Update average P&L per trade
    metrics.avgPnLPerTrade = metrics.totalPnL / metrics.totalTrades;
    
    // Update Sharpe ratio (simplified)
    metrics.sharpeRatio = this.calculateSharpeRatio(variantId);
    
    // Update max drawdown
    this.updateMaxDrawdown(variantId);
    
    // Publish updated metrics
    this.telemetryFeed.publish(variantId, metrics);
  }
  
  /**
   * Calculate Sharpe ratio for a variant
   * @param {string} variantId - Variant identifier
   * @returns {number} Sharpe ratio
   */
  calculateSharpeRatio(variantId) {
    const variant = this.variants.get(variantId);
    if (!variant || variant.trades.length < 2) return 0;
    
    const returns = variant.trades
      .filter(t => t.status === 'closed')
      .map(t => t.realizedPnL);
    
    if (returns.length < 2) return 0;
    
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    return stdDev === 0 ? 0 : avgReturn / stdDev;
  }
  
  /**
   * Update max drawdown for a variant
   * @param {string} variantId - Variant identifier
   */
  updateMaxDrawdown(variantId) {
    const variant = this.variants.get(variantId);
    const metrics = this.variantMetrics.get(variantId);
    
    if (!variant || !metrics) return;
    
    let peak = 0;
    let maxDrawdown = 0;
    let cumulative = 0;
    
    for (const trade of variant.trades) {
      if (trade.status !== 'closed') continue;
      
      cumulative += trade.realizedPnL;
      
      if (cumulative > peak) {
        peak = cumulative;
      }
      
      // Only calculate drawdown when peak is positive and meaningful
      let drawdown = 0;
      if (peak > 0) {
        drawdown = ((peak - cumulative) / peak) * 100;
      }
      
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }
    
    metrics.maxDrawdown = maxDrawdown;
  }
  
  /**
   * Check safety limits for a variant
   * @param {string} variantId - Variant identifier
   */
  checkSafetyLimits(variantId) {
    const metrics = this.variantMetrics.get(variantId);
    if (!metrics) return;
    
    // Check max loss per variant
    if (metrics.roi < -this.config.safety.maxLossPerVariant) {
      this.stopVariant(variantId, 'Max loss limit exceeded');
      return;
    }
    
    // Check max drawdown
    if (metrics.maxDrawdown > this.config.safety.maxDrawdownPercent) {
      this.stopVariant(variantId, 'Max drawdown exceeded');
      return;
    }
  }
  
  /**
   * Stop a specific variant
   * @param {string} variantId - Variant identifier
   * @param {string} reason - Reason for stopping
   */
  stopVariant(variantId, reason) {
    const variant = this.variants.get(variantId);
    if (!variant) return;
    
    variant.status = 'stopped';
    this.stoppedVariants.add(variantId);
    
    // Close all open positions
    for (const position of variant.positions) {
      if (position.status === 'open' && this.lastPrice) {
        this.closePosition(variantId, position, this.lastPrice, 'variant_stopped');
      }
    }
    
    this.emit('variant:stopped', { variantId, reason });
    
    console.log(`[Optimizer] Stopped variant ${variantId}: ${reason}`);
  }
  
  /**
   * Throttle API calls to respect rate limits
   */
  async throttleApiCall() {
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCall;
    
    if (timeSinceLastCall < this.config.rateLimiting.throttleDelay) {
      const waitTime = this.config.rateLimiting.throttleDelay - timeSinceLastCall;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastApiCall = Date.now();
  }
  
  /**
   * Start metrics tracking interval
   */
  startMetricsTracking() {
    this.metricsInterval = setInterval(() => {
      this.updateAllMetrics();
    }, this.config.metrics.trackingInterval);
    
    this.snapshotInterval = setInterval(() => {
      this.saveSnapshot();
    }, this.config.metrics.snapshotInterval);
  }
  
  /**
   * Stop metrics tracking interval
   */
  stopMetricsTracking() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }
  }
  
  /**
   * Update all metrics
   */
  updateAllMetrics() {
    for (const [variantId, metrics] of this.variantMetrics.entries()) {
      this.telemetryFeed.publish(variantId, metrics);
    }
  }
  
  /**
   * Save metrics snapshot
   */
  saveSnapshot() {
    const snapshot = this.telemetryFeed.exportSnapshot();
    this.emit('snapshot:saved', snapshot);
  }
  
  /**
   * Get current status
   * @returns {Object} Current optimizer status
   */
  getStatus() {
    return {
      running: this.running,
      activeVariants: this.activeExperiments.length,
      stoppedVariants: this.stoppedVariants.size,
      totalTrades: Array.from(this.variantMetrics.values())
        .reduce((sum, m) => sum + m.totalTrades, 0),
      summary: this.telemetryFeed.getSummary()
    };
  }
  
  /**
   * Get results for all variants
   * @returns {Object} Results with rankings
   */
  getResults() {
    const variants = Array.from(this.variants.values()).map(variant => ({
      id: variant.id,
      config: variant.config,
      status: variant.status,
      metrics: this.variantMetrics.get(variant.id),
      trades: variant.trades.length,
      openPositions: variant.positions.filter(p => p.status === 'open').length
    }));
    
    // Rank variants
    const ranked = this.scoringEngine.rankVariants(variants);
    
    return {
      variants: ranked,
      topPerformers: this.telemetryFeed.getTopPerformers(5),
      summary: this.telemetryFeed.getSummary()
    };
  }
  
  /**
   * Promote a strategy variant to production
   * @param {string} variantId - Variant to promote
   * @returns {Object} Promotion result
   */
  async promoteVariant(variantId) {
    const metrics = this.variantMetrics.get(variantId);
    
    if (!metrics) {
      throw new Error('Variant not found');
    }
    
    // Check promotion gates
    const gateCheck = this.scoringEngine.checkPromotionGate(metrics);
    
    if (!gateCheck.passed) {
      return {
        success: false,
        message: gateCheck.message,
        checks: gateCheck.checks
      };
    }
    
    // Variant passed all gates
    this.emit('variant:promoted', { variantId, metrics, gateCheck });
    
    return {
      success: true,
      message: 'Strategy variant promoted to production',
      variantId,
      metrics,
      confidence: gateCheck.confidence
    };
  }
  
  /**
   * Export all results
   * @returns {Object} Complete results export
   */
  exportResults() {
    return {
      timestamp: Date.now(),
      status: this.getStatus(),
      results: this.getResults(),
      telemetry: this.telemetryFeed.exportSnapshot()
    };
  }
}

module.exports = LiveOptimizerController;
