import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getSettings } from './config';
import { JWTManager } from './auth';
import { UpstreamClient } from './upstream';
import { getZenConfig } from './zen';
import { createRouter } from './routes';
import { createLogger } from './logger';
import { printBanner } from './banner';

const logger = createLogger('mimocode2api.main');

function readVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(resolve(import.meta.dir, '..', 'package.json'), 'utf-8'));
    return pkg.version;
  } catch {
    return '0.0.0';
  }
}

const VERSION = readVersion();

async function checkUpstreamHealth(baseUrl: string): Promise<void> {
  // Try the bootstrap endpoint — any HTTP response means the server is reachable
  const url = baseUrl.replace(/\/$/, '') + '/api/free-ai/bootstrap';
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(url, { method: 'GET', signal: controller.signal });
    clearTimeout(timer);
    logger.info({ url: baseUrl }, '上游服务可达');
  } catch (exc: any) {
    logger.warn({ url: baseUrl, err: exc?.message ?? exc }, '上游健康检查失败，将在首次请求时重试');
  }
}

export interface AppContext {
  app: Hono;
  jwtManager: JWTManager;
  upstream: UpstreamClient;
}

export function createApp(): AppContext {
  const settings = getSettings();
  const jwtManager = new JWTManager(settings);
  const upstream = new UpstreamClient(settings, jwtManager);
  const zenConfig = getZenConfig(settings);

  const app = new Hono();
  app.route('/', createRouter(upstream, zenConfig));

  // Health endpoint (lightweight, no upstream calls).
  app.get('/health', (c) => c.json({ status: 'ok', version: VERSION }));

  return { app, jwtManager, upstream };
}

export async function main(): Promise<void> {
  // Print ASCII art banner first (before config generation logs)
  if (process.stdout.isTTY) {
    printBanner('0.0.0.0', 8000, VERSION);
  }

  const settings = getSettings();
  const { app, jwtManager } = createApp();

  // Non-TTY: log startup info instead of banner
  if (!process.stdout.isTTY) {
    logger.info(
      { version: VERSION, host: settings.listen_host, port: settings.listen_port },
      'Mimocode2API 启动中',
    );
  }

  // Start server immediately, run health check and JWT pre-warm in background
  const server = Bun.serve({
    port: settings.listen_port,
    hostname: settings.listen_host,
    idleTimeout: 0,
    fetch: app.fetch,
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, '正在关闭');
    server.stop(true);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  const zenConfig = getZenConfig(settings);
  logger.info(
    {
      url: `http://${server.hostname}:${server.port}`,
      provider: settings.provider,
      zenEnabled: Boolean(zenConfig.apiKey),
    },
    'Mimocode2API 已启动',
  );

  // Warm JWT before accepting requests (blocking)
  try {
    await jwtManager.getJwt();
    logger.info('JWT 预热成功');
  } catch (exc: any) {
    logger.warn({ err: exc?.message ?? exc }, 'JWT 预热失败，将在首次请求时重试');
  }

  // Background: health check (non-blocking)
  checkUpstreamHealth(settings.base_url);
}

if (import.meta.main) {
  main();
}
