import { err, ok, type Result } from '../../shared/domain';
import { InvalidDesignSystemError } from './errors';
import {
  CSS_VAR,
  isComponentKind,
  isSafeExample,
  isSafeTokenValue,
  singleLine,
  isTokenGroup,
  TOKEN_NAME,
  type ComponentPattern,
  type Token,
  type TokenGroup,
} from './token';

export type DesignSystemId = string;

export interface DesignSystemProps {
  readonly id: DesignSystemId;
  readonly name: string;
  /** The site it was extracted from, or null for imported files. */
  readonly origin: string | null;
  readonly tokens: readonly Token[];
  readonly components: readonly ComponentPattern[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** True when a token on its own would pass `DesignSystem.create`. */
export function isValidToken(token: Token): boolean {
  return (
    typeof token === 'object' &&
    token !== null &&
    typeof token.name === 'string' &&
    TOKEN_NAME.test(token.name) &&
    typeof token.cssVar === 'string' &&
    CSS_VAR.test(token.cssVar) &&
    isTokenGroup(token.group) &&
    isSafeTokenValue(token.value)
  );
}

/** True when a component on its own would pass `DesignSystem.create`. */
export function isValidComponent(component: ComponentPattern): boolean {
  return (
    typeof component === 'object' &&
    component !== null &&
    typeof component.name === 'string' &&
    singleLine(component.name) !== '' &&
    component.name.length <= 80 &&
    isComponentKind(component.kind) &&
    typeof component.tag === 'string' &&
    /^[a-z][a-z0-9-]*$/.test(component.tag) &&
    Array.isArray(component.classes) &&
    isSafeExample(component.example)
  );
}

/**
 * Keeps what a draft can hold: valid tokens and components, first of each name and custom
 * property, within the size limits. Extraction from a messy page then saves what it could read.
 */
export function usableParts(draft: { tokens: readonly Token[]; components: readonly ComponentPattern[] }): {
  tokens: Token[];
  components: ComponentPattern[];
} {
  const names = new Set<string>();
  const vars = new Set<string>();
  const tokens = draft.tokens.filter((t) => {
    if (!isValidToken(t) || names.has(t.name) || vars.has(t.cssVar)) return false;
    names.add(t.name);
    vars.add(t.cssVar);
    return true;
  });
  return { tokens: tokens.slice(0, MAX_TOKENS), components: draft.components.filter(isValidComponent).slice(0, MAX_COMPONENTS) };
}

export const MAX_TOKENS = 400;
export const MAX_COMPONENTS = 40;

const GROUP_TITLES: Readonly<Record<TokenGroup, string>> = {
  color: 'Colors',
  spacing: 'Spacing',
  radius: 'Radii',
  'font-size': 'Font sizes',
  'font-family': 'Fonts',
  'font-weight': 'Font weights',
  shadow: 'Shadows',
  other: 'Other',
};
const GROUP_ORDER: readonly TokenGroup[] = ['color', 'spacing', 'radius', 'font-size', 'font-family', 'font-weight', 'shadow', 'other'];

/**
 * A product's tokens and component patterns. Invariants: a 1–80 character name, unique token
 * names and custom properties, safe token values, and bounded sizes.
 */
export class DesignSystem {
  private constructor(private readonly props: DesignSystemProps) {}

  static create(props: DesignSystemProps): Result<DesignSystem, InvalidDesignSystemError> {
    if (!Array.isArray(props.tokens) || !Array.isArray(props.components)) return err(new InvalidDesignSystemError('tokens and components must be lists'));
    const name = typeof props.name === 'string' ? singleLine(props.name) : '';
    if (name.length === 0 || name.length > 80) return err(new InvalidDesignSystemError('the name must have 1 to 80 characters'));
    if (props.tokens.length > MAX_TOKENS) return err(new InvalidDesignSystemError(`at most ${MAX_TOKENS} tokens are kept`));
    if (props.components.length > MAX_COMPONENTS) {
      return err(new InvalidDesignSystemError(`at most ${MAX_COMPONENTS} components are kept`));
    }
    const names = new Set<string>();
    const vars = new Set<string>();
    for (const token of props.tokens) {
      if (typeof token !== 'object' || token === null || typeof token.name !== 'string' || typeof token.cssVar !== 'string') {
        return err(new InvalidDesignSystemError('a token is malformed'));
      }
      if (!TOKEN_NAME.test(token.name)) return err(new InvalidDesignSystemError(`"${token.name}" is not a kebab-case token name`));
      if (!CSS_VAR.test(token.cssVar)) return err(new InvalidDesignSystemError(`"${token.cssVar}" is not a custom property`));
      if (!isTokenGroup(token.group)) return err(new InvalidDesignSystemError(`unknown token group "${token.group}"`));
      if (!isSafeTokenValue(token.value)) return err(new InvalidDesignSystemError(`token "${token.name}" has an unusable value`));
      if (names.has(token.name)) return err(new InvalidDesignSystemError(`token "${token.name}" appears twice`));
      if (vars.has(token.cssVar)) return err(new InvalidDesignSystemError(`custom property "${token.cssVar}" appears twice`));
      names.add(token.name);
      vars.add(token.cssVar);
    }
    for (const component of props.components) {
      if (typeof component !== 'object' || component === null || typeof component.name !== 'string' || !Array.isArray(component.classes)) {
        return err(new InvalidDesignSystemError('a component is malformed'));
      }
      if (!isComponentKind(component.kind)) return err(new InvalidDesignSystemError(`unknown component kind "${component.kind}"`));
      if (!/^[a-z][a-z0-9-]*$/.test(component.tag)) return err(new InvalidDesignSystemError(`invalid component tag "${component.tag}"`));
      if (singleLine(component.name) === '' || component.name.length > 80 || !isSafeExample(component.example)) {
        return err(new InvalidDesignSystemError(`component "${component.name}" is not usable`));
      }
    }
    return ok(
      new DesignSystem({
        ...props,
        name,
        tokens: props.tokens.map((t) => ({ ...t, value: t.value.trim() })),
        components: props.components.map((c) => ({ ...c, name: singleLine(c.name) })),
      }),
    );
  }

  get id(): DesignSystemId {
    return this.props.id;
  }
  get name(): string {
    return this.props.name;
  }
  get origin(): string | null {
    return this.props.origin;
  }
  get tokens(): readonly Token[] {
    return this.props.tokens;
  }
  get components(): readonly ComponentPattern[] {
    return this.props.components;
  }
  get createdAt(): Date {
    return this.props.createdAt;
  }
  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  rename(name: string, now: Date): Result<DesignSystem, InvalidDesignSystemError> {
    return DesignSystem.create({ ...this.props, name, updatedAt: now });
  }

  /**
   * A compact summary for the model, grouped and ordered, cut at a line boundary to `maxChars`.
   * Each line is complete, so a cut never leaves half a token.
   */
  guidance(maxChars: number): string {
    const fit = (lines: readonly string[], budget: number): string[] => {
      const kept: string[] = [];
      let size = 0;
      for (const line of lines) {
        if (size + line.length + 1 > budget) break;
        kept.push(line);
        size += line.length + 1;
      }
      return kept;
    };
    const header = `Design system "${this.name}". Write token values as var(--name).`;
    const componentLines = this.components.length
      ? ['Components (reuse these classes):', ...this.components.map((c) => `  ${c.name}: ${c.example}`)]
      : [];
    // Components get up to 40% of the budget, so many tokens never crowd them out.
    const fitted = fit(componentLines, Math.floor(maxChars * 0.4));
    // A title with no pattern under it is dropped, and its room goes back to tokens.
    const components = fitted.length > 1 ? fitted : [];
    const usedByComponents = components.reduce((n, l) => n + l.length + 1, 0);
    const tokenLines: string[] = [];
    for (const group of GROUP_ORDER) {
      const tokens = this.tokens.filter((t) => t.group === group);
      if (tokens.length === 0) continue;
      tokenLines.push(`${GROUP_TITLES[group]}:`);
      for (const t of tokens) tokenLines.push(`  ${t.cssVar}: ${t.value}`);
    }
    const head = fit([header, ...tokenLines], maxChars - usedByComponents);
    // A group title with none of its tokens is noise.
    while (head.length > 0 && head[head.length - 1]!.endsWith(':')) head.pop();
    return [...head, ...components].join('\n');
  }

  /**
   * Every token as a custom property. The injector defines only those the page lacks, so a design
   * system extracted from one site also renders on another.
   */
  injectableVariables(): Record<string, string> {
    return Object.fromEntries(this.tokens.map((t) => [t.cssVar, t.value]));
  }

  toProps(): DesignSystemProps {
    return this.props;
  }
}
