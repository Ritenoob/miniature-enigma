// ============================================================================
// StopOrderStateMachine.js - State Machine for Stop Order Protection
// ============================================================================

/**
 * State Machine for managing stop order updates safely
 * 
 * States:
 * - PROTECTED: Position has an active stop order
 * - UPDATING: Stop order is being replaced
 * - UNPROTECTED: Stop order failed, position at risk
 * - RECOVERING: Attempting to re-establish protection
 * - CRITICAL: All recovery attempts failed, manual intervention needed
 */
class StopOrderStateMachine {
  constructor(positionManager, api, broadcastLog, broadcastAlert) {
    this.positionManager = positionManager;
    this.api = api;
    this.broadcastLog = broadcastLog;
    this.broadcastAlert = broadcastAlert;
    
    this.state = 'PROTECTED';
    this.currentOrderId = null;
    this.pendingOrderId = null;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.updateQueue = [];
    this.isProcessing = false;
  }

  /**
   * Update stop order with safe state transitions
   * Places new stop BEFORE canceling old one to prevent exposure
   */
  async updateStop(newStopPrice, stopParams) {
    // If already updating, queue this request
    if (this.isProcessing) {
      this.updateQueue.push({ newStopPrice, stopParams });
      return { queued: true, message: 'Update queued' };
    }

    this.isProcessing = true;
    this.state = 'UPDATING';

    try {
      // Step 1: Place NEW stop order FIRST (before canceling old)
      this.broadcastLog('info', `[${this.positionManager.symbol}] Placing new stop order at ${newStopPrice.toFixed(2)}`);
      const newOrder = await this.api.placeStopOrder(stopParams);
      
      if (!newOrder.data || !newOrder.data.orderId) {
        throw new Error('Failed to place new stop order');
      }
      
      this.pendingOrderId = newOrder.data.orderId;
      this.broadcastLog('success', `[${this.positionManager.symbol}] New stop order placed: ${this.pendingOrderId}`);

      // Step 2: Only cancel old order after new one is confirmed
      if (this.currentOrderId) {
        try {
          await this.api.cancelStopOrder(this.currentOrderId);
          this.broadcastLog('info', `[${this.positionManager.symbol}] Old stop order cancelled: ${this.currentOrderId}`);
        } catch (cancelError) {
          // Old order might already be filled or cancelled - this is acceptable
          this.broadcastLog('warn', `[${this.positionManager.symbol}] Could not cancel old stop: ${cancelError.message}`);
        }
      }

      // Step 3: Transition to protected state
      this.currentOrderId = this.pendingOrderId;
      this.pendingOrderId = null;
      this.state = 'PROTECTED';
      this.retryCount = 0;
      this.isProcessing = false;

      // Process queued updates if any
      if (this.updateQueue.length > 0) {
        const queued = this.updateQueue.shift();
        setImmediate(() => this.updateStop(queued.newStopPrice, queued.stopParams));
      }

      return { success: true, orderId: this.currentOrderId, state: this.state };

    } catch (error) {
      this.broadcastLog('error', `[${this.positionManager.symbol}] Stop update failed: ${error.message}`);
      this.state = 'UNPROTECTED';
      this.isProcessing = false;
      
      // Start recovery process
      setImmediate(() => this.startRecovery(newStopPrice, stopParams));
      
      throw error;
    }
  }

  /**
   * Recovery process with exponential backoff
   */
  async startRecovery(targetStopPrice, stopParams) {
    if (this.state === 'RECOVERING') {
      // Already recovering
      return;
    }

    this.state = 'RECOVERING';
    this.broadcastLog('warn', `[${this.positionManager.symbol}] Entering recovery mode`);

    while (this.retryCount < this.maxRetries && this.state === 'RECOVERING') {
      this.retryCount++;
      const delay = 1000 * Math.pow(2, this.retryCount); // Exponential backoff
      
      this.broadcastLog('info', `[${this.positionManager.symbol}] Recovery attempt ${this.retryCount}/${this.maxRetries} in ${delay}ms`);
      await this.sleep(delay);

      try {
        const order = await this.api.placeStopOrder(stopParams);
        
        if (order.data && order.data.orderId) {
          this.currentOrderId = order.data.orderId;
          this.state = 'PROTECTED';
          this.retryCount = 0;
          
          this.broadcastAlert('recovery', `✓ Stop order recovered for ${this.positionManager.symbol}`);
          this.broadcastLog('success', `[${this.positionManager.symbol}] Stop order recovered: ${this.currentOrderId}`);
          return;
        }
      } catch (error) {
        this.broadcastLog('error', `[${this.positionManager.symbol}] Recovery attempt ${this.retryCount} failed: ${error.message}`);
      }
    }

    // Critical failure - notify user
    this.state = 'CRITICAL';
    const criticalMsg = `⚠️ CRITICAL: ${this.positionManager.symbol} stop order failed after ${this.maxRetries} attempts. Manual intervention required!`;
    
    this.broadcastAlert('critical', criticalMsg);
    this.broadcastLog('error', `[${this.positionManager.symbol}] ${criticalMsg}`);
  }

  /**
   * Get current state for persistence
   */
  getState() {
    return {
      state: this.state,
      currentOrderId: this.currentOrderId,
      pendingOrderId: this.pendingOrderId,
      retryCount: this.retryCount,
      queueLength: this.updateQueue.length
    };
  }

  /**
   * Restore state from persistence
   */
  restoreState(savedState) {
    if (savedState) {
      this.state = savedState.state || 'PROTECTED';
      this.currentOrderId = savedState.currentOrderId || null;
      this.pendingOrderId = savedState.pendingOrderId || null;
      this.retryCount = savedState.retryCount || 0;
    }
  }

  /**
   * Check if position is currently protected
   */
  isProtected() {
    return this.state === 'PROTECTED' || this.state === 'UPDATING';
  }

  /**
   * Check if position needs immediate attention
   */
  needsAttention() {
    return this.state === 'UNPROTECTED' || this.state === 'CRITICAL';
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = StopOrderStateMachine;
