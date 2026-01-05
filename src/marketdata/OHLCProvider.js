// ============================================================================
// OHLCProvider.js - OHLC Data Abstraction Layer
// ============================================================================
// Provides abstraction for fetching OHLC candles from various sources
// (exchange APIs, external APIs, local cache) for indicators and optimizer

const axios = require('axios');

/**
 * OHLC Provider interface for fetching candle data
 * Supports multiple sources with unified interface
 */
class OHLCProvider {
  constructor(config = {}) {
    this.config = {
      source: config.source || 'kucoin',  // 'kucoin', 'binance', 'local', 'alphaVantage'
      baseURL: config.baseURL || null,
      apiKey: config.apiKey || null,
      timeout: config.timeout || 10000,
      rateLimitDelay: config.rateLimitDelay || 100, // ms between requests
      cacheEnabled: config.cacheEnabled !== false,
      cacheTTL: config.cacheTTL || 60000, // 1 minute default cache
      maxRetries: config.maxRetries || 3
    };

    this.cache = new Map();
    this.lastRequestTime = 0;
    this.requestQueue = [];
  }

  /**
   * Get OHLC candles from configured source
   *
   * @param {Object} params - Query parameters
   * @param {string} params.symbol - Trading pair symbol (e.g., 'BTCUSDT', 'XBTUSDTM')
   * @param {string} params.timeframe - Candle interval ('1m', '5m', '15m', '1h', '4h', '1d')
   * @param {number} params.start - Start timestamp (optional)
   * @param {number} params.end - End timestamp (optional)
   * @param {number} params.limit - Max number of candles (default: 500)
   *
   * @returns {Promise<Array>} Array of candle objects
   */
  async getCandles(params) {
    const { symbol: _symbol, timeframe: _timeframe, start: _start, end: _end, limit: _limit = 500 } = params;

    // Validate parameters
    this._validateParams(params);

    // Check cache first
    if (this.config.cacheEnabled) {
      const cached = this._getFromCache(params);
      if (cached) {
        return cached;
      }
    }

    // Rate limit protection
    await this._enforceRateLimit();

    // Fetch from appropriate source
    let candles;
    switch (this.config.source) {
      case 'kucoin':
        candles = await this._fetchKuCoin(params);
        break;
      case 'binance':
        candles = await this._fetchBinance(params);
        break;
      case 'alphaVantage':
        candles = await this._fetchAlphaVantage(params);
        break;
      case 'local':
        candles = await this._fetchLocal(params);
        break;
      default:
        throw new Error(`Unsupported OHLC source: ${this.config.source}`);
    }

    // Normalize to standard format
    const normalized = this._normalizeCandles(candles, this.config.source);

    // Cache result
    if (this.config.cacheEnabled) {
      this._setCache(params, normalized);
    }

    return normalized;
  }

  /**
   * Fetch candles from KuCoin Futures API
   * @private
   */
  async _fetchKuCoin(params) {
    const { symbol, timeframe, start, end, limit: _limit } = params;

    // Convert timeframe to KuCoin granularity (minutes)
    const granularity = this._convertTimeframeToMinutes(timeframe);

    const url = 'https://api-futures.kucoin.com/api/v1/kline/query';
    const queryParams = {
      symbol: symbol,
      granularity: granularity,
      from: start ? Math.floor(start / 1000) : undefined,
      to: end ? Math.floor(end / 1000) : undefined
    };

    try {
      const response = await axios.get(url, {
        params: queryParams,
        timeout: this.config.timeout
      });

      if (response.data && response.data.code === '200000') {
        return response.data.data || [];
      } else {
        throw new Error(`KuCoin API error: ${response.data?.msg || 'Unknown error'}`);
      }
    } catch (error) {
      throw new Error(`Failed to fetch KuCoin candles: ${error.message}`);
    }
  }

  /**
   * Fetch candles from Binance API
   * @private
   */
  async _fetchBinance(params) {
    const { symbol, timeframe, start, end, limit } = params;

    const url = 'https://api.binance.com/api/v3/klines';
    const queryParams = {
      symbol: symbol,
      interval: timeframe,
      startTime: start,
      endTime: end,
      limit: Math.min(limit, 1000) // Binance max is 1000
    };

    try {
      const response = await axios.get(url, {
        params: queryParams,
        timeout: this.config.timeout
      });

      return response.data || [];
    } catch (error) {
      throw new Error(`Failed to fetch Binance candles: ${error.message}`);
    }
  }

  /**
   * Fetch candles from Alpha Vantage API
   * @private
   */
  async _fetchAlphaVantage(params) {
    const { symbol, timeframe } = params;

    if (!this.config.apiKey) {
      throw new Error('Alpha Vantage requires API key');
    }

    // Alpha Vantage function based on timeframe
    const func = timeframe.includes('d') ? 'TIME_SERIES_DAILY' : 'TIME_SERIES_INTRADAY';
    const interval = timeframe.replace('m', 'min');

    const url = 'https://www.alphavantage.co/query';
    const queryParams = {
      function: func,
      symbol: symbol,
      interval: interval,
      apikey: this.config.apiKey,
      outputsize: 'full'
    };

    try {
      const response = await axios.get(url, {
        params: queryParams,
        timeout: this.config.timeout
      });

      // Alpha Vantage returns nested time series
      const timeSeriesKey = Object.keys(response.data).find(k => k.includes('Time Series'));
      return response.data[timeSeriesKey] || {};
    } catch (error) {
      throw new Error(`Failed to fetch Alpha Vantage candles: ${error.message}`);
    }
  }

  /**
   * Fetch candles from local cache/database
   * @private
   */
  async _fetchLocal(_params) {
    // Placeholder for local data source
    // Could be SQLite, Redis, InfluxDB, or file system
    throw new Error('Local OHLC source not yet implemented. Override this method in subclass.');
  }

  /**
   * Normalize candles from different sources to standard format
   * @private
   */
  _normalizeCandles(candles, source) {
    if (!candles || (Array.isArray(candles) && candles.length === 0)) {
      return [];
    }

    switch (source) {
      case 'kucoin':
        return this._normalizeKuCoinCandles(candles);
      case 'binance':
        return this._normalizeBinanceCandles(candles);
      case 'alphaVantage':
        return this._normalizeAlphaVantageCandles(candles);
      default:
        return candles;
    }
  }

  /**
   * Normalize KuCoin candle format
   * KuCoin format: [timestamp, open, high, low, close, volume]
   * @private
   */
  _normalizeKuCoinCandles(candles) {
    return candles.map(candle => ({
      timestamp: parseInt(candle[0]) * 1000, // Convert to milliseconds
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    }));
  }

  /**
   * Normalize Binance candle format
   * Binance format: [openTime, open, high, low, close, volume, closeTime, ...]
   * @private
   */
  _normalizeBinanceCandles(candles) {
    return candles.map(candle => ({
      timestamp: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    }));
  }

  /**
   * Normalize Alpha Vantage candle format
   * Alpha Vantage format: { "2023-01-01": { "1. open": "100", ... } }
   * @private
   */
  _normalizeAlphaVantageCandles(candles) {
    return Object.entries(candles).map(([timestamp, data]) => ({
      timestamp: new Date(timestamp).getTime(),
      open: parseFloat(data['1. open']),
      high: parseFloat(data['2. high']),
      low: parseFloat(data['3. low']),
      close: parseFloat(data['4. close']),
      volume: parseFloat(data['5. volume'] || data['6. volume'] || 0)
    })).sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Convert timeframe string to minutes
   * @private
   */
  _convertTimeframeToMinutes(timeframe) {
    const matches = timeframe.match(/^(\d+)([mhd])$/);
    if (!matches) {
      throw new Error(`Invalid timeframe format: ${timeframe}`);
    }

    const value = parseInt(matches[1]);
    const unit = matches[2];

    switch (unit) {
      case 'm': return value;
      case 'h': return value * 60;
      case 'd': return value * 1440;
      default: throw new Error(`Unknown timeframe unit: ${unit}`);
    }
  }

  /**
   * Validate request parameters
   * @private
   */
  _validateParams(params) {
    if (!params.symbol) {
      throw new Error('Symbol is required');
    }
    if (!params.timeframe) {
      throw new Error('Timeframe is required');
    }

    // Validate timeframe format
    if (!/^\d+[mhd]$/.test(params.timeframe)) {
      throw new Error('Timeframe must be in format: 1m, 5m, 1h, 4h, 1d, etc.');
    }
  }

  /**
   * Enforce rate limiting between requests
   * @private
   */
  async _enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.config.rateLimitDelay) {
      const delay = this.config.rateLimitDelay - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Get candles from cache
   * @private
   */
  _getFromCache(params) {
    const key = this._getCacheKey(params);
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < this.config.cacheTTL) {
      return cached.data;
    }

    return null;
  }

  /**
   * Store candles in cache
   * @private
   */
  _setCache(params, data) {
    const key = this._getCacheKey(params);
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });

    // Cleanup old cache entries
    if (this.cache.size > 100) {
      const oldestKeys = Array.from(this.cache.keys()).slice(0, 20);
      oldestKeys.forEach(k => this.cache.delete(k));
    }
  }

  /**
   * Generate cache key from parameters
   * @private
   */
  _getCacheKey(params) {
    return `${params.symbol}_${params.timeframe}_${params.start || 'latest'}_${params.limit || 500}`;
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}

module.exports = OHLCProvider;
