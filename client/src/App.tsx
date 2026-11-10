import { useEffect } from 'react';
import { useHarness, type TabId } from './store';
import { Chip, stateTone } from './components/ui';
import ChatView from './views/ChatView';
import TrajectoryView from './views/TrajectoryView';
import ToolsView from './views/ToolsView';
import ModelsView from './views/ModelsView';
import PluginsView from './views/PluginsView';
import ConfigView from './views/ConfigView';

const TABS: { id: TabId; label: string }[] = [
  { id: 'chat', label: 'Agent Loop' },
  { id: 'trajectory', label: '轨迹 Trajectory' },
  { id: 'tools', label: '工具 Tools' },
  { id: 'models', label: '模型 Models' },
  { id: 'plugins', label: '插件 Plugins' },
  { id: 'config', label: '配置 Config' },
];

function Sidebar() {
  const sessions = useHarness((s) => s.sessions);
  const currentId = useHarness((s) => s.currentId);
  const loopStates = useHarness((s) => s.loopStates);
  const tab = useHarness((s) => s.tab);
  const select = useHarness((s) => s.select);
  const newSession = useHarness((s) => s.newSession);
  const setTab = useHarness((s) => s.setTab);

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">⌘</div>
        <div>
          <div className="brand-name">Harness</div>
          <div className="brand-sub">everything is a plugin</div>
        </div>
      </div>

      <button className="btn btn-primary btn-block" onClick={() => void newSession()}>
        ＋ 新会话
      </button>

      <div className="side-section">
        <div className="side-label">会话</div>
        <div className="session-list">
          {sessions.map((s) => {
            const st = loopStates[s.id] ?? s.state;
            return (
              <button
                key={s.id}
                className={`session-item ${s.id === currentId ? 'active' : ''}`}
                onClick={() => void select(s.id)}
              >
                <div className="session-title">{s.title}</div>
                <div className="session-meta">
                  <Chip label={st} tone={stateTone(st)} />
                  <span className="muted">{s.eventCount} ev</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="side-section">
        <div className="side-label">视图</div>
        <nav className="tabs">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${t.id === tab ? 'active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>
    </aside>
  );
}

function TopBar() {
  const connection = useHarness((s) => s.connection);
  const models = useHarness((s) => s.models);
  const config = useHarness((s) => s.config);
  const tab = useHarness((s) => s.tab);

  const label = TABS.find((t) => t.id === tab)?.label ?? '';

  return (
    <header className="topbar">
      <div className="topbar-title">{label}</div>
      <div className="topbar-right">
        <Chip label={`${config?.llm.provider ?? '…'}`} tone="blue" />
        <Chip label={models?.adapter.id ?? '…'} tone="purple" />
        <span className={`conn conn-${connection}`}>
          <span className="conn-dot" /> {connection}
        </span>
      </div>
    </header>
  );
}

export default function App() {
  const init = useHarness((s) => s.init);
  const tab = useHarness((s) => s.tab);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <TopBar />
        <main className="content">
          {tab === 'chat' && <ChatView />}
          {tab === 'trajectory' && <TrajectoryView />}
          {tab === 'tools' && <ToolsView />}
          {tab === 'models' && <ModelsView />}
          {tab === 'plugins' && <PluginsView />}
          {tab === 'config' && <ConfigView />}
        </main>
      </div>
    </div>
  );
}
