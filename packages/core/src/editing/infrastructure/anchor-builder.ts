import { ElementAnchor } from '../domain';
import { cssEscape, pageText } from './dom-utils';

/** Builds the shortest selector (id → data-testid → nth-of-type path) that uniquely matches `el`. */
export function uniqueSelector(el: Element): string {
  const doc = el.ownerDocument;
  const isUnique = (selector: string) => {
    const matches = doc.querySelectorAll(selector);
    return matches.length === 1 && matches[0] === el;
  };

  const segments: string[] = [];
  let node: Element | null = el;
  while (node && node !== doc.documentElement) {
    if (node.id && doc.querySelectorAll(`#${cssEscape(node.id)}`).length === 1) {
      segments.unshift(`#${cssEscape(node.id)}`);
      const selector = segments.join(' > ');
      if (isUnique(selector)) return selector;
    } else {
      segments.unshift(segmentFor(node));
      const selector = segments.join(' > ');
      if (isUnique(selector)) return selector;
    }
    node = node.parentElement;
  }
  return ['html', ...segments].join(' > ');
}

function segmentFor(node: Element): string {
  const tag = node.tagName.toLowerCase();
  const testId = node.getAttribute('data-testid');
  if (testId) return `${tag}[data-testid="${testId.replace(/"/g, '\\"')}"]`;
  const parent = node.parentElement;
  if (!parent) return tag;
  const sameTag = Array.from(parent.children).filter((c) => c.tagName === node.tagName);
  return sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(node) + 1})` : tag;
}

export function buildAnchor(el: Element): ElementAnchor {
  const result = ElementAnchor.create({
    selector: uniqueSelector(el),
    tag: el.tagName.toLowerCase(),
    role: el.getAttribute('role') ?? undefined,
    textFingerprint: pageText(el),
  });
  if (!result.ok) throw result.error;
  return result.value;
}

/** Short human label for an element, e.g. `button#save.primary`. */
export function describeElement(el: Element): string {
  const id = el.id ? `#${el.id}` : '';
  const classes = Array.from(el.classList)
    .slice(0, 2)
    .map((c) => `.${c}`)
    .join('');
  return `${el.tagName.toLowerCase()}${id}${classes}`;
}
