import { z } from 'zod';
import { err, ok, type Result } from '../../shared/domain';
import {
  COMPONENT_KINDS,
  CSS_VAR,
  InvalidTokenFileError,
  isSafeExample,
  isSafeTokenValue,
  isTokenGroup,
  singleLine,
  MAX_COMPONENTS,
  MAX_TOKENS,
  toTokenName,
  type ComponentPattern,
  type DesignSystem,
  type DesignSystemDraft,
  type DesignTokenCodec,
  type Token,
  type TokenGroup,
  type TokenSource,
} from '../domain';
import { classifyToken, isColorValue, normalizeColor } from './css-values';

const MAX_FILE_CHARS = 1_000_000;
const MAX_REFERENCE_DEPTH = 10;

const hewTokenExtension = z
  .object({
    cssVar: z.string().regex(CSS_VAR).optional(),
    group: z.string().refine(isTokenGroup).optional(),
    source: z.enum(['variable', 'inferred', 'imported']).optional(),
    uses: z.number().int().positive().optional(),
  })
  .partial();

const componentSchema = z.object({
  name: z.string().min(1).max(80),
  kind: z.enum(COMPONENT_KINDS),
  tag: z.string().regex(/^[a-z][a-z0-9-]*$/),
  classes: z.array(z.string().regex(/^[a-zA-Z_][\w-]*$/)).max(12),
  example: z.string().max(300),
});

const rootExtension = z
  .object({ name: z.string().max(80).optional(), components: z.array(z.unknown()).optional() })
  .partial();

interface RawToken {
  readonly path: readonly string[];
  readonly type: string | undefined;
  readonly value: unknown;
  readonly hew: z.infer<typeof hewTokenExtension> | undefined;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** W3C Design Tokens (DTCG) JSON. Components and css vars travel in `$extensions.hew`. */
export class DtcgCodec implements DesignTokenCodec {
  decode(text: string, fallbackName: string): Result<DesignSystemDraft, InvalidTokenFileError> {
    if (text.length > MAX_FILE_CHARS) return err(new InvalidTokenFileError('the file is larger than 1 MB'));
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return err(new InvalidTokenFileError('it is not valid JSON'));
    }
    if (!isRecord(json)) return err(new InvalidTokenFileError('the top level must be an object of token groups'));

    const raw: RawToken[] = [];
    collect(json, [], undefined, raw);
    const byPath = new Map(raw.map((t) => [t.path.join('.'), t]));

    const tokens: Token[] = [];
    const names = new Set<string>();
    const vars = new Set<string>();
    for (const token of raw) {
      if (tokens.length >= MAX_TOKENS) break;
      const resolved = resolveReferences(token.value, byPath, 0);
      if (resolved === undefined) continue;
      // An alias without its own $type takes the type of the token it points to.
      const type = token.type ?? aliasType(token.value, byPath, 0);
      const css = toCss(type, resolved);
      if (css === null || !isSafeTokenValue(css)) continue;
      let name = toTokenName(token.path.join('-'));
      if (!name) continue;
      for (let i = 2; names.has(name); i++) name = `${toTokenName(token.path.join('-'))}-${i}`;
      const cssVar = token.hew?.cssVar && !vars.has(token.hew.cssVar) ? token.hew.cssVar : `--${name}`;
      if (vars.has(cssVar)) continue;
      let group: TokenGroup = (token.hew?.group as TokenGroup | undefined) ?? groupOf(type, name, css);
      // A file's word is not enough: a "color" must parse as one.
      if (group === 'color' && !isColorValue(css)) group = classifyToken(name, css);
      const source: TokenSource = token.hew?.source ?? 'imported';
      names.add(name);
      vars.add(cssVar);
      tokens.push({
        name,
        group,
        value: group === 'color' ? normalizeColor(css) : css,
        cssVar,
        source,
        ...(token.hew?.uses ? { uses: token.hew.uses } : {}),
      });
    }

    const ext = rootExtension.safeParse(isRecord(json.$extensions) ? json.$extensions.hew : undefined);
    const components: ComponentPattern[] = [];
    for (const candidate of (ext.success ? ext.data.components : undefined) ?? []) {
      const parsed = componentSchema.safeParse(candidate);
      if (parsed.success && isSafeExample(parsed.data.example) && components.length < MAX_COMPONENTS) {
        components.push({ ...parsed.data, name: singleLine(parsed.data.name) });
      }
    }
    if (tokens.length === 0 && components.length === 0) return err(new InvalidTokenFileError('it contains no usable tokens'));
    const name = (ext.success && ext.data.name ? singleLine(ext.data.name) : '') || singleLine(fallbackName);
    return ok({ name: name.slice(0, 80), tokens, components });
  }

  encode(system: DesignSystem): string {
    const root: Record<string, unknown> = {
      $description: `Exported from Hot Edit Web on ${new Date().toISOString().slice(0, 10)}`,
      $extensions: { hew: { name: system.name, origin: system.origin, components: system.components } },
    };
    for (const token of system.tokens) {
      const type = dtcgType(token);
      root[token.name] = {
        ...(type ? { $type: type } : {}),
        $value: token.value,
        $extensions: { hew: { cssVar: token.cssVar, group: token.group, source: token.source, ...(token.uses ? { uses: token.uses } : {}) } },
      };
    }
    return `${JSON.stringify(root, null, 2)}\n`;
  }
}

function collect(node: Record<string, unknown>, path: string[], inheritedType: string | undefined, out: RawToken[]): void {
  const type = typeof node.$type === 'string' ? node.$type : inheritedType;
  if ('$value' in node) {
    const hew = hewTokenExtension.safeParse(isRecord(node.$extensions) ? node.$extensions.hew : undefined);
    out.push({ path, type, value: node.$value, hew: hew.success ? hew.data : undefined });
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$') || !isRecord(child)) continue;
    collect(child, [...path, key], type, out);
    if (out.length > MAX_TOKENS * 4) return;
  }
}

const REFERENCE = /^\{([^{}]+)\}$/;

function aliasType(value: unknown, byPath: ReadonlyMap<string, RawToken>, depth: number): string | undefined {
  if (depth > MAX_REFERENCE_DEPTH || typeof value !== 'string') return undefined;
  const whole = REFERENCE.exec(value.trim());
  const target = whole ? byPath.get(whole[1]!) : undefined;
  if (!target) return undefined;
  return target.type ?? aliasType(target.value, byPath, depth + 1);
}

/** A resolved value inside a string, e.g. `calc({space.1} * 2)` with `{ value: 4, unit: 'px' }`. */
function scalar(value: unknown): string | null {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (isRecord(value) && typeof value.value === 'number' && typeof value.unit === 'string') return `${value.value}${value.unit}`;
  return null;
}

/** Resolves `{group.token}` aliases (whole values and inside strings); undefined on cycles or misses. */
function resolveReferences(value: unknown, byPath: ReadonlyMap<string, RawToken>, depth: number): unknown {
  if (depth > MAX_REFERENCE_DEPTH) return undefined;
  if (typeof value === 'string') {
    const whole = REFERENCE.exec(value.trim());
    if (whole) {
      const target = byPath.get(whole[1]!);
      return target ? resolveReferences(target.value, byPath, depth + 1) : undefined;
    }
    let missing = false;
    const replaced = value.replace(/\{([^{}]+)\}/g, (_m, ref: string) => {
      const target = byPath.get(ref);
      const resolved = scalar(target ? resolveReferences(target.value, byPath, depth + 1) : undefined);
      if (resolved === null) {
        missing = true;
        return '';
      }
      return resolved;
    });
    return missing ? undefined : replaced;
  }
  if (Array.isArray(value)) {
    const items = value.map((v) => resolveReferences(v, byPath, depth + 1));
    return items.some((v) => v === undefined) ? undefined : items;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value).map(([k, v]) => [k, resolveReferences(v, byPath, depth + 1)] as const);
    return entries.some(([, v]) => v === undefined) ? undefined : Object.fromEntries(entries);
  }
  return value;
}

function dimension(value: unknown): string | null {
  if (typeof value === 'number') return `${value}px`;
  if (typeof value === 'string') return value.trim();
  if (isRecord(value) && typeof value.value === 'number' && typeof value.unit === 'string') return `${value.value}${value.unit}`;
  return null;
}

function shadow(value: unknown): string | null {
  const one = (s: unknown): string | null => {
    if (!isRecord(s)) return typeof s === 'string' ? s : null;
    const parts = [s.offsetX, s.offsetY, s.blur, s.spread].map((p) => dimension(p ?? 0));
    if (parts.some((p) => p === null) || typeof s.color !== 'string') return null;
    return `${s.inset === true ? 'inset ' : ''}${parts.join(' ')} ${s.color}`;
  };
  const list = Array.isArray(value) ? value.map(one) : [one(value)];
  return list.some((s) => s === null) ? null : list.join(', ');
}

const quoteFamily = (f: string) => (/^[\w-]+$/.test(f) ? f : `"${f.replace(/"/g, '')}"`);

function toCss(type: string | undefined, value: unknown): string | null {
  switch (type) {
    case 'shadow':
      return shadow(value);
    case 'fontFamily':
      return Array.isArray(value) ? value.filter((f) => typeof f === 'string').map(quoteFamily).join(', ') : typeof value === 'string' ? value : null;
    case 'dimension':
    case 'duration':
      return dimension(value);
    case 'cubicBezier':
      return Array.isArray(value) && value.length === 4 ? `cubic-bezier(${value.join(', ')})` : typeof value === 'string' ? value : null;
    case 'typography':
    case 'border':
    case 'transition':
    case 'gradient':
    case 'strokeStyle':
      return null; // composites with no single CSS value
    default:
      if (typeof value === 'string') return value;
      if (typeof value === 'number') return String(value);
      if (isRecord(value) && typeof value.value === 'number' && typeof value.unit === 'string') return `${value.value}${value.unit}`;
      return null;
  }
}

function groupOf(type: string | undefined, name: string, value: string): TokenGroup {
  switch (type) {
    case 'color':
      return 'color';
    case 'shadow':
      return 'shadow';
    case 'fontFamily':
      return 'font-family';
    case 'fontWeight':
      return 'font-weight';
    case 'dimension': {
      const group = classifyToken(name, value);
      return group === 'radius' || group === 'font-size' ? group : 'spacing';
    }
    default:
      return classifyToken(name, value);
  }
}

function dtcgType(token: Token): string | null {
  switch (token.group) {
    case 'color':
      return 'color';
    case 'spacing':
    case 'radius':
    case 'font-size':
      return /^-?\d*\.?\d+(px|rem)$/.test(token.value) ? 'dimension' : null;
    case 'font-family':
      return 'fontFamily';
    case 'font-weight':
      return /^\d+$/.test(token.value) ? 'fontWeight' : null;
    default:
      return null;
  }
}
