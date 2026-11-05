import type { ContextProfile, ProviderId } from './model';

/** How much of the selection the model is shown. Smaller budgets keep small models focused. */
export interface ContextBudget {
  readonly maxHtmlChars: number;
  readonly maxTargets: number;
  /** Characters of design system guidance sent with each request. */
  readonly maxDesignChars: number;
}

export const CONTEXT_BUDGETS: Readonly<Record<ContextProfile, ContextBudget>> = {
  standard: { maxHtmlChars: 12_000, maxTargets: 40, maxDesignChars: 4_000 },
  compact: { maxHtmlChars: 6_000, maxTargets: 20, maxDesignChars: 1_500 },
};

export const DEFAULT_CONTEXT_PROFILE: Readonly<Record<ProviderId, ContextProfile>> = {
  anthropic: 'standard',
  openrouter: 'compact',
  opencode: 'compact',
  litellm: 'standard',
};
