import { LlmAdapter } from './types';
import { MockAdapter } from './mock';
import { OpenAICompatibleAdapter } from './openai-compat';

export type { LlmAdapter, LlmRequest, LlmMessage, ContentBlock, ModelInfo, StreamHandlers, ToolDef, TokenUsage } from './types';
export { MockAdapter } from './mock';
export { OpenAICompatibleAdapter, toOpenAiMessages } from './openai-compat';

export interface LlmConfig {
  provider: 'mock' | 'openai-compat';
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  maxTokens?: number;
}

/** Build the adapter the harness will use, purely from config. */
export function createAdapter(cfg: LlmConfig): LlmAdapter {
  if (cfg.provider === 'mock') {
    return new MockAdapter();
  }
  if (!cfg.baseUrl || !cfg.apiKey || !cfg.model) {
    throw new Error(
      'openai-compat provider requires HARNESS_LLM_BASE_URL, HARNESS_LLM_API_KEY and HARNESS_LLM_MODEL',
    );
  }
  return new OpenAICompatibleAdapter({
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    model: cfg.model,
    maxTokens: cfg.maxTokens,
  });
}
