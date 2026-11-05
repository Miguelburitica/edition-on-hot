import { DomainError } from '../../shared/domain';

export class NothingToExportError extends DomainError {
  readonly code = 'nothing-to-export';
  constructor() {
    super('There are no applied changes to export. Apply a change first.');
  }
}

export class UnknownExportFormatError extends DomainError {
  readonly code = 'unknown-export-format';
  constructor(format: string) {
    super(`Export format "${format}" is not supported.`);
  }
}
