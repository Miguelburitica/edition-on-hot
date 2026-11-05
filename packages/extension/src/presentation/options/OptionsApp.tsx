import { useEffect, useState } from 'react';
import type {
  ClearApiKey,
  CompatibleProviderId,
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

const PROVIDERS: readonly ProviderId[] = ['anthropic', 'openrouter', 'opencode', 'litellm'];

const CATALOG_SOURCE: Record<CompatibleProviderId, string> = {
  openrouter: 'OpenRouter catalog',
  opencode: 'OpenCode catalog',
  litellm: 'LiteLLM proxy',
};

const KEY_PLACEHOLDER: Record<ProviderId, string> = {
  anthropic: 'sk-ant-…',
  openrouter: 'sk-or-…',
  opencode: 'sk-…',
  litellm: 'sk-… (only if your proxy requires one)',
};

/** `http://localhost:4000` for a URL the user typed, or null when it does not parse. */
function originOf(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    return /^https?:$/.test(parsed.protocol) ? parsed.origin : null;
  } catch {
    return null;
  }
}

export interface OptionsAppProps {
  readonly useCases: OptionsUseCases;
  /** Asks the browser for access to a user-configured host. Called first thing in the Save click. */
  readonly requestHostAccess: (origin: string) => Promise<boolean>;
}

export function OptionsApp({ useCases, requestHostAccess }: OptionsAppProps) {
  const [view, setView] = useState<ProviderSettingsView | null>(null);
  const [provider, setProvider] = useState<ProviderId>('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [profile, setProfile] = useState<ContextProfile>('standard');
  const [capabilities, setCapabilities] = useState<ModelCapabilities | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [testing, setTesting] = useState(false);

  const showProvider = (next: ProviderId, v: ProviderSettingsView) => {
    setProvider(next);
    setApiKey('');
    setModel(v[next].model);
    setProfile(v[next].profile);
    setBaseUrl(next === 'anthropic' ? '' : v[next].baseUrl);
    setCapabilities(next === 'anthropic' ? null : v[next].capabilities);
  };

  useEffect(() => {
    void useCases.get.execute().then((v) => {
      setView(v);
      showProvider(v.active, v);
    });
  }, [useCases]);

  // Look the model up in the provider's catalog (or the LiteLLM proxy) while the user types.
  useEffect(() => {
    if (provider === 'anthropic' || !view || model.trim() === '') return;
    const editable = view[provider].baseUrlEditable;
    const timer = setTimeout(
      () => void useCases.lookup.execute({ provider, model, ...(editable ? { baseUrl } : {}) }).then(setCapabilities),
      400,
    );
    return () => clearTimeout(timer);
  }, [provider, model, baseUrl, useCases, view]);

  if (!view) return null;
  const slot = view[provider];
  const compatible = provider === 'anthropic' ? null : view[provider];
  const isActive = view.active === provider;
  const label = slot.label;

  const save = async () => {
    // A user-configured host needs browser access; the request must start inside the click.
    if (compatible?.baseUrlEditable) {
      const origin = originOf(baseUrl);
      if (origin && !(await requestHostAccess(origin))) {
        setStatus({ kind: 'error', message: `Chrome access to ${origin} is needed to reach your ${label} proxy. Nothing was saved.` });
        return;
      }
    }
    const result = await useCases.save.execute({
      provider,
      model,
      profile,
      ...(apiKey.trim() ? { apiKey } : {}),
      ...(compatible?.baseUrlEditable ? { baseUrl } : {}),
    });
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
    setStatus(result.ok ? { kind: 'ok', message: compatible?.keyRequired === false ? 'The connection works.' : 'The key works.' } : { kind: 'error', message: result.error.message });
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
        {PROVIDERS.map((id) => (
          <button
            key={id}
            className={id === provider ? 'primary' : undefined}
            aria-pressed={id === provider}
            onClick={() => {
              setStatus(null);
              showProvider(id, view);
            }}
          >
            {view[id].label}
            {view.active === id ? ' (active)' : ''}
          </button>
        ))}
      </fieldset>

      {compatible?.baseUrlEditable && (
        <label className="stack" style={{ gap: 4 }}>
          <span>{label} proxy URL</span>
          <input
            name="baseUrl"
            type="url"
            autoComplete="off"
            spellCheck={false}
            placeholder="http://localhost:4000"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
          <span className="muted">Saving asks Chrome for access to this host only.</span>
        </label>
      )}

      <label className="stack" style={{ gap: 4 }}>
        <span>
          {label} API key{compatible && !compatible.keyRequired ? ' (optional)' : ''}
        </span>
        <input
          type="password"
          autoComplete="off"
          name="apiKey"
          placeholder={slot.maskedKey ?? KEY_PLACEHOLDER[provider]}
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
          <span>{label} model</span>
          <input
            name="model"
            list={`${provider}-models`}
            autoComplete="off"
            spellCheck={false}
            placeholder={provider === 'litellm' ? 'The model name your proxy exposes' : undefined}
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
          <datalist id={`${provider}-models`}>
            {compatible!.suggestions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </datalist>
          {capabilities && model.trim() !== '' && <CapabilityStatus capabilities={capabilities} source={CATALOG_SOURCE[provider]} />}
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
        <button disabled={!isActive || (!slot.hasKey && compatible?.keyRequired !== false) || testing} onClick={() => void test()}>
          {testing ? 'Testing…' : compatible?.keyRequired === false ? 'Test connection' : 'Test key'}
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
