import { describe, expect, it, vi } from 'vitest';
import { OpenRouterModelCatalog } from './openrouter-model-catalog';

const catalogBody = {
  data: [
    { id: 'z-ai/glm-5.3-flash', context_length: 1048576, supported_parameters: ['tools', 'structured_outputs', 'response_format'] },
    { id: 'old/tools-only', supported_parameters: ['tools'] },
  ],
};
const fetchCatalog = () =>
  vi.fn(async (_url: unknown, _init?: RequestInit) => new Response(JSON.stringify(catalogBody), { status: 200 }));

describe('OpenRouterModelCatalog', () => {
  it('reports capabilities of a known model', async () => {
    const result = await new OpenRouterModelCatalog({ fetch: fetchCatalog() }).lookup('z-ai/glm-5.3-flash');
    expect(result.ok && result.value).toEqual({ status: 'found', structuredOutputs: true, tools: true, contextLength: 1048576 });
  });

  it('reports a tools-only model and an unknown model', async () => {
    const catalog = new OpenRouterModelCatalog({ fetch: fetchCatalog() });
    expect(await catalog.lookup('old/tools-only')).toMatchObject({ ok: true, value: { structuredOutputs: false, tools: true } });
    expect(await catalog.lookup('nobody/nothing')).toMatchObject({ ok: true, value: { status: 'not-found' } });
  });

  it('sends no authorization header', async () => {
    const fetch = fetchCatalog();
    await new OpenRouterModelCatalog({ fetch }).lookup('z-ai/glm-5.3-flash');
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://openrouter.ai/api/v1/models');
    expect(new Headers(init?.headers).has('authorization')).toBe(false);
  });

  it('caches the list for the TTL', async () => {
    let now = 0;
    const fetch = fetchCatalog();
    const catalog = new OpenRouterModelCatalog({ fetch, now: () => now, ttlMs: 1000 });
    await catalog.lookup('a/b');
    now = 500;
    await catalog.lookup('a/b');
    expect(fetch).toHaveBeenCalledTimes(1);
    now = 1500;
    await catalog.lookup('a/b');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('fails on network errors and bad statuses', async () => {
    const offline = new OpenRouterModelCatalog({ fetch: vi.fn(async () => Promise.reject(new TypeError('offline'))) });
    expect(await offline.lookup('a/b')).toMatchObject({ ok: false, error: { code: 'catalog-unavailable' } });
    const down = new OpenRouterModelCatalog({ fetch: vi.fn(async () => new Response('', { status: 500 })) });
    expect((await down.lookup('a/b')).ok).toBe(false);
  });
});
