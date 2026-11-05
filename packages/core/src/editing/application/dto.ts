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

/** An anchor flattened for export: enough for a developer to find the element in code. */
export interface AnchorRecord {
  readonly selector: string;
  readonly tag: string;
  readonly role?: string | undefined;
  readonly text: string;
}

export type OpRecord =
  | { readonly type: 'insert'; readonly target: AnchorRecord; readonly position: string; readonly html: string }
  | { readonly type: 'replace'; readonly target: AnchorRecord; readonly html: string }
  | { readonly type: 'setStyle'; readonly target: AnchorRecord; readonly styles: Readonly<Record<string, string>> }
  | { readonly type: 'setAttr'; readonly target: AnchorRecord; readonly name: string; readonly value: string | null }
  | { readonly type: 'setText'; readonly target: AnchorRecord; readonly text: string }
  | { readonly type: 'remove'; readonly target: AnchorRecord }
  | { readonly type: 'addCss'; readonly css: string; readonly scope: AnchorRecord | null };

export interface ChangeRecord {
  readonly id: string;
  readonly prompt: string;
  readonly summary: string;
  readonly createdAt: string;
  readonly ops: readonly OpRecord[];
  readonly warnings: readonly string[];
}

/** The changesets currently applied, oldest first, with full operation details. */
export interface ChangeLog {
  readonly changes: readonly ChangeRecord[];
}

function toAnchorRecord(anchor: ElementAnchor): AnchorRecord {
  return { selector: anchor.selector, tag: anchor.tag, ...(anchor.role ? { role: anchor.role } : {}), text: anchor.textFingerprint };
}

function toOpRecord(op: PatchOp): OpRecord {
  switch (op.type) {
    case 'insert':
      return { type: op.type, target: toAnchorRecord(op.target), position: op.position, html: op.html };
    case 'replace':
      return { type: op.type, target: toAnchorRecord(op.target), html: op.html };
    case 'setStyle':
      return { type: op.type, target: toAnchorRecord(op.target), styles: { ...op.styles } };
    case 'setAttr':
      return { type: op.type, target: toAnchorRecord(op.target), name: op.name, value: op.value };
    case 'setText':
      return { type: op.type, target: toAnchorRecord(op.target), text: op.text };
    case 'remove':
      return { type: op.type, target: toAnchorRecord(op.target) };
    case 'addCss':
      return { type: op.type, css: op.css, scope: op.scope ? toAnchorRecord(op.scope) : null };
  }
}

export function toChangeLog(session: EditSession): ChangeLog {
  return {
    changes: session.changesets
      .filter((c) => c.status === 'applied')
      .map((c) => ({
        id: c.id,
        prompt: c.prompt.text,
        summary: c.summary,
        createdAt: c.createdAt.toISOString(),
        ops: c.ops.map(toOpRecord),
        warnings: c.warnings.map(({ warning }) => warning.detail),
      })),
  };
}
