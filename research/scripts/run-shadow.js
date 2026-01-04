#!/usr/bin/env node

/**
 * Run Shadow Runner Script
 * 
 * Example script to demonstrate shadow runner usage.
 * This runs strategy configs against live data without placing real orders.
 */

const { ShadowRunner, ShadowRunnerConfig } = require('../forward/shadow-runner');
const { DOMCollector } = require('../forward/dom-collector');
const { LiveMetrics } = require('../forward/live-metrics');

async function main() {
  console.log('Shadow Runner - Live Strategy Testing (Paper Trading)\n');
  
  // Example configurations to test
  const configs = [
    { name: 'aggressive-v1', /* ... config details ... */ },
    { name: 'conservative-v1', /* ... config details ... */ },
    { name: 'balanced-v1', /* ... config details ... */ }
  ];
  
  // Create shadow runner config
  const shadowConfig = new ShadowRunnerConfig({
    configs,
    symbols: ['ETHUSDTM', 'BTCUSDTM', 'SOLUSDTM'],
    enableDom: process.env.ENABLE_DOM === 'true',
    fillModel: 'taker',
    slippageModel: 'spread_based',
    outputDir: './research/output'
  });
  
  // Initialize components
  const shadowRunner = new ShadowRunner(shadowConfig);
  const liveMetrics = new LiveMetrics();
  
  // Setup event listeners
  shadowRunner.on('connected', () => {
    console.log('✓ Shadow runner connected');
  });
  
  shadowRunner.on('tradeRecorded', ({ configName, trade }) => {
    console.log(`📊 Trade recorded for ${configName}: ${trade.side} ${trade.symbol} @ ${trade.entryPrice}`);
  });
  
  shadowRunner.on('runComplete', ({ durationMs, totalTrades }) => {
    console.log(`\n✓ Run completed: ${totalTrades} hypothetical trades in ${durationMs / 1000}s`);
  });
  
  try {
    // Connect to live feeds
    await shadowRunner.connect();
    
    // Run for specified duration (e.g., 5 minutes)
    const durationMs = parseInt(process.env.DURATION_MS || '300000', 10);
    console.log(`Running shadow test for ${durationMs / 1000}s...\n`);
    
    await shadowRunner.runShadow(durationMs);
    
    // Print results
    shadowRunner.printLeaderboard();
    liveMetrics.printSummary();
    
    // Disconnect
    await shadowRunner.disconnect();
    
    console.log('✓ Shadow run complete. Results saved to output directory.');
    
  } catch (error) {
    console.error('Error running shadow:', error);
    process.exit(1);
  } finally {
    liveMetrics.destroy();
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { main };
