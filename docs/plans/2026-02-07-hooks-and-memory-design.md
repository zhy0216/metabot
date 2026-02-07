# Hooks & Memory System Design

## Goal

在 botctl 框架层实现 hook 系统和基于 session 的记忆管理。每次 `botctl send` 完成后，自动触发记忆更新 — 通过外部总结器（`claude --print`）异步生成对话摘要，写入 Markdown 文件，供下次对话注入给 agent。

## Core Concepts

### Chat Session — 滑动窗口

一个 session 是一组时间上连续的 send 交互。

**判定规则：**

```
如果 (本次 send 时间 - 上次 agent 响应完成时间) ≤ 30 分钟
  → 同一个 session
否则
  → 新 session
```

**举例：**

```
13:00 send → 13:05 完成   ─┐
13:10 send → 13:15 完成    │ Session A
13:19 send → 13:25 完成   ─┘
                              ← 35 分钟间隔 (13:25 → 14:00)
14:00 send → 14:10 完成   ─── Session B
```

### Hook System

事件驱动的管道，在 AgentManager 的关键生命周期点触发回调。

**事件类型：**

| Event | Trigger | Context |
|-------|---------|---------|
| `afterSend` | agent 响应完成后 | agentId, prompt, output, timestamp |
| `afterSpawn` | agent 启动完成后 | agentId, workspacePath |
| `beforeKill` | agent 被杀掉之前 | agentId |

### Memory Storage

```
~/.metabot/workspace/memories/
├── abc123-20260207.md
├── def456-20260207.md
└── ghi789-20260206.md
```

文件名格式：`{session-id}-{YYYYMMDD}.md`

### Memory File Format

```markdown
# Session abc123 — 2026-02-07

## Interactions
### 13:00
**Prompt:** 实现用户认证
**Summary:** 完成了 JWT 中间件，使用 jose 库。创建了 auth.ts 和 middleware.ts。

### 13:15
**Prompt:** 添加 refresh token
**Summary:** 在 auth.ts 中增加了 refresh token 逻辑，token 有效期 7 天。

## Key Decisions
- 选择 jose 库而不是 jsonwebtoken（更好的 ESM 支持）
- Token 存储在 httpOnly cookie

## Lessons Learned
- Bun 原生支持 crypto.subtle，不需要额外依赖
```

## Architecture

### Data Flow

```
botctl send "implement auth"
        │
        ↓
  AgentManager.send()
        │
        ├── [1] 发送 prompt 到 agent
        ├── [2] 等待 agent 回到 ready 状态
        ├── [3] 捕获 agent 输出
        │
        ↓  ── 触发 hook: "afterSend" ──
        │
  HookManager.emit("afterSend", {
    agentId, prompt, output, timestamp
  })
        │
        ↓
  MemoryHook.handler()
        │
        ├── 判定 session（滑动窗口）
        ├── 追加 interaction 到 session 文件
        ├── 异步调用 adapter.summarizeMemory()
        └── 更新 session 文件的 Key Decisions / Lessons
```

### Memory Injection (Read Path)

```
botctl spawn
        │
        ↓
  AgentAdapter.prepareWorkspace()
        │
        ├── 读取 memories/ 目录下最近 N 个 session 文件
        ├── 拼接成上下文文本
        └── 写入 workspace 的 MEMORY.md 或注入 instructions
```

## Interface Changes

### AgentAdapter — 新增 summarizeMemory

```typescript
export interface AgentAdapter {
  readonly type: string;
  prepareWorkspace(config: WorkspaceConfig): Promise<string>;
  buildLaunchCommand(opts: LaunchOptions): string[];
  formatPrompt(prompt: string): string;
  getReadyPattern(): RegExp;
  parseOutput(raw: string): AgentOutput;
  cleanup(workspacePath: string): Promise<void>;

  // NEW: 记忆总结能力
  summarizeMemory(ctx: SummarizeContext): Promise<string>;
}

export interface SummarizeContext {
  prompt: string;          // 本轮用户 prompt
  output: string;          // 本轮 agent 输出
  existingMemory: string;  // 现有 session 记忆文件内容
  sessionId: string;
}
```

### ClaudeCodeAdapter.summarizeMemory 实现

使用 `claude --print` + haiku 模型做轻量总结：

```typescript
async summarizeMemory(ctx: SummarizeContext): Promise<string> {
  const proc = Bun.spawn([
    "claude", "--print",
    "--model", "claude-haiku-4-5-20251001",
    this.buildSummaryPrompt(ctx)
  ]);
  return await new Response(proc.stdout).text();
}
```

优势：
- 轻量 — 单次 CLI 调用，无需 tmux session
- 快速 — haiku 模型延迟低、成本低
- 可替换 — 其他 adapter 可以用不同的 LLM 或本地模型

## New Files

```
src/
├── hooks/
│   ├── types.ts          # Hook, HookEvent, HookContext 接口
│   ├── manager.ts        # HookManager — 注册/触发 hooks
│   └── memory.ts         # MemoryHook — 内置的记忆更新 hook
├── memory/
│   ├── session.ts        # Session 管理 — 创建/查找/滑动窗口判定
│   └── store.ts          # 记忆文件读写 — memories/*.md 的 CRUD
```

### hooks/types.ts

```typescript
export type HookEvent = "afterSend" | "afterSpawn" | "beforeKill";

export interface HookContext {
  agentId: string;
  agentType: string;
  workspacePath: string;
  timestamp: number;
  // afterSend specific
  prompt?: string;
  output?: string;
}

export interface Hook {
  name: string;
  event: HookEvent;
  handler: (ctx: HookContext) => Promise<void>;
}
```

### hooks/manager.ts

```typescript
export class HookManager {
  private hooks: Map<HookEvent, Hook[]> = new Map();

  register(hook: Hook): void;
  async emit(event: HookEvent, ctx: HookContext): Promise<void>;
  // hook 失败不影响主流程，独立 try/catch + log
}
```

### memory/session.ts

```typescript
interface SessionState {
  activeSessionId: string | null;
  lastResponseTime: number | null;
  agentId: string;
}

// 持久化在 ~/.metabot/sessions.json
function getOrCreateSession(agentId: string, now: number): {
  sessionId: string;
  isNew: boolean;
};

function updateLastResponseTime(agentId: string, time: number): void;
```

### memory/store.ts

```typescript
function readSessionMemory(sessionId: string, date: string): string;
function writeSessionMemory(sessionId: string, date: string, content: string): void;
function appendInteraction(sessionId: string, date: string, interaction: Interaction): void;
function listRecentSessions(limit: number): string[];
```

## Modified Files

| File | Change |
|------|--------|
| `src/ctl/types.ts` | 新增 `summarizeMemory` 和 `SummarizeContext` 到 AgentAdapter |
| `src/ctl/adapters/claude-code.ts` | 实现 `summarizeMemory`，用 `claude --print` |
| `src/ctl/manager.ts` | 集成 HookManager，在 `send()` 完成后 emit "afterSend" |
| `src/index.ts` | 导出 hooks 和 memory 模块 |

## Configuration

`~/.metabot/config.json` 新增：

```json
{
  "memory": {
    "enabled": true,
    "sessionTimeoutMinutes": 30,
    "summarizerModel": "claude-haiku-4-5-20251001",
    "maxRecentSessions": 10
  }
}
```

## Implementation Order

1. `hooks/types.ts` — 定义接口
2. `hooks/manager.ts` — HookManager 实现
3. `memory/session.ts` — Session 滑动窗口逻辑
4. `memory/store.ts` — 文件读写
5. `ctl/types.ts` — 扩展 AgentAdapter 接口
6. `ctl/adapters/claude-code.ts` — 实现 summarizeMemory
7. `hooks/memory.ts` — MemoryHook 组装以上模块
8. `ctl/manager.ts` — 集成 HookManager
9. 测试
