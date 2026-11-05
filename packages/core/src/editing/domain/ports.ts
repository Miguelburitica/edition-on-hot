import type { Result } from '../../shared/domain';
import type { EditSession, EditSessionId } from './edit-session';
import type { AnchorNotFoundError, PatchApplyError, PatchSourceError } from './errors';
import type { PatchOp } from './patch-op';
import type { Prompt } from './prompt';
import type { Selection } from './selection';

/** Why an applied op may have had no visible effect. Advisory: it never fails a changeset. */
export interface OpWarning {
  readonly kind: 'no-match' | 'hidden-target';
  readonly detail: string;
}

/** An op as applied to the page. `revertToken` is opaque to the domain; only the gateway reads it. */
export interface AppliedOp {
  readonly op: PatchOp;
  readonly revertToken: unknown;
  readonly warning?: OpWarning | undefined;
}

/** Port to the live page. Implementations must restore the exact prior state on revert. */
export interface PageGateway {
  apply(op: PatchOp, changesetId: string): Result<AppliedOp, AnchorNotFoundError | PatchApplyError>;
  revert(applied: AppliedOp): void;
  /**
   * Called once a whole changeset is applied, for checks that depend on all of its ops (such as
   * whether a stylesheet rule matches an element inserted by a later op). Returns the ops with
   * any warnings attached.
   */
  review(applied: readonly AppliedOp[]): AppliedOp[];
}

export interface EditSessionRepository {
  get(id: EditSessionId): Promise<EditSession | null>;
  save(session: EditSession): Promise<void>;
}

export interface PatchSourceProposal {
  readonly summary: string;
  readonly ops: readonly PatchOp[];
}

/** Port that turns a prompt about a selection into patch ops (implemented via the AI context). */
export interface PatchSource {
  propose(selection: Selection, prompt: Prompt): Promise<Result<PatchSourceProposal, PatchSourceError>>;
}
