import { describe, expect, it } from 'vitest';
import { anchor, FakePageGateway, prompt } from '../../../test/fakes';
import { EditSession } from './edit-session';
import { Selection } from './selection';
import type { PatchOp } from './patch-op';

const now = new Date('2026-11-03T12:00:00Z');
const banner: PatchOp = { type: 'insert', target: anchor('form'), position: 'before', html: '<div>hi</div>' };
const red: PatchOp = { type: 'setStyle', target: anchor('button'), styles: { color: 'red' } };

function applyCs(session: EditSession, page: FakePageGateway, id: string, ops: PatchOp[] = [banner]) {
  return session.apply({ id, prompt: prompt(`change ${id}`), summary: id, ops, now }, page);
}

describe('EditSession', () => {
  it('applies every op of a changeset and records it', () => {
    const page = new FakePageGateway();
    const session = EditSession.start('tab');
    const result = applyCs(session, page, 'A', [banner, red]);

    expect(result.ok).toBe(true);
    expect(page.log).toEqual(['A:insert(form)', 'A:setStyle(button)']);
    expect(session.changesets.map((c) => [c.id, c.status])).toEqual([['A', 'applied']]);
    expect(session.pullEvents().map((e) => e.type)).toEqual(['ChangesetApplied']);
  });

  it('rolls back already-applied ops when a later op fails and records nothing', () => {
    const page = new FakePageGateway();
    page.missing.add('button');
    const session = EditSession.start('tab');
    const result = applyCs(session, page, 'A', [banner, red]);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe('anchor-not-found');
    expect(page.log).toEqual([]);
    expect(session.changesets).toHaveLength(0);
    expect(session.pullEvents()).toHaveLength(0);
  });

  it('undoes the most recent applied changeset first', () => {
    const page = new FakePageGateway();
    const session = EditSession.start('tab');
    applyCs(session, page, 'A');
    applyCs(session, page, 'B', [red]);

    const first = session.undo(page, now);
    const second = session.undo(page, now);

    expect(first.ok && first.value.id).toBe('B');
    expect(second.ok && second.value.id).toBe('A');
    expect(page.log).toEqual([]);
    expect(session.changesets.map((c) => c.status)).toEqual(['undone', 'undone']);
    expect(session.canUndo).toBe(false);
    expect(session.undo(page, now).ok).toBe(false);
  });

  it('redoes the most recently undone changeset', () => {
    const page = new FakePageGateway();
    const session = EditSession.start('tab');
    applyCs(session, page, 'A');
    applyCs(session, page, 'B', [red]);
    session.undo(page, now);
    session.undo(page, now);

    const redo = session.redo(page, now);

    expect(redo.ok && redo.value.id).toBe('A');
    expect(page.log).toEqual(['A:insert(form)']);
    expect(session.canRedo).toBe(true);
  });

  it('discards undone changesets when a new one is applied', () => {
    const page = new FakePageGateway();
    const session = EditSession.start('tab');
    applyCs(session, page, 'A');
    session.undo(page, now);
    applyCs(session, page, 'B', [red]);

    expect(session.canRedo).toBe(false);
    expect(session.changesets.map((c) => c.id)).toEqual(['B']);
    expect(session.redo(page, now).ok).toBe(false);
  });

  it('requires a selection before prompting', () => {
    const session = EditSession.start('tab');
    expect(session.requireSelection().ok).toBe(false);
    session.select(new Selection(anchor('form', 'form'), 'form'), now);
    expect(session.requireSelection().ok).toBe(true);
  });
});
