/**
 * WalkForward - Walk-Forward Validation with Purged Splits
 * 
 * Implements walk-forward testing to prevent overfitting.
 * Uses purged/embargoed splits to prevent information leakage.
 * 
 * Features:
 * - Time-series aware splitting
 * - Purged gaps between train/test
 * - Minimum trades per fold validation
 * - Regime-aware evaluation
 * - Fold stability metrics
 */

const BacktestEngine = require('./engine');

class WalkForward {
  constructor(config = {}) {
    this.config = {
      nFolds: config.nFolds || 5,
      trainPercent: config.trainPercent || 0.7,
      purgePercent: config.purgePercent || 0.05, // Gap between train/test
      minTradesPerFold: config.minTradesPerFold || 10,
      ...config
    };
  }

  /**
   * Split data into walk-forward folds
   * @param {Array} candles - All candles
   * @returns {Array} - Array of {train, test} fold pairs
   */
  createFolds(candles) {
    const folds = [];
    const totalLength = candles.length;
    const foldSize = Math.floor(totalLength / this.config.nFolds);
    const trainSize = Math.floor(foldSize * this.config.trainPercent);
    const purgeSize = Math.floor(foldSize * this.config.purgePercent);

    for (let i = 0; i < this.config.nFolds; i++) {
      const startIdx = i * foldSize;
      const trainEndIdx = startIdx + trainSize;
      const purgeEndIdx = trainEndIdx + purgeSize;
      const testEndIdx = Math.min(startIdx + foldSize, totalLength);

      // Skip if test set is too small
      if (purgeEndIdx >= testEndIdx) continue;

      folds.push({
        fold: i + 1,
        train: candles.slice(startIdx, trainEndIdx),
        purge: candles.slice(trainEndIdx, purgeEndIdx),
        test: candles.slice(purgeEndIdx, testEndIdx),
        trainStart: candles[startIdx].time,
        trainEnd: candles[trainEndIdx - 1].time,
        testStart: candles[purgeEndIdx].time,
        testEnd: candles[testEndIdx - 1].time
      });
    }

    return folds;
  }

  /**
   * Run walk-forward validation
   * @param {Array} candles - All candles
   * @param {Object} indicators - Indicator data
   * @param {Object} config - Backtest config
   * @returns {Object} - Walk-forward results
   */
  async run(candles, indicators, config) {
    const folds = this.createFolds(candles);
    const foldResults = [];

    console.log(`Running walk-forward with ${folds.length} folds...`);

    for (const fold of folds) {
      console.log(`\nFold ${fold.fold}:`);
      console.log(`  Train: ${new Date(fold.trainStart).toISOString()} to ${new Date(fold.trainEnd).toISOString()}`);
      console.log(`  Test:  ${new Date(fold.testStart).toISOString()} to ${new Date(fold.testEnd).toISOString()}`);

      // Run backtest on test set
      const engine = new BacktestEngine(config);
      const results = await engine.run(fold.test, indicators);

      // Validate minimum trades
      if (results.totalTrades < this.config.minTradesPerFold) {
        console.log(`  ⚠️  Only ${results.totalTrades} trades (minimum ${this.config.minTradesPerFold})`);
      }

      foldResults.push({
        fold: fold.fold,
        ...results,
        trainPeriod: { start: fold.trainStart, end: fold.trainEnd },
        testPeriod: { start: fold.testStart, end: fold.testEnd }
      });

      console.log(`  Trades: ${results.totalTrades}, Win Rate: ${results.winRate.toFixed(2)}%, Return: ${results.returnPercent.toFixed(2)}%`);
    }

    return this.aggregateResults(foldResults);
  }

  /**
   * Aggregate results across folds
   * @param {Array} foldResults - Results from each fold
   * @returns {Object} - Aggregated results
   */
  aggregateResults(foldResults) {
    const validFolds = foldResults.filter(f => f.totalTrades >= this.config.minTradesPerFold);
    
    if (validFolds.length === 0) {
      return {
        valid: false,
        reason: 'No folds met minimum trade requirement',
        foldResults
      };
    }

    // Calculate metrics across folds
    const avgReturn = validFolds.reduce((sum, f) => sum + f.returnPercent, 0) / validFolds.length;
    const avgWinRate = validFolds.reduce((sum, f) => sum + f.winRate, 0) / validFolds.length;
    const avgProfitFactor = validFolds.reduce((sum, f) => sum + f.profitFactor, 0) / validFolds.length;
    const avgMaxDrawdown = validFolds.reduce((sum, f) => sum + f.maxDrawdown, 0) / validFolds.length;
    const avgTrades = validFolds.reduce((sum, f) => sum + f.totalTrades, 0) / validFolds.length;

    // Calculate stability (consistency across folds)
    const returnStdDev = this.calculateStdDev(validFolds.map(f => f.returnPercent));
    const winRateStdDev = this.calculateStdDev(validFolds.map(f => f.winRate));
    
    const stability = 1 - (returnStdDev / (Math.abs(avgReturn) + 1)); // Higher is more stable
    const consistentWins = winRateStdDev < 10; // Win rate variance < 10%

    // Calculate worst fold performance
    const worstFold = validFolds.reduce((worst, f) => 
      f.returnPercent < worst.returnPercent ? f : worst
    );

    return {
      valid: true,
      nFolds: foldResults.length,
      validFolds: validFolds.length,
      avgReturn,
      avgWinRate,
      avgProfitFactor,
      avgMaxDrawdown,
      avgTrades,
      returnStdDev,
      winRateStdDev,
      stability,
      consistentWins,
      worstFold: {
        fold: worstFold.fold,
        returnPercent: worstFold.returnPercent,
        winRate: worstFold.winRate,
        trades: worstFold.totalTrades
      },
      foldResults
    };
  }

  /**
   * Calculate standard deviation
   * @param {Array} values - Array of numbers
   * @returns {number} - Standard deviation
   */
  calculateStdDev(values) {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    const variance = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    return Math.sqrt(variance);
  }

  /**
   * Analyze regime performance
   * @param {Array} foldResults - Results from each fold
   * @param {Object} regimeData - Regime data per fold (trend/range, volatility)
   * @returns {Object} - Regime breakdown
   */
  analyzeRegimes(foldResults, regimeData) {
    const trendFolds = foldResults.filter((f, i) => regimeData[i]?.regime === 'trend');
    const rangeFolds = foldResults.filter((f, i) => regimeData[i]?.regime === 'range');
    const highVolFolds = foldResults.filter((f, i) => regimeData[i]?.volatility === 'high');
    const lowVolFolds = foldResults.filter((f, i) => regimeData[i]?.volatility === 'low');

    return {
      trend: this.aggregateRegimeResults(trendFolds),
      range: this.aggregateRegimeResults(rangeFolds),
      highVol: this.aggregateRegimeResults(highVolFolds),
      lowVol: this.aggregateRegimeResults(lowVolFolds)
    };
  }

  /**
   * Aggregate results for a specific regime
   * @param {Array} folds - Fold results
   * @returns {Object} - Aggregated regime results
   */
  aggregateRegimeResults(folds) {
    if (folds.length === 0) {
      return { count: 0 };
    }

    return {
      count: folds.length,
      avgReturn: folds.reduce((sum, f) => sum + f.returnPercent, 0) / folds.length,
      avgWinRate: folds.reduce((sum, f) => sum + f.winRate, 0) / folds.length,
      avgProfitFactor: folds.reduce((sum, f) => sum + f.profitFactor, 0) / folds.length
    };
  }
}

module.exports = WalkForward;
