export interface TrajectoryEvent {
  seq: number;
  ts: number;
  sessionId: string;
  type: string;
  data: Record<string, unknown>;
}

export interface SessionSummary {
  id: string;
  title: string;
  createdAt: number;
  workingDirectory: string;
  eventCount: number;
  state: string;
}

export interface ToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface PluginInventory {
  plugins: string[];
  services: { name: string; deps: string[] }[];
}

export interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  contextWindow: number;
  supportsToolCalling: boolean;
}

export interface ModelsPayload {
  adapter: { id: string; provider: string };
  models: ModelInfo[];
}

export interface Config {
  llm: { provider: string; baseUrl: string; model: string; apiKey: string };
  host: string;
  port: number;
  workspace: string;
  shell: string;
  maxIterations: number;
}

export interface HelloPayload {
  type: 'hello';
  config: Config;
  sessions: SessionSummary[];
  tools: ToolInfo[];
  plugins: PluginInventory;
  models: ModelsPayload;
}

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface TodoItem {
  text: string;
  done?: boolean;
}
