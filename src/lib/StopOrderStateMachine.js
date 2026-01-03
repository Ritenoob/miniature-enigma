// ============================================================================
// StopOrderStateMachine.js - State Machine for Stop Order Protection
// ============================================================================

const StopReplaceCoordinator = require('./StopReplaceCoordinator');

/**
 * State Machine for managing stop order updates safely
 * Now uses StopReplaceCoordinator for enhanced protection
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
    
    // Use StopReplaceCoordinator for safe replacements
    this.coordinator = new StopReplaceCoordinator(api, broadcastLog, broadcastAlert);
    
    this.state = 'PROTECTED';
    this.currentOrderId = null;
    this.pendingOrderId = null;
    this.retryCount = 0;
    this.maxRetries = 5;
    this.updateQueue = [];
    this.isProcessing = false;
  }

  /**
   * Update stop order with safe state transitions using coordinator
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
      this.broadcastLog('info', `[${this.positionManager.symbol}] Updating stop order to ${newStopPrice.toFixed(2)}`);
      
      // Set the current order ID in coordinator for cancel-replace flow
      this.coordinator.currentOrderId = this.currentOrderId;
      
      // Use coordinator for safe replacement
      const result = await this.coordinator.replaceStopOrder(
        this.positionManager.symbol, 
        stopParams
      );

      if (result.success) {
        // Update state machine with new order ID
        this.currentOrderId = result.orderId;
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
      } else {
        throw new Error(result.error || 'Stop order replacement failed');
      }

    } catch (error) {
      this.broadcastLog('error', `[${this.positionManager.symbol}] Stop update failed: ${error.message}`);
      
      // Coordinator handles retries and emergency close internally
      // If we reach here, it means emergency close was executed or max retries exceeded
      if (error.message.includes('emergency close executed')) {
        this.state = 'CRITICAL';
        this.broadcastAlert('critical', `⚠️ CRITICAL: ${this.positionManager.symbol} required emergency close. Position closed with market order.`);
      } else {
        this.state = 'UNPROTECTED';
        // Don't trigger recovery here - coordinator already handled retries
        // Recovery is only for backward compatibility or special cases
      }
      
      this.isProcessing = false;
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
      queueLength: this.updateQueue.length,
      coordinatorState: this.coordinator.getState()
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
      
      // Restore coordinator state
      if (savedState.coordinatorState && savedState.coordinatorState.currentOrderId) {
        this.coordinator.currentOrderId = savedState.coordinatorState.currentOrderId;
      }
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
