import type { Result } from '../../shared/domain';
import type { EditContext } from './edit-context';
import type { InvalidProposalError, ProviderError } from './errors';
import type { ProposalDraft } from './patch-proposal';
import type { ProviderConfig, ProviderSettings } from './provider-settings';

export interface PatchGenerationRequest {
  readonly config: ProviderConfig;
  readonly context: EditContext;
  readonly prompt: string;
  /** Validation issues from a previous attempt, so the model can correct itself. */
  readonly previousIssues?: readonly string[];
}

export interface PatchGenerator {
  generate(request: PatchGenerationRequest): Promise<Result<ProposalDraft, InvalidProposalError | ProviderError>>;
  ping(config: ProviderConfig): Promise<Result<void, ProviderError>>;
}

export interface ProviderSettingsRepository {
  load(): Promise<ProviderSettings>;
  save(settings: ProviderSettings): Promise<void>;
}
