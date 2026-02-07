# OpenClaw

个人 AI 助手平台，运行在自己的设备上。核心是一个多通道消息网关，将 AI 模型（Claude / OpenAI 等）连接到各种通信平台（WhatsApp、Telegram、Slack、Discord、Signal、iMessage 等）。

## 架构概览

```
消息通道 (WhatsApp/Telegram/Slack/...)
         │
         ▼
   ┌──────────┐
   │  Gateway  │  WebSocket 服务 (:18789)
   │  (控制面) │  会话管理 / 认证 / 路由
   └────┬─────┘
        │
        ▼
  ┌───────────┐
  │   Agent   │  Pi Agent Runtime
  │  Runtime  │  工具执行 / 模型调用
  └─────┬─────┘
        │
        ▼
  ┌───────────┐
  │ AI Models │  Anthropic / OpenAI / Bedrock / Gemini / Ollama
  └───────────┘
```

**消息流**: 消息到达通道 → 通道适配器归一化 → Gateway 路由到会话/Agent → Agent 调用 AI 模型 → 响应流式回传 → 通道适配器格式化并投递。

## 目录结构

```
openclaw/
├── src/                    # 主源码 (TypeScript ESM)
│   ├── entry.ts            # CLI 入口，环境初始化 + respawn
│   ├── index.ts            # 库入口，构建 Commander program
│   ├── cli/                # CLI 框架 (Commander)
│   ├── commands/           # CLI 命令实现
│   ├── gateway/            # WebSocket Gateway 服务
│   ├── agents/             # Agent 运行时、认证、工具
│   ├── channels/           # 通道插件架构
│   ├── config/             # 配置系统 (JSON5 + Zod)
│   ├── telegram/           # Telegram 通道 (grammY)
│   ├── discord/            # Discord 通道
│   ├── slack/              # Slack 通道 (Bolt)
│   ├── signal/             # Signal 通道
│   ├── whatsapp/           # WhatsApp 通道 (Baileys)
│   ├── web/                # Web UI + WebChat
│   ├── browser/            # 浏览器自动化 (Playwright)
│   ├── media/              # 媒体处理管线
│   ├── memory/             # 向量存储 (sqlite-vec)
│   ├── hooks/              # Webhook 系统
│   ├── cron/               # 定时任务
│   ├── plugins/            # 插件加载器
│   ├── tui/                # 终端 UI
│   ├── tts/                # 文字转语音
│   ├── infra/              # 基础设施工具
│   ├── routing/            # 消息路由
│   ├── sessions/           # 会话管理
│   ├── security/           # 安全工具
│   └── wizard/             # 新手向导
├── extensions/             # 通道扩展插件 (31个)
│   ├── bluebubbles/        # iMessage (BlueBubbles)
│   ├── matrix/             # Matrix 协议
│   ├── msteams/            # Microsoft Teams
│   ├── feishu/             # 飞书
│   ├── voice-call/         # 语音通话
│   └── ...
├── skills/                 # 技能插件 (53个)
│   ├── coding-agent/       # 编码代理
│   ├── canvas/             # 画布渲染
│   ├── github/             # GitHub 操作
│   ├── 1password/          # 1Password 集成
│   └── ...
├── apps/                   # 原生应用
│   ├── macos/              # macOS 菜单栏 (Swift/SwiftUI)
│   ├── ios/                # iOS 应用 (SwiftUI)
│   ├── android/            # Android 应用 (Kotlin/Compose)
│   └── shared/             # 共享 OpenClawKit
├── ui/                     # 控制面板 Web UI (Lit)
├── docs/                   # 文档 (Mintlify)
├── scripts/                # 构建/测试/自动化脚本
├── test/                   # E2E 和集成测试
└── vendor/                 # 第三方依赖
```

## 核心模块

### Gateway (`src/gateway/`)

WebSocket 服务，端口 18789。作为所有通信的中央控制面：

- 会话管理与存在状态
- Token / 密码认证
- 工具调用代理
- 支持 Tailscale Serve/Funnel 远程访问

### Agent Runtime (`src/agents/`)

基于 Pi Agent（`@mariozechner/pi-agent-core`）的运行时：

- 认证 profile 管理（OAuth / API Key 轮换）
- 工具执行（Bash、浏览器、画布、Node 命令）
- 会话压缩与持久化
- 模型 failover 与多 provider 切换

### 通道系统 (`src/channels/` + 各通道目录)

插件化通道架构，核心内置 5 个通道，扩展 31 个：

| 通道 | 实现 | 协议库 |
|------|------|--------|
| WhatsApp | `src/whatsapp/` | Baileys |
| Telegram | `src/telegram/` | grammY |
| Slack | `src/slack/` | @slack/bolt |
| Discord | `src/discord/` | discord-api-types |
| Signal | `src/signal/` | signal-cli |
| iMessage | `src/imessage/` | AppleScript / BlueBubbles |

扩展通道作为独立 workspace package 在 `extensions/` 下，通过 `src/plugins/` 加载器动态加载。

### 配置系统 (`src/config/`)

- 配置文件: `~/.openclaw/openclaw.json` (JSON5)
- Zod schema 校验
- 运行时覆盖与迁移
- 按 Agent 作用域配置

### CLI (`src/cli/` + `src/commands/`)

Commander 框架，主要命令：

```
openclaw onboard          # 新手向导
openclaw gateway run      # 启动 Gateway
openclaw agent            # 交互式 Agent 会话
openclaw channels login   # 通道登录
openclaw channels status  # 通道状态
openclaw doctor           # 健康检查
openclaw status           # 系统状态
openclaw config set       # 配置管理
openclaw message send     # 发送消息
openclaw tui              # 终端 UI
```

## 启动流程

```
openclaw.mjs
  → 启用 Node compile cache
  → import dist/entry.js

entry.ts
  → 设置进程标题 "openclaw"
  → 过滤实验性警告
  → 环境变量归一化
  → 解析 CLI profile (--profile)
  → 必要时 respawn 以添加 --disable-warning
  → import cli/run-main.js → runCli()

index.ts (库入口)
  → 加载 .env
  → 归一化环境变量
  → 确保 openclaw CLI 在 PATH 上
  → 捕获控制台输出到结构化日志
  → 运行时版本断言 (Node ≥22.12.0)
  → 构建 Commander program
  → 导出公共 API
```

## 插件与技能

### 扩展 (Extensions)

通道扩展是独立的 pnpm workspace package，放在 `extensions/` 下。特点：

- 插件专有依赖放在各自的 `package.json`
- 安装时 `npm install --omit=dev`
- 通过 `openclaw/plugin-sdk` 获取 SDK（jiti alias 运行时解析）
- `devDependencies` 或 `peerDependencies` 引用 `openclaw`

### 技能 (Skills)

53 个内置技能，提供工具调用能力：

- **开发**: `coding-agent`, `github`, `tmux`
- **媒体**: `canvas`, `camsnap`, `peekaboo`, `video-frames`
- **效率**: `1password`, `apple-notes`, `apple-reminders`, `things-mac`, `notion`, `obsidian`, `trello`
- **通信**: `discord`, `slack`, `imsg`, `bluebubbles`
- **AI**: `gemini`, `openai-image-gen`, `openai-whisper`
- **其他**: `weather`, `spotify-player`, `food-order`, `healthcheck`

## 原生应用

| 平台 | 技术栈 | 特性 |
|------|--------|------|
| macOS | Swift / SwiftUI | 菜单栏常驻、语音唤醒、画布渲染、Gateway 控制 |
| iOS | SwiftUI | 画布客户端、语音触发、摄像头/录屏、Bonjour 配对 |
| Android | Kotlin / Jetpack Compose | 画布客户端、对讲模式、摄像头/录屏 |

## 安全模型

- **默认**: 主会话工具在宿主环境直接运行
- **沙盒**: 非主会话（群组/通道）使用 Docker 沙盒
- **DM 配对**: 未知发送者需要配对码
- **允许列表**: 每通道发送者白名单
- **认证**: Token 或密码认证
- **凭证保护**: 配置 API 中自动脱敏

## 技术栈

| 类别 | 技术 |
|------|------|
| 语言 | TypeScript (ESM, 严格模式) |
| 运行时 | Node.js ≥22.12.0 |
| 包管理 | pnpm (主), 也支持 bun |
| 构建 | tsdown (基于 rolldown) |
| 测试 | Vitest + V8 coverage (阈值 70%) |
| Lint | Oxlint + Oxfmt |
| Web UI | Lit Web Components |
| 文档 | Mintlify |
| 类型检查 | TypeScript (tsgo) |

## 关键依赖

- `@mariozechner/pi-agent-core` — Pi Agent 运行时
- `@whiskeysockets/baileys` — WhatsApp Web 协议
- `grammy` — Telegram Bot 框架
- `@slack/bolt` — Slack 应用框架
- `playwright-core` — 浏览器自动化
- `commander` — CLI 框架
- `ws` — WebSocket 服务
- `zod` — Schema 校验
- `sqlite-vec` — 向量存储
- `sharp` — 图像处理
- `hono` — HTTP 框架（部分路由）

## 开发命令

```bash
pnpm install              # 安装依赖
pnpm build                # 构建 (tsdown)
pnpm check                # lint + format 检查
pnpm test                 # 运行测试
pnpm test:coverage        # 测试覆盖率
pnpm openclaw ...         # 开发模式运行 CLI
pnpm gateway:dev          # 开发模式启动 Gateway (跳过通道)
pnpm ui:dev               # 控制面板 UI 开发
pnpm tui                  # 终端 UI
```

## 参考价值

对 metabot 项目的参考意义：

1. **多通道架构** — 插件化通道设计，核心通道 + 扩展通道分离，统一消息路由
2. **Gateway 模式** — WebSocket 中央控制面，连接多个客户端（原生应用、CLI、Web UI）
3. **Agent 运行时** — 工具执行、会话管理、模型 failover 的实现模式
4. **插件/技能系统** — 通过 plugin-sdk 解耦，运行时动态加载
5. **CLI 入口设计** — respawn 机制、profile 支持、环境归一化
6. **配置管理** — JSON5 + Zod 校验 + 运行时迁移的组合
7. **安全分层** — 主会话直接执行 vs 非主会话 Docker 沙盒
