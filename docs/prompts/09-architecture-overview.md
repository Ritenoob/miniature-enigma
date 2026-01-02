# Prompt: Architecture Overview

## Objective
High-level system design documentation for the Live Optimizer System - architecture patterns, data flow, and design decisions.

## System Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Server.js (Main Process)                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────┐         ┌──────────────────────┐         │
│  │   Main Strategy      │         │  LiveOptimizer       │         │
│  │   Execution          │         │  Controller          │         │
│  │                      │         │                      │         │
│  │  - Signal Gen        │         │  - Variant Mgmt      │         │
│  │  - Position Mgmt     │         │  - Parallel Exec     │         │
│  │  - Order Execution   │         │  - Perf Tracking     │         │
│  └──────────┬───────────┘         └──────────┬───────────┘         │
│             │                                 │                     │
│             └────────────┬────────────────────┘                     │
│                          │                                          │
│                          ▼                                          │
│              ┌───────────────────────┐                              │
│              │   Market Data Feed    │                              │
│              │   (WebSocket)         │                              │
│              └───────────┬───────────┘                              │
│                          │                                          │
│         ┌────────────────┼────────────────┐                        │
│         │                │                │                        │
│         ▼                ▼                ▼                        │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐                      │
│  │ Variant  │   │ Variant  │   │ Variant  │                      │
│  │    1     │   │    2     │   │    N     │                      │
│  └────┬─────┘   └────┬─────┘   └────┬─────┘                      │
│       │              │              │                              │
│       └──────────────┼──────────────┘                              │
│                      │                                              │
│                      ▼                                              │
│           ┌──────────────────────┐                                 │
│           │  ScoringEngine       │                                 │
│           │  (Performance Eval)  │                                 │
│           └──────────┬───────────┘                                 │
│                      │                                              │
│                      ▼                                              │
│           ┌──────────────────────┐                                 │
│           │  TelemetryFeed       │                                 │
│           │  (Metrics Stream)    │                                 │
│           └──────────┬───────────┘                                 │
│                      │                                              │
└──────────────────────┼──────────────────────────────────────────────┘
                       │
                       ▼
              ┌────────────────┐
              │   Dashboard    │
              │   (WebSocket)  │
              └────────────────┘
```

### Module Structure

```
src/
├── optimizer/
│   ├── LiveOptimizerController.js    # Main orchestration
│   ├── OptimizerConfig.js            # Variant generation
│   ├── ScoringEngine.js              # Performance evaluation
│   ├── TelemetryFeed.js              # Metrics streaming
│   └── StrategyVariant.js            # Individual variant executor
├── lib/
│   ├── StopReplaceCoordinator.js     # Safe stop management (PR #6)
│   ├── PingBudgetManager.js          # Rate limiting (PR #8)
│   └── TradeMath.js                  # Financial calculations
└── ...

tests/
└── optimizer/
    ├── OptimizerConfig.test.js
    ├── ScoringEngine.test.js
    ├── LiveOptimizerController.test.js
    └── integration.test.js

docs/
└── prompts/
    ├── README.md
    ├── 01-live-optimizer-controller.md
    ├── 02-strategy-engine-integration.md
    └── ...
```

## Data Flow

### Market Data Flow

```
KuCoin WebSocket
      │
      ▼
  Parse & Validate
      │
      ├─────────────────────┐
      │                     │
      ▼                     ▼
Main Strategy      LiveOptimizerController
      │                     │
      │              ┌──────┴──────┐
      │              │             │
      │              ▼             ▼
      │          Variant 1    Variant N
      │              │             │
      │              └──────┬──────┘
      │                     │
      ▼                     ▼
  Execute Real        Execute Paper/Small
  Trades              Trades
      │                     │
      └─────────┬───────────┘
                │
                ▼
          Trade Logging
```

### Signal Generation Flow

```
Market Data
    │
    ▼
Technical Indicators
    │
    ├─────────────────────┐
    │                     │
    ▼                     ▼
Main Weights      Variant Weights
    │                     │
    ▼                     ▼
Main Signal       Variant Signal
    │                     │
    │                     ▼
    │              Signal Metadata
    │              (Tag with variant ID)
    │                     │
    └─────────┬───────────┘
              │
              ▼
      Trade Execution
```

## Design Decisions

### 1. Parallel Execution Model

**Decision**: Run variants in parallel using async/await, not separate processes

**Rationale**:
- Lower overhead than process forking
- Easier to share market data feed
- Simpler state management
- Adequate isolation with proper error handling

**Trade-offs**:
- Risk of one variant affecting others (mitigated with try-catch)
- Shared event loop (mitigated with setImmediate)

### 2. Paper Trading First

**Decision**: Default to paper trading, require explicit opt-in for real mode

**Rationale**:
- Safety by default
- Easy testing
- No financial risk during development
- Can validate metrics before real trading

**Implementation**:
```javascript
paperTrading: config.paperTrading !== false  // Default true
```

### 3. Event-Driven Architecture

**Decision**: Use EventEmitter for variant lifecycle and telemetry

**Rationale**:
- Loose coupling between components
- Easy to add monitoring/logging
- Supports real-time dashboard updates
- Familiar Node.js pattern

**Events**:
- `variantStarted`
- `variantStopped`
- `tradeExecuted`
- `metricsUpdate`
- `promotionCandidate`

### 4. Isolated State Per Variant

**Decision**: Each variant maintains its own state (position, trades, metrics)

**Rationale**:
- No shared mutable state
- Easy to parallelize
- Independent failure domains
- Simple to reason about

**State Structure**:
```javascript
{
  id: 'unique_id',
  config: {...},
  position: {...},
  trades: [...],
  metrics: {...}
}
```

### 5. Statistical Confidence Gating

**Decision**: Require minimum sample size and statistical confidence before promotion

**Rationale**:
- Avoid overfitting to small samples
- Reduce false positives
- Align with scientific method
- Regulatory compliance (audit trail)

**Thresholds**:
- Min 50 trades
- Min 0.95 confidence
- Positive Sharpe ratio
- Outperforms baseline

### 6. Separate Logging

**Decision**: Log experimental trades to separate file

**Rationale**:
- Easy to analyze optimizer performance
- Don't pollute main trade log
- Can replay for debugging
- Audit compliance

**Files**:
- `trades.json` - Main strategy
- `experimental-trades.json` - Optimizer variants

## Scalability Considerations

### Current Limits
- **Variants**: 5-10 concurrent (configurable)
- **Memory**: ~100MB per variant
- **CPU**: ~2% per variant
- **API Calls**: Shared budget via PingBudgetManager

### Scaling Up
To support more variants:
1. Implement variant batching (rotate active set)
2. Use worker threads for CPU isolation
3. Implement variant pause/resume
4. Add priority scheduling (promote best performers)

### Scaling Out
For multi-symbol optimization:
1. Run separate optimizer per symbol
2. Share PingBudgetManager across all
3. Global rate limit coordinator
4. Distributed telemetry aggregation

## Security Considerations

### API Key Protection
- Never log API keys
- Use environment variables
- Validate before use
- Rotate regularly

### Order Safety
- Always use `reduceOnly: true` for exits
- Validate order params before submission
- Use StopReplaceCoordinator for stop orders
- Implement emergency stop mechanism

### Rate Limiting
- Use PingBudgetManager for all API calls
- Respect exchange rate limits
- Implement backoff on 429 errors
- Monitor quota usage

## Performance Optimization

### Hot Path Optimization
- Cache indicator calculations
- Reuse WebSocket connection
- Batch API calls when possible
- Use object pooling for frequent allocations

### Memory Management
- Limit trade history size per variant
- Periodically garbage collect stopped variants
- Use circular buffers for market data
- Profile memory usage regularly

### CPU Optimization
- Defer variant processing with setImmediate
- Use parallel Promise.all for independent operations
- Avoid blocking operations in hot path
- Profile with `node --prof` regularly

## Monitoring and Observability

### Key Metrics
- Variants active/stopped
- Avg ROI per variant
- Trades executed (experimental vs main)
- API rate limit usage
- Memory/CPU usage
- Error rates

### Dashboards
- Real-time telemetry feed
- Performance rankings
- Trade history
- System health

### Alerts
- Variant crash rate > 10%
- Memory usage > 80%
- API rate limit exceeded
- Emergency stop triggered
- Negative ROI across all variants

## Testing Strategy

### Unit Tests
- Individual module functionality
- Edge cases
- Error handling

### Integration Tests
- Component interaction
- Market data flow
- API integration

### Property Tests
- Invariants (e.g., weights sum to 1.0)
- Monotonic properties (e.g., stop prices)

### Load Tests
- 1000+ ticks per second
- Memory leak detection
- CPU spike detection

## Deployment Strategy

### Phases
1. **Development**: Local with mock data
2. **Staging**: Production-like with paper trading
3. **Beta**: Production with 1-2 variants, paper mode
4. **Production**: Full rollout with 5+ variants, paper mode
5. **Live Trading**: After 1 week validation, 1% position sizes

### Rollback
- Feature flag: `OPTIMIZER_ENABLED`
- Emergency stop: POST `/api/optimizer/stop`
- Full disable: Restart with flag disabled

## Future Enhancements

### Short Term
- Genetic algorithm for variant evolution
- Multi-objective optimization (ROI + Sharpe + Drawdown)
- Variant pause/resume

### Medium Term
- Multi-symbol support
- Strategy templates library
- Performance forecasting

### Long Term
- Machine learning integration
- Distributed optimization
- Cloud deployment
