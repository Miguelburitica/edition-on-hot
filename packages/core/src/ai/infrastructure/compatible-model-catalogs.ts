import { err, ok, type Result } from '../../shared/domain';
import {
  CatalogUnavailableError,
  NOT_FOUND_CAPABILITIES,
  type CatalogQuery,
  type CompatibleProviderId,
  type ModelCapabilities,
  type ModelCatalog,
  type ModelListing,
  type ModelLister,
  type ModelListQuery,
  type ModelOption,
  type ProviderId,
} from '../domain';

export const OPENCODE_CATALOG_URL = 'https://opencode.ai/inference/v1/models';

export interface CatalogOptions {
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly ttlMs?: number;
}

const defaultFetch: typeof fetch = (...args) => globalThis.fetch(...args);

interface OpenCodeModel {
  id: string;
  name?: string;
  capabilities?: { tools?: { supported?: boolean }; structured_output?: boolean };
  limit?: { context?: number };
}

const openCodeCapabilities = (model: OpenCodeModel): ModelCapabilities => ({
  status: 'found',
  structuredOutputs: model.capabilities?.structured_output === true,
  tools: model.capabilities?.tools?.supported === true,
  contextLength: model.limit?.context,
});

/**
 * Reads OpenCode's model list, which reports tools and structured output per model. With the key
 * it lists only the models the account has enabled; without one, every public model. Cached per key.
 */
export class OpenCodeModelCatalog implements ModelCatalog, ModelLister {
  private readonly cache = new Map<string, { at: number; models: Map<string, OpenCodeModel> }>();
  private readonly fetch: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: CatalogOptions = {}) {
    this.fetch = options.fetch ?? defaultFetch;
    this.now = options.now ?? Date.now;
  }

  async lookup(query: CatalogQuery): Promise<Result<ModelCapabilities, CatalogUnavailableError>> {
    const models = (query.apiKey ? await this.models(query.apiKey) : null) ?? (await this.models(null));
    if (!models) return err(new CatalogUnavailableError());
    const model = models.get(query.model);
    return ok(model ? openCodeCapabilities(model) : NOT_FOUND_CAPABILITIES);
  }

  async list(query: ModelListQuery): Promise<Result<ModelListing, CatalogUnavailableError>> {
    const account = query.apiKey ? await this.models(query.apiKey) : null;
    // A rejected or unreachable key still gets the public list, like OpenRouter.
    const models = account ?? (await this.models(null));
    if (!models) return err(new CatalogUnavailableError());
    return ok({
      scope: account ? 'account' : 'public',
      models: [...models.values()].map((m) => ({ id: m.id, label: m.name ?? m.id, capabilities: openCodeCapabilities(m) })),
    });
  }

  private async models(apiKey: string | null): Promise<Map<string, OpenCodeModel> | null> {
    const ttl = this.options.ttlMs ?? 10 * 60_000;
    const cacheKey = apiKey ?? '';
    const cached = this.cache.get(cacheKey);
    if (cached && this.now() - cached.at < ttl) return cached.models;
    const json = await getJson<{ data?: OpenCodeModel[] }>(this.fetch, OPENCODE_CATALOG_URL, apiKey);
    if (!json || !Array.isArray(json.data)) return null;
    const models = new Map(json.data.filter((m) => typeof m?.id === 'string').map((m) => [m.id, m]));
    this.cache.set(cacheKey, { at: this.now(), models });
    return models;
  }
}

interface LiteLlmModelInfo {
  model_name?: string;
  model_info?: { supports_function_calling?: boolean | null; supports_response_schema?: boolean | null; max_input_tokens?: number | null };
}

/**
 * Asks the user's LiteLLM proxy what it serves: `/model/info` reports function calling and
 * response-schema support; when that is not available, `/models` only proves the model exists.
 * Not cached, because the proxy can change at any moment.
 */
export class LiteLlmModelCatalog implements ModelCatalog, ModelLister {
  private readonly fetch: typeof fetch;

  constructor(options: CatalogOptions = {}) {
    this.fetch = options.fetch ?? defaultFetch;
  }

  async lookup(query: CatalogQuery): Promise<Result<ModelCapabilities, CatalogUnavailableError>> {
    const info = await getJson<{ data?: LiteLlmModelInfo[] }>(this.fetch, `${query.apiUrl}/model/info`, query.apiKey);
    const entry = info?.data?.find((m) => m.model_name === query.model);
    if (entry) {
      return ok({
        status: 'found',
        structuredOutputs: entry.model_info?.supports_response_schema === true,
        tools: entry.model_info?.supports_function_calling === true,
        contextLength: entry.model_info?.max_input_tokens ?? undefined,
      });
    }
    const list = await getJson<{ data?: { id: string }[] }>(this.fetch, `${query.apiUrl}/models`, query.apiKey);
    if (!list) return info ? ok(NOT_FOUND_CAPABILITIES) : err(new CatalogUnavailableError());
    // Listed but without details: the plain-text JSON mode works with every model.
    return ok(list.data?.some((m) => m.id === query.model) ? { status: 'found', structuredOutputs: false, tools: false } : NOT_FOUND_CAPABILITIES);
  }

  async list(query: ModelListQuery): Promise<Result<ModelListing, CatalogUnavailableError>> {
    const info = await getJson<{ data?: LiteLlmModelInfo[] }>(this.fetch, `${query.apiUrl}/model/info`, query.apiKey);
    const options = new Map<string, ModelOption>();
    for (const entry of info?.data ?? []) {
      if (typeof entry.model_name !== 'string' || options.has(entry.model_name)) continue;
      options.set(entry.model_name, {
        id: entry.model_name,
        label: entry.model_name,
        capabilities: {
          status: 'found',
          structuredOutputs: entry.model_info?.supports_response_schema === true,
          tools: entry.model_info?.supports_function_calling === true,
          contextLength: entry.model_info?.max_input_tokens ?? undefined,
        },
      });
    }
    if (options.size > 0) return ok({ scope: 'account', models: [...options.values()] });
    const list = await getJson<{ data?: { id: string }[] }>(this.fetch, `${query.apiUrl}/models`, query.apiKey);
    if (!list || !Array.isArray(list.data)) return info ? ok({ scope: 'account', models: [] }) : err(new CatalogUnavailableError());
    return ok({
      scope: 'account',
      models: list.data
        .filter((m) => typeof m?.id === 'string')
        .map((m) => ({ id: m.id, label: m.id, capabilities: { status: 'found', structuredOutputs: false, tools: false } })),
    });
  }
}

interface AnthropicModelPage {
  data?: { id?: string; display_name?: string }[];
  has_more?: boolean;
  last_id?: string;
}

/** Lists the Claude models the user's Anthropic key can use (`GET /v1/models`, paginated). */
export class AnthropicModelLister implements ModelLister {
  private readonly fetch: typeof fetch;

  constructor(options: CatalogOptions = {}) {
    this.fetch = options.fetch ?? defaultFetch;
  }

  async list(query: ModelListQuery): Promise<Result<ModelListing, CatalogUnavailableError>> {
    if (!query.apiKey) return err(new CatalogUnavailableError());
    const models: ModelOption[] = [];
    let after: string | undefined;
    for (let page = 0; page < 5; page++) {
      try {
        const url = `${query.apiUrl}/models?limit=1000${after ? `&after_id=${encodeURIComponent(after)}` : ''}`;
        const res = await this.fetch(url, {
          method: 'GET',
          headers: {
            'x-api-key': query.apiKey,
            'anthropic-version': '2023-06-01',
            'anthropic-dangerous-direct-browser-access': 'true',
          },
        });
        if (!res.ok) return err(new CatalogUnavailableError());
        const json = (await res.json()) as AnthropicModelPage;
        for (const m of json.data ?? []) {
          if (typeof m.id !== 'string') continue;
          models.push({ id: m.id, label: m.display_name ?? m.id, capabilities: { status: 'found', structuredOutputs: false, tools: true } });
        }
        if (!json.has_more || !json.last_id) break;
        after = json.last_id;
      } catch {
        return err(new CatalogUnavailableError());
      }
    }
    return ok({ scope: 'account', models });
  }
}

/** Dispatches model listing to the provider's lister. */
export class ModelListerRouter implements ModelLister {
  constructor(private readonly listers: Readonly<Record<ProviderId, ModelLister>>) {}

  list(query: ModelListQuery): Promise<Result<ModelListing, CatalogUnavailableError>> {
    return this.listers[query.provider].list(query);
  }
}

/** Dispatches catalog lookups to the active provider's catalog. */
export class ModelCatalogRouter implements ModelCatalog {
  constructor(private readonly catalogs: Readonly<Record<CompatibleProviderId, ModelCatalog>>) {}

  lookup(query: CatalogQuery): Promise<Result<ModelCapabilities, CatalogUnavailableError>> {
    return this.catalogs[query.provider].lookup(query);
  }
}

async function getJson<T>(fetchFn: typeof fetch, url: string, apiKey: string | null): Promise<T | null> {
  try {
    const res = await fetchFn(url, { method: 'GET', headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}
