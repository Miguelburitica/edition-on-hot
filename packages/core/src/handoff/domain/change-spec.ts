import { err, ok, type Result } from '../../shared/domain';
import { NothingToExportError } from './errors';

/** An element as recorded in the session: a CSS path, its tag and the start of its text. */
export interface SpecAnchor {
  readonly selector: string;
  readonly tag: string;
  readonly role?: string | undefined;
  readonly text: string;
}

export type SpecOp =
  | { readonly type: 'insert'; readonly target: SpecAnchor; readonly position: string; readonly html: string }
  | { readonly type: 'replace'; readonly target: SpecAnchor; readonly html: string }
  | { readonly type: 'setStyle'; readonly target: SpecAnchor; readonly styles: Readonly<Record<string, string>> }
  | { readonly type: 'setAttr'; readonly target: SpecAnchor; readonly name: string; readonly value: string | null }
  | { readonly type: 'setText'; readonly target: SpecAnchor; readonly text: string }
  | { readonly type: 'remove'; readonly target: SpecAnchor }
  | { readonly type: 'addCss'; readonly css: string; readonly scope: SpecAnchor | null };

export interface SpecToken {
  readonly cssVar: string;
  readonly value: string;
  readonly group: string;
}

export interface ChangeSpecInput {
  readonly page: { readonly url: string; readonly title: string };
  readonly changes: readonly {
    readonly id: string;
    readonly prompt: string;
    readonly summary: string;
    readonly createdAt: string;
    readonly ops: readonly SpecOp[];
    readonly warnings?: readonly string[];
  }[];
  readonly designSystem?: { readonly name: string; readonly tokens: readonly SpecToken[] } | null;
}

export interface SpecStep {
  readonly description: string;
  readonly code?: { readonly language: 'html' | 'css'; readonly content: string };
}

export interface SpecChange {
  /** 1-based position in the session. */
  readonly index: number;
  /** Unique requirement title. */
  readonly requirement: string;
  /** One sentence with SHALL, as OpenSpec requirements need. */
  readonly statement: string;
  readonly scenario: { readonly name: string; readonly when: string; readonly then: string; readonly and: readonly string[] };
  readonly prompt: string;
  readonly summary: string;
  readonly createdAt: string;
  readonly targets: readonly SpecAnchor[];
  readonly steps: readonly SpecStep[];
  readonly tokensUsed: readonly SpecToken[];
  readonly warnings: readonly string[];
}

export interface SpecPage {
  readonly url: string;
  readonly title: string;
  readonly host: string;
  readonly path: string;
}

const kebab = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

const oneLine = (value: string) => value.replace(/\s+/g, ' ').trim();

/**
 * Text from the page or the model, safe on one Markdown line: no line breaks (which could start
 * headings or requirements) and no raw HTML. Exports are read by people and by coding agents.
 */
export const plainText = (value: string): string => oneLine(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** An inline code span that no backtick in the content can close early. */
export function codeSpan(value: string): string {
  const text = oneLine(value);
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(longest + 1);
  const pad = text.startsWith('`') || text.endsWith('`') || text === '' ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

/** `Adds a red banner.` → `Adds a red banner`, at most 80 characters, cut at a word. */
function titleOf(summary: string, fallback: string): string {
  const text = plainText(summary).replace(/[.#]+$/g, '').replace(/^#+\s*/, '');
  const base = text || fallback;
  const capitalized = base.charAt(0).toUpperCase() + base.slice(1);
  if (capitalized.length <= 80) return capitalized;
  const cut = capitalized.slice(0, 80);
  return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : 80).trimEnd()}…`;
}

const lowerFirst = (value: string) => value.charAt(0).toLowerCase() + value.slice(1);

export function describeAnchor(anchor: SpecAnchor): string {
  const short = oneLine(anchor.text);
  const text = short ? `, "${plainText(short.length > 40 ? `${short.slice(0, 39)}…` : short).replace(/"/g, '\u201d')}"` : '';
  return `${codeSpan(anchor.selector)} (${plainText(anchor.tag)}${text})`;
}

const POSITIONS: Readonly<Record<string, string>> = {
  before: 'before',
  after: 'after',
  prepend: 'at the start of',
  append: 'at the end of',
};

export function describeOp(op: SpecOp): SpecStep {
  switch (op.type) {
    case 'insert':
      return { description: `Insert new markup ${POSITIONS[op.position] ?? op.position} ${describeAnchor(op.target)}:`, code: { language: 'html', content: op.html } };
    case 'replace':
      return { description: `Replace ${describeAnchor(op.target)} with:`, code: { language: 'html', content: op.html } };
    case 'setStyle':
      return {
        description: `Set these styles on ${describeAnchor(op.target)}:`,
        code: { language: 'css', content: Object.entries(op.styles).map(([k, v]) => `${k}: ${v};`).join('\n') },
      };
    case 'setAttr':
      return {
        description:
          op.value === null
            ? `Remove the ${codeSpan(op.name)} attribute from ${describeAnchor(op.target)}.`
            : op.value === ''
              ? `Add the ${codeSpan(op.name)} attribute to ${describeAnchor(op.target)}.`
              : `Set the ${codeSpan(op.name)} attribute of ${describeAnchor(op.target)} to ${codeSpan(op.value)}.`,
      };
    case 'setText':
      return { description: `Change the text of ${describeAnchor(op.target)} to "${plainText(op.text)}".` };
    case 'remove':
      return { description: `Remove ${describeAnchor(op.target)}.` };
    case 'addCss':
      return {
        description: op.scope
          ? `Add these CSS rules for ${describeAnchor(op.scope)} and its contents (\`:scope\` is that element):`
          : 'Add these CSS rules:',
        code: { language: 'css', content: op.css },
      };
  }
}

const VAR_REFERENCE = /var\(\s*(--[\w-]+)/g;

function opText(op: SpecOp): string {
  switch (op.type) {
    case 'insert':
    case 'replace':
      return op.html;
    case 'setStyle':
      return Object.values(op.styles).join(' ');
    case 'setAttr':
      return op.value ?? '';
    case 'setText':
    case 'remove':
      return '';
    case 'addCss':
      return op.css;
  }
}

function targetsOf(ops: readonly SpecOp[]): SpecAnchor[] {
  const seen = new Map<string, SpecAnchor>();
  for (const op of ops) {
    const anchor = op.type === 'addCss' ? op.scope : op.target;
    if (anchor && !seen.has(anchor.selector)) seen.set(anchor.selector, anchor);
  }
  return [...seen.values()];
}

/** A deterministic spec of the changes applied in an edit session, ready to render. */
export class ChangeSpec {
  private constructor(
    readonly title: string,
    /** Kebab-case, starts with a letter: usable as an OpenSpec change directory. */
    readonly changeName: string,
    /** Kebab-case OpenSpec capability for the spec delta. */
    readonly capability: string,
    readonly page: SpecPage,
    readonly exportedAt: string,
    readonly designSystem: string | null,
    readonly changes: readonly SpecChange[],
  ) {}

  static create(input: ChangeSpecInput, now: Date): Result<ChangeSpec, NothingToExportError> {
    if (input.changes.length === 0) return err(new NothingToExportError());
    const page = pageOf(input.page);
    const date = now.toISOString().slice(0, 10);
    const hostSlug = kebab(page.host.replace(/^www\./, '')) || 'page';
    const firstSegment = kebab(page.path.split('/').filter(Boolean)[0] ?? '');
    const capability = `ui-${[hostSlug, firstSegment].filter(Boolean).join('-')}`.slice(0, 60).replace(/-+$/, '');
    const tokens = new Map((input.designSystem?.tokens ?? []).map((t) => [t.cssVar, t]));
    const used = new Set<string>();

    const changes = input.changes.map((change, i): SpecChange => {
      let requirement = titleOf(change.summary, `Change ${i + 1}`);
      for (let n = 2; used.has(requirement.toLowerCase()); n++) requirement = `${titleOf(change.summary, `Change ${i + 1}`)} (${n})`;
      used.add(requirement.toLowerCase());
      const targets = targetsOf(change.ops);
      const summary = plainText(change.summary) || plainText(change.prompt);
      const referenced = new Set<string>();
      for (const op of change.ops) for (const m of opText(op).matchAll(VAR_REFERENCE)) referenced.add(m[1]!);
      return {
        index: i + 1,
        requirement,
        statement: `The page at ${codeSpan(page.path)} SHALL include this change: ${lowerFirst(summary).replace(/\.?$/, '.')}`,
        scenario: {
          name: `Change ${i + 1} is visible on the page`,
          when: `a user opens ${codeSpan(page.path)}`,
          then: `the page shows the change: ${lowerFirst(summary).replace(/\.$/, '')}`,
          and: targets.slice(0, 3).map((t) => `it applies to ${describeAnchor(t)}`),
        },
        prompt: plainText(change.prompt),
        summary,
        createdAt: change.createdAt,
        targets,
        steps: change.ops.map(describeOp),
        tokensUsed: [...referenced].flatMap((v) => (tokens.has(v) ? [tokens.get(v)!] : [])),
        warnings: (change.warnings ?? []).map(plainText),
      };
    });

    return ok(
      new ChangeSpec(
        `UI changes for ${plainText(input.page.title) || page.host || 'the page'}`,
        // Date and time, so two exports on one day become two OpenSpec changes.
        `ui-${hostSlug}-${date.replace(/-/g, '')}-${now.toISOString().slice(11, 16).replace(':', '')}`,
        capability,
        page,
        now.toISOString(),
        input.designSystem?.name ? plainText(input.designSystem.name) : null,
        changes,
      ),
    );
  }

  /** Every design token used by any change, once. */
  get tokensUsed(): SpecToken[] {
    const all = new Map<string, SpecToken>();
    for (const change of this.changes) for (const t of change.tokensUsed) all.set(t.cssVar, t);
    return [...all.values()];
  }
}

function pageOf(page: { url: string; title: string }): SpecPage {
  try {
    const url = new URL(page.url);
    return { url: url.href, title: plainText(page.title), host: url.host, path: url.pathname || '/' };
  } catch {
    return { url: plainText(page.url), title: plainText(page.title), host: '', path: '/' };
  }
}
