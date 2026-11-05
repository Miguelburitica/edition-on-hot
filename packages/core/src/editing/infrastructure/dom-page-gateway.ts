import { err, ok, type Result } from '../../shared/domain';
import {
  AnchorNotFoundError,
  PatchApplyError,
  type AppliedOp,
  type ElementAnchor,
  type OpWarning,
  type PageGateway,
  type PatchOp,
} from '../domain';
import type { DomAnchorResolver } from './dom-anchor-resolver';
import { CHANGESET_ATTR, SCOPE_ATTR } from './dom-utils';
import type { HtmlSanitizer } from './html-sanitizer';
import { scopeCss, type ScopedRule } from './scoped-css';
import { isRendered } from './visibility';

type RevertToken =
  | { kind: 'removeNodes'; nodes: Node[] }
  | { kind: 'unreplace'; original: Element; inserted: Node[]; parent: Node; next: Node | null }
  | { kind: 'restoreAttr'; el: Element; name: string; previous: string | null }
  | { kind: 'restoreChildren'; el: Element; children: Node[] }
  | { kind: 'reinsert'; el: Element; parent: Node; next: Node | null }
  | { kind: 'removeStylesheet'; style: Element; scope: { el: Element; previous: string | null } | null; rules: readonly ScopedRule[] };

const hidden = (detail: string): OpWarning => ({ kind: 'hidden-target', detail });

/** Applies patch ops to a live document, records exact inverses and flags ops with no visible effect. */
export class DomPageGateway implements PageGateway {
  /**
   * Elements resolved for the changeset being applied. Later ops of the same changeset reuse them,
   * because earlier ops (setText, replace of children…) may have changed the text an anchor matches.
   */
  private resolved: { changesetId: string; elements: Map<string, Element> } | null = null;

  constructor(
    private readonly doc: Document,
    private readonly resolver: DomAnchorResolver,
    private readonly sanitizer: HtmlSanitizer,
  ) {}

  apply(op: PatchOp, changesetId: string): Result<AppliedOp, AnchorNotFoundError | PatchApplyError> {
    if (op.type === 'addCss') {
      const token = this.addCss(op.css, op.scope, changesetId);
      return token.ok ? ok({ op, revertToken: token.value }) : token;
    }

    const target = this.resolve(op.target, changesetId);
    if (!target.ok) return target;
    const el = target.value;
    // Only targets that were already hidden are flagged, so intentional hiding is not a warning.
    const wasHidden = !isRendered(el);

    switch (op.type) {
      case 'insert': {
        const nodes = this.fragmentNodes(op.html, changesetId);
        if (!nodes.ok) return nodes;
        if (op.position === 'before') el.before(...nodes.value);
        else if (op.position === 'after') el.after(...nodes.value);
        else if (op.position === 'prepend') el.prepend(...nodes.value);
        else el.append(...nodes.value);
        return ok({
          op,
          revertToken: { kind: 'removeNodes', nodes: nodes.value } satisfies RevertToken,
          warning: noneRendered(nodes.value) ? hidden('the inserted content is not visible where it was placed') : undefined,
        });
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
          warning: noneRendered(nodes.value) ? hidden('the replacement is not visible') : undefined,
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
        return ok({ op, revertToken: { kind: 'restoreAttr', el, name: 'style', previous } satisfies RevertToken, warning: hiddenTarget(wasHidden, op.target) });
      }
      case 'setAttr': {
        const previous = el.getAttribute(op.name);
        if (op.value === null) el.removeAttribute(op.name);
        else el.setAttribute(op.name, op.value);
        return ok({ op, revertToken: { kind: 'restoreAttr', el, name: op.name, previous } satisfies RevertToken, warning: hiddenTarget(wasHidden, op.target) });
      }
      case 'setText': {
        const children = Array.from(el.childNodes);
        el.textContent = op.text;
        return ok({ op, revertToken: { kind: 'restoreChildren', el, children } satisfies RevertToken, warning: hiddenTarget(wasHidden, op.target) });
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

  /** Stylesheet rules are checked once all ops are applied, so rules for later inserts count. */
  review(applied: readonly AppliedOp[]): AppliedOp[] {
    return applied.map((a) => {
      const token = a.revertToken as RevertToken;
      if (token.kind !== 'removeStylesheet' || a.warning) return a;
      const unmatched = token.rules.filter((rule) => !this.matchesAnything(rule.selector));
      if (unmatched.length === 0) return a;
      const names = unmatched.map((r) => `"${r.original.slice(0, 80)}"`).join(', ');
      return { ...a, warning: { kind: 'no-match', detail: `${unmatched.length === 1 ? 'rule' : 'rules'} ${names} matched nothing` } };
    });
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
        restoreAttribute(token.el, token.name, token.previous);
        return;
      case 'restoreChildren':
        token.el.replaceChildren(...token.children);
        return;
      case 'reinsert':
        token.parent.insertBefore(token.el, token.next);
        return;
      case 'removeStylesheet':
        token.style.remove();
        if (token.scope) restoreAttribute(token.scope.el, SCOPE_ATTR, token.scope.previous);
        return;
    }
  }

  private resolve(anchor: ElementAnchor, changesetId: string): Result<Element, AnchorNotFoundError> {
    if (this.resolved?.changesetId !== changesetId) this.resolved = { changesetId, elements: new Map() };
    const key = JSON.stringify(anchor.toJSON());
    const cached = this.resolved.elements.get(key);
    if (cached?.isConnected) return ok(cached);
    const el = this.resolver.resolve(anchor);
    if (!el) return err(new AnchorNotFoundError(anchor.selector));
    this.resolved.elements.set(key, el);
    return ok(el);
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

  /**
   * Rules apply to the changeset's inserted elements and, when a scope is given, to the selected
   * element and its descendants, which are marked with the changeset id until revert.
   */
  private addCss(css: string, scopeAnchor: ElementAnchor | undefined, changesetId: string): Result<RevertToken, AnchorNotFoundError> {
    let scope: { el: Element; previous: string | null } | null = null;
    const scopes = [`[${CHANGESET_ATTR}="${changesetId}"]`];
    if (scopeAnchor) {
      const el = this.resolve(scopeAnchor, changesetId);
      if (!el.ok) return el;
      const previous = el.value.getAttribute(SCOPE_ATTR);
      el.value.setAttribute(SCOPE_ATTR, [previous, changesetId].filter(Boolean).join(' '));
      scope = { el: el.value, previous };
      scopes.push(`[${SCOPE_ATTR}~="${changesetId}"]`);
    }
    const scoped = scopeCss(css, scopes);
    const style = this.doc.createElement('style');
    style.setAttribute('data-hew-style', changesetId);
    style.textContent = scoped.css;
    (this.doc.head ?? this.doc.documentElement).appendChild(style);
    return ok({ kind: 'removeStylesheet', style, scope, rules: scoped.rules });
  }

  private matchesAnything(selector: string): boolean {
    // Interaction states and pseudo-elements can't be matched by querySelector; check the element itself.
    const matchable = selector
      .replace(/::?(before|after|placeholder|marker|selection|first-line|first-letter|backdrop)\b/gi, '')
      .replace(/:(hover|focus|focus-visible|focus-within|active|visited|target)\b/gi, '');
    try {
      return this.doc.querySelector(matchable) !== null;
    } catch {
      return true; // a selector we can't evaluate is not reported as matching nothing
    }
  }
}

function hiddenTarget(wasHidden: boolean, target: ElementAnchor): OpWarning | undefined {
  return wasHidden ? hidden(`<${target.tag}> ${target.selector} is not visible on the page`) : undefined;
}

function noneRendered(nodes: readonly Node[]): boolean {
  const elements = nodes.filter((n): n is Element => n.nodeType === 1);
  return elements.length > 0 && !elements.some(isRendered);
}

function restoreAttribute(el: Element, name: string, previous: string | null): void {
  if (previous === null) el.removeAttribute(name);
  else el.setAttribute(name, previous);
}
