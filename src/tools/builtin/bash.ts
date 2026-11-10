import { Tool } from '../types';

export const bashTool: Tool = {
  name: 'bash',
  description: 'Run a shell command inside the session workspace and return its output.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to execute.' },
      timeout: { type: 'number', description: 'Timeout in seconds (default 30).' },
    },
    required: ['command'],
  },
  async execute(input, tctx) {
    const timeoutSec = Number(input.timeout) > 0 ? Number(input.timeout) : 30;
    const r = await tctx.shell.run(String(input.command ?? ''), {
      cwd: tctx.workingDirectory,
      sessionId: tctx.sessionId,
      timeoutMs: timeoutSec * 1000,
    });
    const parts = [
      r.stdout ? `stdout:\n${r.stdout.trimEnd()}` : '',
      r.stderr ? `stderr:\n${r.stderr.trimEnd()}` : '',
      `exit code: ${r.exitCode}${r.timedOut ? ' (timed out)' : ''}`,
    ].filter(Boolean);
    return {
      content: parts.join('\n') || '(no output)',
      isError: r.exitCode !== 0,
      meta: { exitCode: r.exitCode, durationMs: r.durationMs, timedOut: r.timedOut },
    };
  },
};
