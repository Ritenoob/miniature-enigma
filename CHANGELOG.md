# Changelog

All notable changes to the KuCoin Futures Trading Bot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.0.0-alpha] - 2026-01-02

### Added - Phase 1: Repository Consolidation
- **New Directory Structure**: Organized codebase into logical modules
  - `src/indicators/` - Technical indicator implementations
  - `src/screener/` - Dual-timeframe screener components
  - `src/marketdata/` - Market data processors and feeds
  - `src/backtest/` - Backtesting engine components
  - `src/optimizer/` - Strategy optimization modules
  - `src/forward/` - Forward testing (paper trading) modules
  - `src/scoring/` - Signal scoring modules
  - `src/config/` - Configuration files
  - `tests/indicators/`, `tests/screener/`, `tests/marketdata/`, `tests/backtest/`, `tests/integration/` - Test directories
  - `scripts/`, `docs/optimizer/`, `docs/screener/`, `docs/api/` - Utility and documentation directories

- **Indicator Registry** (`src/indicators/index.js`)
  - Centralized export point for all technical indicators
  - Factory function `createIndicator(type, config)` for dynamic indicator creation
  - Helper function `getAvailableIndicators()` to list available indicators

- **Environment Configuration** (`.env.example`)
  - `SCREENER_ENABLED` - Enable/disable dual-timeframe screener
  - `DOM_ENABLED` - Enable/disable Depth of Market features
  - `RATE_LIMIT_STRICT` - Enable strict rate limiting
  - `DATA_FEED_WS` - Use WebSocket for live data
  - `LIVE_MODE` - Enable live trading mode (vs paper trading)
  - `FORWARD_TEST` - Enable forward testing mode

### Added - Phase 2: New Technical Indicators
- **KDJ Indicator** (`src/indicators/KDJIndicator.js`)
  - K-D-J stochastic oscillator calculation
  - Crossover detection (bullish/bearish)
  - Oversold/overbought signals (J < 0, J > 100)
  - Methods: `update()`, `getValue()`, `getCrossover()`, `isOversold()`, `isOverbought()`, `reset()`
  - Comprehensive test suite (14 tests)

- **OBV Indicator** (`src/indicators/OBVIndicator.js`)
  - On-Balance Volume calculation
  - Optional EMA smoothing
  - Slope detection using linear regression
  - Methods: `update()`, `getValue()`, `getEmaValue()`, `getSlope()`, `isBullish()`, `isBearish()`, `reset()`
  - Comprehensive test suite (15 tests)

- **ADX Indicator** (`src/indicators/ADXIndicator.js`)
  - ADX (Average Directional Index) calculation
  - DI+ and DI- (Directional Indicators)
  - Trend strength detection
  - Methods: `update()`, `getValue()`, `isTrending()`, `isStrongTrend()`, `getTrendDirection()`, `reset()`
  - Comprehensive test suite (14 tests)

- **Signal Weights Configuration** (updated `src/config/signal-weights.js`)
  - KDJ weights: max: 15, oversold_j: 0, overbought_j: 100, crossover_weight: 1.5
  - OBV weights: max: 10, slope_threshold: 0.5, use_ema: true
  - ADX weights: max: 10, trend_threshold: 25, strong_trend: 40
  - DOM weights: max: 20, imbalance_5_threshold: 0.2, spread_threshold_bps: 5.0

### Added - Phase 3: Depth of Market (DOM) Integration
- **DOM Processor** (`src/marketdata/DOMProcessor.js`)
  - Order book imbalance calculation at multiple depths (5, 10, 25 levels)
  - Bid-ask spread measurement in basis points
  - Microprice calculation (volume-weighted mid price)
  - Order book wall detection (identifies large orders)
  - Methods: `computeFeatures()`, `validateOrderBook()`, `getDepthStats()`
  - Comprehensive test suite (18 tests)

- **DOM Scoring** (`src/scoring/DOMScoring.js`)
  - Converts DOM features into trading signal contributions
  - **LIVE-ONLY**: Tagged with 'LIVE_ONLY_VALIDATION_REQUIRED'
  - Enforces `LIVE_MODE=true` requirement (throws error if used in backtest)
  - Imbalance scoring for long/short positions
  - Spread analysis (tight vs wide spreads)
  - Wall scoring (support/resistance levels)
  - Microprice divergence scoring
  - Methods: `computeContribution()`, `isLiveModeEnabled()`, `getLiveModeWarning()`
  - Comprehensive test suite (7 tests)

### Changed
- **Moved Files** (maintaining backward compatibility)
  - `rsi.js` → `src/indicators/RSIIndicator.js`
  - `macd.js` → `src/indicators/MACDIndicator.js`
  - `williamsR.js` → `src/indicators/WilliamsRIndicator.js`
  - `Awesome Oscillator AO.js` → `src/indicators/AwesomeOscillator.js`
  - `screenerConfig.js` → `src/screener/screenerConfig.js`
  - `screenerEngine.js` → `src/screener/screenerEngine.js`
  - `timeframeAligner.js` → `src/screener/timeframeAligner.js`
  - `signalEmitter.js` → `src/screener/signalEmitter.js`
  - `signal-weights.js` → `src/config/signal-weights.js`

- **Updated Imports**
  - `server.js` now loads signal-weights from new location with fallback
  - `screenerEngine.js` updated to use new indicator paths
  - `SignalGenerator` updated to look in both old and new config locations

### Testing
- **Test Coverage**: 174 passing tests
  - Original tests: 113 tests
  - New indicator tests: 43 tests (KDJ: 14, OBV: 15, ADX: 14)
  - DOM tests: 18 tests (DOMProcessor: 18, DOMScoring: 7 - condensed)
- **Test Infrastructure**: All tests use Node.js native test runner
- **Property-Based Tests**: Maintained existing fast-check property tests

### Security
- **DOM Safety**: DOM features cannot be used outside LIVE_MODE
  - Prevents backtesting with unreliable order book data
  - Runtime validation with clear error messages
  - All DOM contributions tagged for tracking

### Developer Experience
- **Organized Structure**: Clear separation of concerns
- **Backward Compatible**: Existing functionality preserved
- **Comprehensive Tests**: Every new feature fully tested
- **Factory Pattern**: Easy indicator instantiation
- **Type Safety**: Input validation on all indicators

## [3.5.2] - Previous Release

### Summary
- Precision-safe financial math with decimal.js
- Stop order state machine
- Order validation layer
- Config schema validation
- API key/secret redaction in logs
- Hot/cold path event architecture
- Property-based tests with fast-check

---

## Upgrade Notes

### From 3.5.2 to 4.0.0-alpha

1. **Environment Variables**: Update your `.env` file with new flags (see `.env.example`)
2. **File Locations**: Old file locations still work, but new structure is recommended
3. **New Indicators**: KDJ, OBV, and ADX are available via indicator registry
4. **DOM Features**: Only available when `LIVE_MODE=true` is set
5. **Tests**: Run `npm test` to verify all 174 tests pass

### Breaking Changes
- None in this alpha release - full backward compatibility maintained

### Deprecations
- Root-level indicator files (rsi.js, macd.js, etc.) are deprecated but still functional
- Root-level signal-weights.js is deprecated but still functional

### Migration Path
1. Copy files from new structure or use indicator registry
2. Update imports gradually
3. Enable new features via environment variables when ready
4. Old files can be removed in a future major release

---

## Future Roadmap

### Phase 4: Screener Integration (Planned)
- Wire dual-timeframe screener into server.js
- Dashboard UI for screener signals

### Phase 5: Rate-Limit Manager (Planned)
- Adaptive token bucket with 70% utilization target
- Priority-based API call scheduling

### Phase 6: Backtesting Engine (Planned)
- Deterministic offline strategy validation
- Walk-forward validation
- Comprehensive metrics (Sharpe, profit factor, max DD)

### Phase 7: Optimizer & Forward-Testing (Planned)
- Multi-objective parameter search
- Live validation in shadow mode

### Phase 8: Documentation (Planned)
- Integration guide
- Deployment guide
- API documentation
