import { useEffect, useState } from 'react';
import type {
  ClearApiKey,
  ContextProfile,
  GetProviderSettings,
  LookupModel,
  ModelCapabilities,
  ProviderId,
  ProviderSettingsView,
  SaveProviderSettings,
  TestProviderConnection,
} from '@hew/core/ai/application';
import { CapabilityStatus } from './CapabilityStatus';

export interface OptionsUseCases {
  readonly get: GetProviderSettings;
  readonly save: SaveProviderSettings;
  readonly clear: ClearApiKey;
  readonly test: TestProviderConnection;
  readonly lookup: LookupModel;
}

type Status = { kind: 'ok' | 'error'; message: string } | null;

const PROVIDERS: readonly { id: ProviderId; label: string }[] = [
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'openrouter', label: 'OpenRouter' },
];

export function OptionsApp({ useCases }: { useCases: OptionsUseCases }) {
  const [view, setView] = useState<ProviderSettingsView | null>(null);
  const [provider, setProvider] = useState<ProviderId>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [profile, setProfile] = useState<ContextProfile>('standard');
  const [capabilities, setCapabilities] = useState<ModelCapabilities | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [testing, setTesting] = useState(false);

  const showProvider = (next: ProviderId, v: ProviderSettingsView) => {
    setProvider(next);
    setApiKey('');
    setModel(v[next].model);
    setProfile(v[next].profile);
    setCapabilities(next === 'openrouter' ? v.openrouter.capabilities : null);
  };

  useEffect(() => {
    void useCases.get.execute().then((v) => {
      setView(v);
      showProvider(v.active, v);
    });
  }, [useCases]);

  // Look the OpenRouter model up in the public catalog while the user types.
  useEffect(() => {
    if (provider !== 'openrouter' || !view || model.trim() === '') return;
    const timer = setTimeout(() => void useCases.lookup.execute(model).then(setCapabilities), 400);
    return () => clearTimeout(timer);
  }, [provider, model, useCases, view]);

  if (!view) return null;
  const slot = view[provider];
  const isActive = view.active === provider;
  const label = PROVIDERS.find((p) => p.id === provider)!.label;

  const save = async () => {
    const result = await useCases.save.execute({ provider, model, profile, ...(apiKey.trim() ? { apiKey } : {}) });
    if (result.ok) {
      setView(result.value);
      showProvider(provider, result.value);
      setStatus({ kind: 'ok', message: `Settings saved. ${label} is the active provider.` });
    } else setStatus({ kind: 'error', message: result.error.message });
  };

  const test = async () => {
    setTesting(true);
    const result = await useCases.test.execute();
    setTesting(false);
    setStatus(result.ok ? { kind: 'ok', message: 'The key works.' } : { kind: 'error', message: result.error.message });
  };

  const clear = async () => {
    const next = await useCases.clear.execute({ provider });
    setView(next);
    setStatus({ kind: 'ok', message: `${label} API key removed.` });
  };

  return (
    <main className="stack" style={{ maxWidth: 560, margin: '0 auto', padding: '32px 16px' }}>
      <h1>Hot Edit Web settings</h1>
      <p className="muted">
        Requests run on your own account. Keys are stored only in this browser’s extension storage and are sent only to
        the provider’s API. Web pages you edit cannot read them.
      </p>

      <fieldset className="row" style={{ border: 'none', padding: 0, margin: 0 }} aria-label="Provider">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            className={p.id === provider ? 'primary' : undefined}
            aria-pressed={p.id === provider}
            onClick={() => {
              setStatus(null);
              showProvider(p.id, view);
            }}
          >
            {p.label}
            {view.active === p.id ? ' (active)' : ''}
          </button>
        ))}
      </fieldset>

      <label className="stack" style={{ gap: 4 }}>
        <span>{label} API key</span>
        <input
          type="password"
          autoComplete="off"
          name="apiKey"
          placeholder={slot.maskedKey ?? (provider === 'anthropic' ? 'sk-ant-…' : 'sk-or-…')}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
        <span className="muted">{slot.hasKey ? `Saved key: ${slot.maskedKey}` : 'No key saved.'}</span>
      </label>

      {provider === 'anthropic' ? (
        <label className="stack" style={{ gap: 4 }}>
          <span>Model</span>
          <select name="model" value={model} onChange={(e) => setModel(e.target.value)}>
            {view.anthropic.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <label className="stack" style={{ gap: 4 }}>
          <span>OpenRouter model</span>
          <input
            name="model"
            list="openrouter-models"
            autoComplete="off"
            spellCheck={false}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
          <datalist id="openrouter-models">
            {view.openrouter.suggestions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </datalist>
          {capabilities && <CapabilityStatus capabilities={capabilities} />}
        </label>
      )}

      <label className="stack" style={{ gap: 4 }}>
        <span>Context size</span>
        <select name="profile" value={profile} onChange={(e) => setProfile(e.target.value as ContextProfile)}>
          <option value="standard">Standard (more of the page, best for large models)</option>
          <option value="compact">Compact (less of the page, best for small models)</option>
        </select>
      </label>

      <div className="row">
        <button className="primary" onClick={() => void save()}>
          {isActive ? 'Save' : `Save and use ${label}`}
        </button>
        <button disabled={!isActive || !slot.hasKey || testing} onClick={() => void test()}>
          {testing ? 'Testing…' : 'Test key'}
        </button>
        <button disabled={!slot.hasKey} onClick={() => void clear()}>
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
