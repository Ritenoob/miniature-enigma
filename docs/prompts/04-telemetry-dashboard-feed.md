# Prompt: Telemetry Dashboard Feed

## Objective
Generate `src/optimizer/TelemetryFeed.js` - real-time metrics streaming to dashboard for monitoring optimizer performance.

## System Context
- **Base**: MIRKO V3.6.1+ KuCoin Futures Bot
- **Language**: Node.js ES6+
- **Transport**: WebSocket (Socket.IO recommended)
- **Purpose**: Stream live metrics to frontend dashboard

## Requirements

### 1. Telemetry Feed Class

```javascript
const EventEmitter = require('events');

class TelemetryFeed extends EventEmitter {
  constructor(optimizerController) {
    super();
    this.optimizer = optimizerController;
    this.updateInterval = 5000; // 5 seconds
    this.clients = new Set();
    this.isRunning = false;
  }

  start() {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.updateLoop();
  }

  stop() {
    this.isRunning = false;
  }

  async updateLoop() {
    while (this.isRunning) {
      const telemetry = this.collectTelemetry();
      this.broadcast(telemetry);
      
      await this.sleep(this.updateInterval);
    }
  }

  collectTelemetry() {
    const results = this.optimizer.getResults();
    const topPerformers = this.optimizer.getTopPerformers(3);
    
    return {
      timestamp: Date.now(),
      variants: results.map(v => ({
        id: v.id,
        status: v.status,
        metrics: {
          roi: v.metrics.roi.toFixed(2),
          winRate: v.metrics.winRate.toFixed(2),
          sharpe: v.metrics.sharpe.toFixed(3),
          maxDrawdown: v.metrics.maxDrawdown.toFixed(2),
          totalTrades: v.metrics.totalTrades
        },
        recentTrades: v.trades.slice(-5) // Last 5 trades
      })),
      topPerformers: topPerformers.map(v => ({
        id: v.id,
        roi: v.metrics.roi,
        sharpe: v.metrics.sharpe
      })),
      summary: {
        totalVariants: results.length,
        activeVariants: results.filter(v => v.status === 'active').length,
        avgROI: this.calculateAverage(results.map(v => v.metrics.roi)),
        avgSharpe: this.calculateAverage(results.map(v => v.metrics.sharpe))
      }
    };
  }

  calculateAverage(values) {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  broadcast(data) {
    this.emit('telemetry', data);
    
    // Send to all connected WebSocket clients
    for (const client of this.clients) {
      try {
        client.send(JSON.stringify({
          type: 'optimizer_telemetry',
          data
        }));
      } catch (err) {
        console.error('Telemetry broadcast error:', err);
        this.clients.delete(client);
      }
    }
  }

  addClient(wsClient) {
    this.clients.add(wsClient);
    
    // Send initial state
    const telemetry = this.collectTelemetry();
    wsClient.send(JSON.stringify({
      type: 'optimizer_telemetry',
      data: telemetry
    }));
  }

  removeClient(wsClient) {
    this.clients.delete(wsClient);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = TelemetryFeed;
```

### 2. WebSocket Integration in server.js

```javascript
const TelemetryFeed = require('./src/optimizer/TelemetryFeed');

let telemetryFeed = null;

if (OPTIMIZER_ENABLED && optimizerController) {
  telemetryFeed = new TelemetryFeed(optimizerController);
  
  // Start when optimizer starts
  optimizerController.on('started', () => {
    telemetryFeed.start();
  });
  
  optimizerController.on('stopped', () => {
    telemetryFeed.stop();
  });
}

// WebSocket handler for telemetry
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  if (telemetryFeed) {
    telemetryFeed.addClient(ws);
  }
  
  ws.on('close', () => {
    if (telemetryFeed) {
      telemetryFeed.removeClient(ws);
    }
  });
});
```

### 3. Frontend Dashboard HTML

Add to `index.html`:

```html
<!-- Optimizer Telemetry Section -->
<div id="optimizer-section" style="display: none;">
  <h2>Live Optimizer Status</h2>
  
  <div id="optimizer-summary">
    <span>Total Variants: <strong id="total-variants">0</strong></span>
    <span>Active: <strong id="active-variants">0</strong></span>
    <span>Avg ROI: <strong id="avg-roi">0%</strong></span>
    <span>Avg Sharpe: <strong id="avg-sharpe">0</strong></span>
  </div>
  
  <h3>Top Performers</h3>
  <table id="top-performers-table">
    <thead>
      <tr>
        <th>Variant ID</th>
        <th>ROI</th>
        <th>Sharpe</th>
        <th>Win Rate</th>
        <th>Trades</th>
      </tr>
    </thead>
    <tbody id="top-performers-body">
    </tbody>
  </table>
  
  <h3>All Variants</h3>
  <div id="variants-list"></div>
</div>

<script>
// WebSocket connection for telemetry
let telemetryWs = null;

function connectTelemetry() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  telemetryWs = new WebSocket(`${protocol}//${window.location.host}`);
  
  telemetryWs.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    
    if (msg.type === 'optimizer_telemetry') {
      updateOptimizerDashboard(msg.data);
    }
  };
  
  telemetryWs.onclose = () => {
    console.log('Telemetry connection closed, reconnecting...');
    setTimeout(connectTelemetry, 5000);
  };
}

function updateOptimizerDashboard(data) {
  // Show optimizer section
  document.getElementById('optimizer-section').style.display = 'block';
  
  // Update summary
  document.getElementById('total-variants').textContent = data.summary.totalVariants;
  document.getElementById('active-variants').textContent = data.summary.activeVariants;
  document.getElementById('avg-roi').textContent = data.summary.avgROI.toFixed(2) + '%';
  document.getElementById('avg-sharpe').textContent = data.summary.avgSharpe.toFixed(3);
  
  // Update top performers
  const tbody = document.getElementById('top-performers-body');
  tbody.innerHTML = '';
  
  data.topPerformers.forEach(variant => {
    const row = tbody.insertRow();
    row.innerHTML = `
      <td>${variant.id.substring(0, 8)}</td>
      <td class="${variant.roi >= 0 ? 'positive' : 'negative'}">${variant.roi.toFixed(2)}%</td>
      <td>${variant.sharpe.toFixed(3)}</td>
      <td>${variant.winRate.toFixed(2)}%</td>
      <td>${variant.totalTrades}</td>
    `;
  });
}

// Connect on page load
connectTelemetry();
</script>

<style>
#optimizer-section {
  margin-top: 20px;
  padding: 15px;
  border: 1px solid #ddd;
  border-radius: 5px;
}

#optimizer-summary {
  display: flex;
  gap: 20px;
  margin-bottom: 20px;
}

#top-performers-table {
  width: 100%;
  border-collapse: collapse;
}

#top-performers-table th,
#top-performers-table td {
  padding: 8px;
  text-align: left;
  border-bottom: 1px solid #ddd;
}

.positive {
  color: green;
}

.negative {
  color: red;
}
</style>
```

## Testing Requirements
- Test telemetry collection accuracy
- Test WebSocket broadcasting
- Test client connection/disconnection
- Test update frequency
- Test data formatting

## Integration Points
- Integrates with LiveOptimizerController
- Uses WebSocket for real-time updates
- Feeds data to dashboard UI

## Safety Notes
- Rate limit telemetry updates (default 5s)
- Handle client disconnections gracefully
- Avoid sending sensitive config data
- Log telemetry errors without disrupting optimizer
