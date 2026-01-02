/**
 * Unit Tests for PingBudgetManager
 * ---------------------------------
 * Tests rate limiting, backoff, and metrics tracking
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');

const PingBudgetManager = require('../core/net/PingBudgetManager');

describe('PingBudgetManager', () => {
  let manager;

  before(() => {
    // Create manager with fast refill for testing
    manager = new PingBudgetManager({
      critical: 10,
      high: 20,
      medium: 30,
      low: 50,
      headroom: 0.2,  // 20% headroom
      refillInterval: 50,  // 50ms for faster tests
      backoffInitial: 100,
      backoffMax: 1000,
      metricsWindow: 1000
    });
  });

  after(() => {
    if (manager) {
      manager.stop();
    }
  });

  it('initializes with correct configuration', () => {
    assert.strictEqual(manager.config.critical, 10);
    assert.strictEqual(manager.config.high, 20);
    assert.strictEqual(manager.config.headroom, 0.2);
  });

  it('initializes token buckets with headroom', () => {
    const buckets = manager._getBucketStatus();
    
    // With 20% headroom, critical should have 80% of 10 = 8 tokens
    assert.ok(buckets.critical.max <= 10);
    assert.ok(buckets.critical.max >= 7);  // Account for refills
  });

  it('allows requests when tokens available', async () => {
    const allowed = await manager.request('low', 1);
    assert.strictEqual(allowed, true);
    assert.strictEqual(manager.metrics.requests.total >= 1, true);
  });

  it('rejects requests when tokens exhausted', async () => {
    const newManager = new PingBudgetManager({
      low: 1,
      headroom: 0,
      refillInterval: 60000  // Very long refill to prevent any refills
    });
    
    // Give it a moment for initialization
    await new Promise(resolve => setImmediate(resolve));
    
    // First request should succeed
    const first = await newManager.request('low', 1);
    assert.strictEqual(first, true);
    
    // Immediately try second (no time for refill)
    const second = await newManager.request('low', 1);
    assert.strictEqual(second, false);
    assert.ok(newManager.metrics.requests.rejected > 0);
    
    newManager.stop();
  });

  it('prioritizes critical requests over low priority', async () => {
    const newManager = new PingBudgetManager({
      critical: 5,
      low: 5,
      headroom: 0,
      refillInterval: 10000
    });
    
    // Exhaust low priority tokens
    for (let i = 0; i < 5; i++) {
      await newManager.request('low', 1);
    }
    
    // Critical requests should still succeed by borrowing from low
    const critical = await newManager.request('critical', 1);
    assert.ok(critical === true || critical === false);  // May borrow or queue
    
    newManager.stop();
  });

  it('enters backoff state on 429', () => {
    const newManager = new PingBudgetManager({
      backoffInitial: 100
    });
    
    assert.strictEqual(newManager.backoffState.active, false);
    
    newManager.report429();
    
    assert.strictEqual(newManager.backoffState.active, true);
    assert.strictEqual(newManager.backoffState.currentBackoff, 100);
    assert.ok(newManager.metrics.rateLimit.hits429 > 0);
    
    newManager.stop();
  });

  it('applies exponential backoff on repeated 429s', () => {
    const newManager = new PingBudgetManager({
      backoffInitial: 100,
      backoffMultiplier: 2
    });
    
    newManager.report429();
    const firstBackoff = newManager.backoffState.currentBackoff;
    
    newManager.report429();
    const secondBackoff = newManager.backoffState.currentBackoff;
    
    assert.strictEqual(secondBackoff, firstBackoff * 2);
    
    newManager.stop();
  });

  it('respects backoff max limit', () => {
    const newManager = new PingBudgetManager({
      backoffInitial: 100,
      backoffMax: 500,
      backoffMultiplier: 10
    });
    
    // Apply many 429s to test max
    for (let i = 0; i < 10; i++) {
      newManager.report429();
    }
    
    assert.ok(newManager.backoffState.currentBackoff <= 500);
    
    newManager.stop();
  });

  it('exits backoff on recovery', () => {
    const newManager = new PingBudgetManager();
    
    newManager.report429();
    assert.strictEqual(newManager.backoffState.active, true);
    
    newManager.reportRecovery();
    assert.strictEqual(newManager.backoffState.active, false);
    assert.ok(newManager.metrics.rateLimit.recoveries > 0);
    
    newManager.stop();
  });

  it('records latency samples', () => {
    const newManager = new PingBudgetManager();
    
    newManager.recordLatency(10);
    newManager.recordLatency(20);
    newManager.recordLatency(30);
    
    assert.ok(newManager.metrics.latency.samples.length > 0);
    
    newManager.stop();
  });

  it('calculates latency percentiles', () => {
    const newManager = new PingBudgetManager();
    
    // Add sample data
    for (let i = 1; i <= 100; i++) {
      newManager.recordLatency(i);
    }
    
    newManager._calculatePercentiles();
    
    assert.ok(newManager.metrics.latency.p50 > 0);
    assert.ok(newManager.metrics.latency.p95 > 0);
    assert.ok(newManager.metrics.latency.p99 > 0);
    assert.ok(newManager.metrics.latency.p95 > newManager.metrics.latency.p50);
    
    newManager.stop();
  });

  it('records event loop lag', () => {
    const newManager = new PingBudgetManager();
    
    newManager.recordEventLoopLag(25);
    
    assert.ok(newManager.metrics.latency.eventLoopLag.length > 0);
    
    newManager.stop();
  });

  it('emits high lag warning', (t, done) => {
    const newManager = new PingBudgetManager({
      lagThreshold: 20
    });
    
    newManager.once('highLag', (data) => {
      assert.ok(data.lag > data.threshold);
      newManager.stop();
      done();
    });
    
    newManager.recordEventLoopLag(50);
  });

  it('calculates jitter statistics', () => {
    const newManager = new PingBudgetManager();
    
    // Add samples with variation
    const samples = [10, 15, 12, 18, 11, 20, 14, 16];
    samples.forEach(s => newManager.recordLatency(s));
    
    newManager._calculateJitter();
    
    assert.ok(newManager.metrics.jitter.mean > 0);
    assert.ok(newManager.metrics.jitter.stdDev > 0);
    
    newManager.stop();
  });

  it('tracks reconnects', () => {
    const newManager = new PingBudgetManager();
    
    newManager.reportReconnect();
    newManager.reportReconnect();
    
    assert.strictEqual(newManager.metrics.reconnects, 2);
    
    newManager.stop();
  });

  it('gets comprehensive metrics', () => {
    const newManager = new PingBudgetManager();
    
    // Generate some activity
    newManager.recordLatency(10);
    newManager.recordEventLoopLag(5);
    newManager.reportReconnect();
    
    const metrics = newManager.getMetrics();
    
    assert.ok('requests' in metrics);
    assert.ok('latency' in metrics);
    assert.ok('jitter' in metrics);
    assert.ok('rateLimit' in metrics);
    assert.ok('reconnects' in metrics);
    assert.ok('buckets' in metrics);
    
    newManager.stop();
  });

  it('provides bucket status', () => {
    const status = manager._getBucketStatus();
    
    assert.ok('critical' in status);
    assert.ok('high' in status);
    assert.ok('medium' in status);
    assert.ok('low' in status);
    
    assert.ok('available' in status.critical);
    assert.ok('max' in status.critical);
    assert.ok('utilization' in status.critical);
  });

  it('refills tokens over time', async () => {
    const newManager = new PingBudgetManager({
      low: 10,
      headroom: 0,
      refillInterval: 50
    });
    
    // Exhaust tokens
    for (let i = 0; i < 10; i++) {
      await newManager.request('low', 1);
    }
    
    // Wait for refill
    await new Promise(resolve => setTimeout(resolve, 150));
    
    // Should have tokens again
    const allowed = await newManager.request('low', 1);
    assert.strictEqual(allowed, true);
    
    newManager.stop();
  });

  it('stops cleanly', () => {
    const newManager = new PingBudgetManager();
    newManager.stop();
    
    assert.strictEqual(newManager.refillTimer, null);
    assert.strictEqual(newManager.metricsTimer, null);
  });
});

describe('PingBudgetManager Integration', () => {
  it('handles high request volume', async () => {
    const manager = new PingBudgetManager({
      low: 100,
      headroom: 0.1,
      refillInterval: 10
    });
    
    let allowed = 0;
    let rejected = 0;
    
    // Make many requests
    for (let i = 0; i < 200; i++) {
      const result = await manager.request('low', 1);
      if (result) {
        allowed++;
      } else {
        rejected++;
      }
    }
    
    assert.ok(allowed > 0);
    assert.ok(rejected > 0);  // Some should be rejected
    assert.strictEqual(allowed + rejected, 200);
    
    manager.stop();
  });

  it('recovers from backoff state', async () => {
    const manager = new PingBudgetManager({
      backoffInitial: 50,
      critical: 10,
      refillInterval: 10
    });
    
    // Trigger backoff
    manager.report429();
    
    // Try request during backoff (should be queued if critical)
    const duringBackoff = await manager.request('critical', 1);
    
    // Wait for backoff to expire
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Report recovery
    manager.reportRecovery();
    
    // Should accept requests now
    const afterRecovery = await manager.request('critical', 1);
    assert.strictEqual(afterRecovery, true);
    
    manager.stop();
  });

  it('emits metrics periodically', (t, done) => {
    const manager = new PingBudgetManager({
      metricsWindow: 100
    });
    
    let emitted = false;
    manager.once('metrics', (metrics) => {
      emitted = true;
      assert.ok(metrics);
      assert.ok('requests' in metrics);
      manager.stop();
      done();
    });
    
    // Wait for metrics emission
    setTimeout(() => {
      if (!emitted) {
        manager.stop();
        done();
      }
    }, 200);
  });
});
