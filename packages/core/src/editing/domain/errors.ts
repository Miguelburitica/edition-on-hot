import { DomainError } from '../../shared/domain';

export class EmptyPromptError extends DomainError {
  readonly code = 'empty-prompt';
  constructor() {
    super('Describe the change you want before applying it.');
  }
}

export class PromptTooLongError extends DomainError {
  readonly code = 'prompt-too-long';
  constructor(max: number) {
    super(`The request is too long (max ${max} characters).`);
  }
}

export class NoSelectionError extends DomainError {
  readonly code = 'no-selection';
  constructor() {
    super('Select an element on the page first.');
  }
}

export class InvalidAnchorError extends DomainError {
  readonly code = 'invalid-anchor';
}

export class InvalidPatchOpError extends DomainError {
  readonly code = 'invalid-patch';
}

export class AnchorNotFoundError extends DomainError {
  readonly code = 'anchor-not-found';
  constructor(readonly selector: string) {
    super(`Could not find the target element "${selector}" on the page.`);
  }
}

export class PatchApplyError extends DomainError {
  readonly code = 'patch-apply-failed';
}

export class NothingToUndoError extends DomainError {
  readonly code = 'nothing-to-undo';
  constructor() {
    super('There is no applied change to undo.');
  }
}

export class NothingToRedoError extends DomainError {
  readonly code = 'nothing-to-redo';
  constructor() {
    super('There is no undone change to redo.');
  }
}

/** Raised by a PatchSource when no proposal could be produced; carries the upstream code. */
export class PatchSourceError extends DomainError {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
