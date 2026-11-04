import { err, ok, type Result } from '../../shared/domain';
import { CatalogUnavailableError, NOT_FOUND_CAPABILITIES, type ModelCapabilities, type ModelCatalog } from '../domain';
import { OPENROUTER_API_URL } from './openrouter-patch-generator';

interface CatalogModel {
  id: string;
  context_length?: number;
  supported_parameters?: string[];
}

export interface OpenRouterCatalogOptions {
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  readonly ttlMs?: number;
}

/** Reads OpenRouter's public model list (no key is sent) and caches it. */
export class OpenRouterModelCatalog implements ModelCatalog {
  private cache: { at: number; models: Map<string, CatalogModel> } | null = null;
  private readonly fetch: typeof fetch;
  private readonly now: () => number;

  constructor(private readonly options: OpenRouterCatalogOptions = {}) {
    this.fetch = options.fetch ?? ((...args) => globalThis.fetch(...args));
    this.now = options.now ?? Date.now;
  }

  async lookup(modelId: string): Promise<Result<ModelCapabilities, CatalogUnavailableError>> {
    const models = await this.models();
    if (!models) return err(new CatalogUnavailableError());
    const model = models.get(modelId);
    if (!model) return ok(NOT_FOUND_CAPABILITIES);
    const params = new Set(model.supported_parameters ?? []);
    return ok({
      status: 'found',
      structuredOutputs: params.has('structured_outputs'),
      tools: params.has('tools'),
      contextLength: model.context_length,
    });
  }

  private async models(): Promise<Map<string, CatalogModel> | null> {
    const ttl = this.options.ttlMs ?? 10 * 60_000;
    if (this.cache && this.now() - this.cache.at < ttl) return this.cache.models;
    try {
      const res = await this.fetch(`${OPENROUTER_API_URL}/models`, { method: 'GET' });
      if (!res.ok) return null;
      const json = (await res.json()) as { data?: CatalogModel[] };
      const models = new Map((json.data ?? []).map((m) => [m.id, m]));
      this.cache = { at: this.now(), models };
      return models;
    } catch {
      return null;
    }
  }
}
