// ============================================================================
// KuCoin Perpetual Futures Dashboard - Semi-Automated Trading System
// Version: 3.6.0
// 
// CHANGELOG FROM V3.5.2:
// - **V3.6.0 NEW FEATURES:**
// - Fixed .well-known DevTools 404 errors (returns JSON instead of HTML)
// - Live Strategy Optimizer System for parallel variant testing
// - OptimizerConfig: Parameter constraints, variant generation, validation
// - ScoringEngine: Composite scoring, statistical significance, confidence gating
// - TelemetryFeed: Real-time metrics streaming via WebSocket
// - LiveOptimizerController: Parallel strategy testing with safety mechanisms
// - 5 new API endpoints: /api/optimizer/{status,results,start,stop,promote}
// - Signal metadata tagging (experimental flag, variant ID, confidence score)
// - Paper trading default with configurable safety limits
// - Rate limiting (30 API calls/min) and throttling
// - Statistical validation (n≥50, p<0.05) for strategy promotion
// - Comprehensive test suite: 39 new tests (56 total passing)
// - Complete documentation: docs/OPTIMIZER_GUIDE.md
// 
// - **V3.5.2 ENHANCEMENTS:**
// - Precision-safe financial math with decimal.js (eliminates floating-point errors)
// - Stop order state machine for protection against cancel-then-fail exposure
// - Order validation layer enforcing reduceOnly on all exit orders
// - Config schema validation at startup with clear error messages
// - API key/secret redaction in logs for security
// - Hot/cold path event architecture for latency-sensitive operations
// - Property-based tests with fast-check for comprehensive edge case coverage
// 
// - **Previous V3.5.1 features:**
// - Fee-adjusted break-even calculation (accounts for maker/taker fees)
// - Accurate liquidation price formula with maintenance margin
// - Slippage buffer on stop placement
// - API retry queue with exponential backoff
// - ROI-based SL/TP with inverse leverage scaling
// - Volatility-based auto-leverage calculation
// - Partial take-profit (scaling out) support
// - Enhanced trailing stop with ATR-based variant
// - Improved position sizing with fee deductions
// - Rate limit handling and graceful degradation
// ============================================================================

require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const crypto = require('crypto');
const axios = require('axios');
const fs = require('fs');
const { EventEmitter } = require('events');

// ============================================================================
// V3.5.2: Import new precision and safety modules
// ============================================================================
const DecimalMath = require('./src/lib/DecimalMath');
const { validateConfig } = require('./src/lib/ConfigSchema');
const SecureLogger = require('./src/lib/SecureLogger');
const OrderValidator = require('./src/lib/OrderValidator');
// Note: StopOrderStateMachine and EventBus are initialized per-position/global

// ============================================================================
// OPTIMIZER MODULES (disabled by default)
// ============================================================================
const OptimizerConfig = require('./src/optimizer/OptimizerConfig');
const LiveOptimizerController = require('./src/optimizer/LiveOptimizerController');

// ============================================================================
// CONFIGURATION
// ============================================================================
const CONFIG = {
  PORT: process.env.PORT || 3001,
  KUCOIN_FUTURES_API: 'https://api-futures.kucoin.com',
  
  // Trading Parameters
  TRADING: {
    // Risk Management (ROI-based, not price-based)
    INITIAL_SL_ROI: 0.5,              // 0.5% ROI loss = stop loss
    INITIAL_TP_ROI: 2.0,              // 2.0% ROI gain = take profit
    
    // Break-Even Settings
    BREAK_EVEN_BUFFER: 0.1,           // 0.1% buffer above fee-adjusted break-even
    
    // Trailing Stop Settings
    TRAILING_STEP_PERCENT: 0.15,      // Trail every 0.15% ROI
    TRAILING_MOVE_PERCENT: 0.05,      // Move SL by 0.05% price per step
    TRAILING_MODE: 'staircase',       // 'staircase' | 'atr' | 'dynamic'
    ATR_TRAILING_MULTIPLIER: 1.5,     // For ATR-based trailing
    
    // Position Sizing
    POSITION_SIZE_PERCENT: 0.5,       // 0.5% of account balance
    DEFAULT_LEVERAGE: 10,
    MAX_POSITIONS: 5,
    
    // Slippage & Fees
    SLIPPAGE_BUFFER_PERCENT: 0.02,    // 0.02% slippage buffer on stops
    MAKER_FEE: 0.0002,                // 0.02% maker fee
    TAKER_FEE: 0.0006,                // 0.06% taker fee
    
    // Liquidation Safety
    MAINTENANCE_MARGIN_PERCENT: 0.5,  // 0.5% maintenance margin
    
    // Partial Take Profit (Scaling Out)
    ENABLE_PARTIAL_TP: false,         // Enable partial exits
    PARTIAL_TP_PERCENT: 50,           // Close 50% at TP1
    TP1_ROI: 1.0,                     // First TP at 1% ROI
    TP2_ROI: 2.0,                     // Second TP at 2% ROI
    
    // Auto-Leverage Tiers (ATR % -> Max Leverage)
    AUTO_LEVERAGE_TIERS: [
      { maxVolatility: 0.5, leverage: 50 },
      { maxVolatility: 1.0, leverage: 25 },
      { maxVolatility: 2.0, leverage: 15 },
      { maxVolatility: 3.0, leverage: 10 },
      { maxVolatility: 5.0, leverage: 5 },
      { maxVolatility: Infinity, leverage: 3 }
    ]
  },
  
  // API Settings
  API: {
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY_MS: 1000,
    RATE_LIMIT_DELAY_MS: 5000,
    REQUEST_TIMEOUT_MS: 10000
  },
  
  // Default symbols
  DEFAULT_SYMBOLS: ['XBTUSDTM', 'ETHUSDTM', 'SOLUSDTM', 'BNBUSDTM', 'XRPUSDTM'],
  
  // Timeframes (in minutes for KuCoin API)
  TIMEFRAMES: {
    '1min': 1,
    '5min': 5,
    '15min': 15,
    '30min': 30,
    '1hour': 60,
    '4hour': 240,
    '1day': 1440
  },
  
  // Data file for position persistence
  POSITIONS_FILE: './positions.json',
  RETRY_QUEUE_FILE: './retry_queue.json',
  
  // Optimizer settings (disabled by default)
  OPTIMIZER: {
    ENABLED: process.env.OPTIMIZER_ENABLED === 'true' || false
  }
};

// ============================================================================
// V3.5.2: VALIDATE CONFIGURATION AT STARTUP
// ============================================================================
try {
  validateConfig(CONFIG);
  console.log('[INIT] ✓ Configuration validated successfully');
} catch (error) {
  console.error('[INIT] ✗ Configuration validation failed:');
  console.error(error.message);
  process.exit(1);
}

// ============================================================================
// EXPRESS & WEBSOCKET SETUP
// ============================================================================
const app = express();
app.use(express.json());

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  // Content Security Policy - allow inline scripts and styles for dashboard
  // Note: 'unsafe-inline' is required because the dashboard (index.html) uses inline scripts.
  // For enhanced security, consider refactoring to use nonces or external script files.
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "connect-src 'self' ws: wss:; " +
    "img-src 'self' data:;"
  );
  next();
});

// Favicon handler
app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

// .well-known handler for DevTools and other well-known paths
app.get('/.well-known/*', (req, res) => {
  res.status(404).json({ 
    error: 'Not Found',
    path: req.path,
    message: 'The requested .well-known resource does not exist'
  });
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ============================================================================
// API CREDENTIALS
// ============================================================================
const DEMO_MODE = process.env.DEMO_MODE === 'true';
const SHOULD_START_INTERVALS = process.env.RUN_INTERVALS !== 'false';
const KUCOIN_API_KEY = process.env.KUCOIN_API_KEY;
const KUCOIN_API_SECRET = process.env.KUCOIN_API_SECRET;
const KUCOIN_API_PASSPHRASE = process.env.KUCOIN_API_PASSPHRASE;

if ((!KUCOIN_API_KEY || !KUCOIN_API_SECRET || !KUCOIN_API_PASSPHRASE) && !DEMO_MODE) {
  console.error('╔═══════════════════════════════════════════════════════════════╗');
  console.error('║  ERROR: Missing KuCoin API credentials                        ║');
  console.error('║  Please set in .env file:                                     ║');
  console.error('║    KUCOIN_API_KEY=your_api_key                                ║');
  console.error('║    KUCOIN_API_SECRET=your_api_secret                          ║');
  console.error('║    KUCOIN_API_PASSPHRASE=your_passphrase                      ║');
  console.error('╚═══════════════════════════════════════════════════════════════╝');
  process.exit(1);
}

if (DEMO_MODE) {
  console.warn('[INIT] Demo mode enabled. Using mock KuCoin client and synthetic market data. No live orders will be sent.');
}

// ============================================================================
// GLOBAL STATE
// ============================================================================
const marketManagers = {};           // Symbol -> MarketDataManager
const activePositions = new Map();   // Symbol -> PositionManager
const orderBooks = {};               // Symbol -> { bids: [], asks: [] }
const fundingRates = {};             // Symbol -> { rate, nextFundingTime }
const contractSpecs = {};            // Symbol -> { tickSize, lotSize, multiplier, maintMargin }
const wsClients = new Set();         // Connected dashboard clients
const positionMonitor = new EventEmitter();

let currentTimeframe = '5min';
let accountBalance = 0;

// ============================================================================
// OPTIMIZER CONTROLLER (initialized later after other components)
// ============================================================================
let optimizerController = null;

// ============================================================================
// V3.5.2: PRECISION-SAFE MATH UTILITIES USING DECIMAL.JS
// TradeMath now wraps DecimalMath for backward compatibility
// ============================================================================
const TradeMath = {
  // All calculation methods now use DecimalMath for precision
  calculateMarginUsed: DecimalMath.calculateMarginUsed.bind(DecimalMath),
  calculatePositionValue: DecimalMath.calculatePositionValue.bind(DecimalMath),
  calculateLotSize: DecimalMath.calculateLotSize.bind(DecimalMath),
  calculatePriceDiff: DecimalMath.calculatePriceDiff.bind(DecimalMath),
  calculateUnrealizedPnl: DecimalMath.calculateUnrealizedPnl.bind(DecimalMath),
  calculateLeveragedPnlPercent: DecimalMath.calculateLeveragedPnlPercent.bind(DecimalMath),
  calculateFeeAdjustedBreakEven: DecimalMath.calculateFeeAdjustedBreakEven.bind(DecimalMath),
  calculateTotalFees: DecimalMath.calculateTotalFees.bind(DecimalMath),
  calculateNetPnl: DecimalMath.calculateNetPnl.bind(DecimalMath),
  calculateStopLossPrice: DecimalMath.calculateStopLossPrice.bind(DecimalMath),
  calculateTakeProfitPrice: DecimalMath.calculateTakeProfitPrice.bind(DecimalMath),
  calculateLiquidationPrice: DecimalMath.calculateLiquidationPrice.bind(DecimalMath),
  calculateSlippageAdjustedStop: DecimalMath.calculateSlippageAdjustedStop.bind(DecimalMath),
  calculateTrailingSteps: DecimalMath.calculateTrailingSteps.bind(DecimalMath),
  calculateTrailedStopLoss: DecimalMath.calculateTrailedStopLoss.bind(DecimalMath),
  calculateATRTrailingDistance: DecimalMath.calculateATRTrailingDistance.bind(DecimalMath),
  roundToTickSize: DecimalMath.roundToTickSize.bind(DecimalMath),
  roundToLotSize: DecimalMath.roundToLotSize.bind(DecimalMath),
  
  /**
   * Calculate volatility-based recommended leverage
   * Uses ATR percentage to determine safe leverage tier
   */
  calculateAutoLeverage(atrPercent, riskMultiplier = 1.0) {
    return DecimalMath.calculateAutoLeverage(
      atrPercent, 
      riskMultiplier, 
      CONFIG.TRADING.AUTO_LEVERAGE_TIERS
    );
  }
};

// ============================================================================
// KUCOIN FUTURES API CLASS WITH RETRY LOGIC
// ============================================================================
class KuCoinFuturesAPI {
  constructor(apiKey, apiSecret, passphrase) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.passphrase = passphrase;
    this.baseURL = CONFIG.KUCOIN_FUTURES_API;
    this.lastRequestTime = 0;
    this.rateLimitCooldown = false;
  }

  generateSignature(timestamp, method, endpoint, body = '') {
    const strToSign = timestamp + method + endpoint + body;
    return crypto.createHmac('sha256', this.apiSecret).update(strToSign).digest('base64');
  }

  getHeaders(method, endpoint, body = '') {
    const timestamp = Date.now().toString();
    const signature = this.generateSignature(timestamp, method, endpoint, body);
    const passphraseSignature = crypto.createHmac('sha256', this.apiSecret).update(this.passphrase).digest('base64');

    return {
      'KC-API-KEY': this.apiKey,
      'KC-API-SIGN': signature,
      'KC-API-TIMESTAMP': timestamp,
      'KC-API-PASSPHRASE': passphraseSignature,
      'KC-API-KEY-VERSION': '2',
      'Content-Type': 'application/json'
    };
  }

  /**
   * V3.5 NEW: Request with automatic retry and rate limit handling
   */
  async request(method, endpoint, data = null, retryCount = 0) {
    // Check rate limit cooldown
    if (this.rateLimitCooldown) {
      await this.sleep(CONFIG.API.RATE_LIMIT_DELAY_MS);
      this.rateLimitCooldown = false;
    }

    try {
      const body = data ? JSON.stringify(data) : '';
      const headers = this.getHeaders(method, endpoint, body);
      const url = `${this.baseURL}${endpoint}`;

      const response = await axios({
        method,
        url,
        headers,
        ...(data && { data }),
        timeout: CONFIG.API.REQUEST_TIMEOUT_MS
      });

      // Check for rate limit response
      if (response.data.code === '429000' || response.data.code === '429') {
        this.rateLimitCooldown = true;
        throw new Error('Rate limit exceeded');
      }

      if (response.data.code !== '200000') {
        throw new Error(response.data.msg || 'API Error');
      }

      return response.data;

    } catch (error) {
      const isRateLimit = error.message.includes('Rate limit') || 
                          error.response?.status === 429;
      const isRetryable = isRateLimit || 
                          error.code === 'ECONNABORTED' ||
                          error.code === 'ETIMEDOUT' ||
                          error.response?.status >= 500;

      // Retry logic with exponential backoff
      if (isRetryable && retryCount < CONFIG.API.RETRY_ATTEMPTS) {
        const delay = CONFIG.API.RETRY_DELAY_MS * Math.pow(2, retryCount);
        broadcastLog('warn', `API retry ${retryCount + 1}/${CONFIG.API.RETRY_ATTEMPTS} after ${delay}ms: ${error.message}`);
        await this.sleep(delay);
        return this.request(method, endpoint, data, retryCount + 1);
      }

      const msg = error.response?.data?.msg || error.message;
      console.error(`[API ERROR] ${method} ${endpoint}: ${msg}`);
      throw new Error(msg);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public endpoints (no auth needed)
  async getServerTime() {
    const response = await axios.get(`${this.baseURL}/api/v1/timestamp`);
    return response.data;
  }

  async getContracts() {
    const response = await axios.get(`${this.baseURL}/api/v1/contracts/active`);
    return response.data;
  }

  async getContractDetail(symbol) {
    const response = await axios.get(`${this.baseURL}/api/v1/contracts/${symbol}`);
    return response.data;
  }

  async getTicker(symbol) {
    const response = await axios.get(`${this.baseURL}/api/v1/ticker?symbol=${symbol}`);
    return response.data;
  }

  async getOrderBook(symbol, depth = 20) {
    const response = await axios.get(`${this.baseURL}/api/v1/level2/depth${depth}?symbol=${symbol}`);
    return response.data;
  }

  async getKlines(symbol, granularity, from, to) {
    const response = await axios.get(`${this.baseURL}/api/v1/kline/query`, {
      params: { symbol, granularity, from, to }
    });
    return response.data;
  }

  async getFundingRate(symbol) {
    const response = await axios.get(`${this.baseURL}/api/v1/funding-rate/${symbol}/current`);
    return response.data;
  }

  // Private endpoints (auth required)
  async getAccountOverview(currency = 'USDT') {
    return this.request('GET', `/api/v1/account-overview?currency=${currency}`);
  }

  async getPosition(symbol) {
    return this.request('GET', `/api/v1/position?symbol=${symbol}`);
  }

  async getAllPositions() {
    return this.request('GET', '/api/v1/positions');
  }

  async placeOrder(params) {
    return this.request('POST', '/api/v1/orders', params);
  }

  async placeStopOrder(params) {
    return this.request('POST', '/api/v1/stop-orders', params);
  }

  async cancelOrder(orderId) {
    return this.request('DELETE', `/api/v1/orders/${orderId}`);
  }

  async cancelStopOrder(orderId) {
    return this.request('DELETE', `/api/v1/stop-orders/${orderId}`);
  }

  async cancelAllOrders(symbol) {
    return this.request('DELETE', `/api/v1/orders?symbol=${symbol}`);
  }

  async cancelAllStopOrders(symbol) {
    return this.request('DELETE', `/api/v1/stop-orders?symbol=${symbol}`);
  }

  async getOpenOrders(symbol) {
    return this.request('GET', `/api/v1/orders?symbol=${symbol}&status=active`);
  }

  async getOpenStopOrders(symbol) {
    return this.request('GET', `/api/v1/stop-orders?symbol=${symbol}`);
  }

  async getOrderDetail(orderId) {
    return this.request('GET', `/api/v1/orders/${orderId}`);
  }

  async getWebSocketToken() {
    return this.request('POST', '/api/v1/bullet-private');
  }

  async getPublicWebSocketToken() {
    const response = await axios.post(`${this.baseURL}/api/v1/bullet-public`);
    return response.data;
  }
}

// ============================================================================
// DEMO MODE SUPPORT
// ============================================================================
class MockKuCoinFuturesAPI {
  constructor() {
    this.baseURL = CONFIG.KUCOIN_FUTURES_API;
    this.samplePrices = {
      XBTUSDTM: 50000,
      ETHUSDTM: 3200,
      SOLUSDTM: 100,
      BNBUSDTM: 500,
      XRPUSDTM: 0.6
    };
  }

  async getServerTime() {
    return { code: '200000', data: Date.now() };
  }

  async getContracts() {
    return {
      code: '200000',
      data: CONFIG.DEFAULT_SYMBOLS.map(symbol => ({
        symbol,
        quoteCurrency: 'USDT',
        status: 'Open'
      }))
    };
  }

  async getContractDetail(symbol) {
    const basePrice = this.samplePrices[symbol] || 100;
    return {
      code: '200000',
      data: {
        symbol,
        tickSize: basePrice > 100 ? '0.1' : '0.0001',
        lotSize: '1',
        multiplier: '1',
        maintMarginRate: '0.005',
        maxLeverage: 50,
        minOrderQty: '1',
        maxOrderQty: '1000000'
      }
    };
  }

  async getTicker(symbol) {
    const basePrice = this.samplePrices[symbol] || 100;
    return {
      code: '200000',
      data: {
        price: basePrice,
        bestBidPrice: basePrice - 0.5,
        bestAskPrice: basePrice + 0.5,
        priceChgPct: '0.001',
        vol24h: '120000'
      }
    };
  }

  buildOrderBook(symbol, depth = 20) {
    const basePrice = this.samplePrices[symbol] || 100;
    const bids = [];
    const asks = [];
    for (let i = 0; i < depth; i++) {
      bids.push([(basePrice - i * 0.5).toFixed(2), (10 + i).toString()]);
      asks.push([(basePrice + i * 0.5).toFixed(2), (10 + i).toString()]);
    }
    return { bids, asks };
  }

  async getOrderBook(symbol, depth = 20) {
    const ob = this.buildOrderBook(symbol, depth);
    return { code: '200000', data: ob };
  }

  async getKlines(symbol, granularity, from, to) {
    const basePrice = this.samplePrices[symbol] || 100;
    const candles = [];
    const step = (granularity || 5) * 60 * 1000;
    let timestamp = to - step * 120;
    let price = basePrice;
    for (let i = 0; i < 120; i++) {
      const open = price;
      const close = price + Math.sin(i / 5) * 2;
      const high = Math.max(open, close) + 1;
      const low = Math.min(open, close) - 1;
      candles.push([timestamp, open.toFixed(2), high.toFixed(2), low.toFixed(2), close.toFixed(2), (1000 + i).toFixed(2)]);
      price = close;
      timestamp += step;
    }
    return { code: '200000', data: candles };
  }

  async getFundingRate(symbol) {
    return { code: '200000', data: { value: '0.0001', predictedValue: '0.0002' } };
  }

  async getAccountOverview() {
    return { code: '200000', data: { accountEquity: '10000' } };
  }

  async getPosition() {
    return { code: '200000', data: null };
  }

  async getAllPositions() {
    return { code: '200000', data: [] };
  }

  async placeOrder(params) {
    return { code: '200000', data: { orderId: `mock_order_${Date.now()}`, clientOid: params?.clientOid } };
  }

  async placeStopOrder(params) {
    return { code: '200000', data: { orderId: `mock_stop_${Date.now()}`, clientOid: params?.clientOid } };
  }

  async cancelStopOrder(orderId) {
    return { code: '200000', data: { cancelledOrderIds: [orderId] } };
  }

  async cancelAllStopOrders() {
    return { code: '200000', data: { cancelledOrderIds: [] } };
  }

  async cancelAllOrders() {
    return { code: '200000', data: { cancelledOrderIds: [] } };
  }

  async getOpenOrders() {
    return { code: '200000', data: [] };
  }

  async getOpenStopOrders() {
    return { code: '200000', data: [] };
  }

  async getOrderDetail(orderId) {
    return { code: '200000', data: { orderId } };
  }

  async getWebSocketToken() {
    return { code: '200000', data: { token: 'mock' } };
  }

  async getPublicWebSocketToken() {
    return { code: '200000', data: { token: 'mock' } };
  }
}

function createKuCoinClient() {
  if (DEMO_MODE) {
    return new MockKuCoinFuturesAPI();
  }
  return new KuCoinFuturesAPI(KUCOIN_API_KEY, KUCOIN_API_SECRET, KUCOIN_API_PASSPHRASE);
}

const kucoinAPI = createKuCoinClient();

// ============================================================================
// V3.5: API RETRY QUEUE MANAGER
// ============================================================================
class RetryQueueManager {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(CONFIG.RETRY_QUEUE_FILE)) {
        this.queue = JSON.parse(fs.readFileSync(CONFIG.RETRY_QUEUE_FILE, 'utf8'));
        if (this.queue.length > 0) {
          broadcastLog('info', `[RETRY] Loaded ${this.queue.length} pending operations`);
        }
      }
    } catch (error) {
      console.error('[RETRY LOAD ERROR]', error.message);
      this.queue = [];
    }
  }

  save() {
    try {
      fs.writeFileSync(CONFIG.RETRY_QUEUE_FILE, JSON.stringify(this.queue, null, 2));
    } catch (error) {
      console.error('[RETRY SAVE ERROR]', error.message);
    }
  }

  add(operation) {
    const queueItem = {
      id: Date.now() + Math.random(),
      operation,
      attempts: 0,
      createdAt: Date.now()
    };
    this.queue.push(queueItem);
    this.save();
    this.process();
  }

  async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue[0];
      item.attempts++;

      try {
        await this.executeOperation(item.operation);
        this.queue.shift();
        this.save();
        broadcastLog('success', `[RETRY] Completed: ${item.operation.type}`);
      } catch (error) {
        if (item.attempts >= CONFIG.API.RETRY_ATTEMPTS) {
          this.queue.shift();
          this.save();
          broadcastLog('error', `[RETRY] Failed after ${item.attempts} attempts: ${item.operation.type}`);
          
          // Critical failure handling for stop orders
          if (item.operation.type === 'update_stop_loss') {
            await this.handleCriticalStopFailure(item.operation);
          }
        } else {
          await new Promise(r => setTimeout(r, CONFIG.API.RETRY_DELAY_MS * Math.pow(2, item.attempts)));
        }
      }
    }

    this.processing = false;
  }

  async executeOperation(op) {
    switch (op.type) {
      case 'update_stop_loss':
        await this.executeStopLossUpdate(op);
        break;
      case 'place_take_profit':
        await kucoinAPI.placeOrder(op.params);
        break;
      case 'cancel_order':
        await kucoinAPI.cancelStopOrder(op.orderId);
        break;
      default:
        throw new Error(`Unknown operation type: ${op.type}`);
    }
  }

  async executeStopLossUpdate(op) {
    // Cancel existing stop
    if (op.existingOrderId) {
      try {
        await kucoinAPI.cancelStopOrder(op.existingOrderId);
      } catch (e) {
        // Order might already be cancelled
      }
    }
    // Place new stop
    await kucoinAPI.placeStopOrder(op.params);
  }

  async handleCriticalStopFailure(op) {
    broadcastLog('error', `[CRITICAL] Stop loss update failed for ${op.symbol}. Position may be unprotected!`);
    broadcastAlert('error', `CRITICAL: ${op.symbol} stop loss failed. Consider manual intervention.`);
    
    // Notify the position manager
    const position = activePositions.get(op.symbol);
    if (position) {
      position.stopOrderFailed = true;
    }
  }
}

const retryQueueManager = new RetryQueueManager();

// ============================================================================
// TECHNICAL INDICATORS
// ============================================================================
class TechnicalIndicators {
  static calculateSMA(data, period) {
    if (!data || data.length < period) return null;
    const slice = data.slice(-period);
    return slice.reduce((sum, val) => sum + val, 0) / period;
  }

  static calculateEMA(data, period) {
    if (!data || data.length < period) return null;
    const multiplier = 2 / (period + 1);
    let ema = this.calculateSMA(data.slice(0, period), period);
    if (ema === null) return null;
    
    for (let i = period; i < data.length; i++) {
      ema = (data[i] - ema) * multiplier + ema;
    }
    return ema;
  }

  static calculateRSI(data, period = 14) {
    if (!data || data.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = data.length - period; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  static calculateWilliamsR(highs, lows, closes, period = 14) {
    if (!closes || closes.length < period) return -50;
    
    const recentHighs = highs.slice(-period);
    const recentLows = lows.slice(-period);
    const currentClose = closes[closes.length - 1];
    
    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);
    
    if (highestHigh === lowestLow) return -50;
    return ((highestHigh - currentClose) / (highestHigh - lowestLow)) * -100;
  }

  static calculateATR(highs, lows, closes, period = 14) {
    if (!closes || closes.length < period + 1) return 0;
    
    const trueRanges = [];
    for (let i = 1; i < closes.length; i++) {
      const tr = Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      );
      trueRanges.push(tr);
    }
    
    return this.calculateSMA(trueRanges.slice(-period), period) || 0;
  }

  static calculateMACD(data, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (!data || data.length < slowPeriod) return { macd: 0, signal: 0, histogram: 0 };
    
    const fastEMA = this.calculateEMA(data, fastPeriod);
    const slowEMA = this.calculateEMA(data, slowPeriod);
    
    if (fastEMA === null || slowEMA === null) return { macd: 0, signal: 0, histogram: 0 };
    
    const macd = fastEMA - slowEMA;
    const signal = macd * 0.85;
    const histogram = macd - signal;
    
    return { macd, signal, histogram };
  }

  static calculateAO(highs, lows, shortPeriod = 5, longPeriod = 34) {
    if (!highs || highs.length < longPeriod) return 0;
    
    const medianPrices = highs.map((high, i) => (high + lows[i]) / 2);
    const shortSMA = this.calculateSMA(medianPrices.slice(-shortPeriod), shortPeriod);
    const longSMA = this.calculateSMA(medianPrices.slice(-longPeriod), longPeriod);
    
    if (shortSMA === null || longSMA === null) return 0;
    return shortSMA - longSMA;
  }

  static calculateBollingerBands(data, period = 20, stdDev = 2) {
    if (!data || data.length < period) {
      const lastPrice = data && data.length > 0 ? data[data.length - 1] : 0;
      return { upper: lastPrice, middle: lastPrice, lower: lastPrice };
    }
    
    const slice = data.slice(-period);
    const sma = slice.reduce((sum, val) => sum + val, 0) / period;
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
    const std = Math.sqrt(variance);
    
    return {
      upper: sma + (stdDev * std),
      middle: sma,
      lower: sma - (stdDev * std)
    };
  }

  static calculateStochastic(highs, lows, closes, period = 14, smoothK = 3, smoothD = 3) {
    if (!closes || closes.length < period) return { k: 50, d: 50 };
    
    const recentHighs = highs.slice(-period);
    const recentLows = lows.slice(-period);
    const currentClose = closes[closes.length - 1];
    
    const highestHigh = Math.max(...recentHighs);
    const lowestLow = Math.min(...recentLows);
    
    if (highestHigh === lowestLow) return { k: 50, d: 50 };
    
    const k = ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    const d = k * 0.8;
    
    return { k, d };
  }

  /**
   * V3.5 NEW: Calculate ATR as percentage of price (volatility)
   */
  static calculateATRPercent(highs, lows, closes, period = 14) {
    const atr = this.calculateATR(highs, lows, closes, period);
    const currentPrice = closes[closes.length - 1];
    if (!currentPrice || currentPrice === 0) return 0;
    return (atr / currentPrice) * 100;
  }
}

// ============================================================================
// SIGNAL GENERATOR (-100 to +100)
// ============================================================================
class SignalGenerator {
  static generate(indicators) {
    let score = 0;
    const breakdown = [];

    // RSI (±25 points)
    if (indicators.rsi < 30) {
      score += 25;
      breakdown.push({ indicator: 'RSI', value: indicators.rsi.toFixed(1), contribution: 25, reason: 'Oversold (<30)', type: 'bullish' });
    } else if (indicators.rsi < 40) {
      score += 15;
      breakdown.push({ indicator: 'RSI', value: indicators.rsi.toFixed(1), contribution: 15, reason: 'Approaching oversold', type: 'bullish' });
    } else if (indicators.rsi > 70) {
      score -= 25;
      breakdown.push({ indicator: 'RSI', value: indicators.rsi.toFixed(1), contribution: -25, reason: 'Overbought (>70)', type: 'bearish' });
    } else if (indicators.rsi > 60) {
      score -= 15;
      breakdown.push({ indicator: 'RSI', value: indicators.rsi.toFixed(1), contribution: -15, reason: 'Approaching overbought', type: 'bearish' });
    } else {
      breakdown.push({ indicator: 'RSI', value: indicators.rsi.toFixed(1), contribution: 0, reason: 'Neutral (40-60)', type: 'neutral' });
    }

    // Williams %R (±20 points)
    if (indicators.williamsR < -80) {
      score += 20;
      breakdown.push({ indicator: 'Williams %R', value: indicators.williamsR.toFixed(1), contribution: 20, reason: 'Oversold (<-80)', type: 'bullish' });
    } else if (indicators.williamsR > -20) {
      score -= 20;
      breakdown.push({ indicator: 'Williams %R', value: indicators.williamsR.toFixed(1), contribution: -20, reason: 'Overbought (>-20)', type: 'bearish' });
    } else {
      breakdown.push({ indicator: 'Williams %R', value: indicators.williamsR.toFixed(1), contribution: 0, reason: 'Neutral', type: 'neutral' });
    }

    // MACD (±20 points)
    if (indicators.macd > 0 && indicators.macdHistogram > 0) {
      score += 20;
      breakdown.push({ indicator: 'MACD', value: indicators.macd.toFixed(2), contribution: 20, reason: 'Bullish momentum', type: 'bullish' });
    } else if (indicators.macd < 0 && indicators.macdHistogram < 0) {
      score -= 20;
      breakdown.push({ indicator: 'MACD', value: indicators.macd.toFixed(2), contribution: -20, reason: 'Bearish momentum', type: 'bearish' });
    } else {
      breakdown.push({ indicator: 'MACD', value: indicators.macd.toFixed(2), contribution: 0, reason: 'Neutral/Crossover', type: 'neutral' });
    }

    // Awesome Oscillator (±15 points)
    if (indicators.ao > 0) {
      score += 15;
      breakdown.push({ indicator: 'AO', value: indicators.ao.toFixed(2), contribution: 15, reason: 'Positive momentum', type: 'bullish' });
    } else {
      score -= 15;
      breakdown.push({ indicator: 'AO', value: indicators.ao.toFixed(2), contribution: -15, reason: 'Negative momentum', type: 'bearish' });
    }

    // EMA Trend (±20 points)
    if (indicators.ema50 > indicators.ema200) {
      score += 20;
      breakdown.push({ indicator: 'EMA Trend', value: 'EMA50 > EMA200', contribution: 20, reason: 'Bullish trend (Golden Cross)', type: 'bullish' });
    } else if (indicators.ema50 < indicators.ema200) {
      score -= 20;
      breakdown.push({ indicator: 'EMA Trend', value: 'EMA50 < EMA200', contribution: -20, reason: 'Bearish trend (Death Cross)', type: 'bearish' });
    } else {
      breakdown.push({ indicator: 'EMA Trend', value: 'EMA50 ≈ EMA200', contribution: 0, reason: 'Neutral', type: 'neutral' });
    }

    // Stochastic (±10 points)
    if (indicators.stochK < 20 && indicators.stochK > indicators.stochD) {
      score += 10;
      breakdown.push({ indicator: 'Stochastic', value: indicators.stochK.toFixed(1), contribution: 10, reason: 'Oversold + bullish crossover', type: 'bullish' });
    } else if (indicators.stochK > 80 && indicators.stochK < indicators.stochD) {
      score -= 10;
      breakdown.push({ indicator: 'Stochastic', value: indicators.stochK.toFixed(1), contribution: -10, reason: 'Overbought + bearish crossover', type: 'bearish' });
    } else {
      breakdown.push({ indicator: 'Stochastic', value: indicators.stochK.toFixed(1), contribution: 0, reason: 'Neutral', type: 'neutral' });
    }

    // Bollinger Bands (±10 points)
    if (indicators.price < indicators.bollingerLower) {
      score += 10;
      breakdown.push({ indicator: 'Bollinger', value: 'Below lower', contribution: 10, reason: 'Price below lower band', type: 'bullish' });
    } else if (indicators.price > indicators.bollingerUpper) {
      score -= 10;
      breakdown.push({ indicator: 'Bollinger', value: 'Above upper', contribution: -10, reason: 'Price above upper band', type: 'bearish' });
    } else {
      breakdown.push({ indicator: 'Bollinger', value: 'Within bands', contribution: 0, reason: 'Price within bands', type: 'neutral' });
    }

    // Determine signal type
    let type = 'NEUTRAL';
    let confidence = 'LOW';
    
    if (score >= 70) { type = 'STRONG_BUY'; confidence = 'HIGH'; }
    else if (score >= 50) { type = 'BUY'; confidence = 'MEDIUM'; }
    else if (score >= 30) { type = 'BUY'; confidence = 'LOW'; }
    else if (score <= -70) { type = 'STRONG_SELL'; confidence = 'HIGH'; }
    else if (score <= -50) { type = 'SELL'; confidence = 'MEDIUM'; }
    else if (score <= -30) { type = 'SELL'; confidence = 'LOW'; }

    return {
      type,
      score,
      confidence,
      breakdown,
      timestamp: Date.now(),
      // Signal metadata for optimizer integration
      experimental: false,           // Set to true for signals from experimental strategies
      strategyVariantId: null,       // Set to variant ID when from experimental strategy
      confidenceScore: null          // Numeric confidence score for experimental strategies
    };
  }
  
  /**
   * Tag signal as experimental
   * @param {Object} signal - Base signal to tag
   * @param {string} variantId - Strategy variant ID
   * @param {number} confidence - Numeric confidence score (0-1)
   * @returns {Object} Tagged signal
   */
  static tagExperimental(signal, variantId, confidence = null) {
    return {
      ...signal,
      experimental: true,
      strategyVariantId: variantId,
      confidenceScore: confidence
    };
  }
}

// ============================================================================
// MARKET DATA MANAGER
// ============================================================================
class MarketDataManager {
  constructor(symbol) {
    this.symbol = symbol;
    this.candles = [];
    this.maxCandles = 500;
    this.currentPrice = 0;
    this.priceChange24h = 0;
    this.volume24h = 0;
    this.bestBid = 0;
    this.bestAsk = 0;
  }

  addCandle(candle) {
    this.candles.push(candle);
    if (this.candles.length > this.maxCandles) {
      this.candles.shift();
    }
    this.currentPrice = candle.close;
  }

  loadCandles(klineData) {
    if (!klineData || !Array.isArray(klineData)) return;
    
    this.candles = klineData.map(k => ({
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    })).sort((a, b) => a.timestamp - b.timestamp);
    
    if (this.candles.length > 0) {
      this.currentPrice = this.candles[this.candles.length - 1].close;
    }
  }

  updateTicker(tickerData) {
    if (tickerData.price) this.currentPrice = parseFloat(tickerData.price);
    if (tickerData.bestBidPrice) this.bestBid = parseFloat(tickerData.bestBidPrice);
    if (tickerData.bestAskPrice) this.bestAsk = parseFloat(tickerData.bestAskPrice);
    if (tickerData.priceChgPct) this.priceChange24h = parseFloat(tickerData.priceChgPct) * 100;
    if (tickerData.vol24h) this.volume24h = parseFloat(tickerData.vol24h);
  }

  getIndicators() {
    if (this.candles.length < 50) {
      return {
        price: this.currentPrice,
        rsi: 50,
        williamsR: -50,
        atr: 0,
        atrPercent: 0,
        ao: 0,
        macd: 0,
        macdSignal: 0,
        macdHistogram: 0,
        ema50: this.currentPrice,
        ema200: this.currentPrice,
        bollingerUpper: this.currentPrice,
        bollingerMiddle: this.currentPrice,
        bollingerLower: this.currentPrice,
        stochK: 50,
        stochD: 50
      };
    }

    const closes = this.candles.map(c => c.close);
    const highs = this.candles.map(c => c.high);
    const lows = this.candles.map(c => c.low);

    const macdData = TechnicalIndicators.calculateMACD(closes);
    const bbData = TechnicalIndicators.calculateBollingerBands(closes);
    const stochData = TechnicalIndicators.calculateStochastic(highs, lows, closes);
    const atr = TechnicalIndicators.calculateATR(highs, lows, closes, 14);
    const atrPercent = TechnicalIndicators.calculateATRPercent(highs, lows, closes, 14);

    return {
      price: this.currentPrice,
      rsi: TechnicalIndicators.calculateRSI(closes, 14),
      williamsR: TechnicalIndicators.calculateWilliamsR(highs, lows, closes, 14),
      atr: atr,
      atrPercent: atrPercent,
      ao: TechnicalIndicators.calculateAO(highs, lows, 5, 34),
      macd: macdData.macd,
      macdSignal: macdData.signal,
      macdHistogram: macdData.histogram,
      ema50: TechnicalIndicators.calculateEMA(closes, 50) || this.currentPrice,
      ema200: TechnicalIndicators.calculateEMA(closes, Math.min(200, closes.length)) || this.currentPrice,
      bollingerUpper: bbData.upper,
      bollingerMiddle: bbData.middle,
      bollingerLower: bbData.lower,
      stochK: stochData.k,
      stochD: stochData.d
    };
  }

  generateSignal() {
    const indicators = this.getIndicators();
    return SignalGenerator.generate(indicators);
  }

  getMarketData() {
    return {
      symbol: this.symbol,
      price: this.currentPrice,
      priceChange24h: this.priceChange24h,
      volume24h: this.volume24h,
      bestBid: this.bestBid,
      bestAsk: this.bestAsk
    };
  }

  /**
   * V3.5 NEW: Calculate recommended leverage based on ATR volatility
   */
  getRecommendedLeverage(riskMultiplier = 1.0) {
    const indicators = this.getIndicators();
    return TradeMath.calculateAutoLeverage(indicators.atrPercent, riskMultiplier);
  }
}

// ============================================================================
// V3.5: POSITION MANAGER - ENHANCED WITH PDF FORMULAS
// ============================================================================
class PositionManager {
  constructor(positionData, api) {
    this.api = api;
    this.symbol = positionData.symbol;
    this.side = positionData.side; // 'long' or 'short'
    this.size = positionData.size;
    this.leverage = positionData.leverage || CONFIG.TRADING.DEFAULT_LEVERAGE;
    this.entryPrice = positionData.entryPrice;
    this.currentPrice = positionData.currentPrice || positionData.entryPrice;
    
    // V3.5: Enhanced position tracking
    this.positionValueUSD = positionData.positionValueUSD || (this.size * this.entryPrice * (contractSpecs[this.symbol]?.multiplier || 1));
    this.marginUsed = positionData.marginUsed || (this.positionValueUSD / this.leverage);
    
    // V3.5: Fee tracking
    this.entryFee = positionData.entryFee || CONFIG.TRADING.TAKER_FEE;
    this.exitFee = positionData.exitFee || CONFIG.TRADING.TAKER_FEE;
    this.accumulatedFundingFees = positionData.accumulatedFundingFees || 0;
    this.totalFeesEstimate = positionData.totalFeesEstimate || 0;
    
    // Order IDs
    this.entryOrderId = positionData.entryOrderId || null;
    this.slOrderId = positionData.slOrderId || null;
    this.tpOrderId = positionData.tpOrderId || null;
    this.tp1OrderId = positionData.tp1OrderId || null; // For partial TP
    
    // Stop Loss & Take Profit
    this.initialSL = positionData.initialSL;
    this.currentSL = positionData.currentSL || positionData.initialSL;
    this.takeProfit = positionData.takeProfit;
    this.tp1Price = positionData.tp1Price || null; // First partial TP
    
    // V3.5: Liquidation price
    this.liquidationPrice = positionData.liquidationPrice || this.calculateLiquidationPrice();
    
    // V3.5: Fee-adjusted break-even threshold
    this.feeAdjustedBreakEvenROI = positionData.feeAdjustedBreakEvenROI || 
      TradeMath.calculateFeeAdjustedBreakEven(this.entryFee, this.exitFee, this.leverage, CONFIG.TRADING.BREAK_EVEN_BUFFER);
    
    // State tracking
    this.breakEvenTriggered = positionData.breakEvenTriggered || false;
    this.lastTrailingLevel = positionData.lastTrailingLevel || 0;
    this.trailingStepsCompleted = positionData.trailingStepsCompleted || 0;
    this.unrealizedPnl = 0;
    this.unrealizedPnlPercent = 0;
    this.netPnlEstimate = 0; // After fees
    
    // V3.5: Partial TP tracking
    this.partialTPTriggered = positionData.partialTPTriggered || false;
    this.remainingSize = positionData.remainingSize || this.size;
    
    // V3.5: Safety flags
    this.stopOrderFailed = positionData.stopOrderFailed || false;
    
    // Timestamps
    this.openedAt = positionData.openedAt || Date.now();
    this.updatedAt = Date.now();
    
    // Status: 'pending', 'open', 'closing', 'closed'
    this.status = positionData.status || 'pending';
  }

  calculateLiquidationPrice() {
    const maintMargin = contractSpecs[this.symbol]?.maintMargin || CONFIG.TRADING.MAINTENANCE_MARGIN_PERCENT;
    return TradeMath.calculateLiquidationPrice(this.side, this.entryPrice, this.leverage, maintMargin);
  }

  async updatePrice(currentPrice) {
    this.currentPrice = currentPrice;
    this.updatedAt = Date.now();

    // ========================================================================
    // V3.5: LEVERAGED P&L CALCULATION WITH FEE ESTIMATES
    // ========================================================================
    const priceDiff = TradeMath.calculatePriceDiff(this.side, this.entryPrice, currentPrice);
    const contractMultiplier = contractSpecs[this.symbol]?.multiplier || 1;
    
    // Gross unrealized P&L
    this.unrealizedPnl = TradeMath.calculateUnrealizedPnl(priceDiff, this.remainingSize, contractMultiplier);
    
    // Leveraged P&L % (ROI on margin)
    this.unrealizedPnlPercent = TradeMath.calculateLeveragedPnlPercent(this.unrealizedPnl, this.marginUsed);
    
    // V3.5: Estimate net P&L after fees
    this.totalFeesEstimate = TradeMath.calculateTotalFees(
      this.positionValueUSD, 
      this.entryFee, 
      this.exitFee
    ) + this.accumulatedFundingFees;
    
    this.netPnlEstimate = this.unrealizedPnl - this.totalFeesEstimate;

    // Only manage SL/TP if position is open
    if (this.status !== 'open') return this.toJSON();

    // ========================================================================
    // V3.5: FEE-ADJUSTED BREAK-EVEN TRIGGER
    // ========================================================================
    // Only trigger break-even when ROI exceeds fees + buffer
    if (!this.breakEvenTriggered && this.unrealizedPnlPercent > this.feeAdjustedBreakEvenROI) {
      await this.moveToBreakEven();
    }

    // ========================================================================
    // V3.5: ENHANCED TRAILING STOP
    // ========================================================================
    if (this.breakEvenTriggered) {
      await this.executeTrailingStop();
    }

    // Check if SL hit
    const slHit = this.side === 'long'
      ? currentPrice <= this.currentSL
      : currentPrice >= this.currentSL;

    if (slHit) {
      await this.closePosition('Stop Loss Hit');
    }

    // Check if TP hit
    const tpHit = this.side === 'long'
      ? currentPrice >= this.takeProfit
      : currentPrice <= this.takeProfit;

    if (tpHit) {
      await this.closePosition('Take Profit Hit');
    }

    // V3.5: Check partial TP
    if (CONFIG.TRADING.ENABLE_PARTIAL_TP && !this.partialTPTriggered && this.tp1Price) {
      const tp1Hit = this.side === 'long'
        ? currentPrice >= this.tp1Price
        : currentPrice <= this.tp1Price;
      
      if (tp1Hit) {
        await this.executePartialTakeProfit();
      }
    }

    return this.toJSON();
  }

  async moveToBreakEven() {
    broadcastLog('info', `[${this.symbol}] Moving SL to break-even at entry: ${this.entryPrice.toFixed(2)} (Fee-adjusted ROI threshold: ${this.feeAdjustedBreakEvenROI.toFixed(2)}%)`);
    
    this.currentSL = this.entryPrice;
    this.breakEvenTriggered = true;
    this.lastTrailingLevel = this.unrealizedPnlPercent;
    
    // Update SL order on KuCoin
    await this.updateStopLossOrder();
    
    broadcastAlert('breakeven', `${this.symbol} ${this.side.toUpperCase()} moved to break-even! (ROI: ${this.unrealizedPnlPercent.toFixed(2)}%)`);
    savePositions();
  }

  /**
   * V3.5: Enhanced trailing stop with multiple modes
   */
  async executeTrailingStop() {
    const trailingMode = CONFIG.TRADING.TRAILING_MODE;
    
    switch (trailingMode) {
      case 'staircase':
        await this.staircaseTrailing();
        break;
      case 'atr':
        await this.atrBasedTrailing();
        break;
      case 'dynamic':
        await this.dynamicTrailing();
        break;
      default:
        await this.staircaseTrailing();
    }
  }

  /**
   * Staircase trailing: discrete steps based on ROI increments
   * Formula: steps = floor((currentROI - lastROI) / stepPercent)
   */
  async staircaseTrailing() {
    const stepPercent = CONFIG.TRADING.TRAILING_STEP_PERCENT;
    const movePercent = CONFIG.TRADING.TRAILING_MOVE_PERCENT;
    
    const steps = TradeMath.calculateTrailingSteps(
      this.unrealizedPnlPercent,
      this.lastTrailingLevel,
      stepPercent
    );

    if (steps > 0) {
      const newSL = TradeMath.calculateTrailedStopLoss(this.side, this.currentSL, steps, movePercent);
      
      // Only move SL in favorable direction
      const shouldMove = this.side === 'long' ? newSL > this.currentSL : newSL < this.currentSL;

      if (shouldMove) {
        broadcastLog('info', `[${this.symbol}] Trailing SL: ${this.currentSL.toFixed(2)} → ${newSL.toFixed(2)} (${steps} steps, ROI: ${this.unrealizedPnlPercent.toFixed(2)}%)`);
        
        this.currentSL = newSL;
        this.lastTrailingLevel = this.unrealizedPnlPercent;
        this.trailingStepsCompleted += steps;
        
        await this.updateStopLossOrder();
        
        broadcastAlert('trailing', `${this.symbol} SL trailed to ${newSL.toFixed(2)}`);
        savePositions();
      }
    }
  }

  /**
   * V3.5 NEW: ATR-based trailing
   * Stop is placed at current price - (ATR × multiplier)
   */
  async atrBasedTrailing() {
    const manager = marketManagers[this.symbol];
    if (!manager) return;
    
    const indicators = manager.getIndicators();
    const atr = indicators.atr;
    const trailingDistance = TradeMath.calculateATRTrailingDistance(atr, CONFIG.TRADING.ATR_TRAILING_MULTIPLIER);
    
    let newSL;
    if (this.side === 'long') {
      newSL = this.currentPrice - trailingDistance;
      // Only move up
      if (newSL <= this.currentSL) return;
    } else {
      newSL = this.currentPrice + trailingDistance;
      // Only move down
      if (newSL >= this.currentSL) return;
    }
    
    broadcastLog('info', `[${this.symbol}] ATR Trailing: ${this.currentSL.toFixed(2)} → ${newSL.toFixed(2)} (ATR: ${atr.toFixed(2)})`);
    
    this.currentSL = newSL;
    this.lastTrailingLevel = this.unrealizedPnlPercent;
    
    await this.updateStopLossOrder();
    savePositions();
  }

  /**
   * V3.5 NEW: Dynamic trailing - smaller steps at low ROI, larger at high ROI
   */
  async dynamicTrailing() {
    let stepPercent, movePercent;
    
    if (this.unrealizedPnlPercent < 5) {
      stepPercent = 0.10;
      movePercent = 0.03;
    } else if (this.unrealizedPnlPercent < 20) {
      stepPercent = 0.15;
      movePercent = 0.05;
    } else {
      stepPercent = 0.25;
      movePercent = 0.10;
    }
    
    const steps = TradeMath.calculateTrailingSteps(
      this.unrealizedPnlPercent,
      this.lastTrailingLevel,
      stepPercent
    );

    if (steps > 0) {
      const newSL = TradeMath.calculateTrailedStopLoss(this.side, this.currentSL, steps, movePercent);
      const shouldMove = this.side === 'long' ? newSL > this.currentSL : newSL < this.currentSL;

      if (shouldMove) {
        broadcastLog('info', `[${this.symbol}] Dynamic Trailing: ${this.currentSL.toFixed(2)} → ${newSL.toFixed(2)} (ROI: ${this.unrealizedPnlPercent.toFixed(2)}%)`);
        
        this.currentSL = newSL;
        this.lastTrailingLevel = this.unrealizedPnlPercent;
        
        await this.updateStopLossOrder();
        savePositions();
      }
    }
  }

  /**
   * V3.5.2: Update stop loss order with validation, slippage buffer and retry queue
   */
  async updateStopLossOrder() {
    try {
      const specs = contractSpecs[this.symbol] || { tickSize: 0.1 };
      
      // V3.5: Apply slippage buffer
      const slippageAdjustedSL = TradeMath.calculateSlippageAdjustedStop(
        this.side,
        this.currentSL,
        CONFIG.TRADING.SLIPPAGE_BUFFER_PERCENT
      );
      
      const roundedSL = TradeMath.roundToTickSize(slippageAdjustedSL, specs.tickSize);

      // Cancel existing SL order
      const oldOrderId = this.slOrderId;
      if (oldOrderId) {
        try {
          await this.api.cancelStopOrder(oldOrderId);
        } catch (e) {
          // Order might already be cancelled or filled
        }
      }

      // V3.5.2: Build and validate stop order params
      const slSide = this.side === 'long' ? 'sell' : 'buy';
      let slParams = {
        clientOid: `sl_${this.symbol}_${Date.now()}`,
        side: slSide,
        symbol: this.symbol,
        type: 'market',
        stop: this.side === 'long' ? 'down' : 'up',
        stopPrice: roundedSL.toString(),
        stopPriceType: 'TP',
        size: this.remainingSize.toString(),
        reduceOnly: true
      };
      
      // V3.5.2: Validate and sanitize order
      OrderValidator.validateStopOrder(slParams);
      slParams = OrderValidator.sanitize(slParams, 'stop');

      const result = await this.api.placeStopOrder(slParams);
      if (result.data) {
        this.slOrderId = result.data.orderId;
        this.stopOrderFailed = false;
        broadcastLog('success', `[${this.symbol}] SL order updated: ${roundedSL.toFixed(2)} (with ${CONFIG.TRADING.SLIPPAGE_BUFFER_PERCENT}% slippage buffer)`);
      }
    } catch (error) {
      broadcastLog('error', `[${this.symbol}] Failed to update SL order: ${error.message}`);
      
      // V3.5: Add to retry queue
      retryQueueManager.add({
        type: 'update_stop_loss',
        symbol: this.symbol,
        existingOrderId: this.slOrderId,
        params: {
          clientOid: `sl_${this.symbol}_${Date.now()}`,
          side: this.side === 'long' ? 'sell' : 'buy',
          symbol: this.symbol,
          type: 'market',
          stop: this.side === 'long' ? 'down' : 'up',
          stopPrice: this.currentSL.toString(),
          stopPriceType: 'TP',
          size: this.remainingSize.toString(),
          reduceOnly: true
        }
      });
    }
  }

  /**
   * V3.5 NEW: Execute partial take profit (scaling out)
   */
  async executePartialTakeProfit() {
    if (this.partialTPTriggered) return;
    
    const closeSize = Math.floor(this.size * (CONFIG.TRADING.PARTIAL_TP_PERCENT / 100));
    if (closeSize < 1) return;
    
    broadcastLog('info', `[${this.symbol}] Executing partial TP: Closing ${closeSize} of ${this.size} lots at ${this.currentPrice.toFixed(2)}`);
    
    try {
      const closeSide = this.side === 'long' ? 'sell' : 'buy';
      let closeParams = {
        clientOid: `partial_tp_${this.symbol}_${Date.now()}`,
        side: closeSide,
        symbol: this.symbol,
        type: 'market',
        size: closeSize.toString(),
        reduceOnly: true
      };
      
      // V3.5.2: Validate and sanitize exit order
      OrderValidator.validateExitOrder(closeParams);
      closeParams = OrderValidator.sanitize(closeParams, 'exit');

      const result = await this.api.placeOrder(closeParams);
      
      if (result.data) {
        this.partialTPTriggered = true;
        this.remainingSize -= closeSize;
        
        // Move stop to break-even on remaining position
        if (!this.breakEvenTriggered) {
          this.currentSL = this.entryPrice;
          this.breakEvenTriggered = true;
          await this.updateStopLossOrder();
        }
        
        broadcastLog('success', `[${this.symbol}] Partial TP executed. Remaining: ${this.remainingSize} lots`);
        broadcastAlert('partial_tp', `${this.symbol} TP1 hit: Closed ${closeSize} lots`);
        savePositions();
      }
    } catch (error) {
      broadcastLog('error', `[${this.symbol}] Partial TP failed: ${error.message}`);
    }
  }

  async closePosition(reason) {
    if (this.status === 'closing' || this.status === 'closed') return;
    
    this.status = 'closing';
    broadcastLog('info', `[${this.symbol}] Closing position: ${reason}`);

    try {
      // Cancel all pending orders for this symbol
      try {
        await this.api.cancelAllStopOrders(this.symbol);
      } catch (e) {}

      // Place market order to close
      const closeSide = this.side === 'long' ? 'sell' : 'buy';
      let closeParams = {
        clientOid: `close_${this.symbol}_${Date.now()}`,
        side: closeSide,
        symbol: this.symbol,
        type: 'market',
        size: this.remainingSize.toString(),
        reduceOnly: true
      };
      
      // V3.5.2: Validate and sanitize exit order
      OrderValidator.validateExitOrder(closeParams);
      closeParams = OrderValidator.sanitize(closeParams, 'exit');

      const result = await this.api.placeOrder(closeParams);
      
      if (result.data) {
        this.status = 'closed';
        
        // Calculate final P&L with fees
        const finalNetPnl = TradeMath.calculateNetPnl(
          this.unrealizedPnl,
          this.positionValueUSD,
          this.entryFee,
          this.exitFee,
          this.accumulatedFundingFees
        );
        
        broadcastLog('success', `[${this.symbol}] Position closed.`);
        broadcastLog('success', `  Gross P&L: ${this.unrealizedPnl >= 0 ? '+' : ''}${this.unrealizedPnl.toFixed(2)} USDT (${this.unrealizedPnlPercent.toFixed(2)}% ROI)`);
        broadcastLog('success', `  Fees: ${this.totalFeesEstimate.toFixed(2)} USDT`);
        broadcastLog('success', `  Net P&L: ${finalNetPnl >= 0 ? '+' : ''}${finalNetPnl.toFixed(2)} USDT`);
        
        broadcastAlert('close', `${this.symbol} closed: ${finalNetPnl >= 0 ? '+' : ''}${finalNetPnl.toFixed(2)} USDT (net)`);
        
        // Remove from active positions
        activePositions.delete(this.symbol);
        savePositions();
        broadcastPositions();
      }
    } catch (error) {
      this.status = 'open'; // Revert status
      broadcastLog('error', `[${this.symbol}] Failed to close position: ${error.message}`);
    }
  }

  toJSON() {
    return {
      symbol: this.symbol,
      side: this.side,
      size: this.size,
      remainingSize: this.remainingSize,
      leverage: this.leverage,
      entryPrice: this.entryPrice,
      currentPrice: this.currentPrice,
      positionValueUSD: this.positionValueUSD,
      marginUsed: this.marginUsed,
      initialSL: this.initialSL,
      currentSL: this.currentSL,
      takeProfit: this.takeProfit,
      tp1Price: this.tp1Price,
      liquidationPrice: this.liquidationPrice,
      unrealizedPnl: this.unrealizedPnl,
      unrealizedPnlPercent: this.unrealizedPnlPercent,
      netPnlEstimate: this.netPnlEstimate,
      totalFeesEstimate: this.totalFeesEstimate,
      feeAdjustedBreakEvenROI: this.feeAdjustedBreakEvenROI,
      breakEvenTriggered: this.breakEvenTriggered,
      lastTrailingLevel: this.lastTrailingLevel,
      trailingStepsCompleted: this.trailingStepsCompleted,
      partialTPTriggered: this.partialTPTriggered,
      stopOrderFailed: this.stopOrderFailed,
      status: this.status,
      openedAt: this.openedAt,
      updatedAt: this.updatedAt,
      entryOrderId: this.entryOrderId,
      slOrderId: this.slOrderId,
      tpOrderId: this.tpOrderId
    };
  }
}

// ============================================================================
// POSITION PERSISTENCE
// ============================================================================
function savePositions() {
  try {
    const data = {};
    for (const [symbol, manager] of activePositions.entries()) {
      data[symbol] = manager.toJSON();
    }
    fs.writeFileSync(CONFIG.POSITIONS_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('[SAVE ERROR]', error.message);
  }
}

function loadPositions() {
  try {
    if (fs.existsSync(CONFIG.POSITIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG.POSITIONS_FILE, 'utf8'));
      for (const [symbol, posData] of Object.entries(data)) {
        if (posData.status !== 'closed') {
          const manager = new PositionManager(posData, kucoinAPI);
          activePositions.set(symbol, manager);
          broadcastLog('info', `[RESTORE] Loaded position: ${symbol} ${posData.side} @ ${posData.entryPrice}`);
        }
      }
    }
  } catch (error) {
    console.error('[LOAD ERROR]', error.message);
  }
}

// ============================================================================
// BROADCAST FUNCTIONS
// ============================================================================
function broadcast(message) {
  const str = JSON.stringify(message);
  wsClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(str);
    }
  });
}

function broadcastLog(type, message, data = null) {
  const log = {
    id: Date.now() + Math.random(),
    timestamp: new Date().toISOString(),
    type,
    message,
    data
  };
  console.log(`[${type.toUpperCase()}] ${message}`);
  broadcast({ type: 'log', log });
}

function broadcastAlert(alertType, message) {
  broadcast({ type: 'alert', alertType, message, timestamp: Date.now() });
}

function broadcastMarketData(symbol) {
  if (!marketManagers[symbol]) return;
  
  const manager = marketManagers[symbol];
  const indicators = manager.getIndicators();
  const signal = manager.generateSignal();
  const marketData = manager.getMarketData();
  
  // V3.5: Include recommended leverage
  const recommendedLeverage = manager.getRecommendedLeverage(1.0);
  
  broadcast({
    type: 'market_update',
    symbol,
    marketData,
    indicators,
    signal,
    orderBook: orderBooks[symbol] || { bids: [], asks: [] },
    fundingRate: fundingRates[symbol] || { rate: 0, predictedRate: 0 },
    contractSpecs: contractSpecs[symbol] || null,
    recommendedLeverage,
    tradingConfig: {
      slROI: CONFIG.TRADING.INITIAL_SL_ROI,
      tpROI: CONFIG.TRADING.INITIAL_TP_ROI,
      makerFee: CONFIG.TRADING.MAKER_FEE,
      takerFee: CONFIG.TRADING.TAKER_FEE,
      slippageBuffer: CONFIG.TRADING.SLIPPAGE_BUFFER_PERCENT
    }
  });
}

function broadcastPositions() {
  const positions = [];
  for (const [symbol, manager] of activePositions.entries()) {
    positions.push(manager.toJSON());
  }
  broadcast({ type: 'positions', data: positions });
}

function broadcastBalance(data) {
  accountBalance = parseFloat(data.accountEquity) || 0;
  broadcast({ type: 'balance', data });
}

function broadcastInitialState(ws) {
  const symbols = Object.keys(marketManagers);
  const marketData = {};
  const indicators = {};
  const signals = {};
  const recommendedLeverages = {};

  symbols.forEach(symbol => {
    const manager = marketManagers[symbol];
    marketData[symbol] = manager.getMarketData();
    indicators[symbol] = manager.getIndicators();
    signals[symbol] = manager.generateSignal();
    recommendedLeverages[symbol] = manager.getRecommendedLeverage(1.0);
  });

  const positions = [];
  for (const [symbol, manager] of activePositions.entries()) {
    positions.push(manager.toJSON());
  }

  ws.send(JSON.stringify({
    type: 'initial_state',
    symbols,
    marketData,
    indicators,
    signals,
    orderBooks,
    fundingRates,
    positions,
    accountBalance,
    recommendedLeverages,
    config: {
      trading: CONFIG.TRADING,
      timeframes: Object.keys(CONFIG.TIMEFRAMES),
      currentTimeframe,
      version: '3.6.0'
    }
  }));
}

// ============================================================================
// DATA FETCHING
// ============================================================================
async function fetchContractSpecs(symbol) {
  try {
    const response = await kucoinAPI.getContractDetail(symbol);
    if (response.data) {
      contractSpecs[symbol] = {
        tickSize: parseFloat(response.data.tickSize),
        lotSize: parseFloat(response.data.lotSize),
        multiplier: parseFloat(response.data.multiplier),
        maxLeverage: response.data.maxLeverage,
        minOrderQty: parseFloat(response.data.minOrderQty || 1),
        maxOrderQty: parseFloat(response.data.maxOrderQty || 1000000),
        maintMargin: parseFloat(response.data.maintMarginRate || 0.005) * 100 // Convert to percentage
      };
      broadcastLog('info', `[${symbol}] Contract: tickSize=${contractSpecs[symbol].tickSize}, lotSize=${contractSpecs[symbol].lotSize}, multiplier=${contractSpecs[symbol].multiplier}, maintMargin=${contractSpecs[symbol].maintMargin}%`);
      return contractSpecs[symbol];
    }
  } catch (error) {
    broadcastLog('warn', `Failed to fetch contract specs for ${symbol}: ${error.message}`);
  }
  return null;
}

async function fetchKlines(symbol, timeframe = currentTimeframe) {
  try {
    const granularity = CONFIG.TIMEFRAMES[timeframe] || 5;
    const to = Date.now();
    const from = to - (granularity * 500 * 60 * 1000);
    
    const response = await kucoinAPI.getKlines(symbol, granularity, from, to);
    
    if (response.data && response.data.length > 0) {
      if (!marketManagers[symbol]) {
        marketManagers[symbol] = new MarketDataManager(symbol);
      }
      marketManagers[symbol].loadCandles(response.data);
      return response.data.length;
    }
    return 0;
  } catch (error) {
    broadcastLog('error', `Failed to fetch klines for ${symbol}: ${error.message}`);
    return 0;
  }
}

async function fetchTicker(symbol) {
  try {
    const response = await kucoinAPI.getTicker(symbol);
    if (response.data) {
      if (!marketManagers[symbol]) {
        marketManagers[symbol] = new MarketDataManager(symbol);
      }
      marketManagers[symbol].updateTicker(response.data);
      return response.data;
    }
  } catch (error) {
    broadcastLog('error', `Failed to fetch ticker for ${symbol}: ${error.message}`);
  }
  return null;
}

async function fetchOrderBook(symbol) {
  try {
    const response = await kucoinAPI.getOrderBook(symbol, 20);
    if (response.data) {
      orderBooks[symbol] = {
        bids: response.data.bids || [],
        asks: response.data.asks || [],
        timestamp: Date.now()
      };
      return orderBooks[symbol];
    }
  } catch (error) {
    broadcastLog('error', `Failed to fetch order book for ${symbol}: ${error.message}`);
  }
  return null;
}

async function fetchFundingRate(symbol) {
  try {
    const response = await kucoinAPI.getFundingRate(symbol);
    if (response.data) {
      fundingRates[symbol] = {
        rate: parseFloat(response.data.value),
        predictedRate: parseFloat(response.data.predictedValue || 0),
        timestamp: Date.now()
      };
      return fundingRates[symbol];
    }
  } catch (error) {
    // Funding rate might not be available for all contracts
  }
  return null;
}

async function fetchAccountBalance() {
  try {
    const response = await kucoinAPI.getAccountOverview('USDT');
    if (response.data) {
      broadcastBalance(response.data);
      return response.data;
    }
  } catch (error) {
    broadcastLog('error', `Failed to fetch balance: ${error.message}`);
  }
  return null;
}

async function initializeSymbol(symbol) {
  broadcastLog('info', `Initializing ${symbol}...`);
  
  if (!marketManagers[symbol]) {
    marketManagers[symbol] = new MarketDataManager(symbol);
  }
  
  await fetchContractSpecs(symbol);
  const candleCount = await fetchKlines(symbol);
  await fetchTicker(symbol);
  await fetchOrderBook(symbol);
  await fetchFundingRate(symbol);
  
  broadcastLog('success', `${symbol}: Loaded ${candleCount} candles`);
  broadcastMarketData(symbol);
  
  broadcastSymbolList();
}

function broadcastSymbolList() {
  const symbols = Object.keys(marketManagers);
  broadcast({
    type: 'symbols_updated',
    symbols: symbols
  });
}

async function initializeAllSymbols() {
  broadcastLog('info', 'Initializing market data...');
  
  for (const symbol of CONFIG.DEFAULT_SYMBOLS) {
    await initializeSymbol(symbol);
    await sleep(200);
  }
  
  broadcastLog('success', 'All symbols initialized');
}

// ============================================================================
// V3.5: ORDER EXECUTION WITH ENHANCED CALCULATIONS
// ============================================================================
async function executeEntry(symbol, side, positionSizePercent = CONFIG.TRADING.POSITION_SIZE_PERCENT, leverage = CONFIG.TRADING.DEFAULT_LEVERAGE) {
  // Check max positions
  if (activePositions.size >= CONFIG.TRADING.MAX_POSITIONS) {
    broadcastLog('error', `Max positions (${CONFIG.TRADING.MAX_POSITIONS}) reached. Cannot open new position.`);
    return { success: false, error: 'Max positions reached' };
  }

  // Check if already have position in this symbol
  if (activePositions.has(symbol)) {
    broadcastLog('error', `Already have an open position in ${symbol}`);
    return { success: false, error: 'Position already exists' };
  }

  // Get order book for entry price
  const ob = orderBooks[symbol];
  if (!ob || !ob.bids || !ob.asks || ob.bids.length < 10 || ob.asks.length < 10) {
    await fetchOrderBook(symbol);
  }

  const orderBook = orderBooks[symbol];
  if (!orderBook) {
    broadcastLog('error', `No order book data for ${symbol}`);
    return { success: false, error: 'No order book data' };
  }

  // Get 9th level price for entry
  const entryPrice = side === 'long'
    ? parseFloat(orderBook.bids[8][0])
    : parseFloat(orderBook.asks[8][0]);

  // Get contract specs
  let specs = contractSpecs[symbol];
  if (!specs) {
    specs = await fetchContractSpecs(symbol);
  }
  if (!specs) {
    broadcastLog('error', `No contract specs for ${symbol}`);
    return { success: false, error: 'No contract specs' };
  }

  // ========================================================================
  // V3.5: POSITION SIZING WITH FEE CONSIDERATION
  // ========================================================================
  const marginUsed = TradeMath.calculateMarginUsed(accountBalance, positionSizePercent);
  const positionValueUSD = TradeMath.calculatePositionValue(marginUsed, leverage);
  
  // Calculate estimated fees
  const entryFee = CONFIG.TRADING.TAKER_FEE;
  const exitFee = CONFIG.TRADING.TAKER_FEE;
  const estimatedTotalFees = TradeMath.calculateTotalFees(positionValueUSD, entryFee, exitFee);
  
  // Contract size
  const contractValue = entryPrice * specs.multiplier;
  let size = TradeMath.calculateLotSize(positionValueUSD, entryPrice, specs.multiplier);
  
  // Round to lot size
  const lotSize = specs.lotSize || 1;
  size = TradeMath.roundToLotSize(size, lotSize);
  
  // Calculate actual values after rounding
  const actualPositionValueUSD = size * contractValue;
  const actualMarginUsed = actualPositionValueUSD / leverage;
  
  if (size < lotSize) {
    broadcastLog('error', `Position size too small. Calculated: ${size} lots`);
    broadcastLog('error', `Margin: $${marginUsed.toFixed(2)} → Position Value: $${positionValueUSD.toFixed(2)} @ ${leverage}x`);
    return { success: false, error: 'Position size too small' };
  }

  // ========================================================================
  // V3.5: ROI-BASED SL & TP CALCULATION
  // ========================================================================
  const slROI = CONFIG.TRADING.INITIAL_SL_ROI;
  const tpROI = CONFIG.TRADING.INITIAL_TP_ROI;
  
  const stopLoss = TradeMath.calculateStopLossPrice(side, entryPrice, slROI, leverage);
  const takeProfit = TradeMath.calculateTakeProfitPrice(side, entryPrice, tpROI, leverage);
  
  // V3.5: Calculate liquidation price
  const maintMargin = specs.maintMargin || CONFIG.TRADING.MAINTENANCE_MARGIN_PERCENT;
  const liquidationPrice = TradeMath.calculateLiquidationPrice(side, entryPrice, leverage, maintMargin);
  
  // V3.5: Calculate fee-adjusted break-even threshold
  const feeAdjustedBreakEven = TradeMath.calculateFeeAdjustedBreakEven(entryFee, exitFee, leverage, CONFIG.TRADING.BREAK_EVEN_BUFFER);
  
  // V3.5: Calculate partial TP price if enabled
  let tp1Price = null;
  if (CONFIG.TRADING.ENABLE_PARTIAL_TP) {
    tp1Price = TradeMath.calculateTakeProfitPrice(side, entryPrice, CONFIG.TRADING.TP1_ROI, leverage);
  }

  // Round prices to tick size
  const tickSize = specs.tickSize;
  const roundedEntry = TradeMath.roundToTickSize(entryPrice, tickSize);
  const roundedSL = TradeMath.roundToTickSize(stopLoss, tickSize);
  const roundedTP = TradeMath.roundToTickSize(takeProfit, tickSize);

  // Price percentages for display
  const slPricePercent = ((slROI / leverage)).toFixed(3);
  const tpPricePercent = ((tpROI / leverage)).toFixed(3);

  broadcastLog('info', `[${this.symbol || symbol}] Placing ${side.toUpperCase()} order...`);
  broadcastLog('info', `  Entry: ${roundedEntry.toFixed(5)} | Size: ${size} lots ($${actualPositionValueUSD.toFixed(2)} @ ${leverage}x)`);
  broadcastLog('info', `  Margin Used: $${actualMarginUsed.toFixed(2)} | Total Exposure: $${actualPositionValueUSD.toFixed(2)}`);
  broadcastLog('info', `  SL: ${roundedSL.toFixed(5)} (${slROI}% ROI = ${slPricePercent}% price)`);
  broadcastLog('info', `  TP: ${roundedTP.toFixed(5)} (${tpROI}% ROI = ${tpPricePercent}% price)`);
  broadcastLog('info', `  Liquidation: ${liquidationPrice.toFixed(2)} | Fee-Adj Break-Even: ${feeAdjustedBreakEven.toFixed(2)}% ROI`);
  broadcastLog('info', `  Est. Fees: $${estimatedTotalFees.toFixed(4)} (entry + exit)`);

  try {
    // Place entry order
    const entryParams = {
      clientOid: `entry_${symbol}_${Date.now()}`,
      side: side === 'long' ? 'buy' : 'sell',
      symbol: symbol,
      type: 'limit',
      price: roundedEntry.toString(),
      size: size.toString(),
      leverage: leverage.toString(),
      timeInForce: 'GTC'
    };

    broadcastLog('info', `  Order params: ${JSON.stringify(entryParams)}`);
    
    const entryResult = await kucoinAPI.placeOrder(entryParams);
    
    if (!entryResult.data || !entryResult.data.orderId) {
      throw new Error('No order ID returned from KuCoin');
    }

    const entryOrderId = entryResult.data.orderId;
    broadcastLog('success', `[${symbol}] Entry order placed: ${entryOrderId}`);

    // V3.5.2: Place SL order with slippage buffer and validation
    const slippageAdjustedSL = TradeMath.calculateSlippageAdjustedStop(side, roundedSL, CONFIG.TRADING.SLIPPAGE_BUFFER_PERCENT);
    const finalSL = TradeMath.roundToTickSize(slippageAdjustedSL, tickSize);
    
    const slSide = side === 'long' ? 'sell' : 'buy';
    let slParams = {
      clientOid: `sl_${symbol}_${Date.now()}`,
      side: slSide,
      symbol: symbol,
      type: 'market',
      stop: side === 'long' ? 'down' : 'up',
      stopPrice: finalSL.toString(),
      stopPriceType: 'TP',
      size: size.toString(),
      reduceOnly: true
    };
    
    // V3.5.2: Validate and sanitize stop order
    OrderValidator.validateStopOrder(slParams);
    slParams = OrderValidator.sanitize(slParams, 'stop');

    let slOrderId = null;
    try {
      const slResult = await kucoinAPI.placeStopOrder(slParams);
      if (slResult.data) {
        slOrderId = slResult.data.orderId;
        broadcastLog('success', `[${symbol}] SL order placed: ${slOrderId} (with slippage buffer)`);
      }
    } catch (slError) {
      broadcastLog('warn', `[${symbol}] Failed to place SL order: ${slError.message}`);
      // Add to retry queue
      retryQueueManager.add({
        type: 'update_stop_loss',
        symbol: symbol,
        params: slParams
      });
    }

    // V3.5.2: Place TP order with validation
    const tpSide = side === 'long' ? 'sell' : 'buy';
    let tpParams = {
      clientOid: `tp_${symbol}_${Date.now()}`,
      side: tpSide,
      symbol: symbol,
      type: 'limit',
      price: roundedTP.toString(),
      size: size.toString(),
      reduceOnly: true,
      timeInForce: 'GTC'
    };
    
    // V3.5.2: Validate and sanitize exit order
    OrderValidator.validateExitOrder(tpParams);
    tpParams = OrderValidator.sanitize(tpParams, 'exit');

    let tpOrderId = null;
    try {
      const tpResult = await kucoinAPI.placeOrder(tpParams);
      if (tpResult.data) {
        tpOrderId = tpResult.data.orderId;
        broadcastLog('success', `[${symbol}] TP order placed: ${tpOrderId}`);
      }
    } catch (tpError) {
      broadcastLog('warn', `[${symbol}] Failed to place TP order: ${tpError.message}`);
    }

    // Create position manager
    const positionData = {
      symbol,
      side,
      size,
      remainingSize: size,
      leverage: leverage,
      entryPrice: roundedEntry,
      currentPrice: roundedEntry,
      positionValueUSD: actualPositionValueUSD,
      marginUsed: actualMarginUsed,
      initialSL: roundedSL,
      currentSL: roundedSL,
      takeProfit: roundedTP,
      tp1Price: tp1Price ? TradeMath.roundToTickSize(tp1Price, tickSize) : null,
      liquidationPrice: liquidationPrice,
      feeAdjustedBreakEvenROI: feeAdjustedBreakEven,
      entryFee: entryFee,
      exitFee: exitFee,
      totalFeesEstimate: estimatedTotalFees,
      entryOrderId,
      slOrderId,
      tpOrderId,
      status: 'pending'
    };

    const manager = new PositionManager(positionData, kucoinAPI);
    activePositions.set(symbol, manager);
    savePositions();
    broadcastPositions();

    broadcastAlert('entry', `${symbol} ${side.toUpperCase()} entry placed @ ${roundedEntry.toFixed(2)} (${leverage}x)`);

    return {
      success: true,
      data: positionData
    };

  } catch (error) {
    const errorMsg = error.response?.data?.msg || error.message || 'Unknown error';
    const errorCode = error.response?.data?.code || 'N/A';
    broadcastLog('error', `[${symbol}] Order failed: ${errorMsg}`);
    broadcastLog('error', `  Error code: ${errorCode}`);
    if (error.response?.data) {
      broadcastLog('error', `  Full response: ${JSON.stringify(error.response.data)}`);
    }
    return { success: false, error: errorMsg };
  }
}

// ============================================================================
// WEBSOCKET HANDLERS
// ============================================================================
wss.on('connection', async (ws) => {
  console.log('[WS] Client connected');
  wsClients.add(ws);
  broadcastLog('success', 'Dashboard connected (V3.5.1)');

  broadcastInitialState(ws);
  await fetchAccountBalance();

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'place_order':
          await executeEntry(data.symbol, data.side, data.positionSize || CONFIG.TRADING.POSITION_SIZE_PERCENT, data.leverage || CONFIG.TRADING.DEFAULT_LEVERAGE);
          break;

        case 'close_position':
          const manager = activePositions.get(data.symbol);
          if (manager) {
            await manager.closePosition('Manual close');
          } else {
            broadcastLog('warn', `No position found for ${data.symbol}`);
          }
          break;

        case 'add_symbol':
          if (data.symbol && !marketManagers[data.symbol]) {
            await initializeSymbol(data.symbol.toUpperCase());
          } else if (marketManagers[data.symbol]) {
            broadcastLog('warn', `${data.symbol} already loaded`);
          }
          break;

        case 'remove_symbol':
          if (data.symbol && marketManagers[data.symbol]) {
            delete marketManagers[data.symbol];
            delete orderBooks[data.symbol];
            delete fundingRates[data.symbol];
            delete contractSpecs[data.symbol];
            broadcastLog('info', `Removed ${data.symbol}`);
            broadcastSymbolList();
          }
          break;

        case 'change_timeframe':
          if (CONFIG.TIMEFRAMES[data.timeframe]) {
            currentTimeframe = data.timeframe;
            broadcastLog('info', `Timeframe changed to ${data.timeframe}`);
            for (const symbol of Object.keys(marketManagers)) {
              await fetchKlines(symbol, data.timeframe);
              broadcastMarketData(symbol);
            }
          }
          break;

        case 'get_balance':
          await fetchAccountBalance();
          break;

        case 'refresh_data':
          if (data.symbol) {
            await fetchTicker(data.symbol);
            await fetchOrderBook(data.symbol);
            broadcastMarketData(data.symbol);
          }
          break;

        case 'update_config':
          // V3.5: Allow runtime config updates
          if (data.config) {
            Object.assign(CONFIG.TRADING, data.config);
            broadcastLog('info', `Config updated: ${JSON.stringify(data.config)}`);
          }
          break;
      }

    } catch (error) {
      broadcastLog('error', `Message error: ${error.message}`);
    }
  });

  ws.on('close', () => {
    console.log('[WS] Client disconnected');
    wsClients.delete(ws);
  });

  ws.on('error', (error) => {
    console.error('[WS] Error:', error.message);
    wsClients.delete(ws);
  });
});

// ============================================================================
// HTTP API ENDPOINTS
// ============================================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '3.6.0',
    uptime: process.uptime(),
    symbols: Object.keys(marketManagers).length,
    positions: activePositions.size,
    clients: wsClients.size,
    retryQueueLength: retryQueueManager.queue.length
  });
});

app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    version: '3.6.0',
    symbols: Object.keys(marketManagers),
    positions: activePositions.size,
    balance: accountBalance,
    timeframe: currentTimeframe,
    config: CONFIG.TRADING
  });
});

app.get('/api/symbols', (req, res) => {
  res.json({
    active: Object.keys(marketManagers),
    available: CONFIG.DEFAULT_SYMBOLS
  });
});

app.get('/api/market/:symbol', (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  if (!marketManagers[symbol]) {
    return res.status(404).json({ error: 'Symbol not found' });
  }
  
  const manager = marketManagers[symbol];
  const indicators = manager.getIndicators();
  
  res.json({
    marketData: manager.getMarketData(),
    indicators,
    signal: manager.generateSignal(),
    orderBook: orderBooks[symbol],
    fundingRate: fundingRates[symbol],
    recommendedLeverage: manager.getRecommendedLeverage(1.0),
    tradingConfig: CONFIG.TRADING
  });
});

app.get('/api/positions', (req, res) => {
  const positions = [];
  for (const [symbol, manager] of activePositions.entries()) {
    positions.push(manager.toJSON());
  }
  res.json(positions);
});

app.get('/api/config', (req, res) => {
  res.json({
    trading: CONFIG.TRADING,
    api: {
      retryAttempts: CONFIG.API.RETRY_ATTEMPTS,
      rateLimitDelay: CONFIG.API.RATE_LIMIT_DELAY_MS
    }
  });
});

app.post('/api/config', (req, res) => {
  const { config } = req.body;
  if (config) {
    Object.assign(CONFIG.TRADING, config);
    broadcastLog('info', `Config updated via API: ${JSON.stringify(config)}`);
    res.json({ success: true, config: CONFIG.TRADING });
  } else {
    res.status(400).json({ error: 'No config provided' });
  }
});

app.post('/api/symbols/add', async (req, res) => {
  const { symbol } = req.body;
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }
  
  const sym = symbol.toUpperCase();
  if (marketManagers[sym]) {
    return res.json({ success: true, message: 'Symbol already loaded' });
  }
  
  await initializeSymbol(sym);
  res.json({ success: true, symbol: sym });
});

app.post('/api/symbols/remove', (req, res) => {
  const { symbol } = req.body;
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }
  
  const sym = symbol.toUpperCase();
  if (marketManagers[sym]) {
    delete marketManagers[sym];
    delete orderBooks[sym];
    delete fundingRates[sym];
  }
  res.json({ success: true });
});

app.post('/api/timeframe', async (req, res) => {
  const { timeframe } = req.body;
  if (!CONFIG.TIMEFRAMES[timeframe]) {
    return res.status(400).json({ error: 'Invalid timeframe' });
  }
  
  currentTimeframe = timeframe;
  
  for (const symbol of Object.keys(marketManagers)) {
    await fetchKlines(symbol, timeframe);
    broadcastMarketData(symbol);
  }
  
  broadcast({ type: 'timeframe_changed', timeframe });
  res.json({ success: true, timeframe });
});

app.post('/api/order', async (req, res) => {
  const { symbol, side, positionSize, leverage } = req.body;
  
  if (!symbol || !side) {
    return res.status(400).json({ error: 'Symbol and side required' });
  }
  
  const result = await executeEntry(symbol.toUpperCase(), side.toLowerCase(), positionSize, leverage);
  res.json(result);
});

app.post('/api/close', async (req, res) => {
  const { symbol } = req.body;
  
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol required' });
  }
  
  const manager = activePositions.get(symbol.toUpperCase());
  if (!manager) {
    return res.status(404).json({ error: 'Position not found' });
  }
  
  await manager.closePosition('Manual close via API');
  res.json({ success: true });
});

app.get('/api/contracts', async (req, res) => {
  try {
    const response = await kucoinAPI.getContracts();
    const symbols = response.data
      .filter(c => c.quoteCurrency === 'USDT' && c.status === 'Open')
      .map(c => c.symbol)
      .sort();
    res.json(symbols);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// V3.5: Math calculation endpoint for testing
app.post('/api/calculate', (req, res) => {
  const { type, params } = req.body;
  
  try {
    let result;
    switch (type) {
      case 'position_size':
        result = {
          marginUsed: TradeMath.calculateMarginUsed(params.balance, params.percent),
          positionValue: TradeMath.calculatePositionValue(
            TradeMath.calculateMarginUsed(params.balance, params.percent),
            params.leverage
          )
        };
        break;
      case 'stop_loss':
        result = TradeMath.calculateStopLossPrice(params.side, params.entry, params.roi, params.leverage);
        break;
      case 'take_profit':
        result = TradeMath.calculateTakeProfitPrice(params.side, params.entry, params.roi, params.leverage);
        break;
      case 'liquidation':
        result = TradeMath.calculateLiquidationPrice(params.side, params.entry, params.leverage, params.maintMargin);
        break;
      case 'fee_adjusted_breakeven':
        result = TradeMath.calculateFeeAdjustedBreakEven(params.entryFee, params.exitFee, params.leverage, params.buffer);
        break;
      default:
        return res.status(400).json({ error: 'Unknown calculation type' });
    }
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// OPTIMIZER API ENDPOINTS
// ============================================================================
app.get('/api/optimizer/status', (req, res) => {
  try {
    if (!CONFIG.OPTIMIZER.ENABLED) {
      return res.json({ 
        enabled: false, 
        message: 'Optimizer is disabled. Set OPTIMIZER_ENABLED=true to enable.' 
      });
    }
    
    if (!optimizerController) {
      return res.json({ 
        enabled: true, 
        running: false, 
        message: 'Optimizer is not initialized' 
      });
    }
    
    const status = optimizerController.getStatus();
    res.json({ 
      enabled: true, 
      ...status 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/optimizer/results', (req, res) => {
  try {
    if (!CONFIG.OPTIMIZER.ENABLED || !optimizerController) {
      return res.status(400).json({ error: 'Optimizer is not enabled or initialized' });
    }
    
    const results = optimizerController.getResults();
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/optimizer/start', async (req, res) => {
  try {
    if (!CONFIG.OPTIMIZER.ENABLED) {
      return res.status(400).json({ error: 'Optimizer is disabled' });
    }
    
    if (!optimizerController) {
      return res.status(400).json({ error: 'Optimizer is not initialized' });
    }
    
    const options = req.body || {};
    const result = await optimizerController.start(options);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/optimizer/stop', async (req, res) => {
  try {
    if (!CONFIG.OPTIMIZER.ENABLED || !optimizerController) {
      return res.status(400).json({ error: 'Optimizer is not enabled or initialized' });
    }
    
    const result = await optimizerController.stop();
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/optimizer/promote', async (req, res) => {
  try {
    if (!CONFIG.OPTIMIZER.ENABLED || !optimizerController) {
      return res.status(400).json({ error: 'Optimizer is not enabled or initialized' });
    }
    
    const { variantId } = req.body;
    
    if (!variantId) {
      return res.status(400).json({ error: 'variantId is required' });
    }
    
    const result = await optimizerController.promoteVariant(variantId);
    res.json(result);
  } catch (error) {
    // Return a more specific response when the variant does not exist
    const message = (error && error.message) ? String(error.message) : '';
    if ((error && error.code === 'VARIANT_NOT_FOUND') || message.toLowerCase().includes('variant not found')) {
      return res.status(404).json({ error: 'Variant not found' });
    }
    
    res.status(500).json({ error: message || 'Internal server error' });
  }
});

// ============================================================================
// 404 ERROR HANDLER
// ============================================================================
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path,
    message: 'The requested endpoint does not exist'
  });
});

// ============================================================================
// PERIODIC UPDATES
// ============================================================================
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Interval management for runtime tasks
const intervalRefs = [];

function startIntervals() {
  // Update market data every 3 seconds
  intervalRefs.push(setInterval(async () => {
    for (const symbol of Object.keys(marketManagers)) {
      await fetchTicker(symbol);
      broadcastMarketData(symbol);
      await sleep(100);
    }
  }, 3000));

  // Update order books every 2 seconds
  intervalRefs.push(setInterval(async () => {
    for (const symbol of Object.keys(marketManagers)) {
      await fetchOrderBook(symbol);
      await sleep(100);
    }
  }, 2000));

  // Update positions every 1 second
  intervalRefs.push(setInterval(async () => {
    for (const [symbol, manager] of activePositions.entries()) {
      if (marketManagers[symbol]) {
        const price = marketManagers[symbol].currentPrice;
        if (price > 0) {
          await manager.updatePrice(price);
        }
      }
    }
    if (activePositions.size > 0) {
      broadcastPositions();
    }
  }, 1000));

  // Update balance every 30 seconds
  intervalRefs.push(setInterval(fetchAccountBalance, 30000));

  // Update funding rates every 5 minutes
  intervalRefs.push(setInterval(async () => {
    for (const symbol of Object.keys(marketManagers)) {
      await fetchFundingRate(symbol);
      await sleep(100);
    }
  }, 300000));

  // V3.5: Process retry queue every 10 seconds
  intervalRefs.push(setInterval(() => {
    retryQueueManager.process();
  }, 10000));

  // Sync positions from KuCoin every minute
  intervalRefs.push(setInterval(async () => {
    try {
      const response = await kucoinAPI.getAllPositions();
      if (response.data) {
        for (const pos of response.data) {
          if (pos.currentQty !== 0) {
            const symbol = pos.symbol;
            const manager = activePositions.get(symbol);
            
            if (manager && manager.status === 'pending') {
              manager.status = 'open';
              manager.entryPrice = parseFloat(pos.avgEntryPrice);
              broadcastLog('success', `[${symbol}] Position filled @ ${manager.entryPrice}`);
              savePositions();
            }
          }
        }
      }
    } catch (error) {
      // Silently handle sync errors
    }
  }, 60000));
}

function stopIntervals() {
  while (intervalRefs.length) {
    clearInterval(intervalRefs.pop());
  }
}

// ============================================================================
// STARTUP
// ============================================================================
async function startup() {
  console.log('');
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║     KuCoin Perpetual Futures Dashboard v3.6.0                 ║');
  console.log('║     Semi-Automated Trading System                             ║');
  console.log('║                                                               ║');
  console.log('║     V3.6 NEW FEATURES:                                        ║');
  console.log('║     • Live Strategy Optimizer System                          ║');
  console.log('║     • Parallel variant testing with statistical validation    ║');
  console.log('║     • Real-time metrics streaming via WebSocket               ║');
  console.log('║     • Fixed .well-known DevTools 404 errors                   ║');
  console.log('║     • 5 new /api/optimizer/* endpoints                        ║');
  console.log('║                                                               ║');
  console.log('║     V3.5 ENHANCEMENTS:                                        ║');
  console.log('║     • Fee-adjusted break-even calculation                     ║');
  console.log('║     • Accurate liquidation price formula                      ║');
  console.log('║     • Slippage buffer on stop orders                          ║');
  console.log('║     • API retry queue with exponential backoff                ║');
  console.log('║     • ROI-based SL/TP (inverse leverage scaling)              ║');
  console.log('║     • Volatility-based auto-leverage                          ║');
  console.log('║     • Enhanced trailing stop algorithms                       ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log('');

  // Test API connection
  console.log('[INIT] Testing API connection...');
  try {
    const timeRes = await kucoinAPI.getServerTime();
    console.log(`[INIT] ✓ Connected to KuCoin (Server time: ${new Date(timeRes.data).toISOString()})`);
  } catch (error) {
    console.error('[INIT] ✗ Failed to connect to KuCoin:', error.message);
    process.exit(1);
  }

  // Fetch account balance
  console.log('[INIT] Fetching account balance...');
  const balance = await fetchAccountBalance();
  if (balance) {
    console.log(`[INIT] ✓ Account Balance: ${parseFloat(balance.accountEquity).toFixed(2)} USDT`);
  }

  // Load saved positions
  console.log('[INIT] Loading saved positions...');
  loadPositions();
  console.log(`[INIT] ✓ Loaded ${activePositions.size} positions`);

  // Initialize market data
  await initializeAllSymbols();

  // Initialize optimizer if enabled
  if (CONFIG.OPTIMIZER.ENABLED) {
    console.log('[INIT] Initializing Live Optimizer...');
    try {
      optimizerController = new LiveOptimizerController(OptimizerConfig);
      console.log('[INIT] ✓ Live Optimizer initialized (not running)');
    } catch (error) {
      console.error('[INIT] ✗ Failed to initialize optimizer:', error.message);
    }
  } else {
    console.log('[INIT] Live Optimizer is disabled (set OPTIMIZER_ENABLED=true to enable)');
  }

  if (SHOULD_START_INTERVALS) {
    startIntervals();
  }

  // Start server
  server.listen(CONFIG.PORT, () => {
    console.log('');
    console.log('╔═══════════════════════════════════════════════════════════════╗');
    console.log(`║     Dashboard: http://localhost:${CONFIG.PORT}                        ║`);
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    console.log('');
    console.log('[READY] Waiting for dashboard connection...');
  });
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[SHUTDOWN] Saving positions...');
  savePositions();
  console.log('[SHUTDOWN] Saving retry queue...');
  retryQueueManager.save();
  
  // Stop optimizer if running
  if (optimizerController && optimizerController.running) {
    console.log('[SHUTDOWN] Stopping optimizer...');
    try {
      await optimizerController.stop();
    } catch (err) {
      console.error('[SHUTDOWN] Failed to stop optimizer cleanly:', err);
    }
  }
  
  console.log('[SHUTDOWN] Closing connections...');
  stopIntervals();
  wsClients.forEach(ws => ws.close());
  server.close();
  console.log('[SHUTDOWN] Goodbye!');
  process.exit(0);
});

process.on('uncaughtException', (error) => {
  console.error('[FATAL]', error);
  savePositions();
  retryQueueManager.save();
});

// Start the server when executed directly
if (require.main === module) {
  startup().catch(error => {
    console.error('[STARTUP ERROR]', error);
    process.exit(1);
  });
}

module.exports = {
  TradeMath,
  TechnicalIndicators,
  CONFIG,
  KuCoinFuturesAPI,
  MockKuCoinFuturesAPI,
  createKuCoinClient,
  startIntervals,
  stopIntervals
};
