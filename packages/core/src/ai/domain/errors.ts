import { DomainError } from '../../shared/domain';

export class MissingApiKeyError extends DomainError {
  readonly code = 'missing-api-key';
  constructor(providerLabel: string) {
    super(`Add your ${providerLabel} API key in settings before requesting changes.`);
  }
}

export class InvalidModelIdError extends DomainError {
  readonly code = 'invalid-model';
  constructor(model: string, hint = 'Use the vendor/model format, e.g. z-ai/glm-5.3-flash.', providerLabel = 'OpenRouter') {
    super(`"${model}" is not a valid ${providerLabel} model ID. ${hint}`);
  }
}

export class MissingModelError extends DomainError {
  readonly code = 'missing-model';
  constructor(providerLabel: string) {
    super(`Set the ${providerLabel} model in settings before requesting changes.`);
  }
}

export class InvalidBaseUrlError extends DomainError {
  readonly code = 'invalid-base-url';
  constructor(url: string) {
    super(`"${url}" is not a valid proxy URL. Use http:// or https://, e.g. http://localhost:4000.`);
  }
}

export class UnknownProviderError extends DomainError {
  readonly code = 'unknown-provider';
  constructor(provider: string) {
    super(`Provider "${provider}" is not supported.`);
  }
}

export class CatalogUnavailableError extends DomainError {
  readonly code = 'catalog-unavailable';
  constructor() {
    super('The model catalog could not be reached.');
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

export type ProviderFailureKind =
  | 'auth'
  | 'credits'
  | 'moderation'
  | 'model-access'
  | 'unavailable'
  | 'no-provider'
  | 'rate-limit'
  | 'network'
  | 'timeout'
  | 'refusal'
  | 'output-limit'
  | 'unknown';

const PROVIDER_MESSAGES: Record<ProviderFailureKind, string> = {
  auth: 'Your API key was rejected. Check it in settings.',
  credits: 'Your provider account is out of credits. Add credits and try again.',
  moderation: "The request was blocked by the provider's content policy.",
  'model-access': 'This model is not enabled for your account. Enable it with the provider or pick another model in settings.',
  unavailable: 'The model is currently down. Try again in a moment or pick another model in settings.',
  'no-provider': 'No provider can serve this model with the required features. Pick another model in settings.',
  'rate-limit': 'The provider is rate limiting requests. Wait a moment and try again.',
  network: 'Could not reach the provider. Check your connection.',
  timeout: 'The provider took too long to answer. Try again or simplify the request.',
  refusal: 'The model declined this request.',
  'output-limit': 'The AI ran out of room before finishing the change. Select a smaller element, ask for a smaller change, or pick a model that reasons less.',
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
