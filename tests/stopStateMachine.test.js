process.env.DEMO_MODE = 'true';
process.env.RUN_INTERVALS = 'false';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const StopOrderStateMachine = require('../src/lib/StopOrderStateMachine');

describe('StopOrderStateMachine', () => {
  
  test('initializes in PROTECTED state', () => {
    const mockPositionManager = { symbol: 'XBTUSDTM' };
    const mockApi = {};
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const stateMachine = new StopOrderStateMachine(mockPositionManager, mockApi, mockLog, mockAlert);
    
    assert.strictEqual(stateMachine.state, 'PROTECTED');
    assert.strictEqual(stateMachine.currentOrderId, null);
    assert.strictEqual(stateMachine.retryCount, 0);
  });

  test('queues updates when already processing', async () => {
    const mockPositionManager = { symbol: 'XBTUSDTM' };
    const mockApi = {
      placeStopOrder: async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { data: { orderId: 'test123' } };
      },
      cancelStopOrder: async () => ({ data: { success: true } })
    };
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const stateMachine = new StopOrderStateMachine(mockPositionManager, mockApi, mockLog, mockAlert);
    
    // Start first update
    const promise1 = stateMachine.updateStop(100, {
      symbol: 'XBTUSDTM',
      side: 'sell',
      type: 'market',
      stop: 'down',
      stopPrice: '100',
      stopPriceType: 'TP',
      size: '1',
      reduceOnly: true
    });
    
    // Try to start second update immediately
    const result2 = await stateMachine.updateStop(101, {
      symbol: 'XBTUSDTM',
      side: 'sell',
      type: 'market',
      stop: 'down',
      stopPrice: '101',
      stopPriceType: 'TP',
      size: '1',
      reduceOnly: true
    });
    
    assert.strictEqual(result2.queued, true);
    
    await promise1;
  });

  test('transitions to UNPROTECTED on failure', async () => {
    const mockPositionManager = { symbol: 'XBTUSDTM' };
    const mockApi = {
      placeStopOrder: async () => {
        throw new Error('API Error');
      },
      placeOrder: async () => {
        // Emergency close mock
        return { data: { orderId: 'emergency_order' } };
      }
    };
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const stateMachine = new StopOrderStateMachine(mockPositionManager, mockApi, mockLog, mockAlert);
    // Speed up retries for test
    stateMachine.coordinator.maxRetries = 2;
    stateMachine.coordinator.baseDelay = 10;
    
    try {
      await stateMachine.updateStop(100, {
        symbol: 'XBTUSDTM',
        side: 'sell',
        type: 'market',
        stop: 'down',
        stopPrice: '100',
        stopPriceType: 'TP',
        size: '1',
        reduceOnly: true
      });
      assert.fail('Should have thrown error');
    } catch (error) {
      // Will be CRITICAL because emergency close executed
      assert.ok(stateMachine.state === 'UNPROTECTED' || stateMachine.state === 'CRITICAL');
    }
  });

  test('successfully updates stop order', async () => {
    const mockPositionManager = { symbol: 'XBTUSDTM' };
    let orderCounter = 0;
    const mockApi = {
      placeStopOrder: async () => {
        orderCounter++;
        return { data: { orderId: `order_${orderCounter}` } };
      },
      cancelStopOrder: async () => ({ data: { success: true } })
    };
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const stateMachine = new StopOrderStateMachine(mockPositionManager, mockApi, mockLog, mockAlert);
    
    const result = await stateMachine.updateStop(100, {
      symbol: 'XBTUSDTM',
      side: 'sell',
      type: 'market',
      stop: 'down',
      stopPrice: '100',
      stopPriceType: 'TP',
      size: '1',
      reduceOnly: true
    });
    
    assert.strictEqual(result.success, true);
    assert.strictEqual(stateMachine.state, 'PROTECTED');
    assert.strictEqual(stateMachine.currentOrderId, 'order_1');
  });

  test('cancels old order after placing new one', async () => {
    const mockPositionManager = { symbol: 'XBTUSDTM' };
    let placedOrders = [];
    let cancelledOrders = [];
    
    const mockApi = {
      placeStopOrder: async (params) => {
        const orderId = `order_${placedOrders.length + 1}`;
        placedOrders.push(orderId);
        return { data: { orderId } };
      },
      cancelStopOrder: async (orderId) => {
        cancelledOrders.push(orderId);
        return { data: { success: true } };
      }
    };
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const stateMachine = new StopOrderStateMachine(mockPositionManager, mockApi, mockLog, mockAlert);
    
    // First update
    await stateMachine.updateStop(100, {
      symbol: 'XBTUSDTM',
      side: 'sell',
      type: 'market',
      stop: 'down',
      stopPrice: '100',
      stopPriceType: 'TP',
      size: '1',
      reduceOnly: true
    });
    
    assert.strictEqual(placedOrders.length, 1);
    assert.strictEqual(cancelledOrders.length, 0);
    
    // Second update
    await stateMachine.updateStop(101, {
      symbol: 'XBTUSDTM',
      side: 'sell',
      type: 'market',
      stop: 'down',
      stopPrice: '101',
      stopPriceType: 'TP',
      size: '1',
      reduceOnly: true
    });
    
    assert.strictEqual(placedOrders.length, 2);
    assert.strictEqual(cancelledOrders.length, 1);
    assert.strictEqual(cancelledOrders[0], 'order_1');
  });

  test('getState returns current state', () => {
    const mockPositionManager = { symbol: 'XBTUSDTM' };
    const mockApi = {};
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const stateMachine = new StopOrderStateMachine(mockPositionManager, mockApi, mockLog, mockAlert);
    stateMachine.currentOrderId = 'test123';
    stateMachine.retryCount = 2;
    
    const state = stateMachine.getState();
    
    assert.strictEqual(state.state, 'PROTECTED');
    assert.strictEqual(state.currentOrderId, 'test123');
    assert.strictEqual(state.retryCount, 2);
  });

  test('restoreState restores from persistence', () => {
    const mockPositionManager = { symbol: 'XBTUSDTM' };
    const mockApi = {};
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const stateMachine = new StopOrderStateMachine(mockPositionManager, mockApi, mockLog, mockAlert);
    
    const savedState = {
      state: 'UPDATING',
      currentOrderId: 'saved123',
      retryCount: 1
    };
    
    stateMachine.restoreState(savedState);
    
    assert.strictEqual(stateMachine.state, 'UPDATING');
    assert.strictEqual(stateMachine.currentOrderId, 'saved123');
    assert.strictEqual(stateMachine.retryCount, 1);
  });

  test('isProtected returns true for PROTECTED and UPDATING states', () => {
    const mockPositionManager = { symbol: 'XBTUSDTM' };
    const mockApi = {};
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const stateMachine = new StopOrderStateMachine(mockPositionManager, mockApi, mockLog, mockAlert);
    
    stateMachine.state = 'PROTECTED';
    assert.strictEqual(stateMachine.isProtected(), true);
    
    stateMachine.state = 'UPDATING';
    assert.strictEqual(stateMachine.isProtected(), true);
    
    stateMachine.state = 'UNPROTECTED';
    assert.strictEqual(stateMachine.isProtected(), false);
  });

  test('needsAttention returns true for UNPROTECTED and CRITICAL states', () => {
    const mockPositionManager = { symbol: 'XBTUSDTM' };
    const mockApi = {};
    const mockLog = () => {};
    const mockAlert = () => {};
    
    const stateMachine = new StopOrderStateMachine(mockPositionManager, mockApi, mockLog, mockAlert);
    
    stateMachine.state = 'UNPROTECTED';
    assert.strictEqual(stateMachine.needsAttention(), true);
    
    stateMachine.state = 'CRITICAL';
    assert.strictEqual(stateMachine.needsAttention(), true);
    
    stateMachine.state = 'PROTECTED';
    assert.strictEqual(stateMachine.needsAttention(), false);
  });
});
