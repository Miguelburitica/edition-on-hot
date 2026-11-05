import { useCallback, useEffect, useState } from 'react';
import {
  originOf,
  type ActivateDesignSystem,
  type DeleteDesignSystem,
  type DesignSystemLibraryView,
  type ExportDesignSystem,
  type ImportDesignSystem,
  type ListDesignSystems,
  type SaveDesignSystem,
} from '@hew/core/design-system/application';
import type { SessionSnapshot } from '@hew/core/editing/application';
import type { ChangeSpecInput, ExportChangeSpec, ExportFormat, RenderedFile } from '@hew/core/handoff/application';
import type { EditorClient, EditorCommand, EditorResponse, EditorState } from '../../infrastructure';
import { DesignSystemSection } from './DesignSystemSection';
import { ExportSection } from './ExportSection';
import { History } from './History';

export interface DesignSystemServices {
  readonly list: ListDesignSystems;
  readonly save: SaveDesignSystem;
  readonly importFile: ImportDesignSystem;
  readonly exportFile: ExportDesignSystem;
  readonly activate: ActivateDesignSystem;
  readonly remove: DeleteDesignSystem;
}

export interface SidePanelServices {
  /** Resolves the editor of the tab the panel is attached to, or null when there is none. */
  resolveClient(): Promise<EditorClient | null>;
  onStateChanged(listener: (tabId: number, state: EditorState) => void): () => void;
  onTabChanged(listener: () => void): () => void;
  openSettings(): void;
  readonly designSystems: DesignSystemServices;
  readonly exportSpec: ExportChangeSpec;
  download(file: RenderedFile): void;
  copyText(text: string): Promise<void>;
}

const SETTINGS_ERRORS = new Set([
  'missing-api-key',
  'provider-auth',
  'invalid-api-key',
  'provider-no-provider',
  'provider-unavailable',
]);

interface ErrorView {
  code: string;
  message: string;
}

export function SidePanelApp({ services }: { services: SidePanelServices }) {
  const [client, setClient] = useState<EditorClient | null>(null);
  const [state, setState] = useState<EditorState | null>(null);
  const [error, setError] = useState<ErrorView | null>(null);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  // Keyed by origin, so a library loaded for one site is never applied to another.
  const [loaded, setLoaded] = useState<{ origin: string; view: DesignSystemLibraryView } | null>(null);
  /** Bumped whenever the content script answers, so injection is re-sent after reloads. */
  const [epoch, setEpoch] = useState(0);
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const origin = state ? originOf(state.page.url) : null;
  const library = loaded && loaded.origin === origin ? loaded.view : null;

  const connect = useCallback(async () => {
    const next = await services.resolveClient();
    setClient(next);
    setError(null);
    if (!next) {
      setState(null);
      return;
    }
    // Right after a navigation the content script may still be starting.
    let response = await next.send({ type: 'editing/getSnapshot' });
    for (let attempt = 0; !response.ok && attempt < 3; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, 400));
      response = await next.send({ type: 'editing/getSnapshot' });
    }
    if (response.ok) {
      setState(response.value);
      setEpoch((n) => n + 1);
    } else {
      setState(null);
      setError(response.error);
    }
  }, [services]);

  useEffect(() => {
    void connect();
    return services.onTabChanged(() => void connect());
  }, [connect, services]);

  useEffect(
    () =>
      services.onStateChanged((tabId, next) => {
        if (tabId === client?.tabId) setState(next);
      }),
    [client, services],
  );

  const refreshLibrary = useCallback(async () => {
    if (!origin) return;
    const view = await services.designSystems.list.execute({ origin });
    setLoaded({ origin, view });
  }, [origin, services]);

  useEffect(() => {
    void refreshLibrary().catch(() => undefined);
  }, [refreshLibrary, epoch]);

  // Keep the page's injected tokens in step with the active design system (also after reloads).
  useEffect(() => {
    if (!client || !library) return;
    const active = library.systems.find((s) => s.id === library.activeId);
    void client.request({
      type: 'designSystem/inject',
      variables: active ? Object.fromEntries(active.tokens.map((t) => [t.cssVar, t.value])) : null,
    });
  }, [client, library, epoch]);

  /** Runs a design system or export action with one busy flag and one place for errors. */
  const act = async (action: () => Promise<string | { code: string; message: string } | null>) => {
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      const outcome = await action();
      if (typeof outcome === 'string') setNotice(outcome);
      else if (outcome) setError(outcome);
    } catch (failure) {
      setError({ code: 'extension-error', message: failure instanceof Error ? failure.message : String(failure) });
    } finally {
      setWorking(false);
    }
  };

  const activeSystem = library?.systems.find((s) => s.id === library.activeId) ?? null;

  const extract = () =>
    act(async () => {
      if (!client) return null;
      const extracted = await client.request({ type: 'designSystem/extract' });
      if (!extracted.ok) return extracted.error;
      const site = originOf(extracted.value.page.url);
      if (!site) return { code: 'no-origin', message: 'Design systems work on regular web pages.' };
      const saved = await services.designSystems.save.execute({ draft: extracted.value.draft, origin: site });
      if (!saved.ok) return saved.error;
      await refreshLibrary();
      return `Saved "${saved.value.name}" with ${saved.value.tokens.length} tokens and ${saved.value.components.length} components. Changes on this site now use it.`;
    });

  const importTokens = (file: File) =>
    act(async () => {
      const imported = await services.designSystems.importFile.execute({ text: await file.text(), fileName: file.name, origin });
      if (!imported.ok) return imported.error;
      await refreshLibrary();
      return `Imported "${imported.value.name}" with ${imported.value.tokens.length} tokens.`;
    });

  const exportTokens = (id: string) =>
    act(async () => {
      const exported = await services.designSystems.exportFile.execute({ id });
      if (!exported.ok) return exported.error;
      services.download({ fileName: exported.value.fileName, mimeType: 'application/json', content: exported.value.text });
      return `Downloaded ${exported.value.fileName}.`;
    });

  const activate = (id: string | null) =>
    act(async () => {
      if (!origin) return null;
      const result = await services.designSystems.activate.execute({ origin, id });
      if (!result.ok) return result.error;
      await refreshLibrary();
      return null;
    });

  const remove = (id: string) =>
    act(async () => {
      await services.designSystems.remove.execute({ id });
      await refreshLibrary();
      return 'Design system deleted.';
    });

  const specInput = async (): Promise<ChangeSpecInput | { code: string; message: string }> => {
    if (!client) return { code: 'not-connected', message: 'Open a regular web page to export its changes.' };
    const exported = await client.request({ type: 'editing/exportChanges' });
    if (!exported.ok) return exported.error;
    return {
      page: exported.value.page,
      changes: exported.value.log.changes,
      designSystem: activeSystem
        ? { name: activeSystem.name, tokens: activeSystem.tokens.map(({ cssVar, value, group }) => ({ cssVar, value, group })) }
        : null,
    };
  };

  const downloadSpec = (format: ExportFormat) =>
    act(async () => {
      const input = await specInput();
      if ('code' in input) return input;
      const file = services.exportSpec.execute({ format, spec: input });
      if (!file.ok) return file.error;
      services.download(file.value);
      return `Downloaded ${file.value.fileName}.`;
    });

  const copySpec = () =>
    act(async () => {
      const input = await specInput();
      if ('code' in input) return input;
      const file = services.exportSpec.execute({ format: 'markdown', spec: input });
      if (!file.ok) return file.error;
      await services.copyText(String(file.value.content));
      return 'The Markdown spec is on the clipboard.';
    });

  const run = async (command: EditorCommand): Promise<EditorResponse | null> => {
    if (!client) return null;
    setError(null);
    const response = await client.send(command);
    if (response.ok) setState(response.value);
    else {
      if (response.error.state) setState(response.error.state);
      setError({ code: response.error.code, message: response.error.message });
    }
    return response;
  };

  const submit = async () => {
    setBusy(true);
    const response = await run({ type: 'editing/submitPrompt', prompt });
    setBusy(false);
    if (response?.ok) setPrompt('');
  };

  const snapshot: SessionSnapshot | undefined = state?.snapshot;
  const connected = client !== null && state !== null;

  return (
    <main className="stack" style={{ padding: 16 }}>
      <header className="row spread">
        <h1>Hot Edit Web</h1>
        <button className="link" onClick={services.openSettings}>
          Settings
        </button>
      </header>

      {!connected && (
        <p className="error">{error?.message ?? 'Open a regular web page to start editing.'}</p>
      )}

      {connected && snapshot && (
        <>
          <section className="stack">
            <h2>Selection</h2>
            {state.picking ? (
              <div className="row spread">
                <span className="muted">Click an element on the page. Press Esc to cancel.</span>
                <button onClick={() => void run({ type: 'editing/cancelPicker' })}>Cancel</button>
              </div>
            ) : (
              <div className="row spread">
                {snapshot.selection ? (
                  <span className="chip" title={snapshot.selection.anchor.selector}>
                    <span data-testid="selection-label">{snapshot.selection.label}</span>
                    <button aria-label="Clear selection" onClick={() => void run({ type: 'editing/clearSelection' })}>
                      ×
                    </button>
                  </span>
                ) : (
                  <span className="muted">Nothing selected</span>
                )}
                <button onClick={() => void run({ type: 'editing/startPicker' })}>
                  {snapshot.selection ? 'Change' : 'Select element'}
                </button>
              </div>
            )}
          </section>

          <section className="stack">
            <h2>Change</h2>
            <textarea
              rows={4}
              placeholder={snapshot.selection ? 'e.g. Add a red notification banner above this form' : 'Select an element first'}
              value={prompt}
              disabled={busy}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
              }}
            />
            {snapshot.currentVersion < snapshot.versionCount && (
              <p className="muted" data-testid="replace-note" style={{ margin: 0 }}>
                You are viewing version {snapshot.currentVersion} of {snapshot.versionCount}. Applying will replace{' '}
                {snapshot.versionCount - snapshot.currentVersion} later version
                {snapshot.versionCount - snapshot.currentVersion === 1 ? '' : 's'}.
              </p>
            )}
            <div className="row spread">
              <span className="muted">⌘/Ctrl + Enter</span>
              <button
                className="primary"
                disabled={busy || !snapshot.selection || prompt.trim() === ''}
                onClick={() => void submit()}
              >
                {busy ? 'Generating…' : 'Apply'}
              </button>
            </div>
          </section>

          <DesignSystemSection
            library={library}
            available={origin !== null}
            busy={working || busy}
            onExtract={() => void extract()}
            onImport={(file) => void importTokens(file)}
            onExport={(id) => void exportTokens(id)}
            onActivate={(id) => void activate(id)}
            onDelete={(id) => void remove(id)}
          />
        </>
      )}

      {notice && connected && (
        <p className="success" role="status" style={{ margin: 0 }}>
          {notice}
        </p>
      )}

      {error && connected && (
        <div className="error" role="alert">
          {error.message}{' '}
          {SETTINGS_ERRORS.has(error.code) && (
            <button className="link" onClick={services.openSettings}>
              Open settings
            </button>
          )}
        </div>
      )}

      {connected && snapshot && (
        <section className="stack">
          <div className="row spread">
            <h2>History</h2>
            <div className="row">
              <button disabled={!snapshot.canUndo || busy} onClick={() => void run({ type: 'editing/undo' })}>
                Undo
              </button>
              <button disabled={!snapshot.canRedo || busy} onClick={() => void run({ type: 'editing/redo' })}>
                Redo
              </button>
            </div>
          </div>
          <History
            changesets={snapshot.changesets}
            currentVersion={snapshot.currentVersion}
            disabled={busy}
            onGoTo={(version) => void run({ type: 'editing/goToVersion', version })}
          />
          <p className="muted">
            Changes are a local preview. They are lost when the page reloads, and some apps may redraw over them. Export them
            as a spec to keep them.
          </p>
        </section>
      )}

      {connected && snapshot && (
        <ExportSection
          enabled={snapshot.currentVersion > 0}
          busy={working || busy}
          onDownload={(format) => void downloadSpec(format)}
          onCopy={() => void copySpec()}
        />
      )}
    </main>
  );
}
