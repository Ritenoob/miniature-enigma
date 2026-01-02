// ============================================================================
// TrailingStopPolicy.js - Strict Trailing Stop Logic for Optimizer
// ============================================================================
// Implements fee-adjusted break-even and profit-lock trailing behavior
// Compatible with production StopOrderStateMachine semantics

const DecimalMath = require('../lib/DecimalMath');

/**
 * Trailing stop policy for optimizer variants
 * Provides strict trailing logic that mirrors production behavior
 */
class TrailingStopPolicy {
  /**
   * Calculate the next stop price based on current ROI and trailing parameters
   * 
   * @param {Object} params - Trailing parameters
   * @param {string} params.side - 'long' or 'short'
   * @param {number} params.entryPrice - Entry price
   * @param {number} params.currentStop - Current stop loss price
   * @param {number} params.currentROI - Current ROI percentage (net, leveraged)
   * @param {number} params.lastROIStep - Last ROI step that triggered a trail
   * @param {number} params.leverage - Position leverage
   * @param {number} params.entryFeeRate - Entry fee rate (e.g., 0.0006)
   * @param {number} params.exitFeeRate - Exit fee rate (e.g., 0.0006)
   * @param {Object} params.config - Configuration object with trailing settings
   * @param {boolean} params.breakEvenArmed - Whether break-even has been triggered
   * 
   * @returns {Object} { newStopPrice, newLastROIStep, reason, breakEvenArmed }
   */
  static nextStop(params) {
    const {
      side,
      entryPrice,
      currentStop,
      currentROI,
      lastROIStep = 0,
      leverage,
      entryFeeRate = 0.0006,
      exitFeeRate = 0.0006,
      config = {},
      breakEvenArmed = false
    } = params;

    // Get config values with defaults
    const breakEvenBuffer = config.breakEvenBuffer || 0.1;
    const trailingStepPercent = config.trailingStepPercent || 0.15;
    const trailingMovePercent = config.trailingMovePercent || 0.05;
    const trailingMode = config.trailingMode || 'staircase';

    // Calculate fee-adjusted break-even ROI threshold
    const breakEvenROI = DecimalMath.calculateFeeAdjustedBreakEven(
      entryFeeRate,
      exitFeeRate,
      leverage,
      breakEvenBuffer
    );

    let newStopPrice = currentStop;
    let newLastROIStep = lastROIStep;
    let reason = 'no_change';
    let newBreakEvenArmed = breakEvenArmed;

    // Step 1: Check if we should move to break-even
    if (!breakEvenArmed && currentROI >= breakEvenROI) {
      // Move stop to entry price + small buffer (for long) or entry - buffer (for short)
      const bufferPercent = breakEvenBuffer / leverage / 100; // Convert ROI buffer to price percent
      
      if (side === 'long') {
        newStopPrice = entryPrice * (1 + bufferPercent);
        // Ensure we don't lower the stop
        if (newStopPrice > currentStop) {
          newBreakEvenArmed = true;
          reason = 'break_even';
        } else {
          // Keep current stop if it's already better
          newStopPrice = currentStop;
        }
      } else {
        newStopPrice = entryPrice * (1 - bufferPercent);
        // Ensure we don't raise the stop (for short)
        if (newStopPrice < currentStop) {
          newBreakEvenArmed = true;
          reason = 'break_even';
        } else {
          // Keep current stop if it's already better
          newStopPrice = currentStop;
        }
      }
    }
    
    // Step 2: After break-even, implement aggressive trailing
    if (breakEvenArmed && trailingMode === 'staircase') {
      // Calculate how many steps we've progressed
      const roiProgress = currentROI - breakEvenROI;
      const currentStep = Math.floor(roiProgress / trailingStepPercent);
      
      // If we've crossed a new step threshold
      if (currentStep > lastROIStep) {
        // Move stop closer by trailingMovePercent in favorable direction
        const movePercent = trailingMovePercent / 100;
        
        if (side === 'long') {
          // For long, move stop up (toward current price)
          const priceIncrease = entryPrice * (currentROI / leverage / 100);
          const targetStop = entryPrice + (priceIncrease * (1 - movePercent));
          
          // Only move stop up (never down)
          if (targetStop > currentStop) {
            newStopPrice = targetStop;
            newLastROIStep = currentStep;
            reason = 'trailing_step';
          }
        } else {
          // For short, move stop down (toward current price)
          const priceDecrease = entryPrice * (currentROI / leverage / 100);
          const targetStop = entryPrice - (priceDecrease * (1 - movePercent));
          
          // Only move stop down (never up) for short
          if (targetStop < currentStop) {
            newStopPrice = targetStop;
            newLastROIStep = currentStep;
            reason = 'trailing_step';
          }
        }
      }
    }

    // Validate stop movement is monotonic
    if (side === 'long' && newStopPrice < currentStop) {
      // For long, stop should never decrease
      newStopPrice = currentStop;
      reason = 'no_change';
    } else if (side === 'short' && newStopPrice > currentStop) {
      // For short, stop should never increase
      newStopPrice = currentStop;
      reason = 'no_change';
    }

    return {
      newStopPrice,
      newLastROIStep,
      reason,
      breakEvenArmed: newBreakEvenArmed
    };
  }

  /**
   * Calculate initial stop loss price based on ROI target
   * 
   * @param {string} side - 'long' or 'short'
   * @param {number} entryPrice - Entry price
   * @param {number} slROI - Stop loss ROI percentage
   * @param {number} leverage - Position leverage
   * @returns {number} Initial stop loss price
   */
  static calculateInitialStop(side, entryPrice, slROI, leverage) {
    return DecimalMath.calculateStopLossPrice(side, entryPrice, slROI, leverage);
  }

  /**
   * Validate trailing parameters
   * 
   * @param {Object} config - Configuration to validate
   * @throws {Error} If configuration is invalid
   */
  static validateConfig(config) {
    if (!config || typeof config !== 'object') {
      throw new Error('Config must be an object');
    }

    const {
      breakEvenBuffer = 0.1,
      trailingStepPercent = 0.15,
      trailingMovePercent = 0.05,
      trailingMode = 'staircase'
    } = config;

    if (breakEvenBuffer < 0 || breakEvenBuffer > 10) {
      throw new Error('breakEvenBuffer must be between 0 and 10');
    }

    if (trailingStepPercent < 0.01 || trailingStepPercent > 10) {
      throw new Error('trailingStepPercent must be between 0.01 and 10');
    }

    if (trailingMovePercent < 0.01 || trailingMovePercent > 10) {
      throw new Error('trailingMovePercent must be between 0.01 and 10');
    }

    const validModes = ['staircase', 'atr', 'dynamic'];
    if (!validModes.includes(trailingMode)) {
      throw new Error(`trailingMode must be one of: ${validModes.join(', ')}`);
    }
  }

  /**
   * Get default trailing configuration from ConfigSchema defaults
   * 
   * @returns {Object} Default configuration
   */
  static getDefaultConfig() {
    return {
      breakEvenBuffer: 0.1,
      trailingStepPercent: 0.15,
      trailingMovePercent: 0.05,
      trailingMode: 'staircase'
    };
  }
}

module.exports = TrailingStopPolicy;
