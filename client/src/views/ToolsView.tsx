import { useState } from 'react';
import { useHarness } from '../store';
import { JsonBlock } from '../components/ui';

export default function ToolsView() {
  const tools = useHarness((s) => s.tools);
  const [openName, setOpenName] = useState<string | null>(null);

  return (
    <div className="view">
      <div className="view-head">
        <h2>工具注册表 Tool Registry</h2>
        <span className="muted">{tools.length} 个已注册工具 · 每个工具就是一个插件，schema 直接交给模型</span>
      </div>
      <div className="tool-list">
        {tools.map((t) => (
          <div key={t.name} className="tool-item">
            <button className="tool-item-head" onClick={() => setOpenName(openName === t.name ? null : t.name)}>
              <span className="tool-item-name">🔧 {t.name}</span>
              <span className="chevron">{openName === t.name ? '▾' : '▸'}</span>
            </button>
            <p className="tool-item-desc">{t.description}</p>
            {openName === t.name && (
              <div className="tool-item-schema">
                <div className="toolcard-label">inputSchema (JSON Schema)</div>
                <JsonBlock data={t.inputSchema} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
