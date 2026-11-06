import { AlertIcon } from '../shared/Icons';

export interface ErrorView {
  readonly code: string;
  readonly message: string;
}

export type ErrorAction = 'settings' | 'model' | 'retry' | 'reselect';

interface Kind {
  readonly label: string;
  readonly hint?: string;
  readonly actions: readonly ErrorAction[];
}

const KINDS: Record<string, Kind> = {
  'missing-api-key': { label: 'No key', hint: 'It stays in this browser.', actions: ['settings'] },
  'invalid-api-key': { label: 'Key rejected', actions: ['settings'] },
  'provider-auth': { label: 'Key rejected', actions: ['settings'] },
  'missing-model': { label: 'No model', actions: ['model'] },
  'invalid-model': { label: 'Model unavailable', actions: ['model'] },
  'provider-model-access': { label: 'Model unavailable', actions: ['model'] },
  'provider-no-provider': { label: 'Model unavailable', actions: ['model'] },
  'provider-unavailable': { label: 'Model unavailable', actions: ['retry', 'model'] },
  'provider-output-limit': { label: 'Reply too large', hint: 'Compact context in Settings also helps small models.', actions: ['reselect'] },
  'provider-rate-limit': { label: 'Rate limit', actions: ['retry'] },
  'provider-credits': { label: 'Credits', hint: 'Nothing on the page changed.', actions: ['retry'] },
  'provider-network': { label: 'Network', actions: ['retry', 'settings'] },
  'provider-timeout': { label: 'Timeout', hint: 'Pick a faster model in Settings for quick iterations.', actions: ['retry', 'settings'] },
  'provider-moderation': { label: 'Content policy', hint: 'Rephrase the request and try again.', actions: [] },
  'provider-refusal': { label: 'Declined', hint: 'Rephrase the request and try again.', actions: [] },
  'invalid-patch': { label: 'Invalid change', hint: 'Try again, or rephrase the request more concretely.', actions: ['retry'] },
};

const LABELS: Record<ErrorAction, string> = {
  settings: 'Open Settings',
  model: 'Choose a model',
  retry: 'Try again',
  reselect: 'Select a smaller element',
};

/** "Message (provider's own words)" → the message, and the provider's words shown apart. */
export function splitDetail(message: string): { title: string; said: string | null } {
  const match = /^([\s\S]*?)\s*(\([^()]*\))$/.exec(message.trim());
  return match && match[1] ? { title: match[1], said: match[2]! } : { title: message, said: null };
}

/** What went wrong, then what to do: shown below the prompt. */
export function ErrorCard({ error, onAction }: { error: ErrorView; onAction: (action: ErrorAction) => void }) {
  const kind = KINDS[error.code] ?? { label: 'Something went wrong', actions: ['retry'] as const };
  const { title, said } = splitDetail(error.message);
  return (
    <div className="err" role="alert" data-code={error.code}>
      <span className="kind">
        <AlertIcon />
        {kind.label}
      </span>
      <h3>{title}</h3>
      {kind.hint && <p>{kind.hint}</p>}
      {said && <div className="said">{said}</div>}
      {kind.actions.length > 0 && (
        <div className="hstack" style={{ paddingTop: 2 }}>
          {kind.actions.map((action, i) => (
            <button key={action} className={i === 0 ? 'btn' : 'btn ghost'} onClick={() => onAction(action)}>
              {LABELS[action]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
