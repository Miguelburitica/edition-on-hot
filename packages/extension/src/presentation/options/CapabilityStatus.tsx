import type { ModelCapabilities } from '@hew/core/ai/application';

/** `source` names where capabilities come from, e.g. "OpenRouter catalog" or "LiteLLM proxy". */
export function CapabilityStatus({ capabilities, source }: { capabilities: ModelCapabilities; source: string }) {
  if (capabilities.status === 'unknown') {
    return (
      <span className="muted" data-testid="model-status">
        Capabilities unknown (the {source} could not be reached). Plain-text JSON output will be used.
      </span>
    );
  }
  if (capabilities.status === 'not-found') {
    return (
      <span className="error" data-testid="model-status">
        Not found in the {source}. You can still save it.
      </span>
    );
  }
  const features = [capabilities.structuredOutputs && 'structured outputs', capabilities.tools && 'tools'].filter(Boolean);
  return (
    <span className="success" data-testid="model-status">
      Found in the {source} ·{' '}
      {features.length ? `supports ${features.join(' and ')}` : 'no details on structured outputs or tools, plain-text JSON output will be used'}
    </span>
  );
}
