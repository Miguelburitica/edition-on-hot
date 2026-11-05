import { Entity } from '../../shared/domain';
import type { PatchOp } from './patch-op';
import type { AppliedOp, OpWarning } from './ports';
import type { Prompt } from './prompt';

export type ChangesetId = string;
export type ChangesetStatus = 'applied' | 'undone';

export interface ChangesetWarning {
  readonly opIndex: number;
  readonly warning: OpWarning;
}

/** One prompt's worth of changes. Holds the applied ops (with revert tokens) while applied. */
export class Changeset extends Entity<ChangesetId> {
  private constructor(
    id: ChangesetId,
    readonly prompt: Prompt,
    readonly summary: string,
    readonly ops: readonly PatchOp[],
    readonly createdAt: Date,
    private _status: ChangesetStatus,
    private _applied: readonly AppliedOp[],
    private _warnings: readonly ChangesetWarning[] = warningsOf(_applied),
  ) {
    super(id);
  }

  static applied(props: {
    id: ChangesetId;
    prompt: Prompt;
    summary: string;
    ops: readonly PatchOp[];
    createdAt: Date;
    applied: readonly AppliedOp[];
  }): Changeset {
    return new Changeset(props.id, props.prompt, props.summary, props.ops, props.createdAt, 'applied', props.applied);
  }

  get status(): ChangesetStatus {
    return this._status;
  }

  get appliedOps(): readonly AppliedOp[] {
    return this._applied;
  }

  /** Warnings from the most recent application; kept after undo so history can show them. */
  get warnings(): readonly ChangesetWarning[] {
    return this._warnings;
  }

  markUndone(): void {
    this._status = 'undone';
    this._applied = [];
  }

  markReapplied(applied: readonly AppliedOp[]): void {
    this._status = 'applied';
    this._applied = applied;
    this._warnings = warningsOf(applied);
  }
}

function warningsOf(applied: readonly AppliedOp[]): ChangesetWarning[] {
  return applied.flatMap((a, opIndex) => (a.warning ? [{ opIndex, warning: a.warning }] : []));
}
