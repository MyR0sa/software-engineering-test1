import type { ContentBlock, TrajectoryEvent } from './types';

export interface ToolUseView {
  id: string;
  name: string;
  input: Record<string, unknown>;
  result?: { content: string; isError?: boolean; durationMs?: number };
}

export interface ConversationItem {
  kind: 'user' | 'assistant';
  text: string;
  toolUses: ToolUseView[];
  seq: number;
}

/**
 * Reconstruct a readable conversation from the raw trajectory, mirroring the
 * backend projection but keeping tool_use + tool_result paired for display.
 */
export function deriveConversation(events: TrajectoryEvent[]): ConversationItem[] {
  const resultByCallId = new Map<string, { content: string; isError?: boolean; durationMs?: number }>();

  for (const e of events) {
    if (e.type === 'tool.result') {
      resultByCallId.set(String(e.data.toolCallId), {
        content: String(e.data.content ?? ''),
        isError: !!e.data.isError,
        durationMs: Number(e.data.durationMs) || undefined,
      });
    }
  }

  const items: ConversationItem[] = [];
  for (const e of events) {
    if (e.type === 'user.message') {
      items.push({ kind: 'user', text: String(e.data.text ?? ''), toolUses: [], seq: e.seq });
    } else if (e.type === 'assistant.message') {
      const blocks = (e.data.content ?? []) as ContentBlock[];
      const text = blocks
        .filter((b) => b.type === 'text')
        .map((b) => (b as { text: string }).text)
        .join('');
      const toolUses: ToolUseView[] = blocks
        .filter((b) => b.type === 'tool_use')
        .map((b) => {
          const tu = b as Extract<ContentBlock, { type: 'tool_use' }>;
          return { id: tu.id, name: tu.name, input: tu.input, result: resultByCallId.get(tu.id) };
        });
      items.push({ kind: 'assistant', text, toolUses, seq: e.seq });
    }
  }
  return items;
}

/** Convenience: pretty-print any JSON payload. */
export function pretty(data: unknown): string {
  try {
    return JSON.stringify(data, null, 2);
  } catch {
    return String(data);
  }
}
