/**
 * Type definitions for the Mirko Strategy Optimization Engine
 */

// ============================================================================
// OHLCV Data Types
// ============================================================================

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SymbolData {
  symbol: string;
  candles: Candle[];
  timeframe: string;
}

// ============================================================================
// Indicator Types
// ============================================================================

export interface Indicators {
  price: number;
  rsi: number;
  williamsR: number;
  atr: number;
  atrPercent: number;
  ao: number;
  macd: number;
  macdSignal: number;
  macdHistogram: number;
  ema50: number;
  ema200: number;
  bollingerUpper: number;
  bollingerMiddle: number;
  bollingerLower: number;
  stochK: number;
  stochD: number;
  // New indicators
  kdjK?: number;
  kdjD?: number;
  kdjJ?: number;
  adx?: number;
  diPlus?: number;
  diMinus?: number;
  obv?: number;
  obvEma?: number;
}

export interface KDJResult {
  k: number;
  d: number;
  j: number;
}

export interface ADXResult {
  adx: number;
  diPlus: number;
  diMinus: number;
}

// ============================================================================
// Signal Types
// ============================================================================

export type SignalType = 'STRONG_BUY' | 'BUY' | 'NEUTRAL' | 'SELL' | 'STRONG_SELL';
export type ConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export interface SignalBreakdown {
  indicator: string;
  value: string | number;
  contribution: number;
  reason: string;
  type: 'bullish' | 'bearish' | 'neutral';
}

export interface Signal {
  type: SignalType;
  score: number;
  confidence: ConfidenceLevel;
  breakdown: SignalBreakdown[];
  timestamp: number;
}

// ============================================================================
// Weight Configuration Types
// ============================================================================

export interface WeightConfig {
  max: number;
  oversold?: number;
  oversoldMild?: number;
  overbought?: number;
  overboughtMild?: number;
}

export interface Weights {
  rsi: WeightConfig;
  williamsR: WeightConfig;
  macd: WeightConfig;
  ao: WeightConfig;
  emaTrend: WeightConfig;
  stochastic: WeightConfig;
  bollinger: WeightConfig;
  kdj?: WeightConfig;
  adx?: WeightConfig;
  obv?: WeightConfig;
}

export interface Thresholds {
  strongBuy: number;
  buy: number;
  buyWeak: number;
  strongSell: number;
  sell: number;
  sellWeak: number;
}

export interface SignalConfig {
  weights: Weights;
  thresholds: Thresholds;
  profiles?: Record<string, Weights>;
  activeProfile?: string;
}

// ============================================================================
// Backtest Types
// ============================================================================

export type PositionSide = 'long' | 'short';
export type FillModel = 'taker' | 'probabilistic_limit';
export type SlippageModel = 'none' | 'fixed' | 'spread_based' | 'vol_scaled';
export type RegimeType = 'trending' | 'ranging' | 'high_volatility' | 'unknown';

export interface Position {
  id: string;
  symbol: string;
  side: PositionSide;
  entryPrice: number;
  entryTime: number;
  exitPrice?: number;
  exitTime?: number;
  size: number;
  leverage: number;
  marginUsed: number;
  stopLoss: number;
  takeProfit: number;
  realizedPnl?: number;
  realizedPnlPercent?: number;
  exitReason?: string;
  maxDrawdown?: number;
  maxRunup?: number;
  fees: number;
  slippage: number;
}

export interface Trade extends Position {
  exitPrice: number;
  exitTime: number;
  realizedPnl: number;
  realizedPnlPercent: number;
  exitReason: string;
}

export interface BacktestConfig {
  symbols: string[];
  startDate: number;
  endDate: number;
  initialBalance: number;
  positionSizePercent: number;
  maxPositions: number;
  maxTradesPerDay?: number;
  cooldownBars?: number;
  
  // Risk management
  leverage: number;
  stopLossROI: number;
  takeProfitROI: number;
  
  // Fees and slippage
  fillModel: FillModel;
  makerFee: number;
  takerFee: number;
  slippageModel: SlippageModel;
  slippagePercent?: number;
  
  // Signal configuration
  signalConfig: SignalConfig;
  signalThreshold: number;
  
  // Regime filtering
  useRegimeFilter?: boolean;
  allowedRegimes?: RegimeType[];
  
  // Random seed for determinism
  seed?: number;
}

export interface BacktestResult {
  config: BacktestConfig;
  trades: Trade[];
  metrics: PerformanceMetrics;
  equity: EquityPoint[];
  regimes?: RegimeInfo[];
  seed: number;
}

export interface EquityPoint {
  timestamp: number;
  equity: number;
  drawdown: number;
}

export interface RegimeInfo {
  startTime: number;
  endTime: number;
  regime: RegimeType;
  adx?: number;
  atrPercent?: number;
}

// ============================================================================
// Performance Metrics Types
// ============================================================================

export interface PerformanceMetrics {
  // Returns
  netReturn: number;
  netReturnPercent: number;
  grossReturn: number;
  grossReturnPercent: number;
  
  // Risk metrics
  maxDrawdown: number;
  maxDrawdownPercent: number;
  avgDrawdown: number;
  
  // Trade statistics
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  
  // P&L statistics
  avgWin: number;
  avgLoss: number;
  avgWinPercent: number;
  avgLossPercent: number;
  largestWin: number;
  largestLoss: number;
  
  // Risk-adjusted returns
  sharpeRatio: number;
  sortinoRatio: number;
  calmarRatio: number;
  
  // Other metrics
  profitFactor: number;
  expectancy: number;
  avgRMultiple: number;
  
  // Costs
  totalFees: number;
  totalSlippage: number;
  
  // Time
  avgHoldingPeriod: number;
  
  // Tail risk
  tailLoss: number; // Worst 1% outcomes
  
  // Regime performance
  regimePerformance?: Record<RegimeType, RegimePerformance>;
}

export interface RegimePerformance {
  regime: RegimeType;
  trades: number;
  winRate: number;
  netReturn: number;
  expectancy: number;
}

// ============================================================================
// Walk-Forward Types
// ============================================================================

export interface WalkForwardConfig {
  trainDays: number;
  validationDays: number;
  testDays: number;
  stepDays: number;
  purgeWindow: number; // In bars
  minTradesPerFold: number;
}

export interface WalkForwardFold {
  foldId: number;
  trainStart: number;
  trainEnd: number;
  validationStart: number;
  validationEnd: number;
  testStart: number;
  testEnd: number;
  trainMetrics?: PerformanceMetrics;
  validationMetrics?: PerformanceMetrics;
  testMetrics?: PerformanceMetrics;
}

export interface WalkForwardResult {
  config: WalkForwardConfig;
  folds: WalkForwardFold[];
  inSampleMetrics: PerformanceMetrics;
  outOfSampleMetrics: PerformanceMetrics;
  gap: number; // Out-of-sample vs in-sample performance gap
  worstFoldPerformance: number;
  consistencyScore: number;
}

// ============================================================================
// Optimization Types
// ============================================================================

export interface ParameterRange {
  min: number;
  max: number;
  step?: number;
  scale?: 'linear' | 'log';
}

export interface SearchSpace {
  // Indicator parameters
  rsiPeriod?: ParameterRange;
  rsiOversold?: ParameterRange;
  rsiOverbought?: ParameterRange;
  williamsRPeriod?: ParameterRange;
  kdjPeriod?: ParameterRange;
  kdjSmooth?: ParameterRange;
  macdFast?: ParameterRange;
  macdSlow?: ParameterRange;
  macdSignal?: ParameterRange;
  aoPeriodShort?: ParameterRange;
  aoPeriodLong?: ParameterRange;
  emaPeriod1?: ParameterRange;
  emaPeriod2?: ParameterRange;
  bbPeriod?: ParameterRange;
  bbStdDev?: ParameterRange;
  stochPeriod?: ParameterRange;
  atrPeriod?: ParameterRange;
  adxPeriod?: ParameterRange;
  obvSmooth?: ParameterRange;
  
  // Signal weights
  weightRSI?: ParameterRange;
  weightWilliamsR?: ParameterRange;
  weightMACD?: ParameterRange;
  weightAO?: ParameterRange;
  weightEMA?: ParameterRange;
  weightBB?: ParameterRange;
  weightStoch?: ParameterRange;
  weightKDJ?: ParameterRange;
  weightADX?: ParameterRange;
  weightOBV?: ParameterRange;
  
  // Risk management
  leverage?: ParameterRange;
  stopLossROI?: ParameterRange;
  takeProfitROI?: ParameterRange;
  trailingStepPercent?: ParameterRange;
  trailingMovePercent?: ParameterRange;
  
  // Entry/exit
  signalThreshold?: ParameterRange;
  
  // Regime filters
  adxThreshold?: ParameterRange;
  
  // Position management
  maxPositions?: ParameterRange;
  cooldownBars?: ParameterRange;
}

export interface OptimizationConfig {
  searchSpace: SearchSpace;
  backtestConfig: Partial<BacktestConfig>;
  
  // Optimization strategy
  strategy: 'lhs' | 'nsga2' | 'random' | 'grid';
  
  // For LHS/random
  numSamples?: number;
  
  // For NSGA-II
  populationSize?: number;
  generations?: number;
  crossoverRate?: number;
  mutationRate?: number;
  
  // Objectives
  objectives: OptimizationObjective[];
  
  // Constraints
  constraints?: OptimizationConstraint[];
  
  // Multi-threading
  workers?: number;
  
  // Random seed
  seed?: number;
}

export interface OptimizationObjective {
  metric: keyof PerformanceMetrics | 'stability' | 'robustness';
  direction: 'maximize' | 'minimize';
  weight?: number;
}

export interface OptimizationConstraint {
  metric: keyof PerformanceMetrics;
  operator: 'gt' | 'lt' | 'gte' | 'lte' | 'eq';
  value: number;
}

export interface Candidate {
  id: string;
  params: Record<string, number>;
  backtestResult?: BacktestResult;
  walkForwardResult?: WalkForwardResult;
  objectives: Record<string, number>;
  rank?: number;
  crowdingDistance?: number;
  dominatedBy?: number;
  violatesConstraints: boolean;
}

export interface OptimizationResult {
  config: OptimizationConfig;
  candidates: Candidate[];
  paretoFront: Candidate[];
  bestByObjective: Record<string, Candidate>;
  generation?: number;
  elapsedTime: number;
}

// ============================================================================
// Forward Testing Types
// ============================================================================

export interface ShadowConfig {
  symbol: string;
  signalConfig: SignalConfig;
  backtestConfig: Partial<BacktestConfig>;
  logTrades: boolean;
  duration: number; // In milliseconds
}

export interface ABTestConfig {
  variantA: SignalConfig;
  variantB: SignalConfig;
  splitRatio: number; // 0.5 = 50/50 split
  duration: number;
  minSampleSize: number;
}

export interface LiveMetrics extends PerformanceMetrics {
  timestamp: number;
  uptime: number;
  lastUpdateTime: number;
}

// ============================================================================
// Strategy Template Types
// ============================================================================

export type StrategyTemplate = 'T1_mean_reversion' | 'T2_trend_continuation' | 'T3_hybrid_voting' | 'T4_order_flow_gate';

export interface StrategyProfile {
  name: string;
  description: string;
  template: StrategyTemplate;
  signalConfig: SignalConfig;
  backtestConfig: Partial<BacktestConfig>;
  recommended: {
    symbols: string[];
    timeframes: string[];
    regimes: RegimeType[];
  };
}

// ============================================================================
// Types are exported via export interface/export type declarations above
// ============================================================================
