import { useEffect, useState } from 'react';
import type {
  ClearApiKey,
  GetProviderSettings,
  ProviderSettingsView,
  SaveProviderSettings,
  TestProviderConnection,
} from '@hew/core/ai/application';

export interface OptionsUseCases {
  readonly get: GetProviderSettings;
  readonly save: SaveProviderSettings;
  readonly clear: ClearApiKey;
  readonly test: TestProviderConnection;
}

type Status = { kind: 'ok' | 'error'; message: string } | null;

export function OptionsApp({ useCases }: { useCases: OptionsUseCases }) {
  const [view, setView] = useState<ProviderSettingsView | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    void useCases.get.execute().then((v) => {
      setView(v);
      setModel(v.model);
    });
  }, [useCases]);

  if (!view) return null;

  const save = async () => {
    const result = await useCases.save.execute({ model, ...(apiKey.trim() ? { apiKey } : {}) });
    if (result.ok) {
      setView(result.value);
      setApiKey('');
      setStatus({ kind: 'ok', message: 'Settings saved.' });
    } else setStatus({ kind: 'error', message: result.error.message });
  };

  const test = async () => {
    setTesting(true);
    const result = await useCases.test.execute();
    setTesting(false);
    setStatus(result.ok ? { kind: 'ok', message: 'The key works.' } : { kind: 'error', message: result.error.message });
  };

  const clear = async () => {
    setView(await useCases.clear.execute());
    setStatus({ kind: 'ok', message: 'API key removed.' });
  };

  return (
    <main className="stack" style={{ maxWidth: 520, margin: '0 auto', padding: '32px 16px' }}>
      <h1>Hot Edit Web settings</h1>
      <p className="muted">
        Requests run on your own Anthropic account. The key is stored only in this browser’s extension storage and is
        sent only to api.anthropic.com. Web pages you edit cannot read it.
      </p>

      <label className="stack" style={{ gap: 4 }}>
        <span>Anthropic API key</span>
        <input
          type="password"
          autoComplete="off"
          name="apiKey"
          placeholder={view.maskedKey ?? 'sk-ant-…'}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <span className="muted">{view.hasKey ? `Saved key: ${view.maskedKey}` : 'No key saved.'}</span>
      </label>

      <label className="stack" style={{ gap: 4 }}>
        <span>Model</span>
        <select name="model" value={model} onChange={(e) => setModel(e.target.value)}>
          {view.models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>

      <div className="row">
        <button className="primary" onClick={() => void save()}>
          Save
        </button>
        <button disabled={!view.hasKey || testing} onClick={() => void test()}>
          {testing ? 'Testing…' : 'Test key'}
        </button>
        <button disabled={!view.hasKey} onClick={() => void clear()}>
          Clear key
        </button>
      </div>

      {status && (
        <p className={status.kind === 'ok' ? 'success' : 'error'} role="status">
          {status.message}
        </p>
      )}
    </main>
  );
}
