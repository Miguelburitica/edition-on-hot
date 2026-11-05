import {
  CSS_VAR,
  isSafeExample,
  MAX_COMPONENTS,
  MAX_TOKENS,
  isSafeTokenValue,
  toTokenName,
  type ComponentKind,
  type ComponentPattern,
  type DesignSystemDraft,
  type DesignSystemExtractor,
  type Token,
  type TokenGroup,
} from '../domain';
import { classifyToken, isTransparent, normalizeColor, primaryFamily, rootVariableDeclarations } from './css-values';

export interface ExtractorOptions {
  /** Elements matching this selector (the extension's own UI and inserted markup) are ignored. */
  readonly ignoreSelector?: string;
  readonly maxElements?: number;
}

const DEFAULT_IGNORE = '[data-hew-overlay], [data-hew-cs], [data-hew-design-system], [data-hew-style]';
const SKIPPED_VARIABLE = /^--(tw-|hew|ds-)/;
const MAX_VARIABLES = 250;

const KIND_TITLES: Readonly<Record<ComponentKind, string>> = {
  button: 'Button',
  input: 'Input',
  link: 'Link',
  card: 'Card',
  badge: 'Badge',
  alert: 'Alert',
  heading: 'Heading',
  other: 'Component',
};

const CLASS_KINDS: readonly [ComponentKind, RegExp][] = [
  ['alert', /(^|[-_])(alert|banner|notice|toast|callout|notification)([-_]|$)/],
  ['badge', /(^|[-_])(badge|chip|pill|tag)([-_]|$)/],
  ['card', /(^|[-_])(card|panel|tile)([-_]|$)/],
];
const BUTTON_CLASS = /(^|[-_])(btn|button)([-_]|$)/;
const INPUT_TYPES = new Set(['text', 'email', 'password', 'search', 'tel', 'url', 'number', 'date']);
const VOID_TAGS = new Set(['input']);

/** Reads tokens and component patterns from a live page. */
export class DomDesignSystemExtractor implements DesignSystemExtractor {
  constructor(
    private readonly doc: Document,
    private readonly win: Window,
    private readonly options: ExtractorOptions = {},
  ) {}

  extract(): DesignSystemDraft {
    const variables = this.variableTokens();
    const covered = new Set(variables.map((t) => comparable(t.group, t.value)));
    const elements = this.sampleElements();
    const inferred = this.inferredTokens(elements, new Set(variables.flatMap((t) => [t.name, t.cssVar]))).filter((t) => !covered.has(comparable(t.group, t.value)));
    const tokens = uniqueNames([...variables, ...inferred]).slice(0, MAX_TOKENS);
    return { name: this.name(), tokens, components: this.components(elements) };
  }

  private name(): string {
    const title = this.doc.title.trim().split(/\s[|–—-]\s/)[0]?.trim();
    return (title || this.doc.location?.host || 'Design system').slice(0, 80);
  }

  private variableTokens(): Token[] {
    const declared = rootVariableDeclarations(this.doc);
    const computed = this.win.getComputedStyle(this.doc.documentElement);
    // Memoized, cycle-safe and length-capped: hostile or buggy pages can declare --a: var(--a) var(--a)…
    const memo = new Map<string, string>();
    const visiting = new Set<string>();
    const resolve = (name: string, depth = 0): string => {
      const cached = memo.get(name);
      if (cached !== undefined) return cached;
      if (visiting.has(name) || depth > 5) return '';
      visiting.add(name);
      const raw = computed.getPropertyValue(name).trim() || declared.get(name) || '';
      const resolved = raw.length > 400 ? '' : raw.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (_m, ref: string, fallback?: string) => resolve(ref, depth + 1) || (fallback ?? '').trim());
      visiting.delete(name);
      const value = resolved.length > 400 ? '' : resolved;
      memo.set(name, value);
      return value;
    };
    const tokens: Token[] = [];
    for (const name of declared.keys()) {
      if (tokens.length >= MAX_VARIABLES) break;
      if (SKIPPED_VARIABLE.test(name) || !CSS_VAR.test(name)) continue;
      const value = resolve(name);
      const tokenName = toTokenName(name.slice(2));
      if (!tokenName || !isSafeTokenValue(value)) continue;
      const group = classifyToken(name, value);
      if (group === 'other' && value.length > 60) continue;
      tokens.push({ name: tokenName, group, value: group === 'color' ? normalizeColor(value) : value, cssVar: name, source: 'variable' });
    }
    return tokens;
  }

  private sampleElements(): Element[] {
    const ignore = this.options.ignoreSelector ?? DEFAULT_IGNORE;
    const max = this.options.maxElements ?? 2000;
    const sampled: Element[] = [];
    for (const el of Array.from(this.doc.body?.querySelectorAll('*') ?? [])) {
      if (sampled.length >= max) break;
      if (el.closest(ignore)) continue;
      if (/^(script|style|link|meta|noscript|template|svg|path|br)$/i.test(el.tagName)) continue;
      const style = this.win.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      sampled.push(el);
    }
    return sampled;
  }

  private inferredTokens(elements: readonly Element[], reserved: ReadonlySet<string>): Token[] {
    const colors = new Counter();
    const buttonBackgrounds = new Counter();
    const borders = new Counter();
    const spacing = new Counter();
    const radii = new Counter();
    const sizes = new Counter();
    const shadows = new Counter();
    for (const el of elements) {
      const s = this.win.getComputedStyle(el);
      const color = s.getPropertyValue('color');
      if (color && !isTransparent(color)) colors.add(normalizeColor(color));
      const bg = s.getPropertyValue('background-color');
      if (bg && !isTransparent(bg)) {
        colors.add(normalizeColor(bg));
        if (isButton(el)) buttonBackgrounds.add(normalizeColor(bg));
      }
      for (const side of ['top', 'right', 'bottom', 'left']) {
        const width = parseFloat(s.getPropertyValue(`border-${side}-width`));
        const borderColor = s.getPropertyValue(`border-${side}-color`);
        if (width > 0 && borderColor && !isTransparent(borderColor) && s.getPropertyValue(`border-${side}-style`) !== 'none') {
          borders.add(normalizeColor(borderColor));
          break;
        }
      }
      for (const prop of ['padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'row-gap', 'column-gap', 'gap']) {
        const px = pixels(s.getPropertyValue(prop));
        if (px) spacing.add(px);
      }
      const radius = pixels(s.getPropertyValue('border-top-left-radius')) ?? pixels(s.getPropertyValue('border-radius').split(' ')[0] ?? '');
      if (radius) radii.add(radius);
      const size = pixels(s.getPropertyValue('font-size'));
      if (size) sizes.add(size);
      const shadow = s.getPropertyValue('box-shadow').trim();
      if (shadow && shadow !== 'none') shadows.add(shadow);
    }

    const tokens: Token[] = [];
    const add = (base: string, group: TokenGroup, value: string, uses?: number) => {
      if (!isSafeTokenValue(value) || /user agent/i.test(value)) return;
      if (tokens.some((t) => t.group === group && t.value === value)) return;
      // The page's own variable keeps a name like `color-primary`; the inferred one becomes `color-primary-2`.
      let name = base;
      for (let i = 2; reserved.has(name) || reserved.has(`--ds-${name}`) || tokens.some((t) => t.name === name); i++) name = `${base}-${i}`;
      tokens.push({ name, group, value, cssVar: `--ds-${name}`, source: 'inferred', ...(uses ? { uses } : {}) });
    };

    const body = this.doc.body ? this.win.getComputedStyle(this.doc.body) : null;
    const html = this.win.getComputedStyle(this.doc.documentElement);
    const text = body?.getPropertyValue('color');
    if (text && !isTransparent(text)) add('color-text', 'color', normalizeColor(text), colors.count(normalizeColor(text)));
    const background = [body?.getPropertyValue('background-color'), html.getPropertyValue('background-color')].find((c) => c && !isTransparent(c));
    if (background) add('color-background', 'color', normalizeColor(background));
    const primary = buttonBackgrounds.top(1)[0];
    if (primary) add('color-primary', 'color', primary[0], primary[1]);
    const border = borders.top(1)[0];
    if (border) add('color-border', 'color', border[0], border[1]);
    colors.top(12, 2).forEach(([value, uses], i) => add(`color-${i + 1}`, 'color', value, uses));

    ascending(spacing.top(8, 2)).forEach(([value, uses], i) => add(`space-${i + 1}`, 'spacing', value, uses));
    ascending(radii.top(6, 1)).forEach(([value, uses], i) => add(`radius-${i + 1}`, 'radius', value, uses));
    ascending(sizes.top(8, 1)).forEach(([value, uses], i) => add(`font-size-${i + 1}`, 'font-size', value, uses));
    shadows.top(4, 1).forEach(([value, uses], i) => add(`shadow-${i + 1}`, 'shadow', value, uses));

    const bodyFamily = body?.getPropertyValue('font-family').trim();
    if (bodyFamily) add('font-body', 'font-family', bodyFamily);
    const heading = this.doc.querySelector('h1, h2, h3');
    const headingFamily = heading ? this.win.getComputedStyle(heading).getPropertyValue('font-family').trim() : '';
    if (headingFamily && primaryFamily(headingFamily) !== primaryFamily(bodyFamily ?? '')) add('font-heading', 'font-family', headingFamily);
    return tokens;
  }

  private components(elements: readonly Element[]): ComponentPattern[] {
    const groups = new Map<string, { kind: ComponentKind; tag: string; classes: string[]; sample: Element; count: number }>();
    for (const el of elements) {
      const kind = kindOf(el);
      if (!kind) continue;
      const classes = reusableClasses(el);
      if (classes.length === 0) continue;
      const tag = el.tagName.toLowerCase();
      if (!/^[a-z][a-z0-9-]*$/.test(tag)) continue;
      const key = `${kind}|${tag}|${classes.join(' ')}`;
      const group = groups.get(key);
      if (group) group.count++;
      else groups.set(key, { kind, tag, classes, sample: el, count: 1 });
    }
    const byKind = new Map<ComponentKind, number>();
    const patterns: ComponentPattern[] = [];
    for (const group of [...groups.values()].sort((a, b) => b.count - a.count)) {
      const index = byKind.get(group.kind) ?? 0;
      if (index >= 3 || patterns.length >= MAX_COMPONENTS) continue;
      const example = exampleOf(group.sample, group.tag, group.classes);
      if (!isSafeExample(example)) continue;
      byKind.set(group.kind, index + 1);
      patterns.push({
        name: `${KIND_TITLES[group.kind]}${index > 0 ? ` ${index + 1}` : ''}`,
        kind: group.kind,
        tag: group.tag,
        classes: group.classes,
        example,
      });
    }
    return patterns;
  }
}

class Counter {
  private readonly counts = new Map<string, number>();
  add(value: string): void {
    this.counts.set(value, (this.counts.get(value) ?? 0) + 1);
  }
  count(value: string): number {
    return this.counts.get(value) ?? 0;
  }
  /** The most used values (at least `minUses`), most used first. */
  top(n: number, minUses = 1): [string, number][] {
    return [...this.counts.entries()].filter(([, c]) => c >= minUses).sort((a, b) => b[1] - a[1]).slice(0, n);
  }
}

const ascending = (entries: [string, number][]) => [...entries].sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));

/** `12.4px` → `12px`; null for zero, non-pixel or empty values. */
function pixels(value: string): string | null {
  const m = /^(-?\d*\.?\d+)px$/.exec(value.trim());
  if (!m) return null;
  const n = Math.round(Number(m[1]));
  return n > 0 ? `${n}px` : null;
}

function comparable(group: TokenGroup, value: string): string {
  return `${group}:${group === 'color' ? normalizeColor(value) : value.replace(/\s+/g, ' ').trim().toLowerCase()}`;
}

function uniqueNames(tokens: Token[]): Token[] {
  const names = new Set<string>();
  const vars = new Set<string>();
  return tokens.filter((t) => {
    if (names.has(t.name) || vars.has(t.cssVar)) return false;
    names.add(t.name);
    vars.add(t.cssVar);
    return true;
  });
}

function isButton(el: Element): boolean {
  const tag = el.tagName.toLowerCase();
  if (tag === 'button' || el.getAttribute('role') === 'button') return true;
  if (tag === 'input') return ['submit', 'button'].includes((el.getAttribute('type') ?? '').toLowerCase());
  return tag === 'a' && Array.from(el.classList).some((c) => BUTTON_CLASS.test(c));
}

function kindOf(el: Element): ComponentKind | null {
  const tag = el.tagName.toLowerCase();
  if (isButton(el)) return 'button';
  if (tag === 'input') return INPUT_TYPES.has((el.getAttribute('type') ?? 'text').toLowerCase()) ? 'input' : null;
  if (tag === 'textarea' || tag === 'select') return 'input';
  if (/^h[1-3]$/.test(tag)) return 'heading';
  const classes = Array.from(el.classList);
  for (const [kind, pattern] of CLASS_KINDS) if (classes.some((c) => pattern.test(c))) return kind;
  if (tag === 'a' && el.hasAttribute('href')) return 'link';
  return null;
}

/** Classes worth reusing: not the extension's, not state or utility noise. */
function reusableClasses(el: Element): string[] {
  return Array.from(el.classList)
    .filter((c) => !/^hew-/.test(c) && !/^(is|has)-/.test(c) && !/^(active|hover|focus|selected|open|disabled|visible|hidden)$/.test(c))
    .filter((c) => /^[a-zA-Z_][\w-]*$/.test(c) && c.length <= 40)
    .slice(0, 6);
}

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function exampleOf(el: Element, tag: string, classes: readonly string[]): string {
  const type = tag === 'input' || tag === 'button' ? el.getAttribute('type') : null;
  const attrs = `class="${escapeHtml(classes.join(' '))}"${type ? ` type="${escapeHtml(type)}"` : ''}`;
  if (VOID_TAGS.has(tag)) return `<${tag} ${attrs}>`;
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  const short = text.length > 24 ? `${text.slice(0, 23)}…` : text;
  // Escaped entities would contain no < or >, but keep the example plain text for the safety check.
  return `<${tag} ${attrs}>${escapeHtml(short || '…').replace(/[<>]/g, '')}</${tag}>`;
}
