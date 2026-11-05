import type { DesignSystem, DesignSystemId, DesignSystemRepository } from '../domain';

export class InMemoryDesignSystemRepository implements DesignSystemRepository {
  private readonly systems = new Map<DesignSystemId, DesignSystem>();
  private readonly bindings = new Map<string, DesignSystemId>();

  async list() {
    return [...this.systems.values()];
  }
  async get(id: DesignSystemId) {
    return this.systems.get(id) ?? null;
  }
  async save(system: DesignSystem) {
    this.systems.set(system.id, system);
  }
  async delete(id: DesignSystemId) {
    this.systems.delete(id);
    for (const [origin, bound] of this.bindings) if (bound === id) this.bindings.delete(origin);
  }
  async activeFor(origin: string) {
    return this.bindings.get(origin) ?? null;
  }
  async setActive(origin: string, id: DesignSystemId | null) {
    if (id === null) this.bindings.delete(origin);
    else this.bindings.set(origin, id);
  }
}
