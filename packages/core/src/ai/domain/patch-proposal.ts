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

  /**
   * Accepts a schema-valid draft only if it is non-empty, targets nothing outside the context and
   * contains no unsafe operation. Every problem becomes an issue the model sees on retry.
   */
  static fromDraft(draft: ProposalDraft, context: EditContext): Result<PatchProposal, InvalidProposalError> {
    const issues: string[] = [];
    if (draft.ops.length === 0) issues.push('ops must contain at least one operation');
    draft.ops.forEach((op, i) => {
      if (op.type !== 'addCss' && !context.hasTarget(op.target)) {
        issues.push(`ops[${i}].target "${op.target}" is not one of the provided data-hew-target ids`);
      }
      issues.push(...unsafeIssues(op, i));
    });
    if (issues.length > 0) return err(new InvalidProposalError(issues));
    return ok(new PatchProposal(draft.summary.trim() || 'Applied change', draft.ops));
  }
}

const OP_TYPES = new Set(['insert', 'replace', 'setstyle', 'setattr', 'settext', 'remove', 'addcss']);
const CSS_TARGET_REFERENCE = /data-hew|(^|[\s,>+~{}])t\d+(?=[\s,>+~.:#[{])/i;

const CSS_PROPERTY = /^(--[a-z0-9-]+|-?[a-z]+(-[a-z]+)*)$/i;

/** The page side enforces the same rules; checking them here lets the retry fix them. */
function unsafeIssues(op: ProposedOp, i: number): string[] {
  const at = `ops[${i}]`;
  if (op.type === 'setAttr') {
    const name = op.name.trim().toLowerCase();
    if (name.startsWith('data-hew')) {
      return [`${at}.name "${op.name}": data-hew-* attributes are reserved for the extension; use a class or a data- attribute without the hew prefix`];
    }
    if (OP_TYPES.has(name)) return [`${at}.name "${op.name}": that is an operation type, not an attribute; send it as its own op with type "${op.name}"`];
    if (name.startsWith('on')) return [`${at}.name "${op.name}": event handler attributes are not allowed; patches cannot run JavaScript`];
    if (op.value !== null && /^\s*javascript:/i.test(op.value)) return [`${at}.value: javascript: URLs are not allowed`];
  }
  if (op.type === 'addCss' && CSS_TARGET_REFERENCE.test(op.css)) {
    return [`${at}.css: target ids and data-hew-* attributes do not exist on the page; select with the page's tags and classes, and use :scope for t0`];
  }
  if (op.type === 'setStyle') {
    const bad = Object.keys(op.styles).filter((p) => !CSS_PROPERTY.test(p));
    if (bad.length) return [`${at}.styles: invalid CSS property names ${bad.map((p) => `"${p}"`).join(', ')}; use kebab-case names like "background-color"`];
  }
  return [];
}
