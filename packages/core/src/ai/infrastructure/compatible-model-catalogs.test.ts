import { describe, expect, it, vi } from 'vitest';
import { ok } from '../../shared/domain';
import type { CatalogQuery, ModelCatalog } from '../domain';
import {
  AnthropicModelLister,
  LiteLlmModelCatalog,
  ModelCatalogRouter,
  ModelListerRouter,
  OPENCODE_CATALOG_URL,
  OpenCodeModelCatalog,
} from './compatible-model-catalogs';
import { OpenRouterModelCatalog } from './openrouter-model-catalog';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const opencode = (model: string): CatalogQuery => ({ provider: 'opencode', model, apiUrl: 'https://opencode.ai/inference/openai/v1', apiKey: 'sk-oc-1' });
const litellm = (model: string, apiKey: string | null = 'sk-lite-1'): CatalogQuery => ({ provider: 'litellm', model, apiUrl: 'http://localhost:4000/v1', apiKey });

describe('OpenCodeModelCatalog', () => {
  const catalogBody = {
    data: [
      { id: 'glm-5.3-flash', capabilities: { tools: { supported: true }, structured_output: true }, limit: { context: 1_000_000 } },
      { id: 'kimi-k2.6', capabilities: { tools: { supported: true } } },
    ],
  };

  it('reads tools and structured output from the account catalog, with the key', async () => {
    const fetch = vi.fn(async (_url: unknown, _init?: RequestInit) => json(catalogBody));
    const catalog = new OpenCodeModelCatalog({ fetch });
    expect(await catalog.lookup(opencode('glm-5.3-flash'))).toEqual(
      ok({ status: 'found', structuredOutputs: true, tools: true, contextLength: 1_000_000 }),
    );
    expect(await catalog.lookup(opencode('kimi-k2.6'))).toMatchObject({ ok: true, value: { structuredOutputs: false, tools: true } });
    expect(await catalog.lookup(opencode('nope'))).toMatchObject({ ok: true, value: { status: 'not-found' } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe(OPENCODE_CATALOG_URL);
    expect(new Headers(fetch.mock.calls[0]![1]!.headers).get('authorization')).toBe('Bearer sk-oc-1');
  });

  it('caches per key and lists the account models with the key, the public ones without', async () => {
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) =>
      json(new Headers(init?.headers).has('authorization') ? { data: [catalogBody.data[0]] } : catalogBody),
    );
    const catalog = new OpenCodeModelCatalog({ fetch });
    const account = await catalog.list({ provider: 'opencode', apiUrl: '', apiKey: 'sk-oc-1' });
    expect(account.ok && account.value.scope).toBe('account');
    expect(account.ok && account.value.models.map((m) => m.id)).toEqual(['glm-5.3-flash']);
    const pub = await catalog.list({ provider: 'opencode', apiUrl: '', apiKey: null });
    expect(pub.ok && pub.value).toMatchObject({ scope: 'public', models: [{ id: 'glm-5.3-flash' }, { id: 'kimi-k2.6' }] });
    // A model the account has not enabled is not found with the key.
    expect(await catalog.lookup(opencode('kimi-k2.6'))).toMatchObject({ ok: true, value: { status: 'not-found' } });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('reports unavailable when the catalog cannot be reached', async () => {
    const catalog = new OpenCodeModelCatalog({ fetch: vi.fn(async () => json({}, 500)) });
    expect(await catalog.lookup(opencode('glm-5.3-flash'))).toMatchObject({ ok: false, error: { code: 'catalog-unavailable' } });
  });
});

describe('LiteLlmModelCatalog', () => {
  it('uses the proxy model info, with the key', async () => {
    const fetch = vi.fn(async (_url: unknown, _init?: RequestInit) =>
      json({ data: [{ model_name: 'team-gpt', model_info: { supports_function_calling: true, supports_response_schema: true, max_input_tokens: 128_000 } }] }),
    );
    expect(await new LiteLlmModelCatalog({ fetch }).lookup(litellm('team-gpt'))).toEqual(
      ok({ status: 'found', structuredOutputs: true, tools: true, contextLength: 128_000 }),
    );
    expect(fetch.mock.calls[0]![0]).toBe('http://localhost:4000/v1/model/info');
    expect(new Headers(fetch.mock.calls[0]![1]!.headers).get('authorization')).toBe('Bearer sk-lite-1');
  });

  it('falls back to the model list, which proves existence only', async () => {
    const fetch = vi.fn(async (url: unknown) => (String(url).endsWith('/model/info') ? json({}, 403) : json({ data: [{ id: 'team-gpt' }] })));
    const catalog = new LiteLlmModelCatalog({ fetch });
    expect(await catalog.lookup(litellm('team-gpt', null))).toEqual(ok({ status: 'found', structuredOutputs: false, tools: false }));
    expect(await catalog.lookup(litellm('other', null))).toMatchObject({ ok: true, value: { status: 'not-found' } });
  });

  it('reports unavailable when the proxy is down', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await new LiteLlmModelCatalog({ fetch: down }).lookup(litellm('m'))).toMatchObject({ ok: false });
  });
});

describe('ModelCatalogRouter', () => {
  it('dispatches by provider', async () => {
    const catalog = (tools: boolean): ModelCatalog => ({ lookup: async () => ok({ status: 'found', structuredOutputs: false, tools }) });
    const router = new ModelCatalogRouter({ openrouter: catalog(false), opencode: catalog(true), litellm: catalog(false) });
    expect(await router.lookup(opencode('x'))).toMatchObject({ ok: true, value: { tools: true } });
  });
});

describe('model listing', () => {
  it('LiteLLM lists model info names once each, falling back to /models', async () => {
    const info = vi.fn(async () =>
      json({ data: [{ model_name: 'team-gpt', model_info: { supports_function_calling: true } }, { model_name: 'team-gpt' }] }),
    );
    const listed = await new LiteLlmModelCatalog({ fetch: info }).list({ provider: 'litellm', apiUrl: 'http://localhost:4000/v1', apiKey: null });
    expect(listed.ok && listed.value.models).toEqual([
      { id: 'team-gpt', label: 'team-gpt', capabilities: { status: 'found', structuredOutputs: false, tools: true, contextLength: undefined } },
    ]);
    const fallback = vi.fn(async (url: unknown) => (String(url).endsWith('/model/info') ? json({}, 404) : json({ data: [{ id: 'llama' }] })));
    const plain = await new LiteLlmModelCatalog({ fetch: fallback }).list({ provider: 'litellm', apiUrl: 'http://x/v1', apiKey: null });
    expect(plain.ok && plain.value.models.map((m) => m.id)).toEqual(['llama']);
    const down = await new LiteLlmModelCatalog({ fetch: vi.fn(async () => json({}, 500)) }).list({ provider: 'litellm', apiUrl: 'http://x/v1', apiKey: null });
    expect(down.ok).toBe(false);
  });

  it('OpenRouter lists the account models with the key and the public list otherwise', async () => {
    const fetch = vi.fn(async (url: unknown, _init?: RequestInit) =>
      String(url).endsWith('/models/user')
        ? json({ data: [{ id: 'z-ai/glm-5.3-flash', name: 'GLM', supported_parameters: ['structured_outputs'] }] })
        : json({ data: [{ id: 'a/b' }, { id: 'c/d' }] }),
    );
    const catalog = new OpenRouterModelCatalog({ fetch });
    const account = await catalog.list({ provider: 'openrouter', apiUrl: '', apiKey: 'sk-or-1' });
    expect(account.ok && account.value).toMatchObject({ scope: 'account', models: [{ id: 'z-ai/glm-5.3-flash', label: 'GLM', capabilities: { structuredOutputs: true } }] });
    expect(new Headers(fetch.mock.calls[0]![1]!.headers).get('authorization')).toBe('Bearer sk-or-1');
    const pub = await catalog.list({ provider: 'openrouter', apiUrl: '', apiKey: null });
    expect(pub.ok && pub.value.models.map((m) => m.id)).toEqual(['a/b', 'c/d']);
  });

  it('Anthropic lists every page of models with the key and browser-access headers', async () => {
    const fetch = vi.fn(async (url: unknown, _init?: RequestInit) =>
      String(url).includes('after_id')
        ? json({ data: [{ id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5' }], has_more: false })
        : json({ data: [{ id: 'claude-opus-5-5', display_name: 'Claude Opus 5.5' }], has_more: true, last_id: 'claude-opus-5-5' }),
    );
    const listed = await new AnthropicModelLister({ fetch }).list({ provider: 'anthropic', apiUrl: 'https://api.anthropic.com/v1', apiKey: 'sk-ant-1' });
    expect(listed.ok && listed.value.models.map((m) => m.id)).toEqual(['claude-opus-5-5', 'claude-haiku-5-5']);
    const headers = new Headers(fetch.mock.calls[0]![1]!.headers);
    expect(headers.get('x-api-key')).toBe('sk-ant-1');
    expect(headers.get('anthropic-dangerous-direct-browser-access')).toBe('true');
    expect((await new AnthropicModelLister({ fetch }).list({ provider: 'anthropic', apiUrl: '', apiKey: null })).ok).toBe(false);
  });

  it('the router dispatches by provider', async () => {
    const fake = (id: string) => ({ list: vi.fn(async () => ok({ scope: 'account' as const, models: [{ id, label: id, capabilities: { status: 'found' as const, structuredOutputs: false, tools: false } }] })) });
    const router = new ModelListerRouter({ anthropic: fake('a'), openrouter: fake('o'), opencode: fake('c'), litellm: fake('l') });
    const listed = await router.list({ provider: 'opencode', apiUrl: '', apiKey: null });
    expect(listed.ok && listed.value.models[0]!.id).toBe('c');
  });
});

describe('OpenCode with a rejected key', () => {
  it('falls back to the public list for listing and lookup', async () => {
    const fetch = vi.fn(async (_url: unknown, init?: RequestInit) =>
      new Headers(init?.headers).has('authorization') ? json({ error: 'unauthorized' }, 401) : json({ data: [{ id: 'glm-5.3-flash' }] }),
    );
    const catalog = new OpenCodeModelCatalog({ fetch });
    const listed = await catalog.list({ provider: 'opencode', apiUrl: '', apiKey: 'bad' });
    expect(listed.ok && listed.value).toMatchObject({ scope: 'public', models: [{ id: 'glm-5.3-flash' }] });
    expect(await catalog.lookup(opencode('glm-5.3-flash'))).toMatchObject({ ok: true, value: { status: 'found' } });
  });
});
