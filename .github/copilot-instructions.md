# GitHub Copilot Instructions for KuCoin Futures Dashboard

This document provides instructions for GitHub Copilot when working on the KuCoin Perpetual Futures Dashboard project.

## Project Overview

This is a **KuCoin Perpetual Futures Trading Dashboard v3.5.2** - a semi-automated trading system for cryptocurrency futures trading. The system provides:

- Real-time market data visualization
- Technical indicator analysis and signal generation
- Automated position management with trailing stops
- Risk management with ROI-based stop-loss and take-profit
- Fee-adjusted break-even calculations
- API retry queue with exponential backoff
- Precision-safe financial math using decimal.js
- Order validation layer with reduceOnly enforcement
- Config validation at startup
- Multi-timeframe screener with dual timeframe analysis
- Research and optimization modules

## Technology Stack

- **Backend**: Node.js with Express
- **Frontend**: Vanilla JavaScript (no framework)
- **Communication**: WebSocket for real-time updates
- **API**: KuCoin Futures API
- **Database**: JSON file-based persistence (positions.json, retry_queue.json)

## Architecture

### File Structure

```
.
├── server.js              # Main backend server (2500+ lines)
├── index.html             # Frontend dashboard (3000+ lines)
├── signal-weights.js      # Signal generation configuration
├── screenerConfig.js      # Screener configuration
├── screenerEngine.js      # Dual-timeframe screener logic
├── positions.json         # Position persistence
├── retry_queue.json       # Failed API operations queue
├── package.json           # Dependencies
├── .env                   # API credentials (not committed)
├── src/
│   ├── lib/               # Core library modules (v3.5.2+)
│   │   ├── DecimalMath.js          # Precision-safe financial calculations
│   │   ├── OrderValidator.js       # Order validation & reduceOnly enforcement
│   │   ├── ConfigSchema.js         # Config validation schema
│   │   ├── SignalGenerator.js      # Signal generation logic
│   │   ├── PingBudgetManager.js    # API rate limit management
│   │   ├── SecureLogger.js         # Redacted logging utilities
│   │   ├── EventBus.js             # Event bus for hot/cold paths
│   │   ├── StopOrderStateMachine.js # Stop order state management
│   │   ├── StopReplaceCoordinator.js # Stop replacement coordination
│   │   └── index.js                # Module exports
│   ├── marketdata/        # Market data providers
│   │   ├── OHLCProvider.js         # OHLC data provider
│   │   └── index.js                # Module exports
│   └── optimizer/         # Optimization modules
│       ├── ExecutionSimulator.js   # Trade execution simulator
│       ├── LiveOptimizerController.js # Live optimization controller
│       ├── TrailingStopPolicy.js   # Trailing stop policies
│       └── index.js                # Module exports
├── research/              # Research and analysis tools
│   ├── forward/          # Forward testing
│   ├── lib/signals/      # Extended signal generators
│   └── scripts/          # Utility scripts
├── tests/                # Test suite
│   ├── tradeMath.test.js
│   ├── tradeMath.property.test.js
│   ├── configValidation.test.js
│   ├── pingBudgetManager.test.js
│   ├── pingBudgetManager.property.test.js
│   ├── signal-generator.test.js
│   ├── signalWeights.test.js
│   ├── stopStateMachine.test.js
│   ├── stopReplaceCoordinator.test.js
│   ├── trailing-stop-policy.test.js
│   ├── execution-simulator.test.js
│   ├── live-optimizer.test.js
│   └── ohlc-provider.test.js
└── docs/                 # Documentation
    ├── OPTIMIZER.md
    ├── SIGNAL_CONFIG.md
    ├── TESTING.md
    └── OHLC_PROVIDER.md
```

### Key Components

1. **Server (server.js)**
   - KuCoinFuturesAPI class: API communication with retry logic
   - TradeMath utility object: v3.5.0 formula implementations
     - **Note**: Legacy TradeMath is being phased out in favor of DecimalMath for precision
     - New code should use DecimalMath; existing TradeMath code will be migrated gradually
     - Both are available during transition period for backward compatibility
   - MarketDataManager: Candle data and technical indicators
   - PositionManager: Position lifecycle and risk management
   - RetryQueueManager: Failed operation retry with exponential backoff
   - WebSocket server: Real-time communication with dashboard

2. **Frontend (index.html)**
   - Dashboard class: Main UI controller
   - Real-time market data display
   - Signal generator with breakdown
   - Order book visualization
   - Position management interface
   - Trade execution with confirmation modal

3. **Library Modules (src/lib/)** - v3.5.2+
   - **DecimalMath**: Precision-safe financial calculations using decimal.js
     - Eliminates floating-point errors in trading calculations
     - Used for position sizing, P&L, ROI, and fee calculations
   - **OrderValidator**: Order validation and safety enforcement
     - Validates all exit orders have `reduceOnly: true`
     - Prevents accidental position reversals
   - **ConfigSchema**: Configuration validation at startup
     - Validates all config parameters against schema
     - Applies defaults for missing values
   - **SignalGenerator**: Technical indicator signal generation
     - Modular signal generation from multiple indicators
     - Configurable weights and thresholds
   - **PingBudgetManager**: API rate limit management
     - Prevents rate limit violations
     - Exponential backoff on rate limit errors
   - **SecureLogger**: Secure logging with credential redaction
     - Redacts API keys and secrets from logs
   - **StopOrderStateMachine**: Stop order state management
     - Prevents cancel-then-fail exposure
   - **EventBus**: Event bus for latency-sensitive operations
     - Hot/cold path architecture

4. **Market Data (src/marketdata/)**
   - **OHLCProvider**: OHLC (candlestick) data provider
     - Fetches and manages historical price data
     - Supports multiple timeframes

5. **Optimizer (src/optimizer/)**
   - **ExecutionSimulator**: Simulates trade execution
     - Backtesting and forward testing support
   - **LiveOptimizerController**: Live optimization controller
     - Real-time signal optimization

6. **Screener**
   - **screenerEngine.js**: Dual-timeframe screening logic
   - **screenerConfig.js**: Screener configuration and symbol management

## Coding Standards

### JavaScript Style

- **Use ES6+ features**: Classes, arrow functions, async/await, destructuring
- **Naming conventions**:
  - Classes: PascalCase (e.g., `PositionManager`, `TradeMath`)
  - Functions: camelCase (e.g., `calculateLiquidationPrice`, `updatePrice`)
  - Constants: SCREAMING_SNAKE_CASE in CONFIG object
  - Variables: camelCase
- **Error handling**: Always use try-catch for async operations
- **Logging**: Use `broadcastLog(type, message, data)` for server-side logging
  - Types: 'info', 'success', 'warn', 'error', 'signal'
  - For sensitive operations, use SecureLogger to redact credentials (v3.5.2+)
- **Comments**: Add clear section headers with `// ========` separators

### V3.5.2 Best Practices

- **Financial Calculations**: ALWAYS use DecimalMath instead of native JavaScript math
  ```javascript
  // ❌ BAD - Floating-point errors
  const margin = accountBalance * (positionPercent / 100);
  
  // ✅ GOOD - Precision-safe
  const margin = DecimalMath.calculateMarginUsed(accountBalance, positionPercent);
  ```

- **Order Validation**: ALWAYS validate orders before placement
  ```javascript
  // ❌ BAD - No validation
  await api.placeOrder(params);
  
  // ✅ GOOD - Validated and sanitized
  OrderValidator.validateExitOrder(params);
  const safeParams = OrderValidator.sanitize(params, 'exit');
  await api.placeOrder(safeParams);
  ```

- **Config Changes**: Validate config updates at runtime
  ```javascript
  // ❌ BAD - No validation
  CONFIG.TRADING.LEVERAGE = newValue;
  
  // ✅ GOOD - Validated
  const { validateConfig } = require('./src/lib/ConfigSchema');
  validateConfig({ TRADING: { LEVERAGE: newValue } });
  CONFIG.TRADING.LEVERAGE = newValue;
  ```

- **Testing**: Write property-based tests for trading formulas
  ```javascript
  // Use fast-check for comprehensive edge case coverage
  const fc = require('fast-check');
  
  fc.assert(
    fc.property(
      fc.float({ min: 100, max: 100000 }),
      fc.float({ min: 0.1, max: 50 }),
      (entry, roi) => {
        const sl = DecimalMath.calculateStopLossPrice('long', entry, roi, 10);
        return sl < entry; // SL must be below entry for longs
      }
    )
  );
  ```

### Node.js Backend Patterns

```javascript
// API calls should use the retry logic
async request(method, endpoint, data = null, retryCount = 0) {
  // Implementation with automatic retry and rate limit handling
}

// Broadcast to all WebSocket clients
function broadcast(message) {
  const str = JSON.stringify(message);
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(str);
    }
  });
}
```

### Frontend Patterns

```javascript
// Dashboard message handling
handleMessage(data) {
  switch (data.type) {
    case 'market_update':
      // Update displays
      break;
    // ...
  }
}

// Send message to server
send(data) {
  if (this.ws && this.ws.readyState === WebSocket.OPEN) {
    this.ws.send(JSON.stringify(data));
  }
}
```

## Critical V3.5 Formulas (FROM PDF DOCUMENTATION)

All trading calculations MUST follow the formulas from the PDF documentation:

### Position Sizing
```javascript
marginUsed = accountBalance × (positionPercent / 100)
positionValueUSD = marginUsed × leverage
size = floor(positionValueUSD / (entryPrice × multiplier))
```

### ROI-Based Stop Loss & Take Profit
```javascript
// Stop loss price (Long)
SL_price = entry × (1 - (R_risk / leverage / 100))

// Take profit price (Long)
TP_price = entry × (1 + (R_reward / leverage / 100))
```

### Fee-Adjusted Break-Even
```javascript
breakEvenROI = (entryFee + exitFee) × leverage × 100 + buffer
```

### Liquidation Price
```javascript
// Long
liqPrice = entry × (1 - (1 / leverage) × (1 + maintMargin))

// Short
liqPrice = entry × (1 + (1 / leverage) × (1 + maintMargin))
```

### Slippage-Adjusted Stop
```javascript
// Long
adjustedStopPrice = stopPrice × (1 - slippageBuffer / 100)

// Short
adjustedStopPrice = stopPrice × (1 + slippageBuffer / 100)
```

### Trailing Stop (Staircase Mode)
```javascript
steps = floor((currentROI - lastTrailedROI) / stepPercent)
newSL = currentSL × (1 + steps × movePercent / 100)  // for longs
```

## Trading System Rules

### Position Management

1. **Entry**: Always use 9th level of order book for entry price
2. **Stop Loss**: ROI-based, NOT price-based. Accounts for leverage inverse scaling
3. **Take Profit**: ROI-based, matches stop loss methodology
4. **Liquidation**: Must be calculated with maintenance margin included
5. **Break-Even**: Only trigger when ROI exceeds fee-adjusted threshold
6. **Trailing**: Three modes available - Staircase, ATR-based, Dynamic
7. **Order Safety**: All exit orders MUST use `reduceOnly: true` (enforced by OrderValidator)
8. **Precision**: All financial calculations MUST use DecimalMath to avoid floating-point errors

### Risk Management Defaults

```javascript
CONFIG.TRADING = {
  INITIAL_SL_ROI: 0.5,           // 0.5% ROI stop loss
  INITIAL_TP_ROI: 2.0,           // 2.0% ROI take profit
  BREAK_EVEN_BUFFER: 0.1,        // 0.1% buffer above fee break-even
  TRAILING_STEP_PERCENT: 0.15,   // Trail every 0.15% ROI gain
  TRAILING_MOVE_PERCENT: 0.05,   // Move SL by 0.05% price per step
  SLIPPAGE_BUFFER_PERCENT: 0.02, // 0.02% slippage buffer
  POSITION_SIZE_PERCENT: 0.5,    // 0.5% of balance per trade
  DEFAULT_LEVERAGE: 10,
  MAX_POSITIONS: 5,
  TAKER_FEE: 0.0006,            // 0.06% taker fee
  MAKER_FEE: 0.0002,            // 0.02% maker fee
  MAINTENANCE_MARGIN_PERCENT: 0.5 // 0.5% maintenance margin
}
```

### API Best Practices

1. **Always use retry logic**: Use the `RetryQueueManager` for critical operations
2. **Rate limiting**: Respect KuCoin rate limits, handle 429 errors
3. **Order safety**: Always set `reduceOnly: true` for exit orders
4. **Error handling**: Add failed operations to retry queue
5. **Graceful degradation**: Continue operation even if some API calls fail

### State Management

1. **Position persistence**: Save to `positions.json` after every state change
2. **Retry queue persistence**: Save to `retry_queue.json` 
3. **In-memory state**: Use Maps for active positions
4. **WebSocket state**: Broadcast state changes to all connected clients

## Technical Indicators

The system uses the following indicators (in TechnicalIndicators class):

- **RSI** (14 period): Relative Strength Index
- **Williams %R** (14 period): Momentum indicator
- **MACD** (12, 26, 9): Moving Average Convergence Divergence
- **AO**: Awesome Oscillator (5, 34)
- **EMA** (50, 200): Exponential Moving Averages
- **Bollinger Bands** (20, 2): Price bands
- **Stochastic** (14, 3, 3): Oscillator
- **ATR** (14 period): Average True Range
- **ATR%**: ATR as percentage of price (volatility measure)

### Signal Generation

Signals range from -120 (Strong Sell) to +120 (Strong Buy):
- RSI: ±25 points
- Williams %R: ±20 points
- MACD: ±20 points
- AO: ±15 points
- EMA Trend: ±20 points
- Stochastic: ±10 points
- Bollinger Bands: ±10 points

## Development Guidelines

### Adding New Features

1. **Server-side changes**:
   - Add new functionality to appropriate class or manager
   - Update CONFIG if adding configurable parameters
   - Add WebSocket message type if client needs the data
   - Update broadcast functions to send new data
   - Persist state changes if needed

2. **Client-side changes**:
   - Add message handler in `handleMessage(data)`
   - Update UI in appropriate `update*()` method
   - Add event listeners in `setupEventListeners()`
   - Follow existing CSS variable naming conventions

### Testing Changes

1. **Run automated tests**: `npm test`
   - Runs all tests in the `tests/` directory using Node.js test runner
   - Includes unit tests, property-based tests, and integration tests
   - Test files:
     - `tradeMath.test.js`: Basic formula tests
     - `tradeMath.property.test.js`: Property-based tests with fast-check
     - `configValidation.test.js`: Config schema validation tests
     - `pingBudgetManager.test.js`: Rate limit manager unit tests
     - `pingBudgetManager.property.test.js`: Rate limit manager property-based tests
     - `signal-generator.test.js`: Signal generation tests
     - `signalWeights.test.js`: Signal weight configuration tests
     - `stopStateMachine.test.js`: Stop order state machine tests
     - `stopReplaceCoordinator.test.js`: Stop replacement coordination tests
     - `trailing-stop-policy.test.js`: Trailing stop policy tests
     - `execution-simulator.test.js`: Trade execution simulator tests
     - `live-optimizer.test.js`: Live optimization controller tests
     - `ohlc-provider.test.js`: OHLC data provider tests

2. **Run specific tests**: `npm run test:rate-limit`
   - Runs only rate limit manager tests

3. **Manual testing**:
   - Start server: `npm start`
   - Open dashboard: `http://localhost:3001`
   - Monitor console logs for errors
   - Check WebSocket connection status
   - Test with real market data (requires API keys)

4. **Demo mode**: Set `DEMO_MODE=true` in `.env`
   - Enables synthetic market data
   - Mock trading client (no real orders)
   - Safe for local testing without API keys

### Common Tasks

**Use DecimalMath for financial calculations (v3.5.2+):**
```javascript
// Import the module
const DecimalMath = require('./src/lib/DecimalMath');

// Use for all financial calculations
const marginUsed = DecimalMath.calculateMarginUsed(accountBalance, positionPercent);
const positionValue = DecimalMath.calculatePositionValue(marginUsed, leverage);
const lotSize = DecimalMath.calculateLotSize(positionValue, entryPrice, multiplier);

// For P&L calculations
const pnl = DecimalMath.calculateUnrealizedPnL(side, entryPrice, currentPrice, size, multiplier);
const roi = DecimalMath.calculateROI(pnl, marginUsed);
```

**Validate orders before placement (v3.5.2+):**
```javascript
// Import the validator
const OrderValidator = require('./src/lib/OrderValidator');

// Validate exit orders (throws on failure)
OrderValidator.validateExitOrder(orderParams);

// Or sanitize and enforce reduceOnly
const safeParams = OrderValidator.sanitize(orderParams, 'exit');

// Validate stop orders
OrderValidator.validateStopOrder(stopOrderParams);
```

**Add a new technical indicator:**
```javascript
// In TechnicalIndicators class
static calculateNewIndicator(data, period) {
  // Implementation
}

// In MarketDataManager.getIndicators()
newIndicator: TechnicalIndicators.calculateNewIndicator(closes, 14),

// Update SignalGenerator.generate() to include in scoring
```

**Add a new order type:**
```javascript
// In KuCoinFuturesAPI class
async placeNewOrderType(params) {
  return this.request('POST', '/api/v1/orders', params);
}

// In PositionManager class
async executeNewOrderType() {
  // Implementation with retry queue support
}
```

## Security Considerations

1. **API Keys**: NEVER commit `.env` file. Use environment variables.
2. **Input Validation**: Validate all user inputs before processing
3. **Order Validation**: Use OrderValidator to enforce reduceOnly on all exit orders (v3.5.2+)
4. **Secure Logging**: Use SecureLogger to redact API keys/secrets from logs (v3.5.2+)
5. **Rate Limiting**: Use PingBudgetManager to respect API rate limits and avoid bans (v3.5.2+)
6. **Error Messages**: Don't expose sensitive information in logs
7. **Config Validation**: All config values are validated at startup (v3.5.2+)

## Deployment

1. **Environment Variables Required**:
   ```
   KUCOIN_API_KEY=your_api_key
   KUCOIN_API_SECRET=your_api_secret
   KUCOIN_API_PASSPHRASE=your_passphrase
   PORT=3001
   ```

2. **Dependencies**: Run `npm install` before starting
3. **Start**: `npm start` or `node server.js`
4. **Port**: Default 3001, configurable via PORT env variable

## Important Notes for Copilot

- **DO NOT** modify the core trading formulas without understanding the PDF documentation
- **ALWAYS** maintain backwards compatibility with saved position data
- **TEST** all trading logic changes thoroughly with paper trading first
- **PRESERVE** the retry queue mechanism for critical operations
- **MAINTAIN** the WebSocket communication protocol
- **FOLLOW** the existing error handling patterns
- **USE** DecimalMath for all financial calculations (v3.5.2+) to avoid floating-point errors
- **USE** OrderValidator for all order placements (v3.5.2+) to enforce safety
- **USE** ConfigSchema validation for all config changes (v3.5.2+)
- **RESPECT** the separation between server and client code
- **WRITE** tests for all new features using the Node.js test runner
- **RUN** `npm test` before committing changes

## Resources

- KuCoin Futures API: https://docs.kucoin.com/futures/
- Technical Indicators: Standard TA-Lib formulas
- Risk Management: Based on v3.5 documentation (includes position sizing, ROI-based SL/TP, fee calculations, liquidation formulas, and trailing stop algorithms)

## Version History

- **v3.5.2** (Current): 
  - Precision-safe financial math with decimal.js
  - Order validation layer with reduceOnly enforcement
  - Config schema validation at startup
  - Property-based tests with fast-check
  - Stop order state machine
  - Secure logging with credential redaction
  - Event bus for hot/cold path architecture
  - Dual-timeframe screener
  - Research and optimization modules
  - Comprehensive test suite

- **v3.5.1**:
  - Demo mode with synthetic market data
  - Test-friendly startup controls
  - Automated formula tests
  - GitHub Actions CI pipeline

- **v3.5.0**: 
  - Fee-adjusted break-even calculation
  - Accurate liquidation price formula
  - Slippage buffer on stop orders
  - API retry queue with exponential backoff
  - ROI-based SL/TP with inverse leverage scaling
  - Volatility-based auto-leverage
  - Enhanced trailing stop algorithms

- **v3.4.2**: ROI-based SL/TP, confirmation modal
- **v3.4.1**: Leverage-adjusted SL/TP
- **v3.4.0**: Dollar-based position sizing

---

**Last Updated**: January 2026
**Maintained By**: Development Team
