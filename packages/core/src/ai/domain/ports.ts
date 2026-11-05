import type { Result } from '../../shared/domain';
import type { EditContext } from './edit-context';
import type { CatalogUnavailableError, InvalidProposalError, ProviderError } from './errors';
import type { CompatibleProviderId, ProviderId } from './model';
import type { ModelCapabilities } from './model-capabilities';
import type { OutputMode } from './output-mode';
import type { ProposalDraft } from './patch-proposal';
import type { ProviderConfig, ProviderSettings } from './provider-settings';

export interface PatchGenerationRequest {
  readonly config: ProviderConfig;
  readonly context: EditContext;
  readonly prompt: string;
  readonly mode: OutputMode;
  /** Validation issues from a previous attempt, so the model can correct itself. */
  readonly previousIssues?: readonly string[];
}

export interface GeneratorDiagnostics {
  readonly latencyMs: number;
  readonly costUsd?: number | undefined;
}

/**
 * Raw model output: the JSON value the model produced, or `{ unparsedText }` when its answer was
 * not JSON. Parsing and repair happen outside the generator.
 */
export interface GeneratorOutput {
  readonly raw: unknown;
  readonly diagnostics: GeneratorDiagnostics;
}

export interface PatchGenerator {
  generate(request: PatchGenerationRequest): Promise<Result<GeneratorOutput, ProviderError>>;
  ping(config: ProviderConfig): Promise<Result<void, ProviderError>>;
}

/** Validates raw output against the provider's wire format. */
export interface ProposalParser {
  parse(raw: unknown, provider: ProviderId): Result<ProposalDraft, InvalidProposalError>;
}

/** What a catalog needs to look a model up: LiteLLM's catalog is the user's own proxy. */
export interface CatalogQuery {
  readonly provider: CompatibleProviderId;
  readonly model: string;
  /** The provider's chat completions API root (see `apiUrlOf`). */
  readonly apiUrl: string;
  /** Sent only to catalogs that need it (the LiteLLM proxy). */
  readonly apiKey: string | null;
}

export interface ModelCatalog {
  lookup(query: CatalogQuery): Promise<Result<ModelCapabilities, CatalogUnavailableError>>;
}

export interface ProviderSettingsRepository {
  load(): Promise<ProviderSettings>;
  save(settings: ProviderSettings): Promise<void>;
}

/** A model the provider offers, as shown in the settings model field. */
export interface ModelOption {
  readonly id: string;
  readonly label: string;
  readonly capabilities: ModelCapabilities;
}

/** `account`: what the user's key can use; `public`: the provider's full list (no key, or none needed). */
export interface ModelListing {
  readonly models: readonly ModelOption[];
  readonly scope: 'account' | 'public';
}

export interface ModelListQuery {
  readonly provider: ProviderId;
  /** API root (see `apiUrlOf`); Anthropic's is fixed. */
  readonly apiUrl: string;
  readonly apiKey: string | null;
}

/** Lists the models a provider offers to the user's key. */
export interface ModelLister {
  list(query: ModelListQuery): Promise<Result<ModelListing, CatalogUnavailableError>>;
}

/** Summary of the design system active for a page, from the Design System context (wired in composition). */
export interface DesignGuidanceSource {
  forPage(pageUrl: string, maxChars: number): Promise<string | null>;
}
