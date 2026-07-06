import { Hono } from 'hono';
import { VERSION } from './index';
import { getSettings } from './config';
import { JWTManager } from './auth';
import { UpstreamClient } from './upstream';
import { createRouter } from './routes';
import { createLogger } from './logger';
import { printBanner } from './banner';

const logger = createLogger('mimocode2api.main');

export interface AppContext {
  app: Hono;
  jwtManager: JWTManager;
  upstream: UpstreamClient;
}

export function createApp(): AppContext {
  const settings = getSettings();
  const jwtManager = new JWTManager(settings);
  const upstream = new UpstreamClient(settings, jwtManager);

  const app = new Hono();
  app.route('/', createRouter(upstream));

  // Health endpoint (lightweight, no upstream calls).
  app.get('/health', (c) => c.json({ status: 'ok', version: VERSION }));

  return { app, jwtManager, upstream };
}

export async function main(): Promise<void> {
  const settings = getSettings();
  const { app, jwtManager } = createApp();

  // Print ASCII art banner in TTY
  if (process.stdout.isTTY) {
    printBanner(settings.listen_host, settings.listen_port);
  } else {
    logger.info(
      { version: VERSION, host: settings.listen_host, port: settings.listen_port },
      'Starting Mimocode2API',
    );
  }

  // Warm the JWT cache at startup so the first request is fast.
  try {
    await jwtManager.getJwt();
    logger.info('JWT pre-warmed successfully');
  } catch (exc: any) {
    logger.warn({ err: exc?.message ?? exc }, 'Could not pre-warm JWT');
  }

  const server = Bun.serve({
    port: settings.listen_port,
    hostname: settings.listen_host,
    idleTimeout: 0, // 禁用空闲超时
    fetch: app.fetch,
  });

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'Shutting down');
    server.stop(true);
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  logger.info({ url: `http://${server.hostname}:${server.port}` }, 'Mimocode2API listening');
}

if (import.meta.main) {
  main();
}
