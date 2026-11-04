import type { ModelCapabilities } from '@hew/core/ai/application';

export function CapabilityStatus({ capabilities }: { capabilities: ModelCapabilities }) {
  if (capabilities.status === 'unknown') {
    return (
      <span className="muted" data-testid="model-status">
        Capabilities unknown (the OpenRouter catalog could not be reached). Plain-text JSON output will be used.
      </span>
    );
  }
  if (capabilities.status === 'not-found') {
    return (
      <span className="error" data-testid="model-status">
        Not found in the OpenRouter catalog. You can still save it.
      </span>
    );
  }
  const features = [capabilities.structuredOutputs && 'structured outputs', capabilities.tools && 'tools'].filter(Boolean);
  return (
    <span className="success" data-testid="model-status">
      Found in the OpenRouter catalog · supports {features.length ? features.join(' and ') : 'neither structured outputs nor tools'}
    </span>
  );
}
