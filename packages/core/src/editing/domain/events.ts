import type { DomainEvent } from '../../shared/domain';

export interface ChangesetApplied extends DomainEvent {
  readonly type: 'ChangesetApplied';
  readonly sessionId: string;
  readonly changesetId: string;
}

export interface ChangesetUndone extends DomainEvent {
  readonly type: 'ChangesetUndone';
  readonly sessionId: string;
  readonly changesetId: string;
}

export interface ChangesetRedone extends DomainEvent {
  readonly type: 'ChangesetRedone';
  readonly sessionId: string;
  readonly changesetId: string;
}

export interface SelectionChanged extends DomainEvent {
  readonly type: 'SelectionChanged';
  readonly sessionId: string;
}

export type EditingEvent = ChangesetApplied | ChangesetUndone | ChangesetRedone | SelectionChanged;
