# Changelog

All notable changes to this project will be documented in this file.

## [3.6.0] - 2026-01-01

### Added
- **Live Strategy Optimizer System** - Complete framework for parallel strategy variant testing
  - `OptimizerConfig.js`: Configuration manager with parameter constraints and variant generation
  - `ScoringEngine.js`: Composite scoring with ROI, Sharpe ratio, win rate, statistical significance testing
  - `TelemetryFeed.js`: Real-time metrics streaming via in-memory pub/sub and WebSocket
  - `LiveOptimizerController.js`: Main controller for parallel variant execution with safety mechanisms
  
- **New API Endpoints** - Five new endpoints under `/api/optimizer/*`:
  - `GET /api/optimizer/status` - Current optimizer state and active variants
  - `GET /api/optimizer/results` - Ranked variants with confidence scores
  - `POST /api/optimizer/start` - Begin testing with configurable variant count
  - `POST /api/optimizer/stop` - Halt testing and export final results
  - `POST /api/optimizer/promote` - Validate and promote variant to production

- **Signal Metadata Tagging** - Enhanced signal generation with experimental tracking:
  - `experimental` flag to distinguish experimental vs. production signals
  - `strategyVariantId` for tracking which variant generated the signal
  - `confidenceScore` numeric confidence value (0-1) for experimental strategies
  - Static helper method: `SignalGenerator.tagExperimental()`

- **Safety Features**:
  - Paper trading enabled by default (configurable per environment)
  - Automatic variant stopping on 5% loss or 10% drawdown limits
  - Rate limiting: 30 API calls per minute with 2-second throttle
  - Statistical significance validation (n≥50, p<0.05) required for promotion
  - Isolated state per variant to prevent production interference

- **Comprehensive Testing** - 39 new tests covering:
  - Configuration validation and variant generation
  - Scoring algorithms and confidence calculations
  - Telemetry streaming and pub/sub functionality
  - Controller lifecycle and variant isolation
  - Rate limiting and safety mechanisms
  - Total: 56 tests passing

- **Documentation** - `docs/OPTIMIZER_GUIDE.md`:
  - Architecture overview with data flow diagrams
  - Complete API reference with examples
  - Metric interpretation and promotion criteria
  - Troubleshooting guide and best practices
  - Advanced usage patterns and event listeners

### Fixed
- **`.well-known` DevTools 404 Errors** - Proper JSON 404 responses instead of HTML error pages
  - Added dedicated route handler for `.well-known/*` paths
  - Returns structured JSON with error details
  - Prevents Chrome DevTools console errors

- **404 Error Handling** - Improved error responses across all endpoints
  - Added catch-all 404 middleware
  - Consistent JSON error format with path and message
  - Better debugging experience

### Changed
- Updated version number from 3.5.2 to 3.6.0
- Enhanced startup banner to display V3.6 features
- Updated all version references in API responses

### Technical Details
- Follows existing codebase patterns and architecture
- Uses existing dependencies (express, ws, events)
- Reuses main WebSocket feed for market data (no new connections)
- Non-blocking async operations throughout
- Comprehensive error handling with proper logging
- Disabled by default (opt-in via `OPTIMIZER_ENABLED=true`)

### Breaking Changes
None - All new features are opt-in and backward compatible

---

## [3.5.2] - 2025-12-XX

### Added
- Precision-safe financial math with decimal.js (eliminates floating-point errors)
- Stop order state machine for protection against cancel-then-fail exposure
- Order validation layer enforcing reduceOnly on all exit orders
- Config schema validation at startup with clear error messages
- API key/secret redaction in logs for security
- Hot/cold path event architecture for latency-sensitive operations
- Property-based tests with fast-check for comprehensive edge case coverage

---

## [3.5.1] - 2025-12-XX

### Added
- Fee-adjusted break-even calculation (accounts for maker/taker fees)
- Accurate liquidation price formula with maintenance margin
- Slippage buffer on stop placement
- API retry queue with exponential backoff
- ROI-based SL/TP with inverse leverage scaling
- Volatility-based auto-leverage calculation
- Partial take-profit (scaling out) support
- Enhanced trailing stop with ATR-based variant
- Improved position sizing with fee deductions
- Rate limit handling and graceful degradation
