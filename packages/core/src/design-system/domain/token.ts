export const TOKEN_GROUPS = ['color', 'spacing', 'radius', 'font-size', 'font-family', 'font-weight', 'shadow', 'other'] as const;
export type TokenGroup = (typeof TOKEN_GROUPS)[number];

/** Where a token came from: the page's own custom property, inference from computed styles, or a file. */
export type TokenSource = 'variable' | 'inferred' | 'imported';

export interface Token {
  /** Kebab-case, unique in its design system, e.g. `color-primary`. */
  readonly name: string;
  readonly group: TokenGroup;
  /** A CSS value, safe to write inside a declaration. */
  readonly value: string;
  /** The custom property that carries it, e.g. `--color-primary` or `--ds-color-primary`. */
  readonly cssVar: string;
  readonly source: TokenSource;
  /** How many sampled elements used it (inferred tokens only). */
  readonly uses?: number | undefined;
}

export const COMPONENT_KINDS = ['button', 'input', 'link', 'card', 'badge', 'alert', 'heading', 'other'] as const;
export type ComponentKind = (typeof COMPONENT_KINDS)[number];

export interface ComponentPattern {
  readonly name: string;
  readonly kind: ComponentKind;
  readonly tag: string;
  readonly classes: readonly string[];
  /** A minimal snippet: tag, classes and short text only. */
  readonly example: string;
}

export const TOKEN_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CSS_VAR = /^--[a-zA-Z0-9_-]+$/;
/**
 * Values end up in a stylesheet and in the model's prompt: no declaration, block or tag breakouts,
 * no line breaks, no network fetches (url(), image-set(), @import) and nothing executable.
 */
const UNSAFE_VALUE = /[;{}<>@\r\n]|\/\*|\*\/|\\|\b(url|image|image-set|src|element|expression)\s*\(|javascript:/i;

/** Parentheses, brackets and quotes must close, or one value would swallow the declarations after it. */
function isBalanced(value: string): boolean {
  const stack: string[] = [];
  let quote: string | null = null;
  for (const ch of value) {
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') stack.push(ch === '(' ? ')' : ']');
    else if (ch === ')' || ch === ']') {
      if (stack.pop() !== ch) return false;
    }
  }
  return quote === null && stack.length === 0;
}

/** One line of plain text: names and labels are shown to the model and in exports. */
export const singleLine = (value: string): string => value.replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ').trim();

export function isTokenGroup(value: string): value is TokenGroup {
  return (TOKEN_GROUPS as readonly string[]).includes(value);
}

export function isComponentKind(value: string): value is ComponentKind {
  return (COMPONENT_KINDS as readonly string[]).includes(value);
}

export function isSafeTokenValue(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const v = value.trim();
  return v.length > 0 && v.length <= 200 && !UNSAFE_VALUE.test(v) && isBalanced(v);
}

/** Component examples are only `<tag class="…" type="…">short text</tag>`, never arbitrary markup. */
const SAFE_EXAMPLE = /^<([a-z][a-z0-9-]*)(?: class="[\w\s-]*")?(?: type="[\w-]*")?>(?:[^<>\r\n]*<\/\1>)?$/;
export const isSafeExample = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 300 && SAFE_EXAMPLE.test(value);

/** `Brand Primary/500` → `brand-primary-500`; empty when nothing usable remains. */
export function toTokenName(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
