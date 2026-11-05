import { describe, expect, it, vi } from 'vitest';
import { ok } from '../../shared/domain';
import { EditContext, type PatchGenerator, type ProviderConfig } from '../domain';
import { PatchGeneratorRouter } from './patch-generator-router';

const fake = (): PatchGenerator => ({
  generate: vi.fn(async () => ok({ raw: {}, diagnostics: { latencyMs: 1 } })),
  ping: vi.fn(async () => ok(undefined)),
});
const context = EditContext.create({ html: '', ancestors: [], styles: {}, targetIds: [], pageUrl: '', pageTitle: '' });
const anthropic: ProviderConfig = { provider: 'anthropic', apiKey: 'k', model: 'claude-opus-5-5' };
const openrouter: ProviderConfig = {
  provider: 'openrouter',
  apiKey: 'k',
  model: 'a/b',
  capabilities: { status: 'unknown', structuredOutputs: false, tools: false },
  apiUrl: 'https://openrouter.ai/api/v1',
};

describe('PatchGeneratorRouter', () => {
  it('routes generate and ping by provider', async () => {
    const a = fake();
    const o = fake();
    const router = new PatchGeneratorRouter({ anthropic: a, openrouter: o });
    await router.generate({ config: openrouter, context, prompt: 'x', mode: 'prompted' });
    await router.ping(anthropic);
    expect(o.generate).toHaveBeenCalledOnce();
    expect(a.generate).not.toHaveBeenCalled();
    expect(a.ping).toHaveBeenCalledOnce();
  });

  it('fails clearly when a provider has no generator', async () => {
    const result = await new PatchGeneratorRouter({ anthropic: fake() }).ping(openrouter);
    expect(!result.ok && result.error.message).toContain('no generator configured for openrouter');
  });

  it('parses both wire formats', () => {
    const router = new PatchGeneratorRouter({});
    const raw = { summary: 's', ops: [{ type: 'setStyle', target: 't0', styles: [{ property: 'color', value: 'red' }] }] };
    expect(router.parse(raw, 'openrouter')).toMatchObject({ ok: true, value: { ops: [{ styles: { color: 'red' } }] } });
  });
});
