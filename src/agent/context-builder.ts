import { LlmMessage, LlmRequest, ToolDef } from '../llm/types';

export interface BuildRequestInput {
  model: string;
  system: string;
  history: LlmMessage[];
  tools: ToolDef[];
  maxTokens?: number;
  signal?: AbortSignal;
}

/**
 * Prompt assembly seam: the exact request the model receives. Kept as its own
 * function so compaction / context-window policies / tool-schema injection can
 * all be swapped here without touching the loop.
 */
export function buildLlmRequest(input: BuildRequestInput): LlmRequest {
  return {
    model: input.model,
    system: input.system,
    messages: input.history,
    tools: input.tools,
    maxTokens: input.maxTokens,
    signal: input.signal,
  };
}
