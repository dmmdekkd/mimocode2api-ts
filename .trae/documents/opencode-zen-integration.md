# OpenCode Zen API 集成计划

## 概述

将 OpenCode Zen API 的免费模型（`mimo-v2.5-free`、`deepseek-v4-flash-free`、`laguna-s-2.1-free`、`ling-3.0-flash-free`）作为备用上游，当 MiMo 官方 API 返回 429 或不可用时自动切换。

## 当前状态

- **主上游**: MiMo 官方 API (`api.xiaomimimo.com`)
- **认证方式**: Bootstrap JWT
- **重试机制**: 429 指数退避 + 连接错误重试

## 新增备用上游

| Provider | 端点 | 认证 | 免费模型 |
|---|---|---|---|
| OpenCode Zen | `https://opencode.ai/zen/v1/chat/completions` | Bearer API Key | `mimo-v2.5-free`, `deepseek-v4-flash-free`, `laguna-s-2.1-free`, `ling-3.0-flash-free` |

## 实现方案

### 方案：多 Provider 路由 + 自动故障转移

当主上游 (MiMo) 返回 429 或 5xx 时，自动切换到备用 Provider (Zen API)。

---

## 文件变更计划

### 1. 新增 `src/providers.ts` — Provider 抽象层

定义 `Provider` 接口和两个实现：

```typescript
interface Provider {
  name: string;
  chat(body: RequestBody, signal?: AbortSignal): Promise<Response>;
  isAvailable(): boolean;
}

// MiMo 官方 API Provider (现有逻辑)
class MimoProvider implements Provider { ... }

// OpenCode Zen API Provider (新增)
class ZenProvider implements Provider { ... }
```

**ZenProvider 关键点**：
- 端点: `https://opencode.ai/zen/v1/chat/completions`
- 认证: `Authorization: Bearer <API_KEY>`
- 模型映射: `mimo-auto` → `mimo-v2.5-free`（或 `deepseek-v4-flash-free`）
- 无需 JWT，无需 `X-Mimo-Source` 等头
- 支持流式和非流式

### 2. 修改 `src/config.ts` — 新增配置项

```typescript
// Provider 配置
provider: z.enum(['mimo', 'zen', 'auto']).default('auto'),
zen_api_key: z.string().default(''),
zen_base_url: z.string().default('https://opencode.ai/zen/v1'),
zen_default_model: z.string().default('mimo-v2.5-free'),
zen_fallback_models: z.array(z.string()).default([
  'mimo-v2.5-free',
  'deepseek-v4-flash-free',
  'laguna-s-2.1-free',
  'ling-3.0-flash-free'
]),
```

### 3. 修改 `src/routes.ts` — 故障转移逻辑

在 `chatWithRetry` 中增加故障转移：

```
1. 尝试 MiMo Provider
2. 如果返回 429 或 5xx → 切换到 Zen Provider
3. Zen Provider 依次尝试 zen_fallback_models
4. 所有模型都失败 → 返回最后一个错误
```

### 4. 修改 `src/compat.ts` — 模型映射

为 Zen Provider 添加模型映射：

```typescript
const ZEN_MODEL_MAP: Record<string, string> = {
  'mimo-auto': 'mimo-v2.5-free',
  'mimo-v2.5': 'mimo-v2.5-free',
  'deepseek-v4-flash': 'deepseek-v4-flash-free',
  // ...
};
```

### 5. 修改 `src/main.ts` — 初始化 Provider

根据配置初始化对应的 Provider 实例。

---

## 数据流

```
客户端请求
    ↓
[路由层] normalizeRequest (模型映射)
    ↓
[Provider 路由] auto 模式
    ↓
┌─────────────────────────────────────┐
│ 1. 尝试 MiMo Provider               │
│    POST api.xiaomimimo.com/chat      │
│    Bearer JWT                        │
│                                      │
│ 成功 → 返回响应                      │
│ 429/5xx → 进入故障转移               │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ 2. 故障转移: Zen Provider            │
│    POST opencode.ai/zen/v1/chat      │
│    Bearer <API_KEY>                  │
│                                      │
│ 依次尝试:                            │
│   - mimo-v2.5-free                   │
│   - deepseek-v4-flash-free           │
│   - laguna-s-2.1-free                │
│   - ling-3.0-flash-free              │
│                                      │
│ 成功 → 返回响应                      │
│ 全部失败 → 返回 502                  │
└─────────────────────────────────────┘
```

## 配置文件变更

`config.jsonc` 新增：

```jsonc
{
  // ===== 备用 Provider (OpenCode Zen) =====
  // 备用 Provider 模式: 'auto' | 'mimo' | 'zen'
  // auto: MiMo 失败时自动切换到 Zen
  "provider": "auto",

  // Zen API Key (从 https://opencode.ai 获取)
  "zen_api_key": "",

  // Zen API 基础地址
  "zen_base_url": "https://opencode.ai/zen/v1",

  // Zen 默认模型
  "zen_default_model": "mimo-v2.5-free",

  // Zen 备用模型列表 (按优先级排序)
  "zen_fallback_models": [
    "mimo-v2.5-free",
    "deepseek-v4-flash-free",
    "laguna-s-2.1-free",
    "ling-3.0-flash-free"
  ]
}
```

## 验证步骤

1. 启动服务 `pnpm dev`
2. 测试正常请求 → 应通过 MiMo Provider
3. 模拟 MiMo 429 → 应自动切换到 Zen Provider
4. 测试 Zen API Key 为空 → 应跳过 Zen 直接返回 MiMo 错误
5. 测试 `provider: 'zen'` → 应直接使用 Zen Provider
6. 测试流式和非流式模式
