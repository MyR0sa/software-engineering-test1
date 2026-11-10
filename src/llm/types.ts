/**
 * Content-block vocabulary, inspired by DeepSeek Harness' unified content
 * blocks. A message's `content` is a list of blocks so that text, tool calls
 * and tool results can coexist in a single, model-agnostic shape.
 */
export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface LlmMessage {
  role: Role;
  content: string | ContentBlock[];
  /** For `tool` role: the id of the tool_use this result answers. */
  tool_call_id?: string;
  /** For `tool` role: the name of the tool. */
  name?: string;
}

export interface ToolSchema {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

/** A tool declaration handed to the model for tool calling. */
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: ToolSchema;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmRequest {
  model: string;
  system: string;
  messages: LlmMessage[];
  tools: ToolDef[];
  maxTokens?: number;
  /** Cooperative cancellation for long-running streams. */
  signal?: AbortSignal;
}

export interface ToolCallBlock {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface LlmFinish {
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'aborted' | string;
  usage?: TokenUsage;
}

export interface StreamHandlers {
  onStart?: () => void;
  onThinking?: (delta: string) => void;
  onText?: (delta: string) => void;
  onToolCall?: (call: ToolCallBlock) => void;
  onDone?: (finish: LlmFinish) => void;
  onError?: (err: Error) => void;
}

export interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  contextWindow: number;
  supportsToolCalling: boolean;
}

/**
 * A model adapter. Adapters are plugins: the harness only ever talks to this
 * interface, so swapping DeepSeek for OpenAI/Anthropic/a mock is a config
 * change, not a code change.
 */
export interface LlmAdapter {
  /** Stable adapter id, e.g. "mock" or "openai-compat". */
  id: string;
  /** Provider label shown in the UI. */
  provider: string;
  listModels(): ModelInfo[];
  stream(req: LlmRequest, handlers: StreamHandlers): Promise<void>;
}
