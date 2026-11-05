import { err, ok, type Result } from '../../shared/domain';
import {
  CatalogUnavailableError,
  NOT_FOUND_CAPABILITIES,
  OPENROUTER_BASE_URL,
  type CatalogQuery,
  type ModelCapabilities,
  type ModelCatalog,
  type ModelListing,
  type ModelLister,
  type ModelListQuery,
} from '../domain';

interface CatalogModel {
  id: string;
  name?: string;
  context_length?: number;
  supported_parameters?: string[];
}

function capabilitiesOf(model: CatalogModel): ModelCapabilities {
  const params = new Set(model.supported_parameters ?? []);
  return {
    status: 'found',
    structuredOutputs: params.has('structured_outputs'),
    tools: params.has('tools'),
    contextLength: model.context_length,
  };
}

export interface OpenRouterCatalogOptions {
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly ttlMs?: number;
}

/**
 * Looks models up in OpenRouter's public list (no key is sent, cached), and lists the models the
 * user's key can use (`/models/user`, which applies the account's provider filters).
 */
export class OpenRouterModelCatalog implements ModelCatalog, ModelLister {
  private cache: { at: number; models: Map<string, CatalogModel> } | null = null;
  private readonly fetch: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: OpenRouterCatalogOptions = {}) {
    this.fetch = options.fetch ?? ((...args) => globalThis.fetch(...args));
    this.now = options.now ?? Date.now;
  }

  async lookup(query: CatalogQuery): Promise<Result<ModelCapabilities, CatalogUnavailableError>> {
    const models = await this.models();
    if (!models) return err(new CatalogUnavailableError());
    const model = models.get(query.model);
    return ok(model ? capabilitiesOf(model) : NOT_FOUND_CAPABILITIES);
  }

  async list(query: ModelListQuery): Promise<Result<ModelListing, CatalogUnavailableError>> {
    if (query.apiKey) {
      const account = await this.get('/models/user', query.apiKey);
      if (account) return ok({ scope: 'account', models: account.map(toOption) });
    }
    const models = await this.models();
    if (!models) return err(new CatalogUnavailableError());
    return ok({ scope: 'public', models: [...models.values()].map(toOption) });
  }

  private async get(path: string, apiKey: string | null): Promise<CatalogModel[] | null> {
    try {
      const res = await this.fetch(`${OPENROUTER_BASE_URL}${path}`, {
        method: 'GET',
        headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      });
      if (!res.ok) return null;
      const json = (await res.json()) as { data?: CatalogModel[] };
      return Array.isArray(json.data) ? json.data.filter((m) => typeof m?.id === 'string') : null;
    } catch {
      return null;
    }
  }

  private async models(): Promise<Map<string, CatalogModel> | null> {
    const ttl = this.options.ttlMs ?? 10 * 60_000;
    if (this.cache && this.now() - this.cache.at < ttl) return this.cache.models;
    const list = await this.get('/models', null);
    if (!list) return null;
    const models = new Map(list.map((m) => [m.id, m]));
    this.cache = { at: this.now(), models };
    return models;
  }
}

const toOption = (model: CatalogModel) => ({ id: model.id, label: model.name ?? model.id, capabilities: capabilitiesOf(model) });
