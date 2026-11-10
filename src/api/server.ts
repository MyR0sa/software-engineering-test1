import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import express, { type Request, type Response } from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { Context, Plugin } from '../core/context';
import { EventBus, EVENTS, TrajectoryEvent } from '../core/events';
import { Logger } from '../core/logger';
import { LlmAdapter } from '../llm';
import { ToolRegistry } from '../tools';
import { SessionStore } from '../session';
import { Agent } from '../agent';
import { HarnessConfig } from '../server/config';

export interface ApiOptions {
  host: string;
  port: number;
  clientDistDir?: string;
}

interface SessionSummary {
  id: string;
  title: string;
  createdAt: number;
  workingDirectory: string;
  eventCount: number;
  state: string;
}

/**
 * The HTTP + WebSocket gateway, packaged as a plugin like everything else.
 * REST gives snapshots; the WebSocket streams every trajectory event live so
 * the UI can render the agent's *underlying control* in detail.
 */
export function createApiPlugin(opts: ApiOptions): Plugin {
  return (ctx: Context) => {
    const bus = ctx.get<EventBus>('bus');
    const logger = ctx.get<Logger>('logger');
    const store = ctx.get<SessionStore>('sessions');
    const agent = ctx.get<Agent>('agent');
    const tools = ctx.get<ToolRegistry>('tools');
    const llm = ctx.get<LlmAdapter>('llm');
    const config = ctx.get<HarnessConfig>('config');

    const app = express();
    app.use(express.json({ limit: '2mb' }));
    app.use((req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      if (req.method === 'OPTIONS') return res.sendStatus(204);
      next();
    });

    // Serve the built web client if present.
    if (opts.clientDistDir && fs.existsSync(opts.clientDistDir)) {
      app.use(express.static(opts.clientDistDir));
    }

    const summary = (id: string): SessionSummary => {
      const s = store.get(id)!;
      return {
        id: s.id,
        title: s.title,
        createdAt: s.createdAt,
        workingDirectory: s.workingDirectory,
        eventCount: s.events.length,
        state: agent.getState(s.id),
      };
    };

    const sanitizedConfig = () => ({
      llm: {
        provider: config.llm.provider,
        baseUrl: config.llm.baseUrl,
        model: config.llm.model,
        apiKey: config.llm.apiKey ? '••••••••' : '(not set)',
      },
      host: config.host,
      port: config.port,
      workspace: config.workspace,
      shell: config.shell,
      maxIterations: config.maxIterations,
    });

    // ---- REST ---------------------------------------------------------------
    app.get('/api/health', (_req: Request, res: Response) => {
      res.json({
        ok: true,
        provider: llm.id,
        model: llm.listModels()[0]?.id,
        sessions: store.list().length,
        tools: tools.list().length,
        plugins: ctx.inventory().plugins.length,
      });
    });

    app.get('/api/config', (_req: Request, res: Response) => res.json(sanitizedConfig()));

    app.get('/api/plugins', (_req: Request, res: Response) => res.json(ctx.inventory()));

    app.get('/api/tools', (_req: Request, res: Response) => {
      res.json(tools.list().map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })));
    });

    app.get('/api/models', (_req: Request, res: Response) => {
      res.json({ adapter: { id: llm.id, provider: llm.provider }, models: llm.listModels() });
    });

    app.get('/api/sessions', (_req: Request, res: Response) => {
      res.json(store.list().map((s) => summary(s.id)));
    });

    app.post('/api/sessions', (req: Request, res: Response) => {
      const s = store.createSession(String(req.body?.title ?? ''));
      res.status(201).json(summary(s.id));
    });

    app.get('/api/sessions/:id', (req: Request, res: Response) => {
      const s = store.get(req.params.id);
      if (!s) return res.status(404).json({ error: 'not found' });
      res.json({
        ...summary(s.id),
        history: store.getHistory(s.id),
        events: s.events,
      });
    });

    app.get('/api/sessions/:id/events', (req: Request, res: Response) => {
      const s = store.get(req.params.id);
      if (!s) return res.status(404).json({ error: 'not found' });
      const after = Number(req.query.after ?? 0);
      res.json(s.events.filter((e) => e.seq > after));
    });

    app.post('/api/sessions/:id/messages', async (req: Request, res: Response) => {
      const s = store.get(req.params.id);
      if (!s) return res.status(404).json({ error: 'not found' });
      const text = String(req.body?.text ?? '').trim();
      if (!text) return res.status(400).json({ error: 'empty message' });
      if (agent.isRunning(s.id)) return res.status(409).json({ error: 'already running' });

      // Run the turn, then return the settled state. Live progress goes over WS.
      try {
        await agent.send(s.id, text);
        res.json({ state: agent.getState(s.id), history: store.getHistory(s.id) });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    });

    app.post('/api/sessions/:id/abort', (req: Request, res: Response) => {
      const s = store.get(req.params.id);
      if (!s) return res.status(404).json({ error: 'not found' });
      agent.abort(s.id);
      res.json({ ok: true });
    });

    // ---- WebSocket ----------------------------------------------------------
    const httpServer = http.createServer(app);
    const wss = new WebSocketServer({ noServer: true });

    const broadcast = (payload: unknown) => {
      const msg = JSON.stringify(payload);
      for (const client of wss.clients) {
        if (client.readyState === WebSocket.OPEN) client.send(msg);
      }
    };

    bus.onAny((e: TrajectoryEvent) => broadcast({ type: 'event', event: e }));

    const hello = () => ({
      type: 'hello',
      config: sanitizedConfig(),
      sessions: store.list().map((s) => summary(s.id)),
      tools: tools.list().map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      plugins: ctx.inventory(),
      models: { adapter: { id: llm.id, provider: llm.provider }, models: llm.listModels() },
    });

    wss.on('connection', (socket) => {
      socket.send(JSON.stringify(hello()));
      socket.on('message', async (raw) => {
        let msg: { type: string; sessionId?: string; text?: string };
        try {
          msg = JSON.parse(String(raw));
        } catch {
          return;
        }
        if (msg.type === 'send' && msg.sessionId && msg.text) {
          try {
            await agent.send(msg.sessionId, msg.text);
            socket.send(JSON.stringify({ type: 'sent', sessionId: msg.sessionId, state: agent.getState(msg.sessionId) }));
          } catch (err) {
            socket.send(JSON.stringify({ type: 'error', error: (err as Error).message }));
          }
        } else if (msg.type === 'abort' && msg.sessionId) {
          agent.abort(msg.sessionId);
        }
      });
    });

    httpServer.on('upgrade', (req, socket, head) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== '/ws') {
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (sock) => wss.emit('connection', sock, req));
    });

    // Expose the server as a service so bootstrap can await "listening".
    ctx.provide({
      name: 'httpServer',
      factory: () => ({
        httpServer,
        ready: new Promise<void>((resolve) => {
          httpServer.listen(opts.port, opts.host, () => {
            logger.info(`http listening on http://${opts.host}:${opts.port}`);
            bus.emit(EVENTS.appReady, { host: opts.host, port: opts.port });
            resolve();
          });
        }),
      }),
    });

    ctx.onDispose(
      () =>
        new Promise<void>((resolve) => {
          for (const client of wss.clients) client.terminate();
          wss.close();
          httpServer.closeAllConnections?.();
          httpServer.close(() => resolve());
        }),
    );
  };
}

export { EVENTS };
export type { TrajectoryEvent };
