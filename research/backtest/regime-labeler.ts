/**
 * Regime Labeler
 * 
 * Classifies market regimes based on ADX and ATR
 */

import { RegimeType, RegimeInfo, Candle } from '../lib/types';
import { ADXIndicator } from '../lib/indicators/adx';

export class RegimeLabeler {
  /**
   * Label market regime for a given period
   */
  static labelRegime(
    highs: number[],
    lows: number[],
    closes: number[],
    atrPercent: number,
    adxPeriod: number = 14
  ): RegimeType {
    // Calculate ADX
    const adxResult = ADXIndicator.calculate(highs, lows, closes, adxPeriod);
    const adx = adxResult.adx;
    
    // High volatility threshold (ATR% > 3%)
    if (atrPercent > 3.0) {
      return 'high_volatility';
    }
    
    // Trending vs ranging based on ADX
    if (adx >= 25) {
      return 'trending';
    } else {
      return 'ranging';
    }
  }
  
  /**
   * Label regimes for entire time series
   */
  static labelTimeSeriesRegimes(
    candles: Candle[],
    atrPeriod: number = 14,
    adxPeriod: number = 14,
    windowSize: number = 50
  ): RegimeInfo[] {
    if (candles.length < windowSize) {
      return [];
    }
    
    const regimes: RegimeInfo[] = [];
    let currentRegime: RegimeType | null = null;
    let regimeStartIdx = 0;
    
    for (let i = windowSize; i < candles.length; i++) {
      const window = candles.slice(i - windowSize, i);
      const highs = window.map(c => c.high);
      const lows = window.map(c => c.low);
      const closes = window.map(c => c.close);
      
      // Calculate ATR%
      const atr = this.calculateATR(highs, lows, closes, atrPeriod);
      const currentPrice = closes[closes.length - 1];
      const atrPercent = (atr / currentPrice) * 100;
      
      // Label regime
      const regime = this.labelRegime(highs, lows, closes, atrPercent, adxPeriod);
      
      // Calculate ADX for storage
      const adxResult = ADXIndicator.calculate(highs, lows, closes, adxPeriod);
      
      // Check if regime changed
      if (currentRegime === null) {
        currentRegime = regime;
        regimeStartIdx = i;
      } else if (regime !== currentRegime) {
        // Save previous regime
        regimes.push({
          startTime: candles[regimeStartIdx].timestamp,
          endTime: candles[i - 1].timestamp,
          regime: currentRegime,
          adx: adxResult.adx,
          atrPercent
        });
        
        currentRegime = regime;
        regimeStartIdx = i;
      }
    }
    
    // Add final regime
    if (currentRegime !== null && regimeStartIdx < candles.length - 1) {
      const window = candles.slice(-windowSize);
      const highs = window.map(c => c.high);
      const lows = window.map(c => c.low);
      const closes = window.map(c => c.close);
      
      const atr = this.calculateATR(highs, lows, closes, atrPeriod);
      const currentPrice = closes[closes.length - 1];
      const atrPercent = (atr / currentPrice) * 100;
      const adxResult = ADXIndicator.calculate(highs, lows, closes, adxPeriod);
      
      regimes.push({
        startTime: candles[regimeStartIdx].timestamp,
        endTime: candles[candles.length - 1].timestamp,
        regime: currentRegime,
        adx: adxResult.adx,
        atrPercent
      });
    }
    
    return regimes;
  }
  
  /**
   * Get regime for a specific timestamp
   */
  static getRegimeAtTime(regimes: RegimeInfo[], timestamp: number): RegimeType {
    for (const regime of regimes) {
      if (timestamp >= regime.startTime && timestamp <= regime.endTime) {
        return regime.regime;
      }
    }
    return 'unknown';
  }
  
  /**
   * Filter regimes by type
   */
  static filterByRegime(regimes: RegimeInfo[], regimeType: RegimeType): RegimeInfo[] {
    return regimes.filter(r => r.regime === regimeType);
  }
  
  /**
   * Calculate regime statistics
   */
  static calculateRegimeStats(regimes: RegimeInfo[]): Record<RegimeType, {
    count: number;
    totalDuration: number;
    avgDuration: number;
    percentage: number;
  }> {
    const stats: Record<string, {
      count: number;
      totalDuration: number;
      avgDuration: number;
      percentage: number;
    }> = {
      trending: { count: 0, totalDuration: 0, avgDuration: 0, percentage: 0 },
      ranging: { count: 0, totalDuration: 0, avgDuration: 0, percentage: 0 },
      high_volatility: { count: 0, totalDuration: 0, avgDuration: 0, percentage: 0 },
      unknown: { count: 0, totalDuration: 0, avgDuration: 0, percentage: 0 }
    };
    
    let totalDuration = 0;
    
    for (const regime of regimes) {
      const duration = regime.endTime - regime.startTime;
      stats[regime.regime].count++;
      stats[regime.regime].totalDuration += duration;
      totalDuration += duration;
    }
    
    // Calculate averages and percentages
    for (const regimeType in stats) {
      const regimeStats = stats[regimeType];
      if (regimeStats.count > 0) {
        regimeStats.avgDuration = regimeStats.totalDuration / regimeStats.count;
      }
      if (totalDuration > 0) {
        regimeStats.percentage = (regimeStats.totalDuration / totalDuration) * 100;
      }
    }
    
    return stats as Record<RegimeType, any>;
  }
  
  /**
   * Simple ATR calculation
   */
  private static calculateATR(
    highs: number[],
    lows: number[],
    closes: number[],
    period: number = 14
  ): number {
    if (closes.length < period + 1) return 0;
    
    const trueRanges: number[] = [];
    for (let i = 1; i < closes.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trueRanges.push(tr);
    }
    
    // Simple moving average of TR
    const recentTR = trueRanges.slice(-period);
    return recentTR.reduce((sum, tr) => sum + tr, 0) / recentTR.length;
  }
  
  /**
   * Check if a regime allows trading based on filter
   */
  static shouldTrade(
    currentRegime: RegimeType,
    allowedRegimes?: RegimeType[]
  ): boolean {
    if (!allowedRegimes || allowedRegimes.length === 0) {
      return true; // No filter, always trade
    }
    
    return allowedRegimes.includes(currentRegime);
  }
}

export default RegimeLabeler;
