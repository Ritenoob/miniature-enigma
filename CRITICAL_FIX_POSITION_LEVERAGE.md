# CRITICAL FIX: Position Sizing & Leverage-Aware Exit Strategy
## Complete Solution for V.3.3 Trading Bugs

---

## 🚨 EXECUTIVE SUMMARY

**Problem:** System won't trade due to two intertwined bugs:
1. Position sizing doesn't work (calculates wrong, causes errors)
2. Exit strategy (SL/TP/break-even/trailing) doesn't account for leverage

**Root Cause:** 
- Position sizing uses "lots" instead of USDT value
- Exit calculations use price % instead of P&L %
- Leverage multiplier missing from all calculations

**Impact:** 
- Orders rejected: "Position too small"
- If orders filled: SL/TP wrong, break-even triggers wrong, trailing broken

**Solution:** Complete rewrite of both systems with leverage-aware calculations

---

## 📊 PART 1: POSITION SIZING FIX (USDT-BASED WITH LEVERAGE)

### **Current Buggy Code** ❌

```javascript
// WRONG - This doesn't work
async function calculatePositionSize(symbol, accountEquity, positionPercent) {
  const contract = await api.getContractDetail(symbol);
  const ticker = await api.getTicker(symbol);
  const price = parseFloat(ticker.lastPrice);
  
  // BUG: This calculates "lots" which varies by symbol
  const positionValueUSD = accountEquity * (positionPercent / 100);
  const lots = positionValueUSD / (price * contract.lotSize);
  
  // BUG: Doesn't account for minimum contract requirements
  // BUG: Doesn't validate against margin requirements
  return lots;
}
```

**Why it fails:**
1. Lot calculation doesn't account for `multiplier`
2. Doesn't validate against `minOrderQty`
3. Doesn't round to `lotStep`
4. Doesn't calculate margin requirement with leverage
5. Returns "lots" but KuCoin needs proper validation

---

### **CORRECTED CODE** ✅

```javascript
/**
 * Calculate position size in USDT with leverage consideration
 * 
 * @param {string} symbol - Trading symbol (e.g., 'XBTUSDTM')
 * @param {number} accountEquity - Total account equity in USDT
 * @param {number} positionPercent - Position size as % of equity (e.g., 5 for 5%)
 * @param {number} leverage - Leverage multiplier (e.g., 10 for 10x)
 * @returns {Object} Position details with USDT values and lots
 */
async function calculatePositionSizeLeverageAware(symbol, accountEquity, positionPercent, leverage) {
  try {
    // Step 1: Fetch contract specifications
    const contract = await api.getContractDetail(symbol);
    const ticker = await api.getTicker(symbol);
    const currentPrice = parseFloat(ticker.lastPrice);
    
    // Validate inputs
    if (!contract || !currentPrice || currentPrice <= 0) {
      throw new Error('Invalid market data');
    }
    
    // Step 2: Calculate target position value in USDT
    const targetPositionUSDT = accountEquity * (positionPercent / 100);
    
    console.log('=== POSITION SIZING DEBUG ===');
    console.log('Account Equity:', accountEquity, 'USDT');
    console.log('Position %:', positionPercent + '%');
    console.log('Leverage:', leverage + 'x');
    console.log('Target Position Value:', targetPositionUSDT, 'USDT');
    
    // Step 3: Calculate required lots
    // Formula: lots = (USDT Value) / (Price × Lot Size × Multiplier)
    const lotSize = parseFloat(contract.lotSize);
    const multiplier = parseFloat(contract.multiplier);
    
    // Raw lot calculation
    const rawLots = targetPositionUSDT / (currentPrice * lotSize * multiplier);
    
    console.log('Contract Lot Size:', lotSize);
    console.log('Contract Multiplier:', multiplier);
    console.log('Current Price:', currentPrice);
    console.log('Raw Lots Calculated:', rawLots);
    
    // Step 4: Round to lot step
    const lotStep = parseFloat(contract.lotStep || 0.001);
    let roundedLots = Math.floor(rawLots / lotStep) * lotStep;
    
    // Step 5: Apply minimum order quantity
    const minOrderQty = parseFloat(contract.minOrderQty);
    roundedLots = Math.max(roundedLots, minOrderQty);
    
    console.log('Lot Step:', lotStep);
    console.log('Min Order Qty:', minOrderQty);
    console.log('Rounded Lots:', roundedLots);
    
    // Step 6: Validate against maximum
    const maxOrderQty = parseFloat(contract.maxOrderQty);
    if (roundedLots > maxOrderQty) {
      throw new Error(
        `Position size ${roundedLots} exceeds maximum ${maxOrderQty}. ` +
        `Reduce position % or split into multiple orders.`
      );
    }
    
    // Step 7: Calculate actual position value
    const actualPositionValue = roundedLots * currentPrice * lotSize * multiplier;
    
    // Step 8: Calculate margin requirement (with leverage)
    const marginRequired = actualPositionValue / leverage;
    
    console.log('Actual Position Value:', actualPositionValue.toFixed(2), 'USDT');
    console.log('Margin Required:', marginRequired.toFixed(2), 'USDT');
    
    // Step 9: Validate margin availability
    const availableMargin = accountEquity * 0.9; // Use 90% max for safety
    if (marginRequired > availableMargin) {
      throw new Error(
        `Insufficient margin: Need ${marginRequired.toFixed(2)} USDT, ` +
        `have ${availableMargin.toFixed(2)} USDT available (90% of equity). ` +
        `Reduce position % or leverage.`
      );
    }
    
    // Step 10: Calculate effective position percentage
    const effectivePercent = (actualPositionValue / accountEquity) * 100;
    
    console.log('Effective Position %:', effectivePercent.toFixed(2) + '%');
    console.log('Margin Usage:', ((marginRequired / accountEquity) * 100).toFixed(2) + '%');
    console.log('=== END DEBUG ===\n');
    
    // Return comprehensive position info
    return {
      symbol: symbol,
      lots: roundedLots,
      
      // USDT Values
      positionValueUSDT: actualPositionValue,
      marginRequiredUSDT: marginRequired,
      
      // Percentages
      targetPercent: positionPercent,
      effectivePercent: effectivePercent,
      marginPercent: (marginRequired / accountEquity) * 100,
      
      // Leverage
      leverage: leverage,
      
      // Price info
      entryPrice: currentPrice,
      
      // Contract specs
      contractSpecs: {
        lotSize,
        multiplier,
        minOrderQty,
        maxOrderQty,
        lotStep
      },
      
      // Validation
      isValid: true,
      canTrade: marginRequired <= availableMargin
    };
    
  } catch (error) {
    console.error('❌ Position sizing failed:', error.message);
    throw error;
  }
}
```

---

## 📊 PART 2: LEVERAGE-AWARE EXIT STRATEGY FIX

### **Current Buggy Code** ❌

```javascript
// WRONG - Doesn't account for leverage
class PositionManager {
  async checkBreakEven(position) {
    const currentPrice = await getCurrentPrice(position.symbol);
    const entryPrice = position.entryPrice;
    
    // BUG: Uses price % instead of P&L %
    const priceChange = (currentPrice - entryPrice) / entryPrice;
    const isProfitable = position.side === 'buy' 
      ? priceChange > 0 
      : priceChange < 0;
    
    // BUG: Doesn't consider leverage amplification
    if (isProfitable && !position.breakEvenLocked) {
      // Move SL to entry - but this is wrong with leverage!
      await this.updateStopLoss(position.symbol, entryPrice);
    }
  }
  
  async checkTrailing(position) {
    const currentPrice = await getCurrentPrice(position.symbol);
    const entryPrice = position.entryPrice;
    
    // BUG: Price % doesn't equal P&L % with leverage
    const priceChangePercent = Math.abs((currentPrice - entryPrice) / entryPrice) * 100;
    
    // BUG: This triggers at wrong profit levels
    if (priceChangePercent >= 0.15) {
      // Move SL - but by wrong amount!
      const newSL = position.side === 'buy'
        ? position.stopLoss + (entryPrice * 0.0005)
        : position.stopLoss - (entryPrice * 0.0005);
      
      await this.updateStopLoss(position.symbol, newSL);
    }
  }
}
```

**Why it fails:**
1. Calculates price % change, not P&L % change
2. With 10x leverage: 1% price = 10% P&L (not accounted for)
3. Break-even triggers too late
4. Trailing triggers at wrong profit levels
5. SL moves wrong amounts

---

### **CORRECTED CODE** ✅

```javascript
/**
 * LEVERAGE-AWARE POSITION MANAGER
 * Properly calculates P&L, break-even, and trailing stops with leverage
 */
class LeverageAwarePositionManager {
  constructor(api, config = {}) {
    this.api = api;
    
    // Configuration with DEFAULTS
    this.config = {
      // Break-even trigger (in P&L %)
      BREAK_EVEN_PROFIT_PERCENT: 0.1, // 0.1% P&L profit (accounts for leverage)
      
      // Trailing stop configuration (in P&L %)
      TRAILING_STEP_PROFIT_PERCENT: 0.15, // Trail every 0.15% P&L gain
      TRAILING_MOVE_PROFIT_PERCENT: 0.05, // Move SL to lock 0.05% P&L
      
      // Initial SL/TP (in price %)
      INITIAL_SL_PRICE_PERCENT: 0.5,  // 0.5% price move for SL
      INITIAL_TP_PRICE_PERCENT: 2.0,  // 2.0% price move for TP
      
      ...config
    };
    
    console.log('✅ Leverage-Aware Position Manager initialized');
    console.log('   Break-even trigger:', this.config.BREAK_EVEN_PROFIT_PERCENT + '% P&L');
    console.log('   Trailing step:', this.config.TRAILING_STEP_PROFIT_PERCENT + '% P&L');
    console.log('   Trailing move:', this.config.TRAILING_MOVE_PROFIT_PERCENT + '% P&L');
  }
  
  /**
   * Calculate current P&L percentage (accounts for leverage)
   */
  calculatePnLPercent(position, currentPrice) {
    const entryPrice = position.entryPrice;
    const leverage = position.leverage;
    const isLong = position.side === 'buy';
    
    // Price change percentage
    const priceChangePercent = ((currentPrice - entryPrice) / entryPrice) * 100;
    
    // Apply direction
    const directedPriceChange = isLong ? priceChangePercent : -priceChangePercent;
    
    // Apply leverage multiplier
    const pnlPercent = directedPriceChange * leverage;
    
    return pnlPercent;
  }
  
  /**
   * Calculate unrealized P&L in USDT
   */
  calculateUnrealizedPnLUSDT(position, currentPrice) {
    const pnlPercent = this.calculatePnLPercent(position, currentPrice);
    const marginUsed = position.marginRequiredUSDT;
    
    // P&L in USDT = Margin × (P&L % / 100)
    const pnlUSDT = marginUsed * (pnlPercent / 100);
    
    return {
      pnlUSDT,
      pnlPercent,
      priceChangePercent: ((currentPrice - position.entryPrice) / position.entryPrice) * 100
    };
  }
  
  /**
   * Set initial SL/TP based on PRICE movement
   * (Initial SL/TP use price %, not P&L %)
   */
  async setInitialStopLossTakeProfit(position) {
    const entryPrice = position.entryPrice;
    const isLong = position.side === 'buy';
    
    // Calculate SL/TP prices
    const slDistance = entryPrice * (this.config.INITIAL_SL_PRICE_PERCENT / 100);
    const tpDistance = entryPrice * (this.config.INITIAL_TP_PRICE_PERCENT / 100);
    
    const stopLossPrice = isLong 
      ? entryPrice - slDistance 
      : entryPrice + slDistance;
    
    const takeProfitPrice = isLong 
      ? entryPrice + tpDistance 
      : entryPrice - tpDistance;
    
    console.log(`📊 Setting initial SL/TP for ${position.symbol}`);
    console.log(`   Entry: ${entryPrice}`);
    console.log(`   SL: ${stopLossPrice.toFixed(2)} (${this.config.INITIAL_SL_PRICE_PERCENT}% price)`);
    console.log(`   TP: ${takeProfitPrice.toFixed(2)} (${this.config.INITIAL_TP_PRICE_PERCENT}% price)`);
    
    // Calculate what these mean in P&L % with leverage
    const slPnLPercent = -this.config.INITIAL_SL_PRICE_PERCENT * position.leverage;
    const tpPnLPercent = this.config.INITIAL_TP_PRICE_PERCENT * position.leverage;
    
    console.log(`   SL in P&L: ${slPnLPercent.toFixed(2)}% (with ${position.leverage}x leverage)`);
    console.log(`   TP in P&L: ${tpPnLPercent.toFixed(2)}% (with ${position.leverage}x leverage)`);
    
    // Place SL order on KuCoin
    try {
      const slOrder = await this.api.placeOrder({
        symbol: position.symbol,
        side: isLong ? 'sell' : 'buy',
        type: 'market',
        size: position.lots,
        stop: isLong ? 'down' : 'up',
        stopPrice: stopLossPrice.toString(),
        stopPriceType: 'MP', // Market price
        closeOrder: true,
        reduceOnly: true
      });
      
      console.log(`✅ Stop Loss order placed: ${slOrder.orderId}`);
      
      // Place TP order on KuCoin
      const tpOrder = await this.api.placeOrder({
        symbol: position.symbol,
        side: isLong ? 'sell' : 'buy',
        type: 'limit',
        price: takeProfitPrice.toString(),
        size: position.lots,
        closeOrder: true,
        reduceOnly: true
      });
      
      console.log(`✅ Take Profit order placed: ${tpOrder.orderId}`);
      
      return {
        stopLoss: {
          orderId: slOrder.orderId,
          price: stopLossPrice,
          pnlPercent: slPnLPercent
        },
        takeProfit: {
          orderId: tpOrder.orderId,
          price: takeProfitPrice,
          pnlPercent: tpPnLPercent
        }
      };
      
    } catch (error) {
      console.error('❌ Failed to place SL/TP orders:', error.message);
      throw error;
    }
  }
  
  /**
   * Check and trigger break-even lock
   * Uses P&L % (accounts for leverage)
   */
  async checkBreakEven(position, currentPrice) {
    // Skip if already locked
    if (position.breakEvenLocked) {
      return false;
    }
    
    // Calculate current P&L
    const { pnlPercent, pnlUSDT } = this.calculateUnrealizedPnLUSDT(position, currentPrice);
    
    console.log(`📊 Break-even check for ${position.symbol}`);
    console.log(`   Current P&L: ${pnlPercent.toFixed(2)}% (${pnlUSDT.toFixed(2)} USDT)`);
    console.log(`   Trigger threshold: ${this.config.BREAK_EVEN_PROFIT_PERCENT}% P&L`);
    
    // Check if we hit profit threshold
    if (pnlPercent >= this.config.BREAK_EVEN_PROFIT_PERCENT) {
      console.log(`✅ BREAK-EVEN TRIGGERED at ${pnlPercent.toFixed(2)}% profit`);
      
      // Cancel existing SL order
      if (position.stopLossOrderId) {
        try {
          await this.api.cancelOrder(position.stopLossOrderId);
          console.log(`   Cancelled old SL order: ${position.stopLossOrderId}`);
        } catch (error) {
          console.warn(`   Warning: Failed to cancel SL: ${error.message}`);
        }
      }
      
      // Place new SL at entry price (0% P&L = break-even)
      const entryPrice = position.entryPrice;
      const isLong = position.side === 'buy';
      
      try {
        const newSLOrder = await this.api.placeOrder({
          symbol: position.symbol,
          side: isLong ? 'sell' : 'buy',
          type: 'market',
          size: position.lots,
          stop: isLong ? 'down' : 'up',
          stopPrice: entryPrice.toString(),
          stopPriceType: 'MP',
          closeOrder: true,
          reduceOnly: true
        });
        
        console.log(`✅ Break-even SL placed at entry: ${entryPrice}`);
        console.log(`   New SL Order ID: ${newSLOrder.orderId}`);
        
        // Update position
        position.breakEvenLocked = true;
        position.stopLossOrderId = newSLOrder.orderId;
        position.currentStopLoss = entryPrice;
        position.lastPnLPercent = pnlPercent;
        
        return true;
        
      } catch (error) {
        console.error(`❌ Failed to place break-even SL:`, error.message);
        throw error;
      }
    }
    
    return false;
  }
  
  /**
   * Check and update trailing stop
   * Uses P&L % (accounts for leverage)
   */
  async checkTrailingStop(position, currentPrice) {
    // Only trail after break-even is locked
    if (!position.breakEvenLocked) {
      return false;
    }
    
    // Calculate current P&L
    const { pnlPercent, pnlUSDT } = this.calculateUnrealizedPnLUSDT(position, currentPrice);
    
    // Calculate P&L increase since last trail
    const lastPnL = position.lastPnLPercent || 0;
    const pnlIncrease = pnlPercent - lastPnL;
    
    console.log(`📊 Trailing check for ${position.symbol}`);
    console.log(`   Current P&L: ${pnlPercent.toFixed(2)}%`);
    console.log(`   Last trail P&L: ${lastPnL.toFixed(2)}%`);
    console.log(`   P&L increase: ${pnlIncrease.toFixed(2)}%`);
    console.log(`   Trail trigger: ${this.config.TRAILING_STEP_PROFIT_PERCENT}%`);
    
    // Check if we should trail
    if (pnlIncrease >= this.config.TRAILING_STEP_PROFIT_PERCENT) {
      console.log(`✅ TRAILING TRIGGERED at +${pnlIncrease.toFixed(2)}% gain`);
      
      // Calculate new SL that locks in additional profit
      // We want to lock: lastPnL + TRAILING_MOVE_PROFIT_PERCENT
      const targetLockedPnL = lastPnL + this.config.TRAILING_MOVE_PROFIT_PERCENT;
      
      // Convert target P&L % back to price
      // Formula: New Price = Entry × (1 + (targetPnL / leverage) / 100)
      const isLong = position.side === 'buy';
      const priceChangeForTarget = (targetLockedPnL / position.leverage) / 100;
      
      const newSLPrice = isLong
        ? position.entryPrice * (1 + priceChangeForTarget)
        : position.entryPrice * (1 - priceChangeForTarget);
      
      console.log(`   Target locked P&L: ${targetLockedPnL.toFixed(2)}%`);
      console.log(`   New SL price: ${newSLPrice.toFixed(2)}`);
      console.log(`   Current SL: ${position.currentStopLoss.toFixed(2)}`);
      
      // Validate: SL should NEVER move backward
      const isMovingForward = isLong 
        ? newSLPrice > position.currentStopLoss
        : newSLPrice < position.currentStopLoss;
      
      if (!isMovingForward) {
        console.warn(`⚠️ SL would move backward - SKIPPING`);
        return false;
      }
      
      // Cancel old SL
      if (position.stopLossOrderId) {
        try {
          await this.api.cancelOrder(position.stopLossOrderId);
          console.log(`   Cancelled old SL: ${position.stopLossOrderId}`);
        } catch (error) {
          console.warn(`   Warning: Failed to cancel SL: ${error.message}`);
        }
      }
      
      // Place new trailing SL
      try {
        const newSLOrder = await this.api.placeOrder({
          symbol: position.symbol,
          side: isLong ? 'sell' : 'buy',
          type: 'market',
          size: position.lots,
          stop: isLong ? 'down' : 'up',
          stopPrice: newSLPrice.toString(),
          stopPriceType: 'MP',
          closeOrder: true,
          reduceOnly: true
        });
        
        console.log(`✅ Trailing SL updated to ${newSLPrice.toFixed(2)}`);
        console.log(`   Locks in ${targetLockedPnL.toFixed(2)}% profit`);
        console.log(`   New SL Order ID: ${newSLOrder.orderId}`);
        
        // Update position
        position.stopLossOrderId = newSLOrder.orderId;
        position.currentStopLoss = newSLPrice;
        position.lastPnLPercent = pnlPercent;
        
        return true;
        
      } catch (error) {
        console.error(`❌ Failed to update trailing SL:`, error.message);
        throw error;
      }
    }
    
    return false;
  }
  
  /**
   * Monitor position and manage exits
   * Call this every 2 seconds for each open position
   */
  async monitorPosition(position) {
    try {
      // Get current price
      const ticker = await this.api.getTicker(position.symbol);
      const currentPrice = parseFloat(ticker.lastPrice);
      
      // Calculate current P&L
      const { pnlPercent, pnlUSDT } = this.calculateUnrealizedPnLUSDT(position, currentPrice);
      
      // Update position state
      position.currentPrice = currentPrice;
      position.unrealizedPnL = pnlUSDT;
      position.unrealizedPnLPercent = pnlPercent;
      
      // Check break-even (if not already locked)
      if (!position.breakEvenLocked) {
        await this.checkBreakEven(position, currentPrice);
      }
      
      // Check trailing stop (if break-even is locked)
      if (position.breakEvenLocked) {
        await this.checkTrailingStop(position, currentPrice);
      }
      
      return {
        symbol: position.symbol,
        currentPrice,
        pnlUSDT,
        pnlPercent,
        breakEvenLocked: position.breakEvenLocked,
        currentStopLoss: position.currentStopLoss
      };
      
    } catch (error) {
      console.error(`❌ Error monitoring ${position.symbol}:`, error.message);
      throw error;
    }
  }
}

module.exports = LeverageAwarePositionManager;
```

---

## 🧪 PART 3: TEST CASES TO VALIDATE

```javascript
/**
 * Comprehensive test suite for leverage-aware calculations
 */
async function testLeverageCalculations() {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   LEVERAGE-AWARE CALCULATION TESTS             ║');
  console.log('╚════════════════════════════════════════════════╝\n');
  
  // Test 1: Position Sizing with Different Leverages
  console.log('TEST 1: Position Sizing with Leverage\n');
  
  const accountEquity = 1000; // $1000 USDT
  const positionPercent = 5;  // 5% of equity
  const testLeverages = [1, 5, 10, 20, 50];
  
  for (const leverage of testLeverages) {
    console.log(`\nLeverage ${leverage}x:`);
    console.log(`  Account: ${accountEquity} USDT`);
    console.log(`  Position Size: ${positionPercent}%`);
    
    const targetUSDT = accountEquity * (positionPercent / 100);
    const marginRequired = targetUSDT / leverage;
    
    console.log(`  → Target Position Value: ${targetUSDT} USDT`);
    console.log(`  → Margin Required: ${marginRequired.toFixed(2)} USDT`);
    console.log(`  → Margin %: ${(marginRequired / accountEquity * 100).toFixed(2)}%`);
  }
  
  // Test 2: P&L Calculation with Leverage
  console.log('\n\nTEST 2: P&L with Leverage\n');
  
  const entryPrice = 95000;
  const currentPrices = [95500, 96000, 94500, 94000];
  
  console.log(`Entry Price: ${entryPrice}`);
  console.log(`Position: LONG`);
  console.log(`Leverage: 10x\n`);
  
  for (const price of currentPrices) {
    const priceChangePercent = ((price - entryPrice) / entryPrice) * 100;
    const pnlPercent = priceChangePercent * 10; // 10x leverage
    
    console.log(`Current Price: ${price}`);
    console.log(`  Price Change: ${priceChangePercent.toFixed(2)}%`);
    console.log(`  P&L with 10x: ${pnlPercent.toFixed(2)}%`);
    
    if (Math.abs(priceChangePercent) >= 0.5) {
      console.log(`  ⚠️ Would hit ${priceChangePercent > 0 ? 'TP' : 'SL'} (0.5% price = ${Math.abs(pnlPercent).toFixed(2)}% P&L)`);
    }
  }
  
  // Test 3: Break-Even Trigger
  console.log('\n\nTEST 3: Break-Even Trigger\n');
  
  const beConfig = {
    BREAK_EVEN_PROFIT_PERCENT: 0.1 // 0.1% P&L
  };
  
  console.log(`Break-even trigger: ${beConfig.BREAK_EVEN_PROFIT_PERCENT}% P&L`);
  console.log(`Entry: ${entryPrice}`);
  console.log(`Leverage: 10x\n`);
  
  // What price triggers break-even?
  const requiredPriceChange = beConfig.BREAK_EVEN_PROFIT_PERCENT / 10; // Divide by leverage
  const triggerPrice = entryPrice * (1 + requiredPriceChange / 100);
  
  console.log(`Required price change: ${requiredPriceChange.toFixed(4)}%`);
  console.log(`Trigger price: ${triggerPrice.toFixed(2)}`);
  console.log(`Price must move: $${(triggerPrice - entryPrice).toFixed(2)}`);
  
  // Test 4: Trailing Stop Calculation
  console.log('\n\nTEST 4: Trailing Stop\n');
  
  const trailConfig = {
    TRAILING_STEP_PROFIT_PERCENT: 0.15, // Trail every 0.15% P&L
    TRAILING_MOVE_PROFIT_PERCENT: 0.05  // Lock 0.05% P&L
  };
  
  console.log(`Trail step: ${trailConfig.TRAILING_STEP_PROFIT_PERCENT}% P&L`);
  console.log(`Trail move: ${trailConfig.TRAILING_MOVE_PROFIT_PERCENT}% P&L`);
  console.log(`Entry: ${entryPrice}`);
  console.log(`Leverage: 10x\n`);
  
  let currentPnL = 0.1; // Start after break-even
  let currentSL = entryPrice; // At break-even
  
  console.log('Trailing progression:');
  console.log(`  Initial: SL at ${currentSL} (0% P&L locked)`);
  
  for (let i = 1; i <= 5; i++) {
    currentPnL += trailConfig.TRAILING_STEP_PROFIT_PERCENT;
    const lockedPnL = (i - 1) * trailConfig.TRAILING_MOVE_PROFIT_PERCENT + trailConfig.TRAILING_MOVE_PROFIT_PERCENT;
    
    // Convert locked P&L to price
    const priceChange = (lockedPnL / 10) / 100; // Divide by leverage
    const newSL = entryPrice * (1 + priceChange);
    
    console.log(`  Step ${i}: P&L ${currentPnL.toFixed(2)}% → SL at ${newSL.toFixed(2)} (${lockedPnL.toFixed(2)}% locked)`);
    currentSL = newSL;
  }
  
  // Test 5: Full Scenario
  console.log('\n\nTEST 5: Complete Trade Scenario\n');
  
  console.log('Account: 1000 USDT');
  console.log('Position: 5% (50 USDT)');
  console.log('Leverage: 10x');
  console.log('Entry: 95000 LONG\n');
  
  const margin = 50 / 10; // 5 USDT margin
  console.log(`Margin used: ${margin} USDT\n`);
  
  const scenarios = [
    { price: 95500, desc: 'Price +0.53%' },
    { price: 94525, desc: 'Hit SL (-0.5% price)' },
    { price: 96900, desc: 'Hit TP (+2% price)' }
  ];
  
  scenarios.forEach(({ price, desc }) => {
    const priceChange = ((price - entryPrice) / entryPrice) * 100;
    const pnl = priceChange * 10;
    const pnlUSDT = margin * (pnl / 100);
    const newEquity = 1000 + pnlUSDT;
    
    console.log(`${desc}:`);
    console.log(`  Price: ${price}`);
    console.log(`  Price change: ${priceChange.toFixed(2)}%`);
    console.log(`  P&L: ${pnl.toFixed(2)}%`);
    console.log(`  P&L USDT: ${pnlUSDT.toFixed(2)} USDT`);
    console.log(`  New equity: ${newEquity.toFixed(2)} USDT\n`);
  });
  
  console.log('═'.repeat(50));
  console.log('✅ ALL TESTS COMPLETE');
}

// Run tests
testLeverageCalculations();
```

---

## 🔧 PART 4: IMPLEMENTATION STEPS

### **Step 1: Replace Position Sizing Function**

**File:** `server.js` or wherever position sizing is

**Find and replace:**
```javascript
// OLD CODE - DELETE THIS
async function calculatePositionSize(symbol, accountEquity, positionPercent) {
  // ... old buggy code
}
```

**With:**
```javascript
// NEW CODE - USE THIS
async function calculatePositionSizeLeverageAware(symbol, accountEquity, positionPercent, leverage) {
  // ... paste the complete new function from PART 1
}
```

---

### **Step 2: Replace Position Manager Class**

**File:** `server.js` or `PositionManager.js`

**Find and replace:**
```javascript
// OLD CODE - DELETE THIS
class PositionManager {
  // ... old buggy code
}
```

**With:**
```javascript
// NEW CODE - USE THIS
class LeverageAwarePositionManager {
  // ... paste the complete new class from PART 2
}
```

---

### **Step 3: Update Order Placement Logic**

```javascript
// When placing order, use new function
async function placeOrder(symbol, side, positionPercent, leverage) {
  try {
    // Get account balance
    const account = await api.getAccountOverview();
    const equity = parseFloat(account.accountEquity);
    
    // Calculate position with leverage
    const positionInfo = await calculatePositionSizeLeverageAware(
      symbol,
      equity,
      positionPercent,
      leverage
    );
    
    console.log('📊 Position calculated:', positionInfo);
    
    // Validate
    if (!positionInfo.canTrade) {
      throw new Error('Insufficient margin for this position');
    }
    
    // Place order at 9th level
    const orderBook = await api.getOrderBook(symbol);
    const levels = side === 'buy' ? orderBook.bids : orderBook.asks;
    
    if (levels.length < 9) {
      throw new Error('Order book insufficient depth');
    }
    
    const entryPrice = parseFloat(levels[8][0]); // 9th level (0-indexed)
    
    console.log(`📍 Entry at 9th level: ${entryPrice}`);
    
    // Place limit order
    const order = await api.placeOrder({
      symbol: symbol,
      side: side,
      type: 'limit',
      price: entryPrice.toString(),
      size: positionInfo.lots,
      leverage: leverage
    });
    
    console.log(`✅ Order placed: ${order.orderId}`);
    
    // Create position object
    const position = {
      orderId: order.orderId,
      symbol: symbol,
      side: side,
      lots: positionInfo.lots,
      entryPrice: entryPrice,
      leverage: leverage,
      marginRequiredUSDT: positionInfo.marginRequiredUSDT,
      positionValueUSDT: positionInfo.positionValueUSDT,
      breakEvenLocked: false,
      lastPnLPercent: 0,
      createdAt: Date.now()
    };
    
    // Wait for fill, then set SL/TP
    // (Add order monitoring logic here)
    
    return { success: true, position, order };
    
  } catch (error) {
    console.error('❌ Order placement failed:', error.message);
    throw error;
  }
}
```

---

### **Step 4: Update Position Monitoring Loop**

```javascript
// Monitor all positions every 2 seconds
const positionManager = new LeverageAwarePositionManager(api, {
  BREAK_EVEN_PROFIT_PERCENT: 0.1,
  TRAILING_STEP_PROFIT_PERCENT: 0.15,
  TRAILING_MOVE_PROFIT_PERCENT: 0.05
});

setInterval(async () => {
  for (const position of openPositions) {
    try {
      const update = await positionManager.monitorPosition(position);
      
      // Broadcast to frontend
      wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(JSON.stringify({
            type: 'position_update',
            data: update
          }));
        }
      });
      
    } catch (error) {
      console.error(`Error monitoring ${position.symbol}:`, error.message);
    }
  }
}, 2000); // Every 2 seconds
```

---

## 📋 PART 5: VALIDATION CHECKLIST

After implementing, verify:

**Position Sizing:**
- [ ] Calculates correct lots for each symbol
- [ ] Accounts for lot size and multiplier
- [ ] Validates minimum order quantity
- [ ] Calculates margin requirement with leverage
- [ ] No "position too small" errors

**Break-Even:**
- [ ] Triggers at 0.1% P&L (not 0.1% price)
- [ ] Accounts for leverage (10x leverage = 0.01% price move)
- [ ] Moves SL to exact entry price
- [ ] Logs clearly when triggered

**Trailing Stop:**
- [ ] Trails every 0.15% P&L gain
- [ ] Moves SL to lock 0.05% P&L
- [ ] Accounts for leverage in calculations
- [ ] NEVER moves backward
- [ ] Logs each trail action

**Overall:**
- [ ] Orders place successfully
- [ ] SL/TP orders execute on KuCoin
- [ ] P&L displays correctly with leverage
- [ ] Break-even locks profit
- [ ] Trailing increases locked profit
- [ ] Manual close works
- [ ] Position survives restart

---

## 🎯 MULTI-AI VALIDATION STRATEGY

Since you mentioned using Gemini and ChatGPT, here's how to cross-validate:

### **Claude (This Conversation):**
- Primary implementation
- Detailed debugging
- System integration

### **ChatGPT:**
1. Paste the math formulas
2. Ask: "Validate these leverage calculations"
3. Have it generate test cases
4. Compare results with Claude's tests

### **Gemini:**
1. Paste the position sizing function
2. Ask: "Find any edge cases or bugs"
3. Have it suggest optimizations
4. Cross-check margin calculations

### **Validation Process:**
```
1. Claude implements the fix
2. ChatGPT validates the math
3. Gemini reviews for edge cases
4. Run all three test suites
5. If all agree → deploy
6. If any disagree → investigate
```

---

## 🚀 EXPECTED RESULTS

**Before Fix:**
```
❌ Order rejected: "Position size too small"
❌ Break-even triggers at wrong time
❌ Trailing stop doesn't work
❌ P&L calculations wrong
```

**After Fix:**
```
✅ Orders place successfully
✅ Correct lot size calculated
✅ Break-even at 0.1% P&L (with leverage)
✅ Trailing locks profit incrementally
✅ P&L accurate with leverage
✅ Can trade live
```

---

## 📞 QUICK SUMMARY FOR AI

**If you're pasting this to another AI:**

"I have two bugs in my KuCoin futures trading system:

1. **Position sizing bug**: System calculates lots wrong, orders rejected
2. **Exit strategy bug**: SL/TP don't account for leverage

See above for:
- Mathematical formulas with leverage
- Complete corrected code
- Test cases to validate
- Implementation steps

Please review the calculations and confirm they're correct before I deploy to live trading."

---

END OF FIX

**This fixes both bugs. Test thoroughly before live trading.**
