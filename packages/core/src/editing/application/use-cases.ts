import { err, ok, type Clock, type DomainEventPublisher, type IdGenerator, type Result } from '../../shared/domain';
import {
  ElementAnchor,
  Prompt,
  Selection,
  validatePatchOps,
  type EditSession,
  type EditSessionRepository,
  type ElementAnchorProps,
  type PageGateway,
  type PatchSource,
} from '../domain';
import { toSnapshot, toUseCaseError, type SessionSnapshot, type UseCaseError } from './dto';
import { loadOrStart } from './session-loader';

export interface EditingDeps {
  readonly sessions: EditSessionRepository;
  readonly page: PageGateway;
  readonly patchSource: PatchSource;
  readonly ids: IdGenerator;
  readonly clock: Clock;
  readonly events?: DomainEventPublisher;
}

type SnapshotResult = Result<SessionSnapshot, UseCaseError>;

async function commit(deps: EditingDeps, session: EditSession): Promise<SessionSnapshot> {
  await deps.sessions.save(session);
  deps.events?.publish(session.pullEvents());
  return toSnapshot(session);
}

export class SelectElement {
  constructor(private readonly deps: EditingDeps) {}

  async execute(input: { sessionId: string; anchor: ElementAnchorProps; label: string }): Promise<SnapshotResult> {
    const anchor = ElementAnchor.create(input.anchor);
    if (!anchor.ok) return err(toUseCaseError(anchor.error));
    const session = await loadOrStart(this.deps.sessions, input.sessionId);
    session.select(new Selection(anchor.value, input.label), this.deps.clock.now());
    return ok(await commit(this.deps, session));
  }
}

export class ClearSelection {
  constructor(private readonly deps: EditingDeps) {}

  async execute(input: { sessionId: string }): Promise<SnapshotResult> {
    const session = await loadOrStart(this.deps.sessions, input.sessionId);
    session.select(null, this.deps.clock.now());
    return ok(await commit(this.deps, session));
  }
}

export class ApplyPromptToSelection {
  constructor(private readonly deps: EditingDeps) {}

  async execute(input: { sessionId: string; prompt: string }): Promise<SnapshotResult> {
    const session = await loadOrStart(this.deps.sessions, input.sessionId);
    const selection = session.requireSelection();
    if (!selection.ok) return err(toUseCaseError(selection.error));
    const prompt = Prompt.create(input.prompt);
    if (!prompt.ok) return err(toUseCaseError(prompt.error));

    const proposal = await this.deps.patchSource.propose(selection.value, prompt.value);
    if (!proposal.ok) return err(toUseCaseError(proposal.error));
    const ops = validatePatchOps(proposal.value.ops);
    if (!ops.ok) return err(toUseCaseError(ops.error));

    const applied = session.apply(
      {
        id: this.deps.ids.next(),
        prompt: prompt.value,
        summary: proposal.value.summary,
        ops: ops.value,
        now: this.deps.clock.now(),
      },
      this.deps.page,
    );
    if (!applied.ok) return err(toUseCaseError(applied.error));
    return ok(await commit(this.deps, session));
  }
}

export class UndoChangeset {
  constructor(private readonly deps: EditingDeps) {}

  async execute(input: { sessionId: string }): Promise<SnapshotResult> {
    const session = await loadOrStart(this.deps.sessions, input.sessionId);
    const result = session.undo(this.deps.page, this.deps.clock.now());
    if (!result.ok) return err(toUseCaseError(result.error));
    return ok(await commit(this.deps, session));
  }
}

export class RedoChangeset {
  constructor(private readonly deps: EditingDeps) {}

  async execute(input: { sessionId: string }): Promise<SnapshotResult> {
    const session = await loadOrStart(this.deps.sessions, input.sessionId);
    const result = session.redo(this.deps.page, this.deps.clock.now());
    if (!result.ok) return err(toUseCaseError(result.error));
    return ok(await commit(this.deps, session));
  }
}

export class GetSessionSnapshot {
  constructor(private readonly deps: Pick<EditingDeps, 'sessions'>) {}

  async execute(input: { sessionId: string }): Promise<SessionSnapshot> {
    return toSnapshot(await loadOrStart(this.deps.sessions, input.sessionId));
  }
}
