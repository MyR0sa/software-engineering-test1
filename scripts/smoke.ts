/**
 * End-to-end smoke test: boots the full harness (mock adapter), then drives it
 * over HTTP *and* WebSocket — serves the dashboard, runs tool-calling + shell +
 * todo turns, asserts the trajectory/projection — and reports PASS/FAIL.
 *
 *   npm run smoke
 */
import { WebSocket } from 'ws';
import { loadConfig } from '../src/server/config';
import { createHarness } from '../src/server/bootstrap';
import type { TrajectoryEvent } from '../src/core/events';

const waitFor = (cond: () => boolean, timeoutMs = 5000): Promise<void> =>
  new Promise((resolve, reject) => {
    const t0 = Date.now();
    const t = setInterval(() => {
      if (cond()) {
        clearInterval(t);
        resolve();
      } else if (Date.now() - t0 > timeoutMs) {
        clearInterval(t);
        reject(new Error('waitFor timeout'));
      }
    }, 10);
  });

async function main(): Promise<void> {
  const cfg = loadConfig({
    ...process.env,
    HARNESS_LLM_PROVIDER: 'mock',
    HARNESS_PORT: '3980',
    HARNESS_WORKSPACE: './workspace-smoke',
  });
  const { ctx } = await createHarness(cfg);
  const base = `http://${cfg.host}:${cfg.port}`;

  let failed = false;
  const check = (name: string, cond: boolean) => {
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
    if (!cond) failed = true;
  };

  try {
    // ---- HTTP / dashboard ---------------------------------------------------
    const health = (await (await fetch(`${base}/api/health`)).json()) as { ok: boolean; tools: number };
    check('health ok', health.ok === true);
    check('>=6 tools registered', health.tools >= 6);

    const indexHtml = await (await fetch(`${base}/`)).text();
    check('serves dashboard index.html', indexHtml.includes('id="root"'));

    const plugins = (await (await fetch(`${base}/api/plugins`)).json()) as {
      plugins: string[];
      services: { name: string }[];
    };
    check(
      'plugin inventory populated (>=7 plugins, agent service present)',
      plugins.plugins.length >= 7 && plugins.services.some((s) => s.name === 'agent'),
    );

    const models = (await (await fetch(`${base}/api/models`)).json()) as { adapter: { id: string } };
    check('mock adapter selected', models.adapter.id === 'mock');

    // ---- REST turns ---------------------------------------------------------
    const created = (await (
      await fetch(`${base}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'smoke' }),
      })
    ).json()) as { id: string };
    check('session created', !!created.id);
    const sid = created.id;

    await fetch(`${base}/api/sessions/${sid}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '列出当前目录' }),
    });
    let events = (await (
      await fetch(`${base}/api/sessions/${sid}/events`)
    ).json()) as TrajectoryEvent[];
    let types = new Set(events.map((e) => e.type));
    check('turn has user.message', types.has('user.message'));
    check('turn has tool.call', types.has('tool.call'));
    check('turn has tool.result', types.has('tool.result'));
    check('turn has assistant.message', types.has('assistant.message'));
    check('turn completed', types.has('turn.completed'));

    await fetch(`${base}/api/sessions/${sid}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '执行 echo hello' }),
    });
    events = (await (
      await fetch(`${base}/api/sessions/${sid}/events`)
    ).json()) as TrajectoryEvent[];
    check('bash executed (shell.exit)', events.some((e) => e.type === 'shell.exit'));

    const detail = (await (await fetch(`${base}/api/sessions/${sid}`)).json()) as {
      history: unknown[];
    };
    check('projection rebuilt history', Array.isArray(detail.history) && detail.history.length > 0);

    // ---- WebSocket ----------------------------------------------------------
    const wsEvents: string[] = [];
    let helloSeen = false;
    let sentAck = false;
    const ws = new WebSocket(`ws://${cfg.host}:${cfg.port}/ws`);
    ws.on('message', (d) => {
      const m = JSON.parse(String(d)) as { type: string; event?: TrajectoryEvent };
      if (m.type === 'hello') helloSeen = true;
      else if (m.type === 'event') wsEvents.push(m.event!.type);
      else if (m.type === 'sent') sentAck = true;
    });
    await waitFor(() => helloSeen);
    check('ws hello received', helloSeen);

    ws.send(JSON.stringify({ type: 'send', sessionId: sid, text: '建立任务清单' }));
    await waitFor(() => sentAck && wsEvents.includes('turn.completed'));
    check('ws send ack + live events', sentAck && wsEvents.includes('user.message'));
    check('todo tool invoked via ws', wsEvents.includes('todo.updated'));
    ws.close();
  } finally {
    await ctx.dispose();
  }

  console.log(failed ? '\nSMOKE FAILED' : '\nSMOKE OK');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
