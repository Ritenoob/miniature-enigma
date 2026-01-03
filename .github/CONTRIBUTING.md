# Contributing to KuCoin Futures Dashboard

Thank you for your interest in contributing to this project! This document provides guidelines for contributing.

## Getting Started

### Prerequisites

- Node.js 16.0.0 or higher
- npm (comes with Node.js)
- KuCoin account with Futures API access
- Basic understanding of cryptocurrency trading concepts

### Setup Development Environment

1. **Clone the repository**
   ```bash
   git clone https://github.com/Ritenoob/kucoin-futures-dashboard.git
   cd kucoin-futures-dashboard
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure API credentials**
   ```bash
   cp .env.example .env
   # Edit .env with your KuCoin API credentials
   ```

4. **Start the development server**
   ```bash
   npm start
   ```

5. **Access the dashboard**
   - Open http://localhost:3001 in your browser

## Development Guidelines

### Code Style

- Follow the existing code style in the project
- Use ES6+ features (classes, arrow functions, async/await)
- Add comments for complex logic, especially trading calculations
- Use meaningful variable and function names

### Naming Conventions

- **Classes**: PascalCase (e.g., `PositionManager`, `TradeMath`)
- **Functions/Methods**: camelCase (e.g., `calculateLiquidationPrice`)
- **Constants**: SCREAMING_SNAKE_CASE (e.g., `INITIAL_SL_ROI`)
- **Variables**: camelCase (e.g., `accountBalance`)

### Making Changes

1. **Create a new branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes**
   - Write clean, readable code
   - Add comments where necessary
   - Update documentation if needed

3. **Test your changes**
   - Test manually with the dashboard
   - Ensure no console errors
   - Verify WebSocket communication works
   - Test with paper trading first if changing trading logic

4. **Commit your changes**
   ```bash
   git add .
   git commit -m "Brief description of changes"
   ```

5. **Push to GitHub**
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Create a Pull Request**
   - Describe what you changed and why
   - Reference any related issues
   - Include screenshots if UI changed

## Project Structure

```
.
├── server.js              # Main backend server
├── index.html             # Frontend dashboard
├── signal-weights.js      # Signal configuration
├── positions.json         # Position persistence (generated)
├── retry_queue.json       # Retry queue (generated)
├── package.json           # Dependencies
├── .env                   # API credentials (DO NOT COMMIT)
├── .env.example           # Environment template
└── .github/
    ├── copilot-instructions.md  # Copilot guidelines
    └── CONTRIBUTING.md          # This file
```

## Areas for Contribution

### Beginner-Friendly

- UI/UX improvements
- Documentation updates
- Bug fixes in non-critical areas
- Adding new technical indicators
- CSS styling enhancements

### Intermediate

- New signal generation strategies
- Additional order types
- Enhanced position tracking
- WebSocket performance optimization
- Error handling improvements

### Advanced

- Core trading formula modifications (requires deep understanding)
- Risk management algorithm enhancements
- API retry logic improvements
- Performance optimization
- Security enhancements

## Testing Guidelines

### Manual Testing Checklist

- [ ] Dashboard loads without errors
- [ ] WebSocket connection establishes
- [ ] Market data updates in real-time
- [ ] Symbols can be added/removed
- [ ] Trade calculations display correctly
- [ ] Positions are tracked properly
- [ ] Logs show appropriate messages

### Trading Logic Testing

**CRITICAL**: Always test trading changes with paper trading or minimal position sizes first!

1. Test calculation accuracy:
   - Verify position sizing calculations
   - Check SL/TP price calculations
   - Validate liquidation price calculations
   - Confirm fee calculations

2. Test edge cases:
   - Very small position sizes
   - High leverage scenarios
   - Rapid price movements
   - API failures and retries

## Important Trading Formula Rules

**DO NOT** modify these formulas without understanding the V3.5 documentation:

### Position Sizing
```javascript
marginUsed = accountBalance × (positionPercent / 100)
positionValueUSD = marginUsed × leverage
size = floor(positionValueUSD / (entryPrice × multiplier))
```

### ROI-Based Stop Loss (Long)
```javascript
SL_price = entry × (1 - (R_risk / leverage / 100))
```

### Fee-Adjusted Break-Even
```javascript
breakEvenROI = (entryFee + exitFee) × leverage × 100 + buffer
```

### Liquidation Price (Long)
```javascript
liqPrice = entry × (1 - (1 / leverage) × (1 + maintMargin))
```

## Common Development Tasks

### Adding a New Technical Indicator

1. Add calculation method to `TechnicalIndicators` class in `server.js`:
   ```javascript
   static calculateMyIndicator(data, period) {
     // Your calculation logic
   }
   ```

2. Update `MarketDataManager.getIndicators()`:
   ```javascript
   myIndicator: TechnicalIndicators.calculateMyIndicator(closes, 14)
   ```

3. Update signal generation in `SignalGenerator.generate()`:
   ```javascript
   if (indicators.myIndicator > threshold) {
     score += points;
   }
   ```

4. Update frontend display in `dashboard.updateIndicators()` in `index.html`

### Adding a New Configuration Parameter

1. Add to `CONFIG.TRADING` in `server.js`:
   ```javascript
   MY_NEW_PARAM: 1.5,
   ```

2. Document in `.github/copilot-instructions.md`

3. Use in your code:
   ```javascript
   const myValue = CONFIG.TRADING.MY_NEW_PARAM;
   ```

### Adding a New WebSocket Message Type

1. **Server side** (server.js):
   ```javascript
   // Broadcast the new message type
   broadcast({
     type: 'my_new_type',
     data: yourData
   });
   ```

2. **Client side** (index.html):
   ```javascript
   // In handleMessage(data)
   case 'my_new_type':
     this.handleMyNewType(data);
     break;
   ```

## Security Considerations

- **Never commit API keys**: Always use `.env` and keep it out of git
- **Validate inputs**: Check all user inputs before processing
- **Test calculations**: Double-check trading calculations before deploying
- **Error handling**: Don't expose sensitive info in error messages
- **Rate limits**: Respect KuCoin API rate limits

## Debugging Tips

### Server-Side Debugging

```javascript
// Use broadcastLog for logging
broadcastLog('info', 'Debug message', { data: someData });

// Console logs appear in terminal
console.log('[DEBUG]', someVariable);
```

### Client-Side Debugging

```javascript
// Use browser console
console.log('Debug:', this.someVariable);

// Dashboard log panel
this.log('Debug message', 'info');
```

### WebSocket Debugging

Monitor WebSocket messages:
1. Open browser DevTools (F12)
2. Go to Network tab
3. Filter by WS (WebSocket)
4. Click the connection to see messages

## Questions or Issues?

- Check the documentation in `.github/copilot-instructions.md`
- Review existing issues on GitHub
- Open a new issue if you find a bug
- Ask questions in pull request discussions

## License

By contributing, you agree that your contributions will be licensed under the same license as the project (MIT).

---

**Happy Trading! 📈**
