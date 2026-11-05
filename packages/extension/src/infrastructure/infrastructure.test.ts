import { ok } from '@hew/core/shared/domain';
import { ProviderSettings } from '@hew/core/ai/domain';
import { describe, expect, it, vi } from 'vitest';
import { ChromeSettingsRepository, SETTINGS_KEY, type StorageAreaLike } from './chrome-settings-repository';
import { EditorClient } from './editor-client';
import { editorCommand } from './messages';
import { bridgedBudgetRequester, bridgedPatchRequester, createHandler } from './runtime-bridge';

class FakeStorage implements StorageAreaLike {
  data: Record<string, unknown> = {};
  async get(key: string) {
    return key in this.data ? { [key]: this.data[key] } : {};
  }
  async set(items: Record<string, unknown>) {
    Object.assign(this.data, structuredClone(items));
  }
}

describe('ChromeSettingsRepository', () => {
  it('round-trips v2 settings with both providers', async () => {
    const storage = new FakeStorage();
    const repo = new ChromeSettingsRepository(storage);
    expect((await repo.load()).hasKey()).toBe(false);

    const a = ProviderSettings.empty().update('anthropic', { apiKey: 'sk-ant-abc-1234', model: 'claude-sonnet-5-5' });
    if (!a.ok) throw a.error;
    const both = a.value.update('openrouter', {
      apiKey: 'sk-or-xyz-5678',
      model: 'anthropic/claude-haiku-5.5',
      profile: 'standard',
      capabilities: { status: 'found', structuredOutputs: true, tools: true },
    });
    if (!both.ok) throw both.error;
    await repo.save(both.value.activate('openrouter'));

    expect(storage.data[SETTINGS_KEY]).toMatchObject({ version: 2, active: 'openrouter' });
    const loaded = await repo.load();
    expect(loaded.active).toBe('openrouter');
    expect(loaded.anthropic).toMatchObject({ apiKey: 'sk-ant-abc-1234', model: 'claude-sonnet-5-5' });
    expect(loaded.openrouter).toMatchObject({
      apiKey: 'sk-or-xyz-5678',
      model: 'anthropic/claude-haiku-5.5',
      profile: 'standard',
      capabilities: { status: 'found', structuredOutputs: true },
    });
  });

  it('upgrades phase 1 settings to an active Anthropic slot', async () => {
    const storage = new FakeStorage();
    storage.data[SETTINGS_KEY] = { apiKey: 'sk-ant-old-0001', model: 'claude-sonnet-5-5' };
    const loaded = await new ChromeSettingsRepository(storage).load();
    expect(loaded.active).toBe('anthropic');
    expect(loaded.anthropic).toMatchObject({ apiKey: 'sk-ant-old-0001', model: 'claude-sonnet-5-5' });
    expect(loaded.hasKey('openrouter')).toBe(false);
  });

  it('falls back to defaults on invalid data', async () => {
    const storage = new FakeStorage();
    const repo = new ChromeSettingsRepository(storage);
    storage.data[SETTINGS_KEY] = { apiKey: 'x', model: 'not-a-model' };
    expect((await repo.load()).anthropic.model).toBe('claude-opus-5-5');
    storage.data[SETTINGS_KEY] = { version: 2, active: 'openrouter', anthropic: { model: 'claude-opus-5-5' }, openrouter: { model: 'no slash' } };
    expect((await repo.load()).active).toBe('anthropic');
  });
});

describe('editorCommand', () => {
  it('accepts goToVersion with a whole, non-negative version only', () => {
    expect(editorCommand.safeParse({ type: 'editing/goToVersion', version: 2 }).success).toBe(true);
    expect(editorCommand.safeParse({ type: 'editing/goToVersion', version: -1 }).success).toBe(false);
    expect(editorCommand.safeParse({ type: 'editing/goToVersion', version: 1.5 }).success).toBe(false);
    expect(editorCommand.safeParse({ type: 'editing/goToVersion' }).success).toBe(false);
  });
});

describe('createHandler', () => {
  it('answers matching messages asynchronously and ignores others', async () => {
    const handle = vi.fn(async () => 'done');
    const listener = createHandler(editorCommand, handle, 'ext-id');
    const sendResponse = vi.fn();

    expect(listener({ type: 'unknown' }, { id: 'ext-id' }, sendResponse)).toBe(false);
    expect(listener({ type: 'editing/undo' }, { id: 'other-ext' }, sendResponse)).toBe(false);
    expect(listener({ type: 'editing/undo' }, { id: 'ext-id' }, sendResponse)).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith('done'));
  });

  it('turns handler exceptions into error results', async () => {
    const listener = createHandler(editorCommand, async () => {
      throw new Error('boom');
    });
    const sendResponse = vi.fn();
    listener({ type: 'editing/redo' }, {}, sendResponse);
    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledWith({ ok: false, error: { code: 'extension-error', message: 'boom' } }),
    );
  });
});

describe('bridgedPatchRequester', () => {
  const request = {
    prompt: 'x',
    context: { html: '<p></p>', ancestors: [], styles: {}, targetIds: ['t0'], pageUrl: '', pageTitle: '' },
  };

  it('forwards the request to the background and returns its reply', async () => {
    const reply = ok({ summary: 's', ops: [], contextTruncated: false, diagnostics: { provider: 'anthropic' as const, model: 'm', mode: 'tool' as const, attempts: 1, repairs: [], latencyMs: 1 } });
    const send = vi.fn(async () => reply);
    expect(await bridgedPatchRequester(send)(request)).toBe(reply);
    expect(send).toHaveBeenCalledWith({ type: 'ai/generatePatch', request });
  });

  it('reports a missing background as an error', async () => {
    const result = await bridgedPatchRequester(async () => {
      throw new Error('Receiving end does not exist.');
    })(request);
    expect(!result.ok && result.error.code).toBe('extension-error');
  });
});

describe('bridgedBudgetRequester', () => {
  it('asks the background for the budget and reports a missing background', async () => {
    const send = vi.fn(async () => ok({ maxHtmlChars: 6000, maxTargets: 20 }));
    expect(await bridgedBudgetRequester(send)()).toEqual(ok({ maxHtmlChars: 6000, maxTargets: 20 }));
    expect(send).toHaveBeenCalledWith({ type: 'ai/getContextBudget' });
    const gone = await bridgedBudgetRequester(async () => undefined)();
    expect(!gone.ok && gone.error.code).toBe('extension-error');
  });
});

describe('EditorClient', () => {
  it('reports not-connected when the tab has no content script', async () => {
    const client = new EditorClient(async () => {
      throw new Error('Could not establish connection');
    }, 1);
    const result = await client.send({ type: 'editing/getSnapshot' });
    expect(!result.ok && result.error.code).toBe('not-connected');
  });
});
