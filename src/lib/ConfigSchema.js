// ============================================================================
// ConfigSchema.js - Configuration Schema and Validation
// ============================================================================

const ConfigSchema = {
  TRADING: {
    INITIAL_SL_ROI: { type: 'number', min: 0.01, max: 100, default: 0.5 },
    INITIAL_TP_ROI: { type: 'number', min: 0.01, max: 1000, default: 2.0 },
    BREAK_EVEN_BUFFER: { type: 'number', min: 0, max: 10, default: 0.1 },
    TRAILING_STEP_PERCENT: { type: 'number', min: 0.01, max: 10, default: 0.15 },
    TRAILING_MOVE_PERCENT: { type: 'number', min: 0.01, max: 10, default: 0.05 },
    TRAILING_MODE: { type: 'enum', values: ['staircase', 'atr', 'dynamic'], default: 'staircase' },
    ATR_TRAILING_MULTIPLIER: { type: 'number', min: 0.1, max: 10, default: 1.5 },
    POSITION_SIZE_PERCENT: { type: 'number', min: 0.01, max: 100, default: 0.5 },
    DEFAULT_LEVERAGE: { type: 'number', min: 1, max: 100, default: 10 },
    MAX_POSITIONS: { type: 'number', min: 1, max: 50, default: 5 },
    SLIPPAGE_BUFFER_PERCENT: { type: 'number', min: 0, max: 5, default: 0.02 },
    STOP_PRICE_TYPE: { type: 'enum', values: ['MP'], default: 'MP' },
    STOP_UPDATE_MIN_INTERVAL_MS: { type: 'number', min: 250, max: 10000, default: 1500 },
    STOP_MIN_MOVE_TICKS: { type: 'number', min: 1, max: 100, default: 2 },
    MAKER_FEE: { type: 'number', min: 0, max: 0.1, default: 0.0002 },
    TAKER_FEE: { type: 'number', min: 0, max: 0.1, default: 0.0006 },
    MAINTENANCE_MARGIN_PERCENT: { type: 'number', min: 0.1, max: 10, default: 0.5 },
    ENABLE_PARTIAL_TP: { type: 'boolean', default: false },
    PARTIAL_TP_PERCENT: { type: 'number', min: 1, max: 99, default: 50 },
    TP1_ROI: { type: 'number', min: 0.01, max: 100, default: 1.0 },
    TP2_ROI: { type: 'number', min: 0.01, max: 1000, default: 2.0 }
  },
  API: {
    RETRY_ATTEMPTS: { type: 'number', min: 1, max: 10, default: 3 },
    RETRY_DELAY_MS: { type: 'number', min: 100, max: 30000, default: 1000 },
    RATE_LIMIT_DELAY_MS: { type: 'number', min: 1000, max: 60000, default: 5000 },
    REQUEST_TIMEOUT_MS: { type: 'number', min: 1000, max: 60000, default: 10000 }
  }
};

/**
 * Validate configuration against schema
 * @param {Object} config - Configuration object to validate
 * @param {Object} schema - Schema to validate against (defaults to ConfigSchema)
 * @returns {Object} Validated config with defaults applied
 * @throws {Error} If validation fails
 */
function validateConfig(config, schema = ConfigSchema) {
  const errors = [];
  const validatedConfig = JSON.parse(JSON.stringify(config)); // Deep clone

  for (const [section, fields] of Object.entries(schema)) {
    // Ensure section exists
    if (!validatedConfig[section]) {
      validatedConfig[section] = {};
    }

    for (const [field, rules] of Object.entries(fields)) {
      const value = validatedConfig[section][field];

      // Apply default if value is undefined
      if (value === undefined || value === null) {
        validatedConfig[section][field] = rules.default;
        continue;
      }

      // Validate based on type
      switch (rules.type) {
        case 'number':
          if (typeof value !== 'number' || isNaN(value)) {
            errors.push(`${section}.${field} must be a number, got ${typeof value}`);
          } else if (value < rules.min || value > rules.max) {
            errors.push(`${section}.${field} must be between ${rules.min} and ${rules.max}, got ${value}`);
          }
          break;

        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`${section}.${field} must be a boolean, got ${typeof value}`);
          }
          break;

        case 'enum':
          if (!rules.values.includes(value)) {
            errors.push(`${section}.${field} must be one of: ${rules.values.join(', ')}, got ${value}`);
          }
          break;

        case 'string':
          if (typeof value !== 'string') {
            errors.push(`${section}.${field} must be a string, got ${typeof value}`);
          }
          if (rules.minLength && value.length < rules.minLength) {
            errors.push(`${section}.${field} must be at least ${rules.minLength} characters`);
          }
          if (rules.maxLength && value.length > rules.maxLength) {
            errors.push(`${section}.${field} must be at most ${rules.maxLength} characters`);
          }
          break;

        default:
          errors.push(`Unknown type "${rules.type}" for ${section}.${field}`);
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Config validation failed:\n  ${errors.join('\n  ')}`);
  }

  return validatedConfig;
}

/**
 * Get a human-readable summary of the configuration schema
 * @returns {string} Schema documentation
 */
function getSchemaDocumentation() {
  const lines = ['Configuration Schema:', ''];

  for (const [section, fields] of Object.entries(ConfigSchema)) {
    lines.push(`[${section}]`);
    
    for (const [field, rules] of Object.entries(fields)) {
      let line = `  ${field}: `;
      
      switch (rules.type) {
        case 'number':
          line += `number (${rules.min} - ${rules.max}, default: ${rules.default})`;
          break;
        case 'boolean':
          line += `boolean (default: ${rules.default})`;
          break;
        case 'enum':
          line += `enum [${rules.values.join(', ')}] (default: ${rules.default})`;
          break;
        default:
          line += `${rules.type} (default: ${rules.default})`;
      }
      
      lines.push(line);
    }
    
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Validate a partial config update
 * @param {Object} updates - Partial configuration updates
 * @param {Object} schema - Schema to validate against
 * @returns {Object} Validated updates
 * @throws {Error} If validation fails
 */
function validatePartialConfig(updates, schema = ConfigSchema) {
  const errors = [];
  const validated = {};

  for (const [section, fields] of Object.entries(updates)) {
    if (!schema[section]) {
      errors.push(`Unknown config section: ${section}`);
      continue;
    }

    validated[section] = {};

    for (const [field, value] of Object.entries(fields)) {
      if (!schema[section][field]) {
        errors.push(`Unknown config field: ${section}.${field}`);
        continue;
      }

      const rules = schema[section][field];

      // Validate based on type
      switch (rules.type) {
        case 'number':
          if (typeof value !== 'number' || isNaN(value)) {
            errors.push(`${section}.${field} must be a number`);
          } else if (value < rules.min || value > rules.max) {
            errors.push(`${section}.${field} must be between ${rules.min} and ${rules.max}`);
          } else {
            validated[section][field] = value;
          }
          break;

        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`${section}.${field} must be a boolean`);
          } else {
            validated[section][field] = value;
          }
          break;

        case 'enum':
          if (!rules.values.includes(value)) {
            errors.push(`${section}.${field} must be one of: ${rules.values.join(', ')}`);
          } else {
            validated[section][field] = value;
          }
          break;

        default:
          validated[section][field] = value;
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`Partial config validation failed:\n  ${errors.join('\n  ')}`);
  }

  return validated;
}

module.exports = {
  ConfigSchema,
  validateConfig,
  validatePartialConfig,
  getSchemaDocumentation
};
