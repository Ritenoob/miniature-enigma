/**
 * SIGNAL WEIGHTS CONFIGURATION
 * Adjust indicator importance here
 * Total points should add up to ~100-120
 */

module.exports = {
  // Current weights (your v3.5.0 defaults)
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
      bollinger: { max: 5 }
    },

    // Aggressive - Favor momentum indicators
    aggressive: {
      rsi: { max: 30, oversold: 30, oversoldMild: 40, overbought: 70, overboughtMild: 60 },
      williamsR: { max: 25, oversold: -80, overbought: -20 },
      macd: { max: 15 },
      ao: { max: 20 },
      emaTrend: { max: 10 },  // Lower weight on trend
      stochastic: { max: 15, oversold: 20, overbought: 80 },
      bollinger: { max: 5 }
    },

    // Balanced - Equal distribution
    balanced: {
      rsi: { max: 20, oversold: 30, oversoldMild: 40, overbought: 70, overboughtMild: 60 },
      williamsR: { max: 15, oversold: -80, overbought: -20 },
      macd: { max: 15 },
      ao: { max: 15 },
      emaTrend: { max: 15 },
      stochastic: { max: 10, oversold: 20, overbought: 80 },
      bollinger: { max: 10 }
    },

    // Scalping - Quick signals
    scalping: {
      rsi: { max: 20, oversold: 35, oversoldMild: 45, overbought: 65, overboughtMild: 55 },  // Tighter levels
      williamsR: { max: 25, oversold: -75, overbought: -25 },  // Tighter levels
      macd: { max: 10 },  // Less weight on slower indicator
      ao: { max: 20 },
      emaTrend: { max: 5 },  // Trend less important for scalping
      stochastic: { max: 15, oversold: 25, overbought: 75 },  // Tighter levels
      bollinger: { max: 5 }
    },

    // Swing Trading - Longer timeframes
    swingTrading: {
      rsi: { max: 20, oversold: 25, oversoldMild: 35, overbought: 75, overboughtMild: 65 },  // Wider levels
      williamsR: { max: 15, oversold: -85, overbought: -15 },  // Wider levels
      macd: { max: 30 },  // High weight - important for swings
      ao: { max: 15 },
      emaTrend: { max: 25 },  // Trend very important
      stochastic: { max: 5, oversold: 15, overbought: 85 },  // Wider levels
      bollinger: { max: 10 }
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
