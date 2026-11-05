type CheckVisibility = (options?: { checkOpacity?: boolean; checkVisibilityCSS?: boolean }) => boolean;

/**
 * Whether an element is rendered. Uses the browser's `checkVisibility()` where available;
 * otherwise (jsdom) walks ancestors for display: none, visibility: hidden and the hidden attribute.
 */
export function isRendered(el: Element): boolean {
  const check = (el as Element & { checkVisibility?: CheckVisibility }).checkVisibility;
  if (typeof check === 'function') return check.call(el, { checkVisibilityCSS: true });
  if (!el.isConnected) return false;
  const view = el.ownerDocument.defaultView;
  for (let node: Element | null = el; node; node = node.parentElement) {
    if ((node as HTMLElement).hidden) return false;
    const style = view?.getComputedStyle(node);
    if (style?.display === 'none') return false;
    if (node === el && style?.visibility === 'hidden') return false;
  }
  return true;
}
