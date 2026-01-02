/**
 * DOM Scoring Module
 * ===================
 * Converts DOM (Depth of Market) features into signal contributions.
 * 
 * **CRITICAL: This module is LIVE-ONLY**
 * DOM data cannot be accurately simulated in backtests.
 * All contributions are tagged with 'LIVE_ONLY_VALIDATION_REQUIRED'.
 * 
 * Usage will throw error if not in LIVE_MODE.
 */

class DOMScoring {
  constructor(config = {}) {
    this.weights = config.weights || {
      max: 20,
      imbalance_5_threshold: 0.2,
      spread_threshold_bps: 5.0
    };
  }

  /**
   * Compute signal contribution from DOM features
   * @param {Object} features - DOM features from DOMProcessor
   * @param {Object} weights - Weight configuration (optional, uses instance weights if not provided)
   * @param {string} direction - Expected direction: 'long' or 'short'
   * @returns {Object} Signal contribution
   * @throws {Error} If not in LIVE_MODE
   */
  computeContribution(features, weights = null, direction = 'long') {
    // CRITICAL SAFETY CHECK: DOM scoring only valid in live mode
    if (process.env.LIVE_MODE !== 'true') {
      throw new Error('DOM scoring requires LIVE_MODE=true. DOM data cannot be used in backtesting.');
    }

    const w = weights || this.weights;
    let score = 0;
    const breakdown = {};

    // 1. Order book imbalance at depth 5 (most significant)
    const imbalance5 = features.imbalance_5 || 0;
    const imbalanceScore = this._scoreImbalance(imbalance5, w, direction);
    score += imbalanceScore;
    breakdown.imbalance_5 = imbalanceScore;

    // 2. Spread analysis (tight spread = good liquidity)
    const spreadScore = this._scoreSpread(features.spread_bps, w, direction);
    score += spreadScore;
    breakdown.spread = spreadScore;

    // 3. Wall detection (resistance/support levels)
    const wallScore = this._scoreWalls(features.walls, w, direction);
    score += wallScore;
    breakdown.walls = wallScore;

    // 4. Microprice vs midprice (pressure indicator)
    const priceScore = this._scoreMicroprice(
      features.microprice,
      features.midPrice,
      w,
      direction
    );
    score += priceScore;
    breakdown.microprice = priceScore;

    // Normalize to max weight
    const normalizedScore = Math.max(-w.max, Math.min(w.max, score));

    return {
      score: normalizedScore,
      breakdown,
      type: 'LIVE_ONLY_VALIDATION_REQUIRED', // Critical tag
      timestamp: features.timestamp || Date.now()
    };
  }

  /**
   * Score order book imbalance
   * @private
   */
  _scoreImbalance(imbalance, weights, direction) {
    const threshold = weights.imbalance_5_threshold || 0.2;
    
    // Imbalance ranges from -1 (all asks) to +1 (all bids)
    // Positive imbalance = buying pressure (bullish)
    // Negative imbalance = selling pressure (bearish)
    
    let score = 0;
    
    if (Math.abs(imbalance) > threshold) {
      // Significant imbalance detected
      const magnitude = Math.abs(imbalance);
      const maxImbalanceScore = weights.max * 0.4; // 40% of max weight
      
      if (direction === 'long') {
        // For long: positive imbalance is good
        score = imbalance > 0 
          ? magnitude * maxImbalanceScore
          : -magnitude * maxImbalanceScore;
      } else {
        // For short: negative imbalance is good
        score = imbalance < 0
          ? magnitude * maxImbalanceScore
          : -magnitude * maxImbalanceScore;
      }
    }
    
    return score;
  }

  /**
   * Score bid-ask spread
   * @private
   */
  _scoreSpread(spreadBps, weights, direction) {
    const threshold = weights.spread_threshold_bps || 5.0;
    const maxSpreadScore = weights.max * 0.2; // 20% of max weight
    
    // Tight spread = good liquidity = positive signal
    // Wide spread = poor liquidity = negative signal
    
    if (spreadBps < threshold) {
      // Good liquidity
      return maxSpreadScore * 0.5;
    } else if (spreadBps < threshold * 2) {
      // Moderate liquidity
      return maxSpreadScore * 0.2;
    } else {
      // Poor liquidity - penalize
      return -maxSpreadScore * 0.3;
    }
  }

  /**
   * Score order book walls
   * @private
   */
  _scoreWalls(walls, weights, direction) {
    if (!walls) return 0;
    
    const maxWallScore = weights.max * 0.2; // 20% of max weight
    
    if (direction === 'long') {
      // For long: bid wall (support) is good, ask wall (resistance) is bad
      if (walls.hasBidWall && !walls.hasAskWall) {
        return maxWallScore * 0.7;
      } else if (walls.hasAskWall && !walls.hasBidWall) {
        return -maxWallScore * 0.5;
      } else if (walls.hasBidWall && walls.hasAskWall) {
        // Both walls - neutral to slightly positive
        return maxWallScore * 0.2;
      }
    } else {
      // For short: ask wall (resistance) is good, bid wall (support) is bad
      if (walls.hasAskWall && !walls.hasBidWall) {
        return maxWallScore * 0.7;
      } else if (walls.hasBidWall && !walls.hasAskWall) {
        return -maxWallScore * 0.5;
      } else if (walls.hasBidWall && walls.hasAskWall) {
        // Both walls - neutral
        return maxWallScore * 0.2;
      }
    }
    
    return 0;
  }

  /**
   * Score microprice vs midprice divergence
   * @private
   */
  _scoreMicroprice(microprice, midPrice, weights, direction) {
    const maxMicroScore = weights.max * 0.2; // 20% of max weight
    
    // Microprice > midprice = buying pressure (more ask volume)
    // Microprice < midprice = selling pressure (more bid volume)
    
    const priceRatio = (microprice - midPrice) / midPrice;
    
    if (direction === 'long') {
      // For long: microprice > midprice is bearish (we want to buy lower)
      // microprice < midprice is bullish (buying pressure)
      return -priceRatio * maxMicroScore * 100;
    } else {
      // For short: microprice > midprice is bullish for short (selling pressure)
      return priceRatio * maxMicroScore * 100;
    }
  }

  /**
   * Validate that environment is configured for DOM scoring
   * @returns {boolean}
   */
  static isLiveModeEnabled() {
    return process.env.LIVE_MODE === 'true';
  }

  /**
   * Get warning message if DOM scoring is attempted outside live mode
   * @returns {string}
   */
  static getLiveModeWarning() {
    return 'WARNING: DOM scoring is only valid in LIVE_MODE. ' +
           'Order book data cannot be accurately replicated in backtests. ' +
           'Set LIVE_MODE=true to enable DOM features.';
  }
}

module.exports = DOMScoring;
