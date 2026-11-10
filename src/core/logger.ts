import { EventBus } from './events';
import { EVENTS } from './events';

/**
 * Minimal leveled logger. Writes to stdout and, when a bus is attached, also
 * emits `log` events so the web UI can surface system activity in the
 * trajectory stream.
 */
export class Logger {
  constructor(private bus?: EventBus, private scope = 'harness') {}

  info(msg: string, data: Record<string, unknown> = {}): void {
    this.write('info', msg, data);
  }
  warn(msg: string, data: Record<string, unknown> = {}): void {
    this.write('warn', msg, data);
  }
  error(msg: string, data: Record<string, unknown> = {}): void {
    this.write('error', msg, data);
  }
  debug(msg: string, data: Record<string, unknown> = {}): void {
    this.write('debug', msg, data);
  }

  private write(level: string, msg: string, data: Record<string, unknown>): void {
    const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] [${this.scope}] ${msg}`;
    // eslint-disable-next-line no-console
    console.log(line);
    this.bus?.emit(EVENTS.log, { level, scope: this.scope, msg, ...data });
  }
}
