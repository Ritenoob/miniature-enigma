/**
 * Adjust Weights Utility
 * -----------------------
 * Utility for safely updating signal weights at runtime
 * Validates new weights and applies them without restarting the system
 */

const fs = require('fs');
const path = require('path');

class WeightAdjuster {
  /**
   * Load current weights configuration
   * @param {string} configPath - Path to signal-weights.js
   * @returns {Object} Current configuration
   */
  static loadConfig(configPath = null) {
    const resolvedPath = configPath || path.resolve(__dirname, '../signal-weights.js');
    
    // Clear cache to get fresh config
    delete require.cache[require.resolve(resolvedPath)];
    
    return require(resolvedPath);
  }

  /**
   * Validate weight configuration
   * @param {Object} weights - Weights object to validate
   * @throws {Error} If validation fails
   */
  static validateWeights(weights) {
    const errors = [];
    
    // Required indicators for backward compatibility
    const requiredIndicators = ['rsi', 'williamsR', 'macd', 'ao', 'emaTrend', 'stochastic', 'bollinger'];
    
    for (const indicator of requiredIndicators) {
      if (!weights[indicator]) {
        errors.push(`Missing required indicator: ${indicator}`);
      }
    }
    
    // Validate each indicator configuration
    for (const [name, config] of Object.entries(weights)) {
      if (typeof config !== 'object') {
        errors.push(`Indicator ${name} must be an object`);
        continue;
      }
      
      if (typeof config.max !== 'number' || config.max < 0 || config.max > 100) {
        errors.push(`Indicator ${name}.max must be a number between 0 and 100`);
      }
      
      // Validate specific indicator requirements
      if (name === 'rsi' && (!config.oversold || !config.overbought)) {
        errors.push(`RSI must have oversold and overbought thresholds`);
      }
      
      if (name === 'kdj') {
        if (config.oversold === undefined || config.overbought === undefined) {
          errors.push(`KDJ must have oversold and overbought thresholds`);
        }
        if (config.jOversold === undefined || config.jOverbought === undefined) {
          errors.push(`KDJ must have jOversold and jOverbought thresholds`);
        }
      }
      
      if (name === 'obv') {
        if (config.slopeThreshold === undefined) {
          errors.push(`OBV must have slopeThreshold`);
        }
        if (config.useSmoothing === undefined) {
          errors.push(`OBV must have useSmoothing flag`);
        }
      }
      
      if (name === 'dom') {
        if (config.imbalanceThreshold === undefined || config.spreadThreshold === undefined) {
          errors.push(`DOM must have imbalanceThreshold and spreadThreshold`);
        }
      }
      
      if (name === 'adx') {
        if (config.trendThreshold === undefined || config.period === undefined) {
          errors.push(`ADX must have trendThreshold and period`);
        }
      }
    }
    
    if (errors.length > 0) {
      throw new Error(`Weight validation failed:\n${errors.join('\n')}`);
    }
    
    return true;
  }

  /**
   * Safely update weights for a specific indicator
   * @param {string} indicator - Indicator name
   * @param {Object} newConfig - New configuration for the indicator
   * @param {string} profile - Profile to update ('default' or profile name)
   * @returns {Object} Updated configuration
   */
  static updateIndicatorWeight(indicator, newConfig, profile = 'default') {
    const config = this.loadConfig();
    
    // Determine which weights object to update
    let targetWeights;
    if (profile === 'default') {
      targetWeights = config.weights;
    } else if (config.profiles && config.profiles[profile]) {
      targetWeights = config.profiles[profile];
    } else {
      throw new Error(`Profile '${profile}' not found`);
    }
    
    // Validate the new configuration
    const testWeights = { ...targetWeights, [indicator]: newConfig };
    this.validateWeights(testWeights);
    
    // Apply the update
    targetWeights[indicator] = newConfig;
    
    return config;
  }

  /**
   * Add a new indicator to all profiles
   * @param {string} indicator - Indicator name
   * @param {Object} defaultConfig - Default configuration
   * @param {Object} profileConfigs - Per-profile configurations (optional)
   */
  static addNewIndicator(indicator, defaultConfig, profileConfigs = {}) {
    const config = this.loadConfig();
    
    // Add to default weights
    if (!config.weights[indicator]) {
      config.weights[indicator] = defaultConfig;
    }
    
    // Add to all profiles
    for (const [profileName, weights] of Object.entries(config.profiles)) {
      if (!weights[indicator]) {
        weights[indicator] = profileConfigs[profileName] || defaultConfig;
      }
    }
    
    // Validate entire configuration
    this.validateWeights(config.weights);
    for (const weights of Object.values(config.profiles)) {
      this.validateWeights(weights);
    }
    
    return config;
  }

  /**
   * Calculate total max points for a weight configuration
   * @param {Object} weights - Weight configuration
   * @returns {number} Total max points
   */
  static calculateTotalMaxPoints(weights) {
    let total = 0;
    for (const config of Object.values(weights)) {
      if (config.max) {
        total += config.max;
      }
    }
    return total;
  }

  /**
   * Normalize weights to target total (e.g., 100 or 120)
   * @param {Object} weights - Weight configuration
   * @param {number} targetTotal - Target total (default: 120)
   * @returns {Object} Normalized weights
   */
  static normalizeWeights(weights, targetTotal = 120) {
    const currentTotal = this.calculateTotalMaxPoints(weights);
    
    if (currentTotal === 0) {
      throw new Error('Cannot normalize weights: total is zero');
    }
    
    const multiplier = targetTotal / currentTotal;
    const normalized = {};
    
    for (const [name, config] of Object.entries(weights)) {
      normalized[name] = {
        ...config,
        max: Math.round(config.max * multiplier)
      };
    }
    
    return normalized;
  }

  /**
   * Create a backup of the current configuration
   * @param {string} backupDir - Directory to store backup
   * @returns {string} Path to backup file
   */
  static backup(backupDir = './backups') {
    const config = this.loadConfig();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `signal-weights-backup-${timestamp}.json`;
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    
    const backupPath = path.join(backupDir, filename);
    fs.writeFileSync(backupPath, JSON.stringify(config, null, 2));
    
    return backupPath;
  }

  /**
   * Get indicator weight statistics
   * @param {Object} weights - Weight configuration
   * @returns {Object} Statistics
   */
  static getStatistics(weights) {
    const total = this.calculateTotalMaxPoints(weights);
    const count = Object.keys(weights).length;
    const average = total / count;
    
    const maxPoints = Object.entries(weights).map(([name, config]) => ({
      name,
      max: config.max
    })).sort((a, b) => b.max - a.max);
    
    return {
      totalPoints: total,
      indicatorCount: count,
      averagePoints: average,
      topIndicators: maxPoints.slice(0, 5),
      distribution: maxPoints
    };
  }
}

module.exports = WeightAdjuster;

// CLI support
if (require.main === module) {
  const command = process.argv[2];
  
  if (command === 'validate') {
    try {
      const config = WeightAdjuster.loadConfig();
      WeightAdjuster.validateWeights(config.weights);
      console.log('✓ Default weights are valid');
      
      for (const [profileName, weights] of Object.entries(config.profiles)) {
        WeightAdjuster.validateWeights(weights);
        console.log(`✓ Profile '${profileName}' is valid`);
      }
    } catch (error) {
      console.error('✗ Validation failed:', error.message);
      process.exit(1);
    }
  } else if (command === 'stats') {
    const config = WeightAdjuster.loadConfig();
    const stats = WeightAdjuster.getStatistics(config.weights);
    console.log('Weight Statistics:');
    console.log(JSON.stringify(stats, null, 2));
  } else if (command === 'backup') {
    try {
      const backupPath = WeightAdjuster.backup();
      console.log(`✓ Backup created: ${backupPath}`);
    } catch (error) {
      console.error('✗ Backup failed:', error.message);
      process.exit(1);
    }
  } else {
    console.log(`
Usage: node adjust-weights.js <command>

Commands:
  validate   Validate all weight configurations
  stats      Show weight statistics
  backup     Create a backup of current configuration
    `);
  }
}
