import { Context } from '../core/context';
import { EventBus } from '../core/events';
import { ToolSchema } from '../llm/types';
import { Sandbox } from '../shell/sandbox';
import { Shell } from '../shell/shell';

export type { ToolSchema } from '../llm/types';

export interface ToolResult {
  content: string;
  isError?: boolean;
  /** Structured extra info shown in the UI alongside the raw content. */
  meta?: Record<string, unknown>;
}

/** What a tool sees when it runs: the session it belongs to + the capability seams. */
export interface ToolContext {
  ctx: Context;
  bus: EventBus;
  sessionId: string;
  workingDirectory: string;
  sandbox: Sandbox;
  shell: Shell;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: ToolSchema;
  execute(input: Record<string, unknown>, tctx: ToolContext): Promise<ToolResult>;
}
