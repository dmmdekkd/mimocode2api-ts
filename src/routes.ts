import { Hono } from 'hono';
import type { UpstreamClient } from './upstream';
import type { ZenConfig } from './zen';
import { zenChat, getZenConfig } from './zen';
import { getSettings } from './config';
import {
  buildNonStreamResponse,
  makeModelList,
  makeModelObject,
  normalizeRequest,
  parseSseData,
} from './compat';
import { createLogger } from './logger';

const logger = createLogger('mimocode2api.routes');

const RETRY_CODES = new Set(['ConnectionRefused', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'UND_ERR_CONNECT_TIMEOUT']);

async function chatWithRetry(upstream: UpstreamClient, body: any, maxAttempts: number, baseDelay: number): Promise<Response> {
  let lastErr: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await upstream.chat(body);
    } catch (exc: any) {
      const code = exc?.code ?? exc?.errno;
      if (RETRY_CODES.has(code) && attempt < maxAttempts) {
        const delay = baseDelay * 2 ** (attempt - 1) + Math.random() * 0.5;
        logger.warn({ attempt, maxAttempts, delay: delay.toFixed(1), err: exc }, '上游连接错误，正在重试');
        await Bun.sleep(delay * 1000);
        lastErr = exc;
        continue;
      }
      throw exc;
    }
  }
  throw lastErr;
}

export function createRouter(upstream: UpstreamClient, zenConfig?: ZenConfig): Hono {
  const app = new Hono();

  // Request-line middleware: log method/path/status/duration for every request.
  app.use('*', async (c, next) => {
    const start = Date.now();
    await next();
    const ms = Date.now() - start;
    logger.info('request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms,
    });
  });

  app.get('/v1/models', (c) => {
    const settings = getSettings();
    return c.json(makeModelList(settings));
  });

  app.get('/v1/models/:model_id', (c) => {
    const modelId = c.req.param('model_id');
    const settings = getSettings();
    const target = settings.model_map[modelId] ?? modelId;
    const validIds = new Set<string>([
      settings.default_model,
      ...Object.keys(settings.model_map),
      ...Object.values(settings.model_map),
    ]);
    if (!validIds.has(target)) {
      return c.json({ error: '未找到该模型' }, 404);
    }
    return c.json(makeModelObject(modelId));
  });

  app.post('/v1/chat/completions', async (c) => {
    const settings = getSettings();
    let body: any;
    try {
      body = await c.req.json();
    } catch (exc: any) {
      return c.json({ error: `请求 JSON 格式错误: ${exc?.message ?? exc}` }, 400);
    }

    const originalModel = body.model || settings.default_model;
    const normalized = normalizeRequest(body, settings);
    const clientStream = Boolean(normalized.stream);

    let usedFallback = false;
    const provider = settings.provider;
    const useMimo = provider === 'mimo' || provider === 'auto';
    const useZen = (provider === 'zen' || provider === 'auto') && zenConfig?.apiKey;

    // 未配置任何 Provider
    if (!useMimo && !useZen) {
      return c.json({ error: '未配置任何 Provider' }, 500);
    }

    // 直接使用 Zen
    if (!useMimo && useZen) {
      const resp = await zenChat(normalized, zenConfig!, { timeout: settings.request_timeout * 1000 });
      if (!resp.ok) {
        const text = await resp.text();
        logger.warn({ status: resp.status, body: text.slice(0, 500), provider: 'zen' }, 'Zen 返回非 200');
        return c.json({ error: text }, resp.status as any);
      }
      // Zen 流式响应直接透传
      if (clientStream) {
        return new Response(resp.body, {
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' },
        });
      }
      // Zen 非流式：直接返回 JSON
      const json = await resp.json();
      return c.json(json);
    }

    // 使用 MiMo（可能故障转移到 Zen）
    let upstreamResp: Response;
    try {
      upstreamResp = await chatWithRetry(upstream, normalized, settings.retry_max_attempts, settings.retry_base_delay_sec);
    } catch (exc: any) {
      logger.error({ err: exc }, '上游连接错误');
      // auto 模式下尝试 Zen
      if (provider === 'auto' && useZen) {
        logger.info('MiMo 连接失败，切换到 Zen Provider');
        upstreamResp = await zenChat(normalized, zenConfig!, { timeout: settings.request_timeout * 1000 });
        usedFallback = true;
      } else {
        return c.json({ error: `上游连接错误: ${exc?.message ?? exc}` }, 502);
      }
    }

    // MiMo 返回 429 或 5xx，auto 模式下尝试 Zen
    if (!usedFallback && !upstreamResp.ok && provider === 'auto' && useZen) {
      const status = upstreamResp.status;
      if (status === 429 || status >= 500) {
        logger.warn({ status }, 'MiMo 返回错误，切换到 Zen Provider');
        upstreamResp = await zenChat(normalized, zenConfig!, { timeout: settings.request_timeout * 1000 });
        usedFallback = true;
      }
    }

    if (!upstreamResp.ok) {
      const text = await upstreamResp.text();
      logger.warn(
        { status: upstreamResp.status, body: text.slice(0, 500), provider: usedFallback ? 'zen' : 'mimo' },
        '上游返回非 200 状态码',
      );
      return c.json({ error: text }, upstreamResp.status as any);
    }

    if (clientStream) {
      // Pass through the upstream SSE byte stream verbatim so event framing
      // (double newlines, [DONE], comments) is preserved exactly.
      return new Response(upstreamResp.body, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      });
    }

    // Non-streaming clients: aggregate the SSE chunks into one JSON object.
    const chunks: any[] = [];
    const reader = upstreamResp.body?.getReader();
    if (!reader) {
      return c.json({ error: '上游未返回响应体' }, 502);
    }
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        const data = parseSseData(line);
        if (data !== null) chunks.push(data);
      }
    }
    // Flush trailing line.
    if (buffer.length > 0) {
      const data = parseSseData(buffer);
      if (data !== null) chunks.push(data);
    }

    if (chunks.length === 0) {
      return c.json({ error: '上游返回空响应' }, 502);
    }

    return c.json(buildNonStreamResponse(chunks, originalModel));
  });

  return app;
}
