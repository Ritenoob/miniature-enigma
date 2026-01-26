const test = require('node:test');
const assert = require('node:assert/strict');
const { MarketStateStore } = require('../src/lib/StateStores');

test('MarketStateStore maintains normalized tick contract', () => {
  const store = new MarketStateStore();

  store.updateFromTicker('XBTUSDTM', { price: '100', markPrice: '101', sequence: 1, timestamp: 1700000000000 });
  store.updateFromOrderBook('XBTUSDTM', { bids: [['99', '1']], asks: [['102', '1']] });
  store.updateFromFunding('XBTUSDTM', { rate: '0.0001', predictedRate: '0.0002' });
  store.updateFromCandle('XBTUSDTM', { timestamp: 1700000000000, open: 95, high: 105, low: 90, close: 100 });
  store.updateIndicators('XBTUSDTM', { rsi: 55 });

  const tick = store.getNormalizedTick('XBTUSDTM');

  assert.equal(tick.symbol, 'XBTUSDTM');
  assert.equal(tick.markPrice, 101);
  assert.equal(tick.lastPrice, 100);
  assert.equal(tick.microstructure.spread, 3);
  assert.equal(tick.microstructure.fundingRate, 0.0001);
  assert.ok(tick.candle);
  assert.ok(tick.indicators);
  assert.ok(tick.tsExchange > 0);
  assert.ok(tick.tsLocal > 0);
  assert.ok(tick.seq >= 1);
});

test('MarketStateStore increments sequence when not provided', () => {
  const store = new MarketStateStore();
  store.updateFromTicker('ETHUSDTM', { price: '2000', markPrice: '2001' });
  store.updateFromTicker('ETHUSDTM', { price: '2002', markPrice: '2003' });

  const tick = store.getNormalizedTick('ETHUSDTM');
  assert.equal(tick.seq, 2);
});
