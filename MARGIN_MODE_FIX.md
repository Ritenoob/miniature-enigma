# 🔧 MARGIN MODE FIX

## The Problem:
Your KuCoin account margin mode doesn't match the order. Error:
```
"The order's margin mode does not match the selected one"
```

## Solution 1: Quick Fix (Recommended)

**Set your KuCoin account to CROSS margin:**

1. Login to https://www.kucoin.com/futures
2. Click any symbol (e.g., BTCUSDTM)
3. Find "Margin Mode" dropdown (usually top-right)
4. Select **"Cross"**
5. Confirm

**Then restart the bot and trade again!**

---

## Solution 2: Code Fix (If you want isolated margin)

**Edit server.js line 792-799:**

### FIND THIS (around line 792):
```javascript
const order = await api.placeOrder({
  symbol,
  side,
  type: 'limit',
  price: entryPrice.toString(),
  size: positionInfo.lots,
  leverage: positionInfo.leverage
});
```

### REPLACE WITH:
```javascript
const order = await api.placeOrder({
  symbol,
  side,
  type: 'limit',
  price: entryPrice.toString(),
  size: positionInfo.lots,
  leverage: positionInfo.leverage,
  marginMode: 'CROSS'  // ← ADD THIS LINE
});
```

**Save and restart:**
```bash
# Stop server: Ctrl+C
npm start
```

---

## Understanding Margin Modes:

### **CROSS (Recommended for this bot):**
- Uses entire account balance as collateral
- Positions share margin
- Less likely to get liquidated
- **Better for multiple positions**

### **ISOLATED:**
- Each position has separate margin
- Other positions unaffected if one liquidates
- More risk control per position
- **Better for single high-risk trades**

---

## Which Should You Use?

**For this trading system: Use CROSS**

Why?
- System manages up to 5 positions
- Break-even lock protects you
- Trailing stop locks profit
- Cross margin prevents one position from killing others

---

## After Fixing:

You should see:
```
✅ Order placed successfully
✅ Position opened: BNBUSDTM SHORT
✅ Initial SL/TP set
✅ Monitoring for break-even...
```

Instead of:
```
❌ The order's margin mode does not match
```

---

## Your Current Stats (from the log):

✅ **System is working!**
- Connected to KuCoin API
- Loaded 5 symbols
- Position sizing calculating correctly
- Attempting real trades

❌ **Just needs margin mode fix**

---

**Try Solution 1 first (set KuCoin to Cross mode) - takes 30 seconds!** 🚀
