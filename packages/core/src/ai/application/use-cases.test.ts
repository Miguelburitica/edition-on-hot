import { describe, expect, it, vi } from 'vitest';
import { err, ok } from '../../shared/domain';
import {
  InvalidProposalError,
  ProviderError,
  ProviderSettings,
  type PatchGenerator,
  type ProviderSettingsRepository,
} from '../domain';
import { ClearApiKey, GeneratePatch, SaveProviderSettings, TestProviderConnection } from './use-cases';

class MemorySettings implements ProviderSettingsRepository {
  constructor(public value = ProviderSettings.empty()) {}
  async load() {
    return this.value;
  }
  async save(s: ProviderSettings) {
    this.value = s;
  }
}

const withKey = () => {
  const s = ProviderSettings.create({ apiKey: 'sk-ant-test-0000', model: 'claude-opus-5-5' });
  if (!s.ok) throw s.error;
  return new MemorySettings(s.value);
};

const request = {
  prompt: 'add a banner',
  context: { html: '<form data-hew-target="t0"></form>', ancestors: [], styles: {}, targetIds: ['t0'], pageUrl: '', pageTitle: '' },
};
const goodDraft = { summary: 'Adds banner', ops: [{ type: 'insert' as const, target: 't0', position: 'before' as const, html: '<p>!</p>' }] };

function generator(...results: Awaited<ReturnType<PatchGenerator['generate']>>[]): PatchGenerator {
  const generate = vi.fn();
  for (const r of results) generate.mockResolvedValueOnce(r);
  return { generate, ping: vi.fn(async () => ok(undefined)) };
}

describe('GeneratePatch', () => {
  it('refuses to call the provider without a key', async () => {
    const gen = generator();
    const result = await new GeneratePatch(new MemorySettings(), gen).execute(request);
    expect(!result.ok && result.error.code).toBe('missing-api-key');
    expect(gen.generate).not.toHaveBeenCalled();
  });

  it('returns a valid proposal', async () => {
    const result = await new GeneratePatch(withKey(), generator(ok(goodDraft))).execute(request);
    expect(result.ok && result.value).toMatchObject({ summary: 'Adds banner', contextTruncated: false });
  });

  it('retries once with the validation issues', async () => {
    const gen = generator(err(new InvalidProposalError(['ops[0].type is invalid'])), ok(goodDraft));
    const result = await new GeneratePatch(withKey(), gen).execute(request);
    expect(result.ok).toBe(true);
    expect(gen.generate).toHaveBeenCalledTimes(2);
    expect(vi.mocked(gen.generate).mock.calls[1]![0].previousIssues).toEqual(['ops[0].type is invalid']);
  });

  it('treats unknown targets as invalid output and retries', async () => {
    const bad = { summary: 's', ops: [{ type: 'remove' as const, target: 't7' }] };
    const gen = generator(ok(bad), ok(goodDraft));
    expect((await new GeneratePatch(withKey(), gen).execute(request)).ok).toBe(true);
  });

  it('fails with invalid-patch after the retry also fails', async () => {
    const gen = generator(err(new InvalidProposalError(['a'])), err(new InvalidProposalError(['b'])));
    const result = await new GeneratePatch(withKey(), gen).execute(request);
    expect(!result.ok && result.error.code).toBe('invalid-patch');
    expect(gen.generate).toHaveBeenCalledTimes(2);
  });

  it('does not retry provider failures', async () => {
    const gen = generator(err(new ProviderError('auth')));
    const result = await new GeneratePatch(withKey(), gen).execute(request);
    expect(!result.ok && result.error.code).toBe('provider-auth');
    expect(gen.generate).toHaveBeenCalledTimes(1);
  });
});

describe('settings use cases', () => {
  it('saves a key, keeps it when only the model changes, and clears it', async () => {
    const repo = new MemorySettings();
    const saved = await new SaveProviderSettings(repo).execute({ apiKey: 'sk-ant-abc-9999', model: 'claude-opus-5-5' });
    expect(saved.ok && saved.value.maskedKey).toBe('sk-ant-…9999');

    const switched = await new SaveProviderSettings(repo).execute({ model: 'claude-sonnet-5-5' });
    expect(switched.ok && switched.value).toMatchObject({ hasKey: true, model: 'claude-sonnet-5-5' });

    const cleared = await new ClearApiKey(repo).execute();
    expect(cleared.hasKey).toBe(false);
    const test = await new TestProviderConnection(repo, generator()).execute();
    expect(!test.ok && test.error.code).toBe('missing-api-key');
  });
});
