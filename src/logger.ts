const LEVELS: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const COLORS: Record<string, (s: string) => string> = {
  reset: (s) => `\x1b[0m${s}`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
  blue: (s) => `\x1b[34m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  boldRed: (s) => `\x1b[1;31m${s}\x1b[0m`,
  white: (s) => `\x1b[37m${s}\x1b[0m`,
};

const LEVEL_COLORS: Record<string, (s: string) => string> = {
  trace: COLORS.gray,
  debug: COLORS.blue,
  info: COLORS.green,
  warn: COLORS.yellow,
  error: COLORS.red,
  fatal: COLORS.boldRed,
};

const LEVEL_LABELS: Record<string, string> = {
  trace: 'TRACE',
  debug: 'DEBUG',
  info: 'INFO ',
  warn: 'WARN ',
  error: 'ERROR',
  fatal: 'FATAL',
};

function pad2(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

function pad3(n: number): string {
  if (n < 10) return '00' + n;
  if (n < 100) return '0' + n;
  return String(n);
}

function formatTime(date: Date): string {
  const Y = date.getFullYear();
  const M = pad2(date.getMonth() + 1);
  const D = pad2(date.getDate());
  const h = pad2(date.getHours());
  const m = pad2(date.getMinutes());
  const s = pad2(date.getSeconds());
  const ms = pad3(date.getMilliseconds());
  return `${Y}-${M}-${D} ${h}:${m}:${s}.${ms}`;
}

function colorizeValue(key: string, val: any, useColor: boolean): string {
  const color = (fn: (s: string) => string, s: string) => (useColor ? fn(s) : s);
  const str = typeof val === 'object' ? JSON.stringify(val) : String(val);

  // Semantic colouring for well-known keys.
  if (key === 'status' || key === 'statusCode') {
    const n = Number(val);
    if (!Number.isNaN(n)) {
      if (n >= 500) return color(COLORS.boldRed, str);
      if (n >= 400) return color(COLORS.red, str);
      if (n >= 300) return color(COLORS.cyan, str);
      if (n >= 200) return color(COLORS.green, str);
    }
  }
  if (typeof val === 'object') return color(COLORS.gray, str);
  return color(COLORS.white, str);
}

function formatExtra(context: Record<string, any>, useColor: boolean): string {
  const color = (fn: (s: string) => string, s: string) => (useColor ? fn(s) : s);
  const parts: string[] = [];
  for (const key of Object.keys(context)) {
    const val = context[key];
    if (val === undefined || val === null) continue;
    parts.push(`${color(COLORS.cyan, key)}=${colorizeValue(key, val, useColor)}`);
  }
  return parts.join(' ');
}

interface Logger {
  trace(...args: any[]): void;
  debug(...args: any[]): void;
  info(...args: any[]): void;
  warn(...args: any[]): void;
  error(...args: any[]): void;
  fatal(...args: any[]): void;
  child(name: string): Logger;
}

function createLoggerInstance(name: string, minLevel: number, useColor: boolean): Logger {
  const color = (fn: (s: string) => string, s: string) => (useColor ? fn(s) : s);

  // Pino-compatible call signatures:
  //   logger.info(msg)
  //   logger.info(ctx, msg)
  //   logger.info(msg, ctx)  <-- also supported
  const log = (level: string, ...args: any[]) => {
    const levelNum = LEVELS[level];
    if (levelNum < minLevel) return;

    let ctx: Record<string, any> | undefined;
    let msg: string;
    const arg1 = args[0];
    const arg2 = args[1];
    if (typeof arg1 === 'string') {
      msg = arg1;
      ctx = arg2 && typeof arg2 === 'object' ? arg2 : undefined;
    } else if (arg1 && typeof arg1 === 'object') {
      ctx = arg1;
      msg = typeof arg2 === 'string' ? arg2 : '';
    } else {
      msg = String(arg1 ?? '');
    }

    const now = new Date();
    const timeStr = color(COLORS.gray, formatTime(now));
    const levelStr = color(LEVEL_COLORS[level] ?? COLORS.white, LEVEL_LABELS[level] ?? level.toUpperCase());
    const nameStr = color(COLORS.cyan, name);
    const msgStr = color(COLORS.white, msg);

    let line = `${timeStr} ${levelStr} ${nameStr}: ${msgStr}`;
    if (ctx && Object.keys(ctx).length > 0) {
      line += '  ' + formatExtra(ctx, useColor);
    }

    const stream = levelNum >= LEVELS.error ? process.stderr : process.stdout;
    stream.write(line + '\n');
  };

  return {
    trace: (...args) => log('trace', ...args),
    debug: (...args) => log('debug', ...args),
    info: (...args) => log('info', ...args),
    warn: (...args) => log('warn', ...args),
    error: (...args) => log('error', ...args),
    fatal: (...args) => log('fatal', ...args),
    child: (childName) => createLoggerInstance(`${name}:${childName}`, minLevel, useColor),
  };
}

const envLevel = (process.env.MIMOCODE2API_LOG_LEVEL ?? 'info').toLowerCase();
const minLevel = LEVELS[envLevel] ?? LEVELS.info;
const useColor = process.env.NO_COLOR === undefined && process.stdout.isTTY;

export function createLogger(name: string): Logger {
  return createLoggerInstance(name, minLevel, useColor);
}

export const logger = createLoggerInstance('mimocode2api', minLevel, useColor);
