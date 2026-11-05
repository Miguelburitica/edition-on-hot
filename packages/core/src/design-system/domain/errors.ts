import { DomainError } from '../../shared/domain';

export class InvalidDesignSystemError extends DomainError {
  readonly code = 'invalid-design-system';
  constructor(detail: string) {
    super(`The design system is not valid: ${detail}`);
  }
}

export class DesignSystemNotFoundError extends DomainError {
  readonly code = 'design-system-not-found';
  constructor() {
    super('That design system no longer exists.');
  }
}

export class InvalidTokenFileError extends DomainError {
  readonly code = 'invalid-token-file';
  constructor(detail: string) {
    super(`The token file could not be imported: ${detail}`);
  }
}

export class NothingExtractedError extends DomainError {
  readonly code = 'nothing-extracted';
  constructor() {
    super('No tokens or components were found on this page.');
  }
}
