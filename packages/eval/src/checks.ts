/** A check returns null when it holds, or a short description of what is wrong. */
export type Check = (doc: Document) => string | null;

export function style(el: Element, property: string): string {
  const computed = el.ownerDocument.defaultView?.getComputedStyle(el).getPropertyValue(property) ?? '';
  return computed || (el as HTMLElement).style?.getPropertyValue(property) || '';
}

const NAMED_REDS = new Set(['red', 'crimson', 'firebrick', 'darkred', 'indianred', 'tomato', 'orangered']);

/** True for colors whose red channel clearly dominates. */
export function isReddish(color: string): boolean {
  const value = color.trim().toLowerCase();
  if (NAMED_REDS.has(value)) return true;
  let r: number, g: number, b: number;
  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(value);
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(value);
  if (rgb) [r, g, b] = [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  else if (hex) {
    const h = hex[1]!.length === 3 ? [...hex[1]!].map((c) => c + c).join('') : hex[1]!;
    [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
  } else return false;
  return r >= 150 && r - Math.max(g, b) >= 80;
}

export function backgroundIsReddish(el: Element): boolean {
  return [style(el, 'background-color'), style(el, 'background')].some((v) =>
    v.split(/\s+(?![^(]*\))/).some((part) => isReddish(part)),
  );
}

export function isHidden(el: Element): boolean {
  for (let node: Element | null = el; node; node = node.parentElement) {
    if ((node as HTMLElement).hidden || style(node, 'display') === 'none' || style(node, 'visibility') === 'hidden') return true;
  }
  return false;
}

export const normalize = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

export function byText(doc: Document, selector: string, text: string): Element | null {
  return [...doc.querySelectorAll(selector)].find((el) => normalize(el.textContent).includes(text)) ?? null;
}

/** Elements added by the patch carry `data-hew-cs`. */
export function inserted(doc: Document): Element[] {
  return [...doc.querySelectorAll('[data-hew-cs]')];
}

/** Text of an element with a space between text nodes, so sibling spans don't run together. */
export function words(el: Element | null | undefined): string {
  if (!el) return '';
  const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  const parts: string[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) parts.push(node.textContent ?? '');
  return normalize(parts.join(' '));
}

/** The first element the patch inserted whose text matches, wherever it landed. */
export function insertedWith(doc: Document, text: RegExp): Element | null {
  return inserted(doc).find((el) => text.test(words(el))) ?? null;
}

/** True when `el` comes before `ref` in document order and is not inside it. */
export function isBefore(el: Element, ref: Element): boolean {
  return !ref.contains(el) && Boolean(el.compareDocumentPosition(ref) & 4 /* DOCUMENT_POSITION_FOLLOWING */);
}

export function isAfter(el: Element, ref: Element): boolean {
  return !ref.contains(el) && Boolean(el.compareDocumentPosition(ref) & 2 /* DOCUMENT_POSITION_PRECEDING */);
}

/** True when the element shows a border on its top edge. */
export function hasBorder(el: Element): boolean {
  const width = style(el, 'border-top-width') || style(el, 'border-width');
  const kind = style(el, 'border-top-style') || style(el, 'border-style');
  return kind !== '' && kind !== 'none' && kind !== 'hidden' && width !== '0px';
}

/** jsdom doesn't expand the border-radius shorthand into longhands, so either may carry it. */
export function hasRadius(el: Element): boolean {
  return ['border-top-left-radius', 'border-radius'].some((p) => {
    const radius = style(el, p).trim();
    return radius !== '' && !/^0(px|%)?$/.test(radius);
  });
}

/** flex-grow from the longhand or the `flex` shorthand ("1", "1 1 0%"). */
export function flexGrow(el: Element): number {
  const grow = style(el, 'flex-grow') || style(el, 'flex').split(/\s+/)[0] || '0';
  return Number.parseFloat(grow) || 0;
}
