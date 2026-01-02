#!/usr/bin/env node
/**
 * Live Optimizer Demo Script
 * 
 * This script demonstrates the Live Optimizer by running it
 * with simulated market data and showing the performance of
 * different strategy variants.
 */

const LiveOptimizerController = require('../src/optimizer/LiveOptimizerController');

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║     Live Optimizer Demo                                       ║');
console.log('║     Testing 4 Strategy Variants with Simulated Data          ║');
console.log('╚═══════════════════════════════════════════════════════════════╝');
console.log();

// Initialize optimizer
const optimizer = new LiveOptimizerController({
  paperTrading: true,
  maxConcurrentVariants: 4,
  profiles: ['default', 'conservative', 'aggressive', 'balanced']
});

// Simulate a bullish market scenario
console.log('📊 Simulating BULLISH market scenario...');
console.log();

// Strong buy indicators
const bullishIndicators = {
  rsi: 25,                  // Oversold
  williamsR: -85,           // Oversold
  macd: 5,
  macdHistogram: 2,
  ao: 3,
  ema50: 45000,
  ema200: 44000,            // Price above EMA200
  stochK: 15,
  stochD: 12,
  price: 45500,
  bollingerUpper: 46000,
  bollingerLower: 44000
};

// Entry at 50,000
console.log('1️⃣  Entry signal at $50,000...');
optimizer.onMarketUpdate('BTCUSDT', bullishIndicators, 50000);

// Show initial positions
let status = optimizer.getStatus();
console.log(`   Positions opened: ${Object.keys(status.variants).length} variants`);
console.log();

// Price moves up 1%
console.log('2️⃣  Price moves to $50,500 (+1%)...');
optimizer.onMarketUpdate('BTCUSDT', bullishIndicators, 50500);

// Price moves up 2%
console.log('3️⃣  Price moves to $51,000 (+2%)...');
optimizer.onMarketUpdate('BTCUSDT', bullishIndicators, 51000);

// Show performance
console.log();
console.log('📈 Performance Comparison:');
console.log('═══════════════════════════════════════════════════════════════');

const comparison = optimizer.getPerformanceComparison();
comparison.forEach((variant, index) => {
  console.log(`${index + 1}. ${variant.profile.padEnd(15)} | ` +
              `Trades: ${variant.tradesCount} | ` +
              `Win Rate: ${variant.winRate} | ` +
              `Avg ROI: ${variant.avgROI} | ` +
              `Net P&L: $${variant.totalNetPnl}`);
});

console.log('═══════════════════════════════════════════════════════════════');
console.log();

// Final status
status = optimizer.getStatus();
let totalTrades = 0;
let totalWins = 0;

Object.values(status.variants).forEach(variant => {
  totalTrades += variant.metrics.tradesCount;
  totalWins += variant.metrics.winCount;
});

console.log('✅ Summary:');
console.log(`   Total trades across all variants: ${totalTrades}`);
console.log(`   Total winning trades: ${totalWins}`);
console.log(`   Paper trading mode: ${status.paperTrading ? 'ENABLED ✓' : 'DISABLED'}`);
console.log();
console.log('💡 Tip: Enable in production with OPTIMIZER_ENABLED=true in .env');
console.log();
