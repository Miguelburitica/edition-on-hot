import type { EditSession, EditSessionId, EditSessionRepository } from '../domain';

/** Sessions hold live DOM revert tokens, so they live in the memory of the page's content script. */
export class InMemoryEditSessionRepository implements EditSessionRepository {
  private readonly sessions = new Map<EditSessionId, EditSession>();

  async get(id: EditSessionId): Promise<EditSession | null> {
    return this.sessions.get(id) ?? null;
  }

  async save(session: EditSession): Promise<void> {
    this.sessions.set(session.id, session);
  }
}
