import type { ReactNode } from 'react';
import { pretty } from '../projection';

export function Chip({ label, tone = 'gray' }: { label: string; tone?: string }) {
  return <span className={`chip chip-${tone}`}>{label}</span>;
}

export function JsonBlock({ data }: { data: unknown }) {
  return <pre className="json">{pretty(data)}</pre>;
}

export function Empty({ msg }: { msg: string }) {
  return <div className="empty">{msg}</div>;
}

export function Panel({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">{title}</span>
        {right}
      </div>
      <div className="panel-body">{children}</div>
    </div>
  );
}

export function stateTone(state: string): string {
  switch (state) {
    case 'streaming':
    case 'building-context':
      return 'blue';
    case 'running-tool':
      return 'amber';
    case 'done':
      return 'green';
    case 'aborted':
    case 'error':
      return 'red';
    default:
      return 'gray';
  }
}

export const LOOP_FLOW = [
  'building-context',
  'streaming',
  'running-tool',
  'done',
] as const;
