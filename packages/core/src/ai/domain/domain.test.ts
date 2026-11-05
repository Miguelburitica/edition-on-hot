import { describe, expect, it } from 'vitest';
import { CONTEXT_BUDGETS } from './context-budget';
import { EditContext } from './edit-context';
import { isOpenRouterModelId } from './model';
import { chooseOutputMode } from './output-mode';
import { PatchProposal } from './patch-proposal';
import { ProviderSettings, type ProviderConfig } from './provider-settings';

const baseContext = { ancestors: [], styles: {}, targetIds: ['t0', 't1'], pageUrl: 'http://x', pageTitle: 'X' };

function settings(build: (s: ProviderSettings) => ReturnType<ProviderSettings['update']>) {
  const result = build(ProviderSettings.empty());
  if (!result.ok) throw result.error;
  return result.value;
}

function withKeys(): ProviderSettings {
  const anthropic = settings((e) => e.update('anthropic', { apiKey: 'sk-ant-aaaa-1111' }));
  return settings(() => anthropic.update('openrouter', { apiKey: 'sk-or-bbbb-2222' }));
}

describe('EditContext', () => {
  it('truncates large HTML to the budget and marks it truncated', () => {
    const ctx = EditContext.create({ ...baseContext, html: `<div>${'a'.repeat(50)}</div>` }, { maxHtmlChars: 20, maxTargets: 40 });
    expect(ctx.props.html).toHaveLength(20);
    expect(ctx.truncated).toBe(true);
  });

  it('keeps small HTML intact and caps target ids', () => {
    const ctx = EditContext.create({ ...baseContext, html: '<p>hi</p>', targetIds: ['t0', 't1', 't2'] }, { maxHtmlChars: 100, maxTargets: 2 });
    expect(ctx.truncated).toBe(false);
    expect(ctx.props.targetIds).toEqual(['t0', 't1']);
  });

  it('removes input value attributes', () => {
    const ctx = EditContext.create({ ...baseContext, html: `<input name="e" value="me@x.com"><input value='y' type="text">` });
    expect(ctx.props.html).toBe('<input name="e"><input type="text">');
  });
});

describe('PatchProposal', () => {
  const ctx = EditContext.create({ ...baseContext, html: '<form></form>' });

  it('accepts ops that target known ids', () => {
    const result = PatchProposal.fromDraft({ summary: 'ok', ops: [{ type: 'remove', target: 't1' }, { type: 'addCss', css: 'a{}' }] }, ctx);
    expect(result.ok).toBe(true);
  });

  it('rejects unknown targets and empty op lists', () => {
    const unknown = PatchProposal.fromDraft({ summary: 'x', ops: [{ type: 'remove', target: 't9' }] }, ctx);
    expect(!unknown.ok && unknown.error.issues[0]).toContain('t9');
    expect(PatchProposal.fromDraft({ summary: 'x', ops: [] }, ctx).ok).toBe(false);
  });
});

describe('PatchProposal unsafe-op policy', () => {
  const ctx = EditContext.create({ ...baseContext, html: '<form></form>' });
  const issuesFor = (op: Parameters<typeof PatchProposal.fromDraft>[0]['ops'][number]) => {
    const result = PatchProposal.fromDraft({ summary: 's', ops: [op] }, ctx);
    return result.ok ? [] : result.error.issues;
  };

  it('turns reserved data-hew attributes into an explanatory issue', () => {
    expect(issuesFor({ type: 'setAttr', target: 't0', name: 'data-hew-submit-hook', value: 'x' })[0]).toContain(
      'data-hew-* attributes are reserved for the extension',
    );
  });

  it('rejects event handlers, javascript: URLs and invalid CSS property names', () => {
    expect(issuesFor({ type: 'setAttr', target: 't0', name: 'onClick', value: 'x()' })[0]).toContain('event handler');
    expect(issuesFor({ type: 'setAttr', target: 't0', name: 'href', value: ' JavaScript:x()' })[0]).toContain('javascript:');
    expect(issuesFor({ type: 'setStyle', target: 't0', styles: { 'color;': 'red' } })[0]).toContain('"color;"');
  });

  it('explains op types used as attributes and target ids used in stylesheet rules', () => {
    expect(issuesFor({ type: 'setAttr', target: 't0', name: 'addCss', value: 'addCss' })[0]).toContain('that is an operation type');
    expect(issuesFor({ type: 'addCss', css: 't2 li { color: red; }' })[0]).toContain('use :scope for t0');
    expect(issuesFor({ type: 'addCss', css: '[data-hew-target="t1"] { color: red; }' })[0]).toContain('do not exist on the page');
    expect(issuesFor({ type: 'addCss', css: ':scope > li, .t1 { color: red; }' })).toEqual([]);
  });

  it('accepts ordinary attributes and styles', () => {
    expect(issuesFor({ type: 'setAttr', target: 't0', name: 'data-state', value: 'open' })).toEqual([]);
    expect(issuesFor({ type: 'setStyle', target: 't0', styles: { 'background-color': 'red', '--x': '1' } })).toEqual([]);
  });
});

describe('OpenRouter model ids', () => {
  it.each(['z-ai/glm-5.3-flash', 'anthropic/claude-haiku-5.5', '~z-ai/glm-flash-latest', 'z-ai/glm-5.3-flash:batch'])('accepts %s', (id) => {
    expect(isOpenRouterModelId(id)).toBe(true);
  });

  it.each(['glm-5.3-flash', 'z-ai/', '/model', 'a b/c', ''])('rejects %j', (id) => {
    expect(isOpenRouterModelId(id)).toBe(false);
  });
});

describe('ProviderSettings', () => {
  it('defaults to Anthropic Opus 5.5 and OpenRouter GLM 5.3 Flash, with no keys', () => {
    const s = ProviderSettings.empty();
    expect(s.active).toBe('anthropic');
    expect(s.anthropic.model).toBe('claude-opus-5-5');
    expect(s.openrouter.model).toBe('z-ai/glm-5.3-flash');
    expect(s.toConfig().ok).toBe(false);
  });

  it('keeps keys per provider when switching', () => {
    const s = withKeys();
    const onRouter = s.activate('openrouter');
    const backOnAnthropic = onRouter.activate('anthropic');
    expect(onRouter.toConfig()).toMatchObject({ ok: true, value: { provider: 'openrouter', apiKey: 'sk-or-bbbb-2222' } });
    expect(backOnAnthropic.toConfig()).toMatchObject({ ok: true, value: { provider: 'anthropic', apiKey: 'sk-ant-aaaa-1111' } });
  });

  it('refuses when only the other provider has a key', () => {
    const s = settings((e) => e.update('anthropic', { apiKey: 'sk-ant-aaaa-1111' })).activate('openrouter');
    const config = s.toConfig();
    expect(!config.ok && config.error.message).toContain('OpenRouter API key');
  });

  it('clears only the chosen provider key', () => {
    const cleared = withKeys().activate('openrouter').withoutKey();
    expect(cleared.hasKey('openrouter')).toBe(false);
    expect(cleared.hasKey('anthropic')).toBe(true);
  });

  it('masks keys', () => {
    const s = settings((e) => e.update('anthropic', { apiKey: ' sk-ant-api03-abcdefghijk1234 ' }));
    expect(s.maskedKey('anthropic')).toBe('sk-ant-…1234');
  });

  it('validates models per provider', () => {
    expect(ProviderSettings.empty().update('anthropic', { model: 'gpt-x' }).ok).toBe(false);
    const bad = ProviderSettings.empty().update('openrouter', { model: 'glm-flash' });
    expect(!bad.ok && bad.error.code).toBe('invalid-model');
    expect(ProviderSettings.empty().update('openrouter', { model: 'anthropic/claude-haiku-5.5' }).ok).toBe(true);
    expect(ProviderSettings.empty().update('anthropic', { apiKey: 'a b' }).ok).toBe(false);
  });

  it('uses compact for OpenRouter and standard for Anthropic unless overridden', () => {
    const s = ProviderSettings.empty();
    expect(s.budget()).toEqual(CONTEXT_BUDGETS.standard);
    expect(s.activate('openrouter').budget()).toEqual(CONTEXT_BUDGETS.compact);
    const overridden = s.update('openrouter', { profile: 'standard' });
    expect(overridden.ok && overridden.value.activate('openrouter').budget()).toEqual(CONTEXT_BUDGETS.standard);
  });

  it('forgets capabilities when the OpenRouter model changes', () => {
    const s = settings((e) =>
      e.update('openrouter', { capabilities: { status: 'found', structuredOutputs: true, tools: true } }),
    );
    expect(s.openrouter.capabilities.status).toBe('found');
    const changed = s.update('openrouter', { model: 'anthropic/claude-haiku-5.5' });
    expect(changed.ok && changed.value.openrouter.capabilities.status).toBe('unknown');
  });
});

describe('chooseOutputMode', () => {
  const router = (structuredOutputs: boolean, tools: boolean): ProviderConfig => ({
    provider: 'openrouter',
    apiKey: 'k',
    model: 'a/b',
    capabilities: { status: 'found', structuredOutputs, tools },
  });

  it('uses tools for Anthropic', () => {
    expect(chooseOutputMode({ provider: 'anthropic', apiKey: 'k', model: 'claude-opus-5-5' })).toBe('tool');
  });

  it('prefers structured outputs, then tools, then prompted JSON', () => {
    expect(chooseOutputMode(router(true, true))).toBe('json_schema');
    expect(chooseOutputMode(router(false, true))).toBe('tool');
    expect(chooseOutputMode(router(false, false))).toBe('prompted');
  });
});
