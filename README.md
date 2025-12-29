# KuCoin Perpetual Futures Dashboard v3.5.0

## 🚀 V3.5 Enhancements

This version implements comprehensive improvements based on the PDF documentation for accurate trading calculations, position management, and risk control.

### Key Features

| Feature | Description |
|---------|-------------|
| **Fee-Adjusted Break-Even** | Break-even trigger accounts for trading fees, preventing premature stops |
| **ROI-Based SL/TP** | Stop-loss and take-profit use inverse leverage scaling for consistent risk |
| **Accurate Liquidation** | Formula includes maintenance margin for precise liquidation price |
| **Slippage Buffer** | Stop orders include buffer to prevent stop-hunting |
| **API Retry Queue** | Failed stop updates are queued and retried with exponential backoff |
| **Volatility-Based Leverage** | Auto-leverage mode adjusts based on ATR percentage |
| **Enhanced Trailing Stops** | Three modes: Staircase, ATR-Based, and Dynamic |
| **Net P&L Display** | Shows both gross and net profit/loss after fees |

---

## 📊 Mathematical Formulas (from PDF)

### Position Sizing

```
marginUsed = accountBalance × (positionPercent / 100)
positionValueUSD = marginUsed × leverage
size = floor(positionValueUSD / (entryPrice × multiplier))
```

**Example:**
- Account: $10,000
- Position: 0.5%
- Leverage: 10x
- Entry: $50,000

```
marginUsed = $10,000 × 0.005 = $50
positionValue = $50 × 10 = $500
size = floor($500 / $50,000) = 0.01 BTC
```

### P&L Calculation

```
priceDiff = currentPrice - entryPrice  (for longs)
unrealizedPnl = priceDiff × size × multiplier
leveragedPnlPercent = (unrealizedPnl / marginUsed) × 100
```

**Key Insight:** A 0.2% price move at 10x leverage = 2% ROI on margin.

### ROI-Based Stop-Loss & Take-Profit (V3.4.1+)

The stop-loss and take-profit are defined by target ROI percentages, not raw price percentages:

```
SL_price = entry × (1 - (R_risk / leverage / 100))
TP_price = entry × (1 + (R_reward / leverage / 100))
```

**Example at 10x leverage:**
- Target SL ROI: 0.5%
- Required price move: 0.5% ÷ 10 = 0.05%
- Entry $50,000 → SL at $49,975

### Fee-Adjusted Break-Even (V3.5)

```
breakEvenROI = (entryFee + exitFee) × leverage × 100 + buffer
```

**Example:**
- Taker fee: 0.06%
- Leverage: 10x
- Buffer: 0.1%

```
breakEvenROI = (0.0006 + 0.0006) × 10 × 100 + 0.1 = 1.3% ROI
```

The stop only moves to entry when leveraged ROI exceeds 1.3%, ensuring fees are covered.

### Liquidation Price

```
liqPrice = entry × (1 - (1 / leverage) × (1 + maintMargin))  // for longs
liqPrice = entry × (1 + (1 / leverage) × (1 + maintMargin))  // for shorts
```

**Example:**
- Long entry: $10,000
- Leverage: 10x
- Maintenance margin: 0.5%

```
liqPrice = $10,000 × (1 - 0.1 × 1.005) = $8,995
```

### Trailing Stop Algorithm (Staircase Mode)

```
steps = floor((currentROI - lastTrailedROI) / stepPercent)
if steps > 0:
    slMovePercent = steps × movePercent
    newSL = currentSL × (1 + slMovePercent / 100)  // for longs
```

**Configuration:**
- `TRAILING_STEP_PERCENT`: 0.15% ROI (trail every 0.15% profit)
- `TRAILING_MOVE_PERCENT`: 0.05% price (move SL by 0.05% per step)

### Slippage Buffer

```
adjustedStopPrice = stopPrice × (1 - slippageBuffer / 100)  // for long stops
adjustedStopPrice = stopPrice × (1 + slippageBuffer / 100)  // for short stops
```

Default buffer: 0.02% of price

---

## ⚡ Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure API Keys

```bash
cp .env.example .env
# Edit .env with your KuCoin API credentials
```

### 3. Start the Server

```bash
npm start
```

### 4. Open Dashboard

Navigate to `http://localhost:3001`

### 5. Run the Python MACD Strategy (ETH/USDT Perps @ 100×)

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # add your KuCoin API credentials
python eth_macd_strategy.py
```

**Python strategy highlights**
- Mirrors the provided Pine Script MACD + signal-strength filter for ETH/USDT perpetuals at 100× leverage.
- Uses the account’s available USDT as starting capital; position sizing is percent-of-balance (default 1%).
- Risk controls: static SL at -9% ROI until trailing activates; trailing starts at +10% ROI and ratchets every +8% ROI; default TP at +1% ROI.
- Safe by default (`KUCOIN_EXECUTE_TRADES=false`); set to `true` in `.env` to place live orders.

---

## 🎛️ Configuration

### Trading Parameters

Edit `CONFIG.TRADING` in `server.js`:

```javascript
TRADING: {
  INITIAL_SL_ROI: 0.5,           // 0.5% ROI stop loss
  INITIAL_TP_ROI: 2.0,           // 2.0% ROI take profit
  BREAK_EVEN_BUFFER: 0.1,        // 0.1% buffer above fee break-even
  TRAILING_STEP_PERCENT: 0.15,   // Trail every 0.15% ROI gain
  TRAILING_MOVE_PERCENT: 0.05,   // Move SL by 0.05% price per step
  SLIPPAGE_BUFFER_PERCENT: 0.02, // 0.02% slippage buffer
  POSITION_SIZE_PERCENT: 0.5,    // 0.5% of balance per trade
  DEFAULT_LEVERAGE: 10,
  MAX_POSITIONS: 5
}
```

### Fee Configuration

```javascript
TAKER_FEE: 0.0006,  // 0.06% taker fee
MAKER_FEE: 0.0002,  // 0.02% maker fee
```

### Auto-Leverage Tiers

| ATR % | Safe Leverage |
|-------|---------------|
| < 0.5% | 50x |
| 0.5-1.0% | 25x |
| 1.0-2.0% | 15x |
| 2.0-3.0% | 10x |
| 3.0-5.0% | 5x |
| > 5.0% | 3x |

---

## 🔄 Trailing Stop Modes

### 1. Staircase (Default)
Discrete steps based on ROI increments. Most predictable behavior.

### 2. ATR-Based
Dynamic trailing distance based on Average True Range:
```
trailingDistance = ATR × 1.5
```
Adapts to market volatility automatically.

### 3. Dynamic
Variable step sizes based on profit level:
- < 5% ROI: 0.10% steps, 0.03% moves
- 5-20% ROI: 0.15% steps, 0.05% moves
- > 20% ROI: 0.25% steps, 0.10% moves

---

## 🛡️ Safety Features

### API Retry Queue
- Failed stop-loss updates are queued and retried
- Exponential backoff: 1s → 2s → 4s
- Queue persisted to disk for crash recovery
- User notified of failed critical operations

### Reduce-Only Orders
All exit orders use `reduceOnly: true` to prevent accidental position reversal.

### Rate Limit Handling
- 5-second cooldown on rate limit errors
- Automatic retry with backoff

---

## 📁 File Structure

```
kucoin-bot-v35/
├── server.js           # Backend server with V3.5 formulas
├── index.html          # Dashboard frontend
├── package.json        # Dependencies
├── signal-weights.js   # Signal configuration
├── positions.json      # Position persistence
├── retry_queue.json    # Failed operation queue
├── .env                # API credentials (create from .env.example)
└── .env.example        # Template for credentials
```

---

## 📈 Dashboard Features

### Trade Panel
- Position size input (% of balance)
- Leverage mode toggle (AUTO/MANUAL)
- Volatility indicator with ATR%
- Risk multiplier slider (0.5x-2.0x)
- Complete trade info with fee breakdown

### Position Cards
- Gross and Net P&L display
- Status badges (Break-Even, Trailing, Pending, Stop Failed)
- Trailing progress visualization
- Fee breakdown
- Liquidation price warning

### Confirmation Modal
- Complete trade summary
- Fee breakdown section
- Risk:Reward ratio display

---

## 🔧 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | System status with retry queue length |
| `/api/status` | GET | Current trading status |
| `/api/symbols` | GET | Active and available symbols |
| `/api/market/:symbol` | GET | Market data for symbol |
| `/api/positions` | GET | All active positions |
| `/api/config` | GET/POST | View/update trading config |
| `/api/calculate` | POST | Test math calculations |
| `/api/order` | POST | Place new order |
| `/api/close` | POST | Close position |

---

## ⚠️ Risk Disclaimer

This software is for educational purposes. Cryptocurrency trading involves substantial risk of loss. Only trade with funds you can afford to lose. Past performance does not guarantee future results.

---

## 📝 Version History

### v3.5.0 (Current)
- Fee-adjusted break-even calculation
- Accurate liquidation price formula
- Slippage buffer on stop orders
- API retry queue with exponential backoff
- ROI-based SL/TP with inverse leverage scaling
- Volatility-based auto-leverage
- Enhanced trailing stop algorithms (Staircase, ATR, Dynamic)
- Net P&L after fees display
- Partial take-profit support

### v3.4.2
- ROI-based SL/TP calculations
- Trade confirmation modal
- Break-even & trailing stop indicators

### v3.4.1
- Leverage-adjusted SL/TP
- Fixed floating-point precision errors

### v3.4.0
- Dollar-based position sizing
- Leveraged P&L percentages
