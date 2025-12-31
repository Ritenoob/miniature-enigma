/**
 * FETCH OHLCV DATA
 * Fetches historical OHLCV data from KuCoin Futures API
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const API_BASE = 'https://api-futures.kucoin.com';

/**
 * Fetch OHLCV data for a trading pair
 * @param {string} symbol - Trading pair symbol
 * @param {string} timeframe - Timeframe (1m, 5m, 15m, 1h, 4h, 1d)
 * @param {number} days - Number of days to fetch
 */
async function fetchOHLCV(symbol, timeframe = '5m', days = 30) {
  console.log(`[Fetcher] Fetching ${symbol} ${timeframe} data for ${days} days...`);

  const granularityMap = {
    '1m': 1,
    '5m': 5,
    '15m': 15,
    '30m': 30,
    '1h': 60,
    '4h': 240,
    '1d': 1440
  };

  const granularity = granularityMap[timeframe];
  if (!granularity) {
    throw new Error(`Invalid timeframe: ${timeframe}`);
  }

  const endTime = Date.now();
  const startTime = endTime - (days * 24 * 60 * 60 * 1000);

  try {
    const response = await axios.get(`${API_BASE}/api/v1/kline/query`, {
      params: {
        symbol,
        granularity,
        from: Math.floor(startTime / 1000),
        to: Math.floor(endTime / 1000)
      }
    });

    if (response.data && response.data.code === '200000') {
      const candles = response.data.data;
      console.log(`[Fetcher] Fetched ${candles.length} candles`);

      // Convert to standard format
      const formatted = candles.map(c => ({
        timestamp: c[0],
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5])
      }));

      return formatted;
    } else {
      throw new Error(`API error: ${response.data.msg || 'Unknown error'}`);
    }
  } catch (err) {
    console.error('[Fetcher] Error fetching data:', err.message);
    throw err;
  }
}

/**
 * Save OHLCV data to file
 * @param {Array} data - OHLCV data
 * @param {string} filename - Output filename
 */
function saveToFile(data, filename) {
  const dir = path.dirname(filename);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Save as JSONL
  const lines = data.map(d => JSON.stringify(d)).join('\n');
  fs.writeFileSync(filename, lines);

  console.log(`[Fetcher] Saved ${data.length} candles to ${filename}`);
}

// CLI usage
if (require.main === module) {
  const args = process.argv.slice(2);
  const symbol = args.find(a => a.startsWith('--pair='))?.split('=')[1] || 'XBTUSDTM';
  const timeframe = args.find(a => a.startsWith('--timeframe='))?.split('=')[1] || '5m';
  const days = parseInt(args.find(a => a.startsWith('--days='))?.split('=')[1] || '30');

  fetchOHLCV(symbol, timeframe, days)
    .then(data => {
      const filename = `./research/data/${symbol}_${timeframe}.jsonl`;
      saveToFile(data, filename);
    })
    .catch(err => {
      console.error('Error:', err.message);
      process.exit(1);
    });
}

module.exports = { fetchOHLCV, saveToFile };
