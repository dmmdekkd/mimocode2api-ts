# OpenCode 免费 API 分析报告

## 分析来源

基于 `https://github.com/anomalyco/opencode` 项目中的 `packages/llm/src/providers` 目录分析。

---

## 完全免费或有免费额度的 API Provider

### 1. **Groq** ⭐ 推荐
- **Base URL**: `https://api.groq.com/openai/v1`
- **免费额度**: 每分钟 30 次请求，每天 14,400 次
- **免费模型**:
  - `llama-3.3-70b-versatile` - 高性能模型
  - `llama-3.1-8b-instant` - 快速模型
  - `mixtral-8x7b-32768` - Mixtral 模型
  - `gemma2-9b-it` - Google Gemma
- **特点**: 极快的推理速度，适合对话场景

### 2. **Cerebras** ⭐ 推荐
- **Base URL**: `https://api.cerebras.ai/v1`
- **免费额度**: 提供免费 API 访问
- **免费模型**:
  - `llama3.1-8b` - Llama 3.1 8B
  - `llama3.3-70b` - Llama 3.3 70B
- **特点**: 极快推理，专注 Llama 系列

### 3. **DeepSeek** ⭐ 推荐
- **Base URL**: `https://api.deepseek.com/v1`
- **免费额度**: 注册送免费额度
- **免费模型**:
  - `deepseek-chat` - DeepSeek 对话模型
  - `deepseek-coder` - DeepSeek 编程模型
- **特点**: 中文能力强，编程场景优秀

### 4. **DeepInfra**
- **Base URL**: `https://api.deepinfra.com/v1/openai`
- **免费额度**: 注册送 $1.8 免费额度
- **免费模型**:
  - 多种开源模型托管（Llama、Mistral、Qwen 等）
  - 价格极低，几乎免费使用
- **特点**: 开源模型托管平台

### 5. **Fireworks AI**
- **Base URL**: `https://api.fireworks.ai/inference/v1`
- **免费额度**: 注册送免费额度
- **免费模型**:
  - `llama-v3-8b-instruct`
  - `qwen2p5-72b-instruct`
  - 多种开源模型
- **特点**: 高性能推理

### 6. **Together AI**
- **Base URL**: `https://api.together.xyz/v1`
- **免费额度**: 注册送免费额度
- **免费模型**:
  - 多种开源模型托管
  - Llama、Mistral、Qwen 等
- **特点**: 开源模型集合平台

### 7. **OpenRouter** ⭐ 推荐（有完全免费模型）
- **Base URL**: `https://openrouter.ai/api/v1`
- **完全免费模型** (无需 API Key):
  - `google/gemma-7b-it:free`
  - `meta-llama/llama-3-8b-instruct:free`
  - `mistralai/mistral-7b-instruct:free`
  - `nousresearch/nous-capybara-7b:free`
  - `openchat/openchat-7b:free`
  - `pygmalionai/pygmalion-2-7b:free`
  - `undi95/toppy-m-7b:free`
  - `gryphe/mythomax-13b:free` ⭐ 高质量
- **特点**: 提供 **完全免费** 的模型，无需付费
- **获取方式**: OpenRouter 账户或直接 API Key

### 8. **Google Gemini** ⭐ 推荐（有免费 tier）
- **Provider**: `google`
- **免费 tier**:
  - `gemini-1.5-flash` - 每天免费 1500 次请求
  - `gemini-1.5-flash-8b` - 更小更快
  - `gemini-2.0-flash-exp` - 实验版本
- **获取方式**: Google AI Studio API Key

### 9. **Cloudflare Workers AI** ⭐ 推荐（有免费额度）
- **Base URL**: 需要配置 accountId
- **免费额度**: 每天 10,000 次请求（免费 tier）
- **免费模型**:
  - `@cf/meta/llama-3-8b-instruct`
  - `@cf/mistral/mistral-7b-instruct-v0.1`
  - `@cf/qwen/qwen1.5-14b-chat`
- **特点**: Workers 平台集成，全球边缘部署

---

## 需要付费但有试用额度的 API

### 10. **xAI (Grok)**
- **Base URL**: `https://api.x.ai/v1`
- **免费额度**: 注册可能有试用额度
- **模型**: `grok-beta`

### 11. **Baseten**
- **Base URL**: `https://inference.baseten.co/v1`
- **特点**: 需要付费，模型部署平台

---

## 需要订阅/付费的 API

- **Anthropic (Claude)** - 需要付费 API Key
- **OpenAI** - 需要付费 API Key
- **Azure OpenAI** - 需要付费订阅
- **Amazon Bedrock** - 需要付费订阅
- **GitHub Copilot** - 需要 GitHub Copilot subscription

---

## 完全免费模型汇总（无需付费）

| Provider | 模型 | 备注 |
|----------|------|------|
| OpenRouter | `gryphe/mythomax-13b:free` | 高质量免费模型 ⭐ |
| OpenRouter | `meta-llama/llama-3-8b-instruct:free` | Llama 3 8B |
| OpenRouter | `google/gemma-7b-it:free` | Google Gemma |
| OpenRouter | `mistralai/mistral-7b-instruct:free` | Mistral 7B |
| OpenRouter | 多个 7B 模型 | 各种免费 7B 模型 |
| Groq | `llama-3.3-70b-versatile` | 高性能免费额度 |
| Groq | `llama-3.1-8b-instant` | 快速免费额度 |
| Google | `gemini-1.5-flash` | 每天 1500 次免费 |
| Google | `gemini-2.0-flash-exp` | 实验版免费 |
| Cloudflare | `@cf/meta/llama-3-8b-instruct` | 每天 10000 次 |

---

## 推荐集成顺序

### Phase 1: 完全免费模型
1. **OpenRouter Free Models** - 完全免费，无需付费
2. **Groq** - 大额度免费，速度快
3. **Google Gemini Free Tier** - 每天 1500 次

### Phase 2: 有免费额度
4. **DeepSeek** - 中文能力强
5. **Cerebras** - 极快推理
6. **Cloudflare Workers AI** - 大额度免费

### Phase 3: 低价/试用
7. **DeepInfra** - 极低价格
8. **Together AI** - 开源模型集合
9. **Fireworks AI** - 高性能推理

---

## OpenCode Provider Profile 参考

从 `packages/llm/src/providers/openai-compatible-profile.ts`:

```typescript
export const profiles = {
  baseten: { provider: "baseten", baseURL: "https://inference.baseten.co/v1" },
  cerebras: { provider: "cerebras", baseURL: "https://api.cerebras.ai/v1" },
  deepinfra: { provider: "deepinfra", baseURL: "https://api.deepinfra.com/v1/openai" },
  deepseek: { provider: "deepseek", baseURL: "https://api.deepseek.com/v1" },
  fireworks: { provider: "fireworks", baseURL: "https://api.fireworks.ai/inference/v1" },
  groq: { provider: "groq", baseURL: "https://api.groq.com/openai/v1" },
  openrouter: { provider: "openrouter", baseURL: "https://openrouter.ai/api/v1" },
  togetherai: { provider: "togetherai", baseURL: "https://api.together.xyz/v1" },
  xai: { provider: "xai", baseURL: "https://api.x.ai/v1" },
}
```

---

## 下一步计划建议

用户选择了 **"多 Provider 配置切换"** 方案，建议实现：

### 配置结构设计
```jsonc
{
  "providers": {
    "mimo": {
      "base_url": "https://api.xiaomimimo.com",
      "bootstrap_path": "/api/free-ai/bootstrap",
      "chat_path": "/api/free-ai/openai/chat",
      "default_model": "mimo-auto",
      "requires_jwt": true
    },
    "openrouter": {
      "base_url": "https://openrouter.ai/api/v1",
      "chat_path": "/chat/completions",
      "default_model": "gryphe/mythomax-13b:free",
      "api_key_env": "OPENROUTER_API_KEY",
      "requires_jwt": false
    },
    "groq": {
      "base_url": "https://api.groq.com/openai/v1",
      "chat_path": "/chat/completions",
      "default_model": "llama-3.3-70b-versatile",
      "api_key_env": "GROQ_API_KEY",
      "requires_jwt": false
    },
    "google": {
      "base_url": "https://generativelanguage.googleapis.com/v1beta",
      "chat_path": "/models/{model}:generateContent",
      "default_model": "gemini-1.5-flash",
      "api_key_env": "GOOGLE_API_KEY",
      "requires_jwt": false
    }
  },
  "active_provider": "mimo"  // 当前激活的 provider
}
```

### 实现步骤
1. 添加 `providers` 配置结构
2. 创建 `ProviderManager` 管理多个 provider
3. 修改 `UpstreamClient` 支持动态切换
4. 添加 provider 端点路由 `/v1/providers` 查看可用 provider
5. 添加切换端点 `/v1/providers/{name}/activate` 切换 provider

---

## 参考资源

- **Groq Console**: https://console.groq.com
- **OpenRouter**: https://openrouter.ai
- **Google AI Studio**: https://aistudio.google.com
- **DeepSeek**: https://platform.deepseek.com
- **Cerebras**: https://cerebras.ai
- **Cloudflare Workers AI**: https://developers.cloudflare.com/workers-ai