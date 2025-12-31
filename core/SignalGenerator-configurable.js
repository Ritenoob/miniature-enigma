/**
 * CONFIGURABLE SIGNAL GENERATOR
 * Generates trading signals based on configurable indicator weights
 * Supports KDJ, OBV, DOM integration
 */

class SignalGenerator {
  constructor(weightsConfig) {
    this.weightsConfig = weightsConfig;
    this.activeWeights = this.getActiveWeights();
  }

  /**
   * Get active weight configuration
   */
  getActiveWeights() {
    const profile = this.weightsConfig.activeProfile || 'default';
    if (profile === 'default') {
      return this.weightsConfig.weights;
    }
    return this.weightsConfig.profiles[profile] || this.weightsConfig.weights;
  }

  /**
   * Generate signal from all indicators
   * @param {Object} indicators - Indicator values
   * @returns {Object} { score, signal, strength, breakdown }
   */
  generateSignal(indicators) {
    const breakdown = {};
    let totalScore = 0;

    // RSI
    if (indicators.rsi !== undefined && this.activeWeights.rsi) {
      breakdown.rsi = this.calculateRSIScore(indicators.rsi, this.activeWeights.rsi);
      totalScore += breakdown.rsi;
    }

    // Williams %R
    if (indicators.williamsR !== undefined && this.activeWeights.williamsR) {
      breakdown.williamsR = this.calculateWilliamsRScore(indicators.williamsR, this.activeWeights.williamsR);
      totalScore += breakdown.williamsR;
    }

    // MACD
    if (indicators.macd !== undefined && this.activeWeights.macd) {
      breakdown.macd = this.calculateMACDScore(indicators.macd, this.activeWeights.macd);
      totalScore += breakdown.macd;
    }

    // Awesome Oscillator
    if (indicators.ao !== undefined && this.activeWeights.ao) {
      breakdown.ao = this.calculateAOScore(indicators.ao, this.activeWeights.ao);
      totalScore += breakdown.ao;
    }

    // EMA Trend
    if (indicators.emaTrend !== undefined && this.activeWeights.emaTrend) {
      breakdown.emaTrend = this.calculateEmaTrendScore(indicators.emaTrend, this.activeWeights.emaTrend);
      totalScore += breakdown.emaTrend;
    }

    // Stochastic
    if (indicators.stochastic !== undefined && this.activeWeights.stochastic) {
      breakdown.stochastic = this.calculateStochasticScore(indicators.stochastic, this.activeWeights.stochastic);
      totalScore += breakdown.stochastic;
    }

    // Bollinger Bands
    if (indicators.bollinger !== undefined && this.activeWeights.bollinger) {
      breakdown.bollinger = this.calculateBollingerScore(indicators.bollinger, this.activeWeights.bollinger);
      totalScore += breakdown.bollinger;
    }

    // KDJ (Stochastic with J line)
    if (indicators.kdj !== undefined && this.activeWeights.kdj) {
      breakdown.kdj = this.calculateKDJScore(indicators.kdj, this.activeWeights.kdj);
      totalScore += breakdown.kdj;
    }

    // OBV (On-Balance Volume)
    if (indicators.obv !== undefined && this.activeWeights.obv) {
      breakdown.obv = this.calculateOBVScore(indicators.obv, this.activeWeights.obv);
      totalScore += breakdown.obv;
    }

    // DOM (Depth of Market) - only if enabled and live data available
    if (indicators.dom !== undefined && this.activeWeights.dom && this.activeWeights.dom.enabled) {
      breakdown.dom = this.calculateDOMScore(indicators.dom, this.activeWeights.dom);
      totalScore += breakdown.dom;
    }

    // Determine signal and strength
    const { signal, strength } = this.determineSignal(totalScore);

    return {
      score: totalScore,
      signal,
      strength,
      breakdown,
      timestamp: Date.now()
    };
  }

  /**
   * Calculate RSI score
   */
  calculateRSIScore(rsi, config) {
    const { max, oversold, oversoldMild, overbought, overboughtMild } = config;

    if (rsi <= oversold) {
      return max; // Strong bullish
    } else if (rsi <= oversoldMild) {
      // Linear interpolation between oversold and oversoldMild
      const ratio = (oversoldMild - rsi) / (oversoldMild - oversold);
      return (max * 0.7) * (ratio);
    } else if (rsi >= overbought) {
      return -max; // Strong bearish
    } else if (rsi >= overboughtMild) {
      // Linear interpolation between overboughtMild and overbought
      const ratio = (rsi - overboughtMild) / (overbought - overboughtMild);
      return (-max * 0.7) * (ratio);
    }

    return 0; // Neutral
  }

  /**
   * Calculate Williams %R score
   */
  calculateWilliamsRScore(williamsR, config) {
    const { max, oversold, overbought } = config;

    if (williamsR <= oversold) {
      return max; // Oversold = bullish
    } else if (williamsR <= oversold + (overbought - oversold) * 0.3) {
      const ratio = (williamsR - oversold) / ((overbought - oversold) * 0.3);
      return (max) * (1 - ratio);
    } else if (williamsR >= overbought) {
      return -max; // Overbought = bearish
    } else if (williamsR >= overbought - (overbought - oversold) * 0.3) {
      const ratio = (williamsR - (overbought - (overbought - oversold) * 0.3)) / ((overbought - oversold) * 0.3);
      return (-max) * (ratio);
    }

    return 0;
  }

  /**
   * Calculate MACD score
   */
  calculateMACDScore(macd, config) {
    const { max } = config;
    const { macdLine, signalLine, histogram } = macd;

    let score = 0;

    // MACD crosses above signal = bullish
    if (histogram > 0) {
      score = (max) * (Math.min(1, histogram / 10));
    } else {
      score = (-max) * (Math.min(1, Math.abs(histogram) / 10));
    }

    return score;
  }

  /**
   * Calculate Awesome Oscillator score
   */
  calculateAOScore(ao, config) {
    const { max } = config;
    
    if (ao > 0) {
      return (max) * (Math.min(1, ao / 50));
    } else {
      return (-max) * (Math.min(1, Math.abs(ao) / 50));
    }
  }

  /**
   * Calculate EMA Trend score
   */
  calculateEmaTrendScore(emaTrend, config) {
    const { max } = config;
    const { price, emaFast, emaSlow } = emaTrend;

    let score = 0;

    // Price above both EMAs = bullish
    if (price > emaFast && emaFast > emaSlow) {
      score = max;
    } else if (price < emaFast && emaFast < emaSlow) {
      score = -max;
    } else if (price > emaFast) {
      score = (max) * (0.5);
    } else if (price < emaFast) {
      score = (-max) * (0.5);
    }

    return score;
  }

  /**
   * Calculate Stochastic score
   */
  calculateStochasticScore(stochastic, config) {
    const { max, oversold, overbought } = config;
    const { k, d } = stochastic;

    if (k <= oversold && d <= oversold) {
      return max;
    } else if (k >= overbought && d >= overbought) {
      return -max;
    } else if (k <= oversold || d <= oversold) {
      return (max) * (0.6);
    } else if (k >= overbought || d >= overbought) {
      return (-max) * (0.6);
    }

    return 0;
  }

  /**
   * Calculate Bollinger Bands score
   */
  calculateBollingerScore(bollinger, config) {
    const { max } = config;
    const { price, upper, lower, middle } = bollinger;

    const width = upper - lower;
    const position = (price - lower) / width;

    if (position <= 0.2) {
      return max; // Near lower band = bullish
    } else if (position >= 0.8) {
      return -max; // Near upper band = bearish
    }

    return 0;
  }

  /**
   * Calculate KDJ score (Stochastic with J line)
   */
  calculateKDJScore(kdj, config) {
    const { max, jOversold, jOverbought } = config;
    const { j, k, d } = kdj;

    let score = 0;

    // J line is most sensitive
    if (j <= jOversold) {
      score = max;
    } else if (j >= jOverbought) {
      score = -max;
    } else {
      // Moderate signal based on position
      const range = jOverbought - jOversold;
      const position = (j - jOversold) / range;
      score = (max) * (0.5 - position);
    }

    return score;
  }

  /**
   * Calculate OBV score (On-Balance Volume)
   */
  calculateOBVScore(obv, config) {
    const { max } = config;
    const { obvValue, obvSlope, obvEma } = obv;

    let score = 0;

    // Positive slope = accumulation = bullish
    if (obvSlope > 0) {
      score = (max) * (Math.min(1, obvSlope / 100));
    } else {
      score = (-max) * (Math.min(1, Math.abs(obvSlope) / 100));
    }

    // Boost if OBV above EMA
    if (obvValue > obvEma) {
      score = (score) * (1.2);
    } else {
      score = (score) * (0.8);
    }

    return Math.max(-max, Math.min(max, score));
  }

  /**
   * Calculate DOM score (Depth of Market)
   * NOTE: This requires live order book data via WebSocket
   */
  calculateDOMScore(dom, config) {
    if (!config.enabled) return 0;

    const { max, imbalanceThreshold } = config;
    const { imbalance, spread, microprice } = dom;

    let score = 0;

    // Imbalance: positive = more bids = bullish
    if (Math.abs(imbalance) >= imbalanceThreshold) {
      score = (max) * (imbalance);
    } else {
      score = (max * 0.5) * (imbalance);
    }

    return score;
  }

  /**
   * Determine signal and strength from total score
   */
  determineSignal(score) {
    const thresholds = this.weightsConfig.thresholds;

    if (score >= thresholds.strongBuy) {
      return { signal: 'STRONG_BUY', strength: 'strong' };
    } else if (score >= thresholds.buy) {
      return { signal: 'BUY', strength: 'moderate' };
    } else if (score >= thresholds.buyWeak) {
      return { signal: 'BUY', strength: 'weak' };
    } else if (score <= thresholds.strongSell) {
      return { signal: 'STRONG_SELL', strength: 'strong' };
    } else if (score <= thresholds.sell) {
      return { signal: 'SELL', strength: 'moderate' };
    } else if (score <= thresholds.sellWeak) {
      return { signal: 'SELL', strength: 'weak' };
    } else {
      return { signal: 'NEUTRAL', strength: 'none' };
    }
  }

  /**
   * Switch active profile
   */
  switchProfile(profileName) {
    if (profileName === 'default' || this.weightsConfig.profiles[profileName]) {
      this.weightsConfig.activeProfile = profileName;
      this.activeWeights = this.getActiveWeights();
      return true;
    }
    return false;
  }
}

module.exports = SignalGenerator;
