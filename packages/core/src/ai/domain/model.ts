export const PROVIDER_IDS = ['anthropic', 'openrouter'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  anthropic: 'Anthropic',
  openrouter: 'OpenRouter',
};

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

export const ANTHROPIC_MODEL_IDS = ['claude-opus-5-5', 'claude-sonnet-5-5'] as const;
export type AnthropicModelId = (typeof ANTHROPIC_MODEL_IDS)[number];
export const DEFAULT_ANTHROPIC_MODEL: AnthropicModelId = 'claude-opus-5-5';

export const ANTHROPIC_MODEL_LABELS: Record<AnthropicModelId, string> = {
  'claude-opus-5-5': 'Claude Opus 5.5 (best quality)',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5 (faster)',
};

export function isAnthropicModelId(value: string): value is AnthropicModelId {
  return (ANTHROPIC_MODEL_IDS as readonly string[]).includes(value);
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

export const CONTEXT_PROFILES = ['standard', 'compact'] as const;
export type ContextProfile = (typeof CONTEXT_PROFILES)[number];

export function isContextProfile(value: string): value is ContextProfile {
  return (CONTEXT_PROFILES as readonly string[]).includes(value);
}
