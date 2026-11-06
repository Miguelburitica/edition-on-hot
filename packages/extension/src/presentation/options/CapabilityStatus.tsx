import type { ModelCapabilities } from '@hew/core/ai/application';
import { CheckIcon, InfoIcon } from '../shared/Icons';

/** `source` names where capabilities come from, e.g. "OpenRouter catalog" or "LiteLLM proxy". */
export function CapabilityStatus({ capabilities, source }: { capabilities: ModelCapabilities; source: string }) {
  if (capabilities.status === 'unknown') {
    return (
      <div className="callout" data-testid="model-status">
        <InfoIcon style={{ color: 'var(--warn)' }} />
        <span>Capabilities unknown (the {source} could not be reached). Plain-text JSON output will be used — saving is still allowed.</span>
      </div>
    );
  }
  if (capabilities.status === 'not-found') {
    return (
      <div className="callout" data-testid="model-status">
        <InfoIcon style={{ color: 'var(--warn)' }} />
        <span>Not found in the {source}. You can still save it.</span>
      </div>
    );
  }
  const features = [capabilities.structuredOutputs && 'structured outputs', capabilities.tools && 'tools'].filter(Boolean);
  return (
    <span className="status-line" data-testid="model-status" style={{ fontSize: 12.5, color: 'var(--ok)' }}>
      <CheckIcon />
      <span style={{ color: 'var(--ink2)' }}>
        Found in the {source} ·{' '}
        {features.length ? `supports ${features.join(' and ')}` : 'no details on structured outputs or tools, plain-text JSON output will be used'}
      </span>
    </span>
  );
}
