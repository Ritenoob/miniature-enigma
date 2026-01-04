# Testing Guidelines

This document provides guidelines for writing and maintaining tests in this project.

## Property-Based Testing Guidelines

### fast-check Constraints

When using `fc.float()` with min/max constraints, always wrap literal values with `Math.fround()`:

✅ **Correct:**
```javascript
fc.float({ min: Math.fround(100), max: Math.fround(1000), noNaN: true })
```

❌ **Incorrect:**
```javascript
fc.float({ min: 100, max: 1000, noNaN: true })  // Will fail - 100 and 1000 are doubles
```

**Why:** fast-check enforces that fc.float constraints must be valid 32-bit floats. JavaScript numbers are 64-bit doubles by default. Math.fround() converts them to 32-bit floats.

### Examples

#### Basic Float Constraint
```javascript
// Generate random 32-bit float between 0.1 and 100
fc.float({ 
  min: Math.fround(0.1), 
  max: Math.fround(100), 
  noNaN: true 
})
```

#### Multiple Float Constraints in a Property Test
```javascript
test('example property test', () => {
  fc.assert(
    fc.property(
      fc.float({ min: Math.fround(100), max: Math.fround(100000), noNaN: true }),
      fc.float({ min: Math.fround(0.1), max: Math.fround(50), noNaN: true }),
      fc.integer({ min: 1, max: 100 }),
      (price, percentage, leverage) => {
        // Your property test logic here
        return true;
      }
    ),
    { numRuns: 100 }
  );
});
```

#### Negative Values
```javascript
// For ranges that include negative values
fc.float({ 
  min: Math.fround(-100), 
  max: Math.fround(100), 
  noNaN: true 
})
```

### Common Pitfalls

1. **Forgetting Math.fround()**: This will cause a runtime error in fast-check v3.15+
2. **Not using noNaN**: Always include `noNaN: true` unless you specifically need to test NaN behavior
3. **Precision issues**: Remember that 32-bit floats have less precision than 64-bit doubles

### Running Property-Based Tests

Run all property-based tests:
```bash
npm test tests/tradeMath.property.test.js
```

Run all tests:
```bash
npm test
```

### Best Practices

1. **Add preventive comments**: Include a comment at the top of property test files:
   ```javascript
   // IMPORTANT: When using fc.float(), wrap all min/max values with Math.fround()
   // Example: fc.float({ min: Math.fround(0.1), max: Math.fround(100) })
   ```

2. **Use appropriate ranges**: Choose min/max values that make sense for your domain
   - Price values: `Math.fround(100)` to `Math.fround(100000)`
   - Percentages: `Math.fround(0.1)` to `Math.fround(100)`
   - Small decimals: `Math.fround(0.0001)` to `Math.fround(0.01)`

3. **Test edge cases**: Include tests for boundary values and negative ranges where applicable

4. **Document assumptions**: Add comments explaining what property is being tested

### Additional Resources

- [fast-check documentation](https://github.com/dubzzz/fast-check)
- [Property-based testing introduction](https://github.com/dubzzz/fast-check/blob/main/documentation/Arbitraries.md)
- [Math.fround() on MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/fround)
