const NESTED_AT_RULES = ['@media', '@supports', '@container', '@layer'];
const VERBATIM_AT_RULES = ['@keyframes', '@-webkit-keyframes'];

export interface ScopedRule {
  /** The rule's original selector list, for messages. */
  readonly original: string;
  /** The scoped selector list, for checking whether the rule matches anything. */
  readonly selector: string;
}

export interface ScopedCss {
  readonly css: string;
  readonly rules: readonly ScopedRule[];
}

/**
 * Prefixes every selector with each scope, so rules only match the scope elements and their
 * descendants. `@import` and other unsupported at-rules are dropped.
 */
export function scopeCss(css: string, scopes: readonly string[]): ScopedCss {
  const rules: ScopedRule[] = [];
  return { css: scopeBlock(css.replace(/\/\*[\s\S]*?\*\//g, ''), scopes, rules), rules };
}

function scopeBlock(source: string, scopes: readonly string[], rules: ScopedRule[]): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const open = source.indexOf('{', i);
    if (open === -1) break;
    // Statement at-rules such as `@import url(x);` end with `;` and are dropped.
    const raw = source.slice(i, open);
    const prelude = raw.slice(raw.lastIndexOf(';') + 1).trim();
    const close = matchingBrace(source, open);
    const body = source.slice(open + 1, close);
    i = close + 1;

    if (prelude.startsWith('@')) {
      if (NESTED_AT_RULES.some((r) => prelude.startsWith(r))) out += `${prelude}{${scopeBlock(body, scopes, rules)}}`;
      else if (VERBATIM_AT_RULES.some((r) => prelude.startsWith(r))) out += `${prelude}{${body}}`;
      continue;
    }
    const selectors = splitSelectors(prelude).flatMap((s) => scopes.flatMap((scope) => scopeSelector(s, scope)));
    if (selectors.length > 0) {
      const selector = selectors.join(', ');
      rules.push({ original: prelude, selector });
      out += `${selector}{${body}}`;
    }
  }
  return out;
}

function scopeSelector(selector: string, scope: string): string[] {
  const s = selector.trim();
  if (s === '') return [];
  if (/^(:root|html|body)$/i.test(s)) return [scope];
  if (s === '*') return [scope, `${scope} *`];
  if (/:scope\b/i.test(s)) return [s.replace(/:scope\b/gi, scope)];
  return [`${scope} ${s}`, ...ownSelector(s, scope)];
}

/**
 * The selector restricted to the scope element itself, so a rule whose first compound names the
 * selection (`.list li`, `ul.list li`, `ul > li`) still matches inside it. The scope is an attribute
 * selector, so it is glued right after a leading type selector (`ul.list li` -> `ul[scope].list li`)
 * or in front of a compound that starts with a class, id, attribute or pseudo-class.
 */
function ownSelector(s: string, scope: string): string[] {
  if (/^[.#:[]/.test(s)) return [`${scope}${s}`];
  const tag = /^(?:[a-z][\w-]*\|)?[a-z][\w-]*/i.exec(s);
  return tag ? [`${tag[0]}${scope}${s.slice(tag[0].length)}`] : [];
}

function splitSelectors(prelude: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of prelude) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else current += ch;
  }
  parts.push(current);
  return parts;
}

function matchingBrace(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return source.length;
}
