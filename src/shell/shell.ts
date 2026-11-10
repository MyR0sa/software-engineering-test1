import { spawn } from 'node:child_process';
import { EventBus, EVENTS } from '../core/events';

export type ShellKind = 'bash' | 'pwsh' | 'cmd';

export interface ShellRunOptions {
  cwd?: string;
  timeoutMs?: number;
  sessionId?: string;
}

export interface ShellResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

/**
 * The shell is a capability seam: a single place where an external command is
 * run, observed and reported. The `bash` tool (and anything else that needs a
 * subprocess) goes through here, and every byte of output is emitted as a
 * trajectory event so the UI can stream it live.
 */
export class Shell {
  constructor(private bus: EventBus, private kind: ShellKind = 'bash') {}

  get binary(): ShellKind {
    return this.kind;
  }

  run(command: string, opts: ShellRunOptions = {}): Promise<ShellResult> {
    return new Promise((resolve) => {
      const sessionId = opts.sessionId ?? 'system';
      const cwd = opts.cwd ?? process.cwd();
      const timeoutMs = opts.timeoutMs ?? 30_000;
      const started = Date.now();
      const [cmd, args] = this.buildCommand(command);

      this.bus.emit(EVENTS.shellRun, { command, cwd, shell: this.kind }, sessionId);

      const child = spawn(cmd, args, { cwd, shell: false, windowsHide: true });

      let stdout = '';
      let stderr = '';
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGKILL');
      }, timeoutMs);

      child.stdout?.on('data', (d: Buffer) => {
        const chunk = d.toString();
        stdout += chunk;
        this.bus.emit(EVENTS.shellStdout, { chunk }, sessionId);
      });
      child.stderr?.on('data', (d: Buffer) => {
        const chunk = d.toString();
        stderr += chunk;
        this.bus.emit(EVENTS.shellStderr, { chunk }, sessionId);
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        const durationMs = Date.now() - started;
        this.bus.emit(EVENTS.shellExit, { exitCode: null, timedOut: true, durationMs }, sessionId);
        resolve({ exitCode: null, stdout, stderr: stderr + `\n[spawn error] ${err.message}`, durationMs, timedOut: true });
      });

      child.on('close', (code) => {
        clearTimeout(timer);
        const durationMs = Date.now() - started;
        this.bus.emit(EVENTS.shellExit, { exitCode: code, timedOut, durationMs }, sessionId);
        resolve({ exitCode: code, stdout, stderr, durationMs, timedOut });
      });
    });
  }

  private buildCommand(command: string): [string, string[]] {
    switch (this.kind) {
      case 'pwsh':
        return ['powershell', ['-NoProfile', '-NonInteractive', '-Command', command]];
      case 'cmd':
        return ['cmd', ['/d', '/s', '/c', command]];
      case 'bash':
      default:
        return ['bash', ['-c', command]];
    }
  }
}
