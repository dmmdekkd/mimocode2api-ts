import crypto from 'node:crypto';
import type { Settings } from './config.js';

// The upstream rejects requests that do not look like they come from the
// official mimocode client. A system message beginning with this prefix is
// enough to satisfy the content gate while keeping the actual user prompt
// intact.
export const MIMOCODE_MAGIC_PREFIX =
  '# Memory system\n\nYou have a persistent file-based memory system. Four file types';

export function normalizeRequest(body: any, settings: Settings): any {
  const normalized: any = { ...body };

  const model = normalized.model || settings.default_model;
  normalized.model = settings.model_map[model] ?? model;

  if (normalized.stream === undefined) normalized.stream = false;
  if (normalized.stream_options === undefined) {
    normalized.stream_options = { include_usage: true };
  }

  // Drop OpenAI-only fields that the upstream does not understand.
  for (const key of ['service_tier', 'metadata', 'modalities', 'audio', 'response_format']) {
    delete normalized[key];
  }

  // Mimocode upstream gate-keeps requests unless they contain a recognised
  // system prompt prefix. Prepend it to the first system message, or create
  // a new leading system message if none exists.
  const messages: any[] = Array.isArray(normalized.messages) ? [...normalized.messages] : [];
  if (messages.length > 0 && messages[0]?.role === 'system') {
    const existing = messages[0].content || '';
    if (!existing.startsWith(MIMOCODE_MAGIC_PREFIX)) {
      messages[0] = { ...messages[0], content: MIMOCODE_MAGIC_PREFIX + '\n\n' + existing };
    }
  } else {
    messages.unshift({ role: 'system', content: MIMOCODE_MAGIC_PREFIX });
  }
  normalized.messages = messages;

  return normalized;
}

export function makeModelList(settings: Settings): any {
  const now = Math.floor(Date.now() / 1000);
  const models: any[] = [];
  const seen = new Set<string>();

  const ids = [settings.default_model, ...Object.keys(settings.model_map), ...Object.values(settings.model_map)];
  for (const modelId of ids) {
    if (seen.has(modelId)) continue;
    seen.add(modelId);
    models.push({
      id: modelId,
      object: 'model',
      created: now,
      owned_by: 'mimo-ai',
    });
  }

  return { object: 'list', data: models };
}

export function makeModelObject(modelId: string): any {
  return {
    id: modelId,
    object: 'model',
    created: Math.floor(Date.now() / 1000),
    owned_by: 'mimo-ai',
  };
}

export function parseSseData(line: string): any | null {
  if (!line.startsWith('data:')) return null;
  const payload = line.slice('data:'.length).trim();
  if (payload === '[DONE]') return null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

export function buildNonStreamResponse(chunks: any[], originalModel: string): any {
  let completionId = `chatcmpl-${crypto.randomBytes(12).toString('hex')}`;
  let created = Math.floor(Date.now() / 1000);

  let content = '';
  let reasoningContent = '';
  const toolCalls: any[] = [];
  let role = 'assistant';
  let finishReason: string | null = null;
  let usage: any | null = null;

  for (const chunk of chunks) {
    if (chunk.id) completionId = chunk.id;
    if (chunk.created) created = chunk.created;

    const choices: any[] = chunk.choices || [];
    for (const choice of choices) {
      const delta = choice.delta || {};
      if (delta.role) role = delta.role;
      if (typeof delta.content === 'string') content += delta.content;
      if (typeof delta.reasoning_content === 'string') reasoningContent += delta.reasoning_content;
      if ('finish_reason' in choice && choice.finish_reason != null) {
        finishReason = choice.finish_reason;
      }

      const deltaToolCalls: any[] = delta.tool_calls || [];
      for (const tc of deltaToolCalls) {
        const idx = tc.index ?? toolCalls.length;
        while (toolCalls.length <= idx) {
          toolCalls.push({ id: '', type: 'function', function: { name: '', arguments: '' } });
        }
        const existing = toolCalls[idx];
        if (tc.id) existing.id = tc.id;
        if (tc.type) existing.type = tc.type;
        const func = tc.function || {};
        if (func.name) existing.function.name = func.name;
        existing.function.arguments += func.arguments || '';
      }
    }

    if (chunk.usage) usage = chunk.usage;
  }

  const message: any = { role, content: content || null };
  if (reasoningContent) message.reasoning_content = reasoningContent;
  if (toolCalls.length > 0) message.tool_calls = toolCalls;

  const response: any = {
    id: completionId,
    object: 'chat.completion',
    created,
    model: originalModel,
    choices: [
      {
        index: 0,
        message,
        finish_reason: finishReason,
      },
    ],
  };
  if (usage) response.usage = usage;
  return response;
}
