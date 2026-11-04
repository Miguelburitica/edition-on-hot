import { describe, expect, it, vi } from 'vitest';
import { ok } from '../../shared/domain';
import { anchor, FakePageGateway, fixedClock, InMemorySessions, SequentialIds } from '../../../test/fakes';
import type { PatchSource } from '../domain';
import {
  ApplyPromptToSelection,
  GetSessionSnapshot,
  RedoChangeset,
  SelectElement,
  UndoChangeset,
  type EditingDeps,
} from './use-cases';

const formAnchor = { selector: 'form#signup', tag: 'form', textFingerprint: 'Sign up' };

function setup(source?: PatchSource) {
  const patchSource: PatchSource = source ?? {
    propose: vi.fn(async () =>
      ok({
        summary: 'Adds a red banner',
        ops: [{ type: 'insert' as const, target: anchor('form#signup', 'form'), position: 'before' as const, html: '<div>!</div>' }],
      }),
    ),
  };
  const page = new FakePageGateway();
  const publish = vi.fn();
  const deps: EditingDeps = {
    sessions: new InMemorySessions(),
    page,
    patchSource,
    ids: new SequentialIds(),
    clock: fixedClock,
    events: { publish },
  };
  return { deps, page, patchSource, publish };
}

describe('Editing use cases', () => {
  it('rejects a prompt when nothing is selected, without calling the source', async () => {
    const { deps, patchSource } = setup();
    const result = await new ApplyPromptToSelection(deps).execute({ sessionId: 'tab', prompt: 'add a banner' });
    expect(!result.ok && result.error.code).toBe('no-selection');
    expect(patchSource.propose).not.toHaveBeenCalled();
  });

  it('rejects a blank prompt, without calling the source', async () => {
    const { deps, patchSource } = setup();
    await new SelectElement(deps).execute({ sessionId: 'tab', anchor: formAnchor, label: 'form#signup' });
    const result = await new ApplyPromptToSelection(deps).execute({ sessionId: 'tab', prompt: '   ' });
    expect(!result.ok && result.error.code).toBe('empty-prompt');
    expect(patchSource.propose).not.toHaveBeenCalled();
  });

  it('applies a proposal, then undoes and redoes it', async () => {
    const { deps, page, publish } = setup();
    await new SelectElement(deps).execute({ sessionId: 'tab', anchor: formAnchor, label: 'form#signup' });

    const applied = await new ApplyPromptToSelection(deps).execute({ sessionId: 'tab', prompt: 'add a red banner' });
    expect(applied.ok && applied.value.changesets[0]).toMatchObject({
      id: 'cs1',
      prompt: 'add a red banner',
      summary: 'Adds a red banner',
      status: 'applied',
    });
    expect(page.log).toEqual(['cs1:insert(form#signup)']);

    const undone = await new UndoChangeset(deps).execute({ sessionId: 'tab' });
    expect(undone.ok && undone.value).toMatchObject({ canUndo: false, canRedo: true });
    expect(page.log).toEqual([]);

    const redone = await new RedoChangeset(deps).execute({ sessionId: 'tab' });
    expect(redone.ok && redone.value).toMatchObject({ canUndo: true, canRedo: false });
    expect(publish.mock.calls.flat(2).map((e: { type: string }) => e.type)).toEqual([
      'SelectionChanged',
      'ChangesetApplied',
      'ChangesetUndone',
      'ChangesetRedone',
    ]);
  });

  it('does not record a changeset when the source fails', async () => {
    const { deps } = setup({
      propose: async () => ({ ok: false, error: Object.assign(new Error('bad key'), { code: 'provider-auth' }) as never }),
    });
    await new SelectElement(deps).execute({ sessionId: 'tab', anchor: formAnchor, label: 'form' });
    const result = await new ApplyPromptToSelection(deps).execute({ sessionId: 'tab', prompt: 'x' });
    expect(!result.ok && result.error.code).toBe('provider-auth');
    expect((await new GetSessionSnapshot(deps).execute({ sessionId: 'tab' })).changesets).toHaveLength(0);
  });

  it('rejects proposals that break op invariants', async () => {
    const { deps, page } = setup({
      propose: async () => ok({ summary: 's', ops: [{ type: 'setAttr', target: anchor('a'), name: 'onclick', value: 'x' }] }),
    });
    await new SelectElement(deps).execute({ sessionId: 'tab', anchor: formAnchor, label: 'form' });
    const result = await new ApplyPromptToSelection(deps).execute({ sessionId: 'tab', prompt: 'x' });
    expect(!result.ok && result.error.code).toBe('invalid-patch');
    expect(page.log).toEqual([]);
  });

  it('reports nothing to undo on an empty session', async () => {
    const { deps } = setup();
    const result = await new UndoChangeset(deps).execute({ sessionId: 'tab' });
    expect(!result.ok && result.error.code).toBe('nothing-to-undo');
  });
});
