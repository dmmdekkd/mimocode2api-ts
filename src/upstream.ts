import crypto from 'node:crypto';
import type { Settings } from './config';
import type { JWTManager } from './auth';
import { createLogger } from './logger';

const logger = createLogger('mimocode2api.upstream');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const trimmed = header.trim();
  // Seconds format: "120"
  const asInt = parseInt(trimmed, 10);
  if (!Number.isNaN(asInt) && String(asInt) === trimmed) {
    return Math.max(0, asInt);
  }
  // HTTP-date format: "Wed, 21 Oct 2015 07:28:00 GMT"
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const diffSec = Math.ceil((dateMs - Date.now()) / 1000);
    return Math.max(0, diffSec);
  }
  return null;
}

export class UpstreamClient {
  settings: Settings;
  jwtManager: JWTManager;
  private sessionAffinity: string;

  constructor(settings: Settings, jwtManager: JWTManager) {
    this.settings = settings;
    this.jwtManager = jwtManager;
    this.sessionAffinity = settings.session_affinity ?? `ses_${crypto.randomBytes(12).toString('hex')}`;
  }

  private chatHeaders(jwt: string): Record<string, string> {
    return {
      Authorization: `Bearer ${jwt}`,
      'Content-Type': 'application/json',
      'User-Agent': `${this.settings.user_agent} ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14`,
      'X-Mimo-Source': this.settings.x_source,
      'x-session-affinity': this.sessionAffinity,
      Accept: '*/*',
    };
  }

  private async fetchOnce(url: string, headers: Record<string, string>, body: any, signal: AbortSignal): Promise<Response> {
    return fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    });
  }

  async chat(body: any, timeout?: number): Promise<Response> {
    const url = `${this.settings.base_url.replace(/\/$/, '')}${this.settings.chat_path}`;
    const requestTimeout = timeout ?? this.settings.request_timeout;
    const maxAttempts = this.settings.retry_max_attempts;
    const baseDelay = this.settings.retry_base_delay_sec;

    body.stream = true;
    if (!body.stream_options) {
      body.stream_options = { include_usage: true };
    }

    logger.debug({ url }, 'Proxying chat to upstream');

    let resp: Response | null = null;
    let jwt = await this.jwtManager.getJwt();

    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), requestTimeout * 1000);

      try {
        const headers = this.chatHeaders(jwt);
        resp = await this.fetchOnce(url, headers, body, controller.signal);

        // Handle 401: refresh JWT and retry once within the same attempt.
        if (resp.status === 401) {
          logger.info('Upstream returned 401, refreshing JWT and retrying');
          jwt = await this.jwtManager.getJwt(true);
          const newHeaders = this.chatHeaders(jwt);
          resp = await this.fetchOnce(url, newHeaders, body, controller.signal);
        }

        // Handle 429: exponential backoff retry.
        if (resp.status === 429 && attempt < maxAttempts) {
          const retryAfterHeader = resp.headers.get('retry-after');
          const retryAfterSec = parseRetryAfter(retryAfterHeader);
          const backoffSec = baseDelay * Math.pow(2, attempt);
          const delaySec = retryAfterSec !== null ? Math.max(retryAfterSec, backoffSec) : backoffSec;

          logger.warn(
            { attempt: attempt + 1, maxAttempts, delay: delaySec, retryAfter: retryAfterSec },
            'Upstream returned 429, retrying with backoff',
          );

          await sleep(delaySec * 1000);
          continue;
        }

        // Success or non-retryable error.
        break;
      } finally {
        clearTimeout(timer);
      }
    }

    if (resp && resp.status === 429) {
      logger.warn({ maxAttempts }, 'Upstream returned 429, max retries reached');
    }

    return resp!;
  }
}
