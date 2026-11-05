export const PROVIDER_IDS = ['anthropic', 'openrouter', 'opencode', 'litellm'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** Providers reached through the OpenAI-compatible chat completions API. */
export const COMPATIBLE_PROVIDER_IDS = ['openrouter', 'opencode', 'litellm'] as const;
export type CompatibleProviderId = (typeof COMPATIBLE_PROVIDER_IDS)[number];

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
  opencode: 'OpenCode',
  litellm: 'LiteLLM',
};

export function isCompatibleProviderId(value: string): value is CompatibleProviderId {
  return (COMPATIBLE_PROVIDER_IDS as readonly string[]).includes(value);
}

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

/** Built-in Anthropic models, offered until the account's own list is loaded. */
export const ANTHROPIC_MODEL_IDS = ['claude-opus-5-5', 'claude-sonnet-5-5'] as const;
/** Any `claude-*` model the account lists; the built-in ones are defaults and suggestions. */
export type AnthropicModelId = string;
export const DEFAULT_ANTHROPIC_MODEL: AnthropicModelId = 'claude-opus-5-5';

export const ANTHROPIC_MODEL_LABELS: Readonly<Record<string, string>> = {
  'claude-opus-5-5': 'Claude Opus 5.5 (best quality)',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5 (faster)',
};

const ANTHROPIC_MODEL_ID = /^claude-[a-z0-9][a-z0-9.-]*$/;

export function isAnthropicModelId(value: string): value is AnthropicModelId {
  return ANTHROPIC_MODEL_ID.test(value);
}

/** OpenRouter model ids are `vendor/model`, optionally `~`-prefixed aliases or `:variant` suffixed. */
const OPENROUTER_MODEL_ID = /^~?[a-z0-9][\w.-]*\/[a-z0-9][\w.:-]*$/i;
export const DEFAULT_OPENROUTER_MODEL = 'z-ai/glm-5.3-flash';

export const OPENROUTER_MODEL_SUGGESTIONS: readonly { readonly id: string; readonly label: string }[] = [
  { id: 'z-ai/glm-5.3-flash', label: 'GLM 5.3 Flash (cheapest)' },
  { id: 'anthropic/claude-haiku-5.5', label: 'Claude Haiku 5.5' },
];

export function isOpenRouterModelId(value: string): boolean {
  return OPENROUTER_MODEL_ID.test(value);
}

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const OPENCODE_BASE_URL = 'https://opencode.ai/inference/openai/v1';
export const DEFAULT_LITELLM_BASE_URL = 'http://localhost:4000';

export interface ModelSuggestion {
  readonly id: string;
  readonly label: string;
}

/** What differs between the OpenAI-compatible providers; everything else is shared. */
export interface CompatibleProviderSpec {
  readonly defaultModel: string;
  readonly suggestions: readonly ModelSuggestion[];
  /** `false`: requests may go without a key (a LiteLLM proxy without auth). */
  readonly keyRequired: boolean;
  /** `true`: the user sets the base URL; otherwise it is fixed. */
  readonly baseUrlEditable: boolean;
  /** For LiteLLM, the default proxy origin (without `/v1`). */
  readonly defaultBaseUrl: string;
  readonly isModelId: (value: string) => boolean;
  readonly modelIdHint: string;
}

export const COMPATIBLE_PROVIDERS: Readonly<Record<CompatibleProviderId, CompatibleProviderSpec>> = {
  openrouter: {
    defaultModel: DEFAULT_OPENROUTER_MODEL,
    suggestions: OPENROUTER_MODEL_SUGGESTIONS,
    keyRequired: true,
    baseUrlEditable: false,
    defaultBaseUrl: OPENROUTER_BASE_URL,
    isModelId: isOpenRouterModelId,
    modelIdHint: 'Use the vendor/model format, e.g. z-ai/glm-5.3-flash.',
  },
  opencode: {
    defaultModel: 'glm-5.3-flash',
    suggestions: [
      { id: 'glm-5.3-flash', label: 'GLM 5.3 Flash' },
      { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5' },
      { id: 'deepseek-v4.1-flash', label: 'DeepSeek V4.1 Flash' },
    ],
    keyRequired: true,
    baseUrlEditable: false,
    defaultBaseUrl: OPENCODE_BASE_URL,
    isModelId: (value) => /^[a-z0-9][\w.:-]*$/i.test(value),
    modelIdHint: 'Use an OpenCode model ID, e.g. glm-5.3-flash.',
  },
  litellm: {
    defaultModel: '',
    suggestions: [],
    keyRequired: false,
    baseUrlEditable: true,
    defaultBaseUrl: DEFAULT_LITELLM_BASE_URL,
    isModelId: (value) => value.length > 0 && !/\s/.test(value),
    modelIdHint: 'Use the model name your LiteLLM proxy exposes, without spaces.',
  },
};

/**
 * `http(s)://host[:port][/path]` without a trailing `/` or `/v1`, or `null` when the value is not
 * an http(s) URL. Pure string handling, so the domain stays free of platform APIs.
 */
export function normalizeBaseUrl(raw: string): string | null {
  const value = raw.trim().replace(/\/+$/, '').replace(/\/v1$/i, '').replace(/\/+$/, '');
  return /^https?:\/\/[a-z0-9.-]+(?::\d{1,5})?(?:\/[\w.~%-]+)*$/i.test(value) ? value : null;
}

export const CONTEXT_PROFILES = ['standard', 'compact'] as const;
export type ContextProfile = (typeof CONTEXT_PROFILES)[number];

export function isContextProfile(value: string): value is ContextProfile {
  return (CONTEXT_PROFILES as readonly string[]).includes(value);
}
