import { useCallback, useEffect, useState } from 'react';
import type { SessionSnapshot } from '@hew/core/editing/application';
import type { EditorClient, EditorCommand, EditorResponse, EditorState } from '../../infrastructure';
import { History } from './History';

export interface SidePanelServices {
  /** Resolves the editor of the tab the panel is attached to, or null when there is none. */
  resolveClient(): Promise<EditorClient | null>;
  onStateChanged(listener: (tabId: number, state: EditorState) => void): () => void;
  onTabChanged(listener: () => void): () => void;
  openSettings(): void;
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
    if (response.ok) setState(response.value);
    else {
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
        </>
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
            Changes are a local preview. They are lost when the page reloads, and some apps may redraw over them.
          </p>
        </section>
      )}
    </main>
  );
}
