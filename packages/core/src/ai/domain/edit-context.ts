export interface EditContextProps {
  readonly html: string;
  readonly ancestors: readonly string[];
  readonly styles: Readonly<Record<string, string>>;
  readonly targetIds: readonly string[];
  readonly pageUrl: string;
  readonly pageTitle: string;
}

/** What the model is shown about the selection. Bounded in size and free of form values. */
export class EditContext {
  static readonly MAX_HTML_CHARS = 12_000;

  private constructor(
    readonly props: EditContextProps,
    readonly truncated: boolean,
  ) {}

  static create(props: EditContextProps, maxChars = EditContext.MAX_HTML_CHARS): EditContext {
    const html = stripValueAttributes(props.html);
    const truncated = html.length > maxChars;
    return new EditContext({ ...props, html: truncated ? html.slice(0, maxChars) : html }, truncated);
  }

  hasTarget(id: string): boolean {
    return this.props.targetIds.includes(id);
  }
}

/** Defense in depth: the page side already strips input values before serializing. */
function stripValueAttributes(html: string): string {
  return html.replace(/<input\b[^>]*>/gi, (tag) => tag.replace(/\svalue\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, ''));
}
