export interface DomainEvent {
  readonly type: string;
  readonly occurredAt: Date;
}

export interface DomainEventPublisher {
  publish(events: readonly DomainEvent[]): void;
}
