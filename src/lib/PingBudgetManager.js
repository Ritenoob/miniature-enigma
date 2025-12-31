/**
 * PING BUDGET MANAGER
 * Adaptive rate limiting with token bucket algorithm
 * Manages API request rate limits with priority queues
 */

class PingBudgetManager {
  constructor(config = {}) {
    this.maxTokens = config.maxTokens || 100;
    this.refillRate = config.refillRate || 10;  // tokens per second
    this.refillInterval = config.refillInterval || 1000;  // ms
    
    // Target 70% utilization, 30% headroom
    this.targetUtilization = config.targetUtilization || 0.7;
    
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    
    // Priority queues
    this.queues = {
      critical: [],
      high: [],
      medium: [],
      low: []
    };
    
    // Metrics
    this.metrics = {
      requests: 0,
      throttled: 0,
      eventLoopLagP95: 0,
      eventLoopLagP99: 0,
      messageJitter: 0
    };
    
    // Start refill interval
    this.refillTimer = setInterval(() => this.refill(), this.refillInterval);
  }

  /**
   * Refill tokens
   */
  refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;  // seconds
    const tokensToAdd = Math.floor(elapsed * this.refillRate);
    
    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Request permission to make API call
   * @param {string} priority - Priority level: critical | high | medium | low
   * @param {number} cost - Token cost (default: 1)
   * @returns {Promise<boolean>} True if allowed
   */
  async request(priority = 'medium', cost = 1) {
    this.metrics.requests++;
    
    // Check if we have enough tokens
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    
    // Not enough tokens, add to queue
    return new Promise((resolve) => {
      this.queues[priority].push({ cost, resolve });
      this.metrics.throttled++;
    });
  }

  /**
   * Process queued requests
   */
  processQueue() {
    const priorities = ['critical', 'high', 'medium', 'low'];
    
    for (const priority of priorities) {
      const queue = this.queues[priority];
      
      while (queue.length > 0 && this.tokens >= queue[0].cost) {
        const request = queue.shift();
        this.tokens -= request.cost;
        request.resolve(true);
      }
    }
  }

  /**
   * Handle 429 (rate limit exceeded) response
   * Graceful degradation
   */
  handle429() {
    console.warn('[PingBudgetManager] Rate limit exceeded (429), reducing tokens');
    
    // Reduce token pool temporarily
    this.tokens = Math.floor(this.tokens * 0.5);
    this.maxTokens = Math.floor(this.maxTokens * 0.9);
    
    // Will recover over time
  }

  /**
   * Get current metrics
   * @returns {Object} Metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      tokens: this.tokens,
      maxTokens: this.maxTokens,
      utilization: 1 - (this.tokens / this.maxTokens),
      queueLength: Object.values(this.queues).reduce((sum, q) => sum + q.length, 0)
    };
  }

  /**
   * Update event loop lag metrics
   * @param {number} lag - Event loop lag in ms
   */
  updateEventLoopLag(lag) {
    // Simple exponential moving average
    this.metrics.eventLoopLagP95 = this.metrics.eventLoopLagP95 * 0.9 + lag * 0.1;
    
    if (lag > this.metrics.eventLoopLagP99) {
      this.metrics.eventLoopLagP99 = lag;
    }
  }

  /**
   * Update message jitter metrics
   * @param {number} jitter - Message jitter in ms
   */
  updateMessageJitter(jitter) {
    this.metrics.messageJitter = this.metrics.messageJitter * 0.9 + jitter * 0.1;
  }

  /**
   * Check if system is healthy
   * @returns {boolean}
   */
  isHealthy() {
    const metrics = this.getMetrics();
    
    // Check if event loop lag is acceptable
    if (metrics.eventLoopLagP95 > 100) return false;
    
    // Check if queue is not growing too large
    if (metrics.queueLength > 100) return false;
    
    // Check utilization is within target
    if (metrics.utilization > 0.9) return false;
    
    return true;
  }

  /**
   * Stop the manager
   */
  stop() {
    if (this.refillTimer) {
      clearInterval(this.refillTimer);
      this.refillTimer = null;
    }
  }
}

module.exports = PingBudgetManager;
