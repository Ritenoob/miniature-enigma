/**
 * OBV (On-Balance Volume) Indicator
 * 
 * OBV is a cumulative volume indicator that adds volume on up days
 * and subtracts volume on down days. It helps confirm price trends.
 * 
 * An optional EMA smoothing can be applied to reduce noise.
 */

export class OBVIndicator {
  /**
   * Calculate OBV (On-Balance Volume)
   * @param closes Array of close prices
   * @param volumes Array of volumes
   * @param smoothPeriod Optional EMA smoothing period (0 = no smoothing)
   * @returns Current OBV value and optional smoothed OBV
   */
  static calculate(
    closes: number[],
    volumes: number[],
    smoothPeriod: number = 0
  ): { obv: number; obvEma?: number } {
    if (!closes || !volumes || closes.length < 2 || closes.length !== volumes.length) {
      return { obv: 0 };
    }
    
    const obvValues = this.calculateSeries(closes, volumes);
    const currentOBV = obvValues[obvValues.length - 1];
    
    if (smoothPeriod > 0 && obvValues.length >= smoothPeriod) {
      const obvEma = this.calculateEMA(obvValues, smoothPeriod);
      return { obv: currentOBV, obvEma };
    }
    
    return { obv: currentOBV };
  }
  
  /**
   * Calculate OBV series (full history)
   * @param closes Array of close prices
   * @param volumes Array of volumes
   * @returns Array of OBV values
   */
  static calculateSeries(closes: number[], volumes: number[]): number[] {
    if (!closes || !volumes || closes.length < 2 || closes.length !== volumes.length) {
      return [];
    }
    
    const obvValues: number[] = [0]; // Start at 0
    
    for (let i = 1; i < closes.length; i++) {
      const priceChange = closes[i] - closes[i - 1];
      let obvChange = 0;
      
      if (priceChange > 0) {
        // Price up: add volume
        obvChange = volumes[i];
      } else if (priceChange < 0) {
        // Price down: subtract volume
        obvChange = -volumes[i];
      }
      // If price unchanged, OBV unchanged
      
      obvValues.push(obvValues[i - 1] + obvChange);
    }
    
    return obvValues;
  }
  
  /**
   * Calculate EMA of OBV
   */
  private static calculateEMA(data: number[], period: number): number {
    if (!data || data.length < period) return data[data.length - 1] || 0;
    
    const multiplier = 2 / (period + 1);
    
    // Start with SMA
    let ema = data.slice(0, period).reduce((sum, val) => sum + val, 0) / period;
    
    // Calculate EMA for remaining values
    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
    }
    
    return ema;
  }
  
  /**
   * Calculate OBV with EMA smoothing (full history)
   */
  static calculateWithSmoothing(
    closes: number[],
    volumes: number[],
    smoothPeriod: number
  ): Array<{ obv: number; obvEma?: number }> {
    const obvSeries = this.calculateSeries(closes, volumes);
    
    if (obvSeries.length === 0) {
      return [];
    }
    
    const results: Array<{ obv: number; obvEma?: number }> = [];
    
    for (let i = 0; i < obvSeries.length; i++) {
      const result: { obv: number; obvEma?: number } = {
        obv: obvSeries[i]
      };
      
      // Calculate EMA if we have enough data
      if (smoothPeriod > 0 && i >= smoothPeriod - 1) {
        const obvSlice = obvSeries.slice(0, i + 1);
        result.obvEma = this.calculateEMA(obvSlice, smoothPeriod);
      }
      
      results.push(result);
    }
    
    return results;
  }
  
  /**
   * Get OBV divergence signal
   * Compares price trend vs OBV trend to identify divergences
   */
  static getDivergence(
    closes: number[],
    obvValues: number[],
    lookback: number = 20
  ): {
    type: 'bullish' | 'bearish' | 'none';
    strength: number;
  } {
    if (!closes || !obvValues || closes.length < lookback || obvValues.length < lookback) {
      return { type: 'none', strength: 0 };
    }
    
    const recentCloses = closes.slice(-lookback);
    const recentOBV = obvValues.slice(-lookback);
    
    // Calculate trends (simple slope)
    const priceTrend = this.calculateTrend(recentCloses);
    const obvTrend = this.calculateTrend(recentOBV);
    
    const threshold = 0.1; // Minimum trend strength
    
    // Bullish divergence: Price down, OBV up
    if (priceTrend < -threshold && obvTrend > threshold) {
      const strength = Math.min(1, (Math.abs(priceTrend) + obvTrend) / 2);
      return { type: 'bullish', strength };
    }
    
    // Bearish divergence: Price up, OBV down
    if (priceTrend > threshold && obvTrend < -threshold) {
      const strength = Math.min(1, (priceTrend + Math.abs(obvTrend)) / 2);
      return { type: 'bearish', strength };
    }
    
    return { type: 'none', strength: 0 };
  }
  
  /**
   * Calculate simple linear trend (positive = uptrend, negative = downtrend)
   */
  private static calculateTrend(data: number[]): number {
    if (data.length < 2) return 0;
    
    const n = data.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumX2 = 0;
    
    for (let i = 0; i < n; i++) {
      sumX += i;
      sumY += data[i];
      sumXY += i * data[i];
      sumX2 += i * i;
    }
    
    const denominator = (n * sumX2 - sumX * sumX);
    if (denominator === 0) return 0;
    
    const slope = (n * sumXY - sumX * sumY) / denominator;
    
    // Normalize by data range
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min;
    
    if (range === 0) return 0;
    
    return slope / range;
  }
  
  /**
   * Get confirmation signal based on OBV and price movement
   */
  static getConfirmation(
    priceChange: number,
    obvChange: number
  ): {
    confirmed: boolean;
    signal: 'bullish' | 'bearish' | 'neutral';
  } {
    // Price and OBV moving in same direction = confirmation
    if (priceChange > 0 && obvChange > 0) {
      return { confirmed: true, signal: 'bullish' };
    }
    
    if (priceChange < 0 && obvChange < 0) {
      return { confirmed: true, signal: 'bearish' };
    }
    
    // Divergence = no confirmation
    if (priceChange > 0 && obvChange < 0) {
      return { confirmed: false, signal: 'bearish' };
    }
    
    if (priceChange < 0 && obvChange > 0) {
      return { confirmed: false, signal: 'bullish' };
    }
    
    return { confirmed: false, signal: 'neutral' };
  }
  
  /**
   * Get relative OBV strength
   * Compares current OBV to its moving average
   */
  static getRelativeStrength(obv: number, obvEma: number): {
    strength: 'strong' | 'weak' | 'neutral';
    value: number;
  } {
    if (obvEma === 0) {
      return { strength: 'neutral', value: 0 };
    }
    
    const ratio = obv / obvEma;
    const deviation = (ratio - 1) * 100;
    
    if (deviation > 5) {
      return { strength: 'strong', value: deviation };
    } else if (deviation < -5) {
      return { strength: 'weak', value: deviation };
    }
    
    return { strength: 'neutral', value: deviation };
  }
}

export default OBVIndicator;
