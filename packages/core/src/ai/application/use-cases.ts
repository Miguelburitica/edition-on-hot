import { err, ok, type Result } from '../../shared/domain';
import {
  ANTHROPIC_MODEL_IDS,
  ANTHROPIC_MODEL_LABELS,
  apiUrlOf,
  chooseOutputMode,
  COMPATIBLE_PROVIDER_IDS,
  COMPATIBLE_PROVIDERS,
  EditContext,
  InvalidProposalError,
  isProviderId,
  MissingModelError,
  PatchProposal,
  PROVIDER_LABELS,
  repairDraft,
  UNKNOWN_CAPABILITIES,
  UnknownProviderError,
  type AnthropicModelId,
  type CatalogQuery,
  type CompatibleProviderId,
  type ContextBudget,
  type ContextProfile,
  type EditContextProps,
  type ModelCapabilities,
  type ModelCatalog,
  type OutputMode,
  type PatchGenerator,
  type ProposalDraft,
  type ProposalParser,
  type ProposedOp,
  type ProviderId,
  ProviderSettings,
  type ProviderSettingsRepository,
  type RepairKind,
} from '../domain';

export interface AiError {
  readonly code: string;
  readonly message: string;
}

export interface GeneratePatchRequest {
  readonly prompt: string;
  readonly context: EditContextProps;
}

export interface GenerationDiagnostics {
  readonly provider: ProviderId;
  readonly model: string;
  readonly mode: OutputMode;
  readonly attempts: number;
  /** Repairs that turned invalid output into a valid proposal, across attempts. */
  readonly repairs: readonly RepairKind[];
  readonly latencyMs: number;
  readonly costUsd?: number | undefined;
}

export interface GeneratePatchResponse {
  readonly summary: string;
  readonly ops: readonly ProposedOp[];
  readonly contextTruncated: boolean;
  readonly diagnostics: GenerationDiagnostics;
}

/** Failed generations still report what happened, so evals can count attempts and cost. */
export interface GeneratePatchError extends AiError {
  readonly diagnostics?: GenerationDiagnostics;
}

export interface ProviderSlotView {
  readonly hasKey: boolean;
  readonly maskedKey: string | null;
  readonly model: string;
  readonly profile: ContextProfile;
}

export interface CompatibleSlotView extends ProviderSlotView {
  readonly label: string;
  readonly suggestions: readonly { readonly id: string; readonly label: string }[];
  readonly capabilities: ModelCapabilities;
  readonly baseUrl: string;
  readonly baseUrlEditable: boolean;
  readonly keyRequired: boolean;
}

export interface ProviderSettingsView {
  readonly active: ProviderId;
  readonly anthropic: ProviderSlotView & {
    readonly label: string;
    readonly model: AnthropicModelId;
    readonly models: readonly { readonly id: AnthropicModelId; readonly label: string }[];
  };
  readonly openrouter: CompatibleSlotView;
  readonly opencode: CompatibleSlotView;
  readonly litellm: CompatibleSlotView;
}

const toAiError = (e: { code: string; message: string }): AiError => ({ code: e.code, message: e.message });

/**
 * Generates a validated patch proposal. Each attempt parses the raw output, repairs mechanical
 * mistakes if parsing fails, and checks targets; one retry is allowed with the remaining issues.
 */
export class GeneratePatch {
  static readonly MAX_ATTEMPTS = 2;

  constructor(
    private readonly settings: ProviderSettingsRepository,
    private readonly generator: PatchGenerator,
    private readonly parser: ProposalParser,
  ) {}

  async execute(request: GeneratePatchRequest): Promise<Result<GeneratePatchResponse, GeneratePatchError>> {
    const settings = await this.settings.load();
    const config = settings.toConfig();
    if (!config.ok) return err(toAiError(config.error));

    const context = EditContext.create(request.context, settings.budget());
    const mode = chooseOutputMode(config.value);
    const repairs = new Set<RepairKind>();
    let latencyMs = 0;
    let costUsd: number | undefined;
    let attempts = 0;
    const diagnostics = (): GenerationDiagnostics => ({
      provider: config.value.provider,
      model: config.value.model,
      mode,
      attempts,
      repairs: [...repairs],
      latencyMs,
      costUsd,
    });

    let issues: readonly string[] | undefined;
    while (attempts < GeneratePatch.MAX_ATTEMPTS) {
      attempts++;
      const output = await this.generator.generate({
        config: config.value,
        context,
        prompt: request.prompt,
        mode,
        ...(issues ? { previousIssues: issues } : {}),
      });
      if (!output.ok) return err({ ...toAiError(output.error), diagnostics: diagnostics() });
      latencyMs += output.value.diagnostics.latencyMs;
      if (output.value.diagnostics.costUsd !== undefined) {
        costUsd = (costUsd ?? 0) + output.value.diagnostics.costUsd;
      }

      const draft = this.parseWithRepair(output.value.raw, config.value.provider, repairs);
      if (!draft.ok) {
        issues = draft.error.issues;
        continue;
      }
      const proposal = PatchProposal.fromDraft(draft.value, context);
      if (proposal.ok) {
        return ok({
          summary: proposal.value.summary,
          ops: proposal.value.ops,
          contextTruncated: context.truncated,
          diagnostics: diagnostics(),
        });
      }
      issues = proposal.error.issues;
    }
    return err({ ...toAiError(new InvalidProposalError(issues ?? [])), diagnostics: diagnostics() });
  }

  private parseWithRepair(
    raw: unknown,
    provider: ProviderId,
    repairs: Set<RepairKind>,
  ): Result<ProposalDraft, InvalidProposalError> {
    const parsed = this.parser.parse(raw, provider);
    if (parsed.ok) return parsed;
    const repaired = repairDraft(raw);
    if (repaired.repairs.length === 0) return parsed;
    const reparsed = this.parser.parse(repaired.value, provider);
    if (reparsed.ok) for (const kind of repaired.repairs) repairs.add(kind);
    return reparsed;
  }
}

export class GetContextBudget {
  constructor(private readonly settings: ProviderSettingsRepository) {}

  async execute(): Promise<ContextBudget> {
    return (await this.settings.load()).budget();
  }
}

export interface LookupModelInput {
  readonly provider: CompatibleProviderId;
  readonly model: string;
  /** For LiteLLM, the proxy URL being edited; defaults to the saved one. */
  readonly baseUrl?: string;
}

export class LookupModel {
  constructor(
    private readonly catalog: ModelCatalog,
    private readonly settings?: ProviderSettingsRepository,
  ) {}

  /**
   * Looks up a model as it is being edited (with the saved key, for LiteLLM). Never fails: an
   * unreachable catalog, an invalid URL or an empty model yields `status: 'unknown'`.
   */
  async execute(input: LookupModelInput): Promise<ModelCapabilities> {
    const base = this.settings ? await this.settings.load() : ProviderSettings.empty();
    const draft = base.update(input.provider, {
      model: input.model,
      ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : {}),
    });
    if (!draft.ok) return UNKNOWN_CAPABILITIES;
    const slot = draft.value.slot(input.provider);
    if (slot.model === '') return UNKNOWN_CAPABILITIES;
    return this.lookup({ provider: input.provider, model: slot.model, apiUrl: apiUrlOf(input.provider, slot.baseUrl), apiKey: slot.apiKey });
  }

  async lookup(query: CatalogQuery): Promise<ModelCapabilities> {
    const result = await this.catalog.lookup(query);
    return result.ok ? result.value : UNKNOWN_CAPABILITIES;
  }
}

export class GetProviderSettings {
  constructor(private readonly settings: ProviderSettingsRepository) {}

  async execute(): Promise<ProviderSettingsView> {
    return toView(await this.settings.load());
  }
}

export interface SaveProviderSettingsInput {
  readonly provider: string;
  /** Omit to keep the stored key, so model or profile can change without re-entering it. */
  readonly apiKey?: string;
  readonly model: string;
  readonly profile?: ContextProfile;
  /** LiteLLM's proxy URL; ignored for providers with a fixed URL. */
  readonly baseUrl?: string;
}

/** Saves one provider's slot and makes it the active provider. */
export class SaveProviderSettings {
  constructor(
    private readonly settings: ProviderSettingsRepository,
    private readonly catalog: ModelCatalog,
  ) {}

  async execute(input: SaveProviderSettingsInput): Promise<Result<ProviderSettingsView, AiError>> {
    if (!isProviderId(input.provider)) return err(toAiError(new UnknownProviderError(input.provider)));
    const provider = input.provider;
    const current = await this.settings.load();
    const shaped = current.update(provider, {
      model: input.model,
      ...(input.apiKey !== undefined ? { apiKey: input.apiKey } : {}),
      ...(input.profile ? { profile: input.profile } : {}),
      ...(input.baseUrl !== undefined ? { baseUrl: input.baseUrl } : {}),
    });
    if (!shaped.ok) return err(toAiError(shaped.error));

    let next = shaped.value;
    if (provider !== 'anthropic') {
      const slot = next.slot(provider);
      if (slot.model === '') return err(toAiError(new MissingModelError(PROVIDER_LABELS[provider])));
      const capabilities = await new LookupModel(this.catalog).lookup({
        provider,
        model: slot.model,
        apiUrl: apiUrlOf(provider, slot.baseUrl),
        apiKey: slot.apiKey,
      });
      const withCapabilities = next.update(provider, { capabilities });
      if (!withCapabilities.ok) return err(toAiError(withCapabilities.error));
      next = withCapabilities.value;
    }
    next = next.activate(provider);
    await this.settings.save(next);
    return ok(toView(next));
  }
}

export class ClearApiKey {
  constructor(private readonly settings: ProviderSettingsRepository) {}

  /** Clears the key of the given provider (default: the active one); the other key is kept. */
  async execute(input: { provider?: ProviderId } = {}): Promise<ProviderSettingsView> {
    const cleared = (await this.settings.load()).withoutKey(input.provider);
    await this.settings.save(cleared);
    return toView(cleared);
  }
}

export class TestProviderConnection {
  constructor(
    private readonly settings: ProviderSettingsRepository,
    private readonly generator: PatchGenerator,
  ) {}

  async execute(): Promise<Result<void, AiError>> {
    const config = (await this.settings.load()).toConfig();
    if (!config.ok) return err(toAiError(config.error));
    const result = await this.generator.ping(config.value);
    return result.ok ? ok(undefined) : err(toAiError(result.error));
  }
}

function toView(settings: ProviderSettings): ProviderSettingsView {
  return {
    active: settings.active,
    anthropic: {
      label: PROVIDER_LABELS.anthropic,
      hasKey: settings.hasKey('anthropic'),
      maskedKey: settings.maskedKey('anthropic'),
      model: settings.anthropic.model,
      profile: settings.anthropic.profile,
      models: ANTHROPIC_MODEL_IDS.map((id) => ({ id, label: ANTHROPIC_MODEL_LABELS[id] })),
    },
    openrouter: compatibleView(settings, 'openrouter'),
    opencode: compatibleView(settings, 'opencode'),
    litellm: compatibleView(settings, 'litellm'),
  };
}

function compatibleView(settings: ProviderSettings, provider: CompatibleProviderId): CompatibleSlotView {
  const slot = settings.slot(provider);
  const spec = COMPATIBLE_PROVIDERS[provider];
  return {
    label: PROVIDER_LABELS[provider],
    hasKey: settings.hasKey(provider),
    maskedKey: settings.maskedKey(provider),
    model: slot.model,
    profile: slot.profile,
    suggestions: spec.suggestions,
    capabilities: slot.capabilities,
    baseUrl: slot.baseUrl,
    baseUrlEditable: spec.baseUrlEditable,
    keyRequired: spec.keyRequired,
  };
}

export { COMPATIBLE_PROVIDER_IDS };
