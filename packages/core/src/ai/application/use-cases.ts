import { err, ok, type Result } from '../../shared/domain';
import {
  EditContext,
  InvalidProposalError,
  MODEL_IDS,
  MODEL_LABELS,
  PatchProposal,
  ProviderSettings,
  type EditContextProps,
  type ModelId,
  type PatchGenerator,
  type ProposedOp,
  type ProviderSettingsRepository,
} from '../domain';

export interface AiError {
  readonly code: string;
  readonly message: string;
}

export interface GeneratePatchRequest {
  readonly prompt: string;
  readonly context: EditContextProps;
}

export interface GeneratePatchResponse {
  readonly summary: string;
  readonly ops: readonly ProposedOp[];
  readonly contextTruncated: boolean;
}

export interface ProviderSettingsView {
  readonly hasKey: boolean;
  readonly maskedKey: string | null;
  readonly model: ModelId;
  readonly models: readonly { readonly id: ModelId; readonly label: string }[];
}

const toAiError = (e: { code: string; message: string }): AiError => ({ code: e.code, message: e.message });

/** Generates a validated patch proposal; one retry is allowed when the model output is invalid. */
export class GeneratePatch {
  static readonly MAX_ATTEMPTS = 2;

  constructor(
    private readonly settings: ProviderSettingsRepository,
    private readonly generator: PatchGenerator,
  ) {}

  async execute(request: GeneratePatchRequest): Promise<Result<GeneratePatchResponse, AiError>> {
    const config = (await this.settings.load()).toConfig();
    if (!config.ok) return err(toAiError(config.error));

    const context = EditContext.create(request.context);
    let issues: readonly string[] | undefined;
    for (let attempt = 1; attempt <= GeneratePatch.MAX_ATTEMPTS; attempt++) {
      const draft = await this.generator.generate({
        config: config.value,
        context,
        prompt: request.prompt,
        ...(issues ? { previousIssues: issues } : {}),
      });
      if (!draft.ok) {
        if (draft.error instanceof InvalidProposalError) {
          issues = draft.error.issues;
          continue;
        }
        return err(toAiError(draft.error));
      }
      const proposal = PatchProposal.fromDraft(draft.value, context);
      if (proposal.ok) {
        return ok({ summary: proposal.value.summary, ops: proposal.value.ops, contextTruncated: context.truncated });
      }
      issues = proposal.error.issues;
    }
    return err(toAiError(new InvalidProposalError(issues ?? [])));
  }
}

export class GetProviderSettings {
  constructor(private readonly settings: ProviderSettingsRepository) {}

  async execute(): Promise<ProviderSettingsView> {
    return toView(await this.settings.load());
  }
}

export class SaveProviderSettings {
  constructor(private readonly settings: ProviderSettingsRepository) {}

  /** `apiKey` undefined keeps the stored key, so the model can change without re-entering it. */
  async execute(input: { apiKey?: string; model: string }): Promise<Result<ProviderSettingsView, AiError>> {
    const current = await this.settings.load();
    const next = ProviderSettings.create({ apiKey: input.apiKey ?? current.apiKey, model: input.model });
    if (!next.ok) return err(toAiError(next.error));
    await this.settings.save(next.value);
    return ok(toView(next.value));
  }
}

export class ClearApiKey {
  constructor(private readonly settings: ProviderSettingsRepository) {}

  async execute(): Promise<ProviderSettingsView> {
    const cleared = (await this.settings.load()).withoutKey();
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
    hasKey: settings.hasKey,
    maskedKey: settings.maskedKey,
    model: settings.model,
    models: MODEL_IDS.map((id) => ({ id, label: MODEL_LABELS[id] })),
  };
}
