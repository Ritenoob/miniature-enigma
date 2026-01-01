/**
 * TELEMETRY FEED
 * In-memory pub/sub system for real-time strategy performance metrics
 * Provides WebSocket streaming for dashboard monitoring
 */

const { EventEmitter } = require('events');

class TelemetryFeed extends EventEmitter {
  constructor() {
    super();
    this.metrics = new Map(); // variantId -> metrics
    this.subscribers = new Set(); // WebSocket clients
    this.experimentHistory = []; // Historical experiment data
    this.maxHistorySize = 1000;
  }
  
  /**
   * Publish metrics update for a strategy variant
   * @param {string} variantId - Strategy variant identifier
   * @param {Object} metrics - Current metrics for the variant
   */
  publish(variantId, metrics) {
    const timestamp = Date.now();
    const update = {
      variantId,
      metrics,
      timestamp
    };
    
    // Update current metrics
    this.metrics.set(variantId, update);
    
    // Add to history
    this.experimentHistory.push(update);
    if (this.experimentHistory.length > this.maxHistorySize) {
      this.experimentHistory.shift();
    }
    
    // Emit update event
    this.emit('metrics:update', update);
    
    // Broadcast to WebSocket subscribers
    this.broadcast({
      type: 'metrics:update',
      data: update
    });
  }
  
  /**
   * Subscribe a WebSocket client to telemetry feed
   * @param {WebSocket} ws - WebSocket client
   */
  subscribe(ws) {
    this.subscribers.add(ws);
    
    // Send current state to new subscriber
    ws.send(JSON.stringify({
      type: 'telemetry:init',
      data: {
        currentMetrics: Array.from(this.metrics.values()),
        summary: this.getSummary()
      }
    }));
    
    // Handle disconnect
    ws.on('close', () => {
      this.subscribers.delete(ws);
    });
  }
  
  /**
   * Unsubscribe a WebSocket client
   * @param {WebSocket} ws - WebSocket client
   */
  unsubscribe(ws) {
    this.subscribers.delete(ws);
  }
  
  /**
   * Broadcast message to all subscribers
   * @param {Object} message - Message to broadcast
   */
  broadcast(message) {
    const data = JSON.stringify(message);
    
    for (const ws of this.subscribers) {
      if (ws.readyState === 1) { // OPEN
        try {
          ws.send(data);
        } catch (error) {
          // Remove failed connections
          this.subscribers.delete(ws);
        }
      }
    }
  }
  
  /**
   * Get current metrics for a specific variant
   * @param {string} variantId - Strategy variant identifier
   * @returns {Object|null} Current metrics or null
   */
  getMetrics(variantId) {
    return this.metrics.get(variantId) || null;
  }
  
  /**
   * Get all current metrics
   * @returns {Array} Array of all variant metrics
   */
  getAllMetrics() {
    return Array.from(this.metrics.values());
  }
  
  /**
   * Get metrics summary with rankings
   * @returns {Object} Summary of all experiments
   */
  getSummary() {
    const allMetrics = this.getAllMetrics();
    
    if (allMetrics.length === 0) {
      return {
        totalVariants: 0,
        bestPerformer: null,
        averageROI: 0,
        averageWinRate: 0,
        topPerformers: []
      };
    }
    
    // Calculate averages
    const totalROI = allMetrics.reduce((sum, m) => sum + (m.metrics.roi || 0), 0);
    const totalWinRate = allMetrics.reduce((sum, m) => sum + (m.metrics.winRate || 0), 0);
    
    // Find best performer
    const sorted = [...allMetrics].sort((a, b) => 
      (b.metrics.roi || 0) - (a.metrics.roi || 0)
    );
    
    return {
      totalVariants: allMetrics.length,
      bestPerformer: sorted[0] || null,
      averageROI: totalROI / allMetrics.length,
      averageWinRate: totalWinRate / allMetrics.length,
      topPerformers: sorted.slice(0, 5)
    };
  }
  
  /**
   * Get top N performing variants
   * @param {number} n - Number of variants to return
   * @param {string} metric - Metric to sort by (default: 'roi')
   * @returns {Array} Top N variants
   */
  getTopPerformers(n = 5, metric = 'roi') {
    const allMetrics = this.getAllMetrics();
    
    return allMetrics
      .filter(m => m.metrics[metric] !== undefined)
      .sort((a, b) => (b.metrics[metric] || 0) - (a.metrics[metric] || 0))
      .slice(0, n);
  }
  
  /**
   * Get experiment history
   * @param {number} limit - Maximum number of records to return
   * @returns {Array} Historical experiment data
   */
  getHistory(limit = 100) {
    return this.experimentHistory.slice(-limit);
  }
  
  /**
   * Clear metrics for a specific variant
   * @param {string} variantId - Strategy variant identifier
   */
  clearVariant(variantId) {
    this.metrics.delete(variantId);
    this.broadcast({
      type: 'variant:removed',
      data: { variantId }
    });
  }
  
  /**
   * Clear all metrics
   */
  clearAll() {
    this.metrics.clear();
    this.experimentHistory = [];
    this.broadcast({
      type: 'telemetry:reset',
      data: {}
    });
  }
  
  /**
   * Export current metrics snapshot
   * @returns {Object} Serializable snapshot
   */
  exportSnapshot() {
    return {
      timestamp: Date.now(),
      metrics: Array.from(this.metrics.entries()),
      summary: this.getSummary(),
      historySize: this.experimentHistory.length
    };
  }
  
  /**
   * Import metrics snapshot
   * @param {Object} snapshot - Previously exported snapshot
   */
  importSnapshot(snapshot) {
    if (!snapshot || !snapshot.metrics) {
      throw new Error('Invalid snapshot format');
    }
    
    this.metrics = new Map(snapshot.metrics);
    
    this.broadcast({
      type: 'telemetry:imported',
      data: {
        variantCount: this.metrics.size,
        timestamp: snapshot.timestamp
      }
    });
  }
  
  /**
   * Stream live updates to a callback
   * @param {Function} callback - Callback for each update
   * @returns {Function} Unsubscribe function
   */
  stream(callback) {
    const handler = (update) => {
      try {
        callback(update);
      } catch (error) {
        console.error('[TelemetryFeed] Stream callback error:', error);
      }
    };
    
    this.on('metrics:update', handler);
    
    // Return unsubscribe function
    return () => {
      this.off('metrics:update', handler);
    };
  }
  
  /**
   * Get real-time statistics
   * @returns {Object} Real-time stats
   */
  getRealtimeStats() {
    const allMetrics = this.getAllMetrics();
    
    if (allMetrics.length === 0) {
      return {
        activeVariants: 0,
        totalTrades: 0,
        totalPnL: 0,
        avgWinRate: 0,
        updatedAt: Date.now()
      };
    }
    
    const totalTrades = allMetrics.reduce((sum, m) => sum + (m.metrics.totalTrades || 0), 0);
    const totalPnL = allMetrics.reduce((sum, m) => sum + (m.metrics.totalPnL || 0), 0);
    const avgWinRate = allMetrics.reduce((sum, m) => sum + (m.metrics.winRate || 0), 0) / allMetrics.length;
    
    return {
      activeVariants: allMetrics.length,
      totalTrades,
      totalPnL,
      avgWinRate,
      updatedAt: Date.now()
    };
  }
}

module.exports = TelemetryFeed;
