import { useEffect, useMemo, useRef, useState } from 'react';
import { useHarness } from '../store';
import { pretty } from '../projection';
import type { TrajectoryEvent } from '../types';

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

function EventRow({ e }: { e: TrajectoryEvent }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="event-row">
      <button className="event-head" onClick={() => setOpen(!open)}>
        <span className="event-seq">#{e.seq}</span>
        <span className="event-time">{fmtTime(e.ts)}</span>
        <span className="event-type">{e.type}</span>
        <span className="event-session">{e.sessionId}</span>
        <span className="chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <div className="event-body">
          <pre className="json">{pretty(e.data)}</pre>
        </div>
      )}
    </div>
  );
}

export default function TrajectoryView() {
  const sessions = useHarness((s) => s.sessions);
  const currentId = useHarness((s) => s.currentId);
  const events = useHarness((s) => s.events);
  const [scope, setScope] = useState('current');
  const [typeFilter, setTypeFilter] = useState('');

  const bucket: TrajectoryEvent[] =
    scope === 'system' ? events['system'] ?? [] : currentId ? events[currentId] ?? [] : [];

  const types = useMemo(() => [...new Set(bucket.map((e) => e.type))].sort(), [bucket]);

  const visible = useMemo(
    () => bucket.filter((e) => !typeFilter || e.type.includes(typeFilter)),
    [bucket, typeFilter],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [visible.length]);

  return (
    <div className="trajectory">
      <div className="toolbar">
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="current">当前会话</option>
          <option value="system">system（全局）</option>
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="">全部类型</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="muted">
          {visible.length} / {bucket.length} events
        </span>
        <span className="muted">· append-only 轨迹日志（实时流）</span>
      </div>
      <div className="event-list" ref={scrollRef}>
        {visible.length === 0 ? (
          <div className="empty">暂无事件</div>
        ) : (
          visible.map((e) => <EventRow key={e.seq} e={e} />)
        )}
      </div>
    </div>
  );
}
