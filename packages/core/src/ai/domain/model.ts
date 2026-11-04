export const MODEL_IDS = ['claude-opus-5-5', 'claude-sonnet-5-5'] as const;
export type ModelId = (typeof MODEL_IDS)[number];
export const DEFAULT_MODEL: ModelId = 'claude-opus-5-5';

export const MODEL_LABELS: Record<ModelId, string> = {
  'claude-opus-5-5': 'Claude Opus 5.5 (best quality)',
  'claude-sonnet-5-5': 'Claude Sonnet 5.5 (faster)',
};

export function isModelId(value: string): value is ModelId {
  return (MODEL_IDS as readonly string[]).includes(value);
}
