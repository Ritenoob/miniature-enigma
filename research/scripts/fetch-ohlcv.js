#!/usr/bin/env node
/**
 * Fetch OHLCV Data Script
 * 
 * Fetches historical candlestick data for specified symbols and timeframes.
 * Stores data in research/data/ directory.
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const SYMBOLS = ['XBTUSDTM', 'ETHUSDTM', 'SOLUSDTM', 'DOGEUSDTM', 'AVAXUSDTM'];
const TIMEFRAMES = ['1min', '5min', '15min', '1hour', '4hour'];
const DATA_DIR = path.join(__dirname, '../data');
const KUCOIN_API = 'https://api-futures.kucoin.com';

/**
 * Fetch OHLCV data from KuCoin
 * @param {string} symbol - Trading symbol
 * @param {string} timeframe - Timeframe (1min, 5min, etc.)
 * @param {number} from - Start timestamp (seconds)
 * @param {number} to - End timestamp (seconds)
 * @returns {Array} - Array of candles
 */
async function fetchOHLCV(symbol, timeframe, from, to) {
  try {
    const granularity = timeframeToGranularity(timeframe);
    const url = `${KUCOIN_API}/api/v1/kline/query`;
    
    const params = {
      symbol,
      granularity,
      from,
      to
    };

    const response = await axios.get(url, { params });
    
    if (response.data && response.data.code === '200000') {
      return response.data.data.map(candle => ({
        time: candle[0] * 1000, // Convert to milliseconds
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5]),
        symbol,
        timeframe
      }));
    }

    return [];
  } catch (error) {
    console.error(`Error fetching ${symbol} ${timeframe}:`, error.message);
    return [];
  }
}

/**
 * Convert timeframe string to KuCoin granularity (minutes)
 * @param {string} timeframe - Timeframe string
 * @returns {number} - Granularity in minutes
 */
function timeframeToGranularity(timeframe) {
  const map = {
    '1min': 1,
    '5min': 5,
    '15min': 15,
    '30min': 30,
    '1hour': 60,
    '4hour': 240,
    '1day': 1440
  };
  return map[timeframe] || 60;
}

/**
 * Fetch data for all symbols and timeframes
 */
async function fetchAll() {
  console.log('Fetching OHLCV data...');
  console.log(`Symbols: ${SYMBOLS.join(', ')}`);
  console.log(`Timeframes: ${TIMEFRAMES.join(', ')}`);

  // Ensure data directory exists
  await fs.mkdir(DATA_DIR, { recursive: true });

  // Calculate date range (last 30 days)
  const now = Math.floor(Date.now() / 1000);
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60);

  for (const symbol of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      console.log(`\nFetching ${symbol} ${timeframe}...`);

      const candles = await fetchOHLCV(symbol, timeframe, thirtyDaysAgo, now);
      
      if (candles.length > 0) {
        const filename = `${symbol}_${timeframe}.json`;
        const filepath = path.join(DATA_DIR, filename);
        await fs.writeFile(filepath, JSON.stringify(candles, null, 2));
        console.log(`  ✓ Saved ${candles.length} candles to ${filename}`);
      } else {
        console.log(`  ✗ No data retrieved`);
      }

      // Rate limit: wait 200ms between requests
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  console.log('\n✓ Data fetch complete!');
  console.log(`Data saved to: ${DATA_DIR}`);
}

// Run if called directly
if (require.main === module) {
  fetchAll().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { fetchOHLCV, fetchAll };
