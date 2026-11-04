import type { ElementAnchorProps } from '../domain';
import type { ChangesetStatus, EditSession } from '../domain';

export interface ChangesetView {
  readonly id: string;
  readonly prompt: string;
  readonly summary: string;
  readonly status: ChangesetStatus;
  readonly createdAt: string;
  readonly opCount: number;
}

export interface SessionSnapshot {
  readonly sessionId: string;
  readonly selection: { readonly label: string; readonly anchor: ElementAnchorProps } | null;
  /** Newest first. */
  readonly changesets: readonly ChangesetView[];
  readonly canUndo: boolean;
  readonly canRedo: boolean;
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
    changesets: [...session.changesets].reverse().map((c) => ({
      id: c.id,
      prompt: c.prompt.text,
      summary: c.summary,
      status: c.status,
      createdAt: c.createdAt.toISOString(),
      opCount: c.ops.length,
    })),
    canUndo: session.canUndo,
    canRedo: session.canRedo,
  };
}

export function toUseCaseError(error: { code: string; message: string }): UseCaseError {
  return { code: error.code, message: error.message };
}
