#!/usr/bin/env node
/**
 * EXPORT SIGNALS
 * Export screener signals to various formats
 */

const fs = require('fs');
const path = require('path');

console.log('═══════════════════════════════════════');
console.log('  MIRKO V3.5 Signal Exporter');
console.log('═══════════════════════════════════════\n');

const args = process.argv.slice(2);
const inputFile = args.find(a => a.startsWith('--input='))?.split('=')[1] || './logs/screener-signals.jsonl';
const outputFile = args.find(a => a.startsWith('--output='))?.split('=')[1] || './logs/signals-export.csv';
const format = args.find(a => a.startsWith('--format='))?.split('=')[1] || 'csv';

console.log(`Input:  ${inputFile}`);
console.log(`Output: ${outputFile}`);
console.log(`Format: ${format}`);
console.log('');

if (!fs.existsSync(inputFile)) {
  console.error(`❌ Input file not found: ${inputFile}`);
  process.exit(1);
}

try {
  // Read JSONL file
  const content = fs.readFileSync(inputFile, 'utf8');
  const lines = content.trim().split('\n');
  const signals = lines.map(line => JSON.parse(line));

  console.log(`Read ${signals.length} signals`);

  if (format === 'csv') {
    // Export as CSV
    const header = 'timestamp,pair,timeframe,signal,strength,score\n';
    const rows = signals.map(s => 
      `${new Date(s.timestamp).toISOString()},${s.pair},${s.timeframe},${s.signal},${s.strength},${s.score.toFixed(2)}`
    ).join('\n');

    fs.writeFileSync(outputFile, header + rows);
  } else if (format === 'json') {
    // Export as JSON
    fs.writeFileSync(outputFile, JSON.stringify(signals, null, 2));
  } else {
    console.error(`❌ Unknown format: ${format}`);
    process.exit(1);
  }

  console.log(`✅ Exported to ${outputFile}`);
} catch (err) {
  console.error(`❌ Error: ${err.message}`);
  process.exit(1);
}
