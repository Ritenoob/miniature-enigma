// ============================================================================
// src/optimizer/index.js - Optimizer Module Exports
// ============================================================================

const ExecutionSimulator = require('./ExecutionSimulator');
const LiveOptimizerController = require('./LiveOptimizerController');
const TrailingStopPolicy = require('./TrailingStopPolicy');

module.exports = {
  // Execution simulation
  ExecutionSimulator,
  FILL_MODEL: ExecutionSimulator.FILL_MODEL,

  // Live optimizer
  LiveOptimizerController,
  OptimizerConfig: LiveOptimizerController.OptimizerConfig,
  TradingVariant: LiveOptimizerController.TradingVariant,

  // Trailing stop policy
  TrailingStopPolicy
};
