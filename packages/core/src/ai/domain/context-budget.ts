import type { ContextProfile, ProviderId } from './model';

/** How much of the selection the model is shown. Smaller budgets keep small models focused. */
export interface ContextBudget {
  readonly maxHtmlChars: number;
  readonly maxTargets: number;
}

export const CONTEXT_BUDGETS: Readonly<Record<ContextProfile, ContextBudget>> = {
  standard: { maxHtmlChars: 12_000, maxTargets: 40 },
  compact: { maxHtmlChars: 6_000, maxTargets: 20 },
};

export const DEFAULT_CONTEXT_PROFILE: Readonly<Record<ProviderId, ContextProfile>> = {
  anthropic: 'standard',
  openrouter: 'compact',
};
