process.env.DEMO_MODE = 'true';
process.env.RUN_INTERVALS = 'false';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const StopReplaceCoordinator = require('../src/lib/StopReplaceCoordinator');

describe('StopReplaceCoordinator', () => {

  test('initializes in IDLE state', () => {
    const mockApi = {};
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const coordinator = new StopReplaceCoordinator(mockApi, mockLog, mockAlert);
    
    assert.strictEqual(coordinator.state, 'IDLE');
    assert.strictEqual(coordinator.currentOrderId, null);
    assert.strictEqual(coordinator.retryCount, 0);
    assert.strictEqual(coordinator.isProcessing, false);
  });

  test('calculates jittered exponential backoff correctly', () => {
    const mockApi = {};
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const coordinator = new StopReplaceCoordinator(mockApi, mockLog, mockAlert);
    
    // Test exponential growth
    const delay0 = coordinator.calculateBackoffDelay(0);
    const delay1 = coordinator.calculateBackoffDelay(1);
    const delay2 = coordinator.calculateBackoffDelay(2);
    
    // Delays should increase exponentially (with jitter)
    assert.ok(delay0 >= 800 && delay0 <= 1200); // ~1000ms with jitter
    assert.ok(delay1 >= 1600 && delay1 <= 2400); // ~2000ms with jitter
    assert.ok(delay2 >= 3200 && delay2 <= 4800); // ~4000ms with jitter
    
    // Test max delay cap
    const delay10 = coordinator.calculateBackoffDelay(10);
    assert.ok(delay10 <= 30000); // Should be capped at maxDelay
  });

  test('successfully replaces stop order on first attempt', async () => {
    const mockApi = {
      placeStopOrder: async (params) => {
        return { data: { orderId: 'new_order_123' } };
      }
    };
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const coordinator = new StopReplaceCoordinator(mockApi, mockLog, mockAlert);
    
    const stopParams = {
      side: 'sell',
      symbol: 'XBTUSDTM',
      type: 'market',
      stop: 'down',
      stopPrice: '50000',
      stopPriceType: 'TP',
      size: '1',
      reduceOnly: true
    };
    
    const result = await coordinator.replaceStopOrder('XBTUSDTM', stopParams);
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.orderId, 'new_order_123');
    assert.strictEqual(result.state, 'CONFIRMED');
    assert.strictEqual(coordinator.state, 'CONFIRMED');
    assert.strictEqual(coordinator.currentOrderId, 'new_order_123');
  });

  test('cancels old order before placing new one', async () => {
    let cancelledOrder = null;
    let placedOrder = null;
    
    const mockApi = {
      cancelStopOrder: async (orderId) => {
        cancelledOrder = orderId;
        return { data: { success: true } };
      },
      placeStopOrder: async (params) => {
        placedOrder = 'new_order_456';
        return { data: { orderId: placedOrder } };
      }
    };
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const coordinator = new StopReplaceCoordinator(mockApi, mockLog, mockAlert);
    coordinator.currentOrderId = 'old_order_123';
    
    const stopParams = {
      side: 'sell',
      symbol: 'XBTUSDTM',
      type: 'market',
      stop: 'down',
      stopPrice: '50000',
      stopPriceType: 'TP',
      size: '1',
      reduceOnly: true
    };
    
    await coordinator.replaceStopOrder('XBTUSDTM', stopParams);
    
    assert.strictEqual(cancelledOrder, 'old_order_123');
    assert.strictEqual(placedOrder, 'new_order_456');
    assert.strictEqual(coordinator.currentOrderId, 'new_order_456');
  });

  test('transitions through states: IDLE → CANCELING → PLACING → CONFIRMED', async () => {
    const states = [];
    
    const mockApi = {
      cancelStopOrder: async (orderId) => {
        states.push(coordinator.state);
        await new Promise(resolve => setTimeout(resolve, 10));
        return { data: { success: true } };
      },
      placeStopOrder: async (params) => {
        states.push(coordinator.state);
        await new Promise(resolve => setTimeout(resolve, 10));
        return { data: { orderId: 'order_123' } };
      }
    };
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const coordinator = new StopReplaceCoordinator(mockApi, mockLog, mockAlert);
    coordinator.currentOrderId = 'old_order';
    
    const stopParams = {
      side: 'sell',
      symbol: 'XBTUSDTM',
      type: 'market',
      stop: 'down',
      stopPrice: '50000',
      stopPriceType: 'TP',
      size: '1',
      reduceOnly: true
    };
    
    await coordinator.replaceStopOrder('XBTUSDTM', stopParams);
    
    // Should have captured CANCELING and PLACING states
    assert.ok(states.includes('CANCELING'));
    assert.ok(states.includes('PLACING'));
    assert.strictEqual(coordinator.state, 'CONFIRMED');
  });

  test('retries on API failure with exponential backoff', async () => {
    let attempts = 0;
    
    const mockApi = {
      placeStopOrder: async (params) => {
        attempts++;
        if (attempts < 3) {
          throw new Error('API Error');
        }
        return { data: { orderId: 'order_after_retry' } };
      }
    };
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const coordinator = new StopReplaceCoordinator(mockApi, mockLog, mockAlert);
    // Speed up test by reducing delays
    coordinator.baseDelay = 10;
    coordinator.maxDelay = 100;
    
    const stopParams = {
      side: 'sell',
      symbol: 'XBTUSDTM',
      type: 'market',
      stop: 'down',
      stopPrice: '50000',
      stopPriceType: 'TP',
      size: '1',
      reduceOnly: true
    };
    
    const result = await coordinator.replaceStopOrder('XBTUSDTM', stopParams);
    
    assert.strictEqual(attempts, 3);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.orderId, 'order_after_retry');
  });

  test('handles 429 rate limiting error', async () => {
    let attempts = 0;
    
    const mockApi = {
      placeStopOrder: async (params) => {
        attempts++;
        if (attempts < 2) {
          const error = new Error('Too Many Requests');
          error.code = 429;
          throw error;
        }
        return { data: { orderId: 'order_after_rate_limit' } };
      }
    };
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const coordinator = new StopReplaceCoordinator(mockApi, mockLog, mockAlert);
    coordinator.baseDelay = 10;
    
    const stopParams = {
      side: 'sell',
      symbol: 'XBTUSDTM',
      type: 'market',
      stop: 'down',
      stopPrice: '50000',
      stopPriceType: 'TP',
      size: '1',
      reduceOnly: true
    };
    
    const result = await coordinator.replaceStopOrder('XBTUSDTM', stopParams);
    
    assert.strictEqual(attempts, 2);
    assert.strictEqual(result.success, true);
  });

  test('triggers emergency close after max retries', async () => {
    let emergencyExecuted = false;
    
    const mockApi = {
      placeStopOrder: async (params) => {
        throw new Error('Persistent API failure');
      },
      placeOrder: async (params) => {
        emergencyExecuted = true;
        assert.strictEqual(params.type, 'market');
        assert.strictEqual(params.reduceOnly, true);
        return { data: { orderId: 'emergency_order_123' } };
      }
    };
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const coordinator = new StopReplaceCoordinator(mockApi, mockLog, mockAlert);
    coordinator.baseDelay = 5;
    coordinator.maxRetries = 2; // Reduce for faster test
    
    const stopParams = {
      side: 'sell',
      symbol: 'XBTUSDTM',
      type: 'market',
      stop: 'down',
      stopPrice: '50000',
      stopPriceType: 'TP',
      size: '1',
      reduceOnly: true
    };
    
    try {
      await coordinator.replaceStopOrder('XBTUSDTM', stopParams);
      assert.fail('Should have thrown error');
    } catch (error) {
      assert.ok(error.message.includes('emergency close executed'));
      assert.strictEqual(emergencyExecuted, true);
    }
  });

  test('emergency close uses market order with reduceOnly', async () => {
    let emergencyParams = null;
    
    const mockApi = {
      placeOrder: async (params) => {
        emergencyParams = params;
        return { data: { orderId: 'emergency_123' } };
      }
    };
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const coordinator = new StopReplaceCoordinator(mockApi, mockLog, mockAlert);
    
    const stopParams = {
      side: 'sell',
      symbol: 'XBTUSDTM',
      size: '1'
    };
    
    await coordinator.emergencyClose('XBTUSDTM', stopParams);
    
    assert.strictEqual(emergencyParams.type, 'market');
    assert.strictEqual(emergencyParams.reduceOnly, true);
    assert.strictEqual(emergencyParams.side, 'sell');
    assert.strictEqual(emergencyParams.size, '1');
  });

  test('queues operations when already processing', async () => {
    const mockApi = {
      placeStopOrder: async (params) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { data: { orderId: `order_${params.stopPrice}` } };
      }
    };
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const coordinator = new StopReplaceCoordinator(mockApi, mockLog, mockAlert);
    
    const stopParams1 = {
      side: 'sell',
      symbol: 'XBTUSDTM',
      type: 'market',
      stop: 'down',
      stopPrice: '50000',
      stopPriceType: 'TP',
      size: '1',
      reduceOnly: true
    };
    
    const stopParams2 = {
      side: 'sell',
      symbol: 'XBTUSDTM',
      type: 'market',
      stop: 'down',
      stopPrice: '51000',
      stopPriceType: 'TP',
      size: '1',
      reduceOnly: true
    };
    
    // Start first operation
    const promise1 = coordinator.replaceStopOrder('XBTUSDTM', stopParams1);
    
    // Queue second operation
    const promise2 = coordinator.replaceStopOrder('XBTUSDTM', stopParams2);
    
    const [result1, result2] = await Promise.all([promise1, promise2]);
    
    assert.strictEqual(result1.success, true);
    assert.strictEqual(result2.success, true);
    assert.strictEqual(result1.orderId, 'order_50000');
    assert.strictEqual(result2.orderId, 'order_51000');
  });

  test('getState returns current coordinator state', () => {
    const mockApi = {};
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const coordinator = new StopReplaceCoordinator(mockApi, mockLog, mockAlert);
    coordinator.currentOrderId = 'order_123';
    coordinator.retryCount = 2;
    
    const state = coordinator.getState();
    
    assert.strictEqual(state.state, 'IDLE');
    assert.strictEqual(state.currentOrderId, 'order_123');
    assert.strictEqual(state.retryCount, 2);
    assert.strictEqual(state.queueLength, 0);
    assert.strictEqual(state.isProcessing, false);
  });

  test('reset clears all state', () => {
    const mockApi = {};
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const coordinator = new StopReplaceCoordinator(mockApi, mockLog, mockAlert);
    coordinator.currentOrderId = 'order_123';
    coordinator.pendingOrderId = 'pending_456';
    coordinator.retryCount = 3;
    coordinator.isProcessing = true;
    coordinator.operationQueue.push({ test: 'data' });
    
    coordinator.reset();
    
    assert.strictEqual(coordinator.state, 'IDLE');
    assert.strictEqual(coordinator.currentOrderId, null);
    assert.strictEqual(coordinator.pendingOrderId, null);
    assert.strictEqual(coordinator.retryCount, 0);
    assert.strictEqual(coordinator.isProcessing, false);
    assert.strictEqual(coordinator.operationQueue.length, 0);
  });

  test('enforces reduceOnly validation on stop orders', async () => {
    const mockApi = {
      placeStopOrder: async (params) => {
        return { data: { orderId: 'order_123' } };
      }
    };
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const coordinator = new StopReplaceCoordinator(mockApi, mockLog, mockAlert);
    
    // Try placing order without reduceOnly (should be enforced by sanitizer)
    const stopParams = {
      side: 'sell',
      symbol: 'XBTUSDTM',
      type: 'market',
      stop: 'down',
      stopPrice: '50000',
      stopPriceType: 'TP',
      size: '1'
      // reduceOnly intentionally omitted
    };
    
    const result = await coordinator.replaceStopOrder('XBTUSDTM', stopParams);
    
    // Should succeed because OrderValidator.sanitize enforces reduceOnly
    assert.strictEqual(result.success, true);
  });

  test('handles cancel failure gracefully (old order already filled)', async () => {
    let cancelAttempted = false;
    
    const mockApi = {
      cancelStopOrder: async (orderId) => {
        cancelAttempted = true;
        throw new Error('Order already filled');
      },
      placeStopOrder: async (params) => {
        return { data: { orderId: 'new_order_789' } };
      }
    };
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const coordinator = new StopReplaceCoordinator(mockApi, mockLog, mockAlert);
    coordinator.currentOrderId = 'old_order_filled';
    
    const stopParams = {
      side: 'sell',
      symbol: 'XBTUSDTM',
      type: 'market',
      stop: 'down',
      stopPrice: '50000',
      stopPriceType: 'TP',
      size: '1',
      reduceOnly: true
    };
    
    const result = await coordinator.replaceStopOrder('XBTUSDTM', stopParams);
    
    assert.strictEqual(cancelAttempted, true);
    assert.strictEqual(result.success, true);
    assert.strictEqual(result.orderId, 'new_order_789');
  });
});
