process.env.DEMO_MODE = 'true';
process.env.RUN_INTERVALS = 'false';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { PingBudgetManager, AdaptiveTokenBucket, WS_CONFIG } = require('../src/lib/PingBudgetManager');

describe('AdaptiveTokenBucket', () => {
  test('initializes with default values', () => {
    const bucket = new AdaptiveTokenBucket();

    assert.strictEqual(bucket.quotaPerWindow, 2000);
    assert.strictEqual(bucket.windowMs, 30000);
    assert.strictEqual(bucket.utilizationTarget, 0.70);
    assert.strictEqual(bucket.headroom, 0.30);
    assert.strictEqual(bucket.consecutive429s, 0);
  });

  test('initializes with custom values', () => {
    const bucket = new AdaptiveTokenBucket({
      quotaPerWindow: 1000,
      windowMs: 10000,
      utilizationTarget: 0.50,
      headroom: 0.50
    });

    assert.strictEqual(bucket.quotaPerWindow, 1000);
    assert.strictEqual(bucket.windowMs, 10000);
    assert.strictEqual(bucket.utilizationTarget, 0.50);
  });

  test('starts with tokens based on utilization target', () => {
    const bucket = new AdaptiveTokenBucket({ quotaPerWindow: 1000, utilizationTarget: 0.70 });
    const state = bucket.getState();

    assert.strictEqual(state.tokens, 700);
  });

  test('can consume tokens when available', () => {
    const bucket = new AdaptiveTokenBucket({ quotaPerWindow: 100, utilizationTarget: 1.0 });

    assert.strictEqual(bucket.canConsume(10), true);
    assert.strictEqual(bucket.consume(10), true);

    const state = bucket.getState();
    assert.strictEqual(state.tokens, 90);
  });

  test('cannot consume more tokens than available', () => {
    const bucket = new AdaptiveTokenBucket({ quotaPerWindow: 100, utilizationTarget: 1.0 });

    bucket.consume(95);

    assert.strictEqual(bucket.canConsume(10), false);
    assert.strictEqual(bucket.consume(10), false);
  });

  test('degrades utilization target on rate limit error', () => {
    const bucket = new AdaptiveTokenBucket({ quotaPerWindow: 1000, utilizationTarget: 0.70 });

    bucket.handleRateLimitError();

    assert.strictEqual(bucket.consecutive429s, 1);
    assert.ok(bucket.utilizationTarget < 0.70);
    assert.ok(bucket.utilizationTarget >= 0.40);
  });

  test('progressively degrades on multiple 429s', () => {
    const bucket = new AdaptiveTokenBucket({ quotaPerWindow: 1000, utilizationTarget: 0.70 });

    bucket.handleRateLimitError();
    const target1 = bucket.utilizationTarget;

    bucket.handleRateLimitError();
    const target2 = bucket.utilizationTarget;

    assert.ok(target2 < target1);
    assert.strictEqual(bucket.consecutive429s, 2);
  });

  test('caps degradation at 0.40', () => {
    const bucket = new AdaptiveTokenBucket({ quotaPerWindow: 1000, utilizationTarget: 0.70 });

    // Trigger many 429s
    for (let i = 0; i < 10; i++) {
      bucket.handleRateLimitError();
    }

    assert.ok(bucket.utilizationTarget >= 0.40);
  });

  test('refills tokens over time', async () => {
    const bucket = new AdaptiveTokenBucket({
      quotaPerWindow: 1000,
      windowMs: 1000,  // 1 second for testing
      utilizationTarget: 1.0
    });

    bucket.consume(500);
    const tokens1 = bucket.getState().tokens;

    // Wait for partial refill
    await new Promise(resolve => setTimeout(resolve, 500));

    bucket.refill();
    const tokens2 = bucket.getState().tokens;

    assert.ok(tokens2 > tokens1);
  });

  test('recovers utilization target after sustained success', async () => {
    const bucket = new AdaptiveTokenBucket({
      quotaPerWindow: 1000,
      utilizationTarget: 0.70
    });

    bucket.handleRateLimitError();
    const degradedTarget = bucket.utilizationTarget;

    // Manually set lastRecoveryCheck to simulate 60s passing
    bucket.lastRecoveryCheck = Date.now() - 61000;

    bucket.recover();

    assert.ok(bucket.utilizationTarget > degradedTarget);
    assert.strictEqual(bucket.consecutive429s, 0);
  });

  test('priority constants are defined', () => {
    assert.strictEqual(AdaptiveTokenBucket.PRIORITY.CRITICAL, 0);
    assert.strictEqual(AdaptiveTokenBucket.PRIORITY.HIGH, 1);
    assert.strictEqual(AdaptiveTokenBucket.PRIORITY.MEDIUM, 2);
    assert.strictEqual(AdaptiveTokenBucket.PRIORITY.LOW, 3);
  });
});

describe('PingBudgetManager', () => {
  test('initializes with default values', () => {
    const manager = new PingBudgetManager();

    assert.ok(manager.bucket instanceof AdaptiveTokenBucket);
    assert.strictEqual(manager.wsConnected, false);
    assert.strictEqual(manager.reconnects, 0);

    manager.destroy();
  });

  test('schedules REST calls with priority', async () => {
    const manager = new PingBudgetManager({ quotaPerWindow: 100, utilizationTarget: 1.0 });

    let executed = false;
    const fn = async () => {
      executed = true;
      return 'result';
    };

    const result = await manager.scheduleRestCall(AdaptiveTokenBucket.PRIORITY.HIGH, fn);

    assert.strictEqual(executed, true);
    assert.strictEqual(result, 'result');

    manager.destroy();
  });

  test('processes requests in priority order', async () => {
    const manager = new PingBudgetManager({ quotaPerWindow: 100, utilizationTarget: 1.0 });

    const executionOrder = [];

    // Temporarily disable tokens to queue all requests first
    manager.bucket.tokens = 0;

    // Schedule requests in reverse priority order - all will be queued
    const low = manager.scheduleRestCall(
      AdaptiveTokenBucket.PRIORITY.LOW,
      async () => { executionOrder.push('low'); return 'low'; }
    );

    const high = manager.scheduleRestCall(
      AdaptiveTokenBucket.PRIORITY.HIGH,
      async () => { executionOrder.push('high'); return 'high'; }
    );

    const critical = manager.scheduleRestCall(
      AdaptiveTokenBucket.PRIORITY.CRITICAL,
      async () => { executionOrder.push('critical'); return 'critical'; }
    );

    // Wait a bit to ensure all are queued
    await new Promise(resolve => setTimeout(resolve, 10));

    // Now restore tokens to allow processing
    manager.bucket.tokens = 100;

    await Promise.all([low, high, critical]);

    // Critical should execute first (priority 0), then high, then low
    assert.strictEqual(executionOrder[0], 'critical');
    assert.strictEqual(executionOrder[1], 'high');
    assert.strictEqual(executionOrder[2], 'low');

    manager.destroy();
  });

  test('records rate limit events', () => {
    const manager = new PingBudgetManager();

    manager.recordRateLimitEvent();

    assert.strictEqual(manager.rateLimitEvents.length, 1);
    assert.ok(manager.rateLimitEvents[0].timestamp > 0);

    manager.destroy();
  });

  test('shouldSampleHealth returns false when tokens are low', () => {
    const manager = new PingBudgetManager({ quotaPerWindow: 100, utilizationTarget: 1.0 });

    // Consume most tokens
    manager.bucket.consume(85);

    const canSample = manager.shouldSampleHealth();

    assert.strictEqual(canSample, false);

    manager.destroy();
  });

  test('shouldSampleHealth returns true when tokens are sufficient', () => {
    const manager = new PingBudgetManager({ quotaPerWindow: 100, utilizationTarget: 1.0 });

    const canSample = manager.shouldSampleHealth();

    assert.strictEqual(canSample, true);

    manager.destroy();
  });

  test('exports metrics', () => {
    const manager = new PingBudgetManager();

    const metrics = manager.exportMetrics();

    assert.ok('eventLoopLagP95' in metrics);
    assert.ok('eventLoopLagP99' in metrics);
    assert.ok('messageJitter' in metrics);
    assert.ok('reconnectCount' in metrics);
    assert.ok('rateLimitCount' in metrics);
    assert.ok('effectiveStaleness' in metrics);
    assert.ok('currentUtilization' in metrics);
    assert.ok('tokensAvailable' in metrics);

    manager.destroy();
  });

  test('calculates staleness when messages received', () => {
    const manager = new PingBudgetManager();

    manager.recordMessageJitter(Date.now());

    const staleness = manager.calculateStaleness();

    assert.ok(staleness >= 0);
    assert.ok(staleness < 100);  // Should be very recent

    manager.destroy();
  });

  test('tracks message jitter', () => {
    const manager = new PingBudgetManager();

    const now = Date.now();
    manager.recordMessageJitter(now);
    manager.recordMessageJitter(now + 100);
    manager.recordMessageJitter(now + 200);

    assert.strictEqual(manager.jitterStats.samples.length, 2);  // First call has no jitter

    manager.destroy();
  });

  test('handles WebSocket pong', () => {
    const manager = new PingBudgetManager();

    manager.lastPing = Date.now() - 50;
    manager.handleWebSocketPong();

    assert.ok(manager.lastPong > manager.lastPing);

    manager.destroy();
  });

  test('handles reconnect with exponential backoff', () => {
    const manager = new PingBudgetManager();

    const backoff1 = manager.handleReconnect();
    assert.strictEqual(backoff1, WS_CONFIG.reconnectBackoff[0]);

    const backoff2 = manager.handleReconnect();
    assert.strictEqual(backoff2, WS_CONFIG.reconnectBackoff[1]);

    manager.destroy();
  });

  test('resets reconnect attempts on successful connection', () => {
    const manager = new PingBudgetManager();

    manager.handleReconnect();
    manager.handleReconnect();
    assert.strictEqual(manager.reconnectAttempts, 2);

    manager.resetReconnectAttempts();
    assert.strictEqual(manager.reconnectAttempts, 0);

    manager.destroy();
  });

  test('returns null after max reconnect attempts', () => {
    const manager = new PingBudgetManager();

    // Exhaust reconnect attempts
    for (let i = 0; i < WS_CONFIG.maxReconnectAttempts; i++) {
      manager.handleReconnect();
    }

    const result = manager.handleReconnect();
    assert.strictEqual(result, null);

    manager.destroy();
  });
});

describe('WS_CONFIG', () => {
  test('has required configuration values', () => {
    assert.strictEqual(WS_CONFIG.pingInterval, 18000);
    assert.strictEqual(WS_CONFIG.pingTimeout, 10000);
    assert.strictEqual(WS_CONFIG.maxReconnectAttempts, 5);
    assert.ok(Array.isArray(WS_CONFIG.reconnectBackoff));
    assert.strictEqual(WS_CONFIG.reconnectBackoff.length, 5);
  });
});
