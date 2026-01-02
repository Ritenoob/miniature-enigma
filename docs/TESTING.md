# Testing Guide

## Overview

The KuCoin Futures Trading Bot (v4.0) includes comprehensive test coverage with 174 tests covering all critical functionality.

## Running Tests

### Run All Tests
```bash
npm test
```

### Run Tests with Coverage (if configured)
```bash
npm run test:coverage
```

### Run Specific Test File
```bash
node --test tests/indicators/KDJIndicator.test.js
```

## Test Structure

### Test Organization
```
tests/
├── indicators/              # Technical indicator tests (43 tests)
│   ├── KDJIndicator.test.js      # 14 tests
│   ├── OBVIndicator.test.js      # 15 tests
│   └── ADXIndicator.test.js      # 14 tests
├── marketdata/              # Market data tests (18 tests)
│   └── DOMProcessor.test.js      # 18 tests
├── scoring/                 # Scoring module tests (7 tests)
│   └── DOMScoring.test.js        # 7 tests
├── configValidation.test.js      # Config validation (17 tests)
├── execution-simulator.test.js   # Execution simulation (13 tests)
├── live-optimizer.test.js        # Optimizer tests (10 tests)
├── ohlc-provider.test.js         # OHLC data tests (19 tests)
├── signal-generator.test.js      # Signal generation (12 tests)
├── stopStateMachine.test.js      # Stop order FSM (9 tests)
├── tradeMath.property.test.js    # Property-based tests (11 tests)
├── tradeMath.test.js             # Trade math tests (7 tests)
└── trailing-stop-policy.test.js  # Trailing stop (15 tests)
```

## Test Categories

### 1. Unit Tests

**Purpose**: Test individual components in isolation

**Examples**:
- Indicator calculations (RSI, MACD, KDJ, OBV, ADX)
- DOM processor features
- Signal scoring logic

**Best Practices**:
- Test one function at a time
- Mock external dependencies
- Clear test names describing what is tested

### 2. Integration Tests

**Purpose**: Test multiple components working together

**Examples**:
- Signal generator with multiple indicators
- DOM processor + DOM scoring
- Optimizer with execution simulator

**Best Practices**:
- Use realistic test data
- Test component interactions
- Verify data flows correctly

### 3. Property-Based Tests

**Purpose**: Test mathematical invariants and edge cases

**Location**: `tests/tradeMath.property.test.js`

**Examples**:
- SL price always less than entry for longs
- TP price always more than entry for longs
- Net PnL ≤ gross PnL (fees non-negative)
- Position value = margin × leverage

**Library**: fast-check

### 4. Safety Tests

**Purpose**: Verify safety constraints and error handling

**Examples**:
- DOM scoring requires LIVE_MODE
- Liquidation price beyond stop loss
- Order validation enforces reduceOnly

## Writing Tests

### Test Template

```javascript
const { test } = require('node:test');
const assert = require('node:assert');
const MyModule = require('../src/MyModule');

test('MyModule - does something correctly', () => {
  const instance = new MyModule({ config: 'value' });
  
  const result = instance.doSomething(input);
  
  assert.strictEqual(result, expectedValue);
});

test('MyModule - handles edge case', () => {
  const instance = new MyModule();
  
  assert.throws(() => {
    instance.doSomething(invalidInput);
  }, /expected error message/);
});
```

### Assertion Methods

- `assert.strictEqual(actual, expected)` - Strict equality (===)
- `assert.deepStrictEqual(actual, expected)` - Deep object comparison
- `assert.ok(value)` - Truthy check
- `assert.throws(fn, errorPattern)` - Function throws expected error
- `assert.notStrictEqual(actual, unexpected)` - Not equal

### Environment Variable Testing

For tests that require environment variables:

```javascript
function withEnv(key, value, fn) {
  const original = process.env[key];
  process.env[key] = value;
  try {
    fn();
  } finally {
    if (original === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = original;
    }
  }
}

test('requires LIVE_MODE', () => {
  withEnv('LIVE_MODE', 'true', () => {
    // Test with LIVE_MODE enabled
  });
});
```

## Test Coverage Goals

### Current Coverage (v4.0.0-alpha)
- ✅ **174 tests** passing
- ✅ **100% pass rate**
- ✅ All new indicators tested
- ✅ All DOM features tested
- ✅ All original features maintained

### Coverage Targets
- **Unit Tests**: 90%+ coverage of core logic
- **Integration Tests**: All feature combinations
- **Property Tests**: All mathematical invariants
- **Safety Tests**: All error conditions

## Continuous Integration

### GitHub Actions (if configured)

Tests run automatically on:
- Push to main branch
- Pull request creation
- Pull request updates

### Pre-commit Checks

Run tests before committing:
```bash
npm test && git commit -m "Your message"
```

## Test Data

### Realistic Market Data

Use realistic price/volume data in tests:

```javascript
const realisticCandles = [
  { high: 50100, low: 49900, close: 50000, volume: 1000000 },
  { high: 50200, low: 50000, close: 50100, volume: 1200000 },
  // ...
];
```

### Order Book Data

Use valid order book structures:

```javascript
const bids = [
  [50000, 10],  // [price, size]
  [49999, 5],
  [49998, 8]
];

const asks = [
  [50001, 8],
  [50002, 6],
  [50003, 7]
];
```

## Debugging Tests

### Run Single Test with Debug Output
```bash
NODE_OPTIONS='--inspect-brk' node --test tests/indicators/KDJIndicator.test.js
```

### Add Debug Logging
```javascript
test('debugging test', () => {
  const value = calculateSomething();
  console.log('Debug:', value);
  assert.ok(value > 0);
});
```

### Use Node.js Inspector
1. Run test with `--inspect-brk`
2. Open `chrome://inspect` in Chrome
3. Set breakpoints in test or source code

## Common Test Patterns

### Testing Incremental Updates

```javascript
test('indicator updates incrementally', () => {
  const indicator = new MyIndicator();
  
  for (let i = 0; i < 10; i++) {
    const result = indicator.update(testData[i]);
    // Verify result at each step
  }
});
```

### Testing Reset Behavior

```javascript
test('reset clears state', () => {
  const indicator = new MyIndicator();
  
  // Add data
  indicator.update(data);
  assert.ok(indicator.isReady());
  
  // Reset
  indicator.reset();
  assert.strictEqual(indicator.isReady(), false);
});
```

### Testing Input Validation

```javascript
test('validates input', () => {
  const processor = new MyProcessor();
  
  assert.throws(() => {
    processor.process('invalid');
  }, /requires valid input/);
});
```

## Performance Testing

### Benchmark Critical Paths

```javascript
test('processes 1000 candles quickly', () => {
  const indicator = new MyIndicator();
  const start = Date.now();
  
  for (let i = 0; i < 1000; i++) {
    indicator.update({ close: 50000 + i });
  }
  
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 100, 'Should process in < 100ms');
});
```

## Test Maintenance

### When to Update Tests

1. **Bug Fixes**: Add test that reproduces bug first
2. **New Features**: Write tests before implementing
3. **Refactoring**: Verify tests still pass
4. **Breaking Changes**: Update affected tests

### Test Quality Checklist

- [ ] Test names clearly describe what is tested
- [ ] Tests are independent (no shared state)
- [ ] Edge cases covered
- [ ] Error conditions tested
- [ ] Realistic test data used
- [ ] Tests run quickly (< 100ms each)
- [ ] No console warnings or errors

## Troubleshooting

### Tests Fail After Changes

1. Check if breaking change was intentional
2. Update tests to match new behavior
3. Verify all related tests updated
4. Check test isolation (no shared state)

### Tests Pass Locally, Fail in CI

1. Check environment variables
2. Verify Node.js version matches
3. Check for timing issues (use fixed delays)
4. Look for file system differences

### Slow Tests

1. Profile test execution time
2. Remove unnecessary delays
3. Mock external dependencies
4. Use smaller test data sets
5. Run expensive tests in separate suite

## Resources

- **Node.js Test Runner**: https://nodejs.org/api/test.html
- **fast-check**: https://github.com/dubzzz/fast-check
- **Assert Module**: https://nodejs.org/api/assert.html

## Next Steps

1. Run `npm test` to verify current state
2. Review test output for any warnings
3. Add tests for new features
4. Maintain 100% pass rate
5. Consider adding E2E tests for server.js
