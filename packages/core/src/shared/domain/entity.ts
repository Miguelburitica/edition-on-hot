import type { DomainEvent } from './domain-event';

export abstract class Entity<Id extends string> {
  protected constructor(readonly id: Id) {}

  equals(other: Entity<Id>): boolean {
    return this.id === other.id;
  }
}

export abstract class AggregateRoot<Id extends string, E extends DomainEvent = DomainEvent> extends Entity<Id> {
  private pending: E[] = [];

  protected record(event: E): void {
    this.pending.push(event);
  }

  /** Returns and clears the events recorded since the last call. */
  pullEvents(): E[] {
    const events = this.pending;
    this.pending = [];
    return events;
  }
}
