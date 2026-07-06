import { z } from 'zod';
import os from 'node:os';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { createLogger } from './logger';

const logger = createLogger('mimocode2api.config');

function getCpuModel(): string {
  const cpus = os.cpus();
  if (cpus.length > 0 && cpus[0].model) {
    return cpus[0].model;
  }
  return 'unknown-cpu';
}

export function computeMimoFingerprint(): string {
  const nodePlatform = os.platform();
  const nodeArch = os.arch();
  const hostname = os.hostname();
  const cpu = getCpuModel();
  const username = os.userInfo().username;

  const payload = [hostname, nodePlatform, nodeArch, cpu, username].join('|');
  logger.debug({ payload }, 'Mimo fingerprint payload');
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

const settingsSchema = z.object({
  base_url: z.string().default('https://api.xiaomimimo.com'),
  bootstrap_path: z.string().default('/api/free-ai/bootstrap'),
  chat_path: z.string().default('/api/free-ai/openai/chat'),

  user_agent: z.string().default('mimocode/0.1.0'),
  x_source: z.string().default('mimocode-cli-free'),
  session_affinity: z.string().nullable().default(null),

  client_id: z.string().nullable().default(null),
  client_id_file: z.string().nullable().default('.client_id'),
  jwt_leeway_seconds: z.number().default(60),

  default_model: z.string().default('mimo-auto'),
  model_map: z.record(z.string(), z.string()).default({}),
  request_timeout: z.number().default(300.0),

  retry_max_attempts: z.number().int().default(5),
  retry_base_delay_sec: z.number().default(1.0),

  listen_host: z.string().default('0.0.0.0'),
  listen_port: z.number().int().default(8000),
  log_level: z.string().default('info'),
});

export type Settings = z.infer<typeof settingsSchema>;

const CONFIG_FILE = 'config.jsonc';

/** 获取配置文件的基础目录，始终使用当前工作目录（CWD） */
function getBaseDir(): string {
  return process.cwd();
}

// 每个配置项的中文说明，按字段顺序分组
const fieldComments: Record<string, string> = {
  base_url: '上游 API 基础地址',
  bootstrap_path: 'JWT 引导接口路径',
  chat_path: '聊天补全接口路径',
  user_agent: '发送给上游的 User-Agent 请求头',
  x_source: 'X-Mimo-Source 请求头',
  session_affinity: '会话亲和性标识（留空自动生成）',
  client_id: '客户端 ID（留空时根据硬件指纹自动生成）',
  client_id_file: '持久化自动生成客户端 ID 的文件路径',
  jwt_leeway_seconds: 'JWT 过期容差秒数（提前刷新）',
  default_model: '未指定模型时的默认模型',
  model_map: '模型别名映射（JSON 对象：{"别名": "上游模型"}）',
  request_timeout: '上游请求超时秒数',
  retry_max_attempts: '429 / 网络错误的最大重试次数',
  retry_base_delay_sec: '重试基础延迟秒数（指数退避）',
  listen_host: '服务监听地址',
  listen_port: '服务监听端口',
  log_level: '日志级别：trace、debug、info、warn、error、fatal',
};

// 分组顺序，用于生成配置文件时的字段排列
const fieldGroups: Array<{ title: string; fields: string[] }> = [
  { title: '上游接口', fields: ['base_url', 'bootstrap_path', 'chat_path'] },
  { title: '身份标识', fields: ['user_agent', 'x_source', 'session_affinity'] },
  { title: '客户端 ID', fields: ['client_id', 'client_id_file', 'jwt_leeway_seconds'] },
  { title: '模型设置', fields: ['default_model', 'model_map', 'request_timeout'] },
  { title: '重试策略', fields: ['retry_max_attempts', 'retry_base_delay_sec'] },
  { title: '服务器', fields: ['listen_host', 'listen_port', 'log_level'] },
];

function formatJsoncValue(value: any): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'object') return JSON.stringify(value, null, 2).replace(/\n/g, '\n  ');
  if (typeof value === 'string') return JSON.stringify(value);
  return String(value);
}

function stripJsoncComments(content: string): string {
  // 移除单行注释 // ...
  // 移除多行注释 /* ... */
  // 保留字符串内的内容
  let result = '';
  let i = 0;
  let inString = false;
  let stringChar = '';

  while (i < content.length) {
    const ch = content[i];
    const next = content[i + 1];

    if (inString) {
      result += ch;
      if (ch === '\\' && i + 1 < content.length) {
        result += next;
        i += 2;
        continue;
      }
      if (ch === stringChar) {
        inString = false;
      }
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      result += ch;
      i++;
      continue;
    }

    if (ch === '/' && next === '/') {
      // 跳过到行尾
      while (i < content.length && content[i] !== '\n') i++;
      continue;
    }

    if (ch === '/' && next === '*') {
      i += 2;
      while (i < content.length && !(content[i] === '*' && content[i + 1] === '/')) i++;
      i += 2;
      continue;
    }

    result += ch;
    i++;
  }

  // 移除尾逗号
  return result.replace(/,(\s*[}\]])/g, '$1');
}

export function ensureConfigFile(): string | null {
  const configPath = path.join(getBaseDir(), CONFIG_FILE);
  if (fs.existsSync(configPath)) return null;

  const defaults = settingsSchema.parse({});
  const lines: string[] = [
    '{',
    '  // Mimocode2API 配置文件',
    '  // 首次启动时自动生成，编辑后重启生效。',
    '',
  ];

  for (let g = 0; g < fieldGroups.length; g++) {
    const group = fieldGroups[g];
    lines.push(`  // ===== ${group.title} =====`);
    for (const key of group.fields) {
      const comment = fieldComments[key];
      if (comment) lines.push(`  // ${comment}`);
      const value = formatJsoncValue((defaults as any)[key]);
      lines.push(`  "${key}": ${value},`);
    }
    if (g < fieldGroups.length - 1) lines.push('');
  }

  // 移除最后一个字段的尾逗号
  let lastIdx = lines.length - 1;
  while (lastIdx >= 0 && !lines[lastIdx].includes(',')) lastIdx--;
  if (lastIdx >= 0) lines[lastIdx] = lines[lastIdx].replace(/,$/, '');

  lines.push('}');
  lines.push('');

  try {
    fs.writeFileSync(configPath, lines.join('\n'), 'utf8');
    return configPath;
  } catch (exc) {
    logger.warn({ err: exc, path: configPath }, '无法写入默认配置文件');
    return null;
  }
}

function readConfigFile(): Record<string, any> {
  const configPath = path.join(getBaseDir(), CONFIG_FILE);
  if (!fs.existsSync(configPath)) return {};

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const cleaned = stripJsoncComments(raw);
    return JSON.parse(cleaned);
  } catch (exc) {
    logger.error({ err: exc, path: configPath }, '配置文件解析失败，使用默认值');
    return {};
  }
}

export function getSettings(): Settings {
  const cached = (getSettings as any)._cached;
  if (cached) return cached;
  const generated = ensureConfigFile();
  if (generated) {
    logger.info({ path: generated }, '已生成默认配置文件');
  }
  const parsed = settingsSchema.parse(readConfigFile());
  (getSettings as any)._cached = parsed;
  return parsed;
}

export function getClientId(settings: Settings): string {
  if (settings.client_id) {
    return settings.client_id;
  }

  const filePath = settings.client_id_file;
  if (filePath) {
    const resolved = path.isAbsolute(filePath) ? filePath : path.join(getBaseDir(), filePath);
    if (fs.existsSync(resolved)) {
      const cid = fs.readFileSync(resolved, 'utf8').trim();
      if (cid) return cid;
    }
  }

  const cid = computeMimoFingerprint();
  if (filePath) {
    try {
      const resolved = path.isAbsolute(filePath) ? filePath : path.join(getBaseDir(), filePath);
      fs.writeFileSync(resolved, cid, 'utf8');
      logger.info({ path: resolved }, '已生成并持久化客户端 ID');
    } catch (exc) {
      logger.warn({ err: exc }, '无法持久化客户端 ID');
    }
  }
  return cid;
}
