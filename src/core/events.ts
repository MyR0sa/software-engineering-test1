/**
 * The event bus is the backbone of the whole harness.
 *
 * Every observable thing that happens — a plugin loading, the agent loop
 * transitioning state, the model streaming a chunk, a tool being invoked — is
 * emitted as a typed event. Events are the *trajectory*: the append-only
 * record of everything the agent did, which is what the session log persists,
 * what the projection reconstructs messages from, and what the web UI renders
 * live over the WebSocket.
 */

/** A single entry in the append-only trajectory log. */
export interface TrajectoryEvent {
  /** Monotonic sequence number assigned by the bus. */
  seq: number;
  /** Epoch milliseconds at emit time. */
  ts: number;
  /** Session the event belongs to, or "system" for global events. */
  sessionId: string;
  /** Event type, one of the names in `EVENTS` (or a plugin-specific one). */
  type: string;
  /** Typed payload; shape depends on `type`. */
  data: Record<string, unknown>;
}

/** Well-known event types. Plugins may emit additional types. */
export const EVENTS = {
  log: 'log',
  pluginLoaded: 'plugin.loaded',
  appReady: 'app.ready',

  sessionCreated: 'session.created',
  sessionLoaded: 'session.loaded',

  turnStarted: 'turn.started',
  turnCompleted: 'turn.completed',
  turnAborted: 'turn.aborted',
  turnError: 'turn.error',

  loopState: 'loop.state',
  userMessage: 'user.message',
  assistantMessage: 'assistant.message',

  llmRequest: 'llm.request',
  llmChunk: 'llm.chunk',
  llmThinking: 'llm.thinking',
  llmToolCall: 'llm.tool_call',
  llmDone: 'llm.done',
  llmError: 'llm.error',

  toolCall: 'tool.call',
  toolResult: 'tool.result',
  toolError: 'tool.error',

  shellRun: 'shell.run',
  shellStdout: 'shell.stdout',
  shellStderr: 'shell.stderr',
  shellExit: 'shell.exit',

  subagentSpawn: 'subagent.spawn',
  subagentDone: 'subagent.done',
} as const;

export type EventType = (typeof EVENTS)[keyof typeof EVENTS];

type Listener = (event: TrajectoryEvent) => void;

/**
 * Synchronous, in-process pub/sub bus. Emitting is synchronous so that the
 * order of events in a turn is deterministic; heavy work (LLM streaming, tool
 * execution) happens in the agent loop, *not* inside event handlers.
 */
export class EventBus {
  private listeners = new Map<string, Set<Listener>>();
  private anyListeners = new Set<Listener>();
  private seq = 0;

  emit(
    type: string,
    data: Record<string, unknown> = {},
    sessionId = 'system',
  ): TrajectoryEvent {
    const event: TrajectoryEvent = { seq: ++this.seq, ts: Date.now(), sessionId, type, data };
    const set = this.listeners.get(type);
    if (set) for (const h of [...set]) h(event);
    for (const h of [...this.anyListeners]) h(event);
    return event;
  }

  on(type: string, handler: Listener): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  onAny(handler: Listener): () => void {
    this.anyListeners.add(handler);
    return () => this.anyListeners.delete(handler);
  }

  reset(): void {
    this.listeners.clear();
    this.anyListeners.clear();
    this.seq = 0;
  }
}
