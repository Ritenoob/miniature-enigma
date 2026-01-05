/**
 * Metrics - Backtest Performance Metrics
 * 
 * Comprehensive metrics for evaluating trading strategies.
 * 
 * Metrics:
 * - Return and profit/loss
 * - Win rate and profit factor
 * - Risk metrics (Sharpe, Sortino, max drawdown)
 * - Expectancy and R-multiples
 * - Tail loss analysis
 * - Stability and consistency
 */

class Metrics {
  /**
   * Calculate all metrics for backtest results
   * @param {Object} results - Backtest results
   * @returns {Object} - Comprehensive metrics
   */
  static calculate(results) {
    const trades = results.trades || [];
    
    return {
      ...this.calculateReturns(results),
      ...this.calculateWinMetrics(trades),
      ...this.calculateRiskMetrics(trades, results.initialBalance),
      ...this.calculateExpectancy(trades),
      ...this.calculateTailRisk(trades),
      ...this.calculateDrawdown(results),
      ...this.calculateStability(trades)
    };
  }

  /**
   * Calculate return metrics
   * @param {Object} results - Backtest results
   * @returns {Object} - Return metrics
   */
  static calculateReturns(results) {
    return {
      totalNetPnl: results.totalNetPnl,
      totalGrossPnl: results.totalGrossPnl,
      totalFees: results.totalFees,
      returnPercent: results.returnPercent,
      returnPerTrade: results.totalTrades > 0 
        ? results.totalNetPnl / results.totalTrades 
        : 0
    };
  }

  /**
   * Calculate win rate metrics
   * @param {Array} trades - Array of trades
   * @returns {Object} - Win metrics
   */
  static calculateWinMetrics(trades) {
    const wins = trades.filter(t => t.netPnl > 0);
    const losses = trades.filter(t => t.netPnl < 0);
    
    const avgWin = wins.length > 0 
      ? wins.reduce((sum, t) => sum + t.netPnl, 0) / wins.length 
      : 0;
    const avgLoss = losses.length > 0
      ? losses.reduce((sum, t) => sum + t.netPnl, 0) / losses.length
      : 0;
    
    const profitFactor = losses.length > 0 && avgLoss !== 0
      ? Math.abs(wins.reduce((sum, t) => sum + t.netPnl, 0)) / 
        Math.abs(losses.reduce((sum, t) => sum + t.netPnl, 0))
      : 0;

    return {
      totalTrades: trades.length,
      winningTrades: wins.length,
      losingTrades: losses.length,
      winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
      avgWin,
      avgLoss,
      profitFactor,
      payoffRatio: avgLoss !== 0 ? avgWin / Math.abs(avgLoss) : 0
    };
  }

  /**
   * Calculate risk metrics
   * @param {Array} trades - Array of trades
   * @param {number} initialBalance - Initial balance
   * @returns {Object} - Risk metrics
   */
  static calculateRiskMetrics(trades, initialBalance) {
    if (trades.length === 0) {
      return {
        sharpeRatio: 0,
        sortinoRatio: 0,
        calmarRatio: 0
      };
    }

    // Calculate returns per trade
    const returns = trades.map(t => (t.netPnl / initialBalance) * 100);
    const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    
    // Standard deviation of returns
    const stdDev = Math.sqrt(
      returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
    );

    // Downside deviation (only negative returns)
    const negativeReturns = returns.filter(r => r < 0);
    const downsideDev = negativeReturns.length > 0
      ? Math.sqrt(
          negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length
        )
      : 0;

    // Sharpe Ratio (assuming 0% risk-free rate)
    const sharpeRatio = stdDev !== 0 ? avgReturn / stdDev : 0;

    // Sortino Ratio (penalizes only downside volatility)
    const sortinoRatio = downsideDev !== 0 ? avgReturn / downsideDev : 0;

    return {
      sharpeRatio,
      sortinoRatio,
      volatility: stdDev,
      downsideVolatility: downsideDev
    };
  }

  /**
   * Calculate expectancy
   * @param {Array} trades - Array of trades
   * @returns {Object} - Expectancy metrics
   */
  static calculateExpectancy(trades) {
    if (trades.length === 0) {
      return { expectancy: 0, rMultiple: 0 };
    }

    const wins = trades.filter(t => t.netPnl > 0);
    const losses = trades.filter(t => t.netPnl < 0);
    
    const winRate = wins.length / trades.length;
    const lossRate = losses.length / trades.length;
    
    const avgWin = wins.length > 0 
      ? wins.reduce((sum, t) => sum + t.netPnl, 0) / wins.length 
      : 0;
    const avgLoss = losses.length > 0
      ? losses.reduce((sum, t) => sum + t.netPnl, 0) / losses.length
      : 0;

    // Expectancy = (Win% × AvgWin) - (Loss% × |AvgLoss|)
    const expectancy = (winRate * avgWin) + (lossRate * avgLoss);

    // R-Multiple (expectancy as multiple of average risk)
    const avgRisk = Math.abs(avgLoss);
    const rMultiple = avgRisk !== 0 ? expectancy / avgRisk : 0;

    return {
      expectancy,
      rMultiple
    };
  }

  /**
   * Calculate tail risk metrics
   * @param {Array} trades - Array of trades
   * @returns {Object} - Tail risk metrics
   */
  static calculateTailRisk(trades) {
    if (trades.length === 0) {
      return {
        maxLoss: 0,
        maxWin: 0,
        worstLosses: [],
        bestWins: []
      };
    }

    const pnls = trades.map(t => t.netPnl).sort((a, b) => a - b);
    const maxLoss = pnls[0];
    const maxWin = pnls[pnls.length - 1];

    // Worst 5 losses
    const worstLosses = pnls.filter(p => p < 0).slice(0, 5);

    // Best 5 wins
    const bestWins = pnls.filter(p => p > 0).slice(-5).reverse();

    return {
      maxLoss,
      maxWin,
      worstLosses,
      bestWins,
      tailRatio: maxLoss !== 0 ? maxWin / Math.abs(maxLoss) : 0
    };
  }

  /**
   * Calculate drawdown metrics
   * @param {Object} results - Backtest results
   * @returns {Object} - Drawdown metrics
   */
  static calculateDrawdown(results) {
    return {
      maxDrawdown: results.maxDrawdown,
      calmarRatio: results.maxDrawdown !== 0 
        ? results.returnPercent / results.maxDrawdown 
        : 0
    };
  }

  /**
   * Calculate stability metrics
   * @param {Array} trades - Array of trades
   * @returns {Object} - Stability metrics
   */
  static calculateStability(trades) {
    if (trades.length < 2) {
      return {
        consistency: 0,
        streakStats: { maxWinStreak: 0, maxLossStreak: 0 }
      };
    }

    // Calculate rolling average of returns
    const windowSize = Math.min(10, trades.length);
    const rollingAvgs = [];
    
    for (let i = 0; i <= trades.length - windowSize; i++) {
      const window = trades.slice(i, i + windowSize);
      const avg = window.reduce((sum, t) => sum + t.netPnl, 0) / windowSize;
      rollingAvgs.push(avg);
    }

    // Consistency: lower variance in rolling averages = more consistent
    const avgOfAvgs = rollingAvgs.reduce((sum, a) => sum + a, 0) / rollingAvgs.length;
    const variance = rollingAvgs.reduce((sum, a) => sum + Math.pow(a - avgOfAvgs, 2), 0) / rollingAvgs.length;
    const consistency = 1 / (1 + Math.sqrt(variance)); // 0-1, higher is better

    // Streak analysis
    const streakStats = this.calculateStreaks(trades);

    return {
      consistency,
      streakStats
    };
  }

  /**
   * Calculate win/loss streaks
   * @param {Array} trades - Array of trades
   * @returns {Object} - Streak statistics
   */
  static calculateStreaks(trades) {
    let currentStreak = 0;
    let maxWinStreak = 0;
    let maxLossStreak = 0;
    let lastWasWin = null;

    for (const trade of trades) {
      const isWin = trade.netPnl > 0;

      if (lastWasWin === null || lastWasWin === isWin) {
        currentStreak++;
      } else {
        currentStreak = 1;
      }

      if (isWin) {
        maxWinStreak = Math.max(maxWinStreak, currentStreak);
      } else {
        maxLossStreak = Math.max(maxLossStreak, currentStreak);
      }

      lastWasWin = isWin;
    }

    return {
      maxWinStreak,
      maxLossStreak
    };
  }

  /**
   * Format metrics for display
   * @param {Object} metrics - Metrics object
   * @returns {string} - Formatted string
   */
  static format(metrics) {
    return `
Performance Metrics:
==================
Returns:
  Total Net P&L: $${metrics.totalNetPnl.toFixed(2)}
  Return: ${metrics.returnPercent.toFixed(2)}%
  Return/Trade: $${metrics.returnPerTrade.toFixed(2)}

Win Metrics:
  Total Trades: ${metrics.totalTrades}
  Win Rate: ${metrics.winRate.toFixed(2)}%
  Profit Factor: ${metrics.profitFactor.toFixed(2)}
  Payoff Ratio: ${metrics.payoffRatio.toFixed(2)}

Risk Metrics:
  Sharpe Ratio: ${metrics.sharpeRatio.toFixed(2)}
  Sortino Ratio: ${metrics.sortinoRatio.toFixed(2)}
  Max Drawdown: ${metrics.maxDrawdown.toFixed(2)}%
  Calmar Ratio: ${metrics.calmarRatio.toFixed(2)}

Expectancy:
  Expectancy: $${metrics.expectancy.toFixed(2)}
  R-Multiple: ${metrics.rMultiple.toFixed(2)}

Tail Risk:
  Max Loss: $${metrics.maxLoss.toFixed(2)}
  Max Win: $${metrics.maxWin.toFixed(2)}
  Tail Ratio: ${metrics.tailRatio.toFixed(2)}

Stability:
  Consistency: ${(metrics.consistency * 100).toFixed(2)}%
  Max Win Streak: ${metrics.streakStats.maxWinStreak}
  Max Loss Streak: ${metrics.streakStats.maxLossStreak}
`;
  }
}

module.exports = Metrics;
