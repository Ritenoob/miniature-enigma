# GitHub Copilot Instructions for KuCoin Futures Dashboard

This document provides instructions for GitHub Copilot when working on the KuCoin Perpetual Futures Dashboard project.

## Project Overview

This is a **KuCoin Perpetual Futures Trading Dashboard v3.5.0** - a semi-automated trading system for cryptocurrency futures trading. The system provides:

- Real-time market data visualization
- Technical indicator analysis and signal generation
- Automated position management with trailing stops
- Risk management with ROI-based stop-loss and take-profit
- Fee-adjusted break-even calculations
- API retry queue with exponential backoff

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
├── positions.json         # Position persistence
├── retry_queue.json       # Failed API operations queue
├── package.json           # Dependencies
└── .env                   # API credentials (not committed)
```

### Key Components

1. **Server (server.js)**
   - KuCoinFuturesAPI class: API communication with retry logic
   - TradeMath utility: V3.5 formula implementations from PDF documentation
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
- **Comments**: Add clear section headers with `// ========` separators

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

1. Start server: `npm start`
2. Open dashboard: `http://localhost:3001`
3. Monitor console logs for errors
4. Check WebSocket connection status
5. Test with real market data (requires API keys)

### Common Tasks

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
3. **Order Validation**: Double-check calculations before placing orders
4. **Rate Limiting**: Respect API rate limits to avoid bans
5. **Error Messages**: Don't expose sensitive information in logs

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
- **USE** the TradeMath utility functions instead of reimplementing calculations
- **RESPECT** the separation between server and client code

## Resources

- KuCoin Futures API: https://docs.kucoin.com/futures/
- Technical Indicators: Standard TA-Lib formulas
- Risk Management: Based on v3.5 documentation (includes position sizing, ROI-based SL/TP, fee calculations, liquidation formulas, and trailing stop algorithms)

## Version History

- **v3.5.0** (Current): Fee-adjusted break-even, accurate liquidation, slippage buffer, API retry queue
- **v3.4.2**: ROI-based SL/TP, confirmation modal
- **v3.4.1**: Leverage-adjusted SL/TP
- **v3.4.0**: Dollar-based position sizing

---

**Last Updated**: December 2024
**Maintained By**: Development Team
