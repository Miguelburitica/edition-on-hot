import type { ProviderConfig } from './provider-settings';

/**
 * How the model is asked for a patch:
 * - `json_schema`: strict JSON-schema response (most reliable where supported)
 * - `tool`: a single function/tool call
 * - `prompted`: a JSON object written in plain text, parsed and repaired on our side
 */
export type OutputMode = 'json_schema' | 'tool' | 'prompted';

export function chooseOutputMode(config: ProviderConfig): OutputMode {
  if (config.provider === 'anthropic') return 'tool';
  if (config.capabilities.structuredOutputs) return 'json_schema';
  if (config.capabilities.tools) return 'tool';
  return 'prompted';
}
