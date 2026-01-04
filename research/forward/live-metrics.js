/**
 * Live Metrics
 * 
 * Collects and exposes latency and performance metrics for live trading.
 * Works with PingBudgetManager to provide comprehensive monitoring.
 */

const EventEmitter = require('events');

/**
 * Metrics Collector
 */
class LiveMetrics extends EventEmitter {
  constructor() {
    super();
    
    // Event loop monitoring
    this.eventLoopLag = {
      samples: [],
      maxSamples: 1000,
      p50: 0,
      p95: 0,
      p99: 0,
      max: 0
    };
    
    // Message jitter tracking
    this.messageJitter = {
      samples: [],
      maxSamples: 100,
      mean: 0,
      stddev: 0,
      max: 0
    };
    
    // Feed staleness
    this.feedStaleness = new Map();  // symbol -> lastUpdate
    
    // WebSocket stats
    this.wsStats = {
      reconnects: 0,
      messageCount: 0,
      errorCount: 0,
      lastConnect: null,
      lastDisconnect: null
    };
    
    // Rate limit tracking
    this.rateLimitStats = {
      count429: 0,
      lastOccurrence: null,
      currentUtilization: 0.70,
      tokensAvailable: 0
    };
    
    // Start monitoring
    this.monitorInterval = null;
    this.startMonitoring();
  }
  
  /**
   * Start event loop monitoring
   */
  startMonitoring() {
    if (this.monitorInterval) {
      return;
    }
    
    this.monitorInterval = setInterval(() => {
      const start = Date.now();
      setImmediate(() => {
        const lag = Date.now() - start;
        this.recordEventLoopLag(lag);
      });
    }, 1000);
  }
  
  /**
   * Stop monitoring
   */
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }
  
  /**
   * Record event loop lag
   */
  recordEventLoopLag(lag) {
    this.eventLoopLag.samples.push(lag);
    
    if (this.eventLoopLag.samples.length > this.eventLoopLag.maxSamples) {
      this.eventLoopLag.samples.shift();
    }
    
    // Update percentiles
    const sorted = [...this.eventLoopLag.samples].sort((a, b) => a - b);
    
    this.eventLoopLag.p50 = this.getPercentile(sorted, 50);
    this.eventLoopLag.p95 = this.getPercentile(sorted, 95);
    this.eventLoopLag.p99 = this.getPercentile(sorted, 99);
    this.eventLoopLag.max = Math.max(...sorted);
    
    if (lag > 100) {
      this.emit('highLag', { lag, threshold: 100 });
    }
  }
  
  /**
   * Record message jitter
   */
  recordMessageJitter(jitter) {
    this.messageJitter.samples.push(jitter);
    
    if (this.messageJitter.samples.length > this.messageJitter.maxSamples) {
      this.messageJitter.samples.shift();
    }
    
    // Calculate statistics
    const n = this.messageJitter.samples.length;
    if (n > 0) {
      const sum = this.messageJitter.samples.reduce((a, b) => a + b, 0);
      const mean = sum / n;
      
      const variance = this.messageJitter.samples
        .reduce((sum, x) => sum + Math.pow(x - mean, 2), 0) / n;
      
      this.messageJitter.mean = mean;
      this.messageJitter.stddev = Math.sqrt(variance);
      this.messageJitter.max = Math.max(...this.messageJitter.samples);
    }
  }
  
  /**
   * Update feed staleness for a symbol
   */
  updateFeedStaleness(symbol, timestamp = Date.now()) {
    this.feedStaleness.set(symbol, timestamp);
  }
  
  /**
   * Get feed staleness for a symbol
   */
  getFeedStaleness(symbol) {
    const lastUpdate = this.feedStaleness.get(symbol);
    if (!lastUpdate) {
      return null;
    }
    return Date.now() - lastUpdate;
  }
  
  /**
   * Get maximum staleness across all feeds
   */
  getMaxStaleness() {
    let max = 0;
    for (const [symbol, timestamp] of this.feedStaleness.entries()) {
      const staleness = Date.now() - timestamp;
      if (staleness > max) {
        max = staleness;
      }
    }
    return max;
  }
  
  /**
   * Record WebSocket reconnect
   */
  recordReconnect() {
    this.wsStats.reconnects++;
    this.emit('reconnect', { total: this.wsStats.reconnects });
  }
  
  /**
   * Record WebSocket message
   */
  recordMessage() {
    this.wsStats.messageCount++;
  }
  
  /**
   * Record WebSocket error
   */
  recordError(error) {
    this.wsStats.errorCount++;
    this.emit('error', { error, total: this.wsStats.errorCount });
  }
  
  /**
   * Record rate limit event
   */
  recordRateLimit() {
    this.rateLimitStats.count429++;
    this.rateLimitStats.lastOccurrence = Date.now();
    this.emit('rateLimit', { total: this.rateLimitStats.count429 });
  }
  
  /**
   * Update rate limit stats from PingBudgetManager
   */
  updateRateLimitStats(stats) {
    this.rateLimitStats.currentUtilization = stats.currentUtilization || 0.70;
    this.rateLimitStats.tokensAvailable = stats.tokensAvailable || 0;
    
    if (stats.rateLimitCount !== undefined) {
      this.rateLimitStats.count429 = stats.rateLimitCount;
    }
  }
  
  /**
   * Calculate percentile from sorted array
   */
  getPercentile(sorted, p) {
    if (sorted.length === 0) return 0;
    
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }
  
  /**
   * Export all metrics
   */
  exportMetrics() {
    return {
      eventLoopLag: {
        p50: this.eventLoopLag.p50,
        p95: this.eventLoopLag.p95,
        p99: this.eventLoopLag.p99,
        max: this.eventLoopLag.max,
        samples: this.eventLoopLag.samples.length
      },
      messageJitter: {
        mean: this.messageJitter.mean,
        stddev: this.messageJitter.stddev,
        max: this.messageJitter.max,
        samples: this.messageJitter.samples.length
      },
      feedStaleness: {
        maxMs: this.getMaxStaleness(),
        perSymbol: Object.fromEntries(
          Array.from(this.feedStaleness.entries()).map(([symbol, timestamp]) => 
            [symbol, Date.now() - timestamp]
          )
        )
      },
      websocket: {
        reconnects: this.wsStats.reconnects,
        messages: this.wsStats.messageCount,
        errors: this.wsStats.errorCount
      },
      rateLimit: {
        count429: this.rateLimitStats.count429,
        lastOccurrence: this.rateLimitStats.lastOccurrence,
        utilization: this.rateLimitStats.currentUtilization,
        tokensAvailable: this.rateLimitStats.tokensAvailable
      },
      timestamp: Date.now()
    };
  }
  
  /**
   * Print metrics summary to console
   */
  printSummary() {
    const metrics = this.exportMetrics();
    
    console.log('\n' + '='.repeat(70));
    console.log('LIVE METRICS SUMMARY');
    console.log('='.repeat(70));
    
    console.log('\nEvent Loop Lag:');
    console.log(`  P50: ${metrics.eventLoopLag.p50.toFixed(2)}ms`);
    console.log(`  P95: ${metrics.eventLoopLag.p95.toFixed(2)}ms`);
    console.log(`  P99: ${metrics.eventLoopLag.p99.toFixed(2)}ms`);
    console.log(`  Max: ${metrics.eventLoopLag.max.toFixed(2)}ms`);
    
    console.log('\nMessage Jitter:');
    console.log(`  Mean: ${metrics.messageJitter.mean.toFixed(2)}ms`);
    console.log(`  StdDev: ${metrics.messageJitter.stddev.toFixed(2)}ms`);
    console.log(`  Max: ${metrics.messageJitter.max.toFixed(2)}ms`);
    
    console.log('\nFeed Staleness:');
    console.log(`  Max: ${metrics.feedStaleness.maxMs.toFixed(0)}ms`);
    
    console.log('\nWebSocket:');
    console.log(`  Reconnects: ${metrics.websocket.reconnects}`);
    console.log(`  Messages: ${metrics.websocket.messages}`);
    console.log(`  Errors: ${metrics.websocket.errors}`);
    
    console.log('\nRate Limiting:');
    console.log(`  429 Errors: ${metrics.rateLimit.count429}`);
    console.log(`  Utilization: ${(metrics.rateLimit.utilization * 100).toFixed(1)}%`);
    console.log(`  Tokens Available: ${metrics.rateLimit.tokensAvailable}`);
    
    console.log('='.repeat(70) + '\n');
  }
  
  /**
   * Cleanup
   */
  destroy() {
    this.stopMonitoring();
    this.removeAllListeners();
  }
}

module.exports = {
  LiveMetrics
};
