export const OVERLAY_ATTR = 'data-hew-overlay';
export const CHANGESET_ATTR = 'data-hew-cs';

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
