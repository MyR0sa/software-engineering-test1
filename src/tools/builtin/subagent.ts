import { Tool } from '../types';

interface SubagentService {
  run(opts: { prompt: string; parentSessionId: string }): Promise<string>;
}

export const subagentTool: Tool = {
  name: 'subagent',
  description: 'Delegate a self-contained task to an in-process sub-agent and return its answer.',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'The task to hand to the sub-agent.' },
    },
    required: ['prompt'],
  },
  async execute(input, tctx) {
    try {
      const subagent = tctx.ctx.get<SubagentService>('subagent');
      const answer = await subagent.run({
        prompt: String(input.prompt ?? ''),
        parentSessionId: tctx.sessionId,
      });
      return { content: answer, meta: { delegated: true } };
    } catch (err) {
      return { content: `subagent failed: ${(err as Error).message}`, isError: true };
    }
  },
};
