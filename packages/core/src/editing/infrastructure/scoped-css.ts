const NESTED_AT_RULES = ['@media', '@supports', '@container', '@layer'];
const VERBATIM_AT_RULES = ['@keyframes', '@-webkit-keyframes'];

/**
 * Prefixes every selector so rules only match the scope element and its descendants.
 * `@import` and other unsupported at-rules are dropped.
 */
export function scopeCss(css: string, scope: string): string {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, '');
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
      if (NESTED_AT_RULES.some((r) => prelude.startsWith(r))) out += `${prelude}{${scopeCss(body, scope)}}`;
      else if (VERBATIM_AT_RULES.some((r) => prelude.startsWith(r))) out += `${prelude}{${body}}`;
      continue;
    }
    const selectors = splitSelectors(prelude).flatMap((s) => scopeSelector(s, scope));
    if (selectors.length > 0) out += `${selectors.join(', ')}{${body}}`;
  }
  return out;
}

function scopeSelector(selector: string, scope: string): string[] {
  const s = selector.trim();
  if (s === '') return [];
  if (/^(:root|html|body)$/i.test(s)) return [scope];
  if (s === '*') return [scope, `${scope} *`];
  const own = isCompoundStart(s) ? [`${scope}${s}`] : [];
  return [...own, `${scope} ${s}`];
}

/** A selector that can be glued onto the scope (e.g. `.banner`, `:hover`, `[x]`) also matches the scope element itself. */
function isCompoundStart(s: string): boolean {
  return /^[.#:[]/.test(s);
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
