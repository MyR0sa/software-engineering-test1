import { useHarness } from '../store';
import { Chip } from '../components/ui';

export default function ModelsView() {
  const models = useHarness((s) => s.models);
  const config = useHarness((s) => s.config);

  return (
    <div className="view">
      <div className="view-head">
        <h2>模型适配器 Model Adapter</h2>
        <span className="muted">模型本身也是一个插件：换 provider 只改配置，不改代码</span>
      </div>

      <div className="kv-card">
        <div className="kv-row">
          <span className="kv-key">adapter id</span>
          <span className="kv-val"><Chip label={models?.adapter.id ?? '…'} tone="purple" /></span>
        </div>
        <div className="kv-row">
          <span className="kv-key">provider</span>
          <span className="kv-val">{models?.adapter.provider ?? '…'}</span>
        </div>
        <div className="kv-row">
          <span className="kv-key">配置 provider</span>
          <span className="kv-val">{config?.llm.provider ?? '…'}</span>
        </div>
        <div className="kv-row">
          <span className="kv-key">base URL</span>
          <span className="kv-val mono">{config?.llm.baseUrl ?? '…'}</span>
        </div>
        <div className="kv-row">
          <span className="kv-key">api key</span>
          <span className="kv-val mono">{config?.llm.apiKey ?? '…'}</span>
        </div>
      </div>

      <h3>模型目录</h3>
      <table className="table">
        <thead>
          <tr>
            <th>id</th>
            <th>provider</th>
            <th>name</th>
            <th>context window</th>
            <th>tool calling</th>
          </tr>
        </thead>
        <tbody>
          {models?.models.map((m) => (
            <tr key={m.id}>
              <td className="mono">{m.id}</td>
              <td>{m.provider}</td>
              <td>{m.name}</td>
              <td>{m.contextWindow.toLocaleString()}</td>
              <td>{m.supportsToolCalling ? '✓' : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="hint">
        切换到真实模型：复制 <code>.env.example</code> 为 <code>.env</code>，设置{' '}
        <code>HARNESS_LLM_PROVIDER=openai-compat</code>、<code>HARNESS_LLM_API_KEY</code>、
        <code>HARNESS_LLM_BASE_URL=https://api.deepseek.com</code> 后重启即可。
      </p>
    </div>
  );
}
