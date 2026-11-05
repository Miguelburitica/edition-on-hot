import type { ChangesetStatus, EditSession, ElementAnchor, ElementAnchorProps, OpWarning, PatchOp } from '../domain';

export interface OpView {
  readonly type: PatchOp['type'];
  /** Short description of the target element, or of the scope for stylesheet ops. */
  readonly target: string | null;
}

export interface ChangesetView {
  readonly id: string;
  readonly prompt: string;
  readonly summary: string;
  readonly status: ChangesetStatus;
  readonly createdAt: string;
  readonly opCount: number;
  readonly ops: readonly OpView[];
  readonly warnings: readonly (OpWarning & { readonly opIndex: number })[];
}

export interface SessionSnapshot {
  readonly sessionId: string;
  readonly selection: { readonly label: string; readonly anchor: ElementAnchorProps } | null;
  /** Oldest first: the changeset at index i is version i + 1. */
  readonly changesets: readonly ChangesetView[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** 0 is the original page. */
  readonly currentVersion: number;
  readonly versionCount: number;
}

export interface UseCaseError {
  readonly code: string;
  readonly message: string;
}

export function toSnapshot(session: EditSession): SessionSnapshot {
  return {
    sessionId: session.id,
    selection: session.selection
      ? { label: session.selection.label, anchor: session.selection.anchor.toJSON() }
      : null,
    changesets: session.changesets.map((c) => ({
      id: c.id,
      prompt: c.prompt.text,
      summary: c.summary,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      opCount: c.ops.length,
      ops: c.ops.map(toOpView),
      warnings: c.warnings.map(({ opIndex, warning }) => ({ ...warning, opIndex })),
    })),
    canUndo: session.canUndo,
    canRedo: session.canRedo,
    currentVersion: session.currentVersion,
    versionCount: session.versionCount,
  };
}

function describeAnchor(anchor: ElementAnchor): string {
  const selector = anchor.selector.length > 60 ? `…${anchor.selector.slice(-59)}` : anchor.selector;
  return `${anchor.tag} (${selector})`;
}

function toOpView(op: PatchOp): OpView {
  if (op.type === 'addCss') return { type: op.type, target: op.scope ? describeAnchor(op.scope) : null };
  return { type: op.type, target: describeAnchor(op.target) };
}

export function toUseCaseError(error: { code: string; message: string }): UseCaseError {
  return { code: error.code, message: error.message };
}
