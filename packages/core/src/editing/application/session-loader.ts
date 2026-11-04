import { EditSession, type EditSessionId, type EditSessionRepository } from '../domain';

export async function loadOrStart(repo: EditSessionRepository, id: EditSessionId): Promise<EditSession> {
  return (await repo.get(id)) ?? EditSession.start(id);
}
