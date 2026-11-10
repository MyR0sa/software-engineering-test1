import {
  ContentBlock,
  LlmAdapter,
  LlmFinish,
  LlmMessage,
  LlmRequest,
  ModelInfo,
  StreamHandlers,
} from './types';

/**
 * OpenAI-compatible adapter. Works with DeepSeek (`https://api.deepseek.com`),
 * OpenAI, and any other provider exposing `/chat/completions` with streaming
 * and function-style tool calls. Chosen entirely via config, never code.
 */
export class OpenAICompatibleAdapter implements LlmAdapter {
  readonly id = 'openai-compat';
  readonly provider: string;

  constructor(
    private options: {
      baseUrl: string;
      apiKey: string;
      model: string;
      maxTokens?: number;
      providerLabel?: string;
    },
  ) {
    this.provider = options.providerLabel ?? new URL(options.baseUrl).hostname;
  }

  listModels(): ModelInfo[] {
    return [
      {
        id: this.options.model,
        provider: this.provider,
        name: this.options.model,
        contextWindow: 128_000,
        supportsToolCalling: true,
      },
    ];
  }

  async stream(req: LlmRequest, handlers: StreamHandlers): Promise<void> {
    handlers.onStart?.();
    try {
      const res = await fetch(this.endpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify(this.toRequestBody(req)),
        signal: req.signal,
      });

      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => '');
        throw new Error(`LLM ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
      }

      const finish = await consumeSse(res.body, handlers);
      handlers.onDone?.(finish);
    } catch (err) {
      if (req.signal?.aborted) {
        handlers.onDone?.({ stopReason: 'aborted' });
      } else {
        handlers.onError?.(err as Error);
      }
    }
  }

  private endpoint(): string {
    const base = this.options.baseUrl.replace(/\/+$/, '');
    return `${base}/chat/completions`;
  }

  private toRequestBody(req: LlmRequest) {
    const messages = toOpenAiMessages(req.system, req.messages);
    const tools = req.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.inputSchema },
    }));
    const body: Record<string, unknown> = {
      model: req.model,
      messages,
      stream: true,
      max_tokens: req.maxTokens ?? this.options.maxTokens ?? 4096,
    };
    if (tools.length) body.tools = tools;
    return body;
  }
}

/** Convert the unified message shape to the OpenAI wire format. */
export function toOpenAiMessages(
  system: string,
  messages: LlmMessage[],
): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  if (system.trim()) out.push({ role: 'system', content: system });

  for (const m of messages) {
    if (m.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: m.tool_call_id,
        content: typeof m.content === 'string' ? m.content : textOf(m.content),
      });
      continue;
    }
    if (m.role === 'assistant' && Array.isArray(m.content)) {
      const text = textOf(m.content);
      const toolCalls = m.content
        .filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use')
        .map((b) => ({
          id: b.id,
          type: 'function',
          function: { name: b.name, arguments: JSON.stringify(b.input) },
        }));
      out.push({ role: 'assistant', content: text || null, ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
      continue;
    }
    out.push({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : textOf(m.content),
    });
  }
  return out;
}

function textOf(content: ContentBlock[]): string {
  return content
    .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

/** Parse a streaming SSE response into handler callbacks. */
async function consumeSse(body: ReadableStream<Uint8Array>, h: StreamHandlers): Promise<LlmFinish> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let stopReason = 'end_turn';
  let usage: LlmFinish['usage'];
  const toolAcc = new Map<number, { id: string; name: string; args: string }>();

  const flushToolCall = (index: number) => {
    const acc = toolAcc.get(index);
    if (!acc) return;
    let input: Record<string, unknown> = {};
    try {
      input = acc.args ? JSON.parse(acc.args) : {};
    } catch {
      input = { __raw: acc.args };
    }
    h.onToolCall?.({ id: acc.id, name: acc.name, input });
    toolAcc.delete(index);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).replace(/\r$/, '');
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      let json: any;
      try {
        json = JSON.parse(payload);
      } catch {
        continue;
      }

      const choice = json.choices?.[0];
      if (!choice) continue;
      if (choice.finish_reason) stopReason = choice.finish_reason;
      if (json.usage) {
        usage = {
          inputTokens: json.usage.prompt_tokens ?? 0,
          outputTokens: json.usage.completion_tokens ?? 0,
        };
      }

      const delta = choice.delta ?? {};
      if (delta.reasoning_content) h.onThinking?.(delta.reasoning_content);
      else if (delta.reasoning) h.onThinking?.(delta.reasoning);
      if (delta.content) h.onText?.(delta.content);

      for (const tc of delta.tool_calls ?? []) {
        const i: number = tc.index ?? 0;
        const acc = toolAcc.get(i) ?? { id: '', name: '', args: '' };
        if (tc.id) acc.id = tc.id;
        if (tc.function?.name) acc.name += tc.function.name;
        if (tc.function?.arguments) acc.args += tc.function.arguments;
        toolAcc.set(i, acc);
        // OpenAI emits the full argument blob in one delta; some providers stream it.
        if (acc.name && acc.args) flushToolCall(i);
      }
    }
  }

  for (const [i, acc] of [...toolAcc]) {
    let input: Record<string, unknown> = {};
    try {
      input = acc.args ? JSON.parse(acc.args) : {};
    } catch {
      input = { __raw: acc.args };
    }
    h.onToolCall?.({ id: acc.id, name: acc.name, input });
  }

  return { stopReason, usage };
}
