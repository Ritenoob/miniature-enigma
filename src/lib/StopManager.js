// ============================================================================
// StopManager.js - Centralized stop ownership, idempotency, and validation
// ============================================================================

const StopReplaceCoordinator = require('./StopReplaceCoordinator');
const OrderValidator = require('./OrderValidator');

class StopManager {
  constructor({
    api,
    accountStateStore,
    contractSpecs,
    config,
    tradeMath,
    broadcastLog,
    broadcastAlert
  }) {
    this.api = api;
    this.accountStateStore = accountStateStore;
    this.contractSpecs = contractSpecs;
    this.config = config;
    this.tradeMath = tradeMath;
    this.broadcastLog = broadcastLog;
    this.broadcastAlert = broadcastAlert;
    this.coordinators = new Map();
  }

  validateConfig() {
    const stopPriceType = this.config?.TRADING?.STOP_PRICE_TYPE;
    if (stopPriceType !== 'MP') {
      throw new Error(`StopManager requires STOP_PRICE_TYPE to be "MP" (mark price). Got: ${stopPriceType}`);
    }
  }

  async ensureInitialStops(position) {
    return this.replaceStopLoss({
      symbol: position.symbol,
      side: position.side,
      size: position.remainingSize ?? position.size,
      stopPrice: position.initialSL,
      positionId: position.entryOrderId || position.symbol,
      existingOrderId: position.slOrderId || null
    });
  }

  async replaceStopLoss({ symbol, side, size, stopPrice, positionId, existingOrderId }) {
    const specs = this.contractSpecs[symbol] || { tickSize: 0.1, lotSize: 1 };
    const slippageAdjusted = this.tradeMath.calculateSlippageAdjustedStop(
      side,
      stopPrice,
      this.config.TRADING.SLIPPAGE_BUFFER_PERCENT
    );
    const roundedStop = this.tradeMath.roundToTickSize(slippageAdjusted, specs.tickSize);
    const roundedSize = this._roundSize(size, specs.lotSize);

    const minInterval = this.config.TRADING.STOP_UPDATE_MIN_INTERVAL_MS;
    const minMoveTicks = this.config.TRADING.STOP_MIN_MOVE_TICKS;
    const stopMeta = this.accountStateStore.getStopMeta(symbol);
    const now = Date.now();
    const minMove = specs.tickSize * minMoveTicks;

    if (
      stopMeta.lastUpdateTs &&
      now - stopMeta.lastUpdateTs < minInterval &&
      stopMeta.lastStopPrice !== null &&
      Math.abs(roundedStop - stopMeta.lastStopPrice) < minMove
    ) {
      this.broadcastLog(
        'info',
        `[${symbol}] Stop update skipped (debounce): Δ${Math.abs(roundedStop - stopMeta.lastStopPrice).toFixed(6)} < ${minMove.toFixed(6)}`
      );
      return { skipped: true, orderId: stopMeta.orderId, stopPrice: stopMeta.lastStopPrice };
    }

    const revision = this.accountStateStore.nextStopRevision(symbol);
    const clientOid = this._buildClientOid(symbol, positionId, 'sl', revision);

    const stopParams = {
      clientOid,
      side: side === 'long' ? 'sell' : 'buy',
      symbol,
      type: 'market',
      stop: side === 'long' ? 'down' : 'up',
      stopPrice: roundedStop.toString(),
      stopPriceType: this.config.TRADING.STOP_PRICE_TYPE,
      size: roundedSize.toString(),
      reduceOnly: true
    };

    OrderValidator.validateStopOrder(stopParams);
    const sanitized = OrderValidator.sanitize(stopParams, 'stop');

    const coordinator = this._getCoordinator(symbol);
    coordinator.currentOrderId = existingOrderId || stopMeta.orderId || null;

    this.broadcastLog('info', `[${symbol}] Stop payload: ${JSON.stringify(sanitized)}`);
    const result = await coordinator.replaceStopOrder(symbol, sanitized);
    this.broadcastLog('info', `[${symbol}] Stop response: ${JSON.stringify(result)}`);

    if (result.success) {
      this.accountStateStore.recordStopUpdate(symbol, {
        price: roundedStop,
        orderId: result.orderId
      });
    }

    return {
      ...result,
      stopPrice: roundedStop
    };
  }

  async verifyStops(symbol, desiredStopPrice) {
    const openStops = await this.api.getOpenStopOrders(symbol);
    const stopOrders = openStops?.data?.items || openStops?.data || [];
    const ownedStops = stopOrders.filter((order) => typeof order.clientOid === 'string' && order.clientOid.startsWith(`stop:${symbol}:`));

    if (ownedStops.length === 0) {
      return { missingStop: true, wrongStop: false, currentStopPrice: null };
    }

    const latest = ownedStops[0];
    const currentStopPrice = Number(latest.stopPrice || latest.stopPriceString || 0);

    if (!desiredStopPrice || !currentStopPrice) {
      return { missingStop: false, wrongStop: false, currentStopPrice };
    }

    const isTooLoose = desiredStopPrice
      ? Math.abs(currentStopPrice - desiredStopPrice) > 0
      : false;

    return { missingStop: false, wrongStop: isTooLoose, currentStopPrice };
  }

  _getCoordinator(symbol) {
    if (!this.coordinators.has(symbol)) {
      this.coordinators.set(
        symbol,
        new StopReplaceCoordinator(this.api, this.broadcastLog, this.broadcastAlert)
      );
    }
    return this.coordinators.get(symbol);
  }

  _buildClientOid(symbol, positionId, type, revision) {
    return `stop:${symbol}:${positionId}:${type}:${revision}`;
  }

  _roundSize(size, lotSize) {
    if (!this.tradeMath || typeof this.tradeMath.roundToLotSize !== 'function') {
      return size;
    }
    return this.tradeMath.roundToLotSize(size, lotSize || 1);
  }
}

module.exports = StopManager;
