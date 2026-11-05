import { describe, expect, it, vi } from 'vitest';
import { EditContext, type OutputMode, type ProviderConfig } from '../domain';
import { ChatCompletionsPatchGenerator } from './chat-completions-patch-generator';

const config: ProviderConfig = {
  provider: 'openrouter',
  apiKey: 'sk-or-test',
  model: 'z-ai/glm-5.3-flash',
  capabilities: { status: 'found', structuredOutputs: true, tools: true },
  apiUrl: 'https://openrouter.ai/api/v1',
};
const context = EditContext.create({
  html: '<form data-hew-target="t0"></form>',
  ancestors: [],
  styles: {},
  targetIds: ['t0'],
  pageUrl: 'http://localhost',
  pageTitle: 'Demo',
});
const draft = { summary: 'Adds banner', ops: [{ type: 'remove', target: 't0' }] };

function reply(status: number, body: unknown) {
  return vi.fn(async (_url: unknown, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}
const completion = (message: Record<string, unknown>, usage?: unknown) => ({ choices: [{ message }], ...(usage ? { usage } : {}) });
const bodyOf = (fetch: ReturnType<typeof reply>) => JSON.parse(String(fetch.mock.calls[0]![1]!.body));
const run = (fetch: typeof globalThis.fetch, mode: OutputMode, extra: Partial<Parameters<ChatCompletionsPatchGenerator['generate']>[0]> = {}) =>
  new ChatCompletionsPatchGenerator({ fetch }).generate({ config, context, prompt: 'remove it', mode, ...extra });

describe('ChatCompletionsPatchGenerator', () => {
  it('json_schema mode: strict response_format, require_parameters, auth header, cost', async () => {
    const fetch = reply(200, completion({ content: JSON.stringify(draft) }, { cost: 0.00012 }));
    const result = await run(fetch, 'json_schema');

    expect(result.ok && result.value).toMatchObject({ raw: draft, diagnostics: { costUsd: 0.00012 } });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(new Headers(init!.headers).get('authorization')).toBe('Bearer sk-or-test');
    const body = bodyOf(fetch);
    expect(body).toMatchObject({
      model: 'z-ai/glm-5.3-flash',
      usage: { include: true },
      response_format: { type: 'json_schema', json_schema: { name: 'apply_patch', strict: true } },
      provider: { require_parameters: true },
    });
    expect(body.messages[0]).toMatchObject({ role: 'system' });
    expect(body.messages[1].content).toContain('Request: remove it');
    expect(body.tools).toBeUndefined();
  });

  it('tool mode: forces the apply_patch function and reads its arguments', async () => {
    const fetch = reply(200, completion({ content: null, tool_calls: [{ function: { arguments: JSON.stringify(draft) } }] }));
    const result = await run(fetch, 'tool');
    expect(result.ok && result.value.raw).toEqual(draft);
    const body = bodyOf(fetch);
    expect(body.tool_choice).toEqual({ type: 'function', function: { name: 'apply_patch' } });
    expect(body.tools[0].function.name).toBe('apply_patch');
    expect(body.response_format).toBeUndefined();
  });

  it('prompted mode: no format parameters, non-JSON text is passed on unparsed', async () => {
    const fetch = reply(200, completion({ content: 'Here:\n```json\n{}\n```' }));
    const result = await run(fetch, 'prompted');
    expect(result.ok && result.value.raw).toEqual({ unparsedText: 'Here:\n```json\n{}\n```' });
    const body = bodyOf(fetch);
    expect(body.response_format).toBeUndefined();
    expect(body.tools).toBeUndefined();
    expect(body.provider).toBeUndefined();
    expect(body.messages[0].content).toContain('Respond with only a JSON object');
  });

  it('includes previous issues in the retry message', async () => {
    const fetch = reply(200, completion({ content: JSON.stringify(draft) }));
    await run(fetch, 'json_schema', { previousIssues: ['ops.0.target: bad'] });
    expect(bodyOf(fetch).messages[1].content).toContain('- ops.0.target: bad');
  });

  it.each([
    [401, 'provider-auth'],
    [402, 'provider-credits'],
    [403, 'provider-moderation'],
    [408, 'provider-timeout'],
    [429, 'provider-rate-limit'],
    [502, 'provider-unavailable'],
    [503, 'provider-no-provider'],
    [500, 'provider-unknown'],
  ])('maps HTTP %i to %s', async (status, code) => {
    const result = await run(reply(status, { error: { code: status, message: 'nope' } }), 'json_schema');
    expect(!result.ok && result.error.code).toBe(code);
  });

  it('maps errors returned inside a 200 body', async () => {
    const result = await run(reply(200, { error: { code: 402, message: 'Insufficient credits' } }), 'json_schema');
    expect(!result.ok && result.error.code).toBe('provider-credits');
  });

  it('points to settings when the model rejects the output format', async () => {
    const result = await run(reply(400, { error: { code: 400, message: 'response_format not supported' } }), 'json_schema');
    expect(!result.ok && result.error.message).toContain('re-check the model in settings');
  });

  it('maps network failures and timeouts', async () => {
    const offline = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const network = await run(offline, 'json_schema');
    expect(!network.ok && network.error.code).toBe('provider-network');

    const hang = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))),
        ),
    );
    const timeout = await new ChatCompletionsPatchGenerator({ fetch: hang, timeoutMs: 20 }).generate({ config, context, prompt: 'x', mode: 'json_schema' });
    expect(!timeout.ok && timeout.error.code).toBe('provider-timeout');
  });

  it('ping sends a one-token request and maps failures', async () => {
    const okFetch = reply(200, completion({ content: 'OK' }));
    expect((await new ChatCompletionsPatchGenerator({ fetch: okFetch }).ping(config)).ok).toBe(true);
    expect(bodyOf(okFetch).max_tokens).toBe(1);
    const denied = await new ChatCompletionsPatchGenerator({ fetch: reply(401, {}) }).ping(config);
    expect(!denied.ok && denied.error.code).toBe('provider-auth');
  });

  it('OpenCode: posts to its API with the key and without OpenRouter-only fields', async () => {
    const fetch = reply(200, completion({ content: JSON.stringify(draft) }));
    const opencode: ProviderConfig = { ...config, provider: 'opencode', apiKey: 'sk-oc-1', model: 'glm-5.3-flash', apiUrl: 'https://opencode.ai/inference/openai/v1' };
    const result = await new ChatCompletionsPatchGenerator({ fetch }).generate({ config: opencode, context, prompt: 'x', mode: 'json_schema' });
    expect(result.ok && result.value.raw).toEqual(draft);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://opencode.ai/inference/openai/v1/chat/completions');
    expect(new Headers(init!.headers).get('authorization')).toBe('Bearer sk-oc-1');
    const body = bodyOf(fetch);
    expect(body.response_format).toMatchObject({ type: 'json_schema' });
    expect(body.usage).toBeUndefined();
    expect(body.provider).toBeUndefined();
  });

  it('LiteLLM: no Authorization header without a key, and network errors name the proxy', async () => {
    const litellm: ProviderConfig = { ...config, provider: 'litellm', apiKey: null, model: 'team-gpt', apiUrl: 'http://localhost:4000/v1' };
    const fetch = reply(200, completion({ content: JSON.stringify(draft) }));
    await new ChatCompletionsPatchGenerator({ fetch }).generate({ config: litellm, context, prompt: 'x', mode: 'prompted' });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('http://localhost:4000/v1/chat/completions');
    expect(new Headers(init!.headers).has('authorization')).toBe(false);

    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    const result = await new ChatCompletionsPatchGenerator({ fetch: down }).ping(litellm);
    expect(!result.ok && result.error.message).toContain('is the LiteLLM proxy running at http://localhost:4000?');
  });
});
