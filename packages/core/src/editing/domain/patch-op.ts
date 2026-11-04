import { err, ok, type Result } from '../../shared/domain';
import type { ElementAnchor } from './element-anchor';
import { InvalidPatchOpError } from './errors';

export type InsertPosition = 'before' | 'after' | 'prepend' | 'append';
export const INSERT_POSITIONS: readonly InsertPosition[] = ['before', 'after', 'prepend', 'append'];

export type PatchOp =
  | { readonly type: 'insert'; readonly target: ElementAnchor; readonly position: InsertPosition; readonly html: string }
  | { readonly type: 'replace'; readonly target: ElementAnchor; readonly html: string }
  | { readonly type: 'setStyle'; readonly target: ElementAnchor; readonly styles: Readonly<Record<string, string>> }
  | { readonly type: 'setAttr'; readonly target: ElementAnchor; readonly name: string; readonly value: string | null }
  | { readonly type: 'setText'; readonly target: ElementAnchor; readonly text: string }
  | { readonly type: 'remove'; readonly target: ElementAnchor }
  | { readonly type: 'addCss'; readonly css: string };

export type PatchOpType = PatchOp['type'];

const ATTR_NAME = /^[a-z_:][a-z0-9_.:-]*$/i;
const CSS_PROPERTY = /^(--[a-z0-9-]+|-?[a-z]+(-[a-z]+)*)$/i;
const RESERVED_ATTR_PREFIX = 'data-hew';

const invalid = (message: string) => err(new InvalidPatchOpError(message));

/** Validates the domain invariants of a patch op; the op is returned unchanged when valid. */
export function validatePatchOp(op: PatchOp): Result<PatchOp, InvalidPatchOpError> {
  switch (op.type) {
    case 'insert':
      if (!INSERT_POSITIONS.includes(op.position)) return invalid(`Unknown insert position "${op.position}".`);
      if (op.html.trim() === '') return invalid('Insert operation has no HTML.');
      return ok(op);
    case 'replace':
      if (op.html.trim() === '') return invalid('Replace operation has no HTML.');
      return ok(op);
    case 'setStyle': {
      const props = Object.keys(op.styles);
      if (props.length === 0) return invalid('Style operation sets no properties.');
      const bad = props.find((p) => !CSS_PROPERTY.test(p));
      if (bad) return invalid(`Invalid CSS property "${bad}".`);
      return ok(op);
    }
    case 'setAttr': {
      const name = op.name.toLowerCase();
      if (!ATTR_NAME.test(name)) return invalid(`Invalid attribute name "${op.name}".`);
      if (name.startsWith('on')) return invalid(`Event handler attributes are not allowed ("${op.name}").`);
      if (name.startsWith(RESERVED_ATTR_PREFIX)) return invalid(`Attribute "${op.name}" is reserved.`);
      if (op.value !== null && /^\s*javascript:/i.test(op.value)) {
        return invalid('javascript: URLs are not allowed.');
      }
      return ok(op);
    }
    case 'setText':
      return ok(op);
    case 'remove':
      return ok(op);
    case 'addCss':
      if (op.css.trim() === '') return invalid('Stylesheet operation has no CSS.');
      return ok(op);
  }
}

export function validatePatchOps(ops: readonly PatchOp[]): Result<PatchOp[], InvalidPatchOpError> {
  if (ops.length === 0) return invalid('The change contains no operations.');
  for (const op of ops) {
    const result = validatePatchOp(op);
    if (!result.ok) return result;
  }
  return ok([...ops]);
}
