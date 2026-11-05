import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClearApiKey,
  CompatibleProviderId,
  ContextProfile,
  GetProviderSettings,
  ListModels,
  LookupModel,
  ModelOption,
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
  readonly listModels: ListModels;
}

type ModelList =
  | { readonly state: 'idle' }
  | { readonly state: 'loading' }
  | { readonly state: 'loaded'; readonly models: readonly ModelOption[]; readonly scope: 'account' | 'public' }
  | { readonly state: 'error'; readonly message: string };

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
  const [modelList, setModelList] = useState<ModelList>({ state: 'idle' });
  const listRequest = useRef(0);

  /** Loads the models the key can use; a newer request (or provider switch) wins. */
  const loadModels = useCallback(
    async (target: ProviderId, input: { apiKey?: string; baseUrl?: string } = {}) => {
      const id = ++listRequest.current;
      setModelList({ state: 'loading' });
      const result = await useCases.listModels.execute({ provider: target, ...input });
      if (id !== listRequest.current) return;
      setModelList(
        result.ok
          ? { state: 'loaded', models: result.value.models, scope: result.value.scope }
          : { state: 'error', message: result.error.message },
      );
    },
    [useCases],
  );

  const showProvider = (next: ProviderId, v: ProviderSettingsView) => {
    setProvider(next);
    setApiKey('');
    setModel(v[next].model);
    setProfile(v[next].profile);
    setBaseUrl(next === 'anthropic' ? '' : v[next].baseUrl);
    setCapabilities(next === 'anthropic' ? null : v[next].capabilities);
    // Anthropic lists nothing without a key; the others have a public list or their own proxy.
    if (next !== 'anthropic' || v.anthropic.hasKey) void loadModels(next);
    else {
      listRequest.current++;
      setModelList({ state: 'idle' });
    }
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
    let current = true;
    const timer = setTimeout(
      () =>
        void useCases.lookup.execute({ provider, model, ...(editable ? { baseUrl } : {}) }).then((c) => {
          if (current) setCapabilities(c);
        }),
      400,
    );
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [provider, model, baseUrl, useCases, view]);

  if (!view) return null;
  const slot = view[provider];
  const compatible = provider === 'anthropic' ? null : view[provider];
  const isActive = view.active === provider;
  const label = slot.label;
  const suggestions: readonly { id: string; label: string }[] =
    modelList.state === 'loaded' && modelList.models.length > 0
      ? modelList.models
      : provider === 'anthropic'
        ? view.anthropic.models
        : compatible!.suggestions;
  const refreshModels = async () => {
    // Listing a user-configured proxy needs browser access to it; ask inside the click.
    if (compatible?.baseUrlEditable) {
      const origin = originOf(baseUrl);
      if (origin && !(await requestHostAccess(origin))) {
        setModelList({ state: 'error', message: `Chrome access to ${origin} is needed to list its models.` });
        return;
      }
    }
    await loadModels(provider, { ...(apiKey.trim() ? { apiKey } : {}), ...(compatible?.baseUrlEditable ? { baseUrl } : {}) });
  };

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
    showProvider(provider, next);
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

      <label className="stack" style={{ gap: 4 }}>
        <span>{label} model</span>
        <input
          name="model"
          list={`${provider}-models`}
          autoComplete="off"
          spellCheck={false}
          placeholder={provider === 'litellm' ? 'The model name your proxy exposes' : 'Type to search the models'}
          value={model}
          onChange={(e) => setModel(e.target.value)}
        />
        <datalist id={`${provider}-models`} data-testid="model-options">
          {suggestions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </datalist>
        {compatible && capabilities && model.trim() !== '' && (
          <CapabilityStatus capabilities={capabilities} source={CATALOG_SOURCE[provider as CompatibleProviderId]} />
        )}
      </label>
      <div className="row spread">
        <span className="muted" data-testid="model-list-status" role="note">
          {modelList.state === 'loading' && 'Loading models…'}
          {modelList.state === 'idle' && (provider === 'anthropic' ? 'Save a key to list the models your account can use.' : '')}
          {modelList.state === 'loaded' &&
            `${modelList.models.length} model${modelList.models.length === 1 ? '' : 's'} ${
              modelList.scope === 'account' ? 'available to your account' : 'available (add a key to see your account’s)'
            }`}
          {modelList.state === 'error' && `Could not load the model list: ${modelList.message}`}
        </span>
        <button className="link" disabled={modelList.state === 'loading'} onClick={() => void refreshModels()}>
          Refresh models
        </button>
      </div>

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
