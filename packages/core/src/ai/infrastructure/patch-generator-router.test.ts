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

describe('prompt builder design system block', () => {
  it('adds the design system only when the context has one', async () => {
    const { buildUserMessage, buildSystemPrompt } = await import('./prompt-builder');
    const { EditContext } = await import('../domain');
    const base = { html: '<p data-hew-target="t0"></p>', ancestors: [], styles: {}, targetIds: ['t0'], pageUrl: 'u', pageTitle: 't' };
    expect(buildUserMessage(EditContext.create(base), 'x')).not.toContain('Design system');
    const withDs = buildUserMessage(EditContext.create({ ...base, designSystem: 'Colors: --brand #f00' }), 'x');
    expect(withDs).toContain('Design system (use these tokens and component classes):\nColors: --brand #f00');
    expect(buildSystemPrompt('json_schema', 'pairs')).toContain('var(--token)');
  });
});
