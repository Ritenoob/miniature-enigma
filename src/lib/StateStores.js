// ============================================================================
// StateStores.js - MarketStateStore and AccountStateStore
// ============================================================================

class MarketStateStore {
  constructor() {
    this.ticks = new Map(); // symbol -> normalized tick
    this.sequences = new Map(); // symbol -> last seq
    this.exchangeTimestamps = new Map(); // symbol -> last exchange ts
  }

  getNormalizedTick(symbol) {
    return this.ticks.get(symbol) || null;
  }

  updateFromTicker(symbol, tickerData = {}) {
    const markPrice = this._safeNumber(
      tickerData.markPrice ?? tickerData.mark ?? tickerData.indexPrice ?? tickerData.price
    );
    const lastPrice = this._safeNumber(tickerData.price ?? tickerData.lastPrice ?? markPrice);
    const tsExchange = this._safeNumber(
      tickerData.timestamp ?? tickerData.time ?? tickerData.ts ?? Date.now()
    );
    const seq = this._nextSequence(symbol, tickerData.sequence);

    const existing = this._baseTick(symbol);
    const nextTick = {
      ...existing,
      markPrice,
      lastPrice,
      tsExchange,
      tsLocal: Date.now(),
      seq
    };

    this.ticks.set(symbol, nextTick);
    return nextTick;
  }

  updateFromOrderBook(symbol, orderBook = {}) {
    const bestBid = this._safeNumber(orderBook.bestBid ?? orderBook.bestBidPrice ?? orderBook.bids?.[0]?.[0]);
    const bestAsk = this._safeNumber(orderBook.bestAsk ?? orderBook.bestAskPrice ?? orderBook.asks?.[0]?.[0]);
    const spread = bestBid && bestAsk ? bestAsk - bestBid : 0;

    const existing = this._baseTick(symbol);
    const microstructure = {
      ...existing.microstructure,
      bestBid,
      bestAsk,
      spread
    };

    const nextTick = {
      ...existing,
      microstructure,
      tsLocal: Date.now()
    };

    this.ticks.set(symbol, nextTick);
    return nextTick;
  }

  updateFromFunding(symbol, funding = {}) {
    const existing = this._baseTick(symbol);
    const microstructure = {
      ...existing.microstructure,
      fundingRate: this._safeNumber(funding.rate ?? funding.value),
      predictedFundingRate: this._safeNumber(funding.predictedRate ?? funding.predictedValue)
    };

    const nextTick = {
      ...existing,
      microstructure,
      tsLocal: Date.now()
    };

    this.ticks.set(symbol, nextTick);
    return nextTick;
  }

  updateFromCandle(symbol, candle = null) {
    const existing = this._baseTick(symbol);
    const nextTick = {
      ...existing,
      candle: candle || existing.candle,
      tsLocal: Date.now()
    };

    this.ticks.set(symbol, nextTick);
    return nextTick;
  }

  updateIndicators(symbol, indicators = null) {
    const existing = this._baseTick(symbol);
    const nextTick = {
      ...existing,
      indicators: indicators || existing.indicators,
      tsLocal: Date.now()
    };

    this.ticks.set(symbol, nextTick);
    return nextTick;
  }

  _baseTick(symbol) {
    return (
      this.ticks.get(symbol) || {
        symbol,
        markPrice: 0,
        lastPrice: 0,
        candle: null,
        indicators: null,
        microstructure: {
          bestBid: 0,
          bestAsk: 0,
          spread: 0,
          fundingRate: 0,
          predictedFundingRate: 0
        },
        tsExchange: 0,
        tsLocal: Date.now(),
        seq: 0
      }
    );
  }

  _nextSequence(symbol, providedSeq) {
    const lastSeq = this.sequences.get(symbol) ?? 0;
    const lastTs = this.exchangeTimestamps.get(symbol) ?? 0;
    const nextSeq = typeof providedSeq === 'number' ? providedSeq : lastSeq + 1;
    if (nextSeq > lastSeq) {
      this.sequences.set(symbol, nextSeq);
    }
    if (lastTs === 0 || nextSeq >= lastSeq) {
      this.exchangeTimestamps.set(symbol, Date.now());
    }
    return nextSeq;
  }

  _safeNumber(value) {
    const num = Number(value);
    return Number.isFinite(num) ? num : 0;
  }
}

class AccountStateStore {
  constructor() {
    this.positions = new Map(); // symbol -> position snapshot
    this.stopRevisions = new Map(); // symbol -> revision
    this.stopMeta = new Map(); // symbol -> { lastStopPrice, lastUpdateTs, orderId }
    this.drift = {
      score: 0,
      startedAt: null,
      lastUpdatedAt: null
    };
    this.lastPrivateWsTimestamp = null;
  }

  recordPosition(symbol, snapshot) {
    this.positions.set(symbol, { ...snapshot, updatedAt: Date.now() });
  }

  clearPosition(symbol) {
    this.positions.delete(symbol);
    this.stopRevisions.delete(symbol);
    this.stopMeta.delete(symbol);
  }

  nextStopRevision(symbol) {
    const next = (this.stopRevisions.get(symbol) || 0) + 1;
    this.stopRevisions.set(symbol, next);
    return next;
  }

  getStopRevision(symbol) {
    return this.stopRevisions.get(symbol) || 0;
  }

  recordStopUpdate(symbol, { price, orderId }) {
    this.stopMeta.set(symbol, {
      lastStopPrice: price,
      lastUpdateTs: Date.now(),
      orderId
    });
  }

  getStopMeta(symbol) {
    return this.stopMeta.get(symbol) || { lastStopPrice: null, lastUpdateTs: 0, orderId: null };
  }

  markPrivateWsHeartbeat() {
    this.lastPrivateWsTimestamp = Date.now();
  }

  registerDrift() {
    if (this.drift.startedAt === null) {
      this.drift.startedAt = Date.now();
    }
    this.drift.score += 1;
    this.drift.lastUpdatedAt = Date.now();
  }

  clearDrift() {
    this.drift = {
      score: 0,
      startedAt: null,
      lastUpdatedAt: Date.now()
    };
  }

  getHealthStatus() {
    const now = Date.now();
    return {
      driftScore: this.drift.score,
      driftDurationMs: this.drift.startedAt ? now - this.drift.startedAt : 0,
      lastPrivateWsTimestamp: this.lastPrivateWsTimestamp,
      updatedAt: now
    };
  }
}

module.exports = {
  MarketStateStore,
  AccountStateStore
};
