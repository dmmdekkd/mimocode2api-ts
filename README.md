# Mimocode2API (TypeScript)

![Mimocode2API](https://socialify.git.ci/dmmdekkd/mimocode2api-ts/image?description=1&font=Source+Code+Pro&forks=1&issues=1&language=1&name=1&owner=1&pattern=Plus&pulls=1&stargazers=1&theme=Auto)

将小米 MiMo AI（`api.xiaomimimo.com`）包装成 **OpenAI 兼容** 的本地反向代理。

基于 [Bun](https://bun.sh/) + [Hono](https://hono.dev/)，支持流式输出、自动 JWT 获取、模型别名映射。

## 前提条件

- [Bun](https://bun.sh/) >= 1.1（推荐）或 Node.js >= 18
- 可访问 `https://api.xiaomimimo.com` 的网络环境

---

## 快速开始

### 下载预编译版本（推荐）

前往 [Releases](https://github.com/dmmdekkd/mimocode2api-ts/releases) 页面，根据你的操作系统下载对应文件：

| 平台 | x64 (Intel/AMD) | ARM64 |
| --- | --- | --- |
| Windows | `mimocode2api-win-x64.zip` | - |
| macOS (Intel) | `mimocode2api-mac-x64.tar.gz` | - |
| macOS (Apple Silicon) | - | `mimocode2api-mac-arm64.tar.gz` |
| Linux | `mimocode2api-linux-x64.tar.gz` | `mimocode2api-linux-arm64.tar.gz` |

下载后无需安装 Bun 或 Node.js，解压后直接运行：

```bash
# Windows
.\mimocode2api.exe

# macOS / Linux
./mimocode2api
```

首次启动会自动生成 `config.jsonc` 配置文件，服务默认监听 `http://127.0.0.1:8000`。

### 从源码运行

```bash
# 安装依赖
bun install

# 开发模式（热重载）
bun run dev

# 生产模式
bun run start
```

### 测试接口

```bash
# 列出模型
curl http://127.0.0.1:8000/v1/models

# 非流式对话
curl -X POST http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mimo-auto",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": false
  }'

# 流式对话
curl -X POST http://127.0.0.1:8000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "mimo-auto",
    "messages": [{"role": "user", "content": "你好"}],
    "stream": true
  }'
```

### 在 OpenAI 客户端中使用

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'http://127.0.0.1:8000/v1',
  apiKey: 'dummy', // 本地代理不校验 key
});

const response = await client.chat.completions.create({
  model: 'mimo-auto',
  messages: [{ role: 'user', content: '你好' }],
  stream: true,
});

for await (const chunk of response) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? '');
}
```

---

## 配置

所有配置通过 `config.jsonc` 文件管理（JSONC 格式，支持 `//` 注释和尾逗号）。首次启动时如果文件不存在会自动生成默认配置。

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `base_url` | `https://api.xiaomimimo.com` | 上游 API 地址 |
| `bootstrap_path` | `/api/free-ai/bootstrap` | JWT 获取端点 |
| `chat_path` | `/api/free-ai/openai/chat` | 聊天端点 |
| `user_agent` | `mimocode/0.1.0` | User-Agent 请求头 |
| `x_source` | `mimocode-cli-free` | X-Mimo-Source 请求头 |
| `session_affinity` | `null`（自动生成） | 会话亲和性标识 |
| `client_id` | `null`（自动生成） | 客户端 ID（根据硬件指纹生成） |
| `client_id_file` | `.client_id` | 客户端 ID 持久化文件 |
| `jwt_leeway_seconds` | `60` | JWT 过期容差秒数 |
| `default_model` | `mimo-auto` | 默认模型 |
| `model_map` | `{}` | 模型别名映射，例如 `{"gpt-4o":"mimo-auto"}` |
| `request_timeout` | `300` | 上游请求超时（秒） |
| `retry_max_attempts` | `5` | 429 / 网络错误重试次数 |
| `retry_base_delay_sec` | `1` | 重试基础延迟（秒，指数退避） |
| `listen_host` | `0.0.0.0` | 监听地址 |
| `listen_port` | `8000` | 监听端口 |
| `log_level` | `info` | 日志级别：`trace` / `debug` / `info` / `warn` / `error` / `fatal` |

配置示例：

```jsonc
{
  // ===== 上游接口 =====
  "base_url": "https://api.xiaomimimo.com",
  "bootstrap_path": "/api/free-ai/bootstrap",
  "chat_path": "/api/free-ai/openai/chat",

  // ===== 服务器 =====
  "listen_host": "0.0.0.0",
  "listen_port": 8000,
  "log_level": "info"
}
```

### 模型映射

通过 `model_map` 可以把任意模型名映射到 `mimo-auto`：

```jsonc
{
  "model_map": {
    "gpt-4o": "mimo-auto",
    "claude-sonnet": "mimo-auto"
  }
}
```

之后请求 `model: "gpt-4o"` 会被自动映射到 `mimo-auto`。

---

## 开发

```bash
bun run dev          # 热重载开发
bun test             # 运行单元测试
bun run typecheck    # TypeScript 类型检查
bun run lint         # ESLint 代码检查
bun run format       # Prettier 格式化
```

### 构建

```bash
# 构建全部产物（Bun JS + Node CJS + 5 个平台可执行文件）
bun run build

# 单独构建某项
bun run build:bun          # 输出到 dist/bun/
bun run build:node         # 输出到 dist/node/
bun run build:bin          # 构建全部 5 个平台可执行文件
bun run build:bin:win-x64  # 单独构建 Windows x64
bun run build:bin:mac-arm64
# ...其他平台同理
```

构建产物结构：

```
dist/
├── bun/                 # Bun 目标 JS（跨平台）
├── node/                # Node.js CJS（跨平台）
├── bin-win-x64/         # Windows x64 可执行文件
├── bin-mac-x64/         # macOS Intel
├── bin-mac-arm64/       # macOS Apple Silicon
├── bin-linux-x64/       # Linux x64
└── bin-linux-arm64/     # Linux ARM64
```

### 项目脚本

| 命令 | 说明 |
| --- | --- |
| `bun run dev` | 热重载开发模式 |
| `bun run start` | 启动生产服务 |
| `bun run build` | 构建全部产物 |
| `bun run build:bun` | 仅构建 Bun 目标 JS |
| `bun run build:node` | 仅构建 Node.js CJS |
| `bun run build:bin` | 构建全部 5 个平台可执行文件 |
| `bun run build:bin:win-x64` | 构建 Windows x64 可执行文件 |
| `bun run build:bin:mac-x64` | 构建 macOS Intel 可执行文件 |
| `bun run build:bin:mac-arm64` | 构建 macOS Apple Silicon 可执行文件 |
| `bun run build:bin:linux-x64` | 构建 Linux x64 可执行文件 |
| `bun run build:bin:linux-arm64` | 构建 Linux ARM64 可执行文件 |
| `bun test` | 运行单元测试 |
| `bun run typecheck` | TypeScript 类型检查 |
| `bun run lint` | ESLint 代码检查 |
| `bun run format` | Prettier 格式化 |

---

## 项目结构

```
mimocode2api-ts/
├── src/
│   ├── index.ts       # 版本
│   ├── main.ts       # Hono 应用与生命周期
│   ├── config.ts     # 配置（Zod + JSONC）与硬件指纹计算
│   ├── auth.ts       # JWT 自动获取、缓存、刷新（含重试）
│   ├── upstream.ts   # 上游 HTTP 客户端（含 429 指数退避）
│   ├── compat.ts    # OpenAI 请求/响应兼容转换
│   ├── routes.ts     # OpenAI 兼容路由
│   └── logger.ts     # 自定义彩色日志
├── bin.ts            # 直接启动入口
├── tests/
│   └── test_compat.test.ts  # 单元测试
├── .github/
│   └── workflows/
│       └── release.yml # 构建与发布
├── package.json
├── tsconfig.json
├── bunfig.toml
├── eslint.config.js
├── .prettierrc.json
├── config.jsonc       # 配置文件（首次启动自动生成）
└── .gitignore
```

---

## 技术栈

- **运行时**：[Bun](https://bun.sh/)（原生 TypeScript，零编译步骤）
- **Web 框架**：[Hono](https://hono.dev/)
- **配置校验**：[Zod](https://zod.dev/)
- **日志**：自定义彩色 logger（ANSI 颜色，key=value 字段格式）
- **硬件指纹**：使用 Node.js `os` 模块（`os.cpus()`、`os.hostname()` 等），无需 subprocess
- **TLS 指纹**：Bun.fetch 不支持 TLS 指纹伪装。若上游开始检测，需另寻方案

---

## 常见问题

### 启动时报 `403 Illegal access`

- 检查 `.client_id` 是否存在且与当前机器匹配。如果不匹配，删除 `.client_id` 让代理重新计算。
- 确认能正常访问 `https://api.xiaomimimo.com`。

### 端口被占用

编辑 `config.jsonc`，修改 `listen_port` 后重启。

### 调试日志

编辑 `config.jsonc`，把 `log_level` 改为 `debug`，重启生效。

### 如何在远程服务器上使用

将 `listen_host` 改为 `0.0.0.0`（默认值），即可从外部访问：

```jsonc
{
  "listen_host": "0.0.0.0",
  "listen_port": 8000
}
```

然后通过 `http://your-server:8000/v1` 访问。

### 如何修改默认模型

编辑 `config.jsonc`，设置 `default_model`：

```jsonc
{
  "default_model": "mimo-auto"
}
```

---

## 免责声明

本项目仅供学习研究，使用请遵守 MiMo 服务条款。代理逻辑基于对官方 CLI 网络协议的逆向分析，不保证上游接口长期稳定。
