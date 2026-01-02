# Changelog

All notable changes to the MIRKO KuCoin Futures Trading System will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased] - V3.6.1 Release (In Progress)

### Status: Phase 1 Complete (3 of 9 PRs Integrated)

**Completed Integrations**:
- ✅ PR #1 - Copilot Instructions & Contribution Guidelines
- ✅ PR #9 - Version Reference Updates (v3.4 → v3.5)
- ✅ PR #2 - Python MACD Strategy

**Remaining Integrations** (High Complexity - Requires Sequential Manual Integration):
- ⏳ PR #6 - StopReplaceCoordinator (medium risk, core safety)
- ⏳ PR #8 - PingBudgetManager + Extended Indicators (high risk, rate limiting)
- ⏳ PR #7 - Optimization Engine (medium risk, research module)
- ⏳ PR #11 - Live Optimizer v3.6.0 (high risk, major conflicts expected)
- ⏳ PR #13 - Optimizer Integration (high risk, depends on #11)
- ⏳ PR #10 - Modular Architecture (DEFERRED - extreme risk, conflicts with all)

### Added in Phase 1 (Completed Features)

#### From PR #1 - Copilot Instructions ✅
- `.github/copilot-instructions.md` - AI assistant context and coding guidelines
- `.github/CONTRIBUTING.md` - Development workflow and contribution guidelines
- Project overview, architecture documentation, and trading formula references

#### From PR #9 - Version Reference Updates ✅
- Updated version references from v3.4.x to v3.5.0+ in comments
- Improved documentation consistency across codebase

#### From PR #2 - Python MACD Strategy ✅
- `eth_macd_strategy.py` - MACD + signal strength strategy for ETH/USDT perpetuals @ 100x leverage
- `requirements.txt` - Python dependencies (kucoin-futures-python, pandas, numpy, python-dotenv, requests)
- `tests/test_strategy.py` - Unit tests for trailing stop and signal generation
- Trailing stop system: Activates at +10% ROI, ratchets every +8% ROI
- Static SL at -9% ROI until trailing engages, TP at +1% ROI
- Safe by default (`KUCOIN_EXECUTE_TRADES=false` for dry run)
- Normalized scoring system with three strength thresholds
- Complete KuCoin Futures API integration

### Planned Features from Remaining PRs

This release aims to integrate features from multiple pull requests:

#### From PR #1 - Copilot Instructions
- GitHub Copilot development guidelines and contribution documentation
- Repository-specific coding standards and patterns

#### From PR #9 - Version Reference Updates
- Updated version references from v3.4 to v3.5+ throughout codebase
- Consistent version naming across documentation

#### From PR #6 - StopReplaceCoordinator with Emergency Protection  
- State machine for stop order management (IDLE → CANCELING → PLACING → CONFIRMED)
- Jittered exponential backoff retry policy (5 retries, 1-30s delays)
- Emergency market order fallback on failure
- Monotonic stop invariants (LONG: SL ≥ prev, SHORT: SL ≤ prev)
- Break-even fee coverage property tests

#### From PR #8 - PingBudgetManager + Extended Indicators
- Adaptive token bucket rate limiting (2000 calls/30s for VIP0)
- Priority queuing (CRITICAL > HIGH > MEDIUM > LOW)
- Auto-degradation to 40% utilization on repeated 429 errors
- Gradual recovery (5% per 60s without errors)
- Extended signal weights with KDJ, OBV, and DOM indicators
- Shadow runner for paper trading validation
- DOM features marked as live-only (no backtest optimization)

#### From PR #7 - Optimization Engine
- Complete backtesting framework with deterministic execution
- Technical indicators: KDJ (stochastic with J-line), ADX+DI (trend strength), OBV (volume confirmation)
- Fill models: Taker (immediate) and probabilistic limit (9th-level proxy)
- Position simulator with leverage-aware ROI SL/TP
- Performance metrics: Sharpe, Sortino, Calmar ratios
- Regime detection: ADX/ATR-based market classification
- Four strategy templates (conservative, aggressive, balanced, scalping)

#### From PR #11 - Live Optimizer v3.6.0 + CSP Headers
- Live strategy optimization system for parallel variant testing
- Four optimizer modules: OptimizerConfig, ScoringEngine, TelemetryFeed, LiveOptimizerController
- Five new API endpoints under `/api/optimizer/*`
- Content Security Policy (CSP) headers for enhanced security
- `.well-known/*` route handler for proper JSON 404 responses
- Signal tagging with experimental flags and variant tracking

#### From PR #10 - Modular Architecture
- Restructured into modular folders: `core/`, `screener/`, `strategy/`, `research/`, `config/`
- Dual-timeframe screener engine with 7 indicator engines
- Strategy router with dynamic profile switching
- Four pre-configured strategy profiles
- Configurable signal generator with pluggable weights

#### From PR #2 - Python MACD Strategy
- Python MACD + signal-strength strategy for ETH/USDT perpetuals
- 100x leverage support with trailing stops
- KuCoin REST API integration
- Unit tests for strategy validation

#### From PR #13 - Full Optimizer System Integration
- Integrated LiveOptimizerController with main server
- Paper trading mode with realistic fees and slippage
- Real-time variant performance tracking
- WebSocket message handlers for optimizer status
- Comprehensive API endpoints for monitoring

---

## [3.5.2] - 2025-12-29

### Added - Production-Grade Reliability
- **Precision-Safe Math**: All financial calculations use decimal.js to eliminate floating-point errors
- **Order Validation Layer**: All exit orders validated and enforced with `reduceOnly: true` flag
- **Config Validation**: Configuration validated at startup with clear error messages
- **Property-Based Tests**: Comprehensive edge case coverage with fast-check library
- **Stop Order State Machine**: Prevents cancel-then-fail exposure (library ready, integration optional)
- **Secure Logging**: API key/secret redaction utilities (library ready, integration optional)
- **Hot/Cold Path Architecture**: Event bus for latency-sensitive operations (library ready, integration optional)

### Changed
- Migrated all TradeMath functions to use decimal.js internally
- Enhanced order validation for all exit orders
- Improved error messages for configuration validation

### Fixed
- Floating-point precision errors in financial calculations
- Position reversal risk with strict `reduceOnly` enforcement

---

## [3.5.1] - 2025-12-XX

### Added
- Demo mode with synthetic market data and mock KuCoin client
- Automated tests for trading math formulas (`node --test`)
- GitHub Actions CI workflow to run tests on every push/PR
- Hardened server lifecycle: optional interval startup, graceful shutdown
- Provided `.env.example` and updated README with unified setup instructions

### Changed
- Server exports made test-friendly
- Intervals made optional for testing

---

## [3.5.0] - 2025-12-XX

### Added
- Fee-adjusted break-even calculation
- Accurate liquidation price formula
- Slippage buffer on stop orders
- API retry queue with exponential backoff
- ROI-based SL/TP with inverse leverage scaling
- Volatility-based auto-leverage
- Enhanced trailing stop algorithms (Staircase, ATR, Dynamic)
- Net P&L after fees display
- Partial take-profit support

### Changed
- Break-even trigger now accounts for trading fees
- Stop-loss and take-profit use inverse leverage scaling for consistent risk
- Liquidation formula includes maintenance margin

---

## [3.4.2] - Earlier

### Added
- ROI-based SL/TP calculations
- Trade confirmation modal
- Break-even & trailing stop indicators

---

## [3.4.1] - Earlier

### Added
- Leverage-adjusted SL/TP

### Fixed
- Floating-point precision errors

---

## [3.4.0] - Earlier

### Added
- Dollar-based position sizing
- Leveraged P&L percentages

---

## Note on V3.6.1 Release

The V3.6.1 release represents a comprehensive integration effort combining features from multiple parallel development branches. Due to the complexity and scope of merging 9+ pull requests with potential conflicts in core files (server.js, signal-weights.js, package.json), this release requires:

1. **Sequential Integration**: Each PR must be merged and tested individually
2. **Conflict Resolution**: Manual resolution of conflicts in shared files
3. **Comprehensive Testing**: Full test suite + integration testing after each merge
4. **Documentation Updates**: Complete update of all version references and feature docs

**Status**: This CHANGELOG documents the planned features. Actual integration is in progress.

---

For more information about specific features, see:
- README.md - Installation and usage
- docs/FEATURES.md - Detailed feature documentation (if available)
- docs/MIGRATION.md - Migration guide (if available)
