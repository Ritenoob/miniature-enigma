/**
 * Backtest Engine
 * 
 * Deterministic backtesting engine with:
 * - Leverage-aware ROI SL/TP
 * - Fee and slippage modeling
 * - Regime filtering
 * - Position management constraints
 * - Seeded randomness for reproducibility
 */

import { 
  BacktestConfig, 
  BacktestResult, 
  Trade, 
  Candle, 
  EquityPoint,
  RegimeInfo,
  FillModel,
  SlippageModel
} from '../lib/types';
import { DecimalMath, SeededRandom } from '../lib/math';
import { SignalGenerator } from '../lib/signals';
import FillSimulator from './fill-model';
import PositionSimulator, { PositionConfig } from './position-simulator';
import MetricsCalculator from './metrics';
import RegimeLabeler from './regime-labeler';

export class BacktestEngine {
  private config: BacktestConfig;
  private rng: SeededRandom;
  private fillSimulator: FillSimulator;
  private signalGenerator: SignalGenerator;
  
  constructor(config: BacktestConfig) {
    this.config = config;
    this.rng = new SeededRandom(config.seed || Date.now());
    
    this.fillSimulator = new FillSimulator(
      config.fillModel,
      config.makerFee,
      config.takerFee,
      config.seed || Date.now()
    );
    
    this.signalGenerator = new SignalGenerator(config.signalConfig);
  }
  
  /**
   * Run backtest on historical data
   */
  async run(candlesBySymbol: Record<string, Candle[]>): Promise<BacktestResult> {
    const startTime = Date.now();
    
    // Label regimes if enabled
    const regimesBySymbol: Record<string, RegimeInfo[]> = {};
    if (this.config.useRegimeFilter) {
      for (const symbol in candlesBySymbol) {
        regimesBySymbol[symbol] = RegimeLabeler.labelTimeSeriesRegimes(
          candlesBySymbol[symbol],
          14,
          14,
          50
        );
      }
    }
    
    // Initialize state
    let balance = this.config.initialBalance;
    const trades: Trade[] = [];
    const equity: EquityPoint[] = [{ timestamp: this.config.startDate, equity: balance, drawdown: 0 }];
    const openPositions: Map<string, PositionSimulator> = new Map();
    const lastTradeTime: Map<string, number> = new Map();
    const tradesPerDay: Map<string, number> = new Map();
    
    // Get all timestamps across all symbols (simplified: use first symbol as reference)
    const referenceSymbol = this.config.symbols[0];
    const referenceCandles = candlesBySymbol[referenceSymbol] || [];
    
    // Process each bar
    for (let i = 50; i < referenceCandles.length; i++) {
      const currentTimestamp = referenceCandles[i].timestamp;
      
      // Skip if before start date
      if (currentTimestamp < this.config.startDate) continue;
      if (currentTimestamp > this.config.endDate) break;
      
      // Track daily trades
      const day = this.getDayKey(currentTimestamp);
      if (!tradesPerDay.has(day)) {
        tradesPerDay.set(day, 0);
      }
      
      // Update existing positions
      for (const [symbol, position] of openPositions.entries()) {
        const candle = this.getCandleForSymbol(candlesBySymbol, symbol, i);
        if (!candle) continue;
        
        const closedTrade = position.update(candle);
        if (closedTrade) {
          // Position closed
          closedTrade.symbol = symbol;
          trades.push(closedTrade);
          openPositions.delete(symbol);
          
          // Update balance
          balance += closedTrade.realizedPnl - closedTrade.fees - closedTrade.slippage;
        }
      }
      
      // Try to open new positions
      for (const symbol of this.config.symbols) {
        // Skip if already in position
        if (openPositions.has(symbol)) continue;
        
        // Check max positions constraint
        if (openPositions.size >= this.config.maxPositions) break;
        
        // Check cooldown
        if (this.config.cooldownBars) {
          const lastTrade = lastTradeTime.get(symbol) || 0;
          const barsSinceLastTrade = i - lastTrade;
          if (barsSinceLastTrade < this.config.cooldownBars) continue;
        }
        
        // Check max trades per day
        if (this.config.maxTradesPerDay) {
          if ((tradesPerDay.get(day) || 0) >= this.config.maxTradesPerDay) continue;
        }
        
        // Get candles for this symbol
        const candles = candlesBySymbol[symbol];
        if (!candles || i >= candles.length) continue;
        
        const symbolCandles = candles.slice(Math.max(0, i - 200), i + 1);
        if (symbolCandles.length < 50) continue;
        
        const currentCandle = symbolCandles[symbolCandles.length - 1];
        
        // Check regime filter
        if (this.config.useRegimeFilter && this.config.allowedRegimes) {
          const regimes = regimesBySymbol[symbol] || [];
          const currentRegime = RegimeLabeler.getRegimeAtTime(regimes, currentTimestamp);
          if (!RegimeLabeler.shouldTrade(currentRegime, this.config.allowedRegimes)) {
            continue;
          }
        }
        
        // Calculate indicators (simplified - would use real indicator library)
        const indicators = this.calculateIndicators(symbolCandles);
        
        // Generate signal
        const signal = this.signalGenerator.generate(indicators);
        
        // Check if signal meets threshold
        if (Math.abs(signal.score) < this.config.signalThreshold) continue;
        
        // Determine side
        const side = signal.score > 0 ? 'long' : 'short';
        
        // Calculate position size
        const marginUsed = DecimalMath.calculateMarginUsed(
          balance,
          this.config.positionSizePercent
        );
        
        const positionValue = DecimalMath.calculatePositionValue(
          marginUsed,
          this.config.leverage
        );
        
        const size = DecimalMath.calculateLotSize(
          positionValue,
          currentCandle.close,
          1
        );
        
        if (size === 0) continue;
        
        // Try to fill entry order
        const entryFill = this.fillSimulator.simulateEntry(
          side,
          currentCandle.close,
          currentCandle.high,
          currentCandle.low,
          currentTimestamp,
          positionValue,
          this.calculateSlippage(currentCandle, symbolCandles)
        );
        
        if (!entryFill.filled) continue;
        
        // Create position
        const positionConfig: PositionConfig = {
          entryPrice: entryFill.fillPrice,
          entryTime: currentTimestamp,
          side,
          size,
          leverage: this.config.leverage,
          marginUsed,
          stopLossROI: this.config.stopLossROI,
          takeProfitROI: this.config.takeProfitROI,
          trailingStepPercent: 0.15,
          trailingMovePercent: 0.05,
          breakEvenBufferROI: 0.1,
          entryFee: entryFill.fee,
          takerFee: this.config.takerFee,
          slippagePercent: this.calculateSlippage(currentCandle, symbolCandles)
        };
        
        const positionSim = new PositionSimulator(positionConfig, this.fillSimulator);
        openPositions.set(symbol, positionSim);
        
        // Update balance for fees
        balance -= entryFill.fee;
        
        // Track trade time
        lastTradeTime.set(symbol, i);
        tradesPerDay.set(day, (tradesPerDay.get(day) || 0) + 1);
      }
      
      // Update equity curve
      let totalUnrealized = 0;
      for (const [symbol, position] of openPositions.entries()) {
        const candle = this.getCandleForSymbol(candlesBySymbol, symbol, i);
        if (candle) {
          totalUnrealized += position.getUnrealizedPnL(candle.close);
        }
      }
      
      const currentEquity = balance + totalUnrealized;
      const peak = equity.reduce((max, e) => Math.max(max, e.equity), equity[0].equity);
      const drawdown = peak > 0 ? ((peak - currentEquity) / peak) * 100 : 0;
      
      equity.push({
        timestamp: currentTimestamp,
        equity: currentEquity,
        drawdown
      });
    }
    
    // Close any remaining positions
    for (const [symbol, position] of openPositions.entries()) {
      const candles = candlesBySymbol[symbol];
      const lastCandle = candles[candles.length - 1];
      const closedTrade = position.forceClose(
        lastCandle.close,
        lastCandle.timestamp,
        'backtest_end'
      );
      closedTrade.symbol = symbol;
      trades.push(closedTrade);
      balance += closedTrade.realizedPnl - closedTrade.fees - closedTrade.slippage;
    }
    
    // Calculate metrics
    const metrics = MetricsCalculator.calculate(trades, equity, this.config.initialBalance);
    
    return {
      config: this.config,
      trades,
      metrics,
      equity,
      regimes: Object.values(regimesBySymbol).flat(),
      seed: this.config.seed || 0
    };
  }
  
  /**
   * Calculate indicators (simplified - reuses existing indicator logic)
   */
  private calculateIndicators(candles: Candle[]): any {
    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    
    // For simplicity, returning mock indicators
    // In real implementation, would use TechnicalIndicators from server.js or new implementations
    return {
      price: closes[closes.length - 1],
      rsi: 50,
      williamsR: -50,
      atr: 0,
      atrPercent: 1,
      ao: 0,
      macd: 0,
      macdSignal: 0,
      macdHistogram: 0,
      ema50: closes[closes.length - 1],
      ema200: closes[closes.length - 1],
      bollingerUpper: closes[closes.length - 1] * 1.02,
      bollingerMiddle: closes[closes.length - 1],
      bollingerLower: closes[closes.length - 1] * 0.98,
      stochK: 50,
      stochD: 50
    };
  }
  
  /**
   * Calculate slippage based on model
   */
  private calculateSlippage(candle: Candle, recentCandles: Candle[]): number {
    switch (this.config.slippageModel) {
      case 'none':
        return 0;
      case 'fixed':
        return this.config.slippagePercent || 0.02;
      case 'spread_based':
        // Estimate spread from high-low
        const spread = ((candle.high - candle.low) / candle.close) * 100;
        return Math.min(spread * 0.5, 0.1);
      case 'vol_scaled':
        // Scale slippage by recent volatility
        const returns = recentCandles.slice(-20).map((c, i, arr) => 
          i === 0 ? 0 : Math.abs((c.close - arr[i-1].close) / arr[i-1].close) * 100
        );
        const avgVol = returns.reduce((sum, r) => sum + r, 0) / returns.length;
        return Math.min(avgVol * 0.5, 0.1);
      default:
        return 0.02;
    }
  }
  
  /**
   * Get candle for symbol at index
   */
  private getCandleForSymbol(
    candlesBySymbol: Record<string, Candle[]>,
    symbol: string,
    index: number
  ): Candle | null {
    const candles = candlesBySymbol[symbol];
    if (!candles || index >= candles.length) return null;
    return candles[index];
  }
  
  /**
   * Get day key for date tracking
   */
  private getDayKey(timestamp: number): string {
    const date = new Date(timestamp);
    return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }
}

export default BacktestEngine;
