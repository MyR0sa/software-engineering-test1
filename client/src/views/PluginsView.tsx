import { useHarness } from '../store';
import { Chip } from '../components/ui';

export default function PluginsView() {
  const plugins = useHarness((s) => s.plugins);

  return (
    <div className="view">
      <div className="view-head">
        <h2>插件与服务 Plugins & Services</h2>
        <span className="muted">一切皆插件：模型、工具、会话、agent loop、HTTP 网关都是插件，服务之间有显式依赖</span>
      </div>

      <h3>已组合插件</h3>
      <div className="plugin-chips">
        {(plugins?.plugins ?? []).map((p) => (
          <Chip key={p} label={p} tone="blue" />
        ))}
      </div>

      <h3>服务图（依赖注入）</h3>
      <table className="table">
        <thead>
          <tr>
            <th>service</th>
            <th>dependencies</th>
          </tr>
        </thead>
        <tbody>
          {(plugins?.services ?? []).map((s) => (
            <tr key={s.name}>
              <td className="mono">{s.name}</td>
              <td>
                {s.deps.length ? s.deps.map((d) => <Chip key={d} label={d} tone="green" />) : <span className="muted">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="hint">
        这是一个 Cordis 式的内核：插件是 <code>(ctx) =&gt; void</code> 的函数，通过
        <code> ctx.provide()</code> 注册服务、<code>ctx.get()</code> 注入依赖、<code>ctx.on()/emit()</code>{' '}
        订阅/发射事件、<code>ctx.onDispose()</code> 清理。
      </p>
    </div>
  );
}
