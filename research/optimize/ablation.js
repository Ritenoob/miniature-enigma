/**
 * ABLATION TESTING
 * Test impact of removing individual indicators
 * Placeholder implementation
 */

class AblationTester {
  constructor() {
    this.indicators = ['rsi', 'macd', 'williamsR', 'ao', 'kdj', 'obv'];
    this.results = new Map();
  }

  /**
   * Run ablation tests
   * @param {Function} evaluator - Evaluation function
   * @param {Object} baseConfig - Base configuration
   * @returns {Promise<Map>} Results map
   */
  async runTests(evaluator, baseConfig) {
    console.log('[Ablation] Starting ablation tests...');

    // Test baseline (all indicators)
    const baselineScore = await evaluator(baseConfig);
    this.results.set('baseline', { score: baselineScore, removed: [] });

    console.log(`[Ablation] Baseline score: ${baselineScore.toFixed(4)}`);

    // Test removing each indicator
    for (const indicator of this.indicators) {
      const modifiedConfig = JSON.parse(JSON.stringify(baseConfig));
      
      // Set indicator weight to 0
      if (modifiedConfig[indicator]) {
        modifiedConfig[indicator].weight = 0;
      }

      const score = await evaluator(modifiedConfig);
      const impact = baselineScore - score;

      this.results.set(indicator, { 
        score, 
        impact,
        removed: [indicator] 
      });

      console.log(`[Ablation] Without ${indicator}: ${score.toFixed(4)} (impact: ${impact >= 0 ? '+' : ''}${impact.toFixed(4)})`);
    }

    return this.results;
  }

  /**
   * Get indicator importance ranking
   * @returns {Array} Sorted array of indicators by importance
   */
  getImportanceRanking() {
    const ranking = [];

    for (const [indicator, result] of this.results.entries()) {
      if (indicator === 'baseline') continue;
      
      ranking.push({
        indicator,
        impact: result.impact,
        importance: result.impact > 0 ? 'positive' : 'negative'
      });
    }

    // Sort by absolute impact
    ranking.sort((a, b) => Math.abs(b.impact) - Math.abs(a.impact));

    return ranking;
  }
}

module.exports = AblationTester;
