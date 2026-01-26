const test = require('node:test');
const assert = require('node:assert/strict');
const StopManager = require('../src/lib/StopManager');
const { AccountStateStore } = require('../src/lib/StateStores');

test('StopManager enforces mark price stop params and idempotent clientOid', async () => {
  let capturedParams;
  const api = {
    placeStopOrder: async (params) => {
      capturedParams = params;
      return { data: { orderId: 'stop-1' } };
    },
    cancelStopOrder: async () => ({})
  };

  const accountStateStore = new AccountStateStore();
  const contractSpecs = { XBTUSDTM: { tickSize: 0.5, lotSize: 1 } };
  const config = {
    TRADING: {
      STOP_PRICE_TYPE: 'MP',
      SLIPPAGE_BUFFER_PERCENT: 0,
      STOP_UPDATE_MIN_INTERVAL_MS: 0,
      STOP_MIN_MOVE_TICKS: 1
    }
  };

  const tradeMath = {
    calculateSlippageAdjustedStop: (_side, price) => price,
    roundToTickSize: (price) => price,
    roundToLotSize: (size) => size
  };

  const stopManager = new StopManager({
    api,
    accountStateStore,
    contractSpecs,
    config,
    tradeMath,
    broadcastLog: () => {},
    broadcastAlert: () => {}
  });

  stopManager.validateConfig();

  const result = await stopManager.replaceStopLoss({
    symbol: 'XBTUSDTM',
    side: 'long',
    size: 2,
    stopPrice: 95,
    positionId: 'pos-1',
    existingOrderId: null
  });

  assert.equal(result.orderId, 'stop-1');
  assert.equal(capturedParams.stopPriceType, 'MP');
  assert.equal(capturedParams.clientOid, 'stop:XBTUSDTM:pos-1:sl:1');
});
