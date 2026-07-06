import { describe, it, expect } from 'bun:test';
import {
  buildNonStreamResponse,
  makeModelList,
  makeModelObject,
  MIMOCODE_MAGIC_PREFIX,
  normalizeRequest,
  parseSseData,
} from '../src/compat.js';
import type { Settings } from '../src/config.js';

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    base_url: 'https://api.xiaomimimo.com',
    bootstrap_path: '/api/free-ai/bootstrap',
    chat_path: '/api/free-ai/openai/chat',
    user_agent: 'mimocode/0.1.0',
    x_source: 'mimocode-cli-free',
    session_affinity: null,
    client_id: null,
    client_id_file: '.client_id',
    jwt_leeway_seconds: 60,
    default_model: 'mimo-auto',
    model_map: {},
    request_timeout: 300.0,
    listen_host: '0.0.0.0',
    listen_port: 8000,
    log_level: 'info',
    ...overrides,
  };
}

describe('normalizeRequest', () => {
  it('sets defaults when fields are missing', () => {
    const settings = makeSettings();
    const body = { messages: [{ role: 'user', content: 'hi' }] };
    const out = normalizeRequest(body, settings);
    expect(out.model).toBe('mimo-auto');
    expect(out.stream).toBe(false);
    expect(out.stream_options).toEqual({ include_usage: true });
    expect(out.messages[0].role).toBe('system');
    expect(out.messages[0].content.startsWith(MIMOCODE_MAGIC_PREFIX)).toBe(true);
  });

  it('prepends magic prefix to existing system message', () => {
    const settings = makeSettings();
    const body = {
      messages: [
        { role: 'system', content: 'Be nice.' },
        { role: 'user', content: 'hi' },
      ],
    };
    const out = normalizeRequest(body, settings);
    expect(out.messages[0].content.startsWith(MIMOCODE_MAGIC_PREFIX)).toBe(true);
    expect(out.messages[0].content).toContain('Be nice.');
  });

  it('maps model alias through model_map', () => {
    const settings = makeSettings({ model_map: { 'gpt-4o': 'mimo-auto' } });
    const out = normalizeRequest({ model: 'gpt-4o' }, settings);
    expect(out.model).toBe('mimo-auto');
  });
});

describe('parseSseData', () => {
  it('skips [DONE], comments, and malformed JSON', () => {
    expect(parseSseData('data: [DONE]')).toBeNull();
    expect(parseSseData(': ping')).toBeNull();
    expect(parseSseData('data: {')).toBeNull();
  });

  it('parses valid JSON payloads', () => {
    expect(parseSseData('data: {"id":"abc"}')).toEqual({ id: 'abc' });
  });
});

describe('buildNonStreamResponse', () => {
  it('aggregates content and usage across chunks', () => {
    const chunks = [
      {
        id: 'chatcmpl-abc',
        created: 1234567890,
        model: 'mimo-auto',
        choices: [
          { delta: { role: 'assistant', content: 'Hello' }, finish_reason: null, index: 0 },
        ],
      },
      {
        id: 'chatcmpl-abc',
        created: 1234567890,
        model: 'mimo-auto',
        choices: [
          { delta: { content: ' world' }, finish_reason: 'stop', index: 0 },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
      },
    ];
    const resp = buildNonStreamResponse(chunks, 'mimo-auto');
    expect(resp.object).toBe('chat.completion');
    expect(resp.model).toBe('mimo-auto');
    expect(resp.id).toBe('chatcmpl-abc');
    expect(resp.created).toBe(1234567890);
    expect(resp.choices[0].message.content).toBe('Hello world');
    expect(resp.choices[0].finish_reason).toBe('stop');
    expect(resp.usage.total_tokens).toBe(12);
  });
});

describe('makeModelList / makeModelObject', () => {
  it('lists default + mapped models deduped', () => {
    const settings = makeSettings({ model_map: { 'gpt-4o': 'mimo-auto' } });
    const list = makeModelList(settings);
    expect(list.object).toBe('list');
    const ids = list.data.map((m: any) => m.id);
    expect(ids).toContain('mimo-auto');
    expect(ids).toContain('gpt-4o');
    // Dedup: mimo-auto appears as both default and mapped value, should only show once.
    expect(ids.filter((id: string) => id === 'mimo-auto').length).toBe(1);
  });

  it('builds a single model descriptor', () => {
    const obj = makeModelObject('mimo-auto');
    expect(obj.id).toBe('mimo-auto');
    expect(obj.object).toBe('model');
    expect(obj.owned_by).toBe('mimo-ai');
  });
});
