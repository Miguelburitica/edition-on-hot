import Anthropic from '@anthropic-ai/sdk';
import { err, ok, type Result } from '../../shared/domain';
import {
  ProviderError,
  type GeneratorOutput,
  type PatchGenerationRequest,
  type PatchGenerator,
  type ProviderConfig,
} from '../domain';
import { APPLY_PATCH_TOOL_NAME, applyPatchJsonSchema } from './patch-schema';
import { buildUserMessage, SYSTEM_PROMPT } from './prompt-builder';

type AnthropicConfig = Extract<ProviderConfig, { provider: 'anthropic' }>;

export interface AnthropicGeneratorOptions {
  /** Custom fetch, used by tests. */
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

export const ANTHROPIC_API_URL = 'https://api.anthropic.com';

const TOOL: Anthropic.Beta.BetaTool = {
  name: APPLY_PATCH_TOOL_NAME,
  description: 'Apply structured DOM patch operations to the selected element of the page.',
  input_schema: applyPatchJsonSchema(),
};

/**
 * PatchGenerator backed by the Claude Messages API. Runs in the extension service worker, so the
 * SDK's browser guard is disabled on purpose: the key is the user's own and never reaches the page.
 */
export class AnthropicPatchGenerator implements PatchGenerator {
  constructor(private readonly options: AnthropicGeneratorOptions = {}) {}

  async generate(request: PatchGenerationRequest): Promise<Result<GeneratorOutput, ProviderError>> {
    const config = request.config;
    if (config.provider !== 'anthropic') return err(new ProviderError('unknown', 'wrong provider for this adapter'));
    const started = Date.now();
    let response: Anthropic.Beta.BetaMessage;
    try {
      response = await this.client(config).beta.messages.create({
        model: config.model,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium' },
        system: SYSTEM_PROMPT,
        tools: [TOOL],
        // Forced tool_choice is rejected by current models; the prompt requires the tool call instead.
        tool_choice: { type: 'auto' },
        messages: [{ role: 'user', content: buildUserMessage(request.context, request.prompt, request.previousIssues) }],
      });
    } catch (error) {
      return err(toProviderError(error));
    }

    if (response.stop_reason === 'refusal') {
      return err(new ProviderError('refusal', response.stop_details?.explanation ?? undefined));
    }
    const diagnostics = { latencyMs: Date.now() - started };
    const call = response.content.find(
      (block): block is Anthropic.Beta.BetaToolUseBlock => block.type === 'tool_use' && block.name === APPLY_PATCH_TOOL_NAME,
    );
    if (call) return ok({ raw: call.input, diagnostics });
    // No tool call: hand the text on, so repair can still extract JSON written as prose.
    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n');
    return ok({ raw: { unparsedText: text }, diagnostics });
  }

  async ping(config: ProviderConfig): Promise<Result<void, ProviderError>> {
    if (config.provider !== 'anthropic') return err(new ProviderError('unknown', 'wrong provider for this adapter'));
    try {
      await this.client(config).messages.create({
        model: config.model,
        max_tokens: 64,
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: 'Reply with OK.' }],
      });
      return ok(undefined);
    } catch (error) {
      return err(toProviderError(error));
    }
  }

  private client(config: AnthropicConfig): Anthropic {
    return new Anthropic({
      // Explicit values so ambient env/profile credentials can never override the user's key.
      apiKey: config.apiKey,
      authToken: null,
      baseURL: ANTHROPIC_API_URL,
      dangerouslyAllowBrowser: true,
      maxRetries: 1,
      timeout: this.options.timeoutMs ?? 120_000,
      ...(this.options.fetch ? { fetch: this.options.fetch } : {}),
    });
  }
}

function toProviderError(error: unknown): ProviderError {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new ProviderError('auth');
  }
  if (error instanceof Anthropic.RateLimitError) return new ProviderError('rate-limit');
  if (error instanceof Anthropic.APIConnectionTimeoutError) return new ProviderError('timeout');
  if (error instanceof Anthropic.APIConnectionError) return new ProviderError('network');
  if (error instanceof Anthropic.APIError) return new ProviderError('unknown', `HTTP ${error.status ?? '?'}`);
  return new ProviderError('unknown', error instanceof Error ? error.message : undefined);
}
