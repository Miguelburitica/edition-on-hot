import { ApplyPromptToSelection, ClearSelection, GetSessionSnapshot, RedoChangeset, SelectElement, UndoChangeset, type SessionSnapshot, type UseCaseError } from '@hew/core/editing/application';
import { ElementAnchor } from '@hew/core/editing/domain';
import {
  AiPatchSourceAdapter,
  buildAnchor,
  describeElement,
  DomAnchorResolver,
  DomPageGateway,
  HtmlSanitizer,
  InMemoryEditSessionRepository,
  OVERLAY_ATTR,
} from '@hew/core/editing/infrastructure';
import { err, ok, type Result } from '@hew/core/shared/domain';
import { browser } from 'wxt/browser';
import {
  bridgedBudgetRequester,
  bridgedPatchRequester,
  createHandler,
  editorCommand,
  type EditorCommand,
  type EditorResponse,
  type EditorState,
  type EditorStateChanged,
  type RuntimeListener,
} from '../infrastructure';
import { PickerOverlay } from '../presentation/content/picker-overlay';

/** One edit session per page load; its revert tokens hold live DOM nodes. */
const SESSION_ID = 'page';

export function startContent(): void {
  const resolver = new DomAnchorResolver(document);
  let counter = 0;
  const deps = {
    sessions: new InMemoryEditSessionRepository(),
    page: new DomPageGateway(document, resolver, new HtmlSanitizer(window)),
    patchSource: new AiPatchSourceAdapter(
      resolver,
      bridgedPatchRequester((message) => browser.runtime.sendMessage(message)),
      bridgedBudgetRequester((message) => browser.runtime.sendMessage(message)),
    ),
    ids: { next: () => `cs-${Date.now().toString(36)}-${++counter}` },
    clock: { now: () => new Date() },
  };
  const useCases = {
    select: new SelectElement(deps),
    clear: new ClearSelection(deps),
    apply: new ApplyPromptToSelection(deps),
    undo: new UndoChangeset(deps),
    redo: new RedoChangeset(deps),
    snapshot: new GetSessionSnapshot(deps),
  };
  const overlay = new PickerOverlay(document, { hostAttribute: OVERLAY_ATTR, describe: describeElement });

  const currentState = async (): Promise<EditorState> => ({
    snapshot: await useCases.snapshot.execute({ sessionId: SESSION_ID }),
    picking: overlay.isPicking,
  });

  const outlineSelection = (snapshot: SessionSnapshot) => {
    const anchor = snapshot.selection ? ElementAnchor.create(snapshot.selection.anchor) : null;
    overlay.showSelection(anchor?.ok ? resolver.resolve(anchor.value) : null);
  };

  const broadcast = async () => {
    const state = await currentState();
    outlineSelection(state.snapshot);
    const message: EditorStateChanged = { type: 'editing/stateChanged', state };
    // No extension page may be listening; that is fine.
    browser.runtime.sendMessage(message).catch(() => undefined);
  };

  const respond = async (result: Result<SessionSnapshot, UseCaseError>): Promise<EditorResponse> => {
    const state = await currentState();
    outlineSelection(state.snapshot);
    return result.ok ? ok(state) : err({ ...result.error, state });
  };

  const handle = async (command: EditorCommand): Promise<EditorResponse> => {
    const sessionId = SESSION_ID;
    switch (command.type) {
      case 'editing/getSnapshot':
        return respond(ok(await useCases.snapshot.execute({ sessionId })));
      case 'editing/startPicker':
        overlay.start(
          async (el) => {
            await useCases.select.execute({ sessionId, anchor: buildAnchor(el).toJSON(), label: describeElement(el) });
            await broadcast();
          },
          () => void broadcast(),
        );
        return respond(ok(await useCases.snapshot.execute({ sessionId })));
      case 'editing/cancelPicker':
        overlay.stop();
        return respond(ok(await useCases.snapshot.execute({ sessionId })));
      case 'editing/clearSelection':
        return respond(await useCases.clear.execute({ sessionId }));
      case 'editing/submitPrompt':
        return respond(await useCases.apply.execute({ sessionId, prompt: command.prompt }));
      case 'editing/undo':
        return respond(await useCases.undo.execute({ sessionId }));
      case 'editing/redo':
        return respond(await useCases.redo.execute({ sessionId }));
    }
  };

  const listener: RuntimeListener = createHandler(editorCommand, handle, browser.runtime.id);
  browser.runtime.onMessage.addListener(listener as Parameters<typeof browser.runtime.onMessage.addListener>[0]);
}
