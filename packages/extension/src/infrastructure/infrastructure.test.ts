import { ok } from '@hew/core/shared/domain';
import { ProviderSettings } from '@hew/core/ai/domain';
import { describe, expect, it, vi } from 'vitest';
import { ChromeSettingsRepository, type StorageAreaLike } from './chrome-settings-repository';
import { EditorClient } from './editor-client';
import { editorCommand } from './messages';
import { bridgedPatchRequester, createHandler } from './runtime-bridge';

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
  it('round-trips settings and falls back to defaults on bad data', async () => {
    const storage = new FakeStorage();
    const repo = new ChromeSettingsRepository(storage);
    expect((await repo.load()).hasKey).toBe(false);

    const settings = ProviderSettings.create({ apiKey: 'sk-ant-abc-1234', model: 'claude-sonnet-5-5' });
    if (!settings.ok) throw settings.error;
    await repo.save(settings.value);
    const loaded = await repo.load();
    expect(loaded.apiKey).toBe('sk-ant-abc-1234');
    expect(loaded.model).toBe('claude-sonnet-5-5');

    storage.data['hew.providerSettings'] = { apiKey: 'x', model: 'not-a-model' };
    expect((await repo.load()).model).toBe('claude-opus-5-5');
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
    const reply = ok({ summary: 's', ops: [], contextTruncated: false });
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

describe('EditorClient', () => {
  it('reports not-connected when the tab has no content script', async () => {
    const client = new EditorClient(async () => {
      throw new Error('Could not establish connection');
    }, 1);
    const result = await client.send({ type: 'editing/getSnapshot' });
    expect(!result.ok && result.error.code).toBe('not-connected');
  });
});
