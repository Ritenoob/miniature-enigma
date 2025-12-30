/**
 * DOM Collector
 * 
 * Collects and analyzes Depth of Market (order book) data from live feeds.
 * Calculates imbalance ratios, spread metrics, and microprice.
 */

const EventEmitter = require('events');

/**
 * Order book side (bids or asks)
 */
class OrderBookSide {
  constructor(entries = []) {
    this.entries = entries;  // Array of [price, size]
  }
  
  /**
   * Get total size for top N levels
   */
  getTotalSize(levels) {
    return this.entries
      .slice(0, levels)
      .reduce((sum, [price, size]) => sum + size, 0);
  }
  
  /**
   * Get best price
   */
  getBest() {
    return this.entries.length > 0 ? this.entries[0][0] : null;
  }
  
  /**
   * Check for liquidity walls
   */
  findWall(threshold = 5.0) {
    if (this.entries.length === 0) return null;
    
    const avgSize = this.getTotalSize(10) / 10;
    
    for (const [price, size] of this.entries) {
      if (size > avgSize * threshold) {
        return price;
      }
    }
    
    return null;
  }
}

/**
 * Order Book
 */
class OrderBook {
  constructor(symbol) {
    this.symbol = symbol;
    this.bids = new OrderBookSide();
    this.asks = new OrderBookSide();
    this.timestamp = Date.now();
  }
  
  /**
   * Update order book with new data
   */
  update(bids, asks) {
    this.bids = new OrderBookSide(bids);
    this.asks = new OrderBookSide(asks);
    this.timestamp = Date.now();
  }
  
  /**
   * Calculate spread
   */
  getSpread() {
    const bestBid = this.bids.getBest();
    const bestAsk = this.asks.getBest();
    
    if (!bestBid || !bestAsk) {
      return { spread: 0, spreadPercent: 0 };
    }
    
    const spread = bestAsk - bestBid;
    const mid = (bestBid + bestAsk) / 2;
    const spreadPercent = mid > 0 ? spread / mid : 0;
    
    return { spread, spreadPercent };
  }
  
  /**
   * Calculate microprice (weighted mid-price based on volume)
   */
  getMicroprice() {
    const bestBid = this.bids.getBest();
    const bestAsk = this.asks.getBest();
    
    if (!bestBid || !bestAsk || this.bids.entries.length === 0 || this.asks.entries.length === 0) {
      return bestBid && bestAsk ? (bestBid + bestAsk) / 2 : null;
    }
    
    const bidSize = this.bids.entries[0][1];
    const askSize = this.asks.entries[0][1];
    const totalSize = bidSize + askSize;
    
    if (totalSize === 0) {
      return (bestBid + bestAsk) / 2;
    }
    
    // Weight by inverse of size (larger size = closer price)
    return (bestBid * askSize + bestAsk * bidSize) / totalSize;
  }
  
  /**
   * Calculate imbalance ratio for given depth levels
   */
  getImbalance(levels) {
    const bidSize = this.bids.getTotalSize(levels);
    const askSize = this.asks.getTotalSize(levels);
    const totalSize = bidSize + askSize;
    
    if (totalSize === 0) {
      return 0.5;  // Neutral
    }
    
    return bidSize / totalSize;
  }
}

/**
 * DOM Collector - Collects and analyzes order book data
 */
class DOMCollector extends EventEmitter {
  constructor(symbols = []) {
    super();
    
    this.symbols = symbols;
    this.orderBooks = new Map();  // symbol -> OrderBook
    
    // Initialize order books
    for (const symbol of symbols) {
      this.orderBooks.set(symbol, new OrderBook(symbol));
    }
    
    this.connected = false;
    this.snapshotInterval = null;
  }
  
  /**
   * Connect to order book feeds
   */
  async connect() {
    if (this.connected) {
      console.log('DOM Collector already connected');
      return;
    }
    
    console.log(`Connecting DOM collector for ${this.symbols.length} symbols...`);
    
    // TODO: Implement actual WebSocket connection to KuCoin order book feeds
    // This is a placeholder for the connection logic
    
    this.connected = true;
    this.emit('connected');
    
    console.log('✓ DOM Collector connected');
  }
  
  /**
   * Disconnect from feeds
   */
  async disconnect() {
    if (!this.connected) {
      return;
    }
    
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
    }
    
    this.connected = false;
    this.emit('disconnected');
    
    console.log('✓ DOM Collector disconnected');
  }
  
  /**
   * Update order book for a symbol
   */
  updateOrderBook(symbol, bids, asks) {
    let book = this.orderBooks.get(symbol);
    
    if (!book) {
      book = new OrderBook(symbol);
      this.orderBooks.set(symbol, book);
    }
    
    book.update(bids, asks);
    
    this.emit('orderBookUpdate', {
      symbol,
      timestamp: book.timestamp
    });
  }
  
  /**
   * Get current order book for a symbol
   */
  getOrderBook(symbol) {
    return this.orderBooks.get(symbol);
  }
  
  /**
   * Create a DOM snapshot for a symbol
   */
  createSnapshot(symbol, options = {}) {
    const book = this.orderBooks.get(symbol);
    
    if (!book) {
      return null;
    }
    
    const { spread, spreadPercent } = book.getSpread();
    const microprice = book.getMicroprice();
    const bestBid = book.bids.getBest();
    const bestAsk = book.asks.getBest();
    
    const imbalance5 = book.getImbalance(5);
    const imbalance10 = book.getImbalance(10);
    const imbalance25 = book.getImbalance(25);
    
    let bidWallPrice = null;
    let askWallPrice = null;
    
    if (options.detectWalls) {
      bidWallPrice = book.bids.findWall(options.wallThreshold || 5.0);
      askWallPrice = book.asks.findWall(options.wallThreshold || 5.0);
    }
    
    return {
      timestamp: book.timestamp,
      symbol,
      imbalance5,
      imbalance10,
      imbalance25,
      spread,
      spreadPercent,
      microprice,
      bestBid,
      bestAsk,
      bidWallPrice,
      askWallPrice
    };
  }
  
  /**
   * Start periodic snapshot collection
   */
  startSnapshotCollection(intervalMs = 1000, callback) {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
    }
    
    this.snapshotInterval = setInterval(() => {
      for (const symbol of this.symbols) {
        const snapshot = this.createSnapshot(symbol);
        if (snapshot) {
          callback(snapshot);
          this.emit('snapshot', snapshot);
        }
      }
    }, intervalMs);
    
    console.log(`✓ Snapshot collection started (${intervalMs}ms interval)`);
  }
  
  /**
   * Stop snapshot collection
   */
  stopSnapshotCollection() {
    if (this.snapshotInterval) {
      clearInterval(this.snapshotInterval);
      this.snapshotInterval = null;
      console.log('✓ Snapshot collection stopped');
    }
  }
  
  /**
   * Get statistics for all symbols
   */
  getStats() {
    const stats = [];
    
    for (const [symbol, book] of this.orderBooks.entries()) {
      const { spread, spreadPercent } = book.getSpread();
      const imbalance = book.getImbalance(10);
      
      stats.push({
        symbol,
        spread,
        spreadPercent,
        imbalance10: imbalance,
        bestBid: book.bids.getBest(),
        bestAsk: book.asks.getBest(),
        lastUpdate: book.timestamp
      });
    }
    
    return stats;
  }
}

module.exports = {
  DOMCollector,
  OrderBook,
  OrderBookSide
};
