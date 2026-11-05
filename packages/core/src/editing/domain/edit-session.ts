import { AggregateRoot, err, ok, type Result } from '../../shared/domain';
import { Changeset, type ChangesetId } from './changeset';
import {
  NoSelectionError,
  NothingToRedoError,
  NothingToUndoError,
  VersionOutOfRangeError,
  type AnchorNotFoundError,
  type PatchApplyError,
} from './errors';
import type { PatchOp } from './patch-op';
import type { EditingEvent } from './events';
import type { AppliedOp, PageGateway } from './ports';
import type { Prompt } from './prompt';
import type { Selection } from './selection';

export type EditSessionId = string;

/**
 * Aggregate root for the edits made in one page. Invariants:
 * - a changeset is applied completely or not at all;
 * - undone changesets always form a suffix of the history (undo/redo is a stack);
 * - applying a new changeset discards the undone suffix.
 */
export class EditSession extends AggregateRoot<EditSessionId, EditingEvent> {
  private history: Changeset[] = [];
  private _selection: Selection | null = null;

  private constructor(id: EditSessionId) {
    super(id);
  }

  static start(id: EditSessionId): EditSession {
    return new EditSession(id);
  }

  get selection(): Selection | null {
    return this._selection;
  }

  get changesets(): readonly Changeset[] {
    return this.history;
  }

  get canUndo(): boolean {
    return this.lastApplied() !== undefined;
  }

  get canRedo(): boolean {
    return this.nextRedo() !== undefined;
  }

  /** 0 is the original page; version k has the first k changesets applied. */
  get currentVersion(): number {
    return this.history.filter((c) => c.status === 'applied').length;
  }

  get versionCount(): number {
    return this.history.length;
  }

  select(selection: Selection | null, now: Date): void {
    this._selection = selection;
    this.record({ type: 'SelectionChanged', sessionId: this.id, occurredAt: now });
  }

  requireSelection(): Result<Selection, NoSelectionError> {
    return this._selection ? ok(this._selection) : err(new NoSelectionError());
  }

  apply(
    props: { id: ChangesetId; prompt: Prompt; summary: string; ops: readonly PatchOp[]; now: Date },
    page: PageGateway,
  ): Result<Changeset, AnchorNotFoundError | PatchApplyError> {
    const applied = applyAll(props.ops, props.id, page);
    if (!applied.ok) return applied;

    this.history = this.history.filter((c) => c.status === 'applied');
    const changeset = Changeset.applied({
      id: props.id,
      prompt: props.prompt,
      summary: props.summary,
      ops: props.ops,
      createdAt: props.now,
      applied: applied.value,
    });
    this.history.push(changeset);
    this.record({ type: 'ChangesetApplied', sessionId: this.id, changesetId: changeset.id, occurredAt: props.now });
    return ok(changeset);
  }

  undo(page: PageGateway, now: Date): Result<Changeset, NothingToUndoError> {
    const changeset = this.lastApplied();
    if (!changeset) return err(new NothingToUndoError());
    revertAll(changeset.appliedOps, page);
    changeset.markUndone();
    this.record({ type: 'ChangesetUndone', sessionId: this.id, changesetId: changeset.id, occurredAt: now });
    return ok(changeset);
  }

  redo(
    page: PageGateway,
    now: Date,
  ): Result<Changeset, NothingToRedoError | AnchorNotFoundError | PatchApplyError> {
    const changeset = this.nextRedo();
    if (!changeset) return err(new NothingToRedoError());
    const applied = applyAll(changeset.ops, changeset.id, page);
    if (!applied.ok) return applied;
    changeset.markReapplied(applied.value);
    this.record({ type: 'ChangesetRedone', sessionId: this.id, changesetId: changeset.id, occurredAt: now });
    return ok(changeset);
  }

  /**
   * Shows the page at `version` by undoing or redoing one changeset at a time. A failed redo
   * stops at the last version that applied and returns the error.
   */
  goTo(
    version: number,
    page: PageGateway,
    now: Date,
  ): Result<number, VersionOutOfRangeError | AnchorNotFoundError | PatchApplyError> {
    if (!Number.isInteger(version) || version < 0 || version > this.versionCount) {
      return err(new VersionOutOfRangeError(version, this.versionCount));
    }
    while (this.currentVersion > version) this.undo(page, now);
    while (this.currentVersion < version) {
      const redone = this.redo(page, now);
      if (!redone.ok) {
        const error = redone.error;
        if (error instanceof NothingToRedoError) break; // unreachable: version <= versionCount
        return err(error);
      }
    }
    return ok(this.currentVersion);
  }

  private lastApplied(): Changeset | undefined {
    return this.history.findLast((c) => c.status === 'applied');
  }

  /** The most recently undone changeset is the oldest one in the undone suffix. */
  private nextRedo(): Changeset | undefined {
    return this.history.find((c) => c.status === 'undone');
  }
}

function applyAll(
  ops: readonly PatchOp[],
  changesetId: ChangesetId,
  page: PageGateway,
): Result<AppliedOp[], AnchorNotFoundError | PatchApplyError> {
  const applied: AppliedOp[] = [];
  for (const op of ops) {
    const result = page.apply(op, changesetId);
    if (!result.ok) {
      revertAll(applied, page);
      return result;
    }
    applied.push(result.value);
  }
  return ok(page.review(applied));
}

function revertAll(applied: readonly AppliedOp[], page: PageGateway): void {
  for (const op of [...applied].reverse()) page.revert(op);
}
