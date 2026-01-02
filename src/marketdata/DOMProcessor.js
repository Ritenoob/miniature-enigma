/**
 * DOM (Depth of Market) Processor
 * ================================
 * Processes order book data to extract trading signals.
 * 
 * Features:
 * - Order book imbalance calculation at multiple depths (5/10/25 levels)
 * - Bid-ask spread measurement
 * - Microprice calculation (volume-weighted mid price)
 * - Order book wall detection (large single orders)
 * 
 * All features are LIVE-ONLY and should not be used in backtesting.
 */

class DOMProcessor {
  constructor(config = {}) {
    this.depths = config.depths || [5, 10, 25];
    this.wallMultiplier = config.wallMultiplier || 5.0; // Order size > 5x average = wall
  }

  /**
   * Compute features from order book snapshot
   * @param {Array} bids - Array of [price, size] arrays, sorted desc by price
   * @param {Array} asks - Array of [price, size] arrays, sorted asc by price
   * @returns {Object} DOM features
   */
  computeFeatures(bids, asks) {
    if (!Array.isArray(bids) || !Array.isArray(asks)) {
      throw new Error('DOMProcessor.computeFeatures requires array inputs');
    }

    if (bids.length === 0 || asks.length === 0) {
      throw new Error('DOMProcessor.computeFeatures requires non-empty order books');
    }

    // Extract best bid/ask
    const bestBid = bids[0][0];
    const bestBidSize = bids[0][1];
    const bestAsk = asks[0][0];
    const bestAskSize = asks[0][1];

    if (bestBid >= bestAsk) {
      throw new Error('Invalid order book: best bid >= best ask (crossed book)');
    }

    const midPrice = (bestBid + bestAsk) / 2;

    // Calculate spread in basis points
    const spread_bps = ((bestAsk - bestBid) / midPrice) * 10000;

    // Calculate microprice (volume-weighted mid)
    const totalTopVolume = bestBidSize + bestAskSize;
    const microprice = totalTopVolume > 0
      ? (bestBid * bestAskSize + bestAsk * bestBidSize) / totalTopVolume
      : midPrice;

    // Calculate imbalances at different depths
    const imbalances = {};
    for (const depth of this.depths) {
      const imbalance = this._calculateImbalance(bids, asks, depth);
      imbalances[`imbalance_${depth}`] = imbalance;
    }

    // Detect walls (large orders)
    const walls = this._detectWalls(bids, asks);

    return {
      bestBid,
      bestAsk,
      midPrice,
      microprice,
      spread_bps,
      ...imbalances,
      walls,
      timestamp: Date.now()
    };
  }

  /**
   * Calculate order book imbalance at specific depth
   * @param {Array} bids - Bid orders
   * @param {Array} asks - Ask orders
   * @param {number} depth - Number of levels to include
   * @returns {number} Imbalance ratio (-1 to +1)
   * @private
   */
  _calculateImbalance(bids, asks, depth) {
    let bidVolume = 0;
    let askVolume = 0;

    // Sum volumes up to depth
    for (let i = 0; i < Math.min(depth, bids.length); i++) {
      bidVolume += bids[i][1];
    }

    for (let i = 0; i < Math.min(depth, asks.length); i++) {
      askVolume += asks[i][1];
    }

    const totalVolume = bidVolume + askVolume;

    if (totalVolume === 0) {
      return 0; // No volume, neutral
    }

    // Return normalized imbalance: +1 = all bids, -1 = all asks
    return (bidVolume - askVolume) / totalVolume;
  }

  /**
   * Detect large orders (walls) in the order book
   * @param {Array} bids - Bid orders
   * @param {Array} asks - Ask orders
   * @returns {Object} Wall detection results
   * @private
   */
  _detectWalls(bids, asks) {
    // Calculate average order size across top 10 levels
    const topLevels = 10;
    const bidSizes = bids.slice(0, topLevels).map(o => o[1]);
    const askSizes = asks.slice(0, topLevels).map(o => o[1]);
    
    const avgBidSize = bidSizes.reduce((sum, size) => sum + size, 0) / bidSizes.length;
    const avgAskSize = askSizes.reduce((sum, size) => sum + size, 0) / askSizes.length;
    const avgSize = (avgBidSize + avgAskSize) / 2;

    const wallThreshold = avgSize * this.wallMultiplier;

    // Find walls
    const bidWalls = bids
      .slice(0, topLevels)
      .filter(order => order[1] > wallThreshold)
      .map((order, index) => ({ price: order[0], size: order[1], level: index }));

    const askWalls = asks
      .slice(0, topLevels)
      .filter(order => order[1] > wallThreshold)
      .map((order, index) => ({ price: order[0], size: order[1], level: index }));

    return {
      bidWalls,
      askWalls,
      hasBidWall: bidWalls.length > 0,
      hasAskWall: askWalls.length > 0
    };
  }

  /**
   * Validate order book data structure
   * @param {Array} bids - Bid orders
   * @param {Array} asks - Ask orders
   * @returns {boolean} True if valid
   */
  validateOrderBook(bids, asks) {
    if (!Array.isArray(bids) || !Array.isArray(asks)) {
      return false;
    }

    if (bids.length === 0 || asks.length === 0) {
      return false;
    }

    // Check each order is [price, size]
    const validateOrders = (orders) => {
      return orders.every(order => {
        return Array.isArray(order) &&
               order.length === 2 &&
               typeof order[0] === 'number' &&
               typeof order[1] === 'number' &&
               order[0] > 0 &&
               order[1] > 0;
      });
    };

    if (!validateOrders(bids) || !validateOrders(asks)) {
      return false;
    }

    // Check best bid < best ask
    if (bids[0][0] >= asks[0][0]) {
      return false; // Crossed book
    }

    return true;
  }

  /**
   * Get aggregated depth statistics
   * @param {Array} bids - Bid orders
   * @param {Array} asks - Ask orders
   * @param {number} depth - Number of levels
   * @returns {Object} Depth statistics
   */
  getDepthStats(bids, asks, depth = 25) {
    const bidVolume = bids.slice(0, depth).reduce((sum, order) => sum + order[1], 0);
    const askVolume = asks.slice(0, depth).reduce((sum, order) => sum + order[1], 0);
    const totalVolume = bidVolume + askVolume;

    const bidValue = bids.slice(0, depth).reduce((sum, order) => sum + order[0] * order[1], 0);
    const askValue = asks.slice(0, depth).reduce((sum, order) => sum + order[0] * order[1], 0);

    return {
      bidVolume,
      askVolume,
      totalVolume,
      bidValue,
      askValue,
      volumeImbalance: (bidVolume - askVolume) / totalVolume,
      valueImbalance: (bidValue - askValue) / (bidValue + askValue),
      depth
    };
  }
}

module.exports = DOMProcessor;
