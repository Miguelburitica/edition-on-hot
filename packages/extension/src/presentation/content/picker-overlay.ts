const MONO = `'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace`;
const STYLES = `
  :host { all: initial; }
  .box {
    position: fixed; pointer-events: none; box-sizing: border-box; border-radius: 3px;
    transition: top 60ms, left 60ms, width 60ms, height 60ms; display: none;
  }
  .hover { border: 2px solid #1f5cff; background: rgba(31, 92, 255, 0.12); }
  .selected { border: 2px dashed #e8740e; }
  .label {
    position: fixed; pointer-events: none; display: none; gap: 8px; height: 20px; padding: 0 7px;
    border-radius: 4px 4px 4px 0; font: 400 11px/20px ${MONO}; white-space: nowrap;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2); max-width: calc(100vw - 16px); overflow: hidden; text-overflow: ellipsis;
  }
  .label.below { border-radius: 0 4px 4px 4px; }
  .label .size { opacity: 0.75; }
  .hover-label { background: #1f5cff; color: #fff; }
  .selected-label { background: #e8740e; color: #1b1006; }
  .hint {
    position: fixed; left: 12px; bottom: 12px; display: none; align-items: center; gap: 8px;
    background: #16161b; color: #fbfaf7; border-radius: 6px; padding: 6px 10px;
    font: 12px/1.4 Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.18);
  }
  .hint .live { width: 6px; height: 6px; border-radius: 50%; background: #7c9bff; }
  .hint .k { font-family: ${MONO}; font-size: 11px; }
  @media (prefers-reduced-motion: reduce) { .box { transition: none; } }
`;
/** Hover is drawn 3px outside the element and the selection 5px, so neither hides its edges. */
const HOVER_OUTSET = 3;
const SELECTED_OUTSET = 5;

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
  private readonly hoverLabel: HTMLElement;
  private readonly selectedLabel: HTMLElement;
  private readonly hint: HTMLElement;
  /** Crosshair cursor on the page while picking; removed when picking stops. */
  private readonly cursor: HTMLStyleElement;
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
    this.hoverLabel = this.labelEl('hover-label');
    this.selectedLabel = this.labelEl('selected-label');
    this.hint = doc.createElement('div');
    this.hint.className = 'hint';
    const live = doc.createElement('span');
    live.className = 'live';
    const text = doc.createElement('span');
    const key = doc.createElement('span');
    key.className = 'k';
    key.textContent = 'Esc';
    text.append('Click an element · ', key, ' to cancel');
    this.hint.append(live, text);
    root.append(style, this.selectedBox, this.hoverBox, this.selectedLabel, this.hoverLabel, this.hint);
    this.cursor = doc.createElement('style');
    this.cursor.setAttribute(options.hostAttribute, '');
    this.cursor.textContent = '*, *::before, *::after { cursor: crosshair !important; }';

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
    if (!this.cursor.isConnected) (this.doc.head ?? this.doc.documentElement).append(this.cursor);
    this.scheduleDraw();
    this.doc.addEventListener('mousemove', this.onMove, true);
    this.doc.addEventListener('click', this.onClick, true);
    this.doc.addEventListener('mousedown', this.swallow, true);
    this.doc.addEventListener('mouseup', this.swallow, true);
    this.doc.addEventListener('keydown', this.onKey, true);
  }

  stop(): void {
    this.picking = null;
    this.hovered = null;
    this.cursor.remove();
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
    const selected = this.selected?.isConnected ? this.selected : null;
    const hovered = this.picking ? this.hovered : null;
    place(this.selectedBox, selected, SELECTED_OUTSET);
    place(this.hoverBox, hovered, HOVER_OUTSET);
    this.drawLabel(this.hoverLabel, hovered, HOVER_OUTSET, true);
    // While picking, only the hovered element is named, so the two labels never overlap.
    this.drawLabel(this.selectedLabel, this.picking ? null : selected, SELECTED_OUTSET, false);
    this.hint.style.display = this.picking ? 'flex' : 'none';
  }

  /** Names the element above its box, or below it when the top of the viewport would clip it. */
  private drawLabel(label: HTMLElement, el: Element | null, outset: number, withSize: boolean): void {
    if (!el) {
      label.style.display = 'none';
      return;
    }
    const rect = el.getBoundingClientRect();
    const [name, size] = label.children as unknown as [HTMLElement, HTMLElement];
    name.textContent = this.options.describe(el);
    size.textContent = withSize ? `${Math.round(rect.width)}×${Math.round(rect.height)}` : '';
    size.style.display = withSize ? 'inline' : 'none';
    const above = rect.top - outset - 22 >= 0;
    label.classList.toggle('below', !above);
    label.style.display = 'flex';
    label.style.left = `${Math.max(0, rect.left - outset)}px`;
    label.style.top = `${above ? rect.top - outset - 20 : rect.bottom + outset}px`;
  }

  private labelEl(kind: string): HTMLElement {
    const el = this.doc.createElement('div');
    el.className = `label ${kind}`;
    const name = this.doc.createElement('span');
    const size = this.doc.createElement('span');
    size.className = 'size';
    el.append(name, size);
    return el;
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

function place(box: HTMLElement, el: Element | null, outset: number): void {
  if (!el) {
    box.style.display = 'none';
    return;
  }
  const rect = el.getBoundingClientRect();
  Object.assign(box.style, {
    display: 'block',
    left: `${rect.left - outset}px`,
    top: `${rect.top - outset}px`,
    width: `${rect.width + outset * 2}px`,
    height: `${rect.height + outset * 2}px`,
  });
}
