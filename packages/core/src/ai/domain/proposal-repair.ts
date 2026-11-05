export type RepairKind =
  | 'extracted-json'
  | 'wrapped-ops'
  | 'added-summary'
  | 'normalized-type'
  | 'normalized-target'
  | 'normalized-position'
  | 'kebab-case-styles'
  | 'scope-selector';

export interface RepairResult {
  readonly value: unknown;
  readonly repairs: readonly RepairKind[];
}

const TYPE_ALIASES: Record<string, string> = {
  insert: 'insert',
  inserthtml: 'insert',
  add: 'insert',
  replace: 'replace',
  replacewith: 'replace',
  setstyle: 'setStyle',
  style: 'setStyle',
  styles: 'setStyle',
  setattr: 'setAttr',
  setattribute: 'setAttr',
  attr: 'setAttr',
  settext: 'setText',
  text: 'setText',
  remove: 'remove',
  delete: 'remove',
  addcss: 'addCss',
  css: 'addCss',
  stylesheet: 'addCss',
};

const POSITION_ALIASES: Record<string, string> = {
  before: 'before',
  above: 'before',
  top: 'before',
  after: 'after',
  below: 'after',
  bottom: 'after',
  prepend: 'prepend',
  start: 'prepend',
  first: 'prepend',
  append: 'append',
  end: 'append',
  last: 'append',
};

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Deterministic fixes for common mechanical mistakes in model output. It only reshapes what the
 * output already contains: it never invents operations or targets.
 */
export function repairDraft(raw: unknown): RepairResult {
  const repairs = new Set<RepairKind>();
  let value = raw;

  const text = isObject(value) && typeof value.unparsedText === 'string' ? value.unparsedText : typeof value === 'string' ? value : null;
  if (text !== null) {
    const extracted = extractJson(text);
    if (extracted === undefined) return { value: raw, repairs: [] };
    value = extracted;
    repairs.add('extracted-json');
  }

  if (Array.isArray(value)) {
    value = { ops: value };
    repairs.add('wrapped-ops');
  } else if (isObject(value) && !('ops' in value)) {
    if (isObject(value.op)) {
      value = { summary: value.summary, ops: [value.op] };
      repairs.add('wrapped-ops');
    } else if (typeof value.type === 'string') {
      value = { ops: [value] };
      repairs.add('wrapped-ops');
    }
  }
  if (!isObject(value)) return { value, repairs: [...repairs] };

  let ops = value.ops;
  if (isObject(ops)) {
    ops = [ops];
    repairs.add('wrapped-ops');
  }
  let summary = value.summary;
  if (typeof summary !== 'string' || summary.trim() === '') {
    summary = 'Applied change';
    repairs.add('added-summary');
  }
  const repairedOps = Array.isArray(ops) ? ops.map((op) => repairOp(op, repairs)) : ops;
  return { value: { ...value, summary, ops: repairedOps }, repairs: [...repairs] };
}

function repairOp(op: unknown, repairs: Set<RepairKind>): unknown {
  if (!isObject(op)) return op;
  const next: Json = { ...op };

  if (typeof op.type === 'string') {
    const canonical = TYPE_ALIASES[op.type.replace(/[\s_-]/g, '').toLowerCase()];
    if (canonical && canonical !== op.type) {
      next.type = canonical;
      repairs.add('normalized-type');
    }
  }

  if ('target' in op) {
    const target = normalizeTarget(op.target);
    if (target !== op.target) {
      next.target = target;
      repairs.add('normalized-target');
    }
  }

  if (typeof op.position === 'string') {
    const canonical = POSITION_ALIASES[op.position.trim().toLowerCase()];
    if (canonical && canonical !== op.position) {
      next.position = canonical;
      repairs.add('normalized-position');
    }
  }

  if (typeof op.css === 'string') {
    const css = scopeTargetZero(op.css);
    if (css !== op.css) {
      next.css = css;
      repairs.add('scope-selector');
    }
  }

  if (isObject(op.styles)) {
    const entries = Object.entries(op.styles);
    const kebab = entries.map(([k, v]) => [toKebab(k), v] as const);
    if (kebab.some(([k], i) => k !== entries[i]![0])) {
      next.styles = Object.fromEntries(kebab);
      repairs.add('kebab-case-styles');
    }
  } else if (Array.isArray(op.styles)) {
    let changed = false;
    next.styles = op.styles.map((pair: unknown) => {
      if (!isObject(pair) || typeof pair.property !== 'string') return pair;
      const property = toKebab(pair.property);
      if (property !== pair.property) changed = true;
      return { ...pair, property };
    });
    if (changed) repairs.add('kebab-case-styles');
  }
  return next;
}

/**
 * Target ids only exist in the HTML the model was shown, so a stylesheet rule written against
 * `[data-hew-target="t0"]` or a bare `t0` would match nothing. Both mean the selection, which
 * the standard `:scope` selector names (the page side maps it to the selection).
 */
function scopeTargetZero(css: string): string {
  return css
    .replace(/\[\s*data-hew-target\s*=\s*["']?t0["']?\s*\]/gi, ':scope')
    .replace(/(^|[\s,>+~{}])t0(?=[\s,>+~.:#[{])/g, '$1:scope');
}

function normalizeTarget(target: unknown): unknown {
  if (typeof target === 'number' && Number.isInteger(target) && target >= 0) return `t${target}`;
  if (typeof target !== 'string') return target;
  const trimmed = target.trim();
  if (/^\d+$/.test(trimmed)) return `t${trimmed}`;
  const match = /^#?(t\d+)$/i.exec(trimmed) ?? /data-hew-target\s*=\s*["']?(t\d+)/i.exec(trimmed);
  return match ? match[1]!.toLowerCase() : target;
}

function toKebab(property: string): string {
  if (property.startsWith('--')) return property;
  return property.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
}

/** Pulls the first JSON value out of model text: a fenced block, or the outermost braces. */
export function extractJson(text: string): unknown {
  const candidates: string[] = [];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced?.[1]) candidates.push(fenced[1]);
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end > start) candidates.push(text.slice(start, end + 1));
  candidates.push(text);
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate.trim());
    } catch {
      // try the next candidate
    }
  }
  return undefined;
}
