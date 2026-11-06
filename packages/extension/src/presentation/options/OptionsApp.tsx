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
import { AlertIcon, CheckIcon, LockIcon } from '../shared/Icons';
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

const CUSTOM_MODEL = '__custom__';

const PROFILES: readonly { id: ContextProfile; title: string; detail: string }[] = [
  { id: 'standard', title: 'Standard', detail: 'More of the page, best for large models' },
  { id: 'compact', title: 'Compact', detail: 'Less of the page, best for small models' },
];

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
  /** The user chose to type a model ID that is not in the list. */
  const [customModel, setCustomModel] = useState(false);
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
    setCustomModel(false);
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
  const typing = customModel;
  // A chosen model the list does not contain (or not yet, while it loads) stays selectable as is.
  const unlisted = !typing && model !== '' && !suggestions.some((s) => s.id === model);
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

  const subtitle = (id: ProviderId) => {
    const v = view[id];
    if (view.active === id) return v.model;
    if (v.hasKey) return 'key saved';
    return id === 'litellm' ? 'self-hosted proxy' : 'no key';
  };
  const listDot =
    modelList.state === 'loaded' ? 'var(--ok)' : modelList.state === 'error' ? 'var(--err)' : 'var(--rule2)';

  return (
    <div className="settings">
      <div className="topbar">
        <div className="wrap">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span className="serif" style={{ fontSize: 20, fontWeight: 500, letterSpacing: '-0.01em' }}>
              Hot Edit Web
            </span>
            <span className="eyebrow">Settings</span>
          </div>
          <span className="hstack" style={{ gap: 8, fontSize: 12.5, color: 'var(--ink3)' }}>
            <LockIcon />
            Stored in this browser only
          </span>
        </div>
      </div>

      <main className="wrap" style={{ paddingTop: 56, paddingBottom: 80 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 36, maxWidth: 720 }}>
          <h1>Hot Edit Web settings</h1>
          <p className="lede">
            Bring your own key. Each provider keeps its own key and model; one is active at a time. Keys never leave this browser except to
            reach the provider you chose, and pages you edit can never read them.
          </p>
        </div>

        <section className="srow">
          <div className="key">
            <span className="eyebrow">01</span>
            <h2>Provider</h2>
            <span className="sub">The active one answers every request.</span>
          </div>
          <div className="val">
            <fieldset className="choices">
              <legend className="sr-only">Provider</legend>
              {PROVIDERS.map((id) => (
                <label key={id} className="choice">
                  <input
                    type="radio"
                    name="provider"
                    checked={id === provider}
                    onChange={() => {
                      setStatus(null);
                      showProvider(id, view);
                    }}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                    <span className="hstack" style={{ gap: 8 }}>
                      <span className="t">{view[id].label}</span>
                      {view.active === id ? (
                        <span className="badge b-view">active</span>
                      ) : id === provider ? (
                        <span className="badge b-ghost">editing</span>
                      ) : null}
                    </span>
                    <span className="s" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {subtitle(id)}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
        </section>

        <section className="srow">
          <div className="key">
            <span className="eyebrow">02</span>
            <h2>{compatible?.baseUrlEditable ? 'Connection' : 'API key'}</h2>
            <span className="sub">{label}</span>
          </div>
          <div className="val">
            {compatible?.baseUrlEditable && (
              <div className="field">
                <label htmlFor="base-url">
                  <span>
                    <span className="sr-only">{label} </span>Proxy URL
                  </span>
                </label>
                <input
                  id="base-url"
                  className="in mono"
                  name="baseUrl"
                  type="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="http://localhost:4000"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                />
                <span className="help">Saving asks Chrome for access to this host only.</span>
              </div>
            )}
            <div className="field">
              <label htmlFor="api-key">
                <span>
                  <span className="sr-only">{label} </span>API key
                  {compatible && !compatible.keyRequired && <span style={{ fontWeight: 400, color: 'var(--ink3)' }}> (optional)</span>}
                </span>
              </label>
              <input
                id="api-key"
                className="in mono"
                type="password"
                autoComplete="off"
                name="apiKey"
                placeholder={slot.maskedKey ?? KEY_PLACEHOLDER[provider]}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <span className="help">{slot.hasKey ? `Saved key: ${slot.maskedKey}` : 'No key saved.'}</span>
            </div>
          </div>
        </section>

        <section className="srow">
          <div className="key">
            <span className="eyebrow">03</span>
            <h2>Model</h2>
            <span className="sub">{provider === 'litellm' ? 'Listed from your proxy.' : 'Listed from your account.'}</span>
          </div>
          <div className="val">
            {suggestions.length > 0 && (
              <div className="field">
                <label htmlFor="model-choice">
                  <span>
                    <span className="sr-only">{label} </span>Model
                  </span>
                </label>
                {/* A select, not a datalist: Chrome hides datalist entries that do not contain the current text. */}
                <select
                  id="model-choice"
                  className="in"
                  name="modelChoice"
                  data-testid="model-options"
                  value={typing ? CUSTOM_MODEL : model}
                  onChange={(e) => {
                    if (e.target.value === CUSTOM_MODEL) {
                      setCustomModel(true);
                      return;
                    }
                    setCustomModel(false);
                    setModel(e.target.value);
                  }}
                >
                  {model === '' && !typing && (
                    <option value="" disabled>
                      Choose a model
                    </option>
                  )}
                  {unlisted && <option value={model}>{`${model} (not in the list)`}</option>}
                  {suggestions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label === s.id ? s.id : `${s.label} (${s.id})`}
                    </option>
                  ))}
                  <option value={CUSTOM_MODEL}>Other model ID…</option>
                </select>
              </div>
            )}
            <div className="spread" style={{ flexWrap: 'wrap' }}>
              <span className="hstack" style={{ gap: 8, color: 'var(--ink2)', fontSize: 12.5 }}>
                <span className="ldot" style={{ background: listDot }} />
                <span data-testid="model-list-status" role="note">
                  {modelList.state === 'loading' && 'Loading models…'}
                  {modelList.state === 'idle' && (provider === 'anthropic' ? 'Save a key to list the models your account can use.' : '')}
                  {modelList.state === 'loaded' &&
                    `${modelList.models.length} model${modelList.models.length === 1 ? '' : 's'} ${
                      modelList.scope === 'account' ? 'available to your account' : 'available (add a key to see your account’s)'
                    }`}
                  {modelList.state === 'error' && `Could not load the model list: ${modelList.message}`}
                </span>
              </span>
              <button
                className="btn ghost sm"
                style={{ color: 'var(--accent-ink)' }}
                disabled={modelList.state === 'loading'}
                onClick={() => void refreshModels()}
              >
                Refresh models
              </button>
            </div>
            {(typing || suggestions.length === 0) && (
              <div className="field">
                <label htmlFor="model-id">
                  <span>
                    <span className="sr-only">{label} </span>
                    {suggestions.length > 0 ? 'Model ID' : 'Model'}
                  </span>
                </label>
                <input
                  id="model-id"
                  className="in mono"
                  name="model"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={provider === 'litellm' ? 'The model name your proxy exposes' : 'The exact model ID'}
                  value={model}
                  onChange={(e) => {
                    setCustomModel(true);
                    setModel(e.target.value);
                  }}
                />
              </div>
            )}
            {compatible && capabilities && model.trim() !== '' && (
              <CapabilityStatus capabilities={capabilities} source={CATALOG_SOURCE[provider as CompatibleProviderId]} />
            )}
          </div>
        </section>

        <section className="srow">
          <div className="key">
            <span className="eyebrow">04</span>
            <h2>Context size</h2>
            <span className="sub">How much of the page goes with each request.</span>
          </div>
          <div className="val">
            <fieldset className="choices">
              <legend className="sr-only">Context size</legend>
              {PROFILES.map((p) => (
                <label key={p.id} className="choice">
                  <input type="radio" name="profile" value={p.id} checked={profile === p.id} onChange={() => setProfile(p.id)} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span className="t">{p.title}</span>
                    <span className="d">{p.detail}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
        </section>

        <section className="srow" style={{ borderBottom: '1px solid var(--rule)' }}>
          <div className="key" />
          <div className="val">
            <div className="hstack" style={{ gap: 8 }}>
              <button className="btn primary" onClick={() => void save()}>
                {isActive ? 'Save' : `Save and use ${label}`}
              </button>
              <button
                className={testing ? 'btn busy' : 'btn'}
                disabled={!isActive || (!slot.hasKey && compatible?.keyRequired !== false) || testing}
                onClick={() => void test()}
              >
                {testing && <span className="spin" aria-hidden="true" />}
                {testing ? 'Testing…' : compatible?.keyRequired === false ? 'Test connection' : 'Test key'}
              </button>
              <button className="btn ghost danger" disabled={!slot.hasKey} onClick={() => void clear()}>
                Clear key
              </button>
            </div>
            {status && (
              <span className="status-line" role="status" style={{ color: status.kind === 'ok' ? 'var(--ok)' : 'var(--err)' }}>
                {status.kind === 'ok' ? <CheckIcon /> : <AlertIcon />}
                <span style={{ color: 'var(--ink)' }}>{status.message}</span>
              </span>
            )}
            {!isActive && !status && (
              <span className="status-line" style={{ color: 'var(--ink3)', fontSize: 12.5 }}>
                {view[view.active].label} stays active until you save.
              </span>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
