/**
 * Basic Tests for Research Module Indicators
 */

import { describe, test, expect } from '@jest/globals';
import { KDJIndicator } from '../lib/indicators/kdj';
import { ADXIndicator } from '../lib/indicators/adx';
import { OBVIndicator } from '../lib/indicators/obv';

describe('KDJ Indicator', () => {
  test('calculates KDJ with valid data', () => {
    const highs = [102, 103, 104, 105, 106, 107, 108, 109, 110, 111];
    const lows = [98, 99, 100, 101, 102, 103, 104, 105, 106, 107];
    const closes = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109];
    
    const result = KDJIndicator.calculate(highs, lows, closes, 9);
    
    expect(result.k).toBeGreaterThanOrEqual(0);
    expect(result.k).toBeLessThanOrEqual(100);
    expect(result.d).toBeGreaterThanOrEqual(0);
    expect(result.d).toBeLessThanOrEqual(100);
    expect(result.j).toBeGreaterThanOrEqual(-20);
    expect(result.j).toBeLessThanOrEqual(120);
  });
  
  test('returns neutral values with insufficient data', () => {
    const highs = [102, 103, 104];
    const lows = [98, 99, 100];
    const closes = [100, 101, 102];
    
    const result = KDJIndicator.calculate(highs, lows, closes, 9);
    
    expect(result.k).toBe(50);
    expect(result.d).toBe(50);
    expect(result.j).toBe(50);
  });
  
  test('identifies bullish signal in oversold', () => {
    const highs = Array(20).fill(100);
    const lows = Array(20).fill(90);
    const closes = Array(20).fill(91); // Near lows = oversold
    
    const result = KDJIndicator.calculate(highs, lows, closes, 9);
    const signal = KDJIndicator.getSignal(result);
    
    expect(signal.signal).toBe('bullish');
  });
});

describe('ADX Indicator', () => {
  test('calculates ADX with valid data', () => {
    const highs = Array.from({ length: 30 }, (_, i) => 100 + i * 0.5);
    const lows = Array.from({ length: 30 }, (_, i) => 98 + i * 0.5);
    const closes = Array.from({ length: 30 }, (_, i) => 99 + i * 0.5);
    
    const result = ADXIndicator.calculate(highs, lows, closes, 14);
    
    expect(result.adx).toBeGreaterThanOrEqual(0);
    expect(result.adx).toBeLessThanOrEqual(100);
    expect(result.diPlus).toBeGreaterThanOrEqual(0);
    expect(result.diPlus).toBeLessThanOrEqual(100);
    expect(result.diMinus).toBeGreaterThanOrEqual(0);
    expect(result.diMinus).toBeLessThanOrEqual(100);
  });
  
  test('returns zero with insufficient data', () => {
    const highs = [102, 103];
    const lows = [98, 99];
    const closes = [100, 101];
    
    const result = ADXIndicator.calculate(highs, lows, closes, 14);
    
    expect(result.adx).toBe(0);
    expect(result.diPlus).toBe(0);
    expect(result.diMinus).toBe(0);
  });
  
  test('classifies trending vs ranging regime', () => {
    expect(ADXIndicator.getRegime(30)).toBe('trending');
    expect(ADXIndicator.getRegime(15)).toBe('ranging');
  });
  
  test('detects bullish trend direction', () => {
    const result = { adx: 30, diPlus: 35, diMinus: 15 };
    const signal = ADXIndicator.getDirectionalSignal(result);
    
    expect(signal.direction).toBe('bullish');
    expect(signal.strength).toBeGreaterThan(0);
  });
});

describe('OBV Indicator', () => {
  test('calculates OBV with valid data', () => {
    const closes = [100, 101, 102, 101, 100, 99, 100, 101, 102, 103];
    const volumes = [1000, 1100, 1200, 1150, 1100, 1050, 1100, 1200, 1300, 1400];
    
    const result = OBVIndicator.calculate(closes, volumes);
    
    expect(typeof result.obv).toBe('number');
  });
  
  test('returns zero with insufficient data', () => {
    const closes = [100];
    const volumes = [1000];
    
    const result = OBVIndicator.calculate(closes, volumes);
    
    expect(result.obv).toBe(0);
  });
  
  test('increases OBV on up days', () => {
    const closes = [100, 101, 102, 103];
    const volumes = [1000, 1000, 1000, 1000];
    
    const obvSeries = OBVIndicator.calculateSeries(closes, volumes);
    
    // OBV should be increasing
    expect(obvSeries[obvSeries.length - 1]).toBeGreaterThan(obvSeries[0]);
  });
  
  test('decreases OBV on down days', () => {
    const closes = [103, 102, 101, 100];
    const volumes = [1000, 1000, 1000, 1000];
    
    const obvSeries = OBVIndicator.calculateSeries(closes, volumes);
    
    // OBV should be decreasing
    expect(obvSeries[obvSeries.length - 1]).toBeLessThan(obvSeries[0]);
  });
  
  test('confirms bullish price move', () => {
    const confirmation = OBVIndicator.getConfirmation(10, 1000);
    
    expect(confirmation.confirmed).toBe(true);
    expect(confirmation.signal).toBe('bullish');
  });
  
  test('detects bearish divergence', () => {
    const confirmation = OBVIndicator.getConfirmation(10, -1000);
    
    expect(confirmation.confirmed).toBe(false);
    expect(confirmation.signal).toBe('bearish');
  });
});
