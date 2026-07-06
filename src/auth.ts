import type { Settings } from './config.js';
import { getClientId } from './config.js';
import { createLogger } from './logger.js';

const logger = createLogger('mimocode2api.auth');

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableError(err: any): boolean {
  // Network / connection errors are retryable.
  if (err && typeof err.message === 'string') {
    const msg = err.message.toLowerCase();
    if (msg.includes('fetch') || msg.includes('network') ||
        msg.includes('econnrefused') || msg.includes('etimedout') ||
        msg.includes('enotfound') || msg.includes('dns') ||
        msg.includes('abort') || msg.includes('timeout') ||
        msg.includes('unable to connect')) {
      return true;
    }
  }
  return false;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

function decodeExp(jwt: string): number | null {
  try {
    const parts = jwt.split('.');
    if (parts.length < 2) return null;
    const payloadB64 = parts[1];
    const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
    const payloadJson = Buffer.from(padded, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);
    if (payload && typeof payload.exp === 'number') {
      return payload.exp;
    }
    return null;
  } catch {
    return null;
  }
}

export class JWTManager {
  settings: Settings;
  private jwt: string | null = null;
  private exp: number | null = null;
  private refreshPromise: Promise<string> | null = null;

  constructor(settings: Settings) {
    this.settings = settings;
  }

  async getJwt(forceRefresh = false): Promise<string> {
    const now = Date.now() / 1000;
    if (!forceRefresh && this.jwt) {
      if (this.exp === null || now < this.exp - this.settings.jwt_leeway_seconds) {
        return this.jwt;
      }
    }
    if (this.refreshPromise) {
      return this.refreshPromise;
    }
    this.refreshPromise = this.refresh().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  private async refresh(): Promise<string> {
    const url = `${this.settings.base_url.replace(/\/$/, '')}${this.settings.bootstrap_path}`;
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': this.settings.user_agent,
      Accept: '*/*',
    };
    const payload = { client: getClientId(this.settings) };

    const maxAttempts = this.settings.retry_max_attempts;
    const baseDelay = this.settings.retry_base_delay_sec;
    let lastError: any = null;

    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
      logger.debug({ url, attempt: attempt + 1, maxAttempts: maxAttempts + 1 }, 'Refreshing JWT');

      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        });

        if (isRetryableStatus(resp.status) && attempt < maxAttempts) {
          const backoffSec = baseDelay * Math.pow(2, attempt);
          const retryAfter = resp.headers.get('retry-after');
          let retryAfterSec: number | null = null;
          if (retryAfter) {
            const asInt = parseInt(retryAfter.trim(), 10);
            if (!Number.isNaN(asInt)) retryAfterSec = Math.max(0, asInt);
          }
          const delaySec = retryAfterSec !== null ? Math.max(retryAfterSec, backoffSec) : backoffSec;
          logger.warn(
            { attempt: attempt + 1, maxAttempts, status: resp.status, delay: delaySec },
            'Bootstrap returned retryable status, retrying with backoff',
          );
          await sleep(delaySec * 1000);
          lastError = new Error(`HTTP ${resp.status}`);
          continue;
        }

        if (!resp.ok) {
          const text = await resp.text();
          logger.error({ status: resp.status, body: text }, 'Bootstrap failed');
          throw new Error(`Failed to acquire JWT: ${resp.status} ${text}`);
        }

        const data: any = await resp.json();
        const jwt = data.jwt;
        if (!jwt || typeof jwt !== 'string') {
          throw new Error('Bootstrap response missing jwt field');
        }

        this.jwt = jwt;
        this.exp = decodeExp(jwt);
        if (this.exp) {
          const ttl = Math.floor(this.exp - Date.now() / 1000);
          logger.info({ ttl }, 'JWT refreshed, expires in seconds');
        } else {
          logger.info('JWT refreshed (no exp claim)');
        }
        return jwt;
      } catch (exc) {
        lastError = exc;
        if (isRetryableError(exc) && attempt < maxAttempts) {
          const backoffSec = baseDelay * Math.pow(2, attempt);
          logger.warn(
            { attempt: attempt + 1, maxAttempts, delay: backoffSec, err: exc?.message ?? exc },
            'Bootstrap network error, retrying with backoff',
          );
          await sleep(backoffSec * 1000);
          continue;
        }
        throw exc;
      }
    }

    throw lastError ?? new Error('Bootstrap failed after retries');
  }
}
