export const OVERLAY_ATTR = 'data-hew-overlay';
export const CHANGESET_ATTR = 'data-hew-cs';
/** Marks a selection that a changeset's stylesheet rules apply to (space-separated changeset ids). */
export const SCOPE_ATTR = 'data-hew-scope';

export function cssEscape(value: string): string {
  return value.replace(/^(\d)|[^a-zA-Z0-9_-]/g, (match, digit: string | undefined) =>
    digit !== undefined ? `\\3${digit} ` : `\\${match}`,
  );
}

export function isInsideOverlay(el: Element): boolean {
  return el.closest(`[${OVERLAY_ATTR}]`) !== null;
}

export function normalizedText(el: Element): string {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** Text of an element as the page wrote it: content inserted by the extension is left out. */
export function pageText(el: Element): string {
  const walker = el.ownerDocument.createTreeWalker(el, 4 /* NodeFilter.SHOW_TEXT */);
  let text = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.parentElement?.closest(`[${CHANGESET_ATTR}]`)) text += node.textContent ?? '';
  }
  return text.replace(/\s+/g, ' ').trim();
}
