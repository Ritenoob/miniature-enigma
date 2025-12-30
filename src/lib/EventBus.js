// ============================================================================
// EventBus.js - Hot/Cold Path Event-Driven Architecture
// ============================================================================

const { EventEmitter } = require('events');

/**
 * Trading Event Bus with Hot/Cold Path Architecture
 * 
 * Hot Path: Latency-sensitive operations (market data, risk decisions, order execution)
 * Cold Path: Non-critical operations (logging, persistence, analytics)
 * 
 * This separation ensures that critical trading operations are never blocked
 * by non-critical tasks like logging or database writes.
 */
class TradingEventBus extends EventEmitter {
  constructor(options = {}) {
    super();
    this.setMaxListeners(50); // Increase max listeners for multiple subscriptions
    
    this.hotPathQueue = [];
    this.coldPathQueue = [];
    this.hotPathMaxSize = options.hotPathMaxSize || 100;
    this.coldPathMaxSize = options.coldPathMaxSize || 1000;
    this.coldBatchSize = options.coldBatchSize || 50;
    this.processingHot = false;
    this.processingCold = false;
    this.droppedEvents = {
      hot: 0,
      cold: 0
    };
  }

  /**
   * Emit event on hot path (high priority, low latency)
   * Used for: price updates, order fills, stop losses, risk calculations
   * 
   * @param {string} event - Event name
   * @param {any} data - Event data
   */
  emitHot(event, data) {
    if (this.hotPathQueue.length >= this.hotPathMaxSize) {
      // Backpressure: drop oldest event
      this.hotPathQueue.shift();
      this.droppedEvents.hot++;
      this.emit('backpressure', { 
        path: 'hot', 
        dropped: 1,
        totalDropped: this.droppedEvents.hot 
      });
    }
    
    this.hotPathQueue.push({ event, data, timestamp: Date.now() });
    
    // Process immediately (synchronously)
    this.processHotPath();
  }

  /**
   * Emit event on cold path (lower priority, can be delayed)
   * Used for: logging, persistence, analytics, notifications
   * 
   * @param {string} event - Event name
   * @param {any} data - Event data
   */
  emitCold(event, data) {
    if (this.coldPathQueue.length >= this.coldPathMaxSize) {
      // Backpressure: drop oldest event
      this.coldPathQueue.shift();
      this.droppedEvents.cold++;
      this.emit('backpressure', { 
        path: 'cold', 
        dropped: 1,
        totalDropped: this.droppedEvents.cold 
      });
    }
    
    this.coldPathQueue.push({ event, data, timestamp: Date.now() });
    
    // Process asynchronously on next tick
    if (!this.processingCold) {
      setImmediate(() => this.processColdPath());
    }
  }

  /**
   * Process hot path events immediately
   * These events are processed synchronously to minimize latency
   */
  processHotPath() {
    if (this.processingHot) {
      return; // Already processing
    }

    this.processingHot = true;

    try {
      while (this.hotPathQueue.length > 0) {
        const { event, data, timestamp } = this.hotPathQueue.shift();
        
        // Track latency
        const latency = Date.now() - timestamp;
        if (latency > 100) {
          this.emit('hot_path_latency', { event, latency });
        }
        
        // Emit event synchronously
        this.emit(event, data);
      }
    } finally {
      this.processingHot = false;
    }
  }

  /**
   * Process cold path events in batches
   * These events are processed asynchronously and can be delayed
   */
  processColdPath() {
    if (this.processingCold) {
      return; // Already processing
    }

    this.processingCold = true;

    try {
      // Process in batches to avoid blocking
      const batch = this.coldPathQueue.splice(0, this.coldBatchSize);
      
      for (const { event, data, timestamp } of batch) {
        // Track latency for monitoring
        const latency = Date.now() - timestamp;
        if (latency > 5000) {
          this.emit('cold_path_latency', { event, latency });
        }
        
        // Emit event
        this.emit(event, data);
      }

      // If more events remain, schedule next batch
      if (this.coldPathQueue.length > 0) {
        setImmediate(() => {
          this.processingCold = false;
          this.processColdPath();
        });
      } else {
        this.processingCold = false;
      }
    } catch (error) {
      this.processingCold = false;
      this.emit('error', { path: 'cold', error });
    }
  }

  /**
   * Get current queue statistics
   * @returns {Object} Queue statistics
   */
  getStats() {
    return {
      hotQueue: {
        size: this.hotPathQueue.length,
        maxSize: this.hotPathMaxSize,
        dropped: this.droppedEvents.hot,
        utilization: (this.hotPathQueue.length / this.hotPathMaxSize * 100).toFixed(1) + '%'
      },
      coldQueue: {
        size: this.coldPathQueue.length,
        maxSize: this.coldPathMaxSize,
        dropped: this.droppedEvents.cold,
        utilization: (this.coldPathQueue.length / this.coldPathMaxSize * 100).toFixed(1) + '%'
      },
      processing: {
        hot: this.processingHot,
        cold: this.processingCold
      }
    };
  }

  /**
   * Clear all queued events (use with caution)
   */
  clearQueues() {
    const clearedHot = this.hotPathQueue.length;
    const clearedCold = this.coldPathQueue.length;
    
    this.hotPathQueue = [];
    this.coldPathQueue = [];
    
    return {
      hot: clearedHot,
      cold: clearedCold
    };
  }

  /**
   * Reset dropped event counters
   */
  resetStats() {
    this.droppedEvents = {
      hot: 0,
      cold: 0
    };
  }
}

/**
 * Create a singleton instance for the application
 */
let globalEventBus = null;

function getEventBus(options) {
  if (!globalEventBus) {
    globalEventBus = new TradingEventBus(options);
  }
  return globalEventBus;
}

module.exports = {
  TradingEventBus,
  getEventBus
};
