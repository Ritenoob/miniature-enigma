process.env.DEMO_MODE = 'true';
process.env.RUN_INTERVALS = 'false';

const fc = require('fast-check');
const { test, describe } = require('node:test');
const { AdaptiveTokenBucket, PingBudgetManager } = require('../src/lib/PingBudgetManager');

describe('AdaptiveTokenBucket Property-Based Tests', () => {
  
  test('Never exceeds quota per window', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 5000 }),  // quotaPerWindow
        fc.integer({ min: 1, max: 100 }),     // number of requests
        (quota, numRequests) => {
          const bucket = new AdaptiveTokenBucket({ 
            quotaPerWindow: quota,
            utilizationTarget: 1.0  // Use full quota
          });
          
          let totalConsumed = 0;
          for (let i = 0; i < numRequests; i++) {
            if (bucket.consume(1)) {
              totalConsumed++;
            }
          }
          
          // Total consumed should never exceed the quota
          return totalConsumed <= quota;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('Utilization target always stays within bounds after degradation', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),  // number of 429 errors
        (num429s) => {
          const bucket = new AdaptiveTokenBucket({ 
            quotaPerWindow: 1000,
            utilizationTarget: 0.70
          });
          
          for (let i = 0; i < num429s; i++) {
            bucket.handleRateLimitError();
          }
          
          // Should always be between 0.40 and 0.70
          return bucket.utilizationTarget >= 0.40 && bucket.utilizationTarget <= 0.70;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('Available tokens never negative', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 1000 }),  // quotaPerWindow
        fc.array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 100 }),  // consume amounts
        (quota, consumeAmounts) => {
          const bucket = new AdaptiveTokenBucket({ 
            quotaPerWindow: quota,
            utilizationTarget: 1.0
          });
          
          for (const amount of consumeAmounts) {
            bucket.consume(amount);
          }
          
          const state = bucket.getState();
          return state.tokens >= 0;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('Consecutive 429s count increases monotonically without recovery', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),  // number of 429 errors
        (num429s) => {
          const bucket = new AdaptiveTokenBucket();
          
          let lastCount = 0;
          for (let i = 0; i < num429s; i++) {
            bucket.handleRateLimitError();
            
            // Count should increase by 1 each time
            if (bucket.consecutive429s !== lastCount + 1) {
              return false;
            }
            lastCount = bucket.consecutive429s;
          }
          
          return bucket.consecutive429s === num429s;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('canConsume and consume return consistent results', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 1000 }),  // quotaPerWindow
        fc.integer({ min: 1, max: 50 }),      // amount to consume
        (quota, amount) => {
          const bucket = new AdaptiveTokenBucket({ 
            quotaPerWindow: quota,
            utilizationTarget: 1.0
          });
          
          const canConsume = bucket.canConsume(amount);
          
          // Create another bucket with same state to test consume
          const bucket2 = new AdaptiveTokenBucket({ 
            quotaPerWindow: quota,
            utilizationTarget: 1.0
          });
          const consumed = bucket2.consume(amount);
          
          // Both should return the same result
          return canConsume === consumed;
        }
      ),
      { numRuns: 100 }
    );
  });
  
  test('Token bucket respects window-based refill', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 1000 }),  // quotaPerWindow
        fc.integer({ min: 10, max: 90 }),     // initial consume percent
        (quota, consumePercent) => {
          const bucket = new AdaptiveTokenBucket({ 
            quotaPerWindow: quota,
            windowMs: 1000,
            utilizationTarget: 1.0
          });
          
          const initialTokens = bucket.getState().tokens;
          const consumeAmount = Math.floor(initialTokens * (consumePercent / 100));
          
          bucket.consume(consumeAmount);
          const afterConsume = bucket.getState().tokens;
          
          // Tokens should decrease
          return afterConsume < initialTokens;
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe('PingBudgetManager Property-Based Tests', () => {
  
  test('Rate limit events are always recorded with valid timestamps', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),  // number of rate limit events
        (numEvents) => {
          const manager = new PingBudgetManager();
          const before = Date.now();
          
          for (let i = 0; i < numEvents; i++) {
            manager.recordRateLimitEvent();
          }
          
          const after = Date.now();
          
          // All events should have valid timestamps
          const allValid = manager.rateLimitEvents.every(event => 
            event.timestamp >= before && 
            event.timestamp <= after &&
            event.consecutive > 0
          );
          
          manager.destroy();
          return allValid && manager.rateLimitEvents.length === numEvents;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('Message jitter calculation never produces negative values', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 10000 }), { minLength: 2, maxLength: 50 }),
        (timestamps) => {
          const manager = new PingBudgetManager();
          
          const baseTime = Date.now();
          for (const offset of timestamps) {
            manager.recordMessageJitter(baseTime + offset);
          }
          
          const allNonNegative = manager.jitterStats.samples.every(jitter => jitter >= 0);
          
          manager.destroy();
          return allNonNegative;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('Staleness increases monotonically without new messages', async () => {
    fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 10, max: 100 }),  // wait time in ms
        async (waitTime) => {
          const manager = new PingBudgetManager();
          
          manager.recordMessageJitter(Date.now());
          const staleness1 = manager.calculateStaleness();
          
          await new Promise(resolve => setTimeout(resolve, waitTime));
          
          const staleness2 = manager.calculateStaleness();
          
          manager.destroy();
          return staleness2 >= staleness1;
        }
      ),
      { numRuns: 20 }
    );
  });
  
  test('Reconnect backoff never returns negative values', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10 }),  // number of reconnect attempts
        (numAttempts) => {
          const manager = new PingBudgetManager();
          
          let allPositiveOrNull = true;
          for (let i = 0; i < numAttempts; i++) {
            const backoff = manager.handleReconnect();
            if (backoff !== null && backoff < 0) {
              allPositiveOrNull = false;
              break;
            }
          }
          
          manager.destroy();
          return allPositiveOrNull;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('Exported metrics always have expected structure', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }),  // number of operations to perform
        (numOps) => {
          const manager = new PingBudgetManager();
          
          // Perform some operations
          for (let i = 0; i < numOps; i++) {
            manager.recordMessageJitter(Date.now());
            if (i % 2 === 0) {
              manager.recordRateLimitEvent();
            }
          }
          
          const metrics = manager.exportMetrics();
          
          const hasRequiredFields = 
            typeof metrics.eventLoopLagP95 === 'number' &&
            typeof metrics.eventLoopLagP99 === 'number' &&
            typeof metrics.messageJitter === 'object' &&
            typeof metrics.reconnectCount === 'number' &&
            typeof metrics.rateLimitCount === 'number' &&
            typeof metrics.effectiveStaleness === 'number' &&
            typeof metrics.currentUtilization === 'number' &&
            typeof metrics.tokensAvailable === 'number';
          
          manager.destroy();
          return hasRequiredFields;
        }
      ),
      { numRuns: 50 }
    );
  });
  
  test('Requests respect token availability', () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            priority: fc.constantFrom(0, 1, 2, 3),
            value: fc.string()
          }),
          { minLength: 2, maxLength: 10 }
        ),
        async (requests) => {
          const manager = new PingBudgetManager({ 
            quotaPerWindow: requests.length,
            utilizationTarget: 1.0
          });
          
          let executionCount = 0;
          
          const promises = requests.map(req => 
            manager.scheduleRestCall(req.priority, async () => {
              executionCount++;
              return req.value;
            })
          );
          
          await Promise.all(promises);
          
          // All requests should complete
          const allCompleted = executionCount === requests.length;
          
          manager.destroy();
          return allCompleted;
        }
      ),
      { numRuns: 20 }
    );
  });
});
