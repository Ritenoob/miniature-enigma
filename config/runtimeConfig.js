/**
 * RUNTIME CONFIGURATION
 * Runtime toggles and settings for MIRKO V3.5
 */

module.exports = {
  // Feature flags
  features: {
    screener: {
      enabled: true,
      autoStart: false
    },
    optimizer: {
      enabled: false,
      autoSwitch: false
    },
    dom: {
      enabled: false,  // Requires live WebSocket feed
      liveOnlyValidation: true
    },
    telemetry: {
      enabled: true,
      publishInterval: 5000
    }
  },

  // Active strategy profile
  strategy: {
    activeProfile: 'balanced',  // conservative | aggressive | balanced | scalping
    allowDynamicSwitching: false
  },

  // Screener settings (overrides)
  screener: {
    pairs: null,  // null = use config/pairs.json
    primaryTimeframe: '5m',
    secondaryTimeframe: '15m',
    requireAlignment: true
  },

  // Server settings
  server: {
    port: 3001,
    enableWebSocket: true,
    corsEnabled: true
  },

  // Logging
  logging: {
    level: 'info',  // debug | info | warn | error
    console: true,
    file: true,
    filePath: './logs/mirko.log'
  },

  // Development mode
  development: {
    demoMode: process.env.DEMO_MODE === 'true',
    mockData: false,
    verboseLogging: false
  }
};
