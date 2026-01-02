/**
 * Test suite for DOMProcessor
 */

const { test } = require('node:test');
const assert = require('node:assert');
const DOMProcessor = require('../../src/marketdata/DOMProcessor');

test('DOMProcessor - initializes with default config', () => {
  const processor = new DOMProcessor();
  assert.deepStrictEqual(processor.depths, [5, 10, 25]);
  assert.strictEqual(processor.wallMultiplier, 5.0);
});

test('DOMProcessor - initializes with custom config', () => {
  const processor = new DOMProcessor({ 
    depths: [3, 7, 15],
    wallMultiplier: 3.0
  });
  assert.deepStrictEqual(processor.depths, [3, 7, 15]);
  assert.strictEqual(processor.wallMultiplier, 3.0);
});

test('DOMProcessor - computes basic features', () => {
  const processor = new DOMProcessor();
  
  const bids = [
    [50000, 10],  // Best bid
    [49999, 5],
    [49998, 8],
    [49997, 6],
    [49996, 4]
  ];
  
  const asks = [
    [50001, 8],   // Best ask
    [50002, 6],
    [50003, 7],
    [50004, 5],
    [50005, 9]
  ];
  
  const features = processor.computeFeatures(bids, asks);
  
  assert.strictEqual(features.bestBid, 50000);
  assert.strictEqual(features.bestAsk, 50001);
  assert.strictEqual(features.midPrice, 50000.5);
  assert.ok(typeof features.microprice === 'number');
  assert.ok(typeof features.spread_bps === 'number');
  assert.ok(features.spread_bps > 0);
});

test('DOMProcessor - calculates spread in basis points', () => {
  const processor = new DOMProcessor();
  
  const bids = [[50000, 10]];
  const asks = [[50010, 10]]; // 10 point spread
  
  const features = processor.computeFeatures(bids, asks);
  
  // Spread = (50010 - 50000) / 50005 * 10000 ≈ 2 bps
  assert.ok(features.spread_bps > 1.9 && features.spread_bps < 2.1);
});

test('DOMProcessor - calculates microprice', () => {
  const processor = new DOMProcessor();
  
  const bids = [[50000, 10]];
  const asks = [[50010, 5]]; // Less ask volume
  
  const features = processor.computeFeatures(bids, asks);
  
  // Microprice = (50000 * 5 + 50010 * 10) / 15
  const expected = (50000 * 5 + 50010 * 10) / 15;
  assert.ok(Math.abs(features.microprice - expected) < 0.1);
});

test('DOMProcessor - calculates imbalance at depth 5', () => {
  const processor = new DOMProcessor({ depths: [5] });
  
  // More bid volume than ask volume
  const bids = [
    [50000, 20],
    [49999, 15],
    [49998, 10],
    [49997, 8],
    [49996, 7]
  ]; // Total: 60
  
  const asks = [
    [50001, 5],
    [50002, 5],
    [50003, 5],
    [50004, 5],
    [50005, 5]
  ]; // Total: 25
  
  const features = processor.computeFeatures(bids, asks);
  
  // Imbalance = (60 - 25) / 85 ≈ 0.41
  assert.ok(features.imbalance_5 > 0.3 && features.imbalance_5 < 0.5);
  assert.ok(features.imbalance_5 > 0, 'Should be positive with more bids');
});

test('DOMProcessor - calculates imbalance at multiple depths', () => {
  const processor = new DOMProcessor({ depths: [3, 5, 10] });
  
  const bids = Array.from({ length: 10 }, (_, i) => [50000 - i, 10]);
  const asks = Array.from({ length: 10 }, (_, i) => [50001 + i, 5]);
  
  const features = processor.computeFeatures(bids, asks);
  
  assert.ok(typeof features.imbalance_3 === 'number');
  assert.ok(typeof features.imbalance_5 === 'number');
  assert.ok(typeof features.imbalance_10 === 'number');
  
  // All should be positive (more bid volume)
  assert.ok(features.imbalance_3 > 0);
  assert.ok(features.imbalance_5 > 0);
  assert.ok(features.imbalance_10 > 0);
});

test('DOMProcessor - detects bid walls', () => {
  const processor = new DOMProcessor({ wallMultiplier: 3.0 });
  
  const bids = [
    [50000, 100],  // Large order (wall)
    [49999, 5],
    [49998, 5],
    [49997, 5],
    [49996, 5]
  ];
  
  const asks = Array.from({ length: 5 }, (_, i) => [50001 + i, 5]);
  
  const features = processor.computeFeatures(bids, asks);
  
  assert.ok(features.walls.hasBidWall, 'Should detect bid wall');
  assert.strictEqual(features.walls.bidWalls.length, 1);
  assert.strictEqual(features.walls.bidWalls[0].price, 50000);
});

test('DOMProcessor - detects ask walls', () => {
  const processor = new DOMProcessor({ wallMultiplier: 3.0 });
  
  const bids = Array.from({ length: 5 }, (_, i) => [50000 - i, 5]);
  
  const asks = [
    [50001, 100],  // Large order (wall)
    [50002, 5],
    [50003, 5],
    [50004, 5],
    [50005, 5]
  ];
  
  const features = processor.computeFeatures(bids, asks);
  
  assert.ok(features.walls.hasAskWall, 'Should detect ask wall');
  assert.strictEqual(features.walls.askWalls.length, 1);
  assert.strictEqual(features.walls.askWalls[0].price, 50001);
});

test('DOMProcessor - validates order book structure', () => {
  const processor = new DOMProcessor();
  
  // Valid order book
  assert.ok(processor.validateOrderBook(
    [[50000, 10]],
    [[50001, 10]]
  ));
  
  // Invalid: empty
  assert.strictEqual(processor.validateOrderBook([], []), false);
  
  // Invalid: not arrays
  assert.strictEqual(processor.validateOrderBook('invalid', 'invalid'), false);
  
  // Invalid: crossed book
  assert.strictEqual(processor.validateOrderBook(
    [[50001, 10]],
    [[50000, 10]]
  ), false);
  
  // Invalid: negative prices
  assert.strictEqual(processor.validateOrderBook(
    [[-50000, 10]],
    [[50001, 10]]
  ), false);
});

test('DOMProcessor - throws on invalid input', () => {
  const processor = new DOMProcessor();
  
  assert.throws(() => {
    processor.computeFeatures('invalid', [[50001, 10]]);
  }, /requires array inputs/);
  
  assert.throws(() => {
    processor.computeFeatures([[50000, 10]], 'invalid');
  }, /requires array inputs/);
  
  assert.throws(() => {
    processor.computeFeatures([], [[50001, 10]]);
  }, /non-empty order books/);
});

test('DOMProcessor - throws on crossed book', () => {
  const processor = new DOMProcessor();
  
  assert.throws(() => {
    processor.computeFeatures(
      [[50001, 10]], // Bid price
      [[50000, 10]]  // Ask price (lower than bid!)
    );
  }, /crossed book/);
});

test('DOMProcessor - gets depth statistics', () => {
  const processor = new DOMProcessor();
  
  const bids = Array.from({ length: 25 }, (_, i) => [50000 - i, 10]);
  const asks = Array.from({ length: 25 }, (_, i) => [50001 + i, 5]);
  
  const stats = processor.getDepthStats(bids, asks, 10);
  
  assert.strictEqual(stats.bidVolume, 100); // 10 levels * 10 size
  assert.strictEqual(stats.askVolume, 50);  // 10 levels * 5 size
  assert.strictEqual(stats.totalVolume, 150);
  assert.ok(stats.volumeImbalance > 0); // More bids
  assert.strictEqual(stats.depth, 10);
});

test('DOMProcessor - handles equal volumes (zero imbalance)', () => {
  const processor = new DOMProcessor({ depths: [5] });
  
  const bids = Array.from({ length: 5 }, (_, i) => [50000 - i, 10]);
  const asks = Array.from({ length: 5 }, (_, i) => [50001 + i, 10]);
  
  const features = processor.computeFeatures(bids, asks);
  
  assert.strictEqual(features.imbalance_5, 0);
});

test('DOMProcessor - handles deep order books', () => {
  const processor = new DOMProcessor({ depths: [50] });
  
  const bids = Array.from({ length: 100 }, (_, i) => [50000 - i, 10]);
  const asks = Array.from({ length: 100 }, (_, i) => [50001 + i, 10]);
  
  const features = processor.computeFeatures(bids, asks);
  
  assert.ok(typeof features.imbalance_50 === 'number');
  assert.ok(features.walls);
});
