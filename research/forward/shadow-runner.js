/**
 * Live Forward Shadow Runner
 *
 * Runs top N strategy configs against live data without placing real orders.
 * Collects DOM metrics and performance data for validation.
 *
 * SAFETY: Live trading disabled by default - requires explicit environment flag
 */

const EventEmitter = require('events');

// Symbol universe for testing
const SYMBOL_UNIVERSE = [
  'ETHUSDTM', 'SOLUSDTM', 'WIFUSDTM', 'FARTCOINUSDTM', 'LAUSDTM',
  'SHIBUSDTM', 'LTCUSDTM', 'BEATUSDTM', 'FOLKSUSDTM', 'XRPUSDTM',
  'RAVEUSDTM', 'POWERUSDTM', 'ADAUSDTM', 'BCHUSDTM', 'RIVERUSDTM',
  'TONUSDTM', 'AVAXUSDTM'
  // MYX to be added when available
];

/**
 * Configuration for shadow runner
 */
class ShadowRunnerConfig {
  constructor(options = {}) {
    this.configs = options.configs || [];           // Top N configs to test
    this.symbols = options.symbols || SYMBOL_UNIVERSE;
    this.enableDom = options.enableDom || false;    // Enable DOM gate testing
    this.fillModel = options.fillModel || 'taker';  // 'taker' | 'probabilistic_limit'
    this.slippageModel = options.slippageModel || 'none'; // 'none' | 'fixed' | 'spread_based' | 'vol_scaled'
    this.outputDir = options.outputDir || './research/output';
  }
}

/**
 * DOM Snapshot structure
 */
class DomSnapshot {
  constructor(data = {}) {
    this.timestamp = data.timestamp || Date.now();
    this.symbol = data.symbol || '';
    this.imbalance5 = data.imbalance5 || 0;    // Top 5 levels
    this.imbalance10 = data.imbalance10 || 0;   // Top 10 levels
    this.imbalance25 = data.imbalance25 || 0;   // Top 25 levels
    this.spread = data.spread || 0;
    this.spreadPercent = data.spreadPercent || 0;
    this.microprice = data.microprice || 0;
    this.bestBid = data.bestBid || 0;
    this.bestAsk = data.bestAsk || 0;
    this.bidWallPrice = data.bidWallPrice || null;
    this.askWallPrice = data.askWallPrice || null;
  }
}

/**
 * Latency Metrics structure
 */
class LatencyMetrics {
  constructor() {
    this.eventLoopLagP95 = 0;
    this.eventLoopLagP99 = 0;
    this.messageJitter = 0;
    this.feedStalenessMs = 0;
    this.wsReconnects = 0;
  }
}

/**
 * Hypothetical Trade record
 */
class HypotheticalTrade {
  constructor(data = {}) {
    this.timestamp = data.timestamp || Date.now();
    this.configName = data.configName || '';
    this.symbol = data.symbol || '';
    this.side = data.side || '';  // 'long' | 'short'
    this.entryPrice = data.entryPrice || 0;
    this.exitPrice = data.exitPrice || null;
    this.size = data.size || 0;
    this.pnl = data.pnl || null;
    this.reason = data.reason || '';
    this.domSnapshot = data.domSnapshot || null;
  }
}

/**
 * Leaderboard Entry
 */
class LeaderboardEntry {
  constructor(data = {}) {
    this.configName = data.configName || '';
    this.totalTrades = data.totalTrades || 0;
    this.winRate = data.winRate || 0;
    this.avgPnl = data.avgPnl || 0;
    this.sharpeRatio = data.sharpeRatio || 0;
    this.maxDrawdown = data.maxDrawdown || 0;
    this.profitFactor = data.profitFactor || 0;
  }
}

/**
 * Shadow Runner - Runs strategy configs against live data
 */
class ShadowRunner extends EventEmitter {
  constructor(config) {
    super();

    if (!(config instanceof ShadowRunnerConfig)) {
      config = new ShadowRunnerConfig(config);
    }

    this.config = config;
    this.connected = false;
    this.ws = null;

    // Trade storage per config
    this.trades = new Map();  // configName -> [trades]

    // DOM snapshots per symbol
    this.domSnapshots = new Map();  // symbol -> [snapshots]

    // Latency metrics
    this.latencyMetrics = new LatencyMetrics();

    // Safety: NEVER trade live by default
    this.LIVE_TRADING_ENABLED = process.env.ENABLE_LIVE_TRADING === 'true';

    if (this.LIVE_TRADING_ENABLED) {
      console.warn('⚠️  WARNING: Live trading is ENABLED. This is for paper trading only by default.');
    }

    // Initialize trade storage for each config
    for (const cfg of this.config.configs) {
      this.trades.set(cfg.name, []);
    }
  }

  /**
   * Connect to live WS + DOM feeds
   */
  async connect() {
    if (this.connected) {
      console.log('Already connected');
      return;
    }

    console.log(`Connecting to live feeds for symbols: ${this.config.symbols.join(', ')}`);

    // TODO: Implement actual WebSocket connection to KuCoin
    // This is a placeholder for the connection logic
    this.connected = true;
    this.emit('connected');

    console.log('✓ Connected to live feeds');

    if (this.config.enableDom) {
      console.log('✓ DOM data collection enabled');
    }
  }

  /**
   * Disconnect from feeds
   */
  async disconnect() {
    if (!this.connected) {
      return;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
    this.emit('disconnected');

    console.log('✓ Disconnected from live feeds');
  }

  /**
   * Run all configs simultaneously against live data
   */
  async runShadow(durationMs) {
    if (!this.connected) {
      throw new Error('Not connected. Call connect() first.');
    }

    console.log(`\nStarting shadow run for ${durationMs / 1000}s...`);
    console.log(`Testing ${this.config.configs.length} configs across ${this.config.symbols.length} symbols`);

    const startTime = Date.now();
    const endTime = startTime + durationMs;

    // Simulate live data processing
    while (Date.now() < endTime) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, (endTime - Date.now()) / 1000);

      if (Math.floor(elapsed / 1000) % 10 === 0) {
        process.stdout.write(`\r⏱  ${remaining.toFixed(0)}s remaining...`);
      }
    }

    process.stdout.write('\r✓ Shadow run complete\n');

    this.emit('runComplete', {
      durationMs,
      totalTrades: this.getTotalTradeCount(),
      configs: this.config.configs.length
    });
  }

  /**
   * Record a hypothetical trade (without placing real order)
   */
  recordHypotheticalTrade(configName, trade) {
    if (!(trade instanceof HypotheticalTrade)) {
      trade = new HypotheticalTrade(trade);
    }

    if (!this.trades.has(configName)) {
      this.trades.set(configName, []);
    }

    this.trades.get(configName).push(trade);

    this.emit('tradeRecorded', {
      configName,
      trade
    });
  }

  /**
   * Collect DOM metrics
   */
  recordDomSnapshot(symbol, snapshot) {
    if (!(snapshot instanceof DomSnapshot)) {
      snapshot = new DomSnapshot(snapshot);
    }

    if (!this.domSnapshots.has(symbol)) {
      this.domSnapshots.set(symbol, []);
    }

    const snapshots = this.domSnapshots.get(symbol);
    snapshots.push(snapshot);

    // Keep only last 1000 snapshots per symbol
    if (snapshots.length > 1000) {
      snapshots.shift();
    }

    this.emit('domSnapshot', {
      symbol,
      snapshot
    });
  }

  /**
   * Get total trade count across all configs
   */
  getTotalTradeCount() {
    let total = 0;
    for (const trades of this.trades.values()) {
      total += trades.length;
    }
    return total;
  }

  /**
   * Calculate statistics for a config
   */
  calculateConfigStats(configName) {
    const trades = this.trades.get(configName) || [];

    if (trades.length === 0) {
      return new LeaderboardEntry({ configName });
    }

    const completedTrades = trades.filter(t => t.exitPrice !== null && t.pnl !== null);

    if (completedTrades.length === 0) {
      return new LeaderboardEntry({
        configName,
        totalTrades: trades.length
      });
    }

    const wins = completedTrades.filter(t => t.pnl > 0);
    const losses = completedTrades.filter(t => t.pnl < 0);

    const totalPnl = completedTrades.reduce((sum, t) => sum + t.pnl, 0);
    const avgPnl = totalPnl / completedTrades.length;
    const winRate = wins.length / completedTrades.length;

    const grossWins = wins.reduce((sum, t) => sum + t.pnl, 0);
    const grossLosses = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
    const profitFactor = grossLosses > 0 ? grossWins / grossLosses : 0;

    // Simple Sharpe approximation
    const returns = completedTrades.map(t => t.pnl);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stddev = Math.sqrt(variance);
    const sharpeRatio = stddev > 0 ? mean / stddev : 0;

    // Simple max drawdown
    let peak = 0;
    let maxDrawdown = 0;
    let cumPnl = 0;

    for (const trade of completedTrades) {
      cumPnl += trade.pnl;
      if (cumPnl > peak) {
        peak = cumPnl;
      }
      const drawdown = peak - cumPnl;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return new LeaderboardEntry({
      configName,
      totalTrades: completedTrades.length,
      winRate,
      avgPnl,
      sharpeRatio,
      maxDrawdown,
      profitFactor
    });
  }

  /**
   * Export live leaderboard
   */
  exportLeaderboard() {
    const leaderboard = [];

    for (const configName of this.trades.keys()) {
      const stats = this.calculateConfigStats(configName);
      leaderboard.push(stats);
    }

    // Sort by Sharpe ratio (descending)
    leaderboard.sort((a, b) => b.sharpeRatio - a.sharpeRatio);

    return leaderboard;
  }

  /**
   * Get DOM statistics for a symbol
   */
  getDomStats(symbol) {
    const snapshots = this.domSnapshots.get(symbol) || [];

    if (snapshots.length === 0) {
      return null;
    }

    const avgImbalance5 = snapshots.reduce((sum, s) => sum + s.imbalance5, 0) / snapshots.length;
    const avgImbalance10 = snapshots.reduce((sum, s) => sum + s.imbalance10, 0) / snapshots.length;
    const avgImbalance25 = snapshots.reduce((sum, s) => sum + s.imbalance25, 0) / snapshots.length;
    const avgSpread = snapshots.reduce((sum, s) => sum + s.spreadPercent, 0) / snapshots.length;

    return {
      symbol,
      snapshotCount: snapshots.length,
      avgImbalance5,
      avgImbalance10,
      avgImbalance25,
      avgSpreadPercent: avgSpread
    };
  }

  /**
   * Print leaderboard to console
   */
  printLeaderboard() {
    const leaderboard = this.exportLeaderboard();

    console.log('\n' + '='.repeat(80));
    console.log('LIVE SHADOW RUNNER LEADERBOARD');
    console.log('='.repeat(80));
    console.log('Rank | Config Name          | Trades | Win% | Avg PnL | Sharpe | PF   | MaxDD');
    console.log('-'.repeat(80));

    leaderboard.forEach((entry, idx) => {
      const rank = (idx + 1).toString().padStart(4);
      const name = entry.configName.padEnd(20).substring(0, 20);
      const trades = entry.totalTrades.toString().padStart(6);
      const winRate = (entry.winRate * 100).toFixed(1).padStart(5);
      const avgPnl = entry.avgPnl.toFixed(2).padStart(7);
      const sharpe = entry.sharpeRatio.toFixed(2).padStart(6);
      const pf = entry.profitFactor.toFixed(2).padStart(4);
      const dd = entry.maxDrawdown.toFixed(2).padStart(7);

      console.log(`${rank} | ${name} | ${trades} | ${winRate}% | ${avgPnl} | ${sharpe} | ${pf} | ${dd}`);
    });

    console.log('='.repeat(80) + '\n');
  }

  /**
   * Update latency metrics (from PingBudgetManager)
   */
  updateLatencyMetrics(metrics) {
    this.latencyMetrics.eventLoopLagP95 = metrics.eventLoopLagP95 || 0;
    this.latencyMetrics.eventLoopLagP99 = metrics.eventLoopLagP99 || 0;
    this.latencyMetrics.messageJitter = metrics.messageJitter?.mean || 0;
    this.latencyMetrics.feedStalenessMs = metrics.effectiveStaleness || 0;
    this.latencyMetrics.wsReconnects = metrics.reconnectCount || 0;
  }

  /**
   * Get current latency metrics
   */
  getLatencyMetrics() {
    return { ...this.latencyMetrics };
  }
}

module.exports = {
  ShadowRunner,
  ShadowRunnerConfig,
  DomSnapshot,
  LatencyMetrics,
  HypotheticalTrade,
  LeaderboardEntry,
  SYMBOL_UNIVERSE
};
