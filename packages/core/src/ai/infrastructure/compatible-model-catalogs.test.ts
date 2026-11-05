import { describe, expect, it, vi } from 'vitest';
import { ok } from '../../shared/domain';
import type { CatalogQuery, ModelCatalog } from '../domain';
import { LiteLlmModelCatalog, ModelCatalogRouter, OPENCODE_CATALOG_URL, OpenCodeModelCatalog } from './compatible-model-catalogs';

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

  it('reads tools and structured output from the public catalog without sending the key', async () => {
    const fetch = vi.fn(async (_url: unknown, _init?: RequestInit) => json(catalogBody));
    const catalog = new OpenCodeModelCatalog({ fetch });
    expect(await catalog.lookup(opencode('glm-5.3-flash'))).toEqual(
      ok({ status: 'found', structuredOutputs: true, tools: true, contextLength: 1_000_000 }),
    );
    expect(await catalog.lookup(opencode('kimi-k2.6'))).toMatchObject({ ok: true, value: { structuredOutputs: false, tools: true } });
    expect(await catalog.lookup(opencode('nope'))).toMatchObject({ ok: true, value: { status: 'not-found' } });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]![0]).toBe(OPENCODE_CATALOG_URL);
    expect(new Headers(fetch.mock.calls[0]![1]!.headers).has('authorization')).toBe(false);
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
