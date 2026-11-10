import { randomUUID } from 'node:crypto';

/** Short, sortable-ish, collision-resistant id with an optional prefix. */
export function uid(prefix = ''): string {
  const id = randomUUID().replace(/-/g, '').slice(0, 12);
  return prefix ? `${prefix}_${id}` : id;
}

/** Human-readable timestamp for display. */
export function formatTime(ts: number): string {
  return new Date(ts).toISOString();
}

/** Compact elapsed time in ms -> human string. */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}
