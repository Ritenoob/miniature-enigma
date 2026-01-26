// ============================================================================
// Reconciler.js - Drift-aware reconciliation and auto-repair
// ============================================================================

class Reconciler {
  constructor({
    api,
    accountStateStore,
    stopManager,
    activePositions,
    broadcastLog,
    broadcastAlert,
    haltTrading
  }) {
    this.api = api;
    this.accountStateStore = accountStateStore;
    this.stopManager = stopManager;
    this.activePositions = activePositions;
    this.broadcastLog = broadcastLog;
    this.broadcastAlert = broadcastAlert;
    this.haltTrading = haltTrading;
  }

  async reconcileAll() {
    try {
      const response = await this.api.getAllPositions();
      const exchangePositions = response?.data || [];
      const exchangeMap = new Map(
        exchangePositions
          .filter((pos) => Number(pos.currentQty) !== 0)
          .map((pos) => [pos.symbol, pos])
      );

      for (const [symbol, manager] of this.activePositions.entries()) {
        if (!exchangeMap.has(symbol)) {
          this.accountStateStore.registerDrift();
          this.broadcastAlert('critical', `Drift detected: ghost position for ${symbol}. Halting trading.`);
          this.broadcastLog('error', `[${symbol}] Drift detected: local position open but exchange has none.`);
          this.haltTrading();
          this.activePositions.delete(symbol);
          this.accountStateStore.clearPosition(symbol);
          continue;
        }

        const desiredStop = manager.currentSL;
        const stopStatus = await this.stopManager.verifyStops(symbol, desiredStop);
        if (stopStatus.missingStop) {
          this.accountStateStore.registerDrift();
          this.broadcastLog('warn', `[${symbol}] Missing stop detected. Replacing.`);
          await this.stopManager.replaceStopLoss({
            symbol,
            side: manager.side,
            size: manager.remainingSize,
            stopPrice: desiredStop,
            positionId: manager.entryOrderId || symbol,
            existingOrderId: manager.slOrderId || null
          });
        } else if (stopStatus.wrongStop) {
          this.accountStateStore.registerDrift();
          this.broadcastLog(
            'warn',
            `[${symbol}] Stop drift detected. Desired ${desiredStop}, exchange ${stopStatus.currentStopPrice}. Replacing.`
          );
          await this.stopManager.replaceStopLoss({
            symbol,
            side: manager.side,
            size: manager.remainingSize,
            stopPrice: desiredStop,
            positionId: manager.entryOrderId || symbol,
            existingOrderId: manager.slOrderId || null
          });
        } else {
          this.accountStateStore.clearDrift();
        }
      }
    } catch (error) {
      this.accountStateStore.registerDrift();
      this.broadcastLog('error', `Reconciler error: ${error.message}`);
    }
  }
}

module.exports = Reconciler;
