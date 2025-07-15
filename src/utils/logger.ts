/**
 * Lightweight logging utility that avoids synchronous JSON operations
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  [key: string]: any;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV !== 'production';
  
  /**
   * Safely stringify objects without blocking
   * - Limits depth to prevent deep recursion
   * - Truncates large strings
   * - Handles circular references
   */
  private safeStringify(obj: any, maxDepth: number = 3): string {
    const seen = new WeakSet();
    
    const stringify = (value: any, depth: number): any => {
      if (depth > maxDepth) return '[Max Depth]';
      
      if (value === null || value === undefined) return value;
      if (typeof value !== 'object') {
        // Truncate long strings
        if (typeof value === 'string' && value.length > 200) {
          return value.substring(0, 200) + '...[truncated]';
        }
        return value;
      }
      
      if (seen.has(value)) return '[Circular]';
      seen.add(value);
      
      if (Array.isArray(value)) {
        return value.slice(0, 10).map(v => stringify(v, depth + 1));
      }
      
      const result: any = {};
      const keys = Object.keys(value).slice(0, 20); // Limit keys
      for (const key of keys) {
        result[key] = stringify(value[key], depth + 1);
      }
      if (Object.keys(value).length > 20) {
        result['...'] = `${Object.keys(value).length - 20} more keys`;
      }
      
      return result;
    };
    
    try {
      const simplified = stringify(obj, 0);
      return JSON.stringify(simplified);
    } catch (error) {
      return '[Stringify Error]';
    }
  }
  
  /**
   * Log with minimal overhead - only stringify if in development
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    if (!this.isDevelopment && level === 'debug') return;
    
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    if (context && this.isDevelopment) {
      // Only stringify context in development
      const contextStr = this.safeStringify(context);
      console.log(`${prefix} ${message}`, contextStr);
    } else {
      console.log(`${prefix} ${message}`);
    }
  }
  
  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }
  
  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }
  
  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }
  
  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }
  
  /**
   * Log request details without heavy JSON operations
   */
  request(method: string, path: string, details?: { body?: any; query?: any }): void {
    if (!this.isDevelopment) {
      console.log(`[${new Date().toISOString()}] ${method} ${path}`);
      return;
    }
    
    let message = `${method} ${path}`;
    if (details?.query && Object.keys(details.query).length > 0) {
      message += ` ?${new URLSearchParams(details.query).toString()}`;
    }
    
    this.info(message, details?.body);
  }
}

export const logger = new Logger();