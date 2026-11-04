/** What OpenRouter's catalog says about a model. `unknown` means the catalog could not be consulted. */
export interface ModelCapabilities {
  readonly status: 'found' | 'not-found' | 'unknown';
  readonly structuredOutputs: boolean;
  readonly tools: boolean;
  readonly contextLength?: number | undefined;
}

export const UNKNOWN_CAPABILITIES: ModelCapabilities = { status: 'unknown', structuredOutputs: false, tools: false };
export const NOT_FOUND_CAPABILITIES: ModelCapabilities = { status: 'not-found', structuredOutputs: false, tools: false };
