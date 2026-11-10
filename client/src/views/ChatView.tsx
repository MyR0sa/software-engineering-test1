import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useHarness } from '../store';
import { deriveConversation } from '../projection';
import { Chip, Empty, JsonBlock, LOOP_FLOW, Panel, stateTone } from '../components/ui';
import type { TrajectoryEvent } from '../types';

function LoopStatePanel({ events }: { events: TrajectoryEvent[] }) {
  const currentId = useHarness((s) => s.currentId);
  const state = useHarness((s) => (s.currentId ? s.loopStates[s.currentId] ?? 'idle' : 'idle'));
  const todos = useHarness((s) => (s.currentId ? s.todos[s.currentId] ?? [] : []));

  const stats = useMemo(() => {
    let inputTokens = 0;
    let outputTokens = 0;
    let toolCalls = 0;
    let turns = 0;
    let lastRequest: Record<string, unknown> | null = null;
    for (const e of events) {
      if (e.type === 'llm.done') {
        inputTokens += Number((e.data.usage as { inputTokens?: number })?.inputTokens ?? 0);
        outputTokens += Number((e.data.usage as { outputTokens?: number })?.outputTokens ?? 0);
      }
      if (e.type === 'tool.call') toolCalls++;
      if (e.type === 'turn.completed') turns++;
      if (e.type === 'llm.request') lastRequest = e.data;
    }
    return { inputTokens, outputTokens, toolCalls, turns, lastRequest };
  }, [events]);

  const flow = [...LOOP_FLOW];
  if (state === 'aborted' || state === 'error') flow.push(state);

  return (
    <div className="control-col">
      <Panel title="Agent Loop 状态机">
        <div className="flow">
          {flow.map((s, i) => (
            <span key={s} className="flow-item">
              {i > 0 && <span className="flow-arrow">→</span>}
              <span className={`flow-node ${s === state ? 'active' : ''}`} data-tone={stateTone(s)}>
                {s}
              </span>
            </span>
          ))}
        </div>
        <div className="stat-grid">
          <Stat label="当前状态" value={<Chip label={state} tone={stateTone(state)} />} />
          <Stat label="已完成回合" value={stats.turns} />
          <Stat label="工具调用" value={stats.toolCalls} />
          <Stat label="输入 tokens" value={stats.inputTokens} />
          <Stat label="输出 tokens" value={stats.outputTokens} />
        </div>
      </Panel>

      <Panel title="任务列表">
        {todos.length === 0 ? (
          <Empty msg="暂无任务（模型可通过 todo_write 工具维护）" />
        ) : (
          <ul className="todo-list">
            {todos.map((t, i) => (
              <li key={i} className={t.done ? 'done' : ''}>
                <span className="todo-box">{t.done ? '✓' : ''}</span> {t.text}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="最近一次 LLM 请求（prompt 组装）">
        {stats.lastRequest ? (
          <JsonBlock data={stats.lastRequest} />
        ) : (
          <Empty msg="尚未发起模型请求" />
        )}
      </Panel>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

function ToolUseCard({ name, input, result }: { name: string; input: Record<string, unknown>; result?: { content: string; isError?: boolean; durationMs?: number } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`toolcard ${result?.isError ? 'err' : ''}`}>
      <button className="toolcard-head" onClick={() => setOpen(!open)}>
        <span className="toolcard-name">🔧 {name}</span>
        <span className="toolcard-right">
          {result && <span className="muted">{result.durationMs ?? '–'}ms</span>}
          <span className="chevron">{open ? '▾' : '▸'}</span>
        </span>
      </button>
      {open && (
        <div className="toolcard-body">
          <div className="toolcard-section">
            <div className="toolcard-label">input</div>
            <JsonBlock data={input} />
          </div>
          {result && (
            <div className="toolcard-section">
              <div className="toolcard-label">result</div>
              <pre className={`toolcard-result ${result.isError ? 'err' : ''}`}>{result.content}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ChatView() {
  const currentId = useHarness((s) => s.currentId);
  const events = useHarness((s) => (s.currentId ? s.events[s.currentId] ?? [] : []));
  const busy = useHarness((s) => s.busy);
  const send = useHarness((s) => s.send);
  const abort = useHarness((s) => s.abort);
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => deriveConversation(events), [events]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [items.length, busy]);

  const onSubmit = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText('');
    void send(t);
  };

  return (
    <div className="chat-layout">
      <div className="chat-main">
        <div className="chat-scroll" ref={scrollRef}>
          {items.length === 0 ? (
            <Empty msg="发送一条消息开始。试试：『列出当前目录』、『执行 echo hello』、『写一个 todo 计划』、『派个子代理』" />
          ) : (
            items.map((it) =>
              it.kind === 'user' ? (
                <div key={it.seq} className="msg msg-user">
                  <div className="msg-role">用户</div>
                  <div className="msg-text">{it.text}</div>
                </div>
              ) : (
                <div key={it.seq} className="msg msg-assistant">
                  <div className="msg-role">assistant</div>
                  {it.text && <div className="msg-text">{it.text}</div>}
                  {it.toolUses.map((tu) => (
                    <ToolUseCard key={tu.id} name={tu.name} input={tu.input} result={tu.result} />
                  ))}
                </div>
              ),
            )
          )}
          {busy && <div className="msg msg-assistant"><div className="msg-role">assistant</div><div className="cursor-blink">▋</div></div>}
        </div>
        <div className="chat-input">
          <textarea
            value={text}
            placeholder="输入消息，回车发送，Shift+Enter 换行"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
          />
          <div className="chat-actions">
            {busy ? (
              <button className="btn btn-danger" onClick={() => void abort()}>
                ■ 中止
              </button>
            ) : (
              <button className="btn btn-primary" onClick={onSubmit} disabled={!text.trim()}>
                发送
              </button>
            )}
          </div>
        </div>
      </div>
      <LoopStatePanel events={events} />
    </div>
  );
}
