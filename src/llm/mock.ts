import { LlmAdapter, LlmFinish, LlmRequest, ModelInfo, StreamHandlers } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Deterministic, key-less adapter that drives the full agent loop so the whole
 * harness is demonstrable offline.
 *
 * Behaviour (inspired by the harness' own concepts):
 *  - If the history already contains tool results, the mock produces a final
 *    text answer summarising what the tools observed.
 *  - Otherwise, if the latest user message matches a known verb, the mock emits
 *    a short message and *one* matching tool call, exercising
 *    stream -> tool -> stream -> done.
 *  - Otherwise it just converses.
 */
export class MockAdapter implements LlmAdapter {
  readonly id = 'mock';
  readonly provider = 'mock';

  constructor(private options: { latencyMs?: number } = {}) {}

  listModels(): ModelInfo[] {
    return [
      {
        id: 'mock-agent',
        provider: 'mock',
        name: 'Mock Agent (deterministic)',
        contextWindow: 128_000,
        supportsToolCalling: true,
      },
    ];
  }

  async stream(req: LlmRequest, handlers: StreamHandlers): Promise<void> {
    const latency = this.options.latencyMs ?? 40;
    handlers.onStart?.();

    const plan = this.plan(req);
    try {
      for (const line of plan.thinking) {
        if (req.signal?.aborted) return this.abort(handlers);
        handlers.onThinking?.(line);
        await sleep(latency);
      }
      for (const chunk of plan.text) {
        if (req.signal?.aborted) return this.abort(handlers);
        handlers.onText?.(chunk);
        await sleep(latency / 2);
      }
      if (plan.toolCall) {
        if (req.signal?.aborted) return this.abort(handlers);
        handlers.onToolCall?.(plan.toolCall);
      }
      if (req.signal?.aborted) return this.abort(handlers);
      handlers.onDone?.({
        stopReason: plan.toolCall ? 'tool_use' : 'end_turn',
        usage: { inputTokens: 40 + req.messages.length * 12, outputTokens: plan.text.join('').length },
      });
    } catch (err) {
      handlers.onError?.(err as Error);
    }
  }

  private abort(handlers: StreamHandlers): void {
    handlers.onDone?.({ stopReason: 'aborted' });
  }

  private plan(req: LlmRequest): {
    thinking: string[];
    text: string[];
    toolCall: { id: string; name: string; input: Record<string, unknown> } | null;
  } {
    const last = [...req.messages].reverse().find((m) => m.role === 'user');
    const userText = typeof last?.content === 'string' ? last.content : textOf(last?.content);
    // A tool result only counts as "this turn's tool loop" if it appears *after*
    // the most recent user message; results from earlier turns stay in history.
    let lastUserIdx = -1;
    req.messages.forEach((m, i) => {
      if (m.role === 'user') lastUserIdx = i;
    });
    const hasToolResult = req.messages.some((m, i) => i > lastUserIdx && m.role === 'tool');

    if (hasToolResult) {
      const results = req.messages.filter((m) => m.role === 'tool').length;
      return {
        thinking: ['The tool came back. I can now fold its result into a final answer.'],
        text: [
          `工具执行完成，共收到 ${results} 条结果。`,
          `（这是 Mock 适配器的最终回合：我在 "一切皆插件" 的底座上跑通了 流式推理 → 工具调用 → 再推理 的完整循环。）`,
        ],
        toolCall: null,
      };
    }

    const verb = detectVerb(userText);
    if (verb) {
      const input = verb.input();
      return {
        thinking: [
          'The user asked for an action. I should delegate to the matching tool rather than guess.',
        ],
        text: [`我来调用 \`${verb.name}\` 完成这个操作。`],
        toolCall: { id: `call_${Date.now()}`, name: verb.name, input },
      };
    }

    return {
      thinking: ['No tool is needed for a plain question. I will answer directly.'],
      text: [
        `你说的是：「${userText}」。`,
        `当前运行在 plugin 化底座上：模型适配器、工具注册表、会话日志、agent loop 都是可替换插件。`,
      ],
      toolCall: null,
    };
  }
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b): b is { text: string } => (b as { type: string }).type === 'text')
      .map((b) => b.text)
      .join('');
  }
  return '';
}

interface Verb {
  name: string;
  input: () => Record<string, unknown>;
}

function detectVerb(text: string): Verb | null {
  const t = text.toLowerCase();
  if (/list|ls|目录|列出/.test(t)) return { name: 'list_dir', input: () => ({ path: '.' }) };
  if (/read|读|查看|cat/.test(t)) return { name: 'read_file', input: () => ({ path: 'README.md' }) };
  if (/write|写|创建|create/.test(t)) {
    return { name: 'write_file', input: () => ({ path: 'notes.txt', content: 'hello from mock agent' }) };
  }
  if (/run|执行|bash|命令|shell|pwd/.test(t)) {
    return { name: 'bash', input: () => ({ command: 'echo hello && pwd' }) };
  }
  if (/todo|计划|任务/.test(t)) {
    return {
      name: 'todo_write',
      input: () => ({ todos: [{ text: '跑通 agent loop', done: true }, { text: '接入真实模型', done: false }] }),
    };
  }
  if (/子代理|subagent|委托|delegate/.test(t)) {
    return { name: 'subagent', input: () => ({ prompt: '用一句话介绍 DeepSeek Harness 的插件化设计' }) };
  }
  return null;
}
