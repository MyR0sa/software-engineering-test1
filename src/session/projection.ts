import { TrajectoryEvent, EVENTS } from '../core/events';
import { ContentBlock, LlmMessage } from '../llm/types';

/**
 * Reconstruct the LLM message history from the raw trajectory events.
 *
 * Only events that carry conversational content are projected:
 *   user.message       -> user text
 *   assistant.message  -> assistant content blocks (text + tool_use)
 *   tool.result        -> tool role message answering a tool_use
 *
 * Everything else (chunks, loop states, shell output) is presentation data and
 * is intentionally skipped here.
 */
export function projectMessages(events: TrajectoryEvent[]): LlmMessage[] {
  const messages: LlmMessage[] = [];
  for (const e of events) {
    switch (e.type) {
      case EVENTS.userMessage:
        messages.push({
          role: 'user',
          content: [{ type: 'text', text: String(e.data.text ?? '') }],
        });
        break;
      case EVENTS.assistantMessage: {
        const content = (e.data.content as ContentBlock[]) ?? [];
        messages.push({ role: 'assistant', content });
        break;
      }
      case EVENTS.toolResult:
        messages.push({
          role: 'tool',
          tool_call_id: String(e.data.toolCallId ?? ''),
          name: String(e.data.name ?? ''),
          content: String(e.data.content ?? ''),
        });
        break;
    }
  }
  return messages;
}
