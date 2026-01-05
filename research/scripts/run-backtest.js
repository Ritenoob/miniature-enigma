#!/usr/bin/env node
/**
 * Run Backtest Script
 * 
 * Runs backtest on historical data with walk-forward validation.
 */

const BacktestEngine = require('../backtest/engine');
const WalkForward = require('../backtest/walkforward');
const Metrics = require('../backtest/metrics');
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
 * Run backtest
 */
async function runBacktest() {
  console.log('=== KuCoin Futures Backtest ===\n');

  // Configuration
  const config = {
    initialBalance: 10000,
    positionSizePercent: 1.0,
    leverage: 10,
    maxPositions: 5,
    fillModel: 'taker',
    slippagePercent: 0.02,
    makerFee: 0.0002,
    takerFee: 0.0006,
    initialSLROI: 0.5,
    initialTPROI: 2.0,
    breakEvenBuffer: 0.1,
    trailingStepPercent: 0.15,
    trailingMovePercent: 0.05,
    signalProfile: 'balanced',
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

  // Initialize walk-forward validator
  const walkForward = new WalkForward({
    nFolds: 5,
    trainPercent: 0.7,
    purgePercent: 0.05,
    minTradesPerFold: 10
  });

  // Note: For real implementation, you would need to calculate indicators
  // For now, we'll create a placeholder
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

  // Run walk-forward validation
  console.log('Running walk-forward validation...\n');
  const results = await walkForward.run(candles, indicators, config);

  if (!results.valid) {
    console.error('Walk-forward validation failed:', results.reason);
    process.exit(1);
  }

  // Calculate comprehensive metrics
  const allTrades = results.foldResults.flatMap(f => f.trades);
  const metrics = Metrics.calculate({
    ...results,
    trades: allTrades,
    initialBalance: config.initialBalance
  });

  // Display results
  console.log('\n=== Walk-Forward Results ===');
  console.log(`Valid Folds: ${results.validFolds}/${results.nFolds}`);
  console.log(`Avg Return: ${results.avgReturn.toFixed(2)}%`);
  console.log(`Avg Win Rate: ${results.avgWinRate.toFixed(2)}%`);
  console.log(`Avg Profit Factor: ${results.avgProfitFactor.toFixed(2)}`);
  console.log(`Avg Max Drawdown: ${results.avgMaxDrawdown.toFixed(2)}%`);
  console.log(`Stability: ${(results.stability * 100).toFixed(2)}%`);
  console.log(`\nWorst Fold:`);
  console.log(`  Fold #${results.worstFold.fold}`);
  console.log(`  Return: ${results.worstFold.returnPercent.toFixed(2)}%`);
  console.log(`  Win Rate: ${results.worstFold.winRate.toFixed(2)}%`);
  console.log(`  Trades: ${results.worstFold.trades}`);

  console.log(Metrics.format(metrics));

  // Save results
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportDir = path.join(__dirname, '../reports');
  await fs.mkdir(reportDir, { recursive: true });
  
  const reportPath = path.join(reportDir, `backtest_${timestamp}.json`);
  await fs.writeFile(reportPath, JSON.stringify({
    config,
    walkForward: results,
    metrics
  }, null, 2));

  console.log(`\n✓ Report saved to ${reportPath}`);
}

// Run if called directly
if (require.main === module) {
  runBacktest().catch(error => {
    console.error('Fatal error:', error);
    console.error(error.stack);
    process.exit(1);
  });
}

module.exports = { runBacktest };
