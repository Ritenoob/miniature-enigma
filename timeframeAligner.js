/**
 * timeframeAligner.js
 *
 * Evaluates whether configured indicators are aligned between two timeframes
 * for bullish or bearish signals according to the rules in config.
 */

function isBullishRSI(rsi, params) {
  if (rsi == null) return false;
  const { oversold } = params.rsi || {};
  return rsi < oversold;
}

function isBearishRSI(rsi, params) {
  if (rsi == null) return false;
  const { overbought } = params.rsi || {};
  return rsi > overbought;
}

function isBullishMACD(macd, params) {
  if (macd == null) return false;
  // Using histogram if provided
  return macd.histogram != null ? macd.histogram > 0 : macd.macd > macd.signal;
}

function isBearishMACD(macd, params) {
  if (macd == null) return false;
  return macd.histogram != null ? macd.histogram < 0 : macd.macd < macd.signal;
}

function isBullishWilliamsR(wr, params) {
  if (wr == null) return false;
  const { oversoldLevel } = params.williamsR || {};
  return wr < oversoldLevel;
}

function isBearishWilliamsR(wr, params) {
  if (wr == null) return false;
  const { overboughtLevel } = params.williamsR || {};
  return wr > overboughtLevel;
}

function isBullishAO(ao, params) {
  if (ao == null) return false;
  return ao > 0;
}

function isBearishAO(ao, params) {
  if (ao == null) return false;
  return ao < 0;
}

/**
 * Main check function
 *
 * @param {Object} lowTfValues  - indicator values for lower timeframe
 * @param {Object} highTfValues - indicator values for higher timeframe
 * @param {Object} config       - screenerConfig (thresholds, rules, etc.)
 *
 * @returns {Object|null}
 */
function checkAlignment(lowTfValues, highTfValues, config) {
  const results = {
    bullish: [],
    bearish: []
  };

  const { indicators, indicatorParams, alignment } = config;

  // Evaluate each configured indicator
  for (const ind of indicators) {
    const lowVal = lowTfValues[ind];
    const highVal = highTfValues[ind];

    switch (ind) {
      case 'rsi':
        if (isBullishRSI(lowVal, indicatorParams) && isBullishRSI(highVal, indicatorParams)) {
          results.bullish.push('rsi');
        }
        if (isBearishRSI(lowVal, indicatorParams) && isBearishRSI(highVal, indicatorParams)) {
          results.bearish.push('rsi');
        }
        break;

      case 'macd':
        if (isBullishMACD(lowVal, indicatorParams) && isBullishMACD(highVal, indicatorParams)) {
          results.bullish.push('macd');
        }
        if (isBearishMACD(lowVal, indicatorParams) && isBearishMACD(highVal, indicatorParams)) {
          results.bearish.push('macd');
        }
        break;

      case 'williamsR':
        if (isBullishWilliamsR(lowVal, indicatorParams) && isBullishWilliamsR(highVal, indicatorParams)) {
          results.bullish.push('williamsR');
        }
        if (isBearishWilliamsR(lowVal, indicatorParams) && isBearishWilliamsR(highVal, indicatorParams)) {
          results.bearish.push('williamsR');
        }
        break;

      case 'ao':
        if (isBullishAO(lowVal, indicatorParams) && isBullishAO(highVal, indicatorParams)) {
          results.bullish.push('ao');
        }
        if (isBearishAO(lowVal, indicatorParams) && isBearishAO(highVal, indicatorParams)) {
          results.bearish.push('ao');
        }
        break;

      default:
        // Unknown indicator — skip or log
        break;
    }
  }

  // Decide signal according to config rules:
  //  - threshold: minimum number of aligned indicators
  //  - strict: if true, require ALL indicators to align
  const numInds = indicators.length;
  const thresh = alignment.minAligned || numInds;

  const canBullish =
    (alignment.strict && results.bullish.length === numInds) ||
    (!alignment.strict && results.bullish.length >= thresh);

  const canBearish =
    (alignment.strict && results.bearish.length === numInds) ||
    (!alignment.strict && results.bearish.length >= thresh);

  if (canBullish && !canBearish) {
    return {
      direction: 'bullish',
      indicators: results.bullish
    };
  }

  if (canBearish && !canBullish) {
    return {
      direction: 'bearish',
      indicators: results.bearish
    };
  }

  return null;
}

module.exports = { checkAlignment };

