# Agent Harness — 底座（参考 DeepSeek Harness）

一个 **"一切皆插件"** 的 Agent 运行时底座。核心架构参考了 DeepSeek 于 2026 年 8 月开源的
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（`Model + Harness = Agent`，
模型适配器、工具注册表、会话日志、沙箱，甚至 **agent loop 本身都是插件**，底层是 Cordis 式元框架）。

本仓库用 TypeScript/Node 复刻了这套架构的**底座**，并配了一个能逐层展示底层控制的前端。
具体的 Agent 业务功能（"这个 agent 做什么"）留待后续在这套底座上以插件方式叠加。

## 快速开始

```bash
# 1. 安装依赖（后端 + 前端）
npm run setup          # = npm install + client install + client build

# 2. 启动（默认 Mock 模型，无需任何 API key）
npm start
```

打开 `http://127.0.0.1:3080` 即可看到控制台。

> 开发模式（前端热更新）：终端 A 跑 `npm start`，终端 B 跑 `npm run client:dev`，访问 `http://localhost:5173`。

## 切换到真实模型（DeepSeek / OpenAI 兼容）

```bash
cp .env.example .env
# 编辑 .env：
#   HARNESS_LLM_PROVIDER=openai-compat
#   HARNESS_LLM_API_KEY=sk-...
#   HARNESS_LLM_BASE_URL=https://api.deepseek.com
#   HARNESS_LLM_MODEL=deepseek-chat
npm start
```

适配器走 OpenAI 兼容协议（`/chat/completions` + SSE 流式 + function 工具调用），
DeepSeek、OpenAI、Azure、本地 vLLM/Ollama（OpenAI 兼容端点）通用。

## 验证

```bash
npm run typecheck   # 后端类型检查
npm run smoke       # 端到端冒烟：起服务 -> 建会话 -> 工具调用回合 -> shell 回合 -> 校验轨迹
```

## 目录结构（与 DeepSeek Harness 包结构对应）

```
src/
  core/       # kernel：Context（服务注册/依赖注入/生命周期）+ EventBus + Logger
  llm/        # 模型适配器（Mock + OpenAI 兼容/DeepSeek）
  tools/      # 工具注册表 + 内建工具（bash / read_file / write_file / list_dir / todo_write / subagent）
  shell/      # 能力缝隙：子进程执行 + 文件系统沙箱
  session/    # append-only 轨迹日志 + projection + JSONL 持久化
  agent/      # agent loop 状态机 + prompt 组装
  subagent/   # 进程内子代理（fork in process）
  api/        # HTTP + WebSocket 网关
  server/     # 装配层（compose 所有插件）+ 配置 + 入口
client/       # React + Vite 前端（底层控制仪表盘）
```

架构细节、与 DeepSeek Harness 的逐项对照见 [`docs/architecture.md`](docs/architecture.md)。

## 核心概念

- **插件**：`(ctx) => void` 的函数。通过 `ctx.provide(name, spec)` 注册服务、`ctx.get(name)` 注入、
  `ctx.on/emit` 订阅/发射事件、`ctx.onDispose` 清理。
- **事件即轨迹**：一切可观察行为都发射为带序号的事件；会话日志 = append-only 事件流，
  消息历史永远是对事件的 **projection**（重放即恢复）。
- **能力缝隙**：shell、文件系统、模型、工具都是可替换的单一接口（seam），沙箱策略集中一处。
