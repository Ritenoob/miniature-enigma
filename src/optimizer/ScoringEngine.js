/**
 * SCORING ENGINE
 * Calculates composite scores and confidence metrics for strategy variants
 * Implements statistical significance testing and promotion gating
 */

const OptimizerConfig = require('./OptimizerConfig');

class ScoringEngine {
  constructor(config = OptimizerConfig) {
    this.config = config;
  }
  
  /**
   * Calculate composite score for a strategy variant
   * @param {Object} metrics - Strategy performance metrics
   * @returns {Object} Score breakdown and overall score
   */
  calculateCompositeScore(metrics) {
    const {
      roi = 0,
      winRate = 0,
      sharpeRatio = 0,
      avgPnLPerTrade = 0,
      maxDrawdown = 0,
      totalTrades = 0,
      consecutiveWins = 0,
      consecutiveLosses = 0
    } = metrics;
    
    // Weight factors for each component
    const weights = {
      roi: 0.30,
      winRate: 0.25,
      sharpe: 0.20,
      consistency: 0.15,
      avgPnL: 0.10
    };
    
    // Normalize and score each component (0-100)
    const scores = {
      roi: this.scoreROI(roi),
      winRate: this.scoreWinRate(winRate),
      sharpe: this.scoreSharpe(sharpeRatio),
      consistency: this.scoreConsistency(consecutiveWins, consecutiveLosses, totalTrades),
      avgPnL: this.scoreAvgPnL(avgPnLPerTrade),
      drawdown: this.scoreDrawdown(maxDrawdown)
    };
    
    // Calculate weighted composite score
    const compositeScore = 
      scores.roi * weights.roi +
      scores.winRate * weights.winRate +
      scores.sharpe * weights.sharpe +
      scores.consistency * weights.consistency +
      scores.avgPnL * weights.avgPnL;
    
    // Apply drawdown penalty
    const drawdownPenalty = 1 - (Math.min(maxDrawdown, 20) / 40);
    const finalScore = compositeScore * drawdownPenalty;
    
    return {
      compositeScore: Math.round(finalScore * 100) / 100,
      breakdown: scores,
      weights,
      drawdownPenalty: Math.round(drawdownPenalty * 100) / 100
    };
  }
  
  /**
   * Score ROI (0-100)
   */
  scoreROI(roi) {
    if (roi <= 0) return 0;
    if (roi >= 50) return 100;
    return Math.min(100, (roi / 50) * 100);
  }
  
  /**
   * Score win rate (0-100)
   */
  scoreWinRate(winRate) {
    if (winRate <= 0) return 0;
    if (winRate >= 0.8) return 100;
    return (winRate / 0.8) * 100;
  }
  
  /**
   * Score Sharpe ratio (0-100)
   */
  scoreSharpe(sharpe) {
    if (sharpe <= 0) return 0;
    if (sharpe >= 3) return 100;
    return (sharpe / 3) * 100;
  }
  
  /**
   * Score consistency based on win/loss streaks (0-100)
   */
  scoreConsistency(consecutiveWins, consecutiveLosses, totalTrades) {
    if (totalTrades === 0) return 0;
    
    // Penalize extreme streaks (indicates instability)
    const maxStreak = Math.max(consecutiveWins, consecutiveLosses);
    const streakRatio = maxStreak / totalTrades;
    
    if (streakRatio > 0.5) return 20; // High streaks = low consistency
    if (streakRatio < 0.1) return 100; // Low streaks = high consistency
    
    // Linear interpolation, clamped to [0, 100]
    return Math.max(0, Math.min(100, 100 - (streakRatio * 160)));
  }
  
  /**
   * Score average P&L per trade (0-100)
   */
  scoreAvgPnL(avgPnL) {
    if (avgPnL <= 0) return 0;
    if (avgPnL >= 2) return 100; // $2+ per trade is excellent
    return (avgPnL / 2) * 100;
  }
  
  /**
   * Score drawdown (higher drawdown = lower score)
   */
  scoreDrawdown(drawdown) {
    if (drawdown <= 0) return 100;
    if (drawdown >= 20) return 0;
    return 100 - (drawdown / 20) * 100;
  }
  
  /**
   * Calculate confidence score for strategy promotion
   * @param {Object} metrics - Strategy performance metrics
   * @returns {Object} Confidence breakdown and overall confidence
   */
  calculateConfidence(metrics) {
    const {
      totalTrades = 0,
      roi = 0,
      winRate = 0,
      sharpeRatio = 0,
      maxDrawdown = 0
    } = metrics;
    
    const conf = this.config.confidence;
    
    // Sample size confidence
    const sampleConfidence = Math.min(1.0, totalTrades / (conf.minSampleSize * 2));
    
    // Performance confidence
    const roiConfidence = roi >= conf.minROI ? 1.0 : roi / conf.minROI;
    const winRateConfidence = winRate >= conf.minWinRate ? 1.0 : winRate / conf.minWinRate;
    const sharpeConfidence = sharpeRatio >= conf.minSharpe ? 1.0 : sharpeRatio / conf.minSharpe;
    
    // Drawdown confidence (inverse)
    const drawdownConfidence = Math.max(0, 1 - (maxDrawdown / 20));
    
    // Composite confidence score breakdown
    const breakdown = {
      sampleSize: Math.round(sampleConfidence * 100) / 100,
      roi: Math.round(roiConfidence * 100) / 100,
      winRate: Math.round(winRateConfidence * 100) / 100,
      sharpe: Math.round(sharpeConfidence * 100) / 100,
      drawdown: Math.round(drawdownConfidence * 100) / 100
    };
    
    // Overall confidence (weighted average)
    const overallConfidence = 
      sampleConfidence * 0.30 +
      roiConfidence * 0.25 +
      winRateConfidence * 0.20 +
      sharpeConfidence * 0.15 +
      drawdownConfidence * 0.10;
    
    return {
      overall: Math.round(overallConfidence * 100) / 100,
      breakdown,
      readyForPromotion: overallConfidence >= conf.promotionThreshold,
      minimumSampleMet: totalTrades >= conf.minSampleSize
    };
  }
  
  /**
   * Test statistical significance using basic z-test for proportions
   * @param {number} winRate - Win rate of strategy
   * @param {number} totalTrades - Number of trades
   * @param {number} nullHypothesis - Null hypothesis win rate (default 0.5)
   * @returns {Object} Statistical test results
   */
  testStatisticalSignificance(winRate, totalTrades, nullHypothesis = 0.5) {
    if (totalTrades < 30) {
      return {
        significant: false,
        reason: 'Sample size too small (n < 30)',
        pValue: null,
        zScore: null
      };
    }
    
    // Calculate z-score for proportion test
    const p0 = nullHypothesis;
    const pHat = winRate;
    const n = totalTrades;
    
    const standardError = Math.sqrt((p0 * (1 - p0)) / n);
    const zScore = (pHat - p0) / standardError;
    
    // Two-tailed test
    const pValue = 2 * (1 - this.normalCDF(Math.abs(zScore)));
    
    const significant = pValue < 0.05; // 95% confidence level
    
    return {
      significant,
      pValue: Math.round(pValue * 10000) / 10000,
      zScore: Math.round(zScore * 100) / 100,
      confidenceLevel: 0.95,
      result: significant ? 'Strategy is statistically better than random' : 'No significant difference from random'
    };
  }
  
  /**
   * Normal cumulative distribution function (approximation)
   * Uses Abramowitz and Stegun approximation (1964)
   * Accurate to 7 decimal places
   */
  normalCDF(x) {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }
  
  /**
   * Check if strategy meets minimum requirements for promotion
   * @param {Object} metrics - Strategy performance metrics
   * @returns {Object} Gate check results
   */
  checkPromotionGate(metrics) {
    const conf = this.config.confidence;
    const checks = {
      sampleSize: metrics.totalTrades >= conf.minSampleSize,
      winRate: metrics.winRate >= conf.minWinRate,
      sharpe: metrics.sharpeRatio >= conf.minSharpe,
      roi: metrics.roi >= conf.minROI,
      drawdown: metrics.maxDrawdown <= 15 // Max 15% drawdown
    };
    
    const confidence = this.calculateConfidence(metrics);
    checks.confidence = confidence.overall >= conf.promotionThreshold;
    
    const significance = this.testStatisticalSignificance(
      metrics.winRate,
      metrics.totalTrades
    );
    checks.statistical = significance.significant;
    
    const allPassed = Object.values(checks).every(v => v === true);
    
    return {
      passed: allPassed,
      checks,
      confidence: confidence.overall,
      significance,
      message: allPassed 
        ? 'Strategy passed all promotion gates' 
        : 'Strategy failed one or more promotion requirements'
    };
  }
  
  /**
   * Rank multiple strategy variants by performance
   * @param {Array} variants - Array of variants with metrics
   * @returns {Array} Sorted array of variants with scores
   */
  rankVariants(variants) {
    return variants
      .map(variant => {
        const score = this.calculateCompositeScore(variant.metrics);
        const confidence = this.calculateConfidence(variant.metrics);
        
        return {
          ...variant,
          score: score.compositeScore,
          scoreBreakdown: score.breakdown,
          confidence: confidence.overall,
          confidenceBreakdown: confidence.breakdown
        };
      })
      .sort((a, b) => b.score - a.score);
  }
}

module.exports = ScoringEngine;
