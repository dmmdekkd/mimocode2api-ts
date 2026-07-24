import type { Settings } from './config';
import { createLogger } from './logger';

const logger = createLogger('mimocode2api.zen');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ZenConfig {
  apiKey: string;
  baseUrl: string;
  defaultModel: string;
  fallbackModels: string[];
}

export function getZenConfig(settings: Settings): ZenConfig {
  return {
    apiKey: settings.zen_api_key,
    baseUrl: settings.zen_base_url,
    defaultModel: settings.zen_default_model,
    fallbackModels: settings.zen_fallback_models,
  };
}

/**
 * 将 MiMo 模型名称映射为 Zen 模型名称
 */
export function mapToZenModel(model: string, zenConfig: ZenConfig): string {
  // 直接是 Zen 模型名
  if (zenConfig.fallbackModels.includes(model)) return model;

  // 映射规则
  const map: Record<string, string> = {
    'mimo-auto': zenConfig.defaultModel,
    'mimo-v2.5': 'mimo-v2.5-free',
    'mimo-v2.5-pro': 'mimo-v2.5-free',
    'deepseek-v4-flash': 'deepseek-v4-flash-free',
    'laguna-s-2.1': 'laguna-s-2.1-free',
    'ling-3.0-flash': 'ling-3.0-flash-free',
  };

  return map[model] ?? zenConfig.defaultModel;
}

/**
 * 通过 Zen API 发送聊天请求，依次尝试 fallback 模型
 */
export async function zenChat(
  body: any,
  zenConfig: ZenConfig,
  options?: { timeout?: number; maxRetries?: number },
): Promise<Response> {
  if (!zenConfig.apiKey) {
    throw new Error('Zen API Key 未配置');
  }

  const timeout = options?.timeout ?? 30000;
  const maxRetries = options?.maxRetries ?? 2;

  // 确定要尝试的模型列表
  const requestedModel = body.model || zenConfig.defaultModel;
  const zenModel = mapToZenModel(requestedModel, zenConfig);

  // 按优先级排列模型：请求的模型优先，然后是其他 fallback 模型
  const modelsToTry = [zenModel, ...zenConfig.fallbackModels.filter((m) => m !== zenModel)];

  for (const model of modelsToTry) {
    const result = await tryZenModel(model, body, zenConfig, timeout, maxRetries);
    if (result.ok) {
      return result.response;
    }
    logger.warn({ model, status: result.response.status }, 'Zen 模型失败，尝试下一个');
  }

  // 所有模型都失败，返回最后一个错误
  const lastModel = modelsToTry[modelsToTry.length - 1];
  logger.error({ models: modelsToTry }, '所有 Zen 模型都失败');
  return new Response(
    JSON.stringify({ error: `所有备用模型都不可用: ${modelsToTry.join(', ')}` }),
    { status: 502, headers: { 'Content-Type': 'application/json' } },
  );
}

async function tryZenModel(
  model: string,
  body: any,
  zenConfig: ZenConfig,
  timeout: number,
  maxRetries: number,
): Promise<{ ok: boolean; response: Response }> {
  const url = `${zenConfig.baseUrl.replace(/\/$/, '')}/chat/completions`;

  const payload = {
    ...body,
    model,
    stream: body.stream ?? false,
  };

  // 不使用 stream_options（Zen API 可能不支持）
  delete payload.stream_options;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${zenConfig.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (response.ok) {
        logger.info({ model, status: response.status }, 'Zen 请求成功');
        return { ok: true, response };
      }

      // 429 速率限制，重试
      if (response.status === 429 && attempt < maxRetries) {
        const retryAfter = response.headers.get('retry-after');
        const delaySec = retryAfter ? parseInt(retryAfter, 10) || 2 : 2 * attempt;
        logger.warn({ model, attempt, delaySec }, 'Zen 速率限制，等待重试');
        await sleep(delaySec * 1000);
        continue;
      }

      // 其他错误，不重试
      return { ok: false, response };
    } catch (exc: any) {
      if (attempt < maxRetries) {
        await sleep(1000 * attempt);
        continue;
      }
      return {
        ok: false,
        response: new Response(
          JSON.stringify({ error: `Zen 请求异常: ${exc?.message ?? exc}` }),
          { status: 502, headers: { 'Content-Type': 'application/json' } },
        ),
      };
    }
  }

  // 不应到达这里
  return {
    ok: false,
    response: new Response(
      JSON.stringify({ error: 'Zen 请求失败' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    ),
  };
}
