import { DomainError } from '../../shared/domain';

export class MissingApiKeyError extends DomainError {
  readonly code = 'missing-api-key';
  constructor() {
    super('Add your Anthropic API key in settings before requesting changes.');
  }
}

export class InvalidApiKeyFormatError extends DomainError {
  readonly code = 'invalid-api-key';
  constructor() {
    super('The API key is empty or contains spaces.');
  }
}

export class UnsupportedModelError extends DomainError {
  readonly code = 'unsupported-model';
  constructor(model: string) {
    super(`Model "${model}" is not supported.`);
  }
}

/** The model output did not form a valid patch proposal; `issues` are fed back to the model on retry. */
export class InvalidProposalError extends DomainError {
  readonly code = 'invalid-patch';
  constructor(readonly issues: readonly string[]) {
    super(`The AI returned an invalid change: ${issues.slice(0, 3).join('; ')}`);
  }
}

export type ProviderFailureKind = 'auth' | 'rate-limit' | 'network' | 'timeout' | 'refusal' | 'unknown';

const PROVIDER_MESSAGES: Record<ProviderFailureKind, string> = {
  auth: 'Your API key was rejected. Check it in settings.',
  'rate-limit': 'The provider is rate limiting requests. Wait a moment and try again.',
  network: 'Could not reach the provider. Check your connection.',
  timeout: 'The provider took too long to answer. Try again or simplify the request.',
  refusal: 'The model declined this request.',
  unknown: 'The provider returned an unexpected error.',
};

export class ProviderError extends DomainError {
  readonly code: string;
  constructor(
    readonly kind: ProviderFailureKind,
    detail?: string,
  ) {
    super(detail ? `${PROVIDER_MESSAGES[kind]} (${detail})` : PROVIDER_MESSAGES[kind]);
    this.code = `provider-${kind}`;
  }
}
