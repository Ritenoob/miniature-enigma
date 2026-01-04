/**
 * Fill Models for Backtesting
 * 
 * Simulates order fills with different execution assumptions:
 * - Taker: Immediate market order execution
 * - Probabilistic Limit: Simulates limit order with 9th-level depth proxy
 */

import { FillModel, PositionSide } from '../lib/types';
import { SeededRandom } from '../lib/math';

export interface FillResult {
  filled: boolean;
  fillPrice: number;
  fillTime: number;
  fee: number;
  slippage: number;
}

export class FillSimulator {
  private rng: SeededRandom;
  private fillModel: FillModel;
  private makerFee: number;
  private takerFee: number;
  
  constructor(
    fillModel: FillModel,
    makerFee: number,
    takerFee: number,
    seed: number = Date.now()
  ) {
    this.fillModel = fillModel;
    this.makerFee = makerFee;
    this.takerFee = takerFee;
    this.rng = new SeededRandom(seed);
  }
  
  /**
   * Simulate entry order fill
   */
  simulateEntry(
    side: PositionSide,
    signalPrice: number,
    high: number,
    low: number,
    timestamp: number,
    positionValue: number,
    slippagePercent: number = 0
  ): FillResult {
    if (this.fillModel === 'taker') {
      return this.simulateTakerEntry(side, signalPrice, positionValue, timestamp, slippagePercent);
    } else {
      return this.simulateLimitEntry(side, signalPrice, high, low, timestamp, positionValue, slippagePercent);
    }
  }
  
  /**
   * Simulate exit order fill (always taker - market order)
   */
  simulateExit(
    side: PositionSide,
    exitPrice: number,
    positionValue: number,
    timestamp: number,
    slippagePercent: number = 0
  ): FillResult {
    // Exits are always market orders (taker)
    const slippageFactor = slippagePercent / 100;
    const slippage = side === 'long' 
      ? -exitPrice * slippageFactor  // Long exit slips down
      : exitPrice * slippageFactor;   // Short exit slips up
    
    const fillPrice = exitPrice + slippage;
    const fee = positionValue * this.takerFee;
    
    return {
      filled: true,
      fillPrice,
      fillTime: timestamp,
      fee,
      slippage: Math.abs(slippage * positionValue / exitPrice)
    };
  }
  
  /**
   * Taker fill - immediate execution with slippage
   */
  private simulateTakerEntry(
    side: PositionSide,
    price: number,
    positionValue: number,
    timestamp: number,
    slippagePercent: number
  ): FillResult {
    const slippageFactor = slippagePercent / 100;
    
    // Apply slippage
    const slippage = side === 'long'
      ? price * slippageFactor    // Long entry slips up
      : -price * slippageFactor;  // Short entry slips down
    
    const fillPrice = price + slippage;
    const fee = positionValue * this.takerFee;
    
    return {
      filled: true,
      fillPrice,
      fillTime: timestamp,
      fee,
      slippage: Math.abs(slippage * positionValue / price)
    };
  }
  
  /**
   * Limit order fill - probabilistic based on price touching level
   * 
   * Simulates placing a limit order and checking if it would get filled
   * based on price action within the bar
   */
  private simulateLimitEntry(
    side: PositionSide,
    limitPrice: number,
    high: number,
    low: number,
    timestamp: number,
    positionValue: number,
    slippagePercent: number
  ): FillResult {
    // Check if price touched the limit level
    const touched = side === 'long'
      ? low <= limitPrice  // Long: price must drop to limit
      : high >= limitPrice; // Short: price must rise to limit
    
    if (!touched) {
      // Price didn't reach our limit order
      return {
        filled: false,
        fillPrice: 0,
        fillTime: timestamp,
        fee: 0,
        slippage: 0
      };
    }
    
    // Price touched our level - calculate fill probability
    // Simulates 9th-level depth: ~70% fill probability when touched
    const fillProbability = 0.7;
    const shouldFill = this.rng.next() < fillProbability;
    
    if (!shouldFill) {
      // Order touched but didn't fill (front-run by other orders)
      return {
        filled: false,
        fillPrice: 0,
        fillTime: timestamp,
        fee: 0,
        slippage: 0
      };
    }
    
    // Order filled as maker
    // Small adverse slippage to simulate imperfect limit execution
    const adverseSlippage = side === 'long'
      ? limitPrice * (slippagePercent / 100) * 0.3  // Small adverse move
      : -limitPrice * (slippagePercent / 100) * 0.3;
    
    const fillPrice = limitPrice + adverseSlippage;
    const fee = positionValue * this.makerFee; // Maker fee, not taker
    
    return {
      filled: true,
      fillPrice,
      fillTime: timestamp,
      fee,
      slippage: Math.abs(adverseSlippage * positionValue / limitPrice)
    };
  }
  
  /**
   * Simulate stop loss trigger
   * 
   * Checks if stop was hit and simulates slipped market order execution
   */
  simulateStopLoss(
    side: PositionSide,
    stopPrice: number,
    high: number,
    low: number,
    close: number,
    timestamp: number,
    positionValue: number,
    slippagePercent: number
  ): FillResult | null {
    // Check if stop was triggered
    const triggered = side === 'long'
      ? low <= stopPrice   // Long: stop triggered on downside
      : high >= stopPrice; // Short: stop triggered on upside
    
    if (!triggered) {
      return null; // Stop not hit
    }
    
    // Stop triggered - simulate market order execution
    // Use close price as proxy for execution (assuming stop hit mid-bar)
    const basePrice = close;
    
    // Apply aggressive slippage on stop hits (market order in adverse conditions)
    const slippageFactor = slippagePercent / 100;
    const adverseSlippage = side === 'long'
      ? -basePrice * slippageFactor * 2  // Long stop slips down more
      : basePrice * slippageFactor * 2;  // Short stop slips up more
    
    const fillPrice = basePrice + adverseSlippage;
    const fee = positionValue * this.takerFee;
    
    return {
      filled: true,
      fillPrice,
      fillTime: timestamp,
      fee,
      slippage: Math.abs(adverseSlippage * positionValue / basePrice)
    };
  }
  
  /**
   * Simulate take profit execution
   * 
   * Checks if TP was hit, simulates limit order fill
   */
  simulateTakeProfit(
    side: PositionSide,
    tpPrice: number,
    high: number,
    low: number,
    timestamp: number,
    positionValue: number,
    slippagePercent: number
  ): FillResult | null {
    // Check if TP was touched
    const touched = side === 'long'
      ? high >= tpPrice   // Long: TP triggered on upside
      : low <= tpPrice;   // Short: TP triggered on downside
    
    if (!touched) {
      return null; // TP not hit
    }
    
    // TP hit - assume limit order filled at TP price (or better)
    // Small favorable slippage possible
    const slippageFactor = slippagePercent / 100;
    const favorableSlippage = side === 'long'
      ? this.rng.next() * tpPrice * slippageFactor * 0.2  // Slightly better fill
      : -this.rng.next() * tpPrice * slippageFactor * 0.2;
    
    const fillPrice = tpPrice + favorableSlippage;
    const fee = positionValue * this.takerFee; // Assume TP filled as taker
    
    return {
      filled: true,
      fillPrice,
      fillTime: timestamp,
      fee,
      slippage: 0 // Favorable slippage not counted as cost
    };
  }
}

export default FillSimulator;
