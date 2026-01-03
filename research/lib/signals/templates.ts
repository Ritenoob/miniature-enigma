/**
 * Strategy Templates
 * Pre-configured signal strategies for different market approaches
 */

import { StrategyProfile, SignalConfig, Weights, RegimeType } from '../types';

/**
 * T1: Mean Reversion / Extremes Strategy
 * Uses RSI, W%R, BB with ADX range filter
 */
export const T1_MEAN_REVERSION: StrategyProfile = {
  name: 'T1 Mean Reversion',
  description: 'Trades oversold/overbought extremes in ranging markets',
  template: 'T1_mean_reversion',
  signalConfig: {
    weights: {
      rsi: { max: 30, oversold: 30, oversoldMild: 40, overbought: 70, overboughtMild: 60 },
      williamsR: { max: 25, oversold: -80, overbought: -20 },
      macd: { max: 10 },
      ao: { max: 10 },
      emaTrend: { max: 5 },
      stochastic: { max: 15, oversold: 20, overbought: 80 },
      bollinger: { max: 15 },
      kdj: { max: 10, oversold: 20, overbought: 80 },
      adx: { max: -10 } // Negative weight = prefer low ADX (ranging)
    },
    thresholds: {
      strongBuy: 70,
      buy: 50,
      buyWeak: 30,
      strongSell: -70,
      sell: -50,
      sellWeak: -30
    }
  },
  backtestConfig: {
    leverage: 10,
    stopLossROI: 0.5,
    takeProfitROI: 1.5,
    maxPositions: 3,
    cooldownBars: 5,
    useRegimeFilter: true,
    allowedRegimes: ['ranging']
  },
  recommended: {
    symbols: ['BTCUSDT', 'ETHUSDT'],
    timeframes: ['5m', '15m'],
    regimes: ['ranging']
  }
};

/**
 * T2: Trend Continuation Strategy
 * Uses EMA, MACD, ADX/DI with OBV confirmation
 */
export const T2_TREND_CONTINUATION: StrategyProfile = {
  name: 'T2 Trend Continuation',
  description: 'Follows strong trends with momentum confirmation',
  template: 'T2_trend_continuation',
  signalConfig: {
    weights: {
      rsi: { max: 10, oversold: 30, oversoldMild: 40, overbought: 70, overboughtMild: 60 },
      williamsR: { max: 10, oversold: -80, overbought: -20 },
      macd: { max: 30 },
      ao: { max: 15 },
      emaTrend: { max: 30 },
      stochastic: { max: 5, oversold: 20, overbought: 80 },
      bollinger: { max: 5 },
      adx: { max: 20 }, // Positive weight = prefer high ADX (trending)
      obv: { max: 15 }
    },
    thresholds: {
      strongBuy: 65,
      buy: 45,
      buyWeak: 25,
      strongSell: -65,
      sell: -45,
      sellWeak: -25
    }
  },
  backtestConfig: {
    leverage: 15,
    stopLossROI: 0.4,
    takeProfitROI: 2.5,
    maxPositions: 2,
    cooldownBars: 10,
    useRegimeFilter: true,
    allowedRegimes: ['trending']
  },
  recommended: {
    symbols: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
    timeframes: ['15m', '1h'],
    regimes: ['trending']
  }
};

/**
 * T3: Hybrid Score/Voting Strategy
 * Balanced weight distribution with threshold-based entry
 */
export const T3_HYBRID_VOTING: StrategyProfile = {
  name: 'T3 Hybrid Voting',
  description: 'Balanced multi-indicator approach with vote-based signals',
  template: 'T3_hybrid_voting',
  signalConfig: {
    weights: {
      rsi: { max: 20, oversold: 30, oversoldMild: 40, overbought: 70, overboughtMild: 60 },
      williamsR: { max: 15, oversold: -80, overbought: -20 },
      macd: { max: 20 },
      ao: { max: 15 },
      emaTrend: { max: 20 },
      stochastic: { max: 10, oversold: 20, overbought: 80 },
      bollinger: { max: 10 },
      kdj: { max: 10, oversold: 20, overbought: 80 },
      adx: { max: 10 },
      obv: { max: 10 }
    },
    thresholds: {
      strongBuy: 75,
      buy: 55,
      buyWeak: 35,
      strongSell: -75,
      sell: -55,
      sellWeak: -35
    }
  },
  backtestConfig: {
    leverage: 12,
    stopLossROI: 0.45,
    takeProfitROI: 2.0,
    maxPositions: 4,
    cooldownBars: 3,
    useRegimeFilter: false
  },
  recommended: {
    symbols: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT'],
    timeframes: ['5m', '15m', '1h'],
    regimes: ['trending', 'ranging', 'high_volatility']
  }
};

/**
 * T4: Order Flow Gate Strategy
 * Base signal + DOM gate (LIVE-ONLY validation)
 * Note: DOM features cannot be backtested historically
 */
export const T4_ORDER_FLOW_GATE: StrategyProfile = {
  name: 'T4 Order Flow Gate',
  description: 'Technical signals confirmed by order book imbalance (LIVE-ONLY)',
  template: 'T4_order_flow_gate',
  signalConfig: {
    weights: {
      rsi: { max: 20, oversold: 30, oversoldMild: 40, overbought: 70, overboughtMild: 60 },
      williamsR: { max: 15, oversold: -80, overbought: -20 },
      macd: { max: 20 },
      ao: { max: 15 },
      emaTrend: { max: 20 },
      stochastic: { max: 10, oversold: 20, overbought: 80 },
      bollinger: { max: 10 }
    },
    thresholds: {
      strongBuy: 60, // Lower thresholds - DOM provides additional filter
      buy: 40,
      buyWeak: 25,
      strongSell: -60,
      sell: -40,
      sellWeak: -25
    }
  },
  backtestConfig: {
    leverage: 15,
    stopLossROI: 0.4,
    takeProfitROI: 2.2,
    maxPositions: 3,
    cooldownBars: 2,
    useRegimeFilter: false
  },
  recommended: {
    symbols: ['BTCUSDT', 'ETHUSDT'],
    timeframes: ['1m', '5m'],
    regimes: ['trending', 'high_volatility']
  }
};

/**
 * Get all strategy templates
 */
export const STRATEGY_TEMPLATES: Record<string, StrategyProfile> = {
  T1_mean_reversion: T1_MEAN_REVERSION,
  T2_trend_continuation: T2_TREND_CONTINUATION,
  T3_hybrid_voting: T3_HYBRID_VOTING,
  T4_order_flow_gate: T4_ORDER_FLOW_GATE
};

/**
 * Get strategy template by name
 */
export function getStrategyTemplate(name: string): StrategyProfile | undefined {
  return STRATEGY_TEMPLATES[name];
}

/**
 * Get all template names
 */
export function getStrategyTemplateNames(): string[] {
  return Object.keys(STRATEGY_TEMPLATES);
}

/**
 * Create a custom strategy profile
 */
export function createCustomStrategy(
  name: string,
  description: string,
  weights: Weights,
  thresholds?: Partial<SignalConfig['thresholds']>
): StrategyProfile {
  const defaultThresholds = {
    strongBuy: 70,
    buy: 50,
    buyWeak: 30,
    strongSell: -70,
    sell: -50,
    sellWeak: -30
  };
  
  return {
    name,
    description,
    template: 'T3_hybrid_voting',
    signalConfig: {
      weights,
      thresholds: { ...defaultThresholds, ...thresholds }
    },
    backtestConfig: {
      leverage: 10,
      stopLossROI: 0.5,
      takeProfitROI: 2.0,
      maxPositions: 3,
      cooldownBars: 5
    },
    recommended: {
      symbols: [],
      timeframes: [],
      regimes: []
    }
  };
}

export default {
  T1_MEAN_REVERSION,
  T2_TREND_CONTINUATION,
  T3_HYBRID_VOTING,
  T4_ORDER_FLOW_GATE,
  STRATEGY_TEMPLATES,
  getStrategyTemplate,
  getStrategyTemplateNames,
  createCustomStrategy
};
