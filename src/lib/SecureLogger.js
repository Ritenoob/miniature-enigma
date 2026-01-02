// ============================================================================
// SecureLogger.js - Secure Logging with API Key Redaction
// ============================================================================

/**
 * Secure logging utility that automatically redacts sensitive information
 * Prevents accidental exposure of API keys, secrets, and other credentials
 */
class SecureLogger {
  static REDACT_PATTERNS = [
    // KuCoin API headers
    /KC-API-KEY['":\s]+['"]?([a-zA-Z0-9-]+)['"]?/gi,
    /KC-API-SIGN['":\s]+['"]?([a-zA-Z0-9+/=]+)['"]?/gi,
    /KC-API-PASSPHRASE['":\s]+['"]?([a-zA-Z0-9+/=]+)['"]?/gi,
    /KC-API-TIMESTAMP['":\s]+['"]?([0-9]+)['"]?/gi,
    
    // Generic API patterns
    /api[_-]?key['":\s]+['"]?([a-zA-Z0-9-]+)['"]?/gi,
    /api[_-]?secret['":\s]+['"]?([a-zA-Z0-9+/=-]+)['"]?/gi,
    /passphrase['":\s]+['"]?([a-zA-Z0-9-]+)['"]?/gi,
    /password['":\s]+['"]?([^\s'"]+)['"]?/gi,
    /token['":\s]+['"]?([a-zA-Z0-9-._]+)['"]?/gi,
    
    // Authorization headers
    /authorization['":\s]+['"]?([^\s'"]+)['"]?/gi,
    /bearer\s+([a-zA-Z0-9-._]+)/gi,
    
    // Private keys and secrets (common formats)
    /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]+?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/gi,
  ];

  /**
   * Redact sensitive information from a message
   * @param {string|Object} message - Message to redact
   * @returns {string} Redacted message
   */
  static redact(message) {
    let redacted = typeof message === 'object' ? JSON.stringify(message, null, 2) : String(message);
    
    for (const pattern of this.REDACT_PATTERNS) {
      redacted = redacted.replace(pattern, (match, secret) => {
        // Keep first 4 and last 4 chars for debugging, redact middle
        if (secret && secret.length > 8) {
          const start = secret.substring(0, 4);
          const end = secret.substring(secret.length - 4);
          return match.replace(secret, `${start}***REDACTED***${end}`);
        }
        return match.replace(secret, '[REDACTED]');
      });
    }
    
    return redacted;
  }

  /**
   * Log a message with automatic redaction
   * @param {string} level - Log level (info, warn, error, success, debug)
   * @param {string} message - Message to log
   * @param {Object} data - Optional data object
   */
  static log(level, message, data = null) {
    const safeMessage = this.redact(message);
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${safeMessage}`;
    
    // Output to console
    switch (level) {
      case 'error':
        console.error(logEntry);
        break;
      case 'warn':
        console.warn(logEntry);
        break;
      case 'debug':
        console.debug(logEntry);
        break;
      default:
        console.log(logEntry);
    }
    
    // Log data if present
    if (data !== null && data !== undefined) {
      const safeData = this.redact(data);
      console.log(`  Data: ${safeData}`);
    }
  }

  /**
   * Convenience methods for different log levels
   */
  static info(message, data = null) {
    this.log('info', message, data);
  }

  static warn(message, data = null) {
    this.log('warn', message, data);
  }

  static error(message, data = null) {
    this.log('error', message, data);
  }

  static success(message, data = null) {
    this.log('success', message, data);
  }

  static debug(message, data = null) {
    this.log('debug', message, data);
  }

  /**
   * Redact sensitive information from HTTP headers
   * @param {Object} headers - HTTP headers object
   * @returns {Object} Redacted headers
   */
  static redactHeaders(headers) {
    const redacted = { ...headers };
    const sensitiveHeaders = [
      'KC-API-KEY',
      'KC-API-SIGN',
      'KC-API-PASSPHRASE',
      'Authorization',
      'Cookie',
      'Set-Cookie',
      'X-API-Key'
    ];

    for (const header of sensitiveHeaders) {
      const headerLower = header.toLowerCase();
      
      // Check both original case and lowercase
      if (redacted[header]) {
        redacted[header] = '[REDACTED]';
      }
      if (redacted[headerLower]) {
        redacted[headerLower] = '[REDACTED]';
      }
    }

    return redacted;
  }

  /**
   * Safely format an error for logging
   * @param {Error} error - Error object
   * @returns {Object} Safe error representation
   */
  static formatError(error) {
    const safe = {
      message: this.redact(error.message),
      name: error.name,
      code: error.code,
    };

    // Include stack trace in development/debug
    if (process.env.NODE_ENV === 'development' || process.env.DEBUG) {
      safe.stack = this.redact(error.stack);
    }

    // Include response data if present (common with axios errors)
    if (error.response) {
      safe.response = {
        status: error.response.status,
        statusText: error.response.statusText,
        data: this.redact(error.response.data),
        headers: this.redactHeaders(error.response.headers || {})
      };
    }

    // Include request data if present
    if (error.config) {
      safe.request = {
        method: error.config.method,
        url: this.redact(error.config.url),
        headers: this.redactHeaders(error.config.headers || {})
      };
    }

    return safe;
  }

  /**
   * Create a safe logger instance bound to a specific context
   * @param {string} context - Context name (e.g., 'PositionManager', 'API')
   * @returns {Object} Logger instance with context
   */
  static createLogger(context) {
    return {
      info: (message, data) => this.log('info', `[${context}] ${message}`, data),
      warn: (message, data) => this.log('warn', `[${context}] ${message}`, data),
      error: (message, data) => this.log('error', `[${context}] ${message}`, data),
      success: (message, data) => this.log('success', `[${context}] ${message}`, data),
      debug: (message, data) => this.log('debug', `[${context}] ${message}`, data)
    };
  }
}

module.exports = SecureLogger;
