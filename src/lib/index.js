// ============================================================================
// src/lib/index.js - Module Exports
// ============================================================================

const DecimalMath = require('./DecimalMath');
const StopOrderStateMachine = require('./StopOrderStateMachine');
const OrderValidator = require('./OrderValidator');
const { ConfigSchema, validateConfig, validatePartialConfig, getSchemaDocumentation } = require('./ConfigSchema');
const SecureLogger = require('./SecureLogger');
const { TradingEventBus, getEventBus } = require('./EventBus');
const { PingBudgetManager, AdaptiveTokenBucket, WS_CONFIG } = require('./PingBudgetManager');

module.exports = {
  // Math utilities
  DecimalMath,

  // State machines
  StopOrderStateMachine,

  // Validation
  OrderValidator,
  ConfigSchema,
  validateConfig,
  validatePartialConfig,
  getSchemaDocumentation,

  // Logging
  SecureLogger,

  // Event system
  TradingEventBus,
  getEventBus,

  // Rate limiting
  PingBudgetManager,
  AdaptiveTokenBucket,
  WS_CONFIG
};
