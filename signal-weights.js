/**
 * SIGNAL WEIGHTS CONFIGURATION
 * Adjust indicator importance here
 * Total points should add up to ~100-120
 */

module.exports = {
  // Current weights (your v3.4.2 defaults)
  weights: {
    // RSI - Relative Strength Index (Momentum)
    rsi: {
      max: 25,           // Maximum points for RSI
      oversold: 30,      // Below this = bullish
      oversoldMild: 40,  // Approaching oversold
      overbought: 70,    // Above this = bearish
      overboughtMild: 60 // Approaching overbought
    },

    // Williams %R - Momentum oscillator
    williamsR: {
      max: 20,
      oversold: -80,
      overbought: -20
    },

    // MACD - Trend following
    macd: {
      max: 20
    },

    // Awesome Oscillator - Momentum
    ao: {
      max: 15
    },

    // EMA Trend - Long-term direction
    emaTrend: {
      max: 20
    },

    // Stochastic - Momentum + crossovers
    stochastic: {
      max: 10,
      oversold: 20,
      overbought: 80
    },

    // Bollinger Bands - Volatility
    bollinger: {
      max: 10
    },

    // KDJ - Stochastic derivative with J line
    kdj: {
      max: 15,
      oversold: 20,      // Below this = bullish
      overbought: 80,    // Above this = bearish
      jOversold: 0,      // J line oversold
      jOverbought: 100   // J line overbought
    },

    // OBV - On Balance Volume (with optional smoothing)
    obv: {
      max: 10,
      slopeThreshold: 0, // Slope threshold for trend determination
      useSmoothing: true,
      smoothingPeriod: 10
    },

    // DOM - Depth of Market (order book)
    dom: {
      max: 15,
      imbalanceThreshold: 0.3,  // 30% imbalance threshold
      spreadThreshold: 0.02,    // 2% spread threshold
      wallSizeMultiplier: 3.0   // Wall detection multiplier
    },

    // ADX - Average Directional Index (trend strength)
    adx: {
      max: 10,
      trendThreshold: 25,  // Above this = trending
      strongTrend: 40,     // Above this = strong trend
      period: 14
    }
  },

  // Alternative weight profiles you can switch to
  profiles: {
    // Conservative - Favor trend indicators
    conservative: {
      rsi: { max: 15, oversold: 30, oversoldMild: 40, overbought: 70, overboughtMild: 60 },
      williamsR: { max: 10, oversold: -80, overbought: -20 },
      macd: { max: 25 },  // Higher weight on MACD
      ao: { max: 10 },
      emaTrend: { max: 30 },  // Much higher weight on trend
      stochastic: { max: 5, oversold: 20, overbought: 80 },
      bollinger: { max: 5 },
      kdj: { max: 8, oversold: 20, overbought: 80, jOversold: 0, jOverbought: 100 },
      obv: { max: 12, slopeThreshold: 0, useSmoothing: true, smoothingPeriod: 10 },
      dom: { max: 10, imbalanceThreshold: 0.3, spreadThreshold: 0.02, wallSizeMultiplier: 3.0 },
      adx: { max: 15, trendThreshold: 25, strongTrend: 40, period: 14 }
    },

    // Aggressive - Favor momentum indicators
    aggressive: {
      rsi: { max: 30, oversold: 30, oversoldMild: 40, overbought: 70, overboughtMild: 60 },
      williamsR: { max: 25, oversold: -80, overbought: -20 },
      macd: { max: 15 },
      ao: { max: 20 },
      emaTrend: { max: 10 },  // Lower weight on trend
      stochastic: { max: 15, oversold: 20, overbought: 80 },
      bollinger: { max: 5 },
      kdj: { max: 18, oversold: 25, overbought: 75, jOversold: 5, jOverbought: 95 },
      obv: { max: 8, slopeThreshold: 0, useSmoothing: true, smoothingPeriod: 10 },
      dom: { max: 12, imbalanceThreshold: 0.25, spreadThreshold: 0.02, wallSizeMultiplier: 3.0 },
      adx: { max: 7, trendThreshold: 25, strongTrend: 40, period: 14 }
    },

    // Balanced - Equal distribution
    balanced: {
      rsi: { max: 20, oversold: 30, oversoldMild: 40, overbought: 70, overboughtMild: 60 },
      williamsR: { max: 15, oversold: -80, overbought: -20 },
      macd: { max: 15 },
      ao: { max: 15 },
      emaTrend: { max: 15 },
      stochastic: { max: 10, oversold: 20, overbought: 80 },
      bollinger: { max: 10 },
      kdj: { max: 12, oversold: 20, overbought: 80, jOversold: 0, jOverbought: 100 },
      obv: { max: 10, slopeThreshold: 0, useSmoothing: true, smoothingPeriod: 10 },
      dom: { max: 12, imbalanceThreshold: 0.3, spreadThreshold: 0.02, wallSizeMultiplier: 3.0 },
      adx: { max: 10, trendThreshold: 25, strongTrend: 40, period: 14 }
    },

    // Scalping - Quick signals
    scalping: {
      rsi: { max: 20, oversold: 35, oversoldMild: 45, overbought: 65, overboughtMild: 55 },  // Tighter levels
      williamsR: { max: 25, oversold: -75, overbought: -25 },  // Tighter levels
      macd: { max: 10 },  // Less weight on slower indicator
      ao: { max: 20 },
      emaTrend: { max: 5 },  // Trend less important for scalping
      stochastic: { max: 15, oversold: 25, overbought: 75 },  // Tighter levels
      bollinger: { max: 5 },
      kdj: { max: 20, oversold: 30, overbought: 70, jOversold: 10, jOverbought: 90 },
      obv: { max: 5, slopeThreshold: 0, useSmoothing: true, smoothingPeriod: 5 },
      dom: { max: 15, imbalanceThreshold: 0.25, spreadThreshold: 0.015, wallSizeMultiplier: 2.5 },
      adx: { max: 5, trendThreshold: 20, strongTrend: 35, period: 10 }
    },

    // Swing Trading - Longer timeframes
    swingTrading: {
      rsi: { max: 20, oversold: 25, oversoldMild: 35, overbought: 75, overboughtMild: 65 },  // Wider levels
      williamsR: { max: 15, oversold: -85, overbought: -15 },  // Wider levels
      macd: { max: 30 },  // High weight - important for swings
      ao: { max: 15 },
      emaTrend: { max: 25 },  // Trend very important
      stochastic: { max: 5, oversold: 15, overbought: 85 },  // Wider levels
      bollinger: { max: 10 },
      kdj: { max: 10, oversold: 15, overbought: 85, jOversold: 0, jOverbought: 100 },
      obv: { max: 15, slopeThreshold: 0, useSmoothing: true, smoothingPeriod: 20 },
      dom: { max: 8, imbalanceThreshold: 0.35, spreadThreshold: 0.025, wallSizeMultiplier: 3.5 },
      adx: { max: 12, trendThreshold: 25, strongTrend: 40, period: 14 }
    }
  },

  // Active profile (change this to switch)
  activeProfile: 'default',  // Options: 'default', 'conservative', 'aggressive', 'balanced', 'scalping', 'swingTrading'

  // Signal thresholds
  thresholds: {
    strongBuy: 70,    // Score >= this = STRONG_BUY
    buy: 50,          // Score >= this = BUY
    buyWeak: 30,      // Score >= this = BUY (weak)
    strongSell: -70,  // Score <= this = STRONG_SELL
    sell: -50,        // Score <= this = SELL
    sellWeak: -30     // Score <= this = SELL (weak)
  }
};
