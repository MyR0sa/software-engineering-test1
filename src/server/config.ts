import path from 'node:path';
import fs from 'node:fs';
import 'dotenv/config';
import { LlmConfig } from '../llm';
import { ShellKind } from '../shell/shell';

export interface HarnessConfig {
  llm: LlmConfig;
  host: string;
  port: number;
  /** Absolute workspace root; shell + fs tools are confined here. */
  workspace: string;
  shell: ShellKind;
  maxIterations: number;
}

/** Load configuration from the environment (a `.env` file is picked up). */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): HarnessConfig {
  const cwd = process.cwd();
  const workspaceRaw = env.HARNESS_WORKSPACE || './workspace';
  const workspace = path.isAbsolute(workspaceRaw)
    ? workspaceRaw
    : path.resolve(cwd, workspaceRaw);
  fs.mkdirSync(workspace, { recursive: true });

  const provider = (env.HARNESS_LLM_PROVIDER || 'mock') as LlmConfig['provider'];
  const shell = (env.HARNESS_SHELL as ShellKind) || 'bash';

  return {
    llm: {
      provider,
      baseUrl: env.HARNESS_LLM_BASE_URL || 'https://api.deepseek.com',
      apiKey: env.HARNESS_LLM_API_KEY || '',
      model: env.HARNESS_LLM_MODEL || 'deepseek-chat',
      maxTokens: Number(env.HARNESS_LLM_MAX_TOKENS) || 4096,
    },
    host: env.HARNESS_HOST || '127.0.0.1',
    port: Number(env.HARNESS_PORT) || 3080,
    workspace,
    shell,
    maxIterations: Number(env.HARNESS_MAX_ITERATIONS) || 20,
  };
}
