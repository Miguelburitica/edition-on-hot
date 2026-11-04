import {
  isContextProfile,
  isProviderId,
  ProviderSettings,
  UNKNOWN_CAPABILITIES,
  type ModelCapabilities,
  type ProviderSettingsRepository,
  type SlotUpdate,
} from '@hew/core/ai/domain';

export interface StorageAreaLike {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export const SETTINGS_KEY = 'hew.providerSettings';

interface StoredSlot {
  apiKey: string | null;
  model: string;
  profile: string;
  capabilities?: ModelCapabilities;
}

interface StoredSettingsV2 {
  version: 2;
  active: string;
  anthropic: StoredSlot;
  openrouter: StoredSlot;
}

/** Phase 1 stored a single Anthropic key and model. */
interface StoredSettingsV1 {
  apiKey: string | null;
  model: string;
}

/** Stores provider settings in extension-local storage, which web pages cannot read. */
export class ChromeSettingsRepository implements ProviderSettingsRepository {
  constructor(private readonly storage: StorageAreaLike) {}

  async load(): Promise<ProviderSettings> {
    const stored = (await this.storage.get(SETTINGS_KEY))[SETTINGS_KEY];
    const restored = isV2(stored) ? fromV2(stored) : isV1(stored) ? fromV1(stored) : null;
    return restored ?? ProviderSettings.empty();
  }

  async save(settings: ProviderSettings): Promise<void> {
    const value: StoredSettingsV2 = {
      version: 2,
      active: settings.active,
      anthropic: { ...settings.anthropic },
      openrouter: { ...settings.openrouter },
    };
    await this.storage.set({ [SETTINGS_KEY]: value });
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function isV2(value: unknown): value is StoredSettingsV2 {
  return isObject(value) && value.version === 2 && isObject(value.anthropic) && isObject(value.openrouter);
}

function isV1(value: unknown): value is StoredSettingsV1 {
  return isObject(value) && !('version' in value) && typeof value.model === 'string';
}

function slot(stored: StoredSlot): SlotUpdate {
  return {
    apiKey: typeof stored.apiKey === 'string' ? stored.apiKey : null,
    model: stored.model,
    ...(typeof stored.profile === 'string' && isContextProfile(stored.profile) ? { profile: stored.profile } : {}),
    ...(isObject(stored.capabilities) ? { capabilities: stored.capabilities } : {}),
  };
}

function fromV2(stored: StoredSettingsV2): ProviderSettings | null {
  const restored = ProviderSettings.restore({
    active: isProviderId(stored.active) ? stored.active : 'anthropic',
    anthropic: slot(stored.anthropic),
    openrouter: { capabilities: UNKNOWN_CAPABILITIES, ...slot(stored.openrouter) },
  });
  return restored.ok ? restored.value : null;
}

function fromV1(stored: StoredSettingsV1): ProviderSettings | null {
  const migrated = ProviderSettings.empty().update('anthropic', {
    apiKey: typeof stored.apiKey === 'string' ? stored.apiKey : null,
    model: stored.model,
  });
  return migrated.ok ? migrated.value : null;
}
