/**
 * Configurable Signal Generator
 * 
 * Generates trading signals based on technical indicators and configurable weights.
 * Compatible with the existing signal-weights.js configuration structure.
 */

import { 
  Signal, 
  SignalConfig, 
  Indicators, 
  SignalBreakdown,
  SignalType,
  ConfidenceLevel 
} from '../types';

export class SignalGenerator {
  private config: SignalConfig;
  
  constructor(config: SignalConfig) {
    this.config = config;
  }
  
  /**
   * Generate a trading signal from indicators
   */
  generate(indicators: Indicators): Signal {
    const breakdown: SignalBreakdown[] = [];
    let score = 0;
    
    // Get active weights
    const weights = this.getActiveWeights();
    
    // RSI
    score += this.evaluateRSI(indicators.rsi, weights.rsi, breakdown);
    
    // Williams %R
    score += this.evaluateWilliamsR(indicators.williamsR, weights.williamsR, breakdown);
    
    // MACD
    score += this.evaluateMACD(indicators, weights.macd, breakdown);
    
    // Awesome Oscillator
    score += this.evaluateAO(indicators.ao, weights.ao, breakdown);
    
    // EMA Trend
    score += this.evaluateEMATrend(indicators, weights.emaTrend, breakdown);
    
    // Stochastic
    score += this.evaluateStochastic(indicators, weights.stochastic, breakdown);
    
    // Bollinger Bands
    score += this.evaluateBollinger(indicators, weights.bollinger, breakdown);
    
    // KDJ (if enabled and available)
    if (weights.kdj && indicators.kdjK !== undefined) {
      score += this.evaluateKDJ(indicators, weights.kdj, breakdown);
    }
    
    // ADX (if enabled and available)
    if (weights.adx && indicators.adx !== undefined) {
      score += this.evaluateADX(indicators, weights.adx, breakdown);
    }
    
    // OBV (if enabled and available)
    if (weights.obv && indicators.obv !== undefined) {
      score += this.evaluateOBV(indicators, weights.obv, breakdown);
    }
    
    // Determine signal type and confidence
    const { type, confidence } = this.classifySignal(score);
    
    return {
      type,
      score,
      confidence,
      breakdown,
      timestamp: Date.now()
    };
  }
  
  /**
   * Get active weights from configuration
   */
  private getActiveWeights() {
    const { weights, profiles, activeProfile } = this.config;
    
    if (activeProfile && activeProfile !== 'default' && profiles && profiles[activeProfile]) {
      return profiles[activeProfile];
    }
    
    return weights;
  }
  
  /**
   * Evaluate RSI indicator
   */
  private evaluateRSI(rsi: number, config: any, breakdown: SignalBreakdown[]): number {
    const { max, oversold, oversoldMild, overbought, overboughtMild } = config;
    
    if (rsi < oversold) {
      breakdown.push({
        indicator: 'RSI',
        value: rsi.toFixed(1),
        contribution: max,
        reason: `Oversold (<${oversold})`,
        type: 'bullish'
      });
      return max;
    } else if (rsi < oversoldMild) {
      const contribution = Math.round(max * 0.6);
      breakdown.push({
        indicator: 'RSI',
        value: rsi.toFixed(1),
        contribution,
        reason: 'Approaching oversold',
        type: 'bullish'
      });
      return contribution;
    } else if (rsi > overbought) {
      breakdown.push({
        indicator: 'RSI',
        value: rsi.toFixed(1),
        contribution: -max,
        reason: `Overbought (>${overbought})`,
        type: 'bearish'
      });
      return -max;
    } else if (rsi > overboughtMild) {
      const contribution = -Math.round(max * 0.6);
      breakdown.push({
        indicator: 'RSI',
        value: rsi.toFixed(1),
        contribution,
        reason: 'Approaching overbought',
        type: 'bearish'
      });
      return contribution;
    } else {
      breakdown.push({
        indicator: 'RSI',
        value: rsi.toFixed(1),
        contribution: 0,
        reason: `Neutral (${oversoldMild}-${overboughtMild})`,
        type: 'neutral'
      });
      return 0;
    }
  }
  
  /**
   * Evaluate Williams %R indicator
   */
  private evaluateWilliamsR(williamsR: number, config: any, breakdown: SignalBreakdown[]): number {
    const { max, oversold, overbought } = config;
    
    if (williamsR < oversold) {
      breakdown.push({
        indicator: 'Williams %R',
        value: williamsR.toFixed(1),
        contribution: max,
        reason: `Oversold (<${oversold})`,
        type: 'bullish'
      });
      return max;
    } else if (williamsR > overbought) {
      breakdown.push({
        indicator: 'Williams %R',
        value: williamsR.toFixed(1),
        contribution: -max,
        reason: `Overbought (>${overbought})`,
        type: 'bearish'
      });
      return -max;
    } else {
      breakdown.push({
        indicator: 'Williams %R',
        value: williamsR.toFixed(1),
        contribution: 0,
        reason: 'Neutral',
        type: 'neutral'
      });
      return 0;
    }
  }
  
  /**
   * Evaluate MACD indicator
   */
  private evaluateMACD(indicators: Indicators, config: any, breakdown: SignalBreakdown[]): number {
    const { max } = config;
    const { macd, macdHistogram } = indicators;
    
    if (macd > 0 && macdHistogram > 0) {
      breakdown.push({
        indicator: 'MACD',
        value: macd.toFixed(2),
        contribution: max,
        reason: 'Bullish momentum',
        type: 'bullish'
      });
      return max;
    } else if (macd < 0 && macdHistogram < 0) {
      breakdown.push({
        indicator: 'MACD',
        value: macd.toFixed(2),
        contribution: -max,
        reason: 'Bearish momentum',
        type: 'bearish'
      });
      return -max;
    } else {
      breakdown.push({
        indicator: 'MACD',
        value: macd.toFixed(2),
        contribution: 0,
        reason: 'Neutral/Crossover',
        type: 'neutral'
      });
      return 0;
    }
  }
  
  /**
   * Evaluate Awesome Oscillator
   */
  private evaluateAO(ao: number, config: any, breakdown: SignalBreakdown[]): number {
    const { max } = config;
    
    if (ao > 0) {
      breakdown.push({
        indicator: 'AO',
        value: ao.toFixed(2),
        contribution: max,
        reason: 'Positive momentum',
        type: 'bullish'
      });
      return max;
    } else {
      breakdown.push({
        indicator: 'AO',
        value: ao.toFixed(2),
        contribution: -max,
        reason: 'Negative momentum',
        type: 'bearish'
      });
      return -max;
    }
  }
  
  /**
   * Evaluate EMA Trend
   */
  private evaluateEMATrend(indicators: Indicators, config: any, breakdown: SignalBreakdown[]): number {
    const { max } = config;
    const { ema50, ema200 } = indicators;
    
    if (ema50 > ema200) {
      breakdown.push({
        indicator: 'EMA Trend',
        value: 'EMA50 > EMA200',
        contribution: max,
        reason: 'Bullish trend (Golden Cross)',
        type: 'bullish'
      });
      return max;
    } else if (ema50 < ema200) {
      breakdown.push({
        indicator: 'EMA Trend',
        value: 'EMA50 < EMA200',
        contribution: -max,
        reason: 'Bearish trend (Death Cross)',
        type: 'bearish'
      });
      return -max;
    } else {
      breakdown.push({
        indicator: 'EMA Trend',
        value: 'EMA50 ≈ EMA200',
        contribution: 0,
        reason: 'Neutral',
        type: 'neutral'
      });
      return 0;
    }
  }
  
  /**
   * Evaluate Stochastic
   */
  private evaluateStochastic(indicators: Indicators, config: any, breakdown: SignalBreakdown[]): number {
    const { max, oversold, overbought } = config;
    const { stochK, stochD } = indicators;
    
    if (stochK < oversold && stochK > stochD) {
      breakdown.push({
        indicator: 'Stochastic',
        value: stochK.toFixed(1),
        contribution: max,
        reason: 'Oversold + bullish crossover',
        type: 'bullish'
      });
      return max;
    } else if (stochK > overbought && stochK < stochD) {
      breakdown.push({
        indicator: 'Stochastic',
        value: stochK.toFixed(1),
        contribution: -max,
        reason: 'Overbought + bearish crossover',
        type: 'bearish'
      });
      return -max;
    } else {
      breakdown.push({
        indicator: 'Stochastic',
        value: stochK.toFixed(1),
        contribution: 0,
        reason: 'Neutral',
        type: 'neutral'
      });
      return 0;
    }
  }
  
  /**
   * Evaluate Bollinger Bands
   */
  private evaluateBollinger(indicators: Indicators, config: any, breakdown: SignalBreakdown[]): number {
    const { max } = config;
    const { price, bollingerLower, bollingerUpper } = indicators;
    
    if (price < bollingerLower) {
      breakdown.push({
        indicator: 'Bollinger',
        value: 'Below lower',
        contribution: max,
        reason: 'Price below lower band',
        type: 'bullish'
      });
      return max;
    } else if (price > bollingerUpper) {
      breakdown.push({
        indicator: 'Bollinger',
        value: 'Above upper',
        contribution: -max,
        reason: 'Price above upper band',
        type: 'bearish'
      });
      return -max;
    } else {
      breakdown.push({
        indicator: 'Bollinger',
        value: 'Within bands',
        contribution: 0,
        reason: 'Price within bands',
        type: 'neutral'
      });
      return 0;
    }
  }
  
  /**
   * Evaluate KDJ indicator
   */
  private evaluateKDJ(indicators: Indicators, config: any, breakdown: SignalBreakdown[]): number {
    const { max, oversold = 20, overbought = 80 } = config;
    const { kdjK = 50, kdjD = 50, kdjJ = 50 } = indicators;
    
    // Extreme J value (strongly oversold/overbought)
    if (kdjJ < 0) {
      breakdown.push({
        indicator: 'KDJ',
        value: `J: ${kdjJ.toFixed(1)}`,
        contribution: max,
        reason: 'J line extreme oversold',
        type: 'bullish'
      });
      return max;
    } else if (kdjJ > 100) {
      breakdown.push({
        indicator: 'KDJ',
        value: `J: ${kdjJ.toFixed(1)}`,
        contribution: -max,
        reason: 'J line extreme overbought',
        type: 'bearish'
      });
      return -max;
    }
    
    // K and D both oversold with bullish crossover
    if (kdjK < oversold && kdjD < oversold && kdjK > kdjD) {
      breakdown.push({
        indicator: 'KDJ',
        value: `K: ${kdjK.toFixed(1)}`,
        contribution: max,
        reason: 'Oversold with bullish crossover',
        type: 'bullish'
      });
      return max;
    }
    
    // K and D both overbought with bearish crossover
    if (kdjK > overbought && kdjD > overbought && kdjK < kdjD) {
      breakdown.push({
        indicator: 'KDJ',
        value: `K: ${kdjK.toFixed(1)}`,
        contribution: -max,
        reason: 'Overbought with bearish crossover',
        type: 'bearish'
      });
      return -max;
    }
    
    breakdown.push({
      indicator: 'KDJ',
      value: `K: ${kdjK.toFixed(1)}`,
      contribution: 0,
      reason: 'Neutral',
      type: 'neutral'
    });
    return 0;
  }
  
  /**
   * Evaluate ADX indicator (trend strength filter)
   */
  private evaluateADX(indicators: Indicators, config: any, breakdown: SignalBreakdown[]): number {
    const { max } = config;
    const { adx = 0, diPlus = 0, diMinus = 0 } = indicators;
    
    // Weak trend (ranging) - penalize trading
    if (adx < 20) {
      breakdown.push({
        indicator: 'ADX',
        value: adx.toFixed(1),
        contribution: 0,
        reason: 'Weak trend (ranging market)',
        type: 'neutral'
      });
      return 0;
    }
    
    // Strong uptrend
    if (adx >= 25 && diPlus > diMinus) {
      const strength = Math.min(1, adx / 50);
      const contribution = Math.round(max * strength);
      breakdown.push({
        indicator: 'ADX',
        value: adx.toFixed(1),
        contribution,
        reason: 'Strong uptrend confirmed',
        type: 'bullish'
      });
      return contribution;
    }
    
    // Strong downtrend
    if (adx >= 25 && diMinus > diPlus) {
      const strength = Math.min(1, adx / 50);
      const contribution = -Math.round(max * strength);
      breakdown.push({
        indicator: 'ADX',
        value: adx.toFixed(1),
        contribution,
        reason: 'Strong downtrend confirmed',
        type: 'bearish'
      });
      return contribution;
    }
    
    breakdown.push({
      indicator: 'ADX',
      value: adx.toFixed(1),
      contribution: 0,
      reason: 'Developing trend',
      type: 'neutral'
    });
    return 0;
  }
  
  /**
   * Evaluate OBV indicator
   */
  private evaluateOBV(indicators: Indicators, config: any, breakdown: SignalBreakdown[]): number {
    const { max } = config;
    const { obv = 0, obvEma = 0 } = indicators;
    
    // Only meaningful if we have EMA to compare
    if (!obvEma || obvEma === 0) {
      breakdown.push({
        indicator: 'OBV',
        value: obv.toFixed(0),
        contribution: 0,
        reason: 'Insufficient data',
        type: 'neutral'
      });
      return 0;
    }
    
    const ratio = obv / obvEma;
    const deviation = (ratio - 1) * 100;
    
    // OBV significantly above its EMA (strong buying pressure)
    if (deviation > 5) {
      const strength = Math.min(1, deviation / 10);
      const contribution = Math.round(max * strength);
      breakdown.push({
        indicator: 'OBV',
        value: `${deviation.toFixed(1)}% above EMA`,
        contribution,
        reason: 'Strong buying pressure',
        type: 'bullish'
      });
      return contribution;
    }
    
    // OBV significantly below its EMA (strong selling pressure)
    if (deviation < -5) {
      const strength = Math.min(1, Math.abs(deviation) / 10);
      const contribution = -Math.round(max * strength);
      breakdown.push({
        indicator: 'OBV',
        value: `${deviation.toFixed(1)}% below EMA`,
        contribution,
        reason: 'Strong selling pressure',
        type: 'bearish'
      });
      return contribution;
    }
    
    breakdown.push({
      indicator: 'OBV',
      value: 'Near EMA',
      contribution: 0,
      reason: 'Neutral volume',
      type: 'neutral'
    });
    return 0;
  }
  
  /**
   * Classify signal based on score
   */
  private classifySignal(score: number): { type: SignalType; confidence: ConfidenceLevel } {
    const thresholds = this.config.thresholds;
    
    let type: SignalType = 'NEUTRAL';
    let confidence: ConfidenceLevel = 'LOW';
    
    if (score >= thresholds.strongBuy) {
      type = 'STRONG_BUY';
      confidence = 'HIGH';
    } else if (score >= thresholds.buy) {
      type = 'BUY';
      confidence = 'MEDIUM';
    } else if (score >= thresholds.buyWeak) {
      type = 'BUY';
      confidence = 'LOW';
    } else if (score <= thresholds.strongSell) {
      type = 'STRONG_SELL';
      confidence = 'HIGH';
    } else if (score <= thresholds.sell) {
      type = 'SELL';
      confidence = 'MEDIUM';
    } else if (score <= thresholds.sellWeak) {
      type = 'SELL';
      confidence = 'LOW';
    }
    
    return { type, confidence };
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: Partial<SignalConfig>): void {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * Get current configuration
   */
  getConfig(): SignalConfig {
    return { ...this.config };
  }
}

export default SignalGenerator;
