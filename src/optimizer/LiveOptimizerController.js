// ============================================================================
// LiveOptimizerController.js - Live Strategy Optimizer with Paper Trading
// ============================================================================
// Manages multiple signal profile variants for paper trading and optimization
// Uses ExecutionSimulator for realistic fee/slippage modeling

const ExecutionSimulator = require('./ExecutionSimulator');
const SignalGenerator = require('../lib/SignalGenerator');
const DecimalMath = require('../lib/DecimalMath');
const TrailingStopPolicy = require('./TrailingStopPolicy');

/**
 * Optimizer configuration schema
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
    default: 1.0   // Default position size %
  },

  // Leverage bounds
  leverage: {
    min: 5,
    max: 20,
    default: 10
  },

  // Signal profiles to test
  profiles: ['default', 'conservative', 'aggressive', 'balanced'],

  // Execution model
  fillModel: 'taker',  // 'taker' or 'probabilistic_limit'

  // Variant isolation
  maxConcurrentVariants: 4,
  maxPositionsPerVariant: 1,

  // Trailing stop configuration
  trailing: {
    breakEvenBuffer: 0.1,
    trailingStepPercent: 0.15,
    trailingMovePercent: 0.05,
    trailingMode: 'staircase'
  }
};

/**
 * Trading variant - represents one signal profile being tested
 */
class TradingVariant {
  constructor(profileName, config) {
    this.profileName = profileName;
    this.config = config;
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
      peakBalance: 0
    };
    this.tradeHistory = [];
  }

  /**
   * Check if variant can open a new position
   */
  canOpenPosition() {
    return this.position === null;
  }

  /**
   * Update metrics after a trade closes
   */
  updateMetrics(trade) {
    this.metrics.tradesCount++;
    this.metrics.totalNetPnl += trade.realizedNetPnl;
    this.metrics.totalGrossPnl += trade.realizedGrossPnl;

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
  }

  /**
   * Get current state as JSON
   */
  toJSON() {
    return {
      profileName: this.profileName,
      position: this.position ? {
        side: this.position.side,
        entryPrice: this.position.entryFillPrice,
        size: this.position.size,
        leverage: this.position.leverage,
        marginUsed: this.position.marginUsed,
        unrealizedPnl: this.position.currentMtm?.unrealizedNetPnl || 0,
        unrealizedROI: this.position.currentMtm?.unrealizedROI || 0
      } : null,
      metrics: this.metrics,
      recentTrades: this.tradeHistory.slice(-5)
    };
  }
}

/**
 * LiveOptimizerController - Manages paper trading for multiple variants
 */
class LiveOptimizerController {
  constructor(config = OptimizerConfig) {
    this.config = { ...OptimizerConfig, ...config };
    this.variants = new Map();
    this.accountBalance = 10000; // Starting paper balance
    this.initialized = false;

    // Initialize SignalGenerator
    SignalGenerator.initialize();
  }

  /**
   * Initialize optimizer with variants
   */
  initialize() {
    if (this.initialized) return;

    // Create variant for each profile
    for (const profile of this.config.profiles) {
      const variant = new TradingVariant(profile, this.config);
      this.variants.set(profile, variant);
    }

    this.initialized = true;
    console.log(`[Optimizer] Initialized with ${this.variants.size} variants: ${this.config.profiles.join(', ')}`);
  }

  /**
   * Process new market data and generate signals
   */
  onMarketUpdate(symbol, indicators, currentPrice) {
    if (!this.initialized) {
      this.initialize();
    }

    // Update all variant positions with current price
    for (const [profileName, variant] of this.variants) {
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
        SignalGenerator.setProfile(profileName);
        const signal = SignalGenerator.generate(indicators);

        // Consider entry if strong signal
        if (signal.type === 'STRONG_BUY' || signal.type === 'STRONG_SELL') {
          this.considerEntry(variant, signal, currentPrice, symbol);
        }
      }
    }
  }

  /**
   * Execute paper trade entry
   */
  executePaperTrade(variant, signal, currentPrice, symbol) {
    const side = signal.type.includes('BUY') ? 'long' : 'short';

    // Calculate position size and leverage
    const positionSizePercent = this.config.positionSize.default;
    const leverage = this.config.leverage.default;

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

    // Calculate stop loss and take profit using ROI-based levels
    const slRoi = 0.5;  // 0.5% ROI stop loss
    const tpRoi = 2.0;  // 2.0% ROI take profit

    const stopLossPrice = TrailingStopPolicy.calculateInitialStop(side, entry.entryFillPrice, slRoi, leverage);
    const takeProfitPrice = DecimalMath.calculateTakeProfitPrice(side, entry.entryFillPrice, tpRoi, leverage);

    // Store position with trailing stop state
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
      expectedExitFeeRate: 0.0006
    };

    console.log(`[Optimizer] ${variant.profileName}: Opened ${side} position on ${symbol} @ ${entry.entryFillPrice.toFixed(2)}`);
  }

  /**
   * Consider opening a position based on signal
   */
  considerEntry(variant, signal, currentPrice, symbol) {
    // Safety check: only trade if paper trading enabled
    if (!this.config.paperTrading) {
      return;
    }

    // Check variant limits
    if (!variant.canOpenPosition()) {
      return;
    }

    // Execute paper trade
    this.executePaperTrade(variant, signal, currentPrice, symbol);
  }

  /**
   * Update trailing stop for position and check exit conditions
   */
  checkExitConditions(variant, currentPrice) {
    if (!variant.position) return;

    const position = variant.position;
    const { side, stopLossPrice: _stopLossPrice, takeProfitPrice } = position;

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
   * Close paper trading position
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

    // Create trade record
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
      duration: Date.now() - variant.position.openedAt
    };

    // Update variant metrics
    variant.updateMetrics(trade);
    variant.tradeHistory.push(trade);

    // Clear position
    variant.position = null;

    console.log(
      `[Optimizer] ${variant.profileName}: Closed position @ ${exit.exitFillPrice.toFixed(2)} | ` +
      `Net P&L: ${exit.realizedNetPnl.toFixed(2)} USDT (${exit.realizedROI.toFixed(2)}%) | ${exitReason}`
    );
  }

  /**
   * Get optimizer status for all variants
   */
  getStatus() {
    const status = {
      initialized: this.initialized,
      paperTrading: this.config.paperTrading,
      accountBalance: this.accountBalance,
      variants: {}
    };

    for (const [name, variant] of this.variants) {
      status.variants[name] = variant.toJSON();
    }

    return status;
  }

  /**
   * Get performance comparison between variants
   */
  getPerformanceComparison() {
    const comparison = [];

    for (const [name, variant] of this.variants) {
      comparison.push({
        profile: name,
        tradesCount: variant.metrics.tradesCount,
        winRate: (variant.metrics.winRate * 100).toFixed(1) + '%',
        avgROI: variant.metrics.avgROI.toFixed(2) + '%',
        totalNetPnl: variant.metrics.totalNetPnl.toFixed(2),
        avgPnlPerTrade: variant.metrics.avgPnLPerTrade.toFixed(2)
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
    this.variants.clear();
    this.initialized = false;
    this.accountBalance = 10000;
  }
}

module.exports = LiveOptimizerController;
module.exports.OptimizerConfig = OptimizerConfig;
module.exports.TradingVariant = TradingVariant;
