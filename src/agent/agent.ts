import { Context } from '../core/context';
import { EventBus, EVENTS } from '../core/events';
import {
  ContentBlock,
  LlmAdapter,
  LlmRequest,
  ToolCallBlock,
} from '../llm/types';
import { ToolContext, ToolRegistry } from '../tools';
import { SessionStore } from '../session';
import { Sandbox } from '../shell/sandbox';
import { Shell } from '../shell/shell';
import { buildSystemPrompt } from './system-prompt';
import { buildLlmRequest } from './context-builder';

export type LoopState =
  | 'idle'
  | 'building-context'
  | 'streaming'
  | 'running-tool'
  | 'done'
  | 'aborted'
  | 'error';

interface RunningTurn {
  controller: AbortController;
  state: LoopState;
}

export interface AgentConfig {
  model?: string;
  maxTokens?: number;
  maxIterations?: number;
}

/**
 * The agent loop, exposed as a plain service so it is itself a replaceable
 * plugin. A turn is: build context -> stream from the model -> execute any
 * tool calls -> stream again -> ... until the model stops calling tools or a
 * hard iteration cap is hit. Every step is a trajectory event.
 */
export class Agent {
  private running = new Map<string, RunningTurn>();
  private lastStates = new Map<string, LoopState>();

  private readonly model: string;
  private readonly maxTokens: number;
  private readonly maxIterations: number;

  constructor(
    private ctx: Context,
    private bus: EventBus,
    private llm: LlmAdapter,
    private tools: ToolRegistry,
    private store: SessionStore,
    private sandbox: Sandbox,
    private shell: Shell,
    cfg: AgentConfig = {},
  ) {
    this.model = cfg.model ?? llm.listModels()[0]?.id ?? 'mock-agent';
    this.maxTokens = cfg.maxTokens ?? 4096;
    this.maxIterations = cfg.maxIterations ?? 20;
  }

  getState(sessionId: string): LoopState {
    return this.lastStates.get(sessionId) ?? 'idle';
  }

  isRunning(sessionId: string): boolean {
    return this.running.has(sessionId);
  }

  abort(sessionId: string): void {
    this.running.get(sessionId)?.controller.abort();
  }

  async send(sessionId: string, text: string): Promise<void> {
    const session = this.store.get(sessionId);
    if (!session) throw new Error(`unknown session: ${sessionId}`);
    if (this.running.has(sessionId)) throw new Error(`session ${sessionId} is already running`);

    const controller = new AbortController();
    const turn: RunningTurn = { controller, state: 'idle' };
    this.running.set(sessionId, turn);

    try {
      this.setState(sessionId, turn, 'building-context');
      this.bus.emit(EVENTS.turnStarted, { text }, sessionId);
      this.bus.emit(EVENTS.userMessage, { text }, sessionId);

      let iterations = 0;
      while (iterations++ < this.maxIterations) {
        if (controller.signal.aborted) {
          this.setState(sessionId, turn, 'aborted');
          this.bus.emit(EVENTS.turnAborted, { reason: 'user', iterations }, sessionId);
          return;
        }

        const request = buildLlmRequest({
          model: this.model,
          system: buildSystemPrompt({ tools: this.tools.defs(), date: new Date() }),
          history: this.store.getHistory(sessionId),
          tools: this.tools.defs(),
          maxTokens: this.maxTokens,
          signal: controller.signal,
        });

        this.setState(sessionId, turn, 'streaming');
        this.bus.emit(
          EVENTS.llmRequest,
          { model: request.model, messageCount: request.messages.length, toolCount: request.tools.length, system: request.system },
          sessionId,
        );

        const { text, toolCalls } = await this.streamOnce(request, sessionId);

        if (controller.signal.aborted) {
          this.setState(sessionId, turn, 'aborted');
          this.bus.emit(EVENTS.turnAborted, { reason: 'user', iterations }, sessionId);
          return;
        }

        if (toolCalls.length === 0) {
          this.bus.emit(EVENTS.assistantMessage, { content: this.textBlocks(text) }, sessionId);
          this.setState(sessionId, turn, 'done');
          this.bus.emit(EVENTS.turnCompleted, { iterations }, sessionId);
          return;
        }

        const assistantContent: ContentBlock[] = [
          ...this.textBlocks(text),
          ...toolCalls.map((c) => ({ type: 'tool_use' as const, id: c.id, name: c.name, input: c.input })),
        ];
        this.bus.emit(EVENTS.assistantMessage, { content: assistantContent }, sessionId);

        for (const call of toolCalls) {
          if (controller.signal.aborted) {
            this.setState(sessionId, turn, 'aborted');
            this.bus.emit(EVENTS.turnAborted, { reason: 'user', iterations }, sessionId);
            return;
          }
          await this.executeTool(sessionId, turn, call);
        }
      }

      this.setState(sessionId, turn, 'error');
      this.bus.emit(EVENTS.turnError, { reason: 'max_iterations', iterations }, sessionId);
    } catch (err) {
      this.setState(sessionId, turn, 'error');
      this.bus.emit(EVENTS.turnError, { error: (err as Error).message }, sessionId);
    } finally {
      this.running.delete(sessionId);
    }
  }

  private textBlocks(text: string): ContentBlock[] {
    return text ? [{ type: 'text', text }] : [];
  }

  private setState(sessionId: string, turn: RunningTurn, state: LoopState): void {
    turn.state = state;
    this.lastStates.set(sessionId, state);
    this.bus.emit(EVENTS.loopState, { state }, sessionId);
  }

  private async streamOnce(
    request: LlmRequest,
    sessionId: string,
  ): Promise<{ text: string; toolCalls: ToolCallBlock[] }> {
    let text = '';
    const toolCalls: ToolCallBlock[] = [];
    let error: Error | null = null;

    await this.llm.stream(request, {
      onThinking: (d) => this.bus.emit(EVENTS.llmThinking, { delta: d }, sessionId),
      onText: (d) => {
        text += d;
        this.bus.emit(EVENTS.llmChunk, { delta: d }, sessionId);
      },
      onToolCall: (c) => {
        toolCalls.push(c);
        this.bus.emit(EVENTS.llmToolCall, { id: c.id, name: c.name, input: c.input }, sessionId);
      },
      onDone: (f) => this.bus.emit(EVENTS.llmDone, { stopReason: f.stopReason, usage: f.usage }, sessionId),
      onError: (e) => {
        error = e;
        this.bus.emit(EVENTS.llmError, { error: e.message }, sessionId);
      },
    });

    if (error) throw error;
    return { text, toolCalls };
  }

  private async executeTool(sessionId: string, turn: RunningTurn, call: ToolCallBlock): Promise<void> {
    this.setState(sessionId, turn, 'running-tool');
    this.bus.emit(EVENTS.toolCall, { id: call.id, name: call.name, input: call.input }, sessionId);
    const started = Date.now();
    const tctx: ToolContext = {
      ctx: this.ctx,
      bus: this.bus,
      sessionId,
      workingDirectory: this.store.get(sessionId)!.workingDirectory,
      sandbox: this.sandbox,
      shell: this.shell,
    };
    try {
      const result = await this.tools.execute(call.name, call.input, tctx);
      this.bus.emit(
        EVENTS.toolResult,
        {
          toolCallId: call.id,
          name: call.name,
          content: result.content,
          isError: result.isError,
          meta: result.meta,
          durationMs: Date.now() - started,
        },
        sessionId,
      );
    } catch (err) {
      const msg = (err as Error).message;
      this.bus.emit(EVENTS.toolError, { toolCallId: call.id, name: call.name, error: msg }, sessionId);
      this.bus.emit(EVENTS.toolResult, { toolCallId: call.id, name: call.name, content: `error: ${msg}`, isError: true }, sessionId);
    }
  }
}
