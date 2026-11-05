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

  it('keeps warnings from the last application, also after undo', () => {
    const page = new FakePageGateway();
    page.hidden.add('button');
    const session = EditSession.start('tab');
    applyCs(session, page, 'A', [banner, red]);
    const [changeset] = session.changesets;
    expect(changeset!.warnings).toEqual([{ opIndex: 1, warning: { kind: 'hidden-target', detail: 'button is hidden' } }]);
    session.undo(page, now);
    expect(changeset!.warnings).toHaveLength(1);
    page.hidden.clear();
    session.redo(page, now);
    expect(changeset!.warnings).toEqual([]);
  });

  describe('versions', () => {
    function threeVersions() {
      const page = new FakePageGateway();
      const session = EditSession.start('tab');
      applyCs(session, page, 'A', [banner]);
      applyCs(session, page, 'B', [red]);
      applyCs(session, page, 'C', [{ type: 'remove', target: anchor('p') }]);
      return { page, session };
    }

    it('jumps back to the original', () => {
      const { page, session } = threeVersions();
      expect(session.currentVersion).toBe(3);
      expect(session.goTo(0, page, now)).toEqual({ ok: true, value: 0 });
      expect(page.log).toEqual([]);
      expect(session.changesets.map((c) => c.status)).toEqual(['undone', 'undone', 'undone']);
    });

    it('jumps forward to an intermediate version', () => {
      const { page, session } = threeVersions();
      session.goTo(0, page, now);
      expect(session.goTo(2, page, now)).toEqual({ ok: true, value: 2 });
      expect(page.log).toEqual(['A:insert(form)', 'B:setStyle(button)']);
      expect(session.changesets.map((c) => c.status)).toEqual(['applied', 'applied', 'undone']);
      expect(session.versionCount).toBe(3);
    });

    it('rejects versions out of range', () => {
      const { page, session } = threeVersions();
      expect(session.goTo(4, page, now)).toMatchObject({ ok: false, error: { code: 'version-out-of-range' } });
      expect(session.goTo(-1, page, now).ok).toBe(false);
      expect(session.goTo(1.5, page, now).ok).toBe(false);
      expect(session.currentVersion).toBe(3);
    });

    it('stops at the last good version when a redo fails', () => {
      const { page, session } = threeVersions();
      session.goTo(0, page, now);
      page.missing.add('button');
      const result = session.goTo(3, page, now);
      expect(result).toMatchObject({ ok: false, error: { code: 'anchor-not-found' } });
      expect(session.currentVersion).toBe(1);
      expect(page.log).toEqual(['A:insert(form)']);
    });

    it('discards later versions when a new change is applied from an earlier one', () => {
      const { page, session } = threeVersions();
      session.goTo(1, page, now);
      applyCs(session, page, 'D', [red]);
      expect(session.changesets.map((c) => c.id)).toEqual(['A', 'D']);
      expect(session.currentVersion).toBe(2);
      expect(session.versionCount).toBe(2);
    });
  });
});
