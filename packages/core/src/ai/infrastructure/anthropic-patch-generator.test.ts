import { describe, expect, it, vi } from 'vitest';
import { EditContext, type ProviderConfig } from '../domain';
import { AnthropicPatchGenerator } from './anthropic-patch-generator';
import { applyPatchJsonSchema } from './patch-schema';


const config: ProviderConfig = { provider: 'anthropic', apiKey: 'sk-ant-test', model: 'claude-opus-5-5' };
const context = EditContext.create({
  html: '<form data-hew-target="t0"></form>',
  ancestors: ['main#app'],
  styles: { color: 'black' },
  targetIds: ['t0'],
  pageUrl: 'http://localhost',
  pageTitle: 'Demo',
});

function message(content: unknown[], stop_reason = 'tool_use', extra: Record<string, unknown> = {}) {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content,
    stop_reason,
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
    ...extra,
  };
}

function fetchReturning(status: number, body: unknown) {
  return vi.fn(async (_url: unknown, _init?: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

const toolUse = (input: unknown) => ({ type: 'tool_use', id: 'tu_1', name: 'apply_patch', input });

describe('AnthropicPatchGenerator', () => {
  it('returns the parsed tool input and sends the expected request', async () => {
    const fetch = fetchReturning(
      200,
      message([toolUse({ summary: 'Adds banner', ops: [{ type: 'insert', target: 't0', position: 'before', html: '<p>!</p>' }] })]),
    );
    const generator = new AnthropicPatchGenerator({ fetch });
    const result = await generator.generate({ config, context, prompt: 'add a banner', mode: 'tool' });

    expect(result.ok && result.value.raw).toMatchObject({ summary: 'Adds banner' });
    expect(result.ok && result.value.diagnostics.latencyMs).toBeGreaterThanOrEqual(0);
    const [url, init] = fetch.mock.calls[0]! as [string, RequestInit];
    expect(String(url)).toBe('https://api.anthropic.com/v1/messages');
    const headers = new Headers(init.headers);
    expect(headers.get('authorization')).toBe('Bearer sk-ant-test');
    expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    expect(headers.get('anthropic-beta')).toContain('server-side-fallback-2026-07-01');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', tool_choice: { type: 'auto' } });
    expect(body.messages[0].content).toContain('Request: add a banner');
  });

  it('returns raw tool input unvalidated, for the application to parse', async () => {
    const fetch = fetchReturning(200, message([toolUse({ summary: 'x', ops: [{ type: 'explode', target: 't0' }] })]));
    const result = await new AnthropicPatchGenerator({ fetch }).generate({ config, context, prompt: 'x', mode: 'tool' });
    expect(result.ok && result.value.raw).toEqual({ summary: 'x', ops: [{ type: 'explode', target: 't0' }] });
  });

  it('passes a text-only answer on as unparsed text', async () => {
    const fetch = fetchReturning(200, message([{ type: 'text', text: 'Sure!' }], 'end_turn'));
    const result = await new AnthropicPatchGenerator({ fetch }).generate({ config, context, prompt: 'x', mode: 'tool' });
    expect(result.ok && result.value.raw).toEqual({ unparsedText: 'Sure!' });
  });

  it('reports an answer cut off at the output limit instead of passing on a partial patch', async () => {
    const fetch = fetchReturning(200, message([toolUse({ summary: 'x' })], 'max_tokens'));
    const result = await new AnthropicPatchGenerator({ fetch }).generate({ config, context, prompt: 'x', mode: 'tool' });
    expect(!result.ok && result.error.code).toBe('provider-output-limit');
  });

  it('includes previous issues in the retry message', async () => {
    const fetch = fetchReturning(200, message([toolUse({ summary: 's', ops: [{ type: 'remove', target: 't0' }] })]));
    await new AnthropicPatchGenerator({ fetch }).generate({ config, context, prompt: 'x', mode: 'tool', previousIssues: ['ops.0.type: bad'] });
    const body = JSON.parse(String((fetch.mock.calls[0]! as [string, RequestInit])[1].body));
    expect(body.messages[0].content).toContain('- ops.0.type: bad');
  });

  it('maps a refusal stop reason', async () => {
    const fetch = fetchReturning(200, message([], 'refusal', { stop_details: { type: 'refusal', category: null, explanation: null } }));
    const result = await new AnthropicPatchGenerator({ fetch }).generate({ config, context, prompt: 'x', mode: 'tool' });
    expect(!result.ok && result.error.code).toBe('provider-refusal');
  });

  it('maps 401 to an auth error', async () => {
    const fetch = fetchReturning(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } });
    const result = await new AnthropicPatchGenerator({ fetch }).generate({ config, context, prompt: 'x', mode: 'tool' });
    expect(!result.ok && result.error.code).toBe('provider-auth');
  });

  it('maps 429 to a rate-limit error', async () => {
    const fetch = fetchReturning(429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } });
    const result = await new AnthropicPatchGenerator({ fetch }).generate({ config, context, prompt: 'x', mode: 'tool' });
    expect(!result.ok && result.error.code).toBe('provider-rate-limit');
  });

  it('maps network failures and timeouts', async () => {
    const offline = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const network = await new AnthropicPatchGenerator({ fetch: offline }).generate({ config, context, prompt: 'x', mode: 'tool' });
    expect(!network.ok && network.error.code).toBe('provider-network');

    const hang = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
        ),
    );
    const timeout = await new AnthropicPatchGenerator({ fetch: hang, timeoutMs: 20 }).generate({ config, context, prompt: 'x', mode: 'tool' });
    expect(!timeout.ok && timeout.error.code).toBe('provider-timeout');
  });

  it('exposes an object JSON schema without $schema', () => {
    const schema = applyPatchJsonSchema();
    expect(schema.type).toBe('object');
    expect(schema).not.toHaveProperty('$schema');
  });
});
