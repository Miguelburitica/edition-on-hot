import { ElementAnchor } from '../domain';
import { isInsideOverlay, pageText } from './dom-utils';

const FUZZY_THRESHOLD = 0.8;

/**
 * Finds the element an anchor describes. The selector match is trusted only when its tag and text
 * fingerprint agree; otherwise elements of the same tag are ranked by fingerprint similarity.
 */
export class DomAnchorResolver {
  constructor(private readonly doc: Document) {}

  resolve(anchor: ElementAnchor): Element | null {
    const bySelector = this.query(anchor.selector);
    if (bySelector && this.agrees(bySelector, anchor)) return bySelector;
    if (anchor.textFingerprint === '') return null;

    let best: Element | null = null;
    let bestScore = 0;
    for (const candidate of Array.from(this.doc.getElementsByTagName(anchor.tag))) {
      if (isInsideOverlay(candidate)) continue;
      const score = similarity(fingerprint(candidate), anchor.textFingerprint);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return bestScore >= FUZZY_THRESHOLD ? best : null;
  }

  private query(selector: string): Element | null {
    try {
      return this.doc.querySelector(selector);
    } catch {
      return null;
    }
  }

  private agrees(el: Element, anchor: ElementAnchor): boolean {
    return el.tagName.toLowerCase() === anchor.tag && fingerprint(el) === anchor.textFingerprint;
  }
}

function fingerprint(el: Element): string {
  return ElementAnchor.normalizeText(pageText(el));
}

/** Dice coefficient over character bigrams. */
export function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    bigrams.set(g, (bigrams.get(g) ?? 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const count = bigrams.get(g) ?? 0;
    if (count > 0) {
      bigrams.set(g, count - 1);
      overlap++;
    }
  }
  return (2 * overlap) / (a.length + b.length - 2);
}
