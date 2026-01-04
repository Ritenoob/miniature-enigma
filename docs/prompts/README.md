# Live Optimizer System - Prompt Pack

## Overview
Comprehensive implementation prompts for building a live signal optimization system that runs parallel strategy experiments with the MIRKO V3.6.1+ trading bot.

## System Architecture
```
┌─────────────────────────────────────────────────────────┐
│                    Main Trading Loop                     │
│  (KuCoin API, WebSocket Feed, Position Management)      │
└─────────────────┬───────────────────────────────────────┘
                  │
                  ▼
        ┌─────────────────────┐
        │  Live Market Data   │
        │   (Price + Volume)  │
        └──────────┬──────────┘
                   │
        ┌──────────┴──────────┐
        │                     │
        ▼                     ▼
┌──────────────┐    ┌────────────────────┐
│   Main       │    │ LiveOptimizer      │
│   Strategy   │    │ Controller         │
│              │    │  (N variants)      │
└──────────────┘    └─────────┬──────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
              ┌─────▼──────┐    ┌──────▼──────┐
              │  Scoring   │    │ Telemetry   │
              │  Engine    │    │   Feed      │
              └────────────┘    └─────────────┘
```

## Implementation Order
1. **03-optimizer-config-manager.md** - Configuration foundation
2. **01-live-optimizer-controller.md** - Core parallel execution
3. **04-telemetry-dashboard-feed.md** - Real-time monitoring
4. **05-scoring-confidence-gating.md** - Performance evaluation
5. **02-strategy-engine-integration.md** - Hook into server.js
6. **06-signal-metadata-tagging.md** - Experimental tracking
7. **08-testing-deployment.md** - Validation and deployment

## Features
- ✅ Parallel strategy testing without main loop interruption
- ✅ Real-time performance metrics (ROI, Sharpe, win rate)
- ✅ Automatic strategy promotion based on confidence thresholds
- ✅ Paper trading by default (DEMO_MODE compatible)
- ✅ Rate limit compliance via PingBudgetManager
- ✅ Safety: loss limits, drawdown protection, emergency stops

## Quick Start
```bash
# Enable optimizer
export OPTIMIZER_ENABLED=true
export OPTIMIZER_MODE=paper  # or 'live' for real trades

# Start bot with optimizer
npm start
```

## API Endpoints
```
GET  /api/optimizer/status   # Current experiments
GET  /api/optimizer/results  # Performance rankings
POST /api/optimizer/start    # Begin testing
POST /api/optimizer/stop     # Halt experiments
POST /api/optimizer/promote  # Apply winning strategy
```

## File Manifest
- `01-live-optimizer-controller.md` - Main controller implementation
- `02-strategy-engine-integration.md` - Server.js integration
- `03-optimizer-config-manager.md` - Configuration module
- `04-telemetry-dashboard-feed.md` - Metrics streaming
- `05-scoring-confidence-gating.md` - Strategy evaluation
- `06-signal-metadata-tagging.md` - Experimental signal tracking
- `07-stop-order-state-machine.md` - Safe order management
- `08-testing-deployment.md` - Test coverage and validation
- `09-architecture-overview.md` - System design details

## Safety Considerations
⚠️ **CRITICAL**: Always start with `OPTIMIZER_MODE=paper`  
⚠️ Real trading requires explicit `OPTIMIZER_MODE=live` + testing  
⚠️ Monitor `/api/optimizer/status` for anomalies  
⚠️ Emergency stop: POST to `/api/optimizer/stop`
