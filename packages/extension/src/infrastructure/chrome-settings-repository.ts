import { ProviderSettings, type ProviderSettingsRepository } from '@hew/core/ai/domain';

export interface StorageAreaLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const KEY = 'hew.providerSettings';

interface StoredSettings {
  apiKey: string | null;
  model: string;
}

/** Stores provider settings in extension-local storage, which web pages cannot read. */
export class ChromeSettingsRepository implements ProviderSettingsRepository {
  constructor(private readonly storage: StorageAreaLike) {}

  async load(): Promise<ProviderSettings> {
    const stored = (await this.storage.get(KEY))[KEY] as Partial<StoredSettings> | undefined;
    if (!stored || typeof stored.model !== 'string') return ProviderSettings.empty();
    const settings = ProviderSettings.create({
      apiKey: typeof stored.apiKey === 'string' ? stored.apiKey : null,
      model: stored.model,
    });
    return settings.ok ? settings.value : ProviderSettings.empty();
  }

  async save(settings: ProviderSettings): Promise<void> {
    const value: StoredSettings = { apiKey: settings.apiKey, model: settings.model };
    await this.storage.set({ [KEY]: value });
  }
}
