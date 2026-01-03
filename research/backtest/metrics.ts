/**
 * Performance Metrics Calculator
 * 
 * Calculates comprehensive performance metrics for backtesting results
 */

import { Trade, PerformanceMetrics, RegimeType, RegimePerformance, EquityPoint } from '../lib/types';
import { 
  calculateSharpeRatio, 
  calculateSortinoRatio, 
  calculateCalmarRatio,
  calculateMaxDrawdown,
  calculateProfitFactor,
  calculateExpectancy,
  calculateRMultiple,
  calculatePercentile
} from '../lib/math';

export class MetricsCalculator {
  /**
   * Calculate comprehensive performance metrics from trades
   */
  static calculate(
    trades: Trade[],
    equity: EquityPoint[],
    initialBalance: number,
    regimeInfo?: Array<{ regime: RegimeType; trades: Trade[] }>
  ): PerformanceMetrics {
    if (trades.length === 0) {
      return this.getEmptyMetrics();
    }
    
    // Separate winners and losers
    const winners = trades.filter(t => t.realizedPnl > 0);
    const losers = trades.filter(t => t.realizedPnl < 0);
    
    // Calculate returns
    const grossPnl = trades.reduce((sum, t) => sum + t.realizedPnl, 0);
    const totalFees = trades.reduce((sum, t) => sum + t.fees, 0);
    const totalSlippage = trades.reduce((sum, t) => sum + t.slippage, 0);
    const netPnl = grossPnl - totalFees - totalSlippage;
    
    const grossReturnPercent = (grossPnl / initialBalance) * 100;
    const netReturnPercent = (netPnl / initialBalance) * 100;
    
    // Calculate drawdown
    const equityValues = equity.map(e => e.equity);
    const ddInfo = calculateMaxDrawdown(equityValues);
    const avgDrawdown = equity.reduce((sum, e) => sum + e.drawdown, 0) / equity.length;
    
    // Win/Loss statistics
    const winRate = winners.length / trades.length;
    const avgWin = winners.length > 0 
      ? winners.reduce((sum, t) => sum + t.realizedPnl, 0) / winners.length 
      : 0;
    const avgLoss = losers.length > 0
      ? losers.reduce((sum, t) => sum + t.realizedPnl, 0) / losers.length
      : 0;
    
    const avgWinPercent = winners.length > 0
      ? winners.reduce((sum, t) => sum + t.realizedPnlPercent, 0) / winners.length
      : 0;
    const avgLossPercent = losers.length > 0
      ? losers.reduce((sum, t) => sum + t.realizedPnlPercent, 0) / losers.length
      : 0;
    
    const largestWin = winners.length > 0 
      ? Math.max(...winners.map(t => t.realizedPnl))
      : 0;
    const largestLoss = losers.length > 0
      ? Math.min(...losers.map(t => t.realizedPnl))
      : 0;
    
    // Risk-adjusted returns
    const tradeReturns = trades.map(t => t.realizedPnlPercent);
    const sharpeRatio = calculateSharpeRatio(tradeReturns, 0, 252);
    const sortinoRatio = calculateSortinoRatio(tradeReturns, 0, 252);
    
    const totalDays = (trades[trades.length - 1].exitTime - trades[0].entryTime) / (1000 * 60 * 60 * 24);
    const calmarRatio = calculateCalmarRatio(netReturnPercent, ddInfo.maxDrawdownPercent, totalDays / 365);
    
    // Profit factor and expectancy
    const winPnls = winners.map(t => t.realizedPnl);
    const lossPnls = losers.map(t => t.realizedPnl);
    const profitFactor = calculateProfitFactor(winPnls, lossPnls);
    const expectancy = calculateExpectancy(winPnls, lossPnls, winRate);
    
    // R-multiples
    const rMultiples = trades.map(t => 
      calculateRMultiple(t.entryPrice, t.exitPrice, t.stopLoss, t.side)
    );
    const avgRMultiple = rMultiples.reduce((sum, r) => sum + r, 0) / rMultiples.length;
    
    // Holding period
    const holdingPeriods = trades.map(t => t.exitTime - t.entryTime);
    const avgHoldingPeriod = holdingPeriods.reduce((sum, h) => sum + h, 0) / holdingPeriods.length;
    
    // Tail risk (worst 1% outcomes)
    const sortedReturns = [...tradeReturns].sort((a, b) => a - b);
    const tailIndex = Math.max(0, Math.floor(sortedReturns.length * 0.01));
    const tailLoss = sortedReturns.slice(0, tailIndex + 1).reduce((sum, r) => sum + r, 0) / (tailIndex + 1);
    
    // Regime performance
    let regimePerformance: Record<RegimeType, RegimePerformance> | undefined;
    if (regimeInfo) {
      regimePerformance = {} as Record<RegimeType, RegimePerformance>;
      for (const { regime, trades: regimeTrades } of regimeInfo) {
        if (regimeTrades.length > 0) {
          const regimeWinners = regimeTrades.filter(t => t.realizedPnl > 0);
          const regimeWinRate = regimeWinners.length / regimeTrades.length;
          const regimeNetPnl = regimeTrades.reduce((sum, t) => sum + t.realizedPnl - t.fees - t.slippage, 0);
          const regimeWinPnls = regimeWinners.map(t => t.realizedPnl);
          const regimeLossPnls = regimeTrades.filter(t => t.realizedPnl < 0).map(t => t.realizedPnl);
          const regimeExpectancy = calculateExpectancy(regimeWinPnls, regimeLossPnls, regimeWinRate);
          
          regimePerformance[regime] = {
            regime,
            trades: regimeTrades.length,
            winRate: regimeWinRate,
            netReturn: regimeNetPnl,
            expectancy: regimeExpectancy
          };
        }
      }
    }
    
    return {
      // Returns
      netReturn: netPnl,
      netReturnPercent,
      grossReturn: grossPnl,
      grossReturnPercent,
      
      // Risk metrics
      maxDrawdown: ddInfo.maxDrawdown,
      maxDrawdownPercent: ddInfo.maxDrawdownPercent,
      avgDrawdown,
      
      // Trade statistics
      totalTrades: trades.length,
      winningTrades: winners.length,
      losingTrades: losers.length,
      winRate,
      
      // P&L statistics
      avgWin,
      avgLoss,
      avgWinPercent,
      avgLossPercent,
      largestWin,
      largestLoss,
      
      // Risk-adjusted returns
      sharpeRatio,
      sortinoRatio,
      calmarRatio,
      
      // Other metrics
      profitFactor,
      expectancy,
      avgRMultiple,
      
      // Costs
      totalFees,
      totalSlippage,
      
      // Time
      avgHoldingPeriod,
      
      // Tail risk
      tailLoss,
      
      // Regime performance
      regimePerformance
    };
  }
  
  /**
   * Get empty metrics (when no trades)
   */
  private static getEmptyMetrics(): PerformanceMetrics {
    return {
      netReturn: 0,
      netReturnPercent: 0,
      grossReturn: 0,
      grossReturnPercent: 0,
      maxDrawdown: 0,
      maxDrawdownPercent: 0,
      avgDrawdown: 0,
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      avgWinPercent: 0,
      avgLossPercent: 0,
      largestWin: 0,
      largestLoss: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      calmarRatio: 0,
      profitFactor: 0,
      expectancy: 0,
      avgRMultiple: 0,
      totalFees: 0,
      totalSlippage: 0,
      avgHoldingPeriod: 0,
      tailLoss: 0
    };
  }
  
  /**
   * Compare two sets of metrics
   */
  static compare(a: PerformanceMetrics, b: PerformanceMetrics): {
    metric: string;
    valueA: number;
    valueB: number;
    difference: number;
    percentChange: number;
  }[] {
    const comparisons: Array<{
      metric: string;
      valueA: number;
      valueB: number;
      difference: number;
      percentChange: number;
    }> = [];
    
    const metricsToCompare = [
      'netReturnPercent',
      'maxDrawdownPercent',
      'winRate',
      'sharpeRatio',
      'sortinoRatio',
      'profitFactor',
      'expectancy',
      'avgRMultiple'
    ];
    
    for (const metric of metricsToCompare) {
      const valueA = (a as any)[metric];
      const valueB = (b as any)[metric];
      const difference = valueB - valueA;
      const percentChange = valueA !== 0 ? (difference / Math.abs(valueA)) * 100 : 0;
      
      comparisons.push({
        metric,
        valueA,
        valueB,
        difference,
        percentChange
      });
    }
    
    return comparisons;
  }
  
  /**
   * Calculate stability score (lower volatility = higher stability)
   */
  static calculateStabilityScore(trades: Trade[]): number {
    if (trades.length < 2) return 0;
    
    const returns = trades.map(t => t.realizedPnlPercent);
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    
    // Lower std dev = higher stability score (0-100 scale)
    const stabilityScore = Math.max(0, 100 - (stdDev * 10));
    return Math.min(100, stabilityScore);
  }
  
  /**
   * Calculate robustness score across multiple symbols/timeframes
   */
  static calculateRobustnessScore(metricsBySymbol: PerformanceMetrics[]): number {
    if (metricsBySymbol.length === 0) return 0;
    
    // Check consistency of key metrics
    const winRates = metricsBySymbol.map(m => m.winRate);
    const sharpeRatios = metricsBySymbol.map(m => m.sharpeRatio);
    const expectancies = metricsBySymbol.map(m => m.expectancy);
    
    const winRateStdDev = this.calculateStdDev(winRates);
    const sharpeStdDev = this.calculateStdDev(sharpeRatios);
    const expectancyStdDev = this.calculateStdDev(expectancies);
    
    // Lower variance = higher robustness
    const avgVariance = (winRateStdDev + sharpeStdDev + expectancyStdDev) / 3;
    const robustnessScore = Math.max(0, 100 - (avgVariance * 100));
    
    return Math.min(100, robustnessScore);
  }
  
  private static calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
}

export default MetricsCalculator;
