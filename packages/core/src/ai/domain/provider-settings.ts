import { err, ok, type Result } from '../../shared/domain';
import { CONTEXT_BUDGETS, DEFAULT_CONTEXT_PROFILE, type ContextBudget } from './context-budget';
import {
  InvalidApiKeyFormatError,
  InvalidBaseUrlError,
  InvalidModelIdError,
  MissingApiKeyError,
  MissingModelError,
  UnsupportedModelError,
} from './errors';
import {
  COMPATIBLE_PROVIDER_IDS,
  COMPATIBLE_PROVIDERS,
  DEFAULT_ANTHROPIC_MODEL,
  isAnthropicModelId,
  normalizeBaseUrl,
  PROVIDER_LABELS,
  type AnthropicModelId,
  type CompatibleProviderId,
  type ContextProfile,
  type ProviderId,
} from './model';
import { UNKNOWN_CAPABILITIES, type ModelCapabilities } from './model-capabilities';

export interface AnthropicSlot {
  readonly apiKey: string | null;
  readonly model: AnthropicModelId;
  readonly profile: ContextProfile;
}

/** A provider reached through the OpenAI-compatible chat completions API. */
export interface CompatibleSlot {
  readonly apiKey: string | null;
  readonly model: string;
  readonly profile: ContextProfile;
  readonly capabilities: ModelCapabilities;
  /** For LiteLLM, the proxy origin the user configured; fixed for the other providers. */
  readonly baseUrl: string;
}

export type ProviderConfig =
  | { readonly provider: 'anthropic'; readonly apiKey: string; readonly model: AnthropicModelId }
  | {
      readonly provider: CompatibleProviderId;
      /** `null` only for providers whose key is optional (LiteLLM). */
      readonly apiKey: string | null;
      readonly model: string;
      readonly capabilities: ModelCapabilities;
      /** The chat completions API root, e.g. `https://openrouter.ai/api/v1`. */
      readonly apiUrl: string;
    };

export interface SlotUpdate {
  /** `undefined` keeps the stored key; `null` clears it. */
  readonly apiKey?: string | null;
  readonly model?: string;
  readonly profile?: ContextProfile;
  readonly capabilities?: ModelCapabilities;
  /** Only used by providers with an editable base URL. */
  readonly baseUrl?: string;
}

type SettingsError = InvalidApiKeyFormatError | InvalidModelIdError | UnsupportedModelError | InvalidBaseUrlError;
type CompatibleSlots = Readonly<Record<CompatibleProviderId, CompatibleSlot>>;

/** The user's bring-your-own-key settings: one slot per provider, one of them active. */
export class ProviderSettings {
  private constructor(
    readonly active: ProviderId,
    readonly anthropic: AnthropicSlot,
    private readonly compatible: CompatibleSlots,
  ) {}

  static empty(): ProviderSettings {
    const compatible = Object.fromEntries(
      COMPATIBLE_PROVIDER_IDS.map((id) => [id, emptyCompatibleSlot(id)]),
    ) as Record<CompatibleProviderId, CompatibleSlot>;
    return new ProviderSettings(
      'anthropic',
      { apiKey: null, model: DEFAULT_ANTHROPIC_MODEL, profile: DEFAULT_CONTEXT_PROFILE.anthropic },
      compatible,
    );
  }

  /** Rebuilds settings from stored values, validating every field. Missing slots start empty. */
  static restore(
    props: { active: ProviderId } & Partial<Record<ProviderId, SlotUpdate>>,
  ): Result<ProviderSettings, SettingsError> {
    let settings = ProviderSettings.empty();
    for (const provider of ['anthropic', ...COMPATIBLE_PROVIDER_IDS] as const) {
      const change = props[provider];
      if (!change) continue;
      const next = settings.update(provider, change);
      if (!next.ok) return next;
      settings = next.value;
    }
    return ok(settings.activate(props.active));
  }

  get openrouter(): CompatibleSlot {
    return this.compatible.openrouter;
  }

  get opencode(): CompatibleSlot {
    return this.compatible.opencode;
  }

  get litellm(): CompatibleSlot {
    return this.compatible.litellm;
  }

  /** Updates one provider's slot without touching the other providers' keys. */
  update(provider: ProviderId, change: SlotUpdate): Result<ProviderSettings, SettingsError> {
    const apiKey = change.apiKey === undefined ? this.slot(provider).apiKey : normalizeKey(change.apiKey);
    if (apiKey instanceof InvalidApiKeyFormatError) return err(apiKey);

    if (provider === 'anthropic') {
      const model = change.model ?? this.anthropic.model;
      if (!isAnthropicModelId(model)) return err(new UnsupportedModelError(model));
      return ok(
        new ProviderSettings(
          this.active,
          { apiKey, model, profile: change.profile ?? this.anthropic.profile },
          this.compatible,
        ),
      );
    }

    const spec = COMPATIBLE_PROVIDERS[provider];
    const current = this.compatible[provider];
    const model = (change.model ?? current.model).trim();
    // An empty model is allowed only while unset (a fresh LiteLLM slot); saving one is rejected upstream.
    if (model !== '' && !spec.isModelId(model)) {
      return err(new InvalidModelIdError(model, spec.modelIdHint, PROVIDER_LABELS[provider]));
    }
    let baseUrl = current.baseUrl;
    if (spec.baseUrlEditable && change.baseUrl !== undefined) {
      const normalized = normalizeBaseUrl(change.baseUrl);
      if (!normalized) return err(new InvalidBaseUrlError(change.baseUrl));
      baseUrl = normalized;
    }
    const modelChanged = model !== current.model || baseUrl !== current.baseUrl;
    const slot: CompatibleSlot = {
      apiKey,
      model,
      profile: change.profile ?? current.profile,
      capabilities: change.capabilities ?? (modelChanged ? UNKNOWN_CAPABILITIES : current.capabilities),
      baseUrl,
    };
    return ok(new ProviderSettings(this.active, this.anthropic, { ...this.compatible, [provider]: slot }));
  }

  activate(provider: ProviderId): ProviderSettings {
    return new ProviderSettings(provider, this.anthropic, this.compatible);
  }

  withoutKey(provider: ProviderId = this.active): ProviderSettings {
    const cleared = this.update(provider, { apiKey: null });
    if (!cleared.ok) throw cleared.error; // a null key is always valid
    return cleared.value;
  }

  slot(provider: 'anthropic'): AnthropicSlot;
  slot(provider: CompatibleProviderId): CompatibleSlot;
  slot(provider: ProviderId): AnthropicSlot | CompatibleSlot;
  slot(provider: ProviderId): AnthropicSlot | CompatibleSlot {
    return provider === 'anthropic' ? this.anthropic : this.compatible[provider];
  }

  hasKey(provider: ProviderId = this.active): boolean {
    return this.slot(provider).apiKey !== null;
  }

  /** e.g. `sk-ant-…a1b2`; never exposes more than the last four characters. */
  maskedKey(provider: ProviderId = this.active): string | null {
    const key = this.slot(provider).apiKey;
    return key ? `${key.slice(0, 7)}…${key.slice(-4)}` : null;
  }

  budget(): ContextBudget {
    return CONTEXT_BUDGETS[this.slot(this.active).profile];
  }

  toConfig(): Result<ProviderConfig, MissingApiKeyError | MissingModelError> {
    const provider = this.active;
    const label = PROVIDER_LABELS[provider];
    if (provider === 'anthropic') {
      const { apiKey, model } = this.anthropic;
      return apiKey ? ok({ provider, apiKey, model }) : err(new MissingApiKeyError(label));
    }
    const spec = COMPATIBLE_PROVIDERS[provider];
    const { apiKey, model, capabilities } = this.compatible[provider];
    if (spec.keyRequired && !apiKey) return err(new MissingApiKeyError(label));
    if (model === '') return err(new MissingModelError(label));
    return ok({ provider, apiKey, model, capabilities, apiUrl: apiUrlOf(provider, this.compatible[provider].baseUrl) });
  }
}

/** The chat completions API root for a provider: LiteLLM serves it under `<proxy>/v1`. */
export function apiUrlOf(provider: CompatibleProviderId, baseUrl: string): string {
  return COMPATIBLE_PROVIDERS[provider].baseUrlEditable ? `${baseUrl}/v1` : baseUrl;
}

function emptyCompatibleSlot(provider: CompatibleProviderId): CompatibleSlot {
  const spec = COMPATIBLE_PROVIDERS[provider];
  return {
    apiKey: null,
    model: spec.defaultModel,
    profile: DEFAULT_CONTEXT_PROFILE[provider],
    capabilities: UNKNOWN_CAPABILITIES,
    baseUrl: spec.defaultBaseUrl,
  };
}

function normalizeKey(raw: string | null): string | null | InvalidApiKeyFormatError {
  if (raw === null) return null;
  const key = raw.trim();
  if (key === '' || /\s/.test(key)) return new InvalidApiKeyFormatError();
  return key;
}
