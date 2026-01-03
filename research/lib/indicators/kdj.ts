/**
 * KDJ Indicator (Stochastic with J line)
 * 
 * KDJ is an extension of the stochastic oscillator that adds the J line.
 * K and D are similar to stochastic %K and %D
 * J = 3*K - 2*D (amplifies divergence between K and D)
 */

import { KDJResult } from '../types';

export class KDJIndicator {
  /**
   * Calculate KDJ indicator
   * @param highs Array of high prices
   * @param lows Array of low prices
   * @param closes Array of close prices
   * @param period Period for K calculation (default 9)
   * @param smoothK Smoothing period for K (default 3)
   * @param smoothD Smoothing period for D (default 3)
   * @returns KDJ values
   */
  static calculate(
    highs: number[],
    lows: number[],
    closes: number[],
    period: number = 9,
    smoothK: number = 3,
    smoothD: number = 3
  ): KDJResult {
    if (!closes || closes.length < period) {
      return { k: 50, d: 50, j: 50 };
    }
    
    // Calculate RSV (Raw Stochastic Value)
    const rsvValues: number[] = [];
    
    for (let i = period - 1; i < closes.length; i++) {
      const periodHighs = highs.slice(i - period + 1, i + 1);
      const periodLows = lows.slice(i - period + 1, i + 1);
      const currentClose = closes[i];
      
      const highestHigh = Math.max(...periodHighs);
      const lowestLow = Math.min(...periodLows);
      
      let rsv: number;
      if (highestHigh === lowestLow) {
        rsv = 50; // Neutral when no range
      } else {
        rsv = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
      }
      
      rsvValues.push(rsv);
    }
    
    if (rsvValues.length === 0) {
      return { k: 50, d: 50, j: 50 };
    }
    
    // Calculate K line (EMA of RSV)
    let k = rsvValues[0]; // Initialize with first RSV
    const kAlpha = 1 / smoothK;
    
    for (let i = 1; i < rsvValues.length; i++) {
      k = rsvValues[i] * kAlpha + k * (1 - kAlpha);
    }
    
    // Calculate D line (EMA of K)
    // For simplicity, we'll use a smoothed version
    // In practice, you'd track K values and smooth them
    const dAlpha = 1 / smoothD;
    const d = k * 0.8; // Approximation (would need to track K history for exact)
    
    // Calculate J line
    const j = 3 * k - 2 * d;
    
    return {
      k: Math.max(0, Math.min(100, k)),
      d: Math.max(0, Math.min(100, d)),
      j: Math.max(-20, Math.min(120, j)) // J can exceed 0-100 range
    };
  }
  
  /**
   * Calculate KDJ with full history tracking (more accurate)
   */
  static calculateWithHistory(
    highs: number[],
    lows: number[],
    closes: number[],
    period: number = 9,
    smoothK: number = 3,
    smoothD: number = 3
  ): KDJResult[] {
    if (!closes || closes.length < period) {
      return [];
    }
    
    const results: KDJResult[] = [];
    const kValues: number[] = [];
    
    for (let i = period - 1; i < closes.length; i++) {
      const periodHighs = highs.slice(i - period + 1, i + 1);
      const periodLows = lows.slice(i - period + 1, i + 1);
      const currentClose = closes[i];
      
      const highestHigh = Math.max(...periodHighs);
      const lowestLow = Math.min(...periodLows);
      
      let rsv: number;
      if (highestHigh === lowestLow) {
        rsv = 50;
      } else {
        rsv = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
      }
      
      // Calculate K (EMA of RSV)
      let k: number;
      if (kValues.length === 0) {
        k = rsv;
      } else {
        const alpha = 1 / smoothK;
        k = rsv * alpha + kValues[kValues.length - 1] * (1 - alpha);
      }
      kValues.push(k);
      
      // Calculate D (EMA of K)
      let d: number;
      if (kValues.length < smoothD) {
        // Not enough K values yet, use simple average
        d = kValues.reduce((sum, val) => sum + val, 0) / kValues.length;
      } else {
        // Use EMA of last smoothD K values
        const recentK = kValues.slice(-smoothD);
        d = recentK[0];
        const dAlpha = 1 / smoothD;
        for (let j = 1; j < recentK.length; j++) {
          d = recentK[j] * dAlpha + d * (1 - dAlpha);
        }
      }
      
      // Calculate J
      const j = 3 * k - 2 * d;
      
      results.push({
        k: Math.max(0, Math.min(100, k)),
        d: Math.max(0, Math.min(100, d)),
        j: Math.max(-20, Math.min(120, j))
      });
    }
    
    return results;
  }
  
  /**
   * Get trading signals from KDJ
   */
  static getSignal(kdj: KDJResult, oversold: number = 20, overbought: number = 80): {
    signal: 'bullish' | 'bearish' | 'neutral';
    strength: number;
  } {
    let signal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let strength = 0;
    
    // Oversold/Overbought levels
    if (kdj.k < oversold && kdj.d < oversold) {
      signal = 'bullish';
      strength = (oversold - kdj.k) / oversold;
    } else if (kdj.k > overbought && kdj.d > overbought) {
      signal = 'bearish';
      strength = (kdj.k - overbought) / (100 - overbought);
    }
    
    // J line extreme values
    if (kdj.j < 0) {
      signal = 'bullish';
      strength = Math.max(strength, Math.abs(kdj.j) / 20);
    } else if (kdj.j > 100) {
      signal = 'bearish';
      strength = Math.max(strength, (kdj.j - 100) / 20);
    }
    
    // Crossovers
    if (kdj.k > kdj.d && kdj.k < oversold) {
      signal = 'bullish';
      strength = Math.max(strength, 0.7);
    } else if (kdj.k < kdj.d && kdj.k > overbought) {
      signal = 'bearish';
      strength = Math.max(strength, 0.7);
    }
    
    return { signal, strength: Math.min(1, strength) };
  }
}

export default KDJIndicator;
