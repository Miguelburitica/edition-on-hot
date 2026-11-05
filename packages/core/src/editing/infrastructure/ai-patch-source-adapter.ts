import type { AiError, ContextBudget, GeneratePatchRequest, GeneratePatchResponse, ProposedOp } from '../../ai/application';
import { err, ok, type Result } from '../../shared/domain';
import {
  PatchSourceError,
  type ElementAnchor,
  type PatchOp,
  type PatchSource,
  type PatchSourceProposal,
  type Prompt,
  type Selection,
} from '../domain';
import type { DomAnchorResolver } from './dom-anchor-resolver';
import { buildSelectionContext } from './selection-context';

/** Calls the AI context's GeneratePatch, wherever it runs (directly or over the message bridge). */
export type PatchRequester = (request: GeneratePatchRequest) => Promise<Result<GeneratePatchResponse, AiError>>;

/** Asks the AI context how much of the selection the active model should see. */
export type BudgetRequester = () => Promise<Result<ContextBudget, AiError>>;

/**
 * Anti-corruption layer between Editing and AI Assistance: serializes the selection into the AI
 * context's request and maps target ids in its answer back to Editing anchors.
 */
export class AiPatchSourceAdapter implements PatchSource {
  constructor(
    private readonly resolver: DomAnchorResolver,
    private readonly requestPatch: PatchRequester,
    private readonly requestBudget: BudgetRequester,
  ) {}

  async propose(selection: Selection, prompt: Prompt): Promise<Result<PatchSourceProposal, PatchSourceError>> {
    const el = this.resolver.resolve(selection.anchor);
    if (!el) {
      return err(new PatchSourceError('anchor-not-found', 'The selected element is no longer on the page. Select it again.'));
    }
    const budget = await this.requestBudget();
    if (!budget.ok) return err(new PatchSourceError(budget.error.code, budget.error.message));
    const ctx = buildSelectionContext(el, { maxTargets: budget.value.maxTargets });
    const response = await this.requestPatch({
      prompt: prompt.text,
      context: {
        html: ctx.html,
        ancestors: ctx.ancestors,
        styles: ctx.styles,
        targetIds: [...ctx.targets.keys()],
        pageUrl: ctx.pageUrl,
        pageTitle: ctx.pageTitle,
      },
    });
    if (!response.ok) return err(new PatchSourceError(response.error.code, response.error.message));

    const ops: PatchOp[] = [];
    for (const proposed of response.value.ops) {
      const op = toPatchOp(proposed, ctx.targets, selection.anchor);
      if (!op) return err(new PatchSourceError('invalid-patch', `The AI targeted an unknown element ("${targetOf(proposed)}").`));
      ops.push(op);
    }
    return ok({ summary: response.value.summary, ops });
  }
}

function targetOf(op: ProposedOp): string {
  return op.type === 'addCss' ? '' : op.target;
}

/** Stylesheet rules are scoped to the selection, so they can style repeated items inside it. */
function toPatchOp(op: ProposedOp, targets: ReadonlyMap<string, ElementAnchor>, selection: ElementAnchor): PatchOp | null {
  if (op.type === 'addCss') return { type: 'addCss', css: op.css, scope: selection };
  const target = targets.get(op.target);
  if (!target) return null;
  switch (op.type) {
    case 'insert':
      return { type: 'insert', target, position: op.position, html: op.html };
    case 'replace':
      return { type: 'replace', target, html: op.html };
    case 'setStyle':
      return { type: 'setStyle', target, styles: op.styles };
    case 'setAttr':
      return { type: 'setAttr', target, name: op.name, value: op.value };
    case 'setText':
      return { type: 'setText', target, text: op.text };
    case 'remove':
      return { type: 'remove', target };
  }
}
