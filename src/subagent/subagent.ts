import { Context } from '../core/context';
import { EventBus, EVENTS } from '../core/events';
import { uid } from '../core/ids';
import { ContentBlock, LlmAdapter, LlmMessage, LlmRequest, ToolCallBlock } from '../llm/types';
import { ToolContext, ToolRegistry } from '../tools';
import { SessionStore } from '../session';
import { Sandbox } from '../shell/sandbox';
import { Shell } from '../shell/shell';

export interface SubagentRunOptions {
  prompt: string;
  parentSessionId: string;
  tools?: string[];
  maxIterations?: number;
}

/**
 * In-process sub-agent ("fork in process"). Shares the same model adapter and
 * tool registry as the parent, but keeps its own message history. Its LLM/tool
 * activity is emitted into the parent's trajectory, tagged with `subagentId`.
 */
export class SubagentService {
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(
    private ctx: Context,
    private bus: EventBus,
    private llm: LlmAdapter,
    private tools: ToolRegistry,
    private store: SessionStore,
    private sandbox: Sandbox,
    private shell: Shell,
    cfg: { model?: string; maxTokens?: number } = {},
  ) {
    this.model = cfg.model ?? llm.listModels()[0]?.id ?? 'mock-agent';
    this.maxTokens = cfg.maxTokens ?? 4096;
  }

  async run(opts: SubagentRunOptions): Promise<string> {
    const id = uid('sub');
    const sessionId = opts.parentSessionId;
    this.bus.emit(EVENTS.subagentSpawn, { id, prompt: opts.prompt }, sessionId);

    const toolDefs = opts.tools
      ? this.tools.defs().filter((t) => opts.tools!.includes(t.name))
      : this.tools.defs();

    const history: LlmMessage[] = [
      { role: 'user', content: [{ type: 'text', text: opts.prompt }] },
    ];

    let finalText = '';
    try {
      const max = opts.maxIterations ?? 8;
      for (let i = 0; i < max; i++) {
        const request: LlmRequest = {
          model: this.model,
          system: 'You are a focused sub-agent. Answer the delegated task directly and use tools only when needed.',
          messages: history,
          tools: toolDefs,
          maxTokens: this.maxTokens,
        };
        const { text, toolCalls } = await this.streamOnce(request, id, sessionId);

        history.push({
          role: 'assistant',
          content: [
            ...(text ? [{ type: 'text' as const, text }] : []),
            ...toolCalls.map((c) => ({ type: 'tool_use' as const, id: c.id, name: c.name, input: c.input })),
          ],
        });

        if (toolCalls.length === 0) {
          finalText = text;
          break;
        }

        for (const call of toolCalls) {
          const parent = this.store.get(sessionId);
          const tctx: ToolContext = {
            ctx: this.ctx,
            bus: this.bus,
            sessionId,
            workingDirectory: parent?.workingDirectory ?? this.sandbox.root,
            sandbox: this.sandbox,
            shell: this.shell,
          };
          this.bus.emit(EVENTS.toolCall, { id: call.id, name: call.name, input: call.input, subagentId: id }, sessionId);
          const result = await this.tools.execute(call.name, call.input, tctx);
          this.bus.emit(EVENTS.toolResult, {
            toolCallId: call.id,
            name: call.name,
            content: result.content,
            isError: result.isError,
            subagentId: id,
          }, sessionId);
          history.push({ role: 'tool', tool_call_id: call.id, name: call.name, content: result.content });
        }
      }
    } finally {
      this.bus.emit(EVENTS.subagentDone, { id, answerLength: finalText.length }, sessionId);
    }

    return finalText || '(subagent produced no text)';
  }

  private async streamOnce(
    request: LlmRequest,
    subagentId: string,
    sessionId: string,
  ): Promise<{ text: string; toolCalls: ToolCallBlock[] }> {
    let text = '';
    const toolCalls: ToolCallBlock[] = [];
    let error: Error | null = null;

    await this.llm.stream(request, {
      onText: (d) => {
        text += d;
        this.bus.emit(EVENTS.llmChunk, { delta: d, subagentId }, sessionId);
      },
      onToolCall: (c) => {
        toolCalls.push(c);
        this.bus.emit(EVENTS.llmToolCall, { id: c.id, name: c.name, input: c.input, subagentId }, sessionId);
      },
      onDone: (f) => this.bus.emit(EVENTS.llmDone, { stopReason: f.stopReason, subagentId }, sessionId),
      onError: (e) => {
        error = e;
        this.bus.emit(EVENTS.llmError, { error: e.message, subagentId }, sessionId);
      },
    });

    if (error) throw error;
    return { text, toolCalls };
  }
}
