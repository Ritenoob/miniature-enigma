/**
 * Dual-Timeframe Screener Engine
 * ---------------------------------
 * Orchestrates:
 * - WebSocket market data intake (KuCoin Futures)
 * - Candle buffering per symbol + timeframe
 * - Incremental indicator updates
 * - Cross-timeframe alignment checks
 * - Signal emission
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const screenerConfig = require('./screenerConfig');
const timeframeAligner = require('./timeframeAligner');
const SignalEmitter = require('./signalEmitter');

// Indicator engines
const RSIIndicator = require('./indicatorEngines/RSIIndicator');
const MACDIndicator = require('./indicatorEngines/MACDIndicator');
const WilliamsRIndicator = require('./indicatorEngines/WilliamsRIndicator');
const AwesomeOscillator = require('./indicatorEngines/AwesomeOscillator');

const KUCOIN_WS_URL = 'wss://ws-api.kucoin.com/endpoint'; // tokenized endpoint handled upstream if needed
const PING_INTERVAL_MS = 18000;

class ScreenerEngine extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;

    this.ws = null;
    this.pingTimer = null;
    this.connected = false;

    this.candleBuffers = {};     // symbol -> timeframe -> candles[]
    this.indicators = {};        // symbol -> timeframe -> indicator engines
    this.lastSignals = new Map(); // deduplication

    this.signalEmitter = new SignalEmitter(config.outputs);
  }

  /* ============================
     Lifecycle
     ============================ */

  async start() {
    this._initializeState();
    await this._connectWebSocket();
    this._subscribeAll();
    this._startHeartbeat();
    console.log('[Screener] Started');
  }

  async stop() {
    console.log('[Screener] Shutting down...');
    clearInterval(this.pingTimer);

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.signalEmitter.close?.();
    this.connected = false;
  }

  /* ============================
     Initialization
     ============================ */

  _initializeState() {
    for (const symbol of this.config.symbols) {
      this.candleBuffers[symbol] = {};
      this.indicators[symbol] = {};

      for (const tf of [this.config.primaryTimeframe, this.config.secondaryTimeframe]) {
        this.candleBuffers[symbol][tf] = [];

        this.indicators[symbol][tf] = {
          rsi: this.config.indicators.includes('rsi')
            ? new RSIIndicator(this.config.indicatorParams.rsi)
            : null,
          macd: this.config.indicators.includes('macd')
            ? new MACDIndicator(this.config.indicatorParams.macd)
            : null,
          williamsR: this.config.indicators.includes('williamsR')
            ? new WilliamsRIndicator(this.config.indicatorParams.williamsR)
            : null,
          ao: this.config.indicators.includes('ao')
            ? new AwesomeOscillator(this.config.indicatorParams.ao)
            : null
        };
      }
    }
  }

  /* ============================
     WebSocket Handling
     ============================ */

  async _connectWebSocket() {
    return new Promise((resolve) => {
      this.ws = new WebSocket(KUCOIN_WS_URL);

      this.ws.on('open', () => {
        this.connected = true;
        console.log('[Screener] WebSocket connected');
        resolve();
      });

      this.ws.on('message', (msg) => this._onMessage(msg));

      this.ws.on('error', (err) => {
        console.error('[Screener] WS error', err.message);
      });

      this.ws.on('close', () => {
        console.warn('[Screener] WS closed – reconnecting...');
        this.connected = false;
        clearInterval(this.pingTimer);
        setTimeout(() => this._connectWebSocket().then(() => this._subscribeAll()), 3000);
      });
    });
  }

  _startHeartbeat() {
    this.pingTimer = setInterval(() => {
      if (this.ws && this.connected) {
        this.ws.send(JSON.stringify({ id: Date.now(), type: 'ping' }));
      }
    }, PING_INTERVAL_MS);
  }

  _subscribeAll() {
    for (const symbol of this.config.symbols) {
      for (const tf of [this.config.primaryTimeframe, this.config.secondaryTimeframe]) {
        const topic = `/market/candles:${symbol}_${tf}`;
        this.ws.send(JSON.stringify({
          id: Date.now(),
          type: 'subscribe',
          topic,
          response: true
        }));
      }
    }
  }

  /* ============================
     Message Handling
     ============================ */

  _onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg.type === 'message' && msg.subject === 'trade.candles.update') {
      this._handleCandle(msg);
    }
  }

  _handleCandle(msg) {
    const [symbol, tf] = msg.topic.split(':')[1].split('_');
    const data = msg.data.candles;

    const candle = {
      ts: Number(data[0]) * 1000,
      open: Number(data[1]),
      close: Number(data[2]),
      high: Number(data[3]),
      low: Number(data[4]),
      volume: Number(data[5])
    };

    const buffer = this.candleBuffers[symbol][tf];
    buffer.push(candle);
    if (buffer.length > this.config.maxCandles) buffer.shift();

    const indicatorValues = this._updateIndicators(symbol, tf, candle);
    this._checkAlignment(symbol, tf, indicatorValues);
  }

  /* ============================
     Indicators & Alignment
     ============================ */

  _updateIndicators(symbol, tf, candle) {
    const engines = this.indicators[symbol][tf];
    const values = {};

    if (engines.rsi) values.rsi = engines.rsi.update(candle.close);
    if (engines.macd) values.macd = engines.macd.update(candle.close);
    if (engines.williamsR) values.williamsR = engines.williamsR.update(candle);
    if (engines.ao) values.ao = engines.ao.update(candle);

    return values;
  }

  _checkAlignment(symbol, updatedTf, updatedValues) {
    const otherTf =
      updatedTf === this.config.primaryTimeframe
        ? this.config.secondaryTimeframe
        : this.config.primaryTimeframe;

    const otherEngines = this.indicators[symbol][otherTf];
    if (!otherEngines) return;

    const otherValues = {};
    if (otherEngines.rsi) otherValues.rsi = otherEngines.rsi.value;
    if (otherEngines.macd) otherValues.macd = otherEngines.macd.value;
    if (otherEngines.williamsR) otherValues.williamsR = otherEngines.williamsR.value;
    if (otherEngines.ao) otherValues.ao = otherEngines.ao.value;

    const result = timeframeAligner.checkAlignment(
      updatedTf === this.config.primaryTimeframe ? updatedValues : otherValues,
      updatedTf === this.config.primaryTimeframe ? otherValues : updatedValues,
      this.config
    );

    if (!result) return;

    const dedupKey = `${symbol}:${result.direction}`;
    if (this.lastSignals.get(dedupKey) === result.timestamp) return;
    this.lastSignals.set(dedupKey, result.timestamp);

    this.signalEmitter.handleSignal({
      symbol,
      timeframes: [this.config.primaryTimeframe, this.config.secondaryTimeframe],
      direction: result.direction,
      indicators: result.indicators,
      ts: Date.now()
    });
  }
}

/* ============================
   CLI Bootstrap
   ============================ */

if (require.main === module) {
  const engine = new ScreenerEngine(screenerConfig);
  engine.start();

  process.on('SIGINT', async () => {
    await engine.stop();
    process.exit(0);
  });
}

module.exports = ScreenerEngine;

