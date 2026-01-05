#!/usr/bin/env node
/**
 * Generate Report Script
 * 
 * Generates comprehensive performance reports from backtest/optimization results.
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Generate HTML report
 * @param {Object} data - Report data
 * @returns {string} - HTML string
 */
function generateHTML(data) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Strategy Performance Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 30px;
      border-radius: 10px;
      margin-bottom: 20px;
    }
    .section {
      background: white;
      padding: 20px;
      border-radius: 10px;
      margin-bottom: 20px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .metric {
      display: inline-block;
      margin: 10px 20px 10px 0;
    }
    .metric-label {
      color: #666;
      font-size: 12px;
      text-transform: uppercase;
    }
    .metric-value {
      font-size: 24px;
      font-weight: bold;
      color: #333;
    }
    .metric-value.positive { color: #10b981; }
    .metric-value.negative { color: #ef4444; }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #eee;
    }
    th {
      background: #f9fafb;
      font-weight: 600;
    }
    .config-box {
      background: #f9fafb;
      padding: 15px;
      border-radius: 5px;
      margin: 10px 0;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Strategy Performance Report</h1>
    <p>Generated: ${new Date().toLocaleString()}</p>
  </div>

  <div class="section">
    <h2>Summary Metrics</h2>
    <div class="metric">
      <div class="metric-label">Total Return</div>
      <div class="metric-value ${data.returnPercent >= 0 ? 'positive' : 'negative'}">
        ${data.returnPercent?.toFixed(2) || 'N/A'}%
      </div>
    </div>
    <div class="metric">
      <div class="metric-label">Win Rate</div>
      <div class="metric-value">${data.winRate?.toFixed(2) || 'N/A'}%</div>
    </div>
    <div class="metric">
      <div class="metric-label">Profit Factor</div>
      <div class="metric-value">${data.profitFactor?.toFixed(2) || 'N/A'}</div>
    </div>
    <div class="metric">
      <div class="metric-label">Max Drawdown</div>
      <div class="metric-value negative">${data.maxDrawdown?.toFixed(2) || 'N/A'}%</div>
    </div>
    <div class="metric">
      <div class="metric-label">Sharpe Ratio</div>
      <div class="metric-value">${data.sharpeRatio?.toFixed(2) || 'N/A'}</div>
    </div>
  </div>

  <div class="section">
    <h2>Configuration</h2>
    <div class="config-box">
      <pre>${JSON.stringify(data.config || {}, null, 2)}</pre>
    </div>
  </div>

  ${data.topConfigs ? `
  <div class="section">
    <h2>Top Configurations</h2>
    <table>
      <thead>
        <tr>
          <th>Rank</th>
          <th>Return %</th>
          <th>Sharpe</th>
          <th>Win Rate %</th>
          <th>Leverage</th>
          <th>Profile</th>
        </tr>
      </thead>
      <tbody>
        ${data.topConfigs.slice(0, 10).map((config, i) => `
        <tr>
          <td>${i + 1}</td>
          <td>${config.metrics.returnPercent.toFixed(2)}</td>
          <td>${config.metrics.sharpe.toFixed(2)}</td>
          <td>${config.metrics.winRate.toFixed(2)}</td>
          <td>${config.config.leverage}x</td>
          <td>${config.config.signalProfile}</td>
        </tr>
        `).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}
</body>
</html>
`;
}

/**
 * Generate report from latest results
 */
async function generateReport() {
  console.log('Generating performance report...\n');

  const reportsDir = path.join(__dirname, '../reports');
  const configsDir = path.join(__dirname, '../configs');

  // Find latest backtest results
  let backtestData = null;
  try {
    const files = await fs.readdir(reportsDir);
    const backtestFiles = files.filter(f => f.startsWith('backtest_')).sort().reverse();
    if (backtestFiles.length > 0) {
      const data = await fs.readFile(path.join(reportsDir, backtestFiles[0]), 'utf8');
      backtestData = JSON.parse(data);
    }
  } catch (error) {
    console.log('No backtest results found');
  }

  // Find latest optimization results
  let optimizationData = null;
  try {
    const files = await fs.readdir(configsDir);
    const topFiles = files.filter(f => f.startsWith('top20_')).sort().reverse();
    if (topFiles.length > 0) {
      const data = await fs.readFile(path.join(configsDir, topFiles[0]), 'utf8');
      optimizationData = JSON.parse(data);
    }
  } catch (error) {
    console.log('No optimization results found');
  }

  if (!backtestData && !optimizationData) {
    console.error('No results found. Run backtest or optimization first.');
    process.exit(1);
  }

  // Prepare report data
  const reportData = {
    ...(backtestData?.metrics || {}),
    config: backtestData?.config || {},
    topConfigs: optimizationData || []
  };

  // Generate HTML report
  const html = generateHTML(reportData);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const reportPath = path.join(reportsDir, `report_${timestamp}.html`);
  
  await fs.writeFile(reportPath, html);
  
  console.log(`✓ Report generated: ${reportPath}`);
  console.log(`\nOpen in browser to view.`);
}

// Run if called directly
if (require.main === module) {
  generateReport().catch(error => {
    console.error('Fatal error:', error);
    console.error(error.stack);
    process.exit(1);
  });
}

module.exports = { generateReport };
