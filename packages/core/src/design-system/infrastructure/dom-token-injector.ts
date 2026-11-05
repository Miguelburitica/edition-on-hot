import { CSS_VAR, isSafeTokenValue } from '../domain';
import { rootVariableDeclarations } from './css-values';

export const DESIGN_SYSTEM_ATTR = 'data-hew-design-system';

/**
 * Defines the active design system's tokens as root custom properties, skipping any the page
 * already defines, so `var(--token)` in previews resolves without overriding the page.
 */
export class DomTokenInjector {
  constructor(
    private readonly doc: Document,
    private readonly win: Window,
  ) {}

  /** Replaces the injected tokens; `null` or an empty map removes them. Returns how many were defined. */
  inject(variables: Readonly<Record<string, string>> | null): number {
    this.clear();
    if (!variables) return 0;
    const declared = rootVariableDeclarations(this.doc);
    const computed = this.win.getComputedStyle(this.doc.documentElement);
    const lines: string[] = [];
    for (const [name, value] of Object.entries(variables)) {
      if (!CSS_VAR.test(name) || !isSafeTokenValue(value)) continue;
      if (declared.has(name) || computed.getPropertyValue(name).trim() !== '') continue;
      lines.push(`  ${name}: ${value.trim()};`);
    }
    if (lines.length === 0) return 0;
    const style = this.doc.createElement('style');
    style.setAttribute(DESIGN_SYSTEM_ATTR, '');
    style.textContent = `:root {\n${lines.join('\n')}\n}`;
    (this.doc.head ?? this.doc.documentElement).appendChild(style);
    return lines.length;
  }

  clear(): void {
    for (const el of Array.from(this.doc.querySelectorAll(`style[${DESIGN_SYSTEM_ATTR}]`))) el.remove();
  }
}
