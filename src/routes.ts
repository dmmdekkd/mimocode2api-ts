import { Hono } from 'hono';
import type { UpstreamClient } from './upstream.js';
import { getSettings } from './config.js';
import {
  buildNonStreamResponse,
  makeModelList,
  makeModelObject,
  normalizeRequest,
  parseSseData,
} from './compat.js';
import { createLogger } from './logger.js';

const logger = createLogger('mimocode2api.routes');

export function createRouter(upstream: UpstreamClient): Hono {
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
      return c.json({ error: 'Model not found' }, 404);
    }
    return c.json(makeModelObject(modelId));
  });

  app.post('/v1/chat/completions', async (c) => {
    const settings = getSettings();
    let body: any;
    try {
      body = await c.req.json();
    } catch (exc: any) {
      return c.json({ error: `Invalid JSON body: ${exc?.message ?? exc}` }, 400);
    }

    const originalModel = body.model || settings.default_model;
    const normalized = normalizeRequest(body, settings);
    const clientStream = Boolean(normalized.stream);

    let upstreamResp: Response;
    try {
      upstreamResp = await upstream.chat(normalized);
    } catch (exc: any) {
      logger.error({ err: exc }, 'Upstream connection error');
      return c.json({ error: `Upstream connection error: ${exc?.message ?? exc}` }, 502);
    }

    if (!upstreamResp.ok) {
      const text = await upstreamResp.text();
      logger.warn(
        { status: upstreamResp.status, body: text.slice(0, 500) },
        'Upstream returned non-200 for chat',
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
      return c.json({ error: 'Upstream returned no body' }, 502);
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
      return c.json({ error: 'Upstream returned an empty response' }, 502);
    }

    return c.json(buildNonStreamResponse(chunks, originalModel));
  });

  return app;
}
