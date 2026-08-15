import { LogEntry } from '../types.js';

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 500;
  private levelOrder: Record<string, number> = {
    DEBUG: 10,
    INFO: 20,
    WARN: 30,
    ERROR: 40,
  };

  private currentLevel = process.env.LOG_LEVEL || 'INFO';

  private formatTimestamp(): string {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = now.getFullYear();
    const mm = pad(now.getMonth() + 1);
    const dd = pad(now.getDate());
    const hh = pad(now.getHours());
    const min = pad(now.getMinutes());
    const ss = pad(now.getSeconds());
    return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
  }

  private log(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', message: string, context?: any) {
    if (this.levelOrder[level] < this.levelOrder[this.currentLevel]) {
      return;
    }

    const timestamp = this.formatTimestamp();
    const entry: LogEntry = { timestamp, level, message, context };

    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }

    const logStr = `${timestamp} ${level.padEnd(5)} ${message}`;
    if (level === 'ERROR') {
      if (context !== undefined) {
        console.error(logStr, typeof context === 'string' ? context : JSON.stringify(context));
      } else {
        console.error(logStr);
      }
    } else if (level === 'WARN') {
      if (context !== undefined) {
        console.warn(logStr, typeof context === 'string' ? context : JSON.stringify(context));
      } else {
        console.warn(logStr);
      }
    } else {
      if (context !== undefined) {
        console.log(logStr, typeof context === 'string' ? context : JSON.stringify(context));
      } else {
        console.log(logStr);
      }
    }
  }

  public debug(message: string, context?: any) {
    this.log('DEBUG', message, context);
  }

  public info(message: string, context?: any) {
    this.log('INFO', message, context);
  }

  public warn(message: string, context?: any) {
    this.log('WARN', message, context);
  }

  public error(message: string, context?: any) {
    this.log('ERROR', message, context);
  }

  public getRecentLogs(limit = 100): LogEntry[] {
    return this.logs.slice(0, limit);
  }

  public clear() {
    this.logs = [];
  }
}

export const logger = new Logger();
