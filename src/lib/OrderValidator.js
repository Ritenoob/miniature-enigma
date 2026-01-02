// ============================================================================
// OrderValidator.js - Order Validation and Safety Enforcement
// ============================================================================

/**
 * Validation layer that ensures all exit orders are safe
 * Enforces reduceOnly flag and validates order parameters
 */
class OrderValidator {
  /**
   * Validate exit order parameters
   * @param {Object} params - Order parameters
   * @throws {Error} If validation fails
   */
  static validateExitOrder(params) {
    const errors = [];

    // Must have reduceOnly for exit orders
    if (!params.reduceOnly) {
      errors.push('Exit orders MUST have reduceOnly: true');
    }

    // Validate size is positive
    if (!params.size || parseFloat(params.size) <= 0) {
      errors.push('Order size must be positive');
    }

    // Validate symbol
    if (!params.symbol || typeof params.symbol !== 'string') {
      errors.push('Symbol is required');
    }

    // Validate side
    if (!params.side || !['buy', 'sell'].includes(params.side)) {
      errors.push('Side must be "buy" or "sell"');
    }

    // Validate stop price for stop orders
    if (params.stop && !params.stopPrice) {
      errors.push('Stop orders require stopPrice');
    }

    // Validate type
    if (!params.type || !['market', 'limit'].includes(params.type)) {
      errors.push('Type must be "market" or "limit"');
    }

    // Validate price for limit orders
    if (params.type === 'limit' && (!params.price || parseFloat(params.price) <= 0)) {
      errors.push('Limit orders require a positive price');
    }

    if (errors.length > 0) {
      throw new Error(`Order validation failed: ${errors.join(', ')}`);
    }

    return true;
  }

  /**
   * Enforce reduceOnly flag on order parameters
   * @param {Object} params - Order parameters
   * @returns {Object} Parameters with reduceOnly enforced
   */
  static enforceReduceOnly(params) {
    return { ...params, reduceOnly: true };
  }

  /**
   * Validate entry order parameters
   * @param {Object} params - Order parameters
   * @throws {Error} If validation fails
   */
  static validateEntryOrder(params) {
    const errors = [];

    // Entry orders should NOT have reduceOnly
    if (params.reduceOnly === true) {
      errors.push('Entry orders should not have reduceOnly: true');
    }

    // Validate size is positive
    if (!params.size || parseFloat(params.size) <= 0) {
      errors.push('Order size must be positive');
    }

    // Validate symbol
    if (!params.symbol || typeof params.symbol !== 'string') {
      errors.push('Symbol is required');
    }

    // Validate side
    if (!params.side || !['buy', 'sell'].includes(params.side)) {
      errors.push('Side must be "buy" or "sell"');
    }

    // Validate type
    if (!params.type || !['market', 'limit'].includes(params.type)) {
      errors.push('Type must be "market" or "limit"');
    }

    // Validate price for limit orders
    if (params.type === 'limit' && (!params.price || parseFloat(params.price) <= 0)) {
      errors.push('Limit orders require a positive price');
    }

    // Validate leverage
    if (params.leverage) {
      const lev = parseFloat(params.leverage);
      if (isNaN(lev) || lev < 1 || lev > 100) {
        errors.push('Leverage must be between 1 and 100');
      }
    }

    if (errors.length > 0) {
      throw new Error(`Order validation failed: ${errors.join(', ')}`);
    }

    return true;
  }

  /**
   * Validate stop order parameters
   * @param {Object} params - Stop order parameters
   * @throws {Error} If validation fails
   */
  static validateStopOrder(params) {
    const errors = [];

    // For exit stops, enforce reduceOnly
    if (!params.reduceOnly) {
      errors.push('Stop orders MUST have reduceOnly: true for safety');
    }

    // Validate stop direction
    if (!params.stop || !['up', 'down'].includes(params.stop)) {
      errors.push('Stop direction must be "up" or "down"');
    }

    // Validate stop price
    if (!params.stopPrice || parseFloat(params.stopPrice) <= 0) {
      errors.push('Stop price must be positive');
    }

    // Validate stop price type
    if (!params.stopPriceType) {
      errors.push('stopPriceType is required');
    }

    // Validate size
    if (!params.size || parseFloat(params.size) <= 0) {
      errors.push('Order size must be positive');
    }

    // Validate symbol
    if (!params.symbol || typeof params.symbol !== 'string') {
      errors.push('Symbol is required');
    }

    // Validate side
    if (!params.side || !['buy', 'sell'].includes(params.side)) {
      errors.push('Side must be "buy" or "sell"');
    }

    if (errors.length > 0) {
      throw new Error(`Stop order validation failed: ${errors.join(', ')}`);
    }

    return true;
  }

  /**
   * Sanitize order parameters to ensure safety
   * @param {Object} params - Order parameters
   * @param {string} orderType - 'entry', 'exit', or 'stop'
   * @returns {Object} Sanitized parameters
   */
  static sanitize(params, orderType = 'exit') {
    const sanitized = { ...params };

    // Ensure numeric values are strings for API
    if (sanitized.size) {
      sanitized.size = String(sanitized.size);
    }
    if (sanitized.price) {
      sanitized.price = String(sanitized.price);
    }
    if (sanitized.stopPrice) {
      sanitized.stopPrice = String(sanitized.stopPrice);
    }
    if (sanitized.leverage) {
      sanitized.leverage = String(sanitized.leverage);
    }

    // Enforce reduceOnly for exit and stop orders
    if (orderType === 'exit' || orderType === 'stop') {
      sanitized.reduceOnly = true;
    }

    // Add clientOid if not present
    if (!sanitized.clientOid) {
      sanitized.clientOid = `${orderType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    return sanitized;
  }
}

module.exports = OrderValidator;
