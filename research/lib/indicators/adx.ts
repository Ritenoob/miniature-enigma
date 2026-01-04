/**
 * ADX (Average Directional Index) with DI+ and DI-
 * 
 * ADX measures trend strength (0-100)
 * - ADX < 20: Weak trend (ranging market)
 * - ADX 20-25: Developing trend
 * - ADX 25-50: Strong trend
 * - ADX > 50: Very strong trend
 * 
 * DI+ and DI- measure directional movement
 * - DI+ > DI-: Uptrend
 * - DI- > DI+: Downtrend
 */

import { ADXResult } from '../types';

export class ADXIndicator {
  /**
   * Calculate ADX with DI+ and DI-
   * @param highs Array of high prices
   * @param lows Array of low prices
   * @param closes Array of close prices
   * @param period Period for ADX calculation (default 14)
   * @returns ADX, DI+, and DI- values
   */
  static calculate(
    highs: number[],
    lows: number[],
    closes: number[],
    period: number = 14
  ): ADXResult {
    if (!closes || closes.length < period + 1) {
      return { adx: 0, diPlus: 0, diMinus: 0 };
    }
    
    // Calculate True Range and Directional Movement
    const tr: number[] = [];
    const dmPlus: number[] = [];
    const dmMinus: number[] = [];
    
    for (let i = 1; i < closes.length; i++) {
      // True Range
      const high = highs[i];
      const low = lows[i];
      const prevClose = closes[i - 1];
      
      const trValue = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      tr.push(trValue);
      
      // Directional Movement
      const highDiff = highs[i] - highs[i - 1];
      const lowDiff = lows[i - 1] - lows[i];
      
      let plusDM = 0;
      let minusDM = 0;
      
      if (highDiff > lowDiff && highDiff > 0) {
        plusDM = highDiff;
      }
      if (lowDiff > highDiff && lowDiff > 0) {
        minusDM = lowDiff;
      }
      
      dmPlus.push(plusDM);
      dmMinus.push(minusDM);
    }
    
    if (tr.length < period) {
      return { adx: 0, diPlus: 0, diMinus: 0 };
    }
    
    // Calculate smoothed TR and DM using Wilder's smoothing (EMA-like)
    const atr = this.wilderSmooth(tr, period);
    const smoothedDMPlus = this.wilderSmooth(dmPlus, period);
    const smoothedDMMinus = this.wilderSmooth(dmMinus, period);
    
    if (atr === 0) {
      return { adx: 0, diPlus: 0, diMinus: 0 };
    }
    
    // Calculate DI+ and DI-
    const diPlus = (smoothedDMPlus / atr) * 100;
    const diMinus = (smoothedDMMinus / atr) * 100;
    
    // Calculate DX (Directional Index)
    const diDiff = Math.abs(diPlus - diMinus);
    const diSum = diPlus + diMinus;
    
    if (diSum === 0) {
      return { adx: 0, diPlus, diMinus };
    }
    
    const dx = (diDiff / diSum) * 100;
    
    // For a single value, ADX approximates to DX
    // In full calculation, ADX would be smoothed DX over multiple periods
    const adx = dx * 0.7; // Approximation factor
    
    return {
      adx: Math.min(100, adx),
      diPlus: Math.min(100, diPlus),
      diMinus: Math.min(100, diMinus)
    };
  }
  
  /**
   * Calculate ADX with full history (more accurate)
   */
  static calculateWithHistory(
    highs: number[],
    lows: number[],
    closes: number[],
    period: number = 14
  ): ADXResult[] {
    if (!closes || closes.length < period * 2) {
      return [];
    }
    
    const results: ADXResult[] = [];
    
    // Calculate True Range and Directional Movement
    const tr: number[] = [];
    const dmPlus: number[] = [];
    const dmMinus: number[] = [];
    
    for (let i = 1; i < closes.length; i++) {
      const high = highs[i];
      const low = lows[i];
      const prevClose = closes[i - 1];
      
      const trValue = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      tr.push(trValue);
      
      const highDiff = highs[i] - highs[i - 1];
      const lowDiff = lows[i - 1] - lows[i];
      
      let plusDM = 0;
      let minusDM = 0;
      
      if (highDiff > lowDiff && highDiff > 0) {
        plusDM = highDiff;
      }
      if (lowDiff > highDiff && lowDiff > 0) {
        minusDM = lowDiff;
      }
      
      dmPlus.push(plusDM);
      dmMinus.push(minusDM);
    }
    
    // Calculate smoothed values
    let smoothedTR = tr.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    let smoothedDMPlus = dmPlus.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    let smoothedDMMinus = dmMinus.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    
    const dxValues: number[] = [];
    
    for (let i = period; i < tr.length; i++) {
      // Wilder's smoothing
      smoothedTR = (smoothedTR * (period - 1) + tr[i]) / period;
      smoothedDMPlus = (smoothedDMPlus * (period - 1) + dmPlus[i]) / period;
      smoothedDMMinus = (smoothedDMMinus * (period - 1) + dmMinus[i]) / period;
      
      if (smoothedTR === 0) {
        dxValues.push(0);
        continue;
      }
      
      const diPlus = (smoothedDMPlus / smoothedTR) * 100;
      const diMinus = (smoothedDMMinus / smoothedTR) * 100;
      
      const diSum = diPlus + diMinus;
      const dx = diSum === 0 ? 0 : (Math.abs(diPlus - diMinus) / diSum) * 100;
      
      dxValues.push(dx);
    }
    
    // Calculate ADX (smoothed DX)
    if (dxValues.length < period) {
      return [];
    }
    
    let adx = dxValues.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    
    for (let i = period; i < dxValues.length; i++) {
      adx = (adx * (period - 1) + dxValues[i]) / period;
      
      // Get current DI+ and DI-
      const idx = i + period;
      if (idx < tr.length) {
        const currentSmoothedTR = smoothedTR;
        const currentSmoothedDMPlus = smoothedDMPlus;
        const currentSmoothedDMMinus = smoothedDMMinus;
        
        const diPlus = currentSmoothedTR === 0 ? 0 : (currentSmoothedDMPlus / currentSmoothedTR) * 100;
        const diMinus = currentSmoothedTR === 0 ? 0 : (currentSmoothedDMMinus / currentSmoothedTR) * 100;
        
        results.push({
          adx: Math.min(100, adx),
          diPlus: Math.min(100, diPlus),
          diMinus: Math.min(100, diMinus)
        });
      }
    }
    
    return results;
  }
  
  /**
   * Wilder's smoothing (similar to EMA but uses previous smoothed value)
   */
  private static wilderSmooth(data: number[], period: number): number {
    if (data.length < period) return 0;
    
    // Initial smoothed value is simple average
    let smoothed = data.slice(-period).reduce((sum, val) => sum + val, 0) / period;
    
    // Apply Wilder's smoothing if we have more data
    if (data.length > period) {
      const remaining = data.slice(period);
      for (const value of remaining) {
        smoothed = (smoothed * (period - 1) + value) / period;
      }
    }
    
    return smoothed;
  }
  
  /**
   * Get regime classification based on ADX
   */
  static getRegime(adx: number): 'trending' | 'ranging' {
    return adx >= 25 ? 'trending' : 'ranging';
  }
  
  /**
   * Get directional signal from DI+ and DI-
   */
  static getDirectionalSignal(adxResult: ADXResult): {
    direction: 'bullish' | 'bearish' | 'neutral';
    strength: number;
  } {
    const { adx, diPlus, diMinus } = adxResult;
    
    // Weak trend - neutral
    if (adx < 20) {
      return { direction: 'neutral', strength: 0 };
    }
    
    // Determine direction from DI+ vs DI-
    const diff = Math.abs(diPlus - diMinus);
    const strength = Math.min(1, (adx / 50) * (diff / 100));
    
    if (diPlus > diMinus) {
      return { direction: 'bullish', strength };
    } else if (diMinus > diPlus) {
      return { direction: 'bearish', strength };
    }
    
    return { direction: 'neutral', strength: 0 };
  }
}

export default ADXIndicator;
