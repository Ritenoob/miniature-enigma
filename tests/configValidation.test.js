process.env.DEMO_MODE = 'true';
process.env.RUN_INTERVALS = 'false';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { validateConfig, validatePartialConfig, ConfigSchema: _ConfigSchema } = require('../src/lib/ConfigSchema');

describe('ConfigSchema Validation', () => {

  test('validates correct config', () => {
    const config = {
      TRADING: {
        INITIAL_SL_ROI: 0.5,
        INITIAL_TP_ROI: 2.0,
        DEFAULT_LEVERAGE: 10,
        MAX_POSITIONS: 5,
        TRAILING_MODE: 'staircase'
      },
      API: {
        RETRY_ATTEMPTS: 3,
        RETRY_DELAY_MS: 1000
      }
    };

    const validated = validateConfig(config);
    assert.strictEqual(validated.TRADING.INITIAL_SL_ROI, 0.5);
    assert.strictEqual(validated.TRADING.DEFAULT_LEVERAGE, 10);
  });

  test('applies defaults for missing values', () => {
    const config = {
      TRADING: {
        INITIAL_SL_ROI: 1.0
      },
      API: {}
    };

    const validated = validateConfig(config);

    // Check defaults are applied
    assert.strictEqual(validated.TRADING.INITIAL_TP_ROI, 2.0); // default
    assert.strictEqual(validated.TRADING.DEFAULT_LEVERAGE, 10); // default
    assert.strictEqual(validated.API.RETRY_ATTEMPTS, 3); // default
  });

  test('rejects values outside min/max range', () => {
    const config = {
      TRADING: {
        INITIAL_SL_ROI: 150, // Max is 100
        DEFAULT_LEVERAGE: 10
      },
      API: {
        RETRY_ATTEMPTS: 3
      }
    };

    assert.throws(() => {
      validateConfig(config);
    }, /must be between/);
  });

  test('rejects negative leverage', () => {
    const config = {
      TRADING: {
        DEFAULT_LEVERAGE: -5 // Invalid
      },
      API: {}
    };

    assert.throws(() => {
      validateConfig(config);
    }, /must be between/);
  });

  test('rejects invalid enum values', () => {
    const config = {
      TRADING: {
        TRAILING_MODE: 'invalid_mode'
      },
      API: {}
    };

    assert.throws(() => {
      validateConfig(config);
    }, /must be one of/);
  });

  test('rejects non-boolean for boolean fields', () => {
    const config = {
      TRADING: {
        ENABLE_PARTIAL_TP: 'yes' // Should be boolean
      },
      API: {}
    };

    assert.throws(() => {
      validateConfig(config);
    }, /must be a boolean/);
  });

  test('accepts valid boolean values', () => {
    const config = {
      TRADING: {
        ENABLE_PARTIAL_TP: true
      },
      API: {}
    };

    const validated = validateConfig(config);
    assert.strictEqual(validated.TRADING.ENABLE_PARTIAL_TP, true);
  });

  test('validates partial config updates', () => {
    const updates = {
      TRADING: {
        DEFAULT_LEVERAGE: 20,
        MAX_POSITIONS: 10
      }
    };

    const validated = validatePartialConfig(updates);
    assert.strictEqual(validated.TRADING.DEFAULT_LEVERAGE, 20);
    assert.strictEqual(validated.TRADING.MAX_POSITIONS, 10);
  });

  test('rejects unknown section in partial update', () => {
    const updates = {
      UNKNOWN_SECTION: {
        SOME_FIELD: 123
      }
    };

    assert.throws(() => {
      validatePartialConfig(updates);
    }, /Unknown config section/);
  });

  test('rejects unknown field in partial update', () => {
    const updates = {
      TRADING: {
        UNKNOWN_FIELD: 123
      }
    };

    assert.throws(() => {
      validatePartialConfig(updates);
    }, /Unknown config field/);
  });

  test('validates fee values are within acceptable range', () => {
    const config = {
      TRADING: {
        MAKER_FEE: 0.0002,
        TAKER_FEE: 0.0006
      },
      API: {}
    };

    const validated = validateConfig(config);
    assert.strictEqual(validated.TRADING.MAKER_FEE, 0.0002);
    assert.strictEqual(validated.TRADING.TAKER_FEE, 0.0006);
  });

  test('rejects excessive fee values', () => {
    const config = {
      TRADING: {
        MAKER_FEE: 0.5 // 50% fee is excessive, max is 0.1
      },
      API: {}
    };

    assert.throws(() => {
      validateConfig(config);
    }, /must be between/);
  });

  test('validates all enum values are accepted', () => {
    const modes = ['staircase', 'atr', 'dynamic'];

    for (const mode of modes) {
      const config = {
        TRADING: {
          TRAILING_MODE: mode
        },
        API: {}
      };

      const validated = validateConfig(config);
      assert.strictEqual(validated.TRADING.TRAILING_MODE, mode);
    }
  });

  test('validates maintenance margin range', () => {
    const config = {
      TRADING: {
        MAINTENANCE_MARGIN_PERCENT: 1.5
      },
      API: {}
    };

    const validated = validateConfig(config);
    assert.strictEqual(validated.TRADING.MAINTENANCE_MARGIN_PERCENT, 1.5);
  });

  test('rejects zero or negative position size percent', () => {
    const config = {
      TRADING: {
        POSITION_SIZE_PERCENT: 0 // Must be at least 0.01
      },
      API: {}
    };

    assert.throws(() => {
      validateConfig(config);
    }, /must be between/);
  });

  test('rejects excessive retry attempts', () => {
    const config = {
      TRADING: {},
      API: {
        RETRY_ATTEMPTS: 20 // Max is 10
      }
    };

    assert.throws(() => {
      validateConfig(config);
    }, /must be between/);
  });

  test('validates timeout values', () => {
    const config = {
      TRADING: {},
      API: {
        REQUEST_TIMEOUT_MS: 30000
      }
    };

    const validated = validateConfig(config);
    assert.strictEqual(validated.API.REQUEST_TIMEOUT_MS, 30000);
  });
});
