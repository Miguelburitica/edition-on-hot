import { DesignSystem, type DesignSystemId, type DesignSystemRepository } from '@hew/core/design-system/domain';
import type { StorageAreaLike } from './chrome-settings-repository';

export const DESIGN_SYSTEMS_KEY = 'hew.designSystems';

interface StoredDesignSystem {
  id: string;
  name: string;
  origin: string | null;
  tokens: unknown[];
  components: unknown[];
  createdAt: string;
  updatedAt: string;
}

interface StoredLibrary {
  version: 1;
  systems: Record<string, StoredDesignSystem>;
  /** origin → design system id */
  bindings: Record<string, string>;
}

const empty = (): StoredLibrary => ({ version: 1, systems: {}, bindings: {} });

/** Design systems in extension-local storage. Entries that no longer validate are skipped, not fatal. */
export class ChromeDesignSystemRepository implements DesignSystemRepository {
  /** Serializes writes so concurrent saves from one page never drop each other. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly storage: StorageAreaLike) {}

  async list(): Promise<DesignSystem[]> {
    const library = await this.read();
    return Object.values(library.systems).flatMap((stored) => {
      const system = revive(stored);
      return system ? [system] : [];
    });
  }

  async get(id: DesignSystemId): Promise<DesignSystem | null> {
    const stored = (await this.read()).systems[id];
    return stored ? revive(stored) : null;
  }

  save(system: DesignSystem): Promise<void> {
    return this.mutate((library) => {
      const props = system.toProps();
      library.systems[system.id] = {
        ...props,
        tokens: [...props.tokens],
        components: [...props.components],
        createdAt: props.createdAt.toISOString(),
        updatedAt: props.updatedAt.toISOString(),
      };
    });
  }

  delete(id: DesignSystemId): Promise<void> {
    return this.mutate((library) => {
      delete library.systems[id];
      for (const [origin, bound] of Object.entries(library.bindings)) if (bound === id) delete library.bindings[origin];
    });
  }

  async activeFor(origin: string): Promise<DesignSystemId | null> {
    const library = await this.read();
    const id = library.bindings[origin];
    return id && library.systems[id] ? id : null;
  }

  setActive(origin: string, id: DesignSystemId | null): Promise<void> {
    return this.mutate((library) => {
      if (id === null) delete library.bindings[origin];
      else library.bindings[origin] = id;
    });
  }

  private async read(): Promise<StoredLibrary> {
    const value = (await this.storage.get(DESIGN_SYSTEMS_KEY))[DESIGN_SYSTEMS_KEY] as Partial<StoredLibrary> | undefined;
    if (!value || value.version !== 1 || typeof value.systems !== 'object' || typeof value.bindings !== 'object') return empty();
    return { version: 1, systems: { ...value.systems }, bindings: { ...value.bindings } };
  }

  private mutate(change: (library: StoredLibrary) => void): Promise<void> {
    const write = async () => {
      const library = await this.read();
      change(library);
      await this.storage.set({ [DESIGN_SYSTEMS_KEY]: library });
    };
    // Side panels in several windows share the key: a Web Lock serializes them; the queue covers this one.
    const locks = (globalThis.navigator as { locks?: { request(name: string, cb: () => Promise<void>): Promise<void> } } | undefined)?.locks;
    const run = this.queue.then(() => (locks ? locks.request(DESIGN_SYSTEMS_KEY, write) : write()));
    this.queue = run.catch(() => undefined);
    return run;
  }
}

/** Never throws: a malformed entry is skipped so one bad record cannot hide the whole library. */
function revive(stored: StoredDesignSystem): DesignSystem | null {
  if (!stored || typeof stored.id !== 'string' || !Array.isArray(stored.tokens) || !Array.isArray(stored.components)) return null;
  try {
    return reviveChecked(stored);
  } catch {
    return null;
  }
}

function reviveChecked(stored: StoredDesignSystem): DesignSystem | null {
  const created = DesignSystem.create({
    id: stored.id,
    name: String(stored.name ?? ''),
    origin: typeof stored.origin === 'string' ? stored.origin : null,
    tokens: stored.tokens as never,
    components: stored.components as never,
    createdAt: new Date(stored.createdAt),
    updatedAt: new Date(stored.updatedAt),
  });
  return created.ok ? created.value : null;
}
