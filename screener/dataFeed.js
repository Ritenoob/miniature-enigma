/**
 * Screener Data Feed - KuCoin WebSocket with Heartbeat/Reconnect
 * ----------------------------------------------------------------
 * Manages WebSocket connection to KuCoin Futures for real-time market data
 * 
 * Features:
 * - Automatic heartbeat (ping/pong)
 * - Automatic reconnection on disconnect
 * - Subscription management
 * - Buffer management per symbol/timeframe
 * - Rate limit awareness via PingBudgetManager integration
 */

const WebSocket = require('ws');
const EventEmitter = require('events');
const axios = require('axios');

class ScreenerDataFeed extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      // WebSocket configuration
      apiBase: config.apiBase || 'https://api-futures.kucoin.com',
      reconnectDelay: config.reconnectDelay || 5000,        // 5 seconds
      reconnectMaxDelay: config.reconnectMaxDelay || 60000, // 60 seconds
      reconnectBackoff: config.reconnectBackoff || 1.5,     // Exponential backoff multiplier
      
      // Heartbeat configuration
      heartbeatInterval: config.heartbeatInterval || 18000,  // 18 seconds (KuCoin requires < 30s)
      heartbeatTimeout: config.heartbeatTimeout || 10000,    // 10 seconds timeout
      
      // Buffer configuration
      maxBufferSize: config.maxBufferSize || 1000,           // Max candles per symbol/timeframe
      
      // Subscription settings
      symbols: config.symbols || [],
      timeframes: config.timeframes || ['5min', '15min']
    };
    
    // Connection state
    this.ws = null;
    this.wsUrl = null;
    this.token = null;
    this.connected = false;
    this.connecting = false;
    this.shuttingDown = false;
    
    // Reconnection state
    this.reconnectAttempts = 0;
    this.currentReconnectDelay = this.config.reconnectDelay;
    this.reconnectTimer = null;
    
    // Heartbeat state
    this.heartbeatTimer = null;
    this.heartbeatTimeout = null;
    this.lastPong = Date.now();
    this.missedPongs = 0;
    
    // Subscriptions
    this.subscriptions = new Map();  // topic -> { symbols, timeframe }
    
    // Data buffers: symbol -> timeframe -> candles[]
    this.buffers = new Map();
    
    // Statistics
    this.stats = {
      messagesReceived: 0,
      reconnects: 0,
      errors: 0,
      lastMessage: null,
      uptime: 0,
      startTime: null
    };
  }

  /**
   * Connect to KuCoin WebSocket
   */
  async connect() {
    if (this.connected || this.connecting) {
      return;
    }
    
    this.connecting = true;
    this.stats.startTime = Date.now();
    
    try {
      // Get WebSocket token from KuCoin API
      await this._getWebSocketToken();
      
      // Connect to WebSocket
      await this._connectWebSocket();
      
      // Subscribe to configured symbols/timeframes
      await this._subscribeAll();
      
      // Start heartbeat
      this._startHeartbeat();
      
      this.connecting = false;
      this.connected = true;
      this.reconnectAttempts = 0;
      this.currentReconnectDelay = this.config.reconnectDelay;
      
      this.emit('connected');
    } catch (error) {
      this.connecting = false;
      this.stats.errors++;
      this.emit('error', error);
      
      // Schedule reconnection
      if (!this.shuttingDown) {
        this._scheduleReconnect();
      }
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    this.shuttingDown = true;
    this._cleanup();
    this.emit('disconnected');
  }

  /**
   * Get WebSocket token from KuCoin API
   * @private
   */
  async _getWebSocketToken() {
    try {
      const response = await axios.post(`${this.config.apiBase}/api/v1/bullet-public`);
      
      if (response.data && response.data.data) {
        const data = response.data.data;
        this.token = data.token;
        
        // Build WebSocket URL
        const server = data.instanceServers[0];
        this.wsUrl = `${server.endpoint}?token=${this.token}`;
        
        return this.token;
      } else {
        throw new Error('Failed to get WebSocket token');
      }
    } catch (error) {
      throw new Error(`Failed to get WebSocket token: ${error.message}`);
    }
  }

  /**
   * Connect to WebSocket server
   * @private
   */
  async _connectWebSocket() {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);
        
        this.ws.on('open', () => {
          resolve();
        });
        
        this.ws.on('message', (data) => {
          this._handleMessage(data);
        });
        
        this.ws.on('error', (error) => {
          this.stats.errors++;
          this.emit('error', error);
        });
        
        this.ws.on('close', () => {
          this._handleDisconnect();
        });
        
        this.ws.on('ping', () => {
          this.ws.pong();
        });
        
        this.ws.on('pong', () => {
          this._handlePong();
        });
        
        // Timeout for connection
        setTimeout(() => {
          if (!this.connected) {
            reject(new Error('WebSocket connection timeout'));
          }
        }, 10000);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Subscribe to all configured symbols and timeframes
   * @private
   */
  async _subscribeAll() {
    for (const symbol of this.config.symbols) {
      for (const timeframe of this.config.timeframes) {
        await this._subscribe(symbol, timeframe);
      }
    }
  }

  /**
   * Subscribe to a specific symbol and timeframe
   * @private
   */
  async _subscribe(symbol, timeframe) {
    const topic = `/contractMarket/candle:${symbol}_${timeframe}`;
    
    const subscribeMsg = {
      id: Date.now(),
      type: 'subscribe',
      topic: topic,
      privateChannel: false,
      response: true
    };
    
    this._send(subscribeMsg);
    
    this.subscriptions.set(topic, { symbol, timeframe });
    
    // Initialize buffer
    if (!this.buffers.has(symbol)) {
      this.buffers.set(symbol, new Map());
    }
    if (!this.buffers.get(symbol).has(timeframe)) {
      this.buffers.get(symbol).set(timeframe, []);
    }
  }

  /**
   * Send message over WebSocket
   * @private
   */
  _send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Handle incoming WebSocket message
   * @private
   */
  _handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      
      this.stats.messagesReceived++;
      this.stats.lastMessage = Date.now();
      
      // Handle different message types
      if (message.type === 'welcome') {
        // Connection established
        this.emit('welcome', message);
      } else if (message.type === 'ack') {
        // Subscription acknowledged
        this.emit('subscribed', message);
      } else if (message.type === 'message') {
        // Market data update
        this._handleMarketData(message);
      } else if (message.type === 'pong') {
        // Heartbeat response
        this._handlePong();
      } else if (message.type === 'error') {
        // Error message
        this.emit('error', new Error(message.data));
      }
    } catch (error) {
      this.stats.errors++;
      this.emit('error', new Error(`Failed to parse message: ${error.message}`));
    }
  }

  /**
   * Handle market data message
   * @private
   */
  _handleMarketData(message) {
    const { topic, subject, data } = message;
    
    // Parse topic to get symbol and timeframe
    const sub = this.subscriptions.get(topic);
    if (!sub) {
      return;
    }
    
    const { symbol, timeframe } = sub;
    
    // Convert KuCoin candle data to standard format
    const candle = this._normalizeCandle(data);
    
    // Add to buffer
    const buffer = this.buffers.get(symbol).get(timeframe);
    buffer.push(candle);
    
    // Trim buffer if needed
    if (buffer.length > this.config.maxBufferSize) {
      buffer.shift();
    }
    
    // Emit candle event
    this.emit('candle', {
      symbol,
      timeframe,
      candle
    });
  }

  /**
   * Normalize KuCoin candle data to standard format
   * @private
   */
  _normalizeCandle(data) {
    // KuCoin format: { candles: [timestamp, open, close, high, low, volume, turnover] }
    const candles = data.candles;
    
    return {
      timestamp: parseInt(candles[0]),
      open: parseFloat(candles[1]),
      close: parseFloat(candles[2]),
      high: parseFloat(candles[3]),
      low: parseFloat(candles[4]),
      volume: parseFloat(candles[5])
    };
  }

  /**
   * Start heartbeat mechanism
   * @private
   */
  _startHeartbeat() {
    // Clear any existing heartbeat
    this._stopHeartbeat();
    
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        // Send ping
        const pingMsg = {
          id: Date.now(),
          type: 'ping'
        };
        this._send(pingMsg);
        
        // Set timeout for pong
        this.heartbeatTimeout = setTimeout(() => {
          this.missedPongs++;
          
          if (this.missedPongs >= 3) {
            // Too many missed pongs, reconnect
            this.emit('error', new Error('Heartbeat timeout - too many missed pongs'));
            this._handleDisconnect();
          }
        }, this.config.heartbeatTimeout);
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Stop heartbeat mechanism
   * @private
   */
  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  /**
   * Handle pong response
   * @private
   */
  _handlePong() {
    this.lastPong = Date.now();
    this.missedPongs = 0;
    
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  /**
   * Handle disconnect
   * @private
   */
  _handleDisconnect() {
    this.connected = false;
    this._cleanup();
    
    this.emit('disconnected');
    
    if (!this.shuttingDown) {
      this._scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection
   * @private
   */
  _scheduleReconnect() {
    if (this.reconnectTimer) {
      return;
    }
    
    this.reconnectAttempts++;
    this.stats.reconnects++;
    
    const delay = Math.min(
      this.currentReconnectDelay,
      this.config.reconnectMaxDelay
    );
    
    this.emit('reconnecting', {
      attempt: this.reconnectAttempts,
      delay
    });
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.currentReconnectDelay *= this.config.reconnectBackoff;
      this.connect();
    }, delay);
  }

  /**
   * Cleanup resources
   * @private
   */
  _cleanup() {
    this._stopHeartbeat();
    
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Get candle buffer for symbol/timeframe
   * @param {string} symbol - Symbol
   * @param {string} timeframe - Timeframe
   * @returns {Array} Candle buffer
   */
  getBuffer(symbol, timeframe) {
    if (this.buffers.has(symbol) && this.buffers.get(symbol).has(timeframe)) {
      return this.buffers.get(symbol).get(timeframe);
    }
    return [];
  }

  /**
   * Get connection statistics
   * @returns {Object} Statistics
   */
  getStats() {
    const now = Date.now();
    const uptime = this.stats.startTime ? now - this.stats.startTime : 0;
    
    return {
      ...this.stats,
      uptime,
      connected: this.connected,
      reconnectAttempts: this.reconnectAttempts,
      missedPongs: this.missedPongs,
      lastPong: this.lastPong,
      staleness: this.stats.lastMessage ? now - this.stats.lastMessage : null
    };
  }
}

module.exports = ScreenerDataFeed;
