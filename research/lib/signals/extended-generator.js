/**
 * Extended Signal Generator
 * 
 * Includes KDJ, OBV, and DOM indicator scoring.
 * DOM scoring is LIVE-ONLY and never claimed as backtest-optimized.
 */

/**
 * Generate signal from indicators using configurable weights
 */
function generateSignal(indicators, weights) {
  let score = 0;
  const breakdown = [];
  
  // Existing indicators (RSI, W%R, MACD, AO, EMA, Stoch, BB) would be here
  // This is the extended portion with new indicators
  
  // KDJ Scoring
  if (weights.kdj && weights.kdj.max > 0) {
    const kdjContrib = scoreKDJ(indicators.kdj, weights.kdj);
    score += kdjContrib.contribution;
    breakdown.push(kdjContrib);
  }
  
  // OBV Scoring
  if (weights.obv && weights.obv.max > 0) {
    const obvContrib = scoreOBV(indicators.obv, weights.obv);
    score += obvContrib.contribution;
    breakdown.push(obvContrib);
  }
  
  // DOM Scoring (LIVE-ONLY)
  if (weights.dom && weights.dom.enabled && weights.dom.max > 0) {
    if (!weights.dom.liveOnlyValidation) {
      console.warn('[SIGNAL] DOM scoring attempted without liveOnlyValidation flag!');
    }
    const domContrib = scoreDOM(indicators.dom, weights.dom);
    score += domContrib.contribution;
    breakdown.push({
      ...domContrib,
      liveOnly: true,
      warning: 'DOM scores are from LIVE data only, not backtest-optimized'
    });
  }
  
  return { 
    score, 
    breakdown, 
    timestamp: Date.now() 
  };
}

/**
 * Score KDJ indicator
 * 
 * KDJ is a stochastic variant with J-line that measures momentum.
 * J = 3*D - 2*K
 */
function scoreKDJ(kdj, weights) {
  if (!kdj) {
    return {
      indicator: 'KDJ',
      value: 'N/A',
      contribution: 0,
      reason: 'No KDJ data',
      type: 'neutral'
    };
  }
  
  let points = 0;
  let reason = 'Neutral';
  
  // J-line extremes
  if (kdj.j < weights.jOversold) {
    points = weights.max;
    reason = `J oversold (${kdj.j.toFixed(1)} < ${weights.jOversold})`;
  } else if (kdj.j > weights.jOverbought) {
    points = -weights.max;
    reason = `J overbought (${kdj.j.toFixed(1)} > ${weights.jOverbought})`;
  }
  
  // K/D crossover bonus
  if (kdj.kCrossedAboveD) {
    points += weights.crossWeight;
    reason += ' + bullish K/D cross';
  } else if (kdj.kCrossedBelowD) {
    points -= weights.crossWeight;
    reason += ' + bearish K/D cross';
  }
  
  return {
    indicator: 'KDJ',
    value: `K:${kdj.k.toFixed(1)} D:${kdj.d.toFixed(1)} J:${kdj.j.toFixed(1)}`,
    contribution: points,
    reason,
    type: points > 0 ? 'bullish' : points < 0 ? 'bearish' : 'neutral'
  };
}

/**
 * Score OBV indicator
 * 
 * On-Balance Volume measures buying/selling pressure through volume.
 * Rising OBV confirms uptrend, falling OBV confirms downtrend.
 */
function scoreOBV(obv, weights) {
  if (!obv) {
    return {
      indicator: 'OBV',
      value: 'N/A',
      contribution: 0,
      reason: 'No OBV data',
      type: 'neutral'
    };
  }
  
  let points = 0;
  let reason = 'Neutral';
  
  // OBV slope direction
  if (obv.slope > 0 && obv.zscore > 0.5) {
    points = Math.min(weights.max, Math.round(obv.zscore * weights.max / weights.zScoreCap));
    reason = `Rising OBV (slope ${obv.slope.toFixed(2)}, z=${obv.zscore.toFixed(2)})`;
  } else if (obv.slope < 0 && obv.zscore < -0.5) {
    points = Math.max(-weights.max, Math.round(obv.zscore * weights.max / weights.zScoreCap));
    reason = `Falling OBV (slope ${obv.slope.toFixed(2)}, z=${obv.zscore.toFixed(2)})`;
  }
  
  // Trend confirmation check
  if (weights.confirmTrend && obv.confirmsTrend !== undefined && !obv.confirmsTrend) {
    points = Math.round(points * 0.5);  // Reduce if not confirming
    reason += ' (no trend confirm)';
  }
  
  return {
    indicator: 'OBV',
    value: `slope:${obv.slope.toFixed(2)} z:${obv.zscore.toFixed(2)}`,
    contribution: points,
    reason,
    type: points > 0 ? 'bullish' : points < 0 ? 'bearish' : 'neutral'
  };
}

/**
 * Score DOM indicator
 * 
 * WARNING: This is LIVE-ONLY scoring
 * Depth of Market (order book) analysis for real-time entry/exit decisions.
 * NEVER use DOM for backtest optimization - it's only valid for live validation.
 */
function scoreDOM(dom, weights) {
  if (!dom) {
    return {
      indicator: 'DOM',
      value: 'N/A',
      contribution: 0,
      reason: 'No DOM data (LIVE-ONLY)',
      type: 'neutral',
      liveOnly: true
    };
  }
  
  // WARNING: This is LIVE-ONLY scoring
  let points = 0;
  let reason = 'LIVE-ONLY: ';
  
  // Imbalance scoring
  if (dom.imbalance > weights.imbalanceThresholdLong) {
    points = Math.round((dom.imbalance - 0.5) * 2 * weights.max);
    reason += `Bid heavy (${(dom.imbalance * 100).toFixed(1)}%)`;
  } else if (dom.imbalance < weights.imbalanceThresholdShort) {
    points = -Math.round((0.5 - dom.imbalance) * 2 * weights.max);
    reason += `Ask heavy (${(dom.imbalance * 100).toFixed(1)}%)`;
  } else {
    reason += `Balanced (${(dom.imbalance * 100).toFixed(1)}%)`;
  }
  
  // Spread filter (reduce confidence if spread too wide)
  if (dom.spreadPercent > weights.spreadMaxPercent) {
    points = Math.round(points * 0.5);
    reason += ` [wide spread: ${(dom.spreadPercent * 100).toFixed(3)}%]`;
  }
  
  // Microprice bias (if enabled)
  if (weights.micropriceBias && dom.microprice && dom.midPrice) {
    const bias = dom.microprice - dom.midPrice;
    if (Math.abs(bias) > dom.midPrice * 0.001) {  // 0.1% threshold
      if (bias > 0) {
        reason += ' [microprice↑]';
      } else {
        reason += ' [microprice↓]';
      }
    }
  }
  
  return {
    indicator: 'DOM',
    value: `imb:${(dom.imbalance * 100).toFixed(1)}% spread:${(dom.spreadPercent * 100).toFixed(3)}%`,
    contribution: points,
    reason,
    type: points > 0 ? 'bullish' : points < 0 ? 'bearish' : 'neutral',
    liveOnly: true
  };
}

/**
 * Calculate KDJ values from price data
 * 
 * @param {Array} prices - Array of prices [high, low, close]
 * @param {Object} config - KDJ configuration
 * @returns {Object} KDJ values
 */
function calculateKDJ(prices, config) {
  const { kPeriod = 9, dPeriod = 3, smooth = 3 } = config;
  
  if (prices.length < kPeriod) {
    return null;
  }
  
  // Calculate RSV (Raw Stochastic Value)
  const recent = prices.slice(-kPeriod);
  const close = recent[recent.length - 1][2];
  const high = Math.max(...recent.map(p => p[0]));
  const low = Math.min(...recent.map(p => p[1]));
  
  const rsv = high !== low ? ((close - low) / (high - low)) * 100 : 50;
  
  // K = SMA(RSV, smooth)
  // D = SMA(K, dPeriod)
  // J = 3*D - 2*K
  // Simplified calculation (would need full history for accurate SMA)
  
  const k = rsv;  // Simplified
  const d = rsv;  // Simplified
  const j = 3 * d - 2 * k;
  
  return {
    k,
    d,
    j,
    kCrossedAboveD: false,  // Would need previous values
    kCrossedBelowD: false
  };
}

/**
 * Calculate OBV from price and volume data
 * 
 * @param {Array} candles - Array of [timestamp, open, high, low, close, volume]
 * @param {Object} config - OBV configuration
 * @returns {Object} OBV values
 */
function calculateOBV(candles, config) {
  const { slopeWindow = 14, zScoreCap = 2.0 } = config;
  
  if (candles.length < slopeWindow + 1) {
    return null;
  }
  
  // Calculate OBV
  let obv = 0;
  const obvValues = [];
  
  for (let i = 1; i < candles.length; i++) {
    const prevClose = candles[i - 1][4];
    const close = candles[i][4];
    const volume = candles[i][5];
    
    if (close > prevClose) {
      obv += volume;
    } else if (close < prevClose) {
      obv -= volume;
    }
    
    obvValues.push(obv);
  }
  
  // Calculate slope over window
  const recent = obvValues.slice(-slopeWindow);
  const slope = (recent[recent.length - 1] - recent[0]) / slopeWindow;
  
  // Calculate z-score
  const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
  const variance = recent.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / recent.length;
  const stddev = Math.sqrt(variance);
  const zscore = stddev > 0 ? Math.min(zScoreCap, Math.max(-zScoreCap, (obv - mean) / stddev)) : 0;
  
  return {
    obv,
    slope,
    zscore,
    confirmsTrend: true  // Would need price trend comparison
  };
}

module.exports = {
  generateSignal,
  scoreKDJ,
  scoreOBV,
  scoreDOM,
  calculateKDJ,
  calculateOBV
};
