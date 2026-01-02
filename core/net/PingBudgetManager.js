/**
 * PingBudgetManager - Adaptive Rate Limiting with Priority Classes
 * -----------------------------------------------------------------
 * Implements token bucket algorithm with:
 * - Priority-based rate limiting (critical, high, medium, low)
 * - Adaptive headroom management (default 30%)
 * - 429 (rate limit) backoff and recovery
 * - Latency and quality metrics export
 * 
 * Purpose:
 * - Prevent API rate limit violations
 * - Prioritize critical operations (order placement/cancellation)
 * - Monitor system health (event loop lag, jitter, staleness)
 * - Provide feedback for quality-gated trading decisions
 */

const EventEmitter = require('events');

class PingBudgetManager extends EventEmitter {
  constructor(config = {}) {
    super();
    
    // Token bucket configuration
    this.config = {
      // Priority class budgets (tokens/second)
      critical: config.critical || 10,    // Order operations
      high: config.high || 20,            // Market data updates
      medium: config.medium || 30,        // Indicator calculations
      low: config.low || 50,              // Non-critical queries
      
      // Headroom (percentage of budget to reserve)
      headroom: config.headroom || 0.3,   // 30% default
      
      // 429 backoff configuration
      backoffInitial: config.backoffInitial || 1000,    // 1 second
      backoffMax: config.backoffMax || 60000,            // 60 seconds
      backoffMultiplier: config.backoffMultiplier || 2,
      
      // Metrics configuration
      metricsWindow: config.metricsWindow || 60000,      // 1 minute
      lagThreshold: config.lagThreshold || 50,           // 50ms event loop lag warning
      jitterThreshold: config.jitterThreshold || 100,    // 100ms jitter warning
      
      // Token refill rate (milliseconds)
      refillInterval: config.refillInterval || 100       // 100ms
    };
    
    // Token buckets per priority
    this.buckets = {
      critical: { tokens: 0, max: 0 },
      high: { tokens: 0, max: 0 },
      medium: { tokens: 0, max: 0 },
      low: { tokens: 0, max: 0 }
    };
    
    // Initialize token buckets
    this._initializeBuckets();
    
    // 429 backoff state
    this.backoffState = {
      active: false,
      currentBackoff: 0,
      backoffUntil: 0,
      count429: 0
    };
    
    // Metrics tracking
    this.metrics = {
      requests: {
        total: 0,
        byPriority: { critical: 0, high: 0, medium: 0, low: 0 },
        rejected: 0,
        queued: 0
      },
      latency: {
        samples: [],
        p50: 0,
        p95: 0,
        p99: 0,
        eventLoopLag: []
      },
      jitter: {
        samples: [],
        mean: 0,
        stdDev: 0
      },
      rateLimit: {
        hits429: 0,
        lastHit: null,
        recoveries: 0,
        currentBackoff: 0
      },
      reconnects: 0,
      staleness: 0
    };
    
    // Request queue (for when backoff is active)
    this.requestQueue = [];
    
    // Refill timer
    this.refillTimer = null;
    
    // Metrics collection timer
    this.metricsTimer = null;
    
    // Last event loop check
    this.lastEventLoopCheck = Date.now();
    
    // Start timers
    this._startRefillTimer();
    this._startMetricsCollection();
  }

  /**
   * Initialize token buckets based on rate limits and headroom
   * @private
   */
  _initializeBuckets() {
    for (const [priority, rate] of Object.entries(this.config)) {
      if (['critical', 'high', 'medium', 'low'].includes(priority)) {
        const effectiveRate = rate * (1 - this.config.headroom);
        this.buckets[priority] = {
          tokens: effectiveRate,
          max: effectiveRate
        };
      }
    }
  }

  /**
   * Request permission to make an API call
   * @param {string} priority - Priority class: 'critical', 'high', 'medium', 'low'
   * @param {number} cost - Token cost (default: 1)
   * @returns {Promise<boolean>} True if request is allowed
   */
  async request(priority = 'medium', cost = 1) {
    // Check if in backoff period
    if (this.backoffState.active) {
      const now = Date.now();
      if (now < this.backoffState.backoffUntil) {
        // Still in backoff
        if (priority === 'critical') {
          // Queue critical requests
          return this._queueRequest(priority, cost);
        }
        this.metrics.requests.rejected++;
        return false;
      } else {
        // Backoff expired
        this._exitBackoff();
      }
    }
    
    // Check if enough tokens available
    const bucket = this.buckets[priority];
    if (!bucket) {
      throw new Error(`Invalid priority: ${priority}. Must be critical, high, medium, or low`);
    }
    
    if (bucket.tokens >= cost) {
      // Deduct tokens and allow request
      bucket.tokens -= cost;
      this.metrics.requests.total++;
      this.metrics.requests.byPriority[priority]++;
      return true;
    }
    
    // Not enough tokens
    if (priority === 'critical') {
      // Try to borrow from lower priority buckets
      if (this._borrowTokens(priority, cost)) {
        this.metrics.requests.total++;
        this.metrics.requests.byPriority[priority]++;
        return true;
      }
      
      // Queue critical request
      return this._queueRequest(priority, cost);
    }
    
    this.metrics.requests.rejected++;
    return false;
  }

  /**
   * Report a 429 rate limit hit
   * Initiates exponential backoff
   */
  report429() {
    this.metrics.rateLimit.hits429++;
    this.metrics.rateLimit.lastHit = Date.now();
    
    // Calculate backoff duration
    if (!this.backoffState.active) {
      this.backoffState.currentBackoff = this.config.backoffInitial;
    } else {
      this.backoffState.currentBackoff = Math.min(
        this.backoffState.currentBackoff * this.config.backoffMultiplier,
        this.config.backoffMax
      );
    }
    
    this.backoffState.active = true;
    this.backoffState.count429++;
    this.backoffState.backoffUntil = Date.now() + this.backoffState.currentBackoff;
    this.metrics.rateLimit.currentBackoff = this.backoffState.currentBackoff;
    
    this.emit('backoff', {
      duration: this.backoffState.currentBackoff,
      count: this.backoffState.count429,
      until: this.backoffState.backoffUntil
    });
  }

  /**
   * Report successful recovery from rate limit
   */
  reportRecovery() {
    if (this.backoffState.active) {
      this._exitBackoff();
      this.metrics.rateLimit.recoveries++;
      this.emit('recovery', {
        afterBackoff: this.backoffState.currentBackoff,
        totalHits: this.metrics.rateLimit.hits429
      });
    }
  }

  /**
   * Report a reconnect event
   */
  reportReconnect() {
    this.metrics.reconnects++;
    this.emit('reconnect', { total: this.metrics.reconnects });
  }

  /**
   * Record a latency sample (milliseconds)
   * @param {number} latency - Latency in milliseconds
   */
  recordLatency(latency) {
    this.metrics.latency.samples.push({ 
      latency, 
      timestamp: Date.now() 
    });
    
    // Keep only recent samples (last metrics window)
    const cutoff = Date.now() - this.config.metricsWindow;
    this.metrics.latency.samples = this.metrics.latency.samples.filter(
      s => s.timestamp > cutoff
    );
  }

  /**
   * Record event loop lag
   * @param {number} lag - Event loop lag in milliseconds
   */
  recordEventLoopLag(lag) {
    this.metrics.latency.eventLoopLag.push({ lag, timestamp: Date.now() });
    
    // Keep only recent samples
    const cutoff = Date.now() - this.config.metricsWindow;
    this.metrics.latency.eventLoopLag = this.metrics.latency.eventLoopLag.filter(
      s => s.timestamp > cutoff
    );
    
    if (lag > this.config.lagThreshold) {
      this.emit('highLag', { lag, threshold: this.config.lagThreshold });
    }
  }

  /**
   * Get current metrics
   * @returns {Object} Current metrics snapshot
   */
  getMetrics() {
    this._calculatePercentiles();
    this._calculateJitter();
    
    return {
      requests: { ...this.metrics.requests },
      latency: {
        p50: this.metrics.latency.p50,
        p95: this.metrics.latency.p95,
        p99: this.metrics.latency.p99,
        eventLoopLag: {
          current: this._getRecentEventLoopLag(),
          p95: this._getEventLoopLagPercentile(0.95),
          p99: this._getEventLoopLagPercentile(0.99)
        }
      },
      jitter: {
        mean: this.metrics.jitter.mean,
        stdDev: this.metrics.jitter.stdDev
      },
      rateLimit: { ...this.metrics.rateLimit },
      reconnects: this.metrics.reconnects,
      staleness: this._calculateStaleness(),
      buckets: this._getBucketStatus()
    };
  }

  /**
   * Get token bucket status
   * @private
   */
  _getBucketStatus() {
    const status = {};
    for (const [priority, bucket] of Object.entries(this.buckets)) {
      status[priority] = {
        available: Math.floor(bucket.tokens),
        max: Math.floor(bucket.max),
        utilization: ((bucket.max - bucket.tokens) / bucket.max * 100).toFixed(1) + '%'
      };
    }
    return status;
  }

  /**
   * Try to borrow tokens from lower priority buckets
   * @private
   */
  _borrowTokens(priority, cost) {
    const priorities = ['critical', 'high', 'medium', 'low'];
    const currentIndex = priorities.indexOf(priority);
    
    // Try to borrow from lower priority buckets
    for (let i = currentIndex + 1; i < priorities.length; i++) {
      const lowerBucket = this.buckets[priorities[i]];
      if (lowerBucket.tokens >= cost) {
        lowerBucket.tokens -= cost;
        return true;
      }
    }
    
    return false;
  }

  /**
   * Queue a request for later processing
   * @private
   */
  _queueRequest(priority, cost) {
    return new Promise((resolve) => {
      this.requestQueue.push({ priority, cost, resolve });
      this.metrics.requests.queued++;
    });
  }

  /**
   * Process queued requests
   * @private
   */
  _processQueue() {
    while (this.requestQueue.length > 0) {
      const request = this.requestQueue[0];
      const bucket = this.buckets[request.priority];
      
      if (bucket.tokens >= request.cost) {
        bucket.tokens -= request.cost;
        this.requestQueue.shift();
        request.resolve(true);
        this.metrics.requests.total++;
        this.metrics.requests.byPriority[request.priority]++;
      } else {
        break;  // Not enough tokens yet
      }
    }
  }

  /**
   * Exit backoff state
   * @private
   */
  _exitBackoff() {
    this.backoffState.active = false;
    this.backoffState.currentBackoff = 0;
    this.metrics.rateLimit.currentBackoff = 0;
  }

  /**
   * Start token refill timer
   * @private
   */
  _startRefillTimer() {
    this.refillTimer = setInterval(() => {
      // Refill tokens based on rate per second
      const refillAmount = this.config.refillInterval / 1000;
      
      for (const [priority, rate] of Object.entries(this.config)) {
        if (['critical', 'high', 'medium', 'low'].includes(priority)) {
          const bucket = this.buckets[priority];
          const effectiveRate = rate * (1 - this.config.headroom);
          bucket.tokens = Math.min(bucket.tokens + effectiveRate * refillAmount, bucket.max);
        }
      }
      
      // Process any queued requests
      if (this.requestQueue.length > 0 && !this.backoffState.active) {
        this._processQueue();
      }
      
      // Check event loop lag
      const now = Date.now();
      const expected = this.config.refillInterval;
      const actual = now - this.lastEventLoopCheck;
      const lag = actual - expected;
      
      if (lag > 0) {
        this.recordEventLoopLag(lag);
      }
      
      this.lastEventLoopCheck = now;
    }, this.config.refillInterval);
  }

  /**
   * Start metrics collection timer
   * @private
   */
  _startMetricsCollection() {
    this.metricsTimer = setInterval(() => {
      this._calculatePercentiles();
      this._calculateJitter();
      
      const metrics = this.getMetrics();
      this.emit('metrics', metrics);
    }, this.config.metricsWindow);
  }

  /**
   * Calculate latency percentiles
   * @private
   */
  _calculatePercentiles() {
    const samples = this.metrics.latency.samples.map(s => s.latency || s).sort((a, b) => a - b);
    
    if (samples.length === 0) {
      this.metrics.latency.p50 = 0;
      this.metrics.latency.p95 = 0;
      this.metrics.latency.p99 = 0;
      return;
    }
    
    this.metrics.latency.p50 = samples[Math.floor(samples.length * 0.5)];
    this.metrics.latency.p95 = samples[Math.floor(samples.length * 0.95)];
    this.metrics.latency.p99 = samples[Math.floor(samples.length * 0.99)];
  }

  /**
   * Calculate jitter statistics
   * @private
   */
  _calculateJitter() {
    const samples = this.metrics.latency.samples.map(s => s.latency || s);
    
    if (samples.length < 2) {
      this.metrics.jitter.mean = 0;
      this.metrics.jitter.stdDev = 0;
      return;
    }
    
    // Calculate mean
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    
    // Calculate standard deviation (jitter)
    const squaredDiffs = samples.map(x => Math.pow(x - mean, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / samples.length;
    const stdDev = Math.sqrt(variance);
    
    this.metrics.jitter.mean = mean;
    this.metrics.jitter.stdDev = stdDev;
    
    if (stdDev > this.config.jitterThreshold) {
      this.emit('highJitter', { mean, stdDev, threshold: this.config.jitterThreshold });
    }
  }

  /**
   * Get recent event loop lag
   * @private
   */
  _getRecentEventLoopLag() {
    if (this.metrics.latency.eventLoopLag.length === 0) return 0;
    return this.metrics.latency.eventLoopLag[this.metrics.latency.eventLoopLag.length - 1].lag;
  }

  /**
   * Get event loop lag percentile
   * @private
   */
  _getEventLoopLagPercentile(percentile) {
    const lags = this.metrics.latency.eventLoopLag.map(s => s.lag).sort((a, b) => a - b);
    if (lags.length === 0) return 0;
    return lags[Math.floor(lags.length * percentile)];
  }

  /**
   * Calculate data staleness
   * @private
   */
  _calculateStaleness() {
    if (this.metrics.latency.samples.length === 0) return 0;
    
    const now = Date.now();
    const lastSample = this.metrics.latency.samples[this.metrics.latency.samples.length - 1];
    const lastTimestamp = lastSample.timestamp || now;
    
    return now - lastTimestamp;
  }

  /**
   * Stop all timers and clean up
   */
  stop() {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }
    
    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }
    
    this.removeAllListeners();
  }
}

module.exports = PingBudgetManager;
