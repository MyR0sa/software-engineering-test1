# 架构说明：底座如何复刻 DeepSeek Harness

## 1. 一句话定位

DeepSeek Harness 的公式是 **Model + Harness = Agent**：模型负责"思考"，Harness 负责工具调度、
任务状态管理与执行闭环；其最核心的原则是 **"一切皆插件"**，底层是 Cordis 元框架（服务注册、
依赖注入、生命周期、事件，全部可组合）。

本仓库复刻的是这个**底座**：把模型适配器、工具注册表、会话/轨迹日志、沙箱、agent loop、
子代理、HTTP 网关全部做成插件，组合进一个 `Context`。后续"agent 做什么"的业务功能，就是往这个
`Context` 里再注册新的插件/工具/服务。

## 2. 目录 ↔ DeepSeek Harness 包对照

| 本仓库 | DeepSeek Harness 对应 | 说明 |
| --- | --- | --- |
| `src/core/` | Cordis（vendored）+ `boot/` | 内核：`Context`（provide/get/on/emit/dispose）+ `EventBus` |
| `src/llm/` | `packages/llm/llm` + `llm-deepseek` | 模型适配器接口 + Mock + OpenAI 兼容适配器 |
| `src/tools/` | `packages/core/tools` + `tool-*` | 工具注册表 + 内建工具 |
| `src/shell/` | `packages/shell/` + `packages/sandbox/` | 子进程执行 + 文件系统沙箱 |
| `src/session/` | `packages/session/session-persistence` + `session-projection` | append-only 日志 + projection + JSONL |
| `src/agent/` | `packages/core/agent-loop` + `system-prompt` | agent loop 状态机 + prompt 组装 |
| `src/subagent/` | `packages/subagent/subagent-fork-in-process` | 进程内子代理 |
| `src/api/` | `packages/api/gateway` + `session-controller` | HTTP + WebSocket 网关 |
| `src/server/` | `apps/cli` + `apps/web` 的装配 | 组合所有插件的根 |
| `client/` | `packages/client/*`（`ui-chat`/`ui-trajectory`/`ui-tool`…） | 底层控制前端 |

## 3. 内核：`Context`（Cordis 式的元框架）

```ts
type Plugin = (ctx: Context) => void | Promise<void>;

ctx.provide({ name: 'llm', deps: ['config'], factory: (deps, ctx) => adapter });
ctx.get('llm');            // 惰性解析 + 缓存 + 依赖注入
ctx.on('tool.result', fn); // 订阅事件
ctx.emit('tool.result', data, sessionId);
ctx.onDispose(() => ...);  // 逆序清理
```

- **服务是惰性单例**，声明式依赖（`deps`）在解析时递归注入。
- **事件总线是同步的**：`emit` 立即同步通知所有监听者，保证一个回合内事件顺序确定。
  重活（LLM 流式、工具执行）在 agent loop 里做，事件处理器只做"记录 + 广播"。
- 没有任何特权核心——`agent` 服务依赖 `llm/tools/sessions/sandbox/shell` 的方式，和用户插件一模一样。

## 4. 事件即轨迹（Trajectory）

每个事件 = `{ seq, ts, sessionId, type, data }`。会话日志是 append-only 的事件流，
消息历史永远是它的 **projection**：

```
user.message / assistant.message / tool.result   →  LLM 消息
其它（chunk、loop.state、shell.stdout…）          →  仅展示，不进入模型上下文
```

这样 **重放即恢复**：启动时从 JSONL 逐行读回事件，重建会话，无需额外状态。

## 5. Agent loop（本身是插件）

`Agent` 服务实现一个显式状态机，每个迁移都发射事件：

```
building-context → streaming → (tool calls?) running-tool → streaming → … → done / aborted / error
```

- 每回合：组装请求（system prompt + 工具 schema + projection 出的历史）→ 流式调用模型 →
  收集文本 + tool_use → 若有工具调用则逐个执行并把 `tool.result` 写回历史 → 再次流式，直到
  模型不再调用工具或达到 `maxIterations` 上限。
- 通过 `AbortController` 支持协作式中止；`llm.request` 事件把**发给模型的完整请求**暴露给前端。

## 6. 能力缝隙（capability seams）

| seam | 接口 | 可替换为 |
| --- | --- | --- |
| 模型 | `LlmAdapter.stream(req, handlers)` | 任意 provider / 本地推理 |
| 工具 | `ToolRegistry.register(tool)` | 任意新工具 |
| shell | `Shell.run(cmd, opts)` | bash / pwsh / cmd / 远程沙箱 |
| 文件 | `Sandbox.resolve()` | 更严格的策略 / 远程 FS |
| 子代理 | `SubagentService.run(opts)` | 委托 Claude Code / Codex / 远端 agent |

## 7. 前端：底层控制展示

- **Agent Loop**：实时状态机高亮 + 回合/工具/Token 统计 + 最近一次 LLM 请求的原始 JSON。
- **轨迹**：append-only 事件流的实时视图，按类型过滤、展开原始 payload。
- **工具/模型/插件/配置**：工具 JSON Schema、模型适配器目录、插件清单与**服务依赖图**、脱敏配置。

## 8. 后续叠加业务功能的入口

在这套底座上"新增 agent 的能力"通常是四选一，都不需要改核心：

1. 注册一个新 **工具**（`registry.register(...)`）。
2. 注册一个新 **服务/插件**（`ctx.use(...)` + `ctx.provide(...)`）。
3. 替换一个 **seam**（换模型适配器 / 沙箱 / 子代理 provider）。
4. 订阅 **事件**做旁路（审计、告警、遥测、自定义 UI 面板）。
