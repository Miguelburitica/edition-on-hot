import { describe, expect, it } from 'vitest';
import { AggregateRoot } from './entity';
import { err, ok } from './result';

class Counter extends AggregateRoot<string> {
  static create(id: string) {
    return new Counter(id);
  }
  bump() {
    this.record({ type: 'Bumped', occurredAt: new Date(0) });
  }
}

describe('AggregateRoot', () => {
  it('collects events and clears them when pulled', () => {
    const counter = Counter.create('c1');
    counter.bump();
    counter.bump();
    expect(counter.pullEvents()).toHaveLength(2);
    expect(counter.pullEvents()).toHaveLength(0);
  });

  it('compares entities by id', () => {
    expect(Counter.create('a').equals(Counter.create('a'))).toBe(true);
    expect(Counter.create('a').equals(Counter.create('b'))).toBe(false);
  });
});

describe('Result', () => {
  it('builds ok and err variants', () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
    expect(err('x')).toEqual({ ok: false, error: 'x' });
  });
});
