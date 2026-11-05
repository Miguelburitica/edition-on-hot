import { err, ok, type Result } from '../../shared/domain';
import {
  CatalogUnavailableError,
  NOT_FOUND_CAPABILITIES,
  type CatalogQuery,
  type CompatibleProviderId,
  type ModelCapabilities,
  type ModelCatalog,
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
  capabilities?: { tools?: { supported?: boolean }; structured_output?: boolean };
  limit?: { context?: number };
}

/** Reads OpenCode's public model list (no key is sent), which reports tools and structured output per model. */
export class OpenCodeModelCatalog implements ModelCatalog {
  private cache: { at: number; models: Map<string, OpenCodeModel> } | null = null;
  private readonly fetch: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: CatalogOptions = {}) {
    this.fetch = options.fetch ?? defaultFetch;
    this.now = options.now ?? Date.now;
  }

  async lookup(query: CatalogQuery): Promise<Result<ModelCapabilities, CatalogUnavailableError>> {
    const models = await this.models();
    if (!models) return err(new CatalogUnavailableError());
    const model = models.get(query.model);
    if (!model) return ok(NOT_FOUND_CAPABILITIES);
    return ok({
      status: 'found',
      structuredOutputs: model.capabilities?.structured_output === true,
      tools: model.capabilities?.tools?.supported === true,
      contextLength: model.limit?.context,
    });
  }

  private async models(): Promise<Map<string, OpenCodeModel> | null> {
    const ttl = this.options.ttlMs ?? 10 * 60_000;
    if (this.cache && this.now() - this.cache.at < ttl) return this.cache.models;
    const json = await getJson<{ data?: OpenCodeModel[] }>(this.fetch, OPENCODE_CATALOG_URL, null);
    if (!json) return null;
    const models = new Map((json.data ?? []).map((m) => [m.id, m]));
    this.cache = { at: this.now(), models };
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
export class LiteLlmModelCatalog implements ModelCatalog {
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
