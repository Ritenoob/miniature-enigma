# Prompt: Stop Order State Machine Integration

## Objective
Document how LiveOptimizer integrates with existing StopReplaceCoordinator for safe order management in paper and live modes.

## System Context
- **Base**: MIRKO V3.6.1+ KuCoin Futures Bot with StopReplaceCoordinator (PR #6)
- **Language**: Node.js ES6+
- **Purpose**: Ensure optimizer variants use safe stop order management

## Requirements

### 1. Import StopReplaceCoordinator

```javascript
// In StrategyVariant or LiveOptimizerController
const StopReplaceCoordinator = require('../lib/StopReplaceCoordinator');

class StrategyVariant {
  constructor(config, globalConfig) {
    // Existing initialization...
    
    // Initialize stop coordinator for this variant
    if (!globalConfig.paperTrading) {
      this.stopCoordinator = new StopReplaceCoordinator({
        maxRetries: 5,
        baseDelay: 1000,
        maxDelay: 30000,
        jitterFactor: 0.2
      });
    }
  }
}
```

### 2. Safe Stop Order Updates

```javascript
class StrategyVariant {
  async updateStopOrder(newStopPrice) {
    // Paper trading mode - simulate
    if (this.globalConfig.paperTrading) {
      this.position.stopPrice = newStopPrice;
      return {success: true, simulated: true};
    }
    
    // Real mode - use StopReplaceCoordinator
    try {
      const result = await this.stopCoordinator.replaceStop({
        symbol: this.position.symbol,
        oldStopId: this.position.stopOrderId,
        newStopPrice,
        size: this.position.size,
        side: this.position.side
      });
      
      if (result.success) {
        this.position.stopOrderId = result.newStopId;
        this.position.stopPrice = newStopPrice;
      } else if (result.emergencyClose) {
        // Emergency market order executed
        await this.handleEmergencyClose(result);
      }
      
      return result;
    } catch (err) {
      console.error(`Variant ${this.id} stop update failed:`, err);
      
      // Emergency fallback
      await this.emergencyClosePosition();
      
      throw err;
    }
  }

  async emergencyClosePosition() {
    console.warn(`Variant ${this.id} executing emergency close`);
    
    // Execute market order to close
    const result = await this.kuCoinClient.placeOrder({
      symbol: this.position.symbol,
      side: this.position.side === 'long' ? 'sell' : 'buy',
      type: 'market',
      size: this.position.size,
      reduceOnly: true
    });
    
    // Log emergency close
    this.trades.push({
      entryPrice: this.position.entryPrice,
      exitPrice: result.price,
      roi: this.calculateROI(result.price),
      reason: 'emergency_close',
      timestamp: Date.now()
    });
    
    this.position = null;
    this.emit('emergencyClose', {variantId: this.id});
  }

  async handleEmergencyClose(result) {
    // StopReplaceCoordinator executed emergency close
    this.trades.push({
      entryPrice: this.position.entryPrice,
      exitPrice: result.closePrice,
      roi: this.calculateROI(result.closePrice),
      reason: 'emergency_close_coordinator',
      timestamp: Date.now()
    });
    
    this.position = null;
  }
}
```

### 3. State Machine Integration

```javascript
class StrategyVariant {
  async openPosition(marketData, signal) {
    const side = signal > 0 ? 'long' : 'short';
    const size = this.calculatePositionSize();
    
    // Calculate initial stop price
    const stopPrice = this.calculateStopPrice(marketData.price, side);
    
    if (this.globalConfig.paperTrading) {
      // Paper trading - simulate
      this.position = {
        side,
        entryPrice: marketData.price,
        stopPrice,
        size,
        leverage: 10,
        entryTime: Date.now(),
        simulated: true
      };
    } else {
      // Real trading - use state machine
      try {
        // Place entry order
        const entryResult = await this.kuCoinClient.placeOrder({
          symbol: this.config.symbol,
          side: side === 'long' ? 'buy' : 'sell',
          type: 'market',
          size,
          leverage: 10
        });
        
        // Place stop order immediately
        const stopResult = await this.kuCoinClient.placeOrder({
          symbol: this.config.symbol,
          side: side === 'long' ? 'sell' : 'buy',
          type: 'stop',
          stopPrice,
          size,
          reduceOnly: true
        });
        
        this.position = {
          side,
          entryPrice: entryResult.price,
          stopPrice,
          stopOrderId: stopResult.orderId,
          size,
          leverage: 10,
          entryTime: Date.now()
        };
        
        // Initialize stop coordinator state
        this.stopCoordinator.setState('CONFIRMED');
      } catch (err) {
        console.error(`Variant ${this.id} entry failed:`, err);
        throw err;
      }
    }
  }

  calculateStopPrice(entryPrice, side) {
    const stopROI = this.config.riskParams.stopLossROI;
    const leverage = 10;
    
    // Convert ROI to price
    const priceMove = (stopROI / leverage) * entryPrice;
    
    if (side === 'long') {
      return entryPrice + priceMove; // priceMove is negative
    } else {
      return entryPrice - priceMove;
    }
  }
}
```

### 4. Trailing Stop Implementation

```javascript
class StrategyVariant {
  async checkTrailingStop(marketData) {
    if (!this.position) return;
    
    const currentROI = this.calculateROI(marketData.price);
    const activationThreshold = this.config.riskParams.trailingStopActivation;
    
    if (currentROI >= activationThreshold) {
      const newStopPrice = this.calculateTrailingStopPrice(
        marketData.price,
        this.position.side
      );
      
      // Only update if new stop is better
      const shouldUpdate = this.position.side === 'long'
        ? newStopPrice > this.position.stopPrice
        : newStopPrice < this.position.stopPrice;
      
      if (shouldUpdate) {
        await this.updateStopOrder(newStopPrice);
      }
    }
  }

  calculateTrailingStopPrice(currentPrice, side) {
    // Trail by 50% of profit
    const entryPrice = this.position.entryPrice;
    const profit = side === 'long' 
      ? currentPrice - entryPrice
      : entryPrice - currentPrice;
    
    const trailDistance = profit * 0.5;
    
    return side === 'long'
      ? currentPrice - trailDistance
      : currentPrice + trailDistance;
  }
}
```

### 5. Monotonic Stop Invariant

Ensure stops only move in favorable direction:

```javascript
class StrategyVariant {
  async updateStopOrder(newStopPrice) {
    // Validate monotonic invariant
    const isLong = this.position.side === 'long';
    const currentStop = this.position.stopPrice;
    
    if (isLong && newStopPrice < currentStop) {
      console.warn(`Variant ${this.id}: Rejecting stop update (violates monotonic invariant)`);
      return {success: false, reason: 'monotonic_violation'};
    }
    
    if (!isLong && newStopPrice > currentStop) {
      console.warn(`Variant ${this.id}: Rejecting stop update (violates monotonic invariant)`);
      return {success: false, reason: 'monotonic_violation'};
    }
    
    // Proceed with update
    return await this.updateStopOrderInternal(newStopPrice);
  }
}
```

## Testing Requirements
- Test paper trading stop updates (simulated)
- Test real mode with StopReplaceCoordinator
- Test emergency close fallback
- Test trailing stop activation
- Test monotonic invariant enforcement
- Test state machine transitions

## Integration Points
- Import and use StopReplaceCoordinator from PR #6
- Implement emergency close handlers
- Log all stop order updates for audit
- Emit events for monitoring

## Safety Notes
⚠️ **CRITICAL**: Always use StopReplaceCoordinator in real mode  
⚠️ Never update stops without monotonic check  
⚠️ Always use reduceOnly flag on exit orders  
⚠️ Implement emergency market close as last resort  
⚠️ Test thoroughly in paper mode before real trading
