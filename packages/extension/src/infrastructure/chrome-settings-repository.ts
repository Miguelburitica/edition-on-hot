import {
  COMPATIBLE_PROVIDER_IDS,
  isContextProfile,
  isProviderId,
  ProviderSettings,
  UNKNOWN_CAPABILITIES,
  type ModelCapabilities,
  type ProviderId,
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
  baseUrl?: string;
}

const PROVIDERS = ['anthropic', ...COMPATIBLE_PROVIDER_IDS] as const;

/** v3 holds one slot per provider (Anthropic, OpenRouter, OpenCode, LiteLLM). */
type StoredSettingsV3 = { version: 3; active: string } & Partial<Record<ProviderId, StoredSlot>>;

/** v2 held Anthropic and OpenRouter. */
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
    if (isSlotted(stored)) return fromSlots(stored);
    if (isV1(stored)) return fromV1(stored) ?? ProviderSettings.empty();
    return ProviderSettings.empty();
  }

  async save(settings: ProviderSettings): Promise<void> {
    const value: StoredSettingsV3 = { version: 3, active: settings.active };
    for (const provider of PROVIDERS) value[provider] = { ...settings.slot(provider) };
    await this.storage.set({ [SETTINGS_KEY]: value });
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

function isSlotted(value: unknown): value is StoredSettingsV3 | StoredSettingsV2 {
  return isObject(value) && (value.version === 2 || value.version === 3);
}

function isV1(value: unknown): value is StoredSettingsV1 {
  return isObject(value) && !('version' in value) && typeof value.model === 'string';
}

function slot(stored: unknown): SlotUpdate | null {
  if (!isObject(stored)) return null;
  return {
    apiKey: typeof stored.apiKey === 'string' ? stored.apiKey : null,
    ...(typeof stored.model === 'string' ? { model: stored.model } : {}),
    ...(typeof stored.profile === 'string' && isContextProfile(stored.profile) ? { profile: stored.profile } : {}),
    ...(isObject(stored.capabilities) ? { capabilities: stored.capabilities as unknown as ModelCapabilities } : {}),
    ...(typeof stored.baseUrl === 'string' ? { baseUrl: stored.baseUrl } : {}),
  };
}

/** Restores each slot on its own: one invalid slot falls back to empty without losing the others' keys. */
function fromSlots(stored: StoredSettingsV3 | StoredSettingsV2): ProviderSettings {
  let settings = ProviderSettings.empty();
  for (const provider of PROVIDERS) {
    const update = slot((stored as Record<string, unknown>)[provider]);
    if (!update) continue;
    const withCapabilities = provider === 'anthropic' ? update : { capabilities: UNKNOWN_CAPABILITIES, ...update };
    const next = settings.update(provider, withCapabilities);
    if (next.ok) settings = next.value;
  }
  return settings.activate(isProviderId(stored.active) ? stored.active : 'anthropic');
}

function fromV1(stored: StoredSettingsV1): ProviderSettings | null {
  const migrated = ProviderSettings.empty().update('anthropic', {
    apiKey: typeof stored.apiKey === 'string' ? stored.apiKey : null,
    model: stored.model,
  });
  return migrated.ok ? migrated.value : null;
}
