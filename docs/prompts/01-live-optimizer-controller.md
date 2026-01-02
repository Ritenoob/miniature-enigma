# Prompt: Live Optimizer Controller

## Objective
Generate `src/optimizer/LiveOptimizerController.js` - orchestrates parallel strategy experiments alongside main trading without downtime.

## System Context
- **Base**: MIRKO V3.6.1+ KuCoin Futures Bot
- **Language**: Node.js ES6+, async/await
- **Data Source**: Reuse WebSocket feed from server.js  
- **Signal Logic**: Uses signal-weights.js configurations
- **Dependencies**: EventEmitter, MarketDataManager, TechnicalIndicators

## Requirements

### 1. Parallel Strategy Instances
```javascript
class LiveOptimizerController extends EventEmitter {
  constructor(config) {
    super();
    this.maxVariants = config.maxVariants || 5;
    this.paperTrading = config.paperTrading !== false;
    this.variants = [];
    this.results = new Map();
  }
  
  async start() {
    // Generate N strategy variants
    // Subscribe to market data feed
    // Initialize isolated state per variant
  }
  
  generateVariants() {
    // Use OptimizerConfig to create variants
    // Vary: indicator weights, thresholds, timeframes, risk params
    // Return array of {id, config, state}
  }
}
```

### 2. Market Data Integration
- Subscribe to existing WebSocket feed via EventBus
- Call `onMarketData(update)` on each tick
- Feed to all variants without blocking main thread
- Buffer ticks if variant falls behind (bounded queue)

### 3. Isolated State Per Variant
```javascript
class StrategyVariant {
  constructor(config) {
    this.id = generateId();
    this.config = config;
    this.position = null;  // Simulated or real
    this.trades = [];
    this.metrics = {roi: 0, winRate: 0, sharpe: 0};
  }
  
  async processTick(marketData) {
    // Calculate indicators with this variant's config
    // Generate signal
    // Execute trade (paper or real with small size)
    // Update metrics
  }
}
```

### 4. Performance Tracking
Track for each variant:
- **ROI**: (netProfit / initialCapital) * 100
- **Win Rate**: (wins / totalTrades) * 100
- **Sharpe Ratio**: mean(returns) / stddev(returns) * sqrt(N)
- **Max Drawdown**: peak-to-trough equity decline
- **Avg P&L per trade**
- **Trade count**

### 5. Safety Mechanisms
```javascript
class SafetyLimits {
  maxLossPerVariant = 0.05;  // 5% loss stops variant
  maxDrawdown = 0.10;         // 10% drawdown stops variant
  minSampleSize = 50;         // Min trades before promotion
  realTradeSizePercent = 0.01; // 1% of normal if real mode
}
```

### 6. API Integration
```javascript
async stop() {
  // Gracefully stop all variants
  // Close any open positions
  // Export results
}

getResults() {
  return Array.from(this.variants).map(v => ({
    id: v.id,
    config: v.config,
    metrics: v.metrics,
    trades: v.trades.length,
    status: v.status
  }));
}
```

### 7. Event Emission
```javascript
this.emit('variantStarted', {id, config});
this.emit('variantStopped', {id, reason});
this.emit('tradeExecuted', {id, trade});
this.emit('metricsUpdate', {id, metrics});
this.emit('promotionCandidate', {id, confidence});
```

## Code Structure

```javascript
const EventEmitter = require('events');
const crypto = require('crypto');

class LiveOptimizerController extends EventEmitter {
  constructor(config) {
    super();
    this.config = {
      maxVariants: config.maxVariants || 5,
      paperTrading: config.paperTrading !== false,
      initialCapital: config.initialCapital || 10000,
      ...config
    };
    
    this.variants = new Map();
    this.marketDataBuffer = [];
    this.isRunning = false;
  }

  async start() {
    if (this.isRunning) {
      throw new Error('Optimizer already running');
    }
    
    this.isRunning = true;
    
    // Generate strategy variants
    const variantConfigs = this.generateVariants();
    
    // Initialize each variant
    for (const varConfig of variantConfigs) {
      const variant = new StrategyVariant(varConfig, this.config);
      this.variants.set(variant.id, variant);
      this.emit('variantStarted', {id: variant.id, config: varConfig});
    }
    
    // Subscribe to market data
    this.subscribeToMarketData();
  }

  generateVariants() {
    // Create N variants with different configurations
    const variants = [];
    
    for (let i = 0; i < this.config.maxVariants; i++) {
      variants.push({
        id: crypto.randomBytes(8).toString('hex'),
        weights: this.randomizeWeights(),
        thresholds: this.randomizeThresholds(),
        riskParams: this.randomizeRiskParams()
      });
    }
    
    return variants;
  }

  randomizeWeights() {
    // Generate random indicator weights
    return {
      macd: Math.random() * 0.3,
      rsi: Math.random() * 0.3,
      volumeSpike: Math.random() * 0.2,
      trend: Math.random() * 0.2
    };
  }

  randomizeThresholds() {
    // Generate random signal thresholds
    return {
      strongBuy: 0.6 + Math.random() * 0.2,
      strongSell: -0.6 - Math.random() * 0.2
    };
  }

  randomizeRiskParams() {
    // Generate random risk parameters
    return {
      stopLossROI: -0.05 - Math.random() * 0.05,
      takeProfitROI: 0.05 + Math.random() * 0.10
    };
  }

  subscribeToMarketData() {
    // Subscribe to WebSocket feed via EventBus
    // (Implementation depends on existing architecture)
  }

  async onMarketData(data) {
    if (!this.isRunning) return;
    
    // Feed data to all active variants
    const processingPromises = [];
    
    for (const variant of this.variants.values()) {
      if (variant.isActive) {
        processingPromises.push(
          variant.processTick(data).catch(err => {
            console.error(`Variant ${variant.id} error:`, err);
            variant.stop('error');
          })
        );
      }
    }
    
    await Promise.all(processingPromises);
  }

  async stop() {
    this.isRunning = false;
    
    // Stop all variants
    for (const variant of this.variants.values()) {
      await variant.stop('manual');
    }
    
    this.emit('optimizerStopped');
  }

  getResults() {
    return Array.from(this.variants.values()).map(v => ({
      id: v.id,
      config: v.config,
      metrics: v.getMetrics(),
      trades: v.getTrades(),
      status: v.status
    }));
  }

  getTopPerformers(n = 3) {
    const results = this.getResults();
    return results
      .sort((a, b) => b.metrics.sharpe - a.metrics.sharpe)
      .slice(0, n);
  }
}

class StrategyVariant {
  constructor(config, globalConfig) {
    this.id = config.id;
    this.config = config;
    this.globalConfig = globalConfig;
    
    this.isActive = true;
    this.position = null;
    this.trades = [];
    this.equity = globalConfig.initialCapital;
    this.peakEquity = globalConfig.initialCapital;
    
    this.metrics = {
      roi: 0,
      winRate: 0,
      sharpe: 0,
      maxDrawdown: 0,
      avgPnL: 0,
      totalTrades: 0
    };
  }

  async processTick(marketData) {
    // Calculate indicators based on this variant's weights
    const signal = this.calculateSignal(marketData);
    
    // Check exit conditions if in position
    if (this.position) {
      const exitSignal = this.checkExitConditions(marketData, signal);
      if (exitSignal) {
        await this.closePosition(marketData, exitSignal.reason);
      }
    }
    
    // Check entry conditions if no position
    if (!this.position && Math.abs(signal) >= this.config.thresholds.strongBuy) {
      await this.openPosition(marketData, signal);
    }
    
    // Update metrics
    this.updateMetrics();
    
    // Check safety limits
    this.checkSafetyLimits();
  }

  calculateSignal(marketData) {
    // Apply this variant's weights to calculate signal
    // (Implementation depends on existing signal calculation)
    return 0; // Placeholder
  }

  checkExitConditions(marketData, signal) {
    if (!this.position) return null;
    
    const currentPrice = marketData.price;
    const roi = this.calculateROI(currentPrice);
    
    // Stop loss
    if (roi <= this.config.riskParams.stopLossROI) {
      return {exit: true, reason: 'stop_loss'};
    }
    
    // Take profit
    if (roi >= this.config.riskParams.takeProfitROI) {
      return {exit: true, reason: 'take_profit'};
    }
    
    // Signal reversal
    const isLong = this.position.side === 'long';
    if ((isLong && signal < -this.config.thresholds.strongSell) ||
        (!isLong && signal > this.config.thresholds.strongBuy)) {
      return {exit: true, reason: 'signal_reversal'};
    }
    
    return null;
  }

  calculateROI(currentPrice) {
    if (!this.position) return 0;
    
    const entryPrice = this.position.entryPrice;
    const leverage = this.position.leverage;
    const isLong = this.position.side === 'long';
    
    const priceChange = isLong 
      ? (currentPrice - entryPrice) / entryPrice
      : (entryPrice - currentPrice) / entryPrice;
    
    return priceChange * leverage;
  }

  async openPosition(marketData, signal) {
    const side = signal > 0 ? 'long' : 'short';
    const size = this.calculatePositionSize();
    
    this.position = {
      side,
      entryPrice: marketData.price,
      size,
      leverage: 10, // Default leverage
      entryTime: Date.now()
    };
    
    // In paper trading mode, this is simulated
    // In real mode, execute actual order
  }

  async closePosition(marketData, reason) {
    if (!this.position) return;
    
    const roi = this.calculateROI(marketData.price);
    const pnl = this.equity * roi;
    
    this.equity += pnl;
    this.peakEquity = Math.max(this.peakEquity, this.equity);
    
    this.trades.push({
      entryPrice: this.position.entryPrice,
      exitPrice: marketData.price,
      side: this.position.side,
      roi,
      pnl,
      reason,
      duration: Date.now() - this.position.entryTime
    });
    
    this.position = null;
  }

  calculatePositionSize() {
    // Calculate appropriate position size
    // In paper mode: full virtual capital
    // In real mode: 1% of actual capital
    const baseSize = this.globalConfig.paperTrading 
      ? this.equity
      : this.equity * 0.01;
    
    return baseSize;
  }

  updateMetrics() {
    const totalTrades = this.trades.length;
    if (totalTrades === 0) return;
    
    const wins = this.trades.filter(t => t.pnl > 0).length;
    const totalPnL = this.trades.reduce((sum, t) => sum + t.pnl, 0);
    const returns = this.trades.map(t => t.roi);
    
    this.metrics = {
      roi: ((this.equity - this.globalConfig.initialCapital) / this.globalConfig.initialCapital) * 100,
      winRate: (wins / totalTrades) * 100,
      sharpe: this.calculateSharpe(returns),
      maxDrawdown: ((this.peakEquity - this.equity) / this.peakEquity) * 100,
      avgPnL: totalPnL / totalTrades,
      totalTrades
    };
  }

  calculateSharpe(returns) {
    if (returns.length < 2) return 0;
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    if (stdDev === 0) return 0;
    
    return (mean / stdDev) * Math.sqrt(252); // Annualized
  }

  checkSafetyLimits() {
    const maxLoss = this.globalConfig.initialCapital * 0.05;
    const currentLoss = this.globalConfig.initialCapital - this.equity;
    
    if (currentLoss > maxLoss) {
      this.stop('safety_loss_limit');
    }
    
    if (this.metrics.maxDrawdown > 10) {
      this.stop('safety_drawdown_limit');
    }
  }

  async stop(reason) {
    this.isActive = false;
    
    // Close any open position
    if (this.position) {
      // Close with market order
    }
    
    this.status = reason;
  }

  getMetrics() {
    return this.metrics;
  }

  getTrades() {
    return this.trades;
  }
}

module.exports = LiveOptimizerController;
```

## Testing Requirements
- Unit tests for variant generation
- Integration test with mock market feed
- Safety limit enforcement tests
- Concurrency tests (multiple variants simultaneously)
- Paper trading validation tests
- Metrics calculation accuracy tests

## Integration Points
- Import in server.js: `const LiveOptimizerController = require('./src/optimizer/LiveOptimizerController');`
- Initialize after market data ready
- Hook to WebSocket feed events
- Expose via `/api/optimizer/*` endpoints

## Safety Notes
- Default to paper trading
- Real orders MUST have stop-loss immediately
- Use reduceOnly flag on all exits
- Monitor memory usage (limit active variants)
- Implement circuit breakers for API errors
- Log all variant activities for audit
