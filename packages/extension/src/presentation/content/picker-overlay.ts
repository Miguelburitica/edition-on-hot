const STYLES = `
  :host { all: initial; }
  .box {
    position: fixed; pointer-events: none; box-sizing: border-box; border-radius: 3px;
    transition: top 60ms, left 60ms, width 60ms, height 60ms; display: none;
  }
  .hover { border: 2px solid #3b82f6; background: rgba(59, 130, 246, 0.08); }
  .selected { border: 2px dashed #f97316; }
  .label {
    position: fixed; pointer-events: none; display: none; padding: 2px 6px; border-radius: 3px;
    font: 600 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace; color: #fff; background: #3b82f6;
    white-space: nowrap;
  }
`;

export interface PickerOverlayOptions {
  /** Attribute that marks the overlay host so anchors and resolvers skip it. */
  readonly hostAttribute: string;
  readonly describe: (el: Element) => string;
}

/**
 * Element picker drawn in a closed shadow root. While picking, pointer events are captured on the
 * document so the page never receives the click.
 */
export class PickerOverlay {
  private readonly host: HTMLElement;
  private readonly hoverBox: HTMLElement;
  private readonly selectedBox: HTMLElement;
  private readonly label: HTMLElement;
  private hovered: Element | null = null;
  private selected: Element | null = null;
  private picking: { onPick: (el: Element) => void; onCancel: () => void } | null = null;
  private frame = 0;

  constructor(
    private readonly doc: Document,
    private readonly options: PickerOverlayOptions,
  ) {
    this.host = doc.createElement('hew-overlay');
    this.host.setAttribute(options.hostAttribute, '');
    Object.assign(this.host.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '2147483647' });
    const root = this.host.attachShadow({ mode: 'closed' });
    const style = doc.createElement('style');
    style.textContent = STYLES;
    this.hoverBox = this.box('hover');
    this.selectedBox = this.box('selected');
    this.label = doc.createElement('div');
    this.label.className = 'label';
    root.append(style, this.selectedBox, this.hoverBox, this.label);

    const reposition = () => this.scheduleDraw();
    doc.defaultView?.addEventListener('scroll', reposition, true);
    doc.defaultView?.addEventListener('resize', reposition);
  }

  get isPicking(): boolean {
    return this.picking !== null;
  }

  start(onPick: (el: Element) => void, onCancel: () => void): void {
    this.mount();
    this.picking = { onPick, onCancel };
    this.doc.addEventListener('mousemove', this.onMove, true);
    this.doc.addEventListener('click', this.onClick, true);
    this.doc.addEventListener('mousedown', this.swallow, true);
    this.doc.addEventListener('mouseup', this.swallow, true);
    this.doc.addEventListener('keydown', this.onKey, true);
  }

  stop(): void {
    this.picking = null;
    this.hovered = null;
    this.doc.removeEventListener('mousemove', this.onMove, true);
    this.doc.removeEventListener('click', this.onClick, true);
    this.doc.removeEventListener('mousedown', this.swallow, true);
    this.doc.removeEventListener('mouseup', this.swallow, true);
    this.doc.removeEventListener('keydown', this.onKey, true);
    this.scheduleDraw();
  }

  showSelection(el: Element | null): void {
    this.mount();
    this.selected = el;
    this.scheduleDraw();
  }

  private readonly onMove = (event: MouseEvent) => {
    const target = this.pageElementAt(event.clientX, event.clientY);
    if (target !== this.hovered) {
      this.hovered = target;
      this.scheduleDraw();
    }
  };

  private readonly onClick = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    const target = this.pageElementAt(event.clientX, event.clientY) ?? this.hovered;
    const picking = this.picking;
    if (!target || !picking) return;
    this.stop();
    picking.onPick(target);
  };

  private readonly swallow = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  private readonly onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    const picking = this.picking;
    this.stop();
    picking?.onCancel();
  };

  /** The host has `pointer-events: none`, so hit-testing already skips the overlay. */
  private pageElementAt(x: number, y: number): Element | null {
    const el = this.doc.elementFromPoint(x, y);
    if (!el || el === this.doc.documentElement || el === this.doc.body) return null;
    return el.closest(`[${this.options.hostAttribute}]`) ? null : el;
  }

  private scheduleDraw(): void {
    const view = this.doc.defaultView;
    if (!view) return;
    view.cancelAnimationFrame(this.frame);
    this.frame = view.requestAnimationFrame(() => this.draw());
  }

  private draw(): void {
    place(this.selectedBox, this.selected?.isConnected ? this.selected : null);
    const hovered = this.picking ? this.hovered : null;
    place(this.hoverBox, hovered);
    if (hovered) {
      const rect = hovered.getBoundingClientRect();
      this.label.textContent = this.options.describe(hovered);
      this.label.style.display = 'block';
      this.label.style.left = `${Math.max(0, rect.left)}px`;
      this.label.style.top = `${rect.top > 22 ? rect.top - 22 : rect.bottom + 4}px`;
    } else {
      this.label.style.display = 'none';
    }
  }

  private box(kind: string): HTMLElement {
    const el = this.doc.createElement('div');
    el.className = `box ${kind}`;
    return el;
  }

  private mount(): void {
    if (!this.host.isConnected) this.doc.documentElement.append(this.host);
  }
}

function place(box: HTMLElement, el: Element | null): void {
  if (!el) {
    box.style.display = 'none';
    return;
  }
  const rect = el.getBoundingClientRect();
  Object.assign(box.style, {
    display: 'block',
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`,
  });
}
