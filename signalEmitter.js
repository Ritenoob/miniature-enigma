'use strict';

const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');

/**
 * SignalEmitter
 *
 * Responsibilities:
 *  - Write screener signals to JSONL file (optional)
 *  - Emit human-readable console output (optional)
 *  - Emit in-process events for strategy engine consumption
 *
 * Emitted Events:
 *  - 'signal' : (signalObject)
 */
class SignalEmitter extends EventEmitter {
  /**
   * @param {Object} outputsConfig
   * @param {boolean} outputsConfig.logToFile
   * @param {string}  outputsConfig.logFilePath
   * @param {boolean} outputsConfig.console
   * @param {boolean} outputsConfig.emitEvents
   */
  constructor(outputsConfig = {}) {
    super();

    this.config = {
      logToFile: Boolean(outputsConfig.logToFile),
      logFilePath: outputsConfig.logFilePath || 'screener_matches.jsonl',
      console: Boolean(outputsConfig.console),
      emitEvents: outputsConfig.emitEvents !== false // default true
    };

    this.fileStream = null;

    if (this.config.logToFile) {
      this._initFileStream();
    }

    this._registerShutdownHooks();
  }

  /**
   * Initialize append-only write stream for JSONL logging
   */
  _initFileStream() {
    const fullPath = path.resolve(this.config.logFilePath);
    const dir = path.dirname(fullPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.fileStream = fs.createWriteStream(fullPath, {
      flags: 'a',
      encoding: 'utf8'
    });

    const header = {
      ts: Date.now(),
      type: 'screener_start',
      message: 'Signal emitter initialized'
    };

    this.fileStream.write(JSON.stringify(header) + '\n');
  }

  /**
   * Core public entry point
   * Called by screenerEngine when an alignment is detected
   *
   * @param {Object} signal
   * @param {string} signal.symbol
   * @param {string[]} signal.timeframes
   * @param {'bullish'|'bearish'} signal.direction
   * @param {string[]} signal.indicators
   */
  handleSignal(signal) {
    if (!signal || !signal.symbol) return;

    const payload = {
      ts: Date.now(),
      symbol: signal.symbol,
      timeframes: signal.timeframes,
      direction: signal.direction,
      indicatorsAligned: signal.indicators
    };

    if (this.config.logToFile && this.fileStream) {
      this.fileStream.write(JSON.stringify(payload) + '\n');
    }

    if (this.config.console) {
      this._logToConsole(payload);
    }

    if (this.config.emitEvents) {
      this.emit('signal', payload);
    }
  }

  /**
   * Human-readable console output
   */
  _logToConsole(payload) {
    const tf = payload.timeframes.join(' & ');
    const inds = payload.indicatorsAligned.join(', ');

    console.log(
      `[SCREENER] ${payload.symbol} | ${payload.direction.toUpperCase()} | ` +
      `${inds} aligned on ${tf}`
    );
  }

  /**
   * Graceful shutdown handling
   */
  _registerShutdownHooks() {
    const shutdown = () => {
      if (this.fileStream) {
        try {
          const footer = {
            ts: Date.now(),
            type: 'screener_stop',
            message: 'Signal emitter shutdown'
          };
          this.fileStream.write(JSON.stringify(footer) + '\n');
          this.fileStream.end();
        } catch (_) {}
      }
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    process.on('exit', shutdown);
  }
}

module.exports = SignalEmitter;

