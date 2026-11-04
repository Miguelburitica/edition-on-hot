import { err, type Result } from '../../shared/domain';
import {
  ProviderError,
  type GeneratorOutput,
  type InvalidProposalError,
  type PatchGenerationRequest,
  type PatchGenerator,
  type ProposalDraft,
  type ProposalParser,
  type ProviderConfig,
  type ProviderId,
} from '../domain';
import { parseProposalDraft } from './patch-schema';

/** The single PatchGenerator/ProposalParser the composition roots wire: dispatches by provider. */
export class PatchGeneratorRouter implements PatchGenerator, ProposalParser {
  constructor(private readonly generators: Readonly<Partial<Record<ProviderId, PatchGenerator>>>) {}

  generate(request: PatchGenerationRequest): Promise<Result<GeneratorOutput, ProviderError>> {
    const generator = this.generators[request.config.provider];
    return generator ? generator.generate(request) : Promise.resolve(err(missing(request.config.provider)));
  }

  ping(config: ProviderConfig): Promise<Result<void, ProviderError>> {
    const generator = this.generators[config.provider];
    return generator ? generator.ping(config) : Promise.resolve(err(missing(config.provider)));
  }

  /** One parser serves both wire formats; see patch-schema.ts. */
  parse(raw: unknown, _provider: ProviderId): Result<ProposalDraft, InvalidProposalError> {
    return parseProposalDraft(raw);
  }
}

const missing = (provider: string) => new ProviderError('unknown', `no generator configured for ${provider}`);
