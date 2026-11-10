import path from 'node:path';
import { Context, Logger } from '../core';
import { EventBus } from '../core/events';
import { Sandbox } from '../shell/sandbox';
import { Shell } from '../shell/shell';
import { SessionPersistence, SessionStore } from '../session';
import { LlmAdapter, createAdapter } from '../llm';
import { ToolRegistry, builtinTools } from '../tools';
import { Agent } from '../agent';
import { SubagentService } from '../subagent';
import { createApiPlugin } from '../api/server';
import { HarnessConfig } from './config';

export interface HarnessHandle {
  ctx: Context;
  logger: Logger;
  host: string;
  port: number;
}

/**
 * Compose the whole harness from plugins. Every capability — sandbox, shell,
 * sessions, the model adapter, the tool registry, the agent loop, the
 * sub-agent service and the HTTP gateway — is a plugin registered into one
 * Context. This is the "everything is a plugin" composition root.
 */
export async function createHarness(cfg: HarnessConfig): Promise<HarnessHandle> {
  const ctx = new Context();
  const logger = new Logger(ctx.bus);

  // Built-in, non-plugin services.
  ctx.provide({ name: 'bus', factory: () => ctx.bus });
  ctx.provide({ name: 'logger', factory: () => logger });
  ctx.provide({ name: 'config', factory: () => cfg });

  ctx.use((c) => {
    c.provide({ name: 'sandbox', factory: () => new Sandbox(cfg.workspace) });
  }, 'sandbox');

  ctx.use((c) => {
    c.provide({ name: 'shell', factory: () => new Shell(c.bus, cfg.shell) });
  }, 'shell');

  ctx.use((c) => {
    const store = new SessionStore(c.bus, cfg.workspace, new SessionPersistence(cfg.workspace));
    c.provide({ name: 'sessions', factory: () => store });
    c.onDispose(() => store.dispose());
  }, 'sessions');

  ctx.use((c) => {
    c.provide({ name: 'llm', factory: () => createAdapter(cfg.llm) });
  }, 'llm');

  ctx.use((c) => {
    const registry = new ToolRegistry();
    for (const t of builtinTools) registry.register(t);
    c.provide({ name: 'tools', factory: () => registry });
  }, 'tools');

  const modelOverride = cfg.llm.provider === 'mock' ? undefined : cfg.llm.model;

  ctx.use((c) => {
    c.provide({
      name: 'agent',
      deps: ['bus', 'llm', 'tools', 'sessions', 'sandbox', 'shell'],
      factory: (deps, cx) => {
        const [bus, llm, tools, sessions, sandbox, shell] = deps as [
          EventBus,
          LlmAdapter,
          ToolRegistry,
          SessionStore,
          Sandbox,
          Shell,
        ];
        return new Agent(cx, bus, llm, tools, sessions, sandbox, shell, {
          model: modelOverride,
          maxTokens: cfg.llm.maxTokens,
          maxIterations: cfg.maxIterations,
        });
      },
    });
  }, 'agent');

  ctx.use((c) => {
    c.provide({
      name: 'subagent',
      deps: ['bus', 'llm', 'tools', 'sessions', 'sandbox', 'shell'],
      factory: (deps, cx) => {
        const [bus, llm, tools, sessions, sandbox, shell] = deps as [
          EventBus,
          LlmAdapter,
          ToolRegistry,
          SessionStore,
          Sandbox,
          Shell,
        ];
        return new SubagentService(cx, bus, llm, tools, sessions, sandbox, shell, {
          model: modelOverride,
          maxTokens: cfg.llm.maxTokens,
        });
      },
    });
  }, 'subagent');

  ctx.use(
    createApiPlugin({
      host: cfg.host,
      port: cfg.port,
      clientDistDir: path.resolve(process.cwd(), 'client', 'dist'),
    }),
    'api',
  );

  // Compose all plugins (registers every service).
  await ctx.start();

  // Replay persisted sessions once the bus + store are wired.
  await ctx.get<SessionStore>('sessions').init();

  // Trigger the HTTP listener and wait until it is accepting connections.
  await ctx.get<{ ready: Promise<void> }>('httpServer').ready;

  return { ctx, logger, host: cfg.host, port: cfg.port };
}
