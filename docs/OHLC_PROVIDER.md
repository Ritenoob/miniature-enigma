# OHLC Provider Documentation

## Overview

The OHLCProvider module provides a unified abstraction layer for fetching OHLC (Open, High, Low, Close) candle data from various sources. It supports multiple data providers with caching, rate limiting, and automatic data normalization.

## Purpose

- Supply historical candle data for technical indicator calculations
- Enable backtesting and strategy validation for the Live Optimizer
- Provide flexible data sourcing without vendor lock-in
- Maintain low latency and avoid rate limit issues
- Ensure futures pricing accuracy (no spot/futures distortion)

## Supported Data Sources

### 1. KuCoin Futures (Default)
- **Free**: Yes
- **Rate Limits**: Public API limits apply
- **Data Quality**: Futures pricing (matches trading venue)
- **Intervals**: 1m, 5m, 15m, 30m, 1h, 4h, 8h, 1d, 1w
- **Latency**: Low (direct API)

### 2. Binance
- **Free**: Yes  
- **Rate Limits**: 1200 requests/minute (weight-based)
- **Data Quality**: High quality, widely used
- **Intervals**: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M
- **Latency**: Low

### 3. Alpha Vantage
- **Free**: Limited (5 calls/minute)
- **Rate Limits**: Strict free tier limits
- **Data Quality**: Good for stocks/indices
- **Intervals**: Intraday and daily
- **Latency**: Medium (API key required)

### 4. Local Cache/Database
- **Free**: Yes (self-hosted)
- **Rate Limits**: None
- **Data Quality**: Depends on source
- **Intervals**: Custom
- **Latency**: Very low
- **Status**: Override `_fetchLocal()` to implement

## Installation

The module is already integrated. No additional dependencies required beyond `axios` (already in package.json).

## Usage

### Basic Usage

```javascript
const { OHLCProvider } = require('./src/marketdata');

// Create provider with default source (KuCoin)
const provider = new OHLCProvider();

// Fetch candles
const candles = await provider.getCandles({
  symbol: 'XBTUSDTM',
  timeframe: '1h',
  limit: 100
});

console.log(candles);
// [
//   {
//     timestamp: 1672531200000,
//     open: 50000,
//     high: 50100,
//     low: 49900,
//     close: 50050,
//     volume: 100.5
//   },
//   ...
// ]
```

### Using Different Sources

#### Binance
```javascript
const provider = new OHLCProvider({
  source: 'binance'
});

const candles = await provider.getCandles({
  symbol: 'BTCUSDT',
  timeframe: '5m',
  start: Date.now() - 86400000, // Last 24 hours
  limit: 288  // 24h * 60min / 5min
});
```

#### Alpha Vantage
```javascript
const provider = new OHLCProvider({
  source: 'alphaVantage',
  apiKey: 'YOUR_API_KEY'
});

const candles = await provider.getCandles({
  symbol: 'IBM',
  timeframe: '5m',
  limit: 100
});
```

#### Local Database (Custom Implementation)
```javascript
class LocalOHLCProvider extends OHLCProvider {
  async _fetchLocal(params) {
    // Your custom implementation
    // Could fetch from SQLite, Redis, InfluxDB, CSV files, etc.
    const candles = await this.db.query(
      'SELECT * FROM candles WHERE symbol = ? AND timeframe = ?',
      [params.symbol, params.timeframe]
    );
    return candles;
  }
}

const provider = new LocalOHLCProvider({ source: 'local' });
```

### Configuration Options

```javascript
const provider = new OHLCProvider({
  source: 'kucoin',           // Data source: 'kucoin', 'binance', 'alphaVantage', 'local'
  baseURL: null,              // Custom base URL (optional)
  apiKey: null,               // API key for sources that require it
  timeout: 10000,             // Request timeout in ms
  rateLimitDelay: 100,        // Minimum delay between requests (ms)
  cacheEnabled: true,         // Enable caching
  cacheTTL: 60000,           // Cache time-to-live (ms)
  maxRetries: 3               // Max retry attempts on failure
});
```

### Request Parameters

```javascript
provider.getCandles({
  symbol: 'XBTUSDTM',         // Required: Trading pair symbol
  timeframe: '1h',            // Required: Candle interval (1m, 5m, 1h, 4h, 1d, etc.)
  start: 1672531200000,       // Optional: Start timestamp (ms)
  end: 1672617600000,         // Optional: End timestamp (ms)
  limit: 500                  // Optional: Max candles to return (default: 500)
});
```

### Response Format

All sources return normalized candles in this format:

```javascript
{
  timestamp: 1672531200000,   // Unix timestamp in milliseconds
  open: 50000,                // Opening price
  high: 50100,                // Highest price in interval
  low: 49900,                 // Lowest price in interval
  close: 50050,               // Closing price
  volume: 100.5               // Trading volume
}
```

## Caching

The provider includes built-in caching to reduce API calls:

```javascript
// Cache is enabled by default
const provider = new OHLCProvider({ cacheEnabled: true, cacheTTL: 60000 });

// First call hits API
const candles1 = await provider.getCandles({ symbol: 'BTCUSDT', timeframe: '1h' });

// Second call within TTL returns cached data
const candles2 = await provider.getCandles({ symbol: 'BTCUSDT', timeframe: '1h' });

// Manually clear cache
provider.clearCache();

// Get cache statistics
const stats = provider.getCacheStats();
console.log(stats.size, stats.entries);
```

## Rate Limiting

Automatic rate limiting protects against hitting API limits:

```javascript
const provider = new OHLCProvider({
  rateLimitDelay: 200  // 200ms minimum between requests = max 5 req/sec
});

// Requests are automatically throttled
for (let i = 0; i < 10; i++) {
  await provider.getCandles({ symbol: 'BTCUSDT', timeframe: '1h' });
  // Each request waits at least 200ms after the previous one
}
```

## Integration with Live Optimizer

### Backtesting

```javascript
const { OHLCProvider } = require('./src/marketdata');
const { LiveOptimizerController } = require('./src/optimizer');

const ohlcProvider = new OHLCProvider({ source: 'kucoin' });
const optimizer = new LiveOptimizerController();

// Fetch historical data
const historicalCandles = await ohlcProvider.getCandles({
  symbol: 'XBTUSDTM',
  timeframe: '1h',
  start: Date.now() - 7 * 86400000,  // Last 7 days
  limit: 168  // 7 days * 24 hours
});

// Replay through optimizer
for (const candle of historicalCandles) {
  const indicators = calculateIndicators(candle);
  optimizer.onMarketUpdate('XBTUSDTM', indicators, candle.close);
}

// Get results
const performance = optimizer.getPerformanceComparison();
console.log(performance);
```

### Indicator Calculation

```javascript
const { OHLCProvider } = require('./src/marketdata');

async function calculateRSI(symbol, timeframe, period = 14) {
  const provider = new OHLCProvider();
  
  // Fetch enough candles for indicator
  const candles = await provider.getCandles({
    symbol,
    timeframe,
    limit: period * 2
  });
  
  // Calculate RSI from OHLC data
  const rsi = computeRSI(candles, period);
  return rsi;
}
```

## Error Handling

```javascript
const provider = new OHLCProvider();

try {
  const candles = await provider.getCandles({
    symbol: 'BTCUSDT',
    timeframe: '1h'
  });
} catch (error) {
  if (error.message.includes('rate limit')) {
    // Handle rate limiting
    await new Promise(r => setTimeout(r, 60000));
  } else if (error.message.includes('API error')) {
    // Handle API errors
    console.error('API failed:', error.message);
  } else {
    // Handle other errors
    console.error('Unexpected error:', error);
  }
}
```

## Best Practices

### 1. Choose the Right Source
- **KuCoin** for futures trading (default, matches your venue)
- **Binance** for spot crypto or higher rate limits
- **Alpha Vantage** for stocks/indices (requires API key)
- **Local** for backtesting with historical datasets

### 2. Use Caching Wisely
```javascript
// For real-time trading: short cache
const realtimeProvider = new OHLCProvider({ cacheTTL: 10000 });

// For backtesting: longer cache
const backtestProvider = new OHLCProvider({ cacheTTL: 300000 });
```

### 3. Respect Rate Limits
```javascript
// Conservative: 1 req/sec
const conservativeProvider = new OHLCProvider({ rateLimitDelay: 1000 });

// Aggressive: 10 req/sec (check API limits first!)
const aggressiveProvider = new OHLCProvider({ rateLimitDelay: 100 });
```

### 4. Handle Failures Gracefully
```javascript
async function fetchWithRetry(provider, params, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await provider.getCandles(params);
    } catch (error) {
      if (i === retries - 1) throw error;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }
}
```

### 5. Validate Data Quality
```javascript
const candles = await provider.getCandles({ symbol: 'BTCUSDT', timeframe: '1h' });

// Check for gaps
for (let i = 1; i < candles.length; i++) {
  const expectedTime = candles[i-1].timestamp + 3600000; // 1h in ms
  if (candles[i].timestamp !== expectedTime) {
    console.warn('Gap detected in candle data');
  }
}

// Check for invalid values
candles.forEach(c => {
  if (c.high < c.low || c.open <= 0 || c.volume < 0) {
    console.warn('Invalid candle data:', c);
  }
});
```

## Performance Considerations

### Latency Targets
- **KuCoin/Binance**: < 200ms typical
- **Alpha Vantage**: < 500ms typical
- **Local cache**: < 10ms typical

### Memory Usage
- Cache stores normalized candles in memory
- ~1KB per candle
- Default cache cleanup at 100 entries

### Network Efficiency
- Batch requests when possible
- Use appropriate time ranges
- Enable caching for repeated queries

## Timeframe Support

| Format | Meaning | Example Use Case |
|--------|---------|------------------|
| `1m` | 1 minute | Scalping, high-frequency |
| `5m` | 5 minutes | Short-term trading |
| `15m` | 15 minutes | Intraday signals |
| `1h` | 1 hour | Medium-term trends |
| `4h` | 4 hours | Swing trading |
| `1d` | 1 day | Position trading |

## Troubleshooting

### Issue: Rate Limit Exceeded
**Solution**: Increase `rateLimitDelay` or enable caching

### Issue: Invalid Futures Symbol
**Solution**: Check symbol format for your exchange (e.g., XBTUSDTM for KuCoin, BTCUSDT for Binance)

### Issue: Missing Candles
**Solution**: Check date range and API limits. Some exchanges limit historical data.

### Issue: Price Discrepancy
**Solution**: Verify you're using futures data (not spot) for futures trading

## Future Enhancements

- WebSocket support for real-time candle streaming
- Additional data sources (Coinbase, FTX, etc.)
- Advanced caching strategies (Redis, InfluxDB)
- Data quality validation and gap filling
- Candle aggregation (e.g., 1m → 5m)
- Compression for large historical datasets

## References

- **KuCoin API**: https://docs.kucoin.com/futures/
- **Binance API**: https://binance-docs.github.io/apidocs/
- **Alpha Vantage**: https://www.alphavantage.co/documentation/
- **Tests**: `/tests/ohlc-provider.test.js`

---

**Version**: 1.0.0  
**Last Updated**: 2026-01-02  
**Status**: Production Ready
