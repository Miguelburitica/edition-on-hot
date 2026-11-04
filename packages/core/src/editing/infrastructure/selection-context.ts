import type { ElementAnchor } from '../domain';
import { buildAnchor, describeElement } from './anchor-builder';
import { OVERLAY_ATTR } from './dom-utils';

export const TARGET_ATTR = 'data-hew-target';
/** Used when the caller passes no budget; matches the AI context's standard profile. */
const DEFAULT_MAX_TARGETS = 40;
const MAX_ANCESTORS = 5;
const STYLE_PROPS = [
  'display',
  'color',
  'background-color',
  'font-family',
  'font-size',
  'font-weight',
  'line-height',
  'padding',
  'margin',
  'border',
  'border-radius',
  'gap',
  'box-shadow',
];

export interface SelectionContext {
  /** Selection HTML where each targetable element carries `data-hew-target="tN"`; t0 is the selection. */
  readonly html: string;
  readonly ancestors: readonly string[];
  readonly styles: Readonly<Record<string, string>>;
  readonly targets: ReadonlyMap<string, ElementAnchor>;
  readonly pageUrl: string;
  readonly pageTitle: string;
}

/** Serializes a selected element for the model without typed form values or extension markup. */
export interface SelectionContextOptions {
  /** How many elements, starting with the selection itself as t0, are labeled as targets. */
  readonly maxTargets?: number;
}

export function buildSelectionContext(el: Element, options: SelectionContextOptions = {}): SelectionContext {
  const maxTargets = Math.max(1, options.maxTargets ?? DEFAULT_MAX_TARGETS);
  const doc = el.ownerDocument;
  const view = doc.defaultView;
  const clone = el.cloneNode(true) as Element;

  const originals = [el, ...Array.from(el.querySelectorAll('*'))];
  const copies = [clone, ...Array.from(clone.querySelectorAll('*'))];
  const targets = new Map<string, ElementAnchor>();
  originals.forEach((original, i) => {
    const copy = copies[i];
    if (!copy) return;
    if (original.hasAttribute(OVERLAY_ATTR)) {
      copy.remove();
      return;
    }
    stripFormValues(copy);
    if (targets.size < maxTargets) {
      const id = `t${targets.size}`;
      copy.setAttribute(TARGET_ATTR, id);
      targets.set(id, buildAnchor(original));
    }
  });

  const ancestors: string[] = [];
  for (let p = el.parentElement; p && ancestors.length < MAX_ANCESTORS; p = p.parentElement) {
    ancestors.push(describeElement(p));
  }

  const styles: Record<string, string> = {};
  const computed = view?.getComputedStyle(el);
  for (const prop of STYLE_PROPS) {
    const value = computed?.getPropertyValue(prop);
    if (value) styles[prop] = value;
  }

  return {
    html: clone.outerHTML,
    ancestors,
    styles,
    targets,
    pageUrl: doc.location?.href ?? '',
    pageTitle: doc.title,
  };
}

function stripFormValues(el: Element): void {
  const tag = el.tagName.toLowerCase();
  if (tag === 'input') el.removeAttribute('value');
  if (tag === 'textarea') el.textContent = '';
}
