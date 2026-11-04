import { err, ok, type Clock, type IdGenerator, type Result } from '../src/shared/domain';
import {
  AnchorNotFoundError,
  ElementAnchor,
  EditSession,
  Prompt,
  type AppliedOp,
  type EditSessionRepository,
  type PageGateway,
  type PatchOp,
} from '../src/editing/domain';

export function anchor(selector: string, tag = 'div', text = ''): ElementAnchor {
  const result = ElementAnchor.create({ selector, tag, textFingerprint: text });
  if (!result.ok) throw result.error;
  return result.value;
}

export function prompt(text: string): Prompt {
  const result = Prompt.create(text);
  if (!result.ok) throw result.error;
  return result.value;
}

/** In-memory page: a log of applied op labels; anchors whose selector is listed in `missing` fail. */
export class FakePageGateway implements PageGateway {
  readonly log: string[] = [];
  readonly missing = new Set<string>();

  apply(op: PatchOp, changesetId: string): Result<AppliedOp, AnchorNotFoundError> {
    if (op.type !== 'addCss' && this.missing.has(op.target.selector)) {
      return err(new AnchorNotFoundError(op.target.selector));
    }
    const label = `${changesetId}:${describe(op)}`;
    this.log.push(label);
    return ok({ op, revertToken: label });
  }

  revert(applied: AppliedOp): void {
    const index = this.log.lastIndexOf(applied.revertToken as string);
    if (index === -1) throw new Error(`revert of unknown op ${String(applied.revertToken)}`);
    this.log.splice(index, 1);
  }
}

function describe(op: PatchOp): string {
  return op.type === 'addCss' ? 'addCss' : `${op.type}(${op.target.selector})`;
}

export class InMemorySessions implements EditSessionRepository {
  readonly sessions = new Map<string, EditSession>();
  async get(id: string) {
    return this.sessions.get(id) ?? null;
  }
  async save(session: EditSession) {
    this.sessions.set(session.id, session);
  }
}

export class SequentialIds implements IdGenerator {
  private n = 0;
  next() {
    this.n += 1;
    return `cs${this.n}`;
  }
}

export const fixedClock: Clock = { now: () => new Date('2026-11-03T12:00:00Z') };
