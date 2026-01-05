/**
 * PingBudgetManager - Rate limit compliance for KuCoin API
 *
 * Implements:
 * - WebSocket heartbeat management
 * - Adaptive token bucket for REST API rate limiting
 * - Priority-based request queuing
 * - Automatic degradation on 429 responses
 * - Latency and performance metrics
 */

const EventEmitter = require('events');

// WebSocket Configuration (KuCoin standard)
const WS_CONFIG = {
  pingInterval: 18000,  // 18 seconds (from KuCoin)
  pingTimeout: 10000,   // 10 seconds
  maxReconnectAttempts: 5,
  reconnectBackoff: [1000, 2000, 4000, 8000, 16000]
};

/**
 * Adaptive Token Bucket for REST API rate limiting
 */
class AdaptiveTokenBucket {
  // Rate limit configuration constants
  static DEFAULT_UTILIZATION = 0.70;
  static MIN_UTILIZATION = 0.40;
  static DEGRADE_STEP = 0.15;
  static MAX_DEGRADE_FACTOR = 0.5;
  static RECOVERY_INTERVAL_MS = 60000;
  static RECOVERY_STEP = 0.05;

  constructor(config = {}) {
    this.quotaPerWindow = config.quotaPerWindow || 2000;  // VIP0 default
    this.windowMs = config.windowMs || 30000;  // 30 seconds
    this.utilizationTarget = config.utilizationTarget || AdaptiveTokenBucket.DEFAULT_UTILIZATION;
    this.headroom = config.headroom || 0.30;  // 30% reserved

    this.tokens = this.quotaPerWindow * this.utilizationTarget;
    this.lastRefill = Date.now();
    this.consecutive429s = 0;
    this.lastRecoveryCheck = Date.now();
  }

  // Priority classes
  static PRIORITY = {
    CRITICAL: 0,  // cancel/replace risk actions
    HIGH: 1,      // order placement, margin checks
    MEDIUM: 2,    // positions/orders sync
    LOW: 3        // health pings
  };

  /**
   * Refill tokens based on time elapsed
   */
  refill() {
    const now = Date.now();
    const elapsed = now - this.lastRefill;

    if (elapsed >= this.windowMs) {
      // Full window passed, refill completely
      this.tokens = this.quotaPerWindow * this.utilizationTarget;
      this.lastRefill = now;
    } else {
      // Partial refill based on elapsed time
      const refillAmount = (elapsed / this.windowMs) * this.quotaPerWindow * this.utilizationTarget;
      this.tokens = Math.min(
        this.quotaPerWindow * this.utilizationTarget,
        this.tokens + refillAmount
      );
      this.lastRefill = now;
    }
  }

  /**
   * Check if tokens are available for a request
   */
  canConsume(count = 1) {
    this.refill();
    return this.tokens >= count;
  }

  /**
   * Consume tokens for a request
   */
  consume(count = 1) {
    this.refill();
    if (this.tokens >= count) {
      this.tokens -= count;
      return true;
    }
    return false;
  }

  /**
   * On 429: immediately degrade
   */
  handleRateLimitError() {
    this.consecutive429s++;
    const degradeFactor = Math.min(
      AdaptiveTokenBucket.MAX_DEGRADE_FACTOR,
      this.consecutive429s * AdaptiveTokenBucket.DEGRADE_STEP
    );
    this.utilizationTarget = Math.max(
      AdaptiveTokenBucket.MIN_UTILIZATION,
      AdaptiveTokenBucket.DEFAULT_UTILIZATION - degradeFactor
    );

    // Reset tokens to new target
    this.tokens = Math.min(this.tokens, this.quotaPerWindow * this.utilizationTarget);
  }

  /**
   * Gradual recovery after sustained success
   */
  recover() {
    const now = Date.now();
    const timeSinceLastCheck = now - this.lastRecoveryCheck;

    // Check every 60 seconds
    if (timeSinceLastCheck >= AdaptiveTokenBucket.RECOVERY_INTERVAL_MS && this.consecutive429s > 0) {
      this.consecutive429s = Math.max(0, this.consecutive429s - 1);
      this.utilizationTarget = Math.min(
        AdaptiveTokenBucket.DEFAULT_UTILIZATION,
        this.utilizationTarget + AdaptiveTokenBucket.RECOVERY_STEP
      );
      this.lastRecoveryCheck = now;
    }
  }

  /**
   * Get current bucket state
   */
  getState() {
    this.refill();
    return {
      tokens: Math.floor(this.tokens),
      utilizationTarget: this.utilizationTarget,
      consecutive429s: this.consecutive429s,
      capacity: this.quotaPerWindow
    };
  }
}

/**
 * Simple histogram for percentile calculations
 */
class Histogram {
  constructor(maxSize = 1000) {
    this.values = [];
    this.maxSize = maxSize;
  }

  record(value) {
    this.values.push(value);
    if (this.values.length > this.maxSize) {
      this.values.shift();
    }
  }

  percentile(p) {
    if (this.values.length === 0) return 0;

    const sorted = [...this.values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  mean() {
    if (this.values.length === 0) return 0;
    return this.values.reduce((a, b) => a + b, 0) / this.values.length;
  }
}

/**
 * PingBudgetManager - Main rate limit manager
 */
class PingBudgetManager extends EventEmitter {
  constructor(config = {}) {
    super();

    this.bucket = new AdaptiveTokenBucket(config);

    // WebSocket state
    this.wsConnected = false;
    this.reconnectAttempts = 0;
    this.reconnects = 0;
    this.lastPing = null;
    this.lastPong = null;
    this.pingTimer = null;
    this.pongTimer = null;

    // Metrics
    this.lagHistogram = new Histogram(1000);
    this.jitterStats = {
      samples: [],
      maxSize: 100,
      mean: 0,
      stddev: 0
    };
    this.lastMessageTime = null;
    this.rateLimitEvents = [];

    // Request queue
    this.requestQueue = [];
    this.processing = false;

    // Event loop monitoring
    this.startEventLoopMonitoring();
  }

  /**
   * Monitor event loop lag
   */
  startEventLoopMonitoring() {
    this.monitorInterval = setInterval(() => {
      const start = Date.now();
      setImmediate(() => {
        const lag = Date.now() - start;
        this.lagHistogram.record(lag);
      });
    }, 1000);
  }

  /**
   * Stop event loop monitoring
   */
  stopEventLoopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }

  /**
   * Schedule a REST call with priority
   */
  async scheduleRestCall(priority, fn) {
    return new Promise((resolve, reject) => {
      this.requestQueue.push({ priority, fn, resolve, reject });
      this.requestQueue.sort((a, b) => a.priority - b.priority);

      this.processQueue();
    });
  }

  /**
   * Process the request queue
   */
  async processQueue() {
    if (this.processing || this.requestQueue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.requestQueue.length > 0) {
      const request = this.requestQueue[0];

      // Check if we can consume a token
      if (!this.bucket.canConsume(1)) {
        // Wait for refill
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      // Consume token and execute request
      this.bucket.consume(1);
      this.requestQueue.shift();

      try {
        const result = await request.fn();
        request.resolve(result);
      } catch (error) {
        // Check if it's a 429 error
        if (error.response && error.response.status === 429) {
          this.recordRateLimitEvent();
        }
        request.reject(error);
      }

      // Allow recovery check
      this.bucket.recover();
    }

    // Mark processing as complete for this run
    this.processing = false;

    // If new requests arrived after the last loop iteration while processing
    // was still true, ensure they are processed in a subsequent tick.
    if (this.requestQueue.length > 0) {
      // Use setImmediate to avoid deep synchronous recursion on large queues
      setImmediate(() => this.processQueue());
    }
  }

  /**
   * Check if LOW priority health sampling is allowed
   */
  shouldSampleHealth() {
    // Only allow health checks if we have sufficient tokens
    const state = this.bucket.getState();
    return state.tokens > (state.capacity * 0.3);
  }

  /**
   * Record a rate limit event (429 response)
   */
  recordRateLimitEvent() {
    const event = {
      timestamp: Date.now(),
      consecutive: this.bucket.consecutive429s + 1
    };

    this.rateLimitEvents.push(event);
    if (this.rateLimitEvents.length > 100) {
      this.rateLimitEvents.shift();
    }

    this.bucket.handleRateLimitError();
    this.emit('rateLimitError', event);
  }

  /**
   * Record message jitter for WebSocket
   */
  recordMessageJitter(timestamp) {
    if (this.lastMessageTime) {
      const jitter = Math.abs(timestamp - this.lastMessageTime);

      this.jitterStats.samples.push(jitter);
      if (this.jitterStats.samples.length > this.jitterStats.maxSize) {
        this.jitterStats.samples.shift();
      }

      // Calculate mean and stddev
      const n = this.jitterStats.samples.length;
      if (n > 0) {
        const mean = this.jitterStats.samples.reduce((a, b) => a + b, 0) / n;
        const variance = this.jitterStats.samples.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;

        this.jitterStats.mean = mean;
        this.jitterStats.stddev = Math.sqrt(variance);
      }
    }

    this.lastMessageTime = timestamp;
  }

  /**
   * Calculate effective staleness (time since last message)
   */
  calculateStaleness() {
    if (!this.lastMessageTime) return 0;
    return Date.now() - this.lastMessageTime;
  }

  /**
   * Start WebSocket heartbeat
   */
  startWebSocketHeartbeat(ws) {
    this.stopWebSocketHeartbeat();

    this.pingTimer = setInterval(() => {
      if (this.wsConnected && ws.readyState === 1) {
        this.lastPing = Date.now();

        // Set timeout for pong
        this.pongTimer = setTimeout(() => {
          // No pong received, connection might be stale
          this.emit('heartbeatTimeout');
          this.wsConnected = false;
        }, WS_CONFIG.pingTimeout);

        // Send ping
        try {
          ws.ping();
        } catch (error) {
          this.emit('pingError', error);
        }
      }
    }, WS_CONFIG.pingInterval);
  }

  /**
   * Handle WebSocket pong
   */
  handleWebSocketPong() {
    this.lastPong = Date.now();

    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }

    // Record latency
    if (this.lastPing) {
      const latency = this.lastPong - this.lastPing;
      this.lagHistogram.record(latency);
    }
  }

  /**
   * Stop WebSocket heartbeat
   */
  stopWebSocketHeartbeat() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }

    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  /**
   * Handle WebSocket reconnect
   */
  handleReconnect() {
    this.reconnectAttempts++;
    this.reconnects++;

    if (this.reconnectAttempts >= WS_CONFIG.maxReconnectAttempts) {
      this.emit('maxReconnectsReached');
      return null;
    }

    const backoffIndex = Math.min(this.reconnectAttempts - 1, WS_CONFIG.reconnectBackoff.length - 1);
    return WS_CONFIG.reconnectBackoff[backoffIndex];
  }

  /**
   * Reset reconnect counter on successful connection
   */
  resetReconnectAttempts() {
    this.reconnectAttempts = 0;
  }

  /**
   * Export metrics
   */
  exportMetrics() {
    return this.getMetrics();
  }

  /**
   * Get current metrics
   */
  getMetrics() {
    const bucketState = this.bucket.getState();

    return {
      eventLoopLagP95: this.lagHistogram.percentile(95),
      eventLoopLagP99: this.lagHistogram.percentile(99),
      messageJitter: {
        mean: this.jitterStats.mean,
        stddev: this.jitterStats.stddev,
        samples: this.jitterStats.samples.length
      },
      reconnectCount: this.reconnects,
      rateLimitCount: bucketState.consecutive429s,
      effectiveStaleness: this.calculateStaleness(),
      currentUtilization: bucketState.utilizationTarget,
      tokensAvailable: bucketState.tokens,
      wsConnected: this.wsConnected,
      lastPing: this.lastPing,
      lastPong: this.lastPong
    };
  }

  /**
   * Cleanup
   */
  destroy() {
    this.stopEventLoopMonitoring();
    this.stopWebSocketHeartbeat();
    this.removeAllListeners();
  }
}

module.exports = {
  PingBudgetManager,
  AdaptiveTokenBucket,
  WS_CONFIG
};
