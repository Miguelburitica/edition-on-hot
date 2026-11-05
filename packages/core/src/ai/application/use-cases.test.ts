import { describe, expect, it, vi } from 'vitest';
import { err, ok, type Result } from '../../shared/domain';
import {
  CatalogUnavailableError,
  CONTEXT_BUDGETS,
  InvalidProposalError,
  ProviderError,
  ProviderSettings,
  type GeneratorOutput,
  type ModelCatalog,
  type PatchGenerator,
  type ProposalDraft,
  type ProposalParser,
  type ProviderSettingsRepository,
} from '../domain';
import {
  ClearApiKey,
  GeneratePatch,
  GetContextBudget,
  LookupModel,
  SaveProviderSettings,
  TestProviderConnection,
} from './use-cases';

class MemorySettings implements ProviderSettingsRepository {
  constructor(public value = ProviderSettings.empty()) {}
  async load() {
    return this.value;
  }
  async save(s: ProviderSettings) {
    this.value = s;
  }
}

function settingsWith(build: (s: ProviderSettings) => Result<ProviderSettings, unknown>): MemorySettings {
  const result = build(ProviderSettings.empty());
  if (!result.ok) throw result.error;
  return new MemorySettings(result.value);
}

const anthropicKey = () => settingsWith((s) => s.update('anthropic', { apiKey: 'sk-ant-test-0000' }));
const openRouterKey = (structuredOutputs = true) =>
  settingsWith((s) => {
    const r = s.update('openrouter', {
      apiKey: 'sk-or-test-0000',
      capabilities: { status: 'found', structuredOutputs, tools: true },
    });
    return r.ok ? ok(r.value.activate('openrouter')) : r;
  });

/** Minimal strict parser: summary string, ops array, targets `tN`. */
const parser: ProposalParser = {
  parse(raw): Result<ProposalDraft, InvalidProposalError> {
    const value = raw as { summary?: unknown; ops?: unknown };
    if (typeof value !== 'object' || value === null || typeof value.summary !== 'string' || !Array.isArray(value.ops)) {
      return err(new InvalidProposalError(['(root): expected { summary, ops }']));
    }
    const bad = value.ops.findIndex((op: { target?: unknown; type?: unknown }) => op.type !== 'addCss' && !/^t\d+$/.test(String(op.target)));
    return bad === -1 ? ok(value as ProposalDraft) : err(new InvalidProposalError([`ops.${bad}.target: invalid`]));
  },
};

const request = {
  prompt: 'add a banner',
  context: { html: '<form data-hew-target="t0"></form>', ancestors: [], styles: {}, targetIds: ['t0'], pageUrl: '', pageTitle: '' },
};
const goodDraft = { summary: 'Adds banner', ops: [{ type: 'insert', target: 't0', position: 'before', html: '<p>!</p>' }] };
const output = (raw: unknown, costUsd?: number): Result<GeneratorOutput, ProviderError> =>
  ok({ raw, diagnostics: { latencyMs: 100, ...(costUsd !== undefined ? { costUsd } : {}) } });

function generator(...results: Result<GeneratorOutput, ProviderError>[]): PatchGenerator {
  const generate = vi.fn();
  for (const r of results) generate.mockResolvedValueOnce(r);
  return { generate, ping: vi.fn(async () => ok(undefined)) };
}

const catalog = (result: Awaited<ReturnType<ModelCatalog['lookup']>>): ModelCatalog => ({ lookup: vi.fn(async () => result) });

describe('GeneratePatch', () => {
  it('refuses to call the provider without a key', async () => {
    const gen = generator();
    const result = await new GeneratePatch(new MemorySettings(), gen, parser).execute(request);
    expect(!result.ok && result.error.code).toBe('missing-api-key');
    expect(gen.generate).not.toHaveBeenCalled();
  });

  it('returns a valid proposal with diagnostics', async () => {
    const result = await new GeneratePatch(anthropicKey(), generator(output(goodDraft)), parser).execute(request);
    expect(result.ok && result.value).toMatchObject({
      summary: 'Adds banner',
      contextTruncated: false,
      diagnostics: { provider: 'anthropic', mode: 'tool', attempts: 1, repairs: [], latencyMs: 100 },
    });
  });

  it('picks the output mode and budget from the active provider', async () => {
    const gen = generator(output(goodDraft, 0.0001));
    const big = { ...request, context: { ...request.context, html: `<p>${'x'.repeat(8000)}</p>` } };
    const result = await new GeneratePatch(openRouterKey(), gen, parser).execute(big);
    const call = vi.mocked(gen.generate).mock.calls[0]![0];
    expect(call.mode).toBe('json_schema');
    expect(call.context.props.html).toHaveLength(CONTEXT_BUDGETS.compact.maxHtmlChars);
    expect(result.ok && result.value.diagnostics).toMatchObject({ provider: 'openrouter', costUsd: 0.0001 });
    expect(result.ok && result.value.contextTruncated).toBe(true);
  });

  it('accepts fenced JSON without a retry and counts the repair', async () => {
    const gen = generator(output({ unparsedText: '```json\n' + JSON.stringify(goodDraft) + '\n```' }));
    const result = await new GeneratePatch(openRouterKey(false), gen, parser).execute(request);
    expect(gen.generate).toHaveBeenCalledTimes(1);
    expect(result.ok && result.value.diagnostics.repairs).toEqual(['extracted-json']);
  });

  it('repairs bare target numbers before validating targets', async () => {
    const raw = { summary: 's', ops: [{ type: 'remove', target: '0' }] };
    const result = await new GeneratePatch(anthropicKey(), generator(output(raw)), parser).execute(request);
    expect(result.ok && result.value.ops[0]).toMatchObject({ target: 't0' });
    expect(result.ok && result.value.diagnostics.repairs).toEqual(['normalized-target']);
  });

  it('retries once with the remaining issues when repair does not help', async () => {
    const gen = generator(output({ unparsedText: 'I am not sure.' }), output(goodDraft));
    const result = await new GeneratePatch(anthropicKey(), gen, parser).execute(request);
    expect(result.ok && result.value.diagnostics).toMatchObject({ attempts: 2, latencyMs: 200, repairs: [] });
    expect(vi.mocked(gen.generate).mock.calls[1]![0].previousIssues).toEqual(['(root): expected { summary, ops }']);
  });

  it('retries a reserved attribute with an explanation instead of failing', async () => {
    const reserved = { summary: 's', ops: [{ type: 'setAttr', target: 't0', name: 'data-hew-submit-hook', value: '1' }] };
    const gen = generator(output(reserved), output(goodDraft));
    const result = await new GeneratePatch(anthropicKey(), gen, parser).execute(request);
    expect(result.ok).toBe(true);
    expect(vi.mocked(gen.generate).mock.calls[1]![0].previousIssues![0]).toContain('reserved for the extension');
  });

  it('treats unknown targets as invalid output and retries', async () => {
    const gen = generator(output({ summary: 's', ops: [{ type: 'remove', target: 't7' }] }), output(goodDraft));
    expect((await new GeneratePatch(anthropicKey(), gen, parser).execute(request)).ok).toBe(true);
    expect(gen.generate).toHaveBeenCalledTimes(2);
  });

  it('fails with invalid-patch after the retry also fails, keeping diagnostics', async () => {
    const gen = generator(output({ unparsedText: 'a' }), output({ unparsedText: 'b' }));
    const result = await new GeneratePatch(anthropicKey(), gen, parser).execute(request);
    expect(!result.ok && result.error).toMatchObject({ code: 'invalid-patch', diagnostics: { attempts: 2 } });
  });

  it('does not retry provider failures', async () => {
    const gen = generator(err(new ProviderError('credits')));
    const result = await new GeneratePatch(openRouterKey(), gen, parser).execute(request);
    expect(!result.ok && result.error.code).toBe('provider-credits');
    expect(gen.generate).toHaveBeenCalledTimes(1);
  });
});

describe('settings use cases', () => {
  it('saves keys per provider, activates the saved one, and clears only the active key', async () => {
    const repo = new MemorySettings();
    const found = catalog(ok({ status: 'found', structuredOutputs: true, tools: true }));

    const a = await new SaveProviderSettings(repo, found).execute({ provider: 'anthropic', apiKey: 'sk-ant-abc-9999', model: 'claude-opus-5-5' });
    expect(a.ok && a.value).toMatchObject({ active: 'anthropic', anthropic: { maskedKey: 'sk-ant-…9999' } });

    const r = await new SaveProviderSettings(repo, found).execute({ provider: 'openrouter', apiKey: 'sk-or-xyz-8888', model: 'z-ai/glm-5.3-flash' });
    expect(r.ok && r.value).toMatchObject({
      active: 'openrouter',
      anthropic: { hasKey: true },
      openrouter: { hasKey: true, profile: 'compact', capabilities: { status: 'found', structuredOutputs: true } },
    });

    const switched = await new SaveProviderSettings(repo, found).execute({ provider: 'anthropic', model: 'claude-sonnet-5-5' });
    expect(switched.ok && switched.value).toMatchObject({ active: 'anthropic', anthropic: { hasKey: true, model: 'claude-sonnet-5-5' } });

    const cleared = await new ClearApiKey(repo).execute();
    expect(cleared).toMatchObject({ anthropic: { hasKey: false }, openrouter: { hasKey: true } });
    const test = await new TestProviderConnection(repo, generator()).execute();
    expect(!test.ok && test.error.code).toBe('missing-api-key');
  });

  it('rejects a malformed OpenRouter model id without saving', async () => {
    const repo = new MemorySettings();
    const result = await new SaveProviderSettings(repo, catalog(ok({ status: 'found', structuredOutputs: true, tools: true }))).execute({
      provider: 'openrouter',
      apiKey: 'sk-or-1',
      model: 'glm-flash',
    });
    expect(!result.ok && result.error.code).toBe('invalid-model');
    expect(repo.value.hasKey('openrouter')).toBe(false);
  });

  it('saves with unknown capabilities when the catalog is unreachable', async () => {
    const repo = new MemorySettings();
    const result = await new SaveProviderSettings(repo, catalog(err(new CatalogUnavailableError()))).execute({
      provider: 'openrouter',
      apiKey: 'sk-or-1',
      model: 'some-vendor/new-model',
    });
    expect(result.ok && result.value.openrouter.capabilities.status).toBe('unknown');
  });

  it('saves LiteLLM with a proxy URL and no key, looking the model up on that proxy', async () => {
    const repo = new MemorySettings();
    const found = catalog(ok({ status: 'found', structuredOutputs: false, tools: true }));
    const result = await new SaveProviderSettings(repo, found).execute({ provider: 'litellm', model: 'team-gpt', baseUrl: 'https://llm.example.com/' });
    expect(result.ok && result.value).toMatchObject({
      active: 'litellm',
      litellm: { hasKey: false, keyRequired: false, baseUrlEditable: true, baseUrl: 'https://llm.example.com', capabilities: { tools: true } },
    });
    expect(found.lookup).toHaveBeenCalledWith({ provider: 'litellm', model: 'team-gpt', apiUrl: 'https://llm.example.com/v1', apiKey: null });
    expect(repo.value.toConfig()).toMatchObject({ ok: true, value: { provider: 'litellm', apiKey: null } });
  });

  it('rejects LiteLLM without a model or with a bad URL, and keeps OpenCode on its fixed API', async () => {
    const none = catalog(err(new CatalogUnavailableError()));
    const noModel = await new SaveProviderSettings(new MemorySettings(), none).execute({ provider: 'litellm', model: ' ' });
    expect(!noModel.ok && noModel.error.code).toBe('missing-model');
    const badUrl = await new SaveProviderSettings(new MemorySettings(), none).execute({ provider: 'litellm', model: 'm', baseUrl: 'localhost' });
    expect(!badUrl.ok && badUrl.error.code).toBe('invalid-base-url');
    const found = catalog(ok({ status: 'found', structuredOutputs: true, tools: true }));
    const oc = await new SaveProviderSettings(new MemorySettings(), found).execute({ provider: 'opencode', apiKey: 'sk-oc-1', model: 'glm-5.3-flash' });
    expect(oc.ok && oc.value.opencode).toMatchObject({ keyRequired: true, baseUrlEditable: false, profile: 'compact' });
    expect(found.lookup).toHaveBeenCalledWith(expect.objectContaining({ provider: 'opencode', apiUrl: 'https://opencode.ai/inference/openai/v1' }));
  });

  it('LookupModel uses the URL being edited and the saved LiteLLM key', async () => {
    const repo = new MemorySettings();
    const saved = repo.value.update('litellm', { apiKey: 'sk-lite-1', model: 'm' });
    if (!saved.ok) throw saved.error;
    await repo.save(saved.value);
    const found = catalog(ok({ status: 'found', structuredOutputs: false, tools: false }));
    await new LookupModel(found, repo).execute({ provider: 'litellm', model: 'other', baseUrl: 'http://127.0.0.1:4001' });
    expect(found.lookup).toHaveBeenCalledWith({ provider: 'litellm', model: 'other', apiUrl: 'http://127.0.0.1:4001/v1', apiKey: 'sk-lite-1' });
    expect((await new LookupModel(found).execute({ provider: 'litellm', model: '' })).status).toBe('unknown');
  });

  it('rejects unknown providers', async () => {
    const result = await new SaveProviderSettings(new MemorySettings(), catalog(err(new CatalogUnavailableError()))).execute({
      provider: 'openai',
      model: 'x',
    });
    expect(!result.ok && result.error.code).toBe('unknown-provider');
  });

  it('LookupModel falls back to unknown and GetContextBudget follows the profile', async () => {
    expect((await new LookupModel(catalog(err(new CatalogUnavailableError()))).execute({ provider: 'openrouter', model: 'a/b' })).status).toBe('unknown');
    expect(await new GetContextBudget(openRouterKey()).execute()).toEqual(CONTEXT_BUDGETS.compact);
    expect(await new GetContextBudget(anthropicKey()).execute()).toEqual(CONTEXT_BUDGETS.standard);
  });
});
