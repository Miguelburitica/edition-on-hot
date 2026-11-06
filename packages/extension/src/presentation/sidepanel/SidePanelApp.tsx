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
import {
  AlertIcon,
  ArrowIcon,
  BranchIcon,
  CheckIcon,
  CloseIcon,
  CursorIcon,
  InfoIcon,
  LockIcon,
  RedoIcon,
  SlidersIcon,
  UndoIcon,
} from '../shared/Icons';
import { DesignSystemSection } from './DesignSystemSection';
import { ErrorCard, type ErrorAction, type ErrorView } from './ErrorCard';
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
  /** The active provider and model; re-read when settings change. */
  provider(): Promise<ProviderBrief>;
  onSettingsChanged(listener: () => void): () => void;
  readonly designSystems: DesignSystemServices;
  readonly exportSpec: ExportChangeSpec;
  download(file: RenderedFile): void;
  copyText(text: string): Promise<void>;
}

/** The active provider, as the panel shows it: first-run card and the "Asking <model>" step. */
export interface ProviderBrief {
  readonly label: string;
  readonly model: string;
  /** A key is saved (or the provider does not need one). */
  readonly ready: boolean;
}

type Area = 'change' | 'design' | 'export';
interface Message {
  readonly area: Area;
  readonly tone: 'ok' | 'neutral' | 'error';
  readonly text: string;
  readonly code?: string;
}

const elapsed = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
/** "v2", "v2 and v3", "v2–v5". */
const versionRange = (from: number, to: number) => (from === to ? `v${from}` : to === from + 1 ? `v${from} and v${to}` : `v${from}–v${to}`);

export function SidePanelApp({ services }: { services: SidePanelServices }) {
  const [client, setClient] = useState<EditorClient | null>(null);
  const [state, setState] = useState<EditorState | null>(null);
  const [pageError, setPageError] = useState<ErrorView | null>(null);
  const [error, setError] = useState<ErrorView | null>(null);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [provider, setProvider] = useState<ProviderBrief | null>(null);
  // Keyed by origin, so a library loaded for one site is never applied to another.
  const [loaded, setLoaded] = useState<{ origin: string; view: DesignSystemLibraryView } | null>(null);
  /** Bumped whenever the content script answers, so injection is re-sent after reloads. */
  const [epoch, setEpoch] = useState(0);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const origin = state ? originOf(state.page.url) : null;
  const library = loaded && loaded.origin === origin ? loaded.view : null;

  const connect = useCallback(async () => {
    const next = await services.resolveClient();
    setClient(next);
    setPageError(null);
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
      setPageError(response.error);
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

  useEffect(() => {
    const load = () => void services.provider().then(setProvider, () => setProvider(null));
    load();
    return services.onSettingsChanged(load);
  }, [services]);

  // Ticks the elapsed time while a change is generated.
  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [busy]);

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

  type Outcome = string | { neutral: string } | { code: string; message: string } | null;
  /** Runs a design system or export action with one busy flag and one place for its message. */
  const act = async (area: Area, action: () => Promise<Outcome>) => {
    setWorking(true);
    setMessage(null);
    try {
      const outcome = await action();
      if (typeof outcome === 'string') setMessage({ area, tone: 'ok', text: outcome });
      else if (outcome && 'neutral' in outcome) setMessage({ area, tone: 'neutral', text: outcome.neutral });
      else if (outcome) setMessage({ area, tone: 'error', text: outcome.message, code: outcome.code });
    } catch (failure) {
      setMessage({ area, tone: 'error', text: failure instanceof Error ? failure.message : String(failure) });
    } finally {
      setWorking(false);
    }
  };

  const activeSystem = library?.systems.find((s) => s.id === library.activeId) ?? null;

  const extract = () =>
    act('design', async () => {
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
    act('design', async () => {
      const imported = await services.designSystems.importFile.execute({ text: await file.text(), fileName: file.name, origin });
      if (!imported.ok) return imported.error;
      await refreshLibrary();
      return `Imported "${imported.value.name}" with ${imported.value.tokens.length} tokens.`;
    });

  const exportTokens = (id: string) =>
    act('design', async () => {
      const exported = await services.designSystems.exportFile.execute({ id });
      if (!exported.ok) return exported.error;
      services.download({ fileName: exported.value.fileName, mimeType: 'application/json', content: exported.value.text });
      return `Downloaded ${exported.value.fileName}.`;
    });

  const activate = (id: string | null) =>
    act('design', async () => {
      if (!origin) return null;
      const result = await services.designSystems.activate.execute({ origin, id });
      if (!result.ok) return result.error;
      await refreshLibrary();
      return id === null ? { neutral: 'No design system on this site. Its tokens were removed from the page.' } : null;
    });

  const remove = (id: string) =>
    act('design', async () => {
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
    act('export', async () => {
      const input = await specInput();
      if ('code' in input) return input;
      const file = services.exportSpec.execute({ format, spec: input });
      if (!file.ok) return file.error;
      services.download(file.value);
      return `Downloaded ${file.value.fileName}.`;
    });

  const copySpec = () =>
    act('export', async () => {
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
    if (busy || !state?.snapshot.selection || prompt.trim() === '') return;
    setBusy(true);
    setMessage(null);
    setStartedAt(Date.now());
    setNow(Date.now());
    const response = await run({ type: 'editing/submitPrompt', prompt });
    setBusy(false);
    if (response?.ok) setPrompt('');
  };

  const onErrorAction = (action: ErrorAction) => {
    if (action === 'settings' || action === 'model') services.openSettings();
    else if (action === 'retry') void submit();
    else void run({ type: 'editing/startPicker' });
  };

  const snapshot: SessionSnapshot | undefined = state?.snapshot;
  const connected = client !== null && state !== null;
  const note = (area: Area) => {
    if (!message || message.area !== area) return null;
    if (message.tone === 'error') {
      return (
        <div className="alert" role="alert">
          <AlertIcon />
          <span>{message.text}</span>
        </div>
      );
    }
    return (
      <div className={message.tone === 'ok' ? 'note' : 'note neutral'} role="status">
        {message.tone === 'ok' ? <CheckIcon style={{ color: 'var(--ok)' }} /> : <InfoIcon style={{ color: 'var(--ink3)' }} />}
        <span>{message.text}</span>
      </div>
    );
  };

  const header = (
    <header className="panel-head">
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span className="brand">Hot Edit Web</span>
        <span className="eyebrow">Local preview</span>
      </div>
      <button className="btn ghost" onClick={services.openSettings}>
        <SlidersIcon />
        Settings
      </button>
    </header>
  );

  if (!connected || !snapshot) {
    return (
      <main className="panel">
        {header}
        <section className="sec">
          <SectionTitle n="01" title="Selection" />
          <div className="callout" style={{ borderStyle: 'dashed', background: 'transparent', alignItems: 'center' }}>
            <LockIcon style={{ color: 'var(--ink3)' }} />
            <span>{pageError?.message ?? 'Open a regular web page to start editing.'}</span>
          </div>
          <span className="mono muted" style={{ fontSize: 11 }}>
            Not available on chrome:// pages or the Chrome Web Store
          </span>
        </section>
      </main>
    );
  }

  const later = snapshot.versionCount - snapshot.currentVersion;
  const from = snapshot.currentVersion === 0 ? 'the original' : `v${snapshot.currentVersion}`;
  const applied = snapshot.changesets.slice(0, snapshot.currentVersion);
  const canApply = !busy && snapshot.selection !== null && prompt.trim() !== '';

  return (
    <main className="panel">
      {header}

      {provider && !provider.ready && (
        <div className="welcome">
          <span className="eyebrow">Before you start</span>
          <h1>Connect your own AI account to start editing.</h1>
          <p>
            Hot Edit Web uses your key with Anthropic, OpenRouter, OpenCode or a LiteLLM proxy. The key stays in this browser — pages you
            edit can never read it.
          </p>
          <div>
            <button className="btn primary" onClick={services.openSettings}>
              Add a key in Settings
              <ArrowIcon />
            </button>
          </div>
        </div>
      )}

      <section className="sec">
        <SectionTitle n="01" title="Selection" />
        {state.picking ? (
          <>
            <div className="spread">
              <span style={{ color: 'var(--ink2)', fontSize: 12.5 }}>
                Click an element on the page. Press <span className="k">Esc</span> to cancel.
              </span>
              <button className="btn active" aria-pressed="true" onClick={() => void run({ type: 'editing/cancelPicker' })}>
                <CursorIcon />
                Picking
              </button>
            </div>
            <div className="track" aria-hidden="true" style={{ height: 1 }}>
              <span />
            </div>
          </>
        ) : snapshot.selection ? (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div className="chip" style={{ flex: 1 }} title={snapshot.selection.anchor.selector}>
              <span className="dot" />
              <span className="sel" data-testid="selection-label">
                {snapshot.selection.label}
              </span>
              <button className="x" aria-label="Clear selection" disabled={busy} onClick={() => void run({ type: 'editing/clearSelection' })}>
                <CloseIcon />
              </button>
            </div>
            <button className="btn" disabled={busy} onClick={() => void run({ type: 'editing/startPicker' })} title="Pick another element">
              <CursorIcon />
              Change
            </button>
          </div>
        ) : (
          <div className="spread">
            <span className="muted">Nothing selected</span>
            <button className="btn" onClick={() => void run({ type: 'editing/startPicker' })}>
              <CursorIcon />
              Select element
            </button>
          </div>
        )}
      </section>

      <section className="sec">
        <SectionTitle n="02" title="Change" />
        <textarea
          className="prompt"
          aria-label="Describe the change"
          placeholder={snapshot.currentVersion > 0 ? 'Describe the next change, in any language' : 'Describe the change, in any language'}
          value={prompt}
          readOnly={busy}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit();
          }}
        />
        {later > 0 && !busy && (
          <div className="callout">
            <BranchIcon style={{ color: 'var(--accent-ink)' }} />
            <span data-testid="replace-note">
              Branching from {from}. Applying replaces {versionRange(snapshot.currentVersion + 1, snapshot.versionCount)}.
            </span>
          </div>
        )}
        <div className="spread">
          {busy ? (
            <span className="mono" style={{ fontSize: 11, color: 'var(--ink2)' }}>
              {elapsed(now - startedAt)}
              {provider ? ` · ${provider.model}` : ''}
            </span>
          ) : (
            <span className="kbd">{snapshot.selection ? '⌘ / Ctrl + Enter' : 'Select an element first'}</span>
          )}
          {busy ? (
            <button className="btn busy" aria-busy="true" disabled>
              <span className="spin" aria-hidden="true" />
              Generating…
            </button>
          ) : (
            <button className="btn primary" disabled={!canApply} onClick={() => void submit()}>
              {later > 0 ? `Apply from ${snapshot.currentVersion === 0 ? 'original' : `v${snapshot.currentVersion}`}` : 'Apply'}
            </button>
          )}
        </div>
        {busy && (
          <div className="progress" role="status" aria-live="polite">
            <div className="track" aria-hidden="true">
              <span />
            </div>
            <div className="spread" style={{ alignItems: 'baseline' }}>
              <span style={{ fontWeight: 500 }}>Waiting for the model</span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--ink2)' }}>
                {elapsed(now - startedAt)}
              </span>
            </div>
            <ol className="steps">
              <li style={{ color: 'var(--ink2)' }}>
                <span className="ic">
                  <CheckIcon style={{ color: 'var(--ok)' }} />
                </span>
                <span>Read the element and its styles</span>
              </li>
              <li>
                <span className="ic">
                  <span className="live pulse" />
                </span>
                <span>
                  Asking{' '}
                  <span className="mono" style={{ fontSize: 11.5 }}>
                    {provider?.model ?? 'the model'}
                  </span>
                </span>
                <span className="t">{elapsed(now - startedAt)}</span>
              </li>
              <li style={{ color: 'var(--ink3)' }}>
                <span className="ic">
                  <span className="ring" />
                </span>
                <span>Preview on the page</span>
              </li>
            </ol>
            <p style={{ margin: 0, fontSize: 12, color: 'var(--ink3)', borderTop: '1px solid var(--rule)', paddingTop: 10 }}>
              Reasoning models can take up to a minute. You can keep browsing — the page stays as it is until the change arrives.
            </p>
          </div>
        )}
        {error && !busy && <ErrorCard error={error} onAction={onErrorAction} />}
      </section>

      <DesignSystemSection
        library={library}
        host={origin ? new URL(origin).host : null}
        busy={working || busy}
        message={note('design')}
        onExtract={() => void extract()}
        onImport={(file) => void importTokens(file)}
        onExport={(id) => void exportTokens(id)}
        onActivate={(id) => void activate(id)}
        onDelete={(id) => void remove(id)}
      />

      <section className="sec">
        <div className="sech-row">
          <SectionTitle n="04" title="History" />
          {snapshot.changesets.length > 0 && (
            <div className="hstack" style={{ gap: 4 }}>
              <button className="btn sm" disabled={!snapshot.canUndo || busy} onClick={() => void run({ type: 'editing/undo' })}>
                <UndoIcon />
                Undo
              </button>
              <button className="btn sm" disabled={!snapshot.canRedo || busy} onClick={() => void run({ type: 'editing/redo' })}>
                <RedoIcon />
                Redo
              </button>
            </div>
          )}
        </div>
        <History
          changesets={snapshot.changesets}
          currentVersion={snapshot.currentVersion}
          disabled={busy}
          pending={busy}
          onGoTo={(version) => void run({ type: 'editing/goToVersion', version })}
        />
        {snapshot.changesets.length > 0 && (
          <p className="footnote">
            Changes are a local preview. They are lost when the page reloads, and some apps may redraw over them. Export them as a spec to
            keep them.
          </p>
        )}
      </section>

      <ExportSection
        stats={
          applied.length > 0
            ? { changes: applied.length, ops: applied.reduce((sum, c) => sum + c.opCount, 0), tokens: activeSystem?.tokens.length ?? 0 }
            : null
        }
        busy={working || busy}
        message={note('export')}
        onDownload={(format) => void downloadSpec(format)}
        onCopy={() => void copySpec()}
      />
    </main>
  );
}

function SectionTitle({ n, title }: { n: string; title: string }) {
  return (
    <div className="sech">
      <span className="n">{n}</span>
      <h2>{title}</h2>
    </div>
  );
}

