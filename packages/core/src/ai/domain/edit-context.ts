import { CONTEXT_BUDGETS, type ContextBudget } from './context-budget';

export interface EditContextProps {
  readonly html: string;
  readonly ancestors: readonly string[];
  readonly styles: Readonly<Record<string, string>>;
  readonly targetIds: readonly string[];
  readonly pageUrl: string;
  readonly pageTitle: string;
}

/** What the model is shown about the selection. Bounded by a budget and free of form values. */
export class EditContext {
  private constructor(
    readonly props: EditContextProps,
    readonly truncated: boolean,
  ) {}

  /** Enforces the budget even if the caller serialized more than it allows. */
  static create(props: EditContextProps, budget: ContextBudget = CONTEXT_BUDGETS.standard): EditContext {
    const html = stripValueAttributes(props.html);
    const truncated = html.length > budget.maxHtmlChars;
    return new EditContext(
      {
        ...props,
        html: truncated ? html.slice(0, budget.maxHtmlChars) : html,
        targetIds: props.targetIds.slice(0, budget.maxTargets),
      },
      truncated,
    );
  }

  hasTarget(id: string): boolean {
    return this.props.targetIds.includes(id);
  }
}

/** Defense in depth: the page side already strips input values before serializing. */
function stripValueAttributes(html: string): string {
  return html.replace(/<input\b[^>]*>/gi, (tag) => tag.replace(/\svalue\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ''));
}
