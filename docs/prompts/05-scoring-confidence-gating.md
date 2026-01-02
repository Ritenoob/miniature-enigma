# Prompt: Scoring and Confidence Gating

## Objective
Generate `src/optimizer/ScoringEngine.js` - evaluates variant performance and determines promotion eligibility with statistical confidence.

## System Context
- **Base**: MIRKO V3.6.1+ KuCoin Futures Bot
- **Language**: Node.js ES6+
- **Purpose**: Identify winning strategies with statistical rigor

## Requirements

### 1. Scoring Engine Class

```javascript
class ScoringEngine {
  constructor(config = {}) {
    this.minSampleSize = config.minSampleSize || 50;
    this.minConfidence = config.minConfidence || 0.95;
    this.minSharpe = config.minSharpe || 1.0;
    this.minWinRate = config.minWinRate || 50;
    this.minROI = config.minROI || 5.0;
  }

  evaluateVariant(variant) {
    const metrics = variant.getMetrics();
    const trades = variant.getTrades();
    
    // Check minimum sample size
    if (trades.length < this.minSampleSize) {
      return {
        eligible: false,
        reason: 'insufficient_samples',
        sampleSize: trades.length,
        required: this.minSampleSize
      };
    }
    
    // Calculate composite score
    const score = this.calculateCompositeScore(metrics);
    
    // Calculate statistical confidence
    const confidence = this.calculateConfidence(trades);
    
    // Check all criteria
    const eligible = 
      score >= 0.7 &&
      confidence >= this.minConfidence &&
      metrics.sharpe >= this.minSharpe &&
      metrics.winRate >= this.minWinRate &&
      metrics.roi >= this.minROI;
    
    return {
      eligible,
      score,
      confidence,
      metrics,
      reason: eligible ? 'meets_criteria' : this.determineReason(metrics, confidence)
    };
  }

  calculateCompositeScore(metrics) {
    // Weighted combination of metrics (0-1 scale)
    const normalizedROI = Math.min(metrics.roi / 20, 1); // Cap at 20%
    const normalizedSharpe = Math.min(metrics.sharpe / 3, 1); // Cap at 3.0
    const normalizedWinRate = metrics.winRate / 100;
    const normalizedDrawdown = 1 - (metrics.maxDrawdown / 20); // Lower is better
    
    return (
      normalizedROI * 0.3 +
      normalizedSharpe * 0.35 +
      normalizedWinRate * 0.2 +
      normalizedDrawdown * 0.15
    );
  }

  calculateConfidence(trades) {
    // Bootstrap confidence interval for mean ROI
    const numBootstrap = 1000;
    const bootstrapMeans = [];
    
    for (let i = 0; i < numBootstrap; i++) {
      const sample = this.bootstrapSample(trades);
      const meanROI = sample.reduce((sum, t) => sum + t.roi, 0) / sample.length;
      bootstrapMeans.push(meanROI);
    }
    
    bootstrapMeans.sort((a, b) => a - b);
    
    // 95% confidence interval
    const lower = bootstrapMeans[Math.floor(numBootstrap * 0.025)];
    const upper = bootstrapMeans[Math.floor(numBootstrap * 0.975)];
    
    // Confidence = 1 if lower bound is positive
    return lower > 0 ? 0.95 : 0.5;
  }

  bootstrapSample(trades) {
    const sample = [];
    for (let i = 0; i < trades.length; i++) {
      const randomIndex = Math.floor(Math.random() * trades.length);
      sample.push(trades[randomIndex]);
    }
    return sample;
  }

  determineReason(metrics, confidence) {
    if (metrics.sharpe < this.minSharpe) return 'low_sharpe';
    if (metrics.winRate < this.minWinRate) return 'low_win_rate';
    if (metrics.roi < this.minROI) return 'low_roi';
    if (confidence < this.minConfidence) return 'low_confidence';
    return 'unknown';
  }

  rankVariants(variants) {
    // Evaluate all variants
    const evaluations = variants.map(v => ({
      variant: v,
      evaluation: this.evaluateVariant(v)
    }));
    
    // Sort by composite score
    evaluations.sort((a, b) => b.evaluation.score - a.evaluation.score);
    
    return evaluations;
  }

  findPromotionCandidates(variants) {
    const ranked = this.rankVariants(variants);
    
    return ranked
      .filter(e => e.evaluation.eligible)
      .map(e => ({
        variantId: e.variant.id,
        config: e.variant.config,
        score: e.evaluation.score,
        confidence: e.evaluation.confidence,
        metrics: e.evaluation.metrics
      }));
  }

  compareWithBaseline(variant, baselineMetrics) {
    const variantMetrics = variant.getMetrics();
    
    // T-test for ROI difference
    const tStat = this.tTest(
      variant.getTrades().map(t => t.roi),
      baselineMetrics.trades.map(t => t.roi)
    );
    
    // Significant if |t| > 1.96 (p < 0.05)
    const significant = Math.abs(tStat) > 1.96;
    
    const improvement = {
      roi: variantMetrics.roi - baselineMetrics.roi,
      sharpe: variantMetrics.sharpe - baselineMetrics.sharpe,
      winRate: variantMetrics.winRate - baselineMetrics.winRate
    };
    
    return {
      significant,
      tStat,
      improvement,
      better: improvement.roi > 0 && significant
    };
  }

  tTest(sample1, sample2) {
    const mean1 = sample1.reduce((a, b) => a + b, 0) / sample1.length;
    const mean2 = sample2.reduce((a, b) => a + b, 0) / sample2.length;
    
    const var1 = sample1.reduce((sum, x) => sum + Math.pow(x - mean1, 2), 0) / (sample1.length - 1);
    const var2 = sample2.reduce((sum, x) => sum + Math.pow(x - mean2, 2), 0) / (sample2.length - 1);
    
    const pooledVar = ((sample1.length - 1) * var1 + (sample2.length - 1) * var2) / 
                      (sample1.length + sample2.length - 2);
    
    const se = Math.sqrt(pooledVar * (1/sample1.length + 1/sample2.length));
    
    return (mean1 - mean2) / se;
  }
}

module.exports = ScoringEngine;
```

### 2. Integration with Optimizer

```javascript
// In LiveOptimizerController
const ScoringEngine = require('./ScoringEngine');

class LiveOptimizerController extends EventEmitter {
  constructor(config) {
    super();
    this.scoringEngine = new ScoringEngine({
      minSampleSize: config.minSampleSize || 50,
      minConfidence: 0.95,
      minSharpe: 1.0,
      minWinRate: 50,
      minROI: 5.0
    });
  }

  async checkPromotionEligibility() {
    const candidates = this.scoringEngine.findPromotionCandidates(
      Array.from(this.variants.values())
    );
    
    if (candidates.length > 0) {
      console.log(`Found ${candidates.length} promotion candidates`);
      
      for (const candidate of candidates) {
        this.emit('promotionCandidate', {
          id: candidate.variantId,
          score: candidate.score,
          confidence: candidate.confidence,
          metrics: candidate.metrics
        });
      }
    }
  }
}
```

## Testing Requirements
- Test composite score calculation
- Test confidence interval calculation
- Test promotion candidate filtering
- Test baseline comparison (t-test)
- Test ranking functionality

## Integration Points
- Used by LiveOptimizerController for variant evaluation
- Can emit events when promotion candidates found
- Provides statistical rigor for strategy selection

## Safety Notes
- Require minimum sample size before promotion
- Use statistical tests to avoid overfitting
- Compare against baseline before promoting
- Log all promotion decisions for audit
