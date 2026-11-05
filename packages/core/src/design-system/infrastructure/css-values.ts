import type { TokenGroup } from '../domain';

const COLOR_FN = /^(#[0-9a-f]{3,8}|(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\))$/i;
const NAMED_COLORS = new Set(['black', 'white', 'red', 'green', 'blue', 'gray', 'grey', 'orange', 'yellow', 'purple', 'pink', 'transparent']);
const DIMENSION = /^-?\d*\.?\d+(px|rem|em|%|vh|vw|vmin|vmax|ch|ex|pt)$|^0$|^(calc|clamp|min|max)\(.+\)$/i;

export const isColorValue = (value: string): boolean => COLOR_FN.test(value.trim()) || NAMED_COLORS.has(value.trim().toLowerCase());
export const isDimensionValue = (value: string): boolean => DIMENSION.test(value.trim());

/** Guesses a token's group from its name (`--radius-md`) and value (`8px`). */
export function classifyToken(name: string, value: string): TokenGroup {
  const n = name.toLowerCase();
  const v = value.trim();
  if (/shadow|elevation/.test(n) || /\d(px|rem)\s+-?\d.*(rgba?\(|#|hsla?\()/i.test(v)) return 'shadow';
  if (isColorValue(v) && !/radius|space|size|width/.test(n)) return 'color';
  if (/weight/.test(n) && /^(\d{3}|normal|bold|bolder|lighter)$/.test(v)) return 'font-weight';
  if (/font|family|typeface/.test(n) && !isDimensionValue(v) && /[a-z]/i.test(v) && !/^\d/.test(v)) return 'font-family';
  if (/,/.test(v) && /(sans-serif|serif|monospace|system-ui|cursive)\b/.test(v)) return 'font-family';
  if (isDimensionValue(v)) {
    if (/radius|rounded|corner/.test(n)) return 'radius';
    if (/font-size|text-(xs|sm|base|md|lg|xl|\dxl)|(^|-)fs(-|$)|font-?size|leading|type-scale/.test(n)) return 'font-size';
    return 'spacing';
  }
  return 'other';
}

/** `rgb(37, 99, 235)` → `#2563eb`, `rgba(0,0,0,0.5)` → `#00000080`; other values come back trimmed and lowercased. */
export function normalizeColor(value: string): string {
  const v = value.trim().toLowerCase();
  const m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v);
  if (!m) return v;
  const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  const alphaRaw = m[4];
  const alpha = alphaRaw === undefined ? 1 : alphaRaw.endsWith('%') ? Number(alphaRaw.slice(0, -1)) / 100 : Number(alphaRaw);
  return `#${hex(Number(m[1]))}${hex(Number(m[2]))}${hex(Number(m[3]))}${alpha < 1 ? hex(alpha * 255) : ''}`;
}

export const isTransparent = (color: string): boolean => {
  const v = normalizeColor(color);
  return v === 'transparent' || /^#[0-9a-f]{6}00$/.test(v) || v === '';
};

/** First family of a `font-family` list, unquoted. */
export const primaryFamily = (value: string): string => value.split(',')[0]!.trim().replace(/^["']|["']$/g, '');

/** Every `--name: value` declared on the root in readable stylesheets, skipping the extension's own. */
export function rootVariableDeclarations(doc: Document): Map<string, string> {
  const found = new Map<string, string>();
  const visit = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      // Layers group base styles; media and supports blocks are variants (e.g. dark mode) and are skipped.
      // Feature checks, not class names: those are minified away. A layer block has a name and rules, no condition.
      if ('cssRules' in rule && 'name' in rule && !('conditionText' in rule) && !('media' in rule) && !('selectorText' in rule)) {
        visit((rule as unknown as CSSGroupingRule).cssRules);
        continue;
      }
      if (!('selectorText' in rule) || !('style' in rule)) continue;
      const selectors = String((rule as CSSStyleRule).selectorText).split(',').map((s) => s.trim());
      if (!selectors.some((s) => s === ':root' || s === 'html' || s === 'body' || s === ':host')) continue;
      const style = (rule as CSSStyleRule).style;
      for (let i = 0; i < style.length; i++) {
        const name = style.item(i);
        if (name.startsWith('--')) found.set(name, style.getPropertyValue(name).trim());
      }
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) {
    const owner = sheet.ownerNode as Element | null;
    if (owner?.hasAttribute?.('data-hew-design-system') || owner?.hasAttribute?.('data-hew-style')) continue;
    try {
      visit(sheet.cssRules);
    } catch {
      // Cross-origin stylesheets cannot be read; computed styles still cover them.
    }
  }
  for (let i = 0; i < doc.documentElement.style.length; i++) {
    const name = doc.documentElement.style.item(i);
    if (name.startsWith('--')) found.set(name, doc.documentElement.style.getPropertyValue(name).trim());
  }
  return found;
}
