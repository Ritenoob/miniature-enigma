/**
 * SEARCH SPACE
 * Parameter bounds for optimization
 */

module.exports = {
  // RSI parameters
  rsi: {
    period: { min: 7, max: 21, default: 14 },
    oversold: { min: 20, max: 35, default: 30 },
    overbought: { min: 65, max: 80, default: 70 },
    weight: { min: 0, max: 30, default: 25 }
  },

  // MACD parameters
  macd: {
    fastPeriod: { min: 8, max: 16, default: 12 },
    slowPeriod: { min: 20, max: 32, default: 26 },
    signalPeriod: { min: 7, max: 11, default: 9 },
    weight: { min: 0, max: 30, default: 20 }
  },

  // Williams %R parameters
  williamsR: {
    period: { min: 10, max: 20, default: 14 },
    oversold: { min: -90, max: -70, default: -80 },
    overbought: { min: -30, max: -10, default: -20 },
    weight: { min: 0, max: 30, default: 20 }
  },

  // KDJ parameters
  kdj: {
    kPeriod: { min: 7, max: 14, default: 9 },
    dPeriod: { min: 2, max: 5, default: 3 },
    smooth: { min: 2, max: 5, default: 3 },
    jOversold: { min: 10, max: 30, default: 20 },
    jOverbought: { min: 70, max: 90, default: 80 },
    weight: { min: 0, max: 20, default: 15 }
  },

  // OBV parameters
  obv: {
    slopeWindow: { min: 7, max: 21, default: 14 },
    smoothingEma: { min: 3, max: 8, default: 5 },
    zScoreCap: { min: 1.5, max: 3.0, default: 2.0 },
    weight: { min: 0, max: 15, default: 10 }
  },

  // Signal thresholds
  thresholds: {
    strongBuy: { min: 60, max: 80, default: 70 },
    buy: { min: 40, max: 60, default: 50 },
    strongSell: { min: -80, max: -60, default: -70 },
    sell: { min: -60, max: -40, default: -50 }
  },

  // Risk parameters
  risk: {
    leverage: { min: 1, max: 20, default: 10 },
    stopLossROI: { min: 0.2, max: 1.0, default: 0.5 },
    takeProfitROI: { min: 1.0, max: 4.0, default: 2.0 },
    positionSize: { min: 0.2, max: 1.0, default: 0.5 }
  }
};
