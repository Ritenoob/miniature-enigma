/**
 * Position Simulator
 * 
 * Simulates position lifecycle with leverage-aware ROI SL/TP
 * Implements stop tightening, break-even, trailing stops, and all risk features
 */

import { Position, Trade, PositionSide, Candle } from '../lib/types';
import { DecimalMath } from '../lib/math';
import FillSimulator, { FillResult } from './fill-model';

export interface PositionConfig {
  // Entry
  entryPrice: number;
  entryTime: number;
  side: PositionSide;
  size: number;
  leverage: number;
  marginUsed: number;
  
  // Risk management
  stopLossROI: number;
  takeProfitROI: number;
  
  // Trailing stop config
  trailingStepPercent: number;
  trailingMovePercent: number;
  breakEvenBufferROI: number;
  
  // Fees
  entryFee: number;
  takerFee: number;
  slippagePercent: number;
}

export class PositionSimulator {
  private position: Position;
  private config: PositionConfig;
  private fillSimulator: FillSimulator;
  private lastTrailedROI: number = 0;
  
  constructor(config: PositionConfig, fillSimulator: FillSimulator) {
    this.config = config;
    this.fillSimulator = fillSimulator;
    
    const positionValue = DecimalMath.calculatePositionValue(config.marginUsed, config.leverage);
    
    // Calculate initial stop loss and take profit prices
    const stopLoss = DecimalMath.calculateStopLossPrice(
      config.side,
      config.entryPrice,
      config.stopLossROI,
      config.leverage
    );
    
    const takeProfit = DecimalMath.calculateTakeProfitPrice(
      config.side,
      config.entryPrice,
      config.takeProfitROI,
      config.leverage
    );
    
    this.position = {
      id: `${config.side}_${config.entryTime}_${Math.random().toString(36).substr(2, 9)}`,
      symbol: 'SIM', // Will be set by engine
      side: config.side,
      entryPrice: config.entryPrice,
      entryTime: config.entryTime,
      size: config.size,
      leverage: config.leverage,
      marginUsed: config.marginUsed,
      stopLoss,
      takeProfit,
      fees: config.entryFee,
      slippage: 0,
      maxDrawdown: 0,
      maxRunup: 0
    };
  }
  
  /**
   * Update position with new candle data
   * Returns Trade if position was closed
   */
  update(candle: Candle): Trade | null {
    const { high, low, close, timestamp } = candle;
    
    // Calculate current P&L
    const priceDiff = DecimalMath.calculatePriceDiff(
      this.position.side,
      this.position.entryPrice,
      close
    );
    
    const positionValue = DecimalMath.calculatePositionValue(
      this.position.marginUsed,
      this.position.leverage
    );
    
    const unrealizedPnl = DecimalMath.calculateUnrealizedPnl(priceDiff, this.position.size, 1);
    const leveragedPnlPercent = DecimalMath.calculateLeveragedPnlPercent(
      unrealizedPnl,
      this.position.marginUsed
    );
    
    // Update max drawdown and runup
    this.position.maxDrawdown = Math.min(this.position.maxDrawdown || 0, leveragedPnlPercent);
    this.position.maxRunup = Math.max(this.position.maxRunup || 0, leveragedPnlPercent);
    
    // Check for stop loss
    const stopHit = this.fillSimulator.simulateStopLoss(
      this.position.side,
      this.position.stopLoss,
      high,
      low,
      close,
      timestamp,
      positionValue,
      this.config.slippagePercent
    );
    
    if (stopHit && stopHit.filled) {
      return this.closePosition(stopHit, timestamp, 'stop_loss');
    }
    
    // Check for take profit
    const tpHit = this.fillSimulator.simulateTakeProfit(
      this.position.side,
      this.position.takeProfit,
      high,
      low,
      timestamp,
      positionValue,
      this.config.slippagePercent
    );
    
    if (tpHit && tpHit.filled) {
      return this.closePosition(tpHit, timestamp, 'take_profit');
    }
    
    // Update trailing stop and break-even
    this.updateTrailingStop(leveragedPnlPercent);
    this.updateBreakEven(leveragedPnlPercent);
    
    return null; // Position still open
  }
  
  /**
   * Update trailing stop (staircase algorithm)
   */
  private updateTrailingStop(currentROI: number): void {
    if (currentROI <= 0) return; // Only trail in profit
    
    // Calculate trailing steps
    const steps = DecimalMath.calculateTrailingSteps(
      currentROI,
      this.lastTrailedROI,
      this.config.trailingStepPercent
    );
    
    if (steps <= 0) return; // No trailing needed
    
    // Calculate new stop loss
    const newStopLoss = DecimalMath.calculateTrailedStopLoss(
      this.position.side,
      this.position.stopLoss,
      steps,
      this.config.trailingMovePercent
    );
    
    // Only update if new stop is better (tighter = less loss)
    const shouldUpdate = this.position.side === 'long'
      ? newStopLoss > this.position.stopLoss
      : newStopLoss < this.position.stopLoss;
    
    if (shouldUpdate) {
      this.position.stopLoss = newStopLoss;
      this.lastTrailedROI = currentROI;
    }
  }
  
  /**
   * Update to break-even when profitable
   */
  private updateBreakEven(currentROI: number): void {
    // Calculate fee-adjusted break-even threshold
    const breakEvenROI = DecimalMath.calculateFeeAdjustedBreakEven(
      this.config.takerFee,
      this.config.takerFee,
      this.position.leverage,
      this.config.breakEvenBufferROI
    );
    
    // Move to break-even if we're past the threshold
    if (currentROI >= breakEvenROI) {
      const breakEvenPrice = this.position.entryPrice;
      
      // Only update if break-even is better than current stop
      const shouldUpdate = this.position.side === 'long'
        ? breakEvenPrice > this.position.stopLoss
        : breakEvenPrice < this.position.stopLoss;
      
      if (shouldUpdate) {
        this.position.stopLoss = breakEvenPrice;
      }
    }
  }
  
  /**
   * Close position and return trade
   */
  private closePosition(exitFill: FillResult, timestamp: number, reason: string): Trade {
    const priceDiff = DecimalMath.calculatePriceDiff(
      this.position.side,
      this.position.entryPrice,
      exitFill.fillPrice
    );
    
    const unrealizedPnl = DecimalMath.calculateUnrealizedPnl(priceDiff, this.position.size, 1);
    const leveragedPnlPercent = DecimalMath.calculateLeveragedPnlPercent(
      unrealizedPnl,
      this.position.marginUsed
    );
    
    // Add exit fees and slippage
    const totalFees = this.position.fees + exitFill.fee;
    const totalSlippage = this.position.slippage + exitFill.slippage;
    
    const trade: Trade = {
      ...this.position,
      exitPrice: exitFill.fillPrice,
      exitTime: timestamp,
      realizedPnl: unrealizedPnl,
      realizedPnlPercent: leveragedPnlPercent,
      exitReason: reason,
      fees: totalFees,
      slippage: totalSlippage
    };
    
    return trade;
  }
  
  /**
   * Force close position at market price
   */
  forceClose(currentPrice: number, timestamp: number, reason: string = 'forced'): Trade {
    const positionValue = DecimalMath.calculatePositionValue(
      this.position.marginUsed,
      this.position.leverage
    );
    
    const exitFill = this.fillSimulator.simulateExit(
      this.position.side,
      currentPrice,
      positionValue,
      timestamp,
      this.config.slippagePercent
    );
    
    return this.closePosition(exitFill, timestamp, reason);
  }
  
  /**
   * Get current position
   */
  getPosition(): Position {
    return { ...this.position };
  }
  
  /**
   * Get current unrealized P&L
   */
  getUnrealizedPnL(currentPrice: number): number {
    const priceDiff = DecimalMath.calculatePriceDiff(
      this.position.side,
      this.position.entryPrice,
      currentPrice
    );
    
    return DecimalMath.calculateUnrealizedPnl(priceDiff, this.position.size, 1);
  }
}

export default PositionSimulator;
