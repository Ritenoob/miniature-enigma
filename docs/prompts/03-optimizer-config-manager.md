# Prompt: Optimizer Configuration Manager

## Objective
Generate `src/optimizer/OptimizerConfig.js` - manages strategy variant configurations with constraints and randomization.

## System Context
- **Base**: MIRKO V3.6.1+ KuCoin Futures Bot
- **Language**: Node.js ES6+
- **Purpose**: Generate valid strategy variants for parallel testing

## Requirements

### 1. Configuration Schema

```javascript
class OptimizerConfig {
  constructor(baseConfig = {}) {
    this.baseConfig = baseConfig;
    
    // Define search space for each parameter
    this.searchSpace = {
      weights: {
        macd: {min: 0.1, max: 0.4, default: 0.25},
        rsi: {min: 0.1, max: 0.4, default: 0.25},
        volumeSpike: {min: 0.05, max: 0.3, default: 0.15},
        trend: {min: 0.1, max: 0.3, default: 0.2},
        kdj: {min: 0, max: 0.2, default: 0.1},
        obv: {min: 0, max: 0.15, default: 0.05}
      },
      
      thresholds: {
        strongBuy: {min: 0.5, max: 0.8, default: 0.65},
        strongSell: {min: -0.8, max: -0.5, default: -0.65},
        moderateBuy: {min: 0.3, max: 0.5, default: 0.4},
        moderateSell: {min: -0.5, max: -0.3, default: -0.4}
      },
      
      riskParams: {
        stopLossROI: {min: -0.15, max: -0.03, default: -0.08},
        takeProfitROI: {min: 0.03, max: 0.20, default: 0.10},
        maxLeverage: {min: 5, max: 20, default: 10},
        trailingStopActivation: {min: 0.05, max: 0.15, default: 0.10}
      },
      
      timing: {
        minHoldTime: {min: 30, max: 300, default: 60}, // seconds
        maxHoldTime: {min: 600, max: 3600, default: 1800}
      }
    };
  }

  generateVariant(strategy = 'random') {
    switch(strategy) {
      case 'random':
        return this.generateRandomVariant();
      case 'grid':
        return this.generateGridVariant();
      case 'conservative':
        return this.generateConservativeVariant();
      case 'aggressive':
        return this.generateAggressiveVariant();
      default:
        return this.generateRandomVariant();
    }
  }

  generateRandomVariant() {
    const config = {};
    
    for (const [category, params] of Object.entries(this.searchSpace)) {
      config[category] = {};
      for (const [param, range] of Object.entries(params)) {
        config[category][param] = this.randomInRange(range.min, range.max);
      }
    }
    
    // Normalize weights to sum to 1.0
    config.weights = this.normalizeWeights(config.weights);
    
    return config;
  }

  generateConservativeVariant() {
    return {
      weights: this.normalizeWeights({
        macd: 0.3,
        rsi: 0.3,
        volumeSpike: 0.1,
        trend: 0.25,
        kdj: 0.05,
        obv: 0
      }),
      thresholds: {
        strongBuy: 0.7,   // Higher threshold
        strongSell: -0.7,
        moderateBuy: 0.5,
        moderateSell: -0.5
      },
      riskParams: {
        stopLossROI: -0.05,  // Tighter stops
        takeProfitROI: 0.08,
        maxLeverage: 5,      // Lower leverage
        trailingStopActivation: 0.08
      },
      timing: {
        minHoldTime: 120,
        maxHoldTime: 1800
      }
    };
  }

  generateAggressiveVariant() {
    return {
      weights: this.normalizeWeights({
        macd: 0.2,
        rsi: 0.2,
        volumeSpike: 0.25,  // More weight on momentum
        trend: 0.15,
        kdj: 0.15,
        obv: 0.05
      }),
      thresholds: {
        strongBuy: 0.55,   // Lower threshold (more trades)
        strongSell: -0.55,
        moderateBuy: 0.35,
        moderateSell: -0.35
      },
      riskParams: {
        stopLossROI: -0.12,  // Wider stops
        takeProfitROI: 0.15,
        maxLeverage: 15,     // Higher leverage
        trailingStopActivation: 0.12
      },
      timing: {
        minHoldTime: 30,
        maxHoldTime: 900
      }
    };
  }

  normalizeWeights(weights) {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    const normalized = {};
    
    for (const [key, value] of Object.entries(weights)) {
      normalized[key] = value / sum;
    }
    
    return normalized;
  }

  randomInRange(min, max) {
    return min + Math.random() * (max - min);
  }

  validateConfig(config) {
    // Validate weights sum to ~1.0
    const weightSum = Object.values(config.weights).reduce((a, b) => a + b, 0);
    if (Math.abs(weightSum - 1.0) > 0.01) {
      throw new Error('Weights must sum to 1.0');
    }
    
    // Validate thresholds are in order
    if (config.thresholds.strongBuy <= config.thresholds.moderateBuy) {
      throw new Error('strongBuy must be > moderateBuy');
    }
    
    // Validate risk params
    if (config.riskParams.stopLossROI >= 0) {
      throw new Error('stopLossROI must be negative');
    }
    
    if (config.riskParams.takeProfitROI <= 0) {
      throw new Error('takeProfitROI must be positive');
    }
    
    return true;
  }

  mutateConfig(config, mutationRate = 0.1) {
    // Create a mutated copy of config
    const mutated = JSON.parse(JSON.stringify(config));
    
    for (const [category, params] of Object.entries(this.searchSpace)) {
      for (const param of Object.keys(params)) {
        if (Math.random() < mutationRate) {
          const range = this.searchSpace[category][param];
          mutated[category][param] = this.randomInRange(range.min, range.max);
        }
      }
    }
    
    // Re-normalize weights if mutated
    if (Math.random() < mutationRate) {
      mutated.weights = this.normalizeWeights(mutated.weights);
    }
    
    return mutated;
  }
}

module.exports = OptimizerConfig;
```

## Testing Requirements
- Test variant generation (random, conservative, aggressive)
- Test weight normalization
- Test config validation
- Test mutation functionality
- Test search space constraints

## Integration Points
- Used by LiveOptimizerController to generate variants
- Can be extended with genetic algorithm for evolution
- Can load base config from signal-weights.js

## Safety Notes
- Always validate generated configs
- Ensure weights sum to 1.0
- Enforce sensible min/max constraints
- Log all generated variants for reproducibility
