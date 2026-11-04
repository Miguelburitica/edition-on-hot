import { err, ok, type Result } from '../../shared/domain';
import { CONTEXT_BUDGETS, DEFAULT_CONTEXT_PROFILE, type ContextBudget } from './context-budget';
import {
  InvalidApiKeyFormatError,
  InvalidModelIdError,
  MissingApiKeyError,
  UnsupportedModelError,
} from './errors';
import {
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_OPENROUTER_MODEL,
  isAnthropicModelId,
  isOpenRouterModelId,
  PROVIDER_LABELS,
  type AnthropicModelId,
  type ContextProfile,
  type ProviderId,
} from './model';
import { UNKNOWN_CAPABILITIES, type ModelCapabilities } from './model-capabilities';

export interface AnthropicSlot {
  readonly apiKey: string | null;
  readonly model: AnthropicModelId;
  readonly profile: ContextProfile;
}

export interface OpenRouterSlot {
  readonly apiKey: string | null;
  readonly model: string;
  readonly profile: ContextProfile;
  readonly capabilities: ModelCapabilities;
}

export type ProviderConfig =
  | { readonly provider: 'anthropic'; readonly apiKey: string; readonly model: AnthropicModelId }
  | { readonly provider: 'openrouter'; readonly apiKey: string; readonly model: string; readonly capabilities: ModelCapabilities };

export interface SlotUpdate {
  /** `undefined` keeps the stored key; `null` clears it. */
  readonly apiKey?: string | null;
  readonly model?: string;
  readonly profile?: ContextProfile;
  readonly capabilities?: ModelCapabilities;
}

type SettingsError = InvalidApiKeyFormatError | InvalidModelIdError | UnsupportedModelError;

/** The user's bring-your-own-key settings: one slot per provider, one of them active. */
export class ProviderSettings {
  private constructor(
    readonly active: ProviderId,
    readonly anthropic: AnthropicSlot,
    readonly openrouter: OpenRouterSlot,
  ) {}

  static empty(): ProviderSettings {
    return new ProviderSettings(
      'anthropic',
      { apiKey: null, model: DEFAULT_ANTHROPIC_MODEL, profile: DEFAULT_CONTEXT_PROFILE.anthropic },
      {
        apiKey: null,
        model: DEFAULT_OPENROUTER_MODEL,
        profile: DEFAULT_CONTEXT_PROFILE.openrouter,
        capabilities: UNKNOWN_CAPABILITIES,
      },
    );
  }

  /** Rebuilds settings from stored values, validating every field. */
  static restore(props: {
    active: ProviderId;
    anthropic: SlotUpdate;
    openrouter: SlotUpdate;
  }): Result<ProviderSettings, SettingsError> {
    const withAnthropic = ProviderSettings.empty().update('anthropic', props.anthropic);
    if (!withAnthropic.ok) return withAnthropic;
    const withBoth = withAnthropic.value.update('openrouter', props.openrouter);
    if (!withBoth.ok) return withBoth;
    return ok(withBoth.value.activate(props.active));
  }

  /** Updates one provider's slot without touching the other provider's key. */
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
          this.openrouter,
        ),
      );
    }

    const model = (change.model ?? this.openrouter.model).trim();
    if (!isOpenRouterModelId(model)) return err(new InvalidModelIdError(model));
    const modelChanged = model !== this.openrouter.model;
    return ok(
      new ProviderSettings(this.active, this.anthropic, {
        apiKey,
        model,
        profile: change.profile ?? this.openrouter.profile,
        capabilities: change.capabilities ?? (modelChanged ? UNKNOWN_CAPABILITIES : this.openrouter.capabilities),
      }),
    );
  }

  activate(provider: ProviderId): ProviderSettings {
    return new ProviderSettings(provider, this.anthropic, this.openrouter);
  }

  withoutKey(provider: ProviderId = this.active): ProviderSettings {
    const cleared = this.update(provider, { apiKey: null });
    if (!cleared.ok) throw cleared.error; // a null key is always valid
    return cleared.value;
  }

  slot(provider: ProviderId): AnthropicSlot | OpenRouterSlot {
    return provider === 'anthropic' ? this.anthropic : this.openrouter;
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

  toConfig(): Result<ProviderConfig, MissingApiKeyError> {
    if (this.active === 'anthropic') {
      const { apiKey, model } = this.anthropic;
      return apiKey ? ok({ provider: 'anthropic', apiKey, model }) : err(new MissingApiKeyError(PROVIDER_LABELS.anthropic));
    }
    const { apiKey, model, capabilities } = this.openrouter;
    return apiKey
      ? ok({ provider: 'openrouter', apiKey, model, capabilities })
      : err(new MissingApiKeyError(PROVIDER_LABELS.openrouter));
  }
}

function normalizeKey(raw: string | null): string | null | InvalidApiKeyFormatError {
  if (raw === null) return null;
  const key = raw.trim();
  if (key === '' || /\s/.test(key)) return new InvalidApiKeyFormatError();
  return key;
}
