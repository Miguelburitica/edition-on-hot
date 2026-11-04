import { err, ok, type Result } from '../../shared/domain';
import {
  AnchorNotFoundError,
  PatchApplyError,
  type AppliedOp,
  type ElementAnchor,
  type PageGateway,
  type PatchOp,
} from '../domain';
import type { DomAnchorResolver } from './dom-anchor-resolver';
import { CHANGESET_ATTR } from './dom-utils';
import type { HtmlSanitizer } from './html-sanitizer';
import { scopeCss } from './scoped-css';

type RevertToken =
  | { kind: 'removeNodes'; nodes: Node[] }
  | { kind: 'unreplace'; original: Element; inserted: Node[]; parent: Node; next: Node | null }
  | { kind: 'restoreAttr'; el: Element; name: string; previous: string | null }
  | { kind: 'restoreChildren'; el: Element; children: Node[] }
  | { kind: 'reinsert'; el: Element; parent: Node; next: Node | null };

/** Applies patch ops to a live document and records exact inverses. */
export class DomPageGateway implements PageGateway {
  constructor(
    private readonly doc: Document,
    private readonly resolver: DomAnchorResolver,
    private readonly sanitizer: HtmlSanitizer,
  ) {}

  apply(op: PatchOp, changesetId: string): Result<AppliedOp, AnchorNotFoundError | PatchApplyError> {
    if (op.type === 'addCss') return ok({ op, revertToken: this.addCss(op.css, changesetId) });

    const target = this.resolve(op.target);
    if (!target.ok) return target;
    const el = target.value;

    switch (op.type) {
      case 'insert': {
        const nodes = this.fragmentNodes(op.html, changesetId);
        if (!nodes.ok) return nodes;
        if (op.position === 'before') el.before(...nodes.value);
        else if (op.position === 'after') el.after(...nodes.value);
        else if (op.position === 'prepend') el.prepend(...nodes.value);
        else el.append(...nodes.value);
        return ok({ op, revertToken: { kind: 'removeNodes', nodes: nodes.value } satisfies RevertToken });
      }
      case 'replace': {
        const parent = el.parentNode;
        if (!parent) return err(new PatchApplyError('The element to replace is detached from the page.'));
        const nodes = this.fragmentNodes(op.html, changesetId);
        if (!nodes.ok) return nodes;
        const next = el.nextSibling;
        el.replaceWith(...nodes.value);
        return ok({
          op,
          revertToken: { kind: 'unreplace', original: el, inserted: nodes.value, parent, next } satisfies RevertToken,
        });
      }
      case 'setStyle': {
        const previous = el.getAttribute('style');
        const style = (el as HTMLElement).style;
        if (!style) return err(new PatchApplyError('The target element cannot be styled.'));
        for (const [prop, raw] of Object.entries(op.styles)) {
          const important = /\s*!important\s*$/i.test(raw);
          style.setProperty(prop, raw.replace(/\s*!important\s*$/i, ''), important ? 'important' : '');
        }
        return ok({ op, revertToken: { kind: 'restoreAttr', el, name: 'style', previous } satisfies RevertToken });
      }
      case 'setAttr': {
        const previous = el.getAttribute(op.name);
        if (op.value === null) el.removeAttribute(op.name);
        else el.setAttribute(op.name, op.value);
        return ok({ op, revertToken: { kind: 'restoreAttr', el, name: op.name, previous } satisfies RevertToken });
      }
      case 'setText': {
        const children = Array.from(el.childNodes);
        el.textContent = op.text;
        return ok({ op, revertToken: { kind: 'restoreChildren', el, children } satisfies RevertToken });
      }
      case 'remove': {
        const parent = el.parentNode;
        if (!parent) return err(new PatchApplyError('The element to remove is detached from the page.'));
        const next = el.nextSibling;
        el.remove();
        return ok({ op, revertToken: { kind: 'reinsert', el, parent, next } satisfies RevertToken });
      }
    }
  }

  revert(applied: AppliedOp): void {
    const token = applied.revertToken as RevertToken;
    switch (token.kind) {
      case 'removeNodes':
        for (const node of token.nodes) node.parentNode?.removeChild(node);
        return;
      case 'unreplace':
        token.parent.insertBefore(token.original, token.inserted[0]?.parentNode ? token.inserted[0] : token.next);
        for (const node of token.inserted) node.parentNode?.removeChild(node);
        return;
      case 'restoreAttr':
        if (token.previous === null) token.el.removeAttribute(token.name);
        else token.el.setAttribute(token.name, token.previous);
        return;
      case 'restoreChildren':
        token.el.replaceChildren(...token.children);
        return;
      case 'reinsert':
        token.parent.insertBefore(token.el, token.next);
        return;
    }
  }

  private resolve(anchor: ElementAnchor): Result<Element, AnchorNotFoundError> {
    const el = this.resolver.resolve(anchor);
    return el ? ok(el) : err(new AnchorNotFoundError(anchor.selector));
  }

  private fragmentNodes(html: string, changesetId: string): Result<Node[], PatchApplyError> {
    const fragment = this.sanitizer.toFragment(html);
    const nodes = Array.from(fragment.childNodes).map((n) => this.doc.adoptNode(n));
    if (!nodes.some((n) => n.nodeType === 1 || (n.textContent ?? '').trim() !== '')) {
      return err(new PatchApplyError('The proposed HTML was empty after removing unsafe content.'));
    }
    for (const node of nodes) {
      if (node.nodeType === 1) (node as Element).setAttribute(CHANGESET_ATTR, changesetId);
    }
    return ok(nodes);
  }

  private addCss(css: string, changesetId: string): RevertToken {
    const style = this.doc.createElement('style');
    style.setAttribute('data-hew-style', changesetId);
    style.textContent = scopeCss(css, `[${CHANGESET_ATTR}="${changesetId}"]`);
    (this.doc.head ?? this.doc.documentElement).appendChild(style);
    return { kind: 'removeNodes', nodes: [style] };
  }
}
