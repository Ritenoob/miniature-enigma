/**
 * Math utilities for backtesting and optimization
 * Re-exports DecimalMath from the main codebase and adds additional helpers
 */

import Decimal from 'decimal.js';

// Re-export the main DecimalMath module
const DecimalMath = require('../../../src/lib/DecimalMath');

// ============================================================================
// Additional Backtest Math Utilities
// ============================================================================

/**
 * Calculate percentage change between two values
 */
export function percentChange(oldValue: number, newValue: number): number {
  if (oldValue === 0) return 0;
  return ((newValue - oldValue) / oldValue) * 100;
}

/**
 * Calculate compound annual growth rate (CAGR)
 */
export function calculateCAGR(
  startValue: number,
  endValue: number,
  years: number
): number {
  if (startValue <= 0 || endValue <= 0 || years <= 0) return 0;
  return (Math.pow(endValue / startValue, 1 / years) - 1) * 100;
}

/**
 * Calculate Sharpe Ratio
 * @param returns Array of period returns (as percentages)
 * @param riskFreeRate Annual risk-free rate (as percentage)
 * @param periodsPerYear Number of periods per year (e.g., 252 for daily trading)
 */
export function calculateSharpeRatio(
  returns: number[],
  riskFreeRate: number = 0,
  periodsPerYear: number = 252
): number {
  if (returns.length === 0) return 0;
  
  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  
  if (stdDev === 0) return 0;
  
  const annualizedReturn = avgReturn * periodsPerYear;
  const annualizedStdDev = stdDev * Math.sqrt(periodsPerYear);
  
  return (annualizedReturn - riskFreeRate) / annualizedStdDev;
}

/**
 * Calculate Sortino Ratio (only considers downside volatility)
 */
export function calculateSortinoRatio(
  returns: number[],
  riskFreeRate: number = 0,
  periodsPerYear: number = 252
): number {
  if (returns.length === 0) return 0;
  
  const avgReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const downside = returns.filter(r => r < 0);
  
  if (downside.length === 0) return Infinity;
  
  const downsideVariance = downside.reduce((sum, r) => sum + Math.pow(r, 2), 0) / returns.length;
  const downsideDeviation = Math.sqrt(downsideVariance);
  
  if (downsideDeviation === 0) return 0;
  
  const annualizedReturn = avgReturn * periodsPerYear;
  const annualizedDownsideDev = downsideDeviation * Math.sqrt(periodsPerYear);
  
  return (annualizedReturn - riskFreeRate) / annualizedDownsideDev;
}

/**
 * Calculate Calmar Ratio (return / max drawdown)
 */
export function calculateCalmarRatio(
  totalReturn: number,
  maxDrawdown: number,
  years: number = 1
): number {
  if (maxDrawdown === 0) return Infinity;
  const annualizedReturn = totalReturn / years;
  return annualizedReturn / Math.abs(maxDrawdown);
}

/**
 * Calculate maximum drawdown from equity curve
 */
export function calculateMaxDrawdown(equity: number[]): {
  maxDrawdown: number;
  maxDrawdownPercent: number;
  peak: number;
  trough: number;
  recovery?: number;
} {
  if (equity.length === 0) {
    return { maxDrawdown: 0, maxDrawdownPercent: 0, peak: 0, trough: 0 };
  }
  
  let peak = equity[0];
  let maxDD = 0;
  let maxDDPercent = 0;
  let peakIdx = 0;
  let troughIdx = 0;
  let recoveryIdx: number | undefined;
  
  for (let i = 0; i < equity.length; i++) {
    if (equity[i] > peak) {
      peak = equity[i];
      peakIdx = i;
      
      // Check if we recovered from previous drawdown
      if (maxDD > 0 && recoveryIdx === undefined) {
        recoveryIdx = i;
      }
    }
    
    const dd = peak - equity[i];
    const ddPercent = (dd / peak) * 100;
    
    if (dd > maxDD) {
      maxDD = dd;
      maxDDPercent = ddPercent;
      troughIdx = i;
      recoveryIdx = undefined;
    }
  }
  
  return {
    maxDrawdown: maxDD,
    maxDrawdownPercent: maxDDPercent,
    peak: peakIdx,
    trough: troughIdx,
    recovery: recoveryIdx
  };
}

/**
 * Calculate profit factor
 */
export function calculateProfitFactor(wins: number[], losses: number[]): number {
  const grossProfit = wins.reduce((sum, w) => sum + w, 0);
  const grossLoss = Math.abs(losses.reduce((sum, l) => sum + l, 0));
  
  if (grossLoss === 0) return grossProfit > 0 ? Infinity : 0;
  return grossProfit / grossLoss;
}

/**
 * Calculate expectancy (average R-multiple)
 */
export function calculateExpectancy(
  wins: number[],
  losses: number[],
  winRate: number
): number {
  const avgWin = wins.length > 0 ? wins.reduce((sum, w) => sum + w, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((sum, l) => sum + l, 0) / losses.length) : 0;
  
  return (winRate * avgWin) - ((1 - winRate) * avgLoss);
}

/**
 * Calculate R-multiple for a trade
 * R-multiple = (Actual Profit/Loss) / Initial Risk
 */
export function calculateRMultiple(
  entryPrice: number,
  exitPrice: number,
  stopLoss: number,
  side: 'long' | 'short'
): number {
  const profitDecimal = new Decimal(side === 'long' ? exitPrice - entryPrice : entryPrice - exitPrice);
  const riskDecimal = new Decimal(Math.abs(side === 'long' ? entryPrice - stopLoss : stopLoss - entryPrice));
  
  if (riskDecimal.isZero()) return 0;
  
  return profitDecimal.dividedBy(riskDecimal).toNumber();
}

/**
 * Calculate Kelly Criterion for position sizing
 */
export function calculateKellyCriterion(winRate: number, avgWin: number, avgLoss: number): number {
  if (avgLoss === 0) return 0;
  const b = avgWin / avgLoss;
  return (winRate * b - (1 - winRate)) / b;
}

/**
 * Calculate z-score for a value in a distribution
 */
export function calculateZScore(value: number, mean: number, stdDev: number): number {
  if (stdDev === 0) return 0;
  return (value - mean) / stdDev;
}

/**
 * Calculate percentile of a value in an array
 */
export function calculatePercentile(arr: number[], percentile: number): number {
  if (arr.length === 0) return 0;
  
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  
  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Normalize value to 0-1 range
 */
export function normalize(value: number, min: number, max: number): number {
  if (max === min) return 0;
  return (value - min) / (max - min);
}

/**
 * Clamp value between min and max
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Seed-based random number generator (for determinism)
 */
export class SeededRandom {
  private seed: number;
  
  constructor(seed: number) {
    this.seed = seed % 2147483647;
    if (this.seed <= 0) this.seed += 2147483646;
  }
  
  next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
  
  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  
  nextFloat(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }
  
  choice<T>(arr: T[]): T {
    return arr[this.nextInt(0, arr.length - 1)];
  }
  
  shuffle<T>(arr: T[]): T[] {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}

// Re-export DecimalMath
export { DecimalMath };
export default DecimalMath;
