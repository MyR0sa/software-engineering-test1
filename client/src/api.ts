import type { HelloPayload, TrajectoryEvent } from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get<T>(url: string): Promise<T> {
    return request<T>(url);
  },
  post<T>(url: string, body?: unknown): Promise<T> {
    return request<T>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  },
};

export function connectWs(
  onEvent: (e: TrajectoryEvent) => void,
  onHello: (h: HelloPayload) => void,
  onStatus: (s: string) => void,
): () => void {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);

  ws.onopen = () => onStatus('connected');
  ws.onclose = () => onStatus('disconnected');
  ws.onerror = () => onStatus('error');

  ws.onmessage = (m) => {
    let msg: any;
    try {
      msg = JSON.parse(m.data as string);
    } catch {
      return;
    }
    if (msg.type === 'hello') onHello(msg as HelloPayload);
    else if (msg.type === 'event') onEvent(msg.event as TrajectoryEvent);
    else if (msg.type === 'error') console.error('[harness]', msg.error);
  };

  return () => ws.close();
}
