import { err, ok, type Result } from '../../shared/domain';
import type { EditContext } from './edit-context';
import { InvalidProposalError } from './errors';

/** The AI context's own op language: targets are the ids (`t0`, `t1`…) shown in the EditContext. */
export type ProposedOp =
  | { readonly type: 'insert'; readonly target: string; readonly position: 'before' | 'after' | 'prepend' | 'append'; readonly html: string }
  | { readonly type: 'replace'; readonly target: string; readonly html: string }
  | { readonly type: 'setStyle'; readonly target: string; readonly styles: Readonly<Record<string, string>> }
  | { readonly type: 'setAttr'; readonly target: string; readonly name: string; readonly value: string | null }
  | { readonly type: 'setText'; readonly target: string; readonly text: string }
  | { readonly type: 'remove'; readonly target: string }
  | { readonly type: 'addCss'; readonly css: string };

export interface ProposalDraft {
  readonly summary: string;
  readonly ops: readonly ProposedOp[];
}

export class PatchProposal {
  private constructor(
    readonly summary: string,
    readonly ops: readonly ProposedOp[],
  ) {}

  /** Accepts a schema-valid draft only if it is non-empty and targets nothing outside the context. */
  static fromDraft(draft: ProposalDraft, context: EditContext): Result<PatchProposal, InvalidProposalError> {
    const issues: string[] = [];
    if (draft.ops.length === 0) issues.push('ops must contain at least one operation');
    draft.ops.forEach((op, i) => {
      if (op.type !== 'addCss' && !context.hasTarget(op.target)) {
        issues.push(`ops[${i}].target "${op.target}" is not one of the provided data-hew-target ids`);
      }
    });
    if (issues.length > 0) return err(new InvalidProposalError(issues));
    return ok(new PatchProposal(draft.summary.trim() || 'Applied change', draft.ops));
  }
}
