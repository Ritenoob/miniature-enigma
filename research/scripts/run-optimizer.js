#!/usr/bin/env node
/**
 * Run Optimizer Script
 * 
 * Runs multi-objective optimization to find best strategy configurations.
 */

const Optimizer = require('../optimize/optimizer');
const fs = require('fs').promises;
const path = require('path');

/**
 * Load candle data
 * @param {string} symbol - Trading symbol
 * @param {string} timeframe - Timeframe
 * @returns {Array} - Candle data
 */
async function loadCandles(symbol, timeframe) {
  const filename = `${symbol}_${timeframe}.json`;
  const filepath = path.join(__dirname, '../data', filename);
  
  try {
    const data = await fs.readFile(filepath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading ${filename}:`, error.message);
    return [];
  }
}

/**
 * Run optimization
 */
async function runOptimization() {
  console.log('=== KuCoin Futures Strategy Optimization ===\n');

  // Configuration
  const config = {
    populationSize: 100,
    nGenerations: 20,
    nParallel: 4,
    objectives: ['return', 'sharpe', 'stability'],
    seed: 42
  };

  // Load data
  console.log('Loading data...');
  const candles = await loadCandles('XBTUSDTM', '1hour');
  
  if (candles.length === 0) {
    console.error('No data loaded. Run npm run research:fetch-ohlcv first.');
    process.exit(1);
  }

  console.log(`Loaded ${candles.length} candles\n`);

  // Create placeholder indicators
  const indicators = {};
  candles.forEach(candle => {
    indicators[candle.symbol] = {
      rsi: 50,
      williamsR: -50,
      macd: { histogram: 0 },
      ao: 0,
      ema50: candle.close,
      ema200: candle.close,
      bollinger: { upper: candle.close * 1.02, lower: candle.close * 0.98 },
      stochastic: { k: 50, d: 50 },
      atr: candle.close * 0.01,
      atrPercent: 1.0
    };
  });

  // Run optimization
  const optimizer = new Optimizer(config);
  const results = await optimizer.run(candles, indicators);

  // Display top 10 results
  console.log('\n=== Top 10 Configurations ===\n');
  results.top20.slice(0, 10).forEach((result, i) => {
    console.log(`${i + 1}. Return: ${result.metrics.returnPercent.toFixed(2)}%, ` +
                `Sharpe: ${result.metrics.sharpe.toFixed(2)}, ` +
                `Stability: ${(result.metrics.stability * 100).toFixed(2)}%`);
    console.log(`   Config: Size=${result.config.positionSizePercent.toFixed(2)}%, ` +
                `Leverage=${result.config.leverage}x, ` +
                `SL=${result.config.initialSLROI.toFixed(2)}%, ` +
                `TP=${result.config.initialTPROI.toFixed(2)}%`);
    console.log(`   Profile: ${result.config.signalProfile}\n`);
  });

  console.log(`\n✓ Optimization complete!`);
  console.log(`✓ Top 20 configs saved to research/configs/`);
  console.log(`✓ Pareto front saved`);
  console.log(`✓ CSV leaderboard saved`);
}

// Run if called directly
if (require.main === module) {
  runOptimization().catch(error => {
    console.error('Fatal error:', error);
    console.error(error.stack);
    process.exit(1);
  });
}

module.exports = { runOptimization };
