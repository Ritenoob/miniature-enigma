// ============================================================================
// StopReplaceCoordinator.js - Enhanced Stop Order Coordinator with Emergency Protection
// ============================================================================

const OrderValidator = require('./OrderValidator');

/**
 * Enhanced coordinator for safe stop order replacement
 * Implements cancel-then-place with retry policy and emergency protection
 *
 * States:
 * - IDLE: No operation in progress
 * - CANCELING: Canceling old stop order
 * - PLACING: Placing new stop order
 * - CONFIRMED: New stop order confirmed
 * - ERROR: Operation failed, retry or emergency needed
 */
class StopReplaceCoordinator {
  constructor(api, broadcastLog, broadcastAlert) {
    this.api = api;
    this.broadcastLog = broadcastLog;
    this.broadcastAlert = broadcastAlert;

    // State tracking
    this.state = 'IDLE';
    this.currentOrderId = null;
    this.pendingOrderId = null;

    // Retry configuration with jittered exponential backoff
    this.maxRetries = 5;
    this.baseDelay = 1000; // 1 second
    this.maxDelay = 30000; // 30 seconds
    this.retryCount = 0;

    // Operation queue for serialization
    this.operationQueue = [];
    this.isProcessing = false;
  }

  /**
   * Calculate jittered exponential backoff delay
   * Formula: min(maxDelay, baseDelay * 2^retry * (0.8 + random(0.4)))
   */
  calculateBackoffDelay(retryAttempt) {
    const exponentialDelay = this.baseDelay * Math.pow(2, retryAttempt);
    const jitter = 0.8 + Math.random() * 0.4; // Random between 0.8 and 1.2
    const jitteredDelay = exponentialDelay * jitter;
    return Math.min(jitteredDelay, this.maxDelay);
  }

  /**
   * Replace stop order using cancel-then-place strategy with protection
   * @param {string} symbol - Trading pair symbol
   * @param {Object} newStopParams - Parameters for new stop order
   * @returns {Promise<Object>} Result with success status and orderId
   */
  async replaceStopOrder(symbol, newStopParams) {
    // Queue operation if already processing
    if (this.isProcessing) {
      return new Promise((resolve) => {
        this.operationQueue.push({ symbol, newStopParams, resolve });
        this.broadcastLog('info', `[${symbol}] Stop order replacement queued`);
      });
    }

    this.isProcessing = true;
    this.state = 'IDLE';

    try {
      const result = await this._executeReplacement(symbol, newStopParams);
      this.isProcessing = false;

      // Process next queued operation
      this._processQueue();

      return result;
    } catch (error) {
      this.isProcessing = false;

      // Process next queued operation even on error
      this._processQueue();

      throw error;
    }
  }

  /**
   * Execute the replacement operation with retry logic
   */
  async _executeReplacement(symbol, newStopParams) {
    this.retryCount = 0;

    // Validate and sanitize new stop order params
    const sanitizedParams = OrderValidator.sanitize(newStopParams, 'stop');
    OrderValidator.validateStopOrder(sanitizedParams);

    // Retry loop with exponential backoff
    while (this.retryCount <= this.maxRetries) {
      try {
        // Step 1: Cancel old order (if exists)
        if (this.currentOrderId) {
          this.state = 'CANCELING';
          this.broadcastLog('info', `[${symbol}] Canceling old stop order: ${this.currentOrderId}`);

          try {
            await this.api.cancelStopOrder(this.currentOrderId);
            this.broadcastLog('success', `[${symbol}] Old stop order canceled: ${this.currentOrderId}`);
          } catch (cancelError) {
            // Old order might already be filled or canceled - acceptable
            this.broadcastLog('warn', `[${symbol}] Could not cancel old stop (may already be filled): ${cancelError.message}`);
          }
        }

        // Step 2: Place new stop order
        this.state = 'PLACING';
        this.broadcastLog('info', `[${symbol}] Placing new stop order at ${sanitizedParams.stopPrice}`);

        const result = await this.api.placeStopOrder(sanitizedParams);

        if (!result.data || !result.data.orderId) {
          throw new Error('API returned success but no orderId');
        }

        // Step 3: Confirm success
        this.state = 'CONFIRMED';
        this.pendingOrderId = result.data.orderId;
        this.currentOrderId = this.pendingOrderId;
        this.pendingOrderId = null;
        this.retryCount = 0;

        this.broadcastLog('success', `[${symbol}] Stop order placed successfully: ${this.currentOrderId}`);

        return {
          success: true,
          orderId: this.currentOrderId,
          state: this.state
        };

      } catch (error) {
        this.state = 'ERROR';
        this.retryCount++;

        const isRateLimited = error.message && (
          error.message.includes('429') ||
          error.message.includes('rate limit') ||
          error.message.includes('Too Many Requests')
        );

        this.broadcastLog('error', `[${symbol}] Stop order placement failed (attempt ${this.retryCount}/${this.maxRetries}): ${error.message}`);

        // If we've exhausted retries, trigger emergency close
        if (this.retryCount > this.maxRetries) {
          this.broadcastAlert('critical', `⚠️ CRITICAL: ${symbol} stop order failed after ${this.maxRetries} retries. Initiating emergency close.`);
          await this.emergencyClose(symbol, sanitizedParams);
          throw new Error(`Stop order failed after ${this.maxRetries} retries, emergency close executed`);
        }

        // Calculate backoff delay
        const backoffDelay = this.calculateBackoffDelay(this.retryCount - 1);

        this.broadcastLog('info', `[${symbol}] Retrying in ${(backoffDelay / 1000).toFixed(1)}s... ${isRateLimited ? '(rate limited)' : ''}`);

        await this.sleep(backoffDelay);
      }
    }

    // Should not reach here, but safety fallback
    throw new Error('Retry loop exited unexpectedly');
  }

  /**
   * Emergency close: Place protective MARKET reduceOnly order
   * This is the last resort when all stop order placements fail
   */
  async emergencyClose(symbol, stopParams) {
    this.broadcastLog('warn', `[${symbol}] EMERGENCY CLOSE: Placing protective market order`);

    try {
      // Build emergency market order with reduceOnly
      const emergencyParams = {
        clientOid: `emergency_${symbol}_${Date.now()}`,
        side: stopParams.side,
        symbol: symbol,
        type: 'market',
        size: stopParams.size,
        reduceOnly: true
      };

      // Validate and sanitize
      const sanitizedEmergency = OrderValidator.sanitize(emergencyParams, 'exit');
      OrderValidator.validateExitOrder(sanitizedEmergency);

      // Place emergency market order
      const result = await this.api.placeOrder(sanitizedEmergency);

      if (result.data && result.data.orderId) {
        this.broadcastAlert('emergency', `✓ Emergency market order placed for ${symbol}: ${result.data.orderId}`);
        this.broadcastLog('success', `[${symbol}] Emergency close executed: ${result.data.orderId}`);

        return {
          success: true,
          orderId: result.data.orderId,
          type: 'emergency_market'
        };
      } else {
        throw new Error('Emergency order placement failed');
      }
    } catch (error) {
      const criticalMsg = `⚠️⚠️ CRITICAL: ${symbol} emergency close FAILED. Position unprotected! Manual intervention required immediately!`;
      this.broadcastAlert('critical', criticalMsg);
      this.broadcastLog('error', `[${symbol}] Emergency close failed: ${error.message}`);

      throw new Error(`Emergency close failed: ${error.message}`);
    }
  }

  /**
   * Process next operation in queue
   */
  _processQueue() {
    if (this.operationQueue.length > 0) {
      const nextOp = this.operationQueue.shift();
      this.replaceStopOrder(nextOp.symbol, nextOp.newStopParams)
        .then(result => nextOp.resolve(result))
        .catch(error => nextOp.resolve({ success: false, error: error.message }));
    }
  }

  /**
   * Get current state for monitoring
   */
  getState() {
    return {
      state: this.state,
      currentOrderId: this.currentOrderId,
      pendingOrderId: this.pendingOrderId,
      retryCount: this.retryCount,
      queueLength: this.operationQueue.length,
      isProcessing: this.isProcessing
    };
  }

  /**
   * Reset coordinator state (use with caution)
   */
  reset() {
    this.state = 'IDLE';
    this.currentOrderId = null;
    this.pendingOrderId = null;
    this.retryCount = 0;
    this.isProcessing = false;
    this.operationQueue = [];
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = StopReplaceCoordinator;
