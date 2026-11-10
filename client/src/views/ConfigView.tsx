import { useHarness } from '../store';

export default function ConfigView() {
  const config = useHarness((s) => s.config);

  if (!config) return <div className="empty">加载中…</div>;

  const rows: [string, string][] = [
    ['LLM provider', config.llm.provider],
    ['LLM model', config.llm.model],
    ['LLM base URL', config.llm.baseUrl],
    ['LLM api key', config.llm.apiKey],
    ['host', config.host],
    ['port', String(config.port)],
    ['workspace（沙箱根目录）', config.workspace],
    ['shell', config.shell],
    ['max iterations', String(config.maxIterations)],
  ];

  return (
    <div className="view">
      <div className="view-head">
        <h2>配置 Config</h2>
        <span className="muted">来自环境变量（.env），key 已脱敏</span>
      </div>
      <div className="kv-card">
        {rows.map(([k, v]) => (
          <div className="kv-row" key={k}>
            <span className="kv-key">{k}</span>
            <span className="kv-val mono">{v}</span>
          </div>
        ))}
      </div>
      <p className="hint">
        完整配置项见仓库根目录 <code>.env.example</code>。workspace 目录是 shell / 文件工具的能力边界（sandbox），
        每次会话会在其下 <code>sessions/&lt;id&gt;</code> 建立独立工作目录。
      </p>
    </div>
  );
}
