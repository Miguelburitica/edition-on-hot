import { err, ok, type Result } from '../../shared/domain';
import {
  OPENROUTER_BASE_URL,
  ProviderError,
  type GeneratorOutput,
  type OutputMode,
  type PatchGenerationRequest,
  type PatchGenerator,
  type ProviderConfig,
  type ProviderFailureKind,
} from '../domain';
import { APPLY_PATCH_TOOL_NAME, strictApplyPatchJsonSchema } from './patch-schema';
import { buildSystemPrompt, buildUserMessage } from './prompt-builder';

export const OPENROUTER_API_URL = OPENROUTER_BASE_URL;

export interface ChatCompletionsGeneratorOptions {
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

interface ChatCompletion {
  choices?: { message?: { content?: string | null; tool_calls?: { function?: { arguments?: string } }[] } }[];
  usage?: { cost?: number };
  error?: { code?: number; message?: string };
}

const STATUS_KINDS: Record<number, ProviderFailureKind> = {
  401: 'auth',
  402: 'credits',
  403: 'moderation',
  408: 'timeout',
  429: 'rate-limit',
  502: 'unavailable',
  503: 'no-provider',
};

type CompatibleConfig = Extract<ProviderConfig, { apiUrl: string }>;

/**
 * PatchGenerator for OpenAI-compatible chat completions APIs: OpenRouter, OpenCode and LiteLLM.
 * The URL and key come from the config; the request shape depends on the output mode. The raw JSON
 * goes back unparsed so the application can repair it.
 */
export class ChatCompletionsPatchGenerator implements PatchGenerator {
  private readonly fetch: typeof fetch;

  constructor(private readonly options: ChatCompletionsGeneratorOptions = {}) {
    this.fetch = options.fetch ?? ((...args) => globalThis.fetch(...args));
  }

  async generate(request: PatchGenerationRequest): Promise<Result<GeneratorOutput, ProviderError>> {
    const { config, mode } = request;
    if (config.provider === 'anthropic') return err(new ProviderError('unknown', 'wrong provider for this adapter'));
    const started = Date.now();
    const openRouter = config.provider === 'openrouter';
    const body = {
      model: config.model,
      max_tokens: 4096,
      // OpenRouter-only: report the cost, and route only to hosts that honour the output format.
      ...(openRouter ? { usage: { include: true } } : {}),
      messages: [
        { role: 'system', content: buildSystemPrompt(mode, 'pairs') },
        { role: 'user', content: buildUserMessage(request.context, request.prompt, request.previousIssues) },
      ],
      ...modeParameters(mode),
      ...(openRouter && mode !== 'prompted' ? { provider: { require_parameters: true } } : {}),
    };
    const response = await this.post(config, body);
    if (!response.ok) return response;
    const completion = response.value;
    return ok({
      raw: rawOutput(completion, mode),
      diagnostics: {
        latencyMs: Date.now() - started,
        ...(typeof completion.usage?.cost === 'number' ? { costUsd: completion.usage.cost } : {}),
      },
    });
  }

  async ping(config: ProviderConfig): Promise<Result<void, ProviderError>> {
    if (config.provider === 'anthropic') return err(new ProviderError('unknown', 'wrong provider for this adapter'));
    const response = await this.post(config, {
      model: config.model,
      max_tokens: 1,
      messages: [{ role: 'user', content: 'Reply with OK.' }],
    });
    return response.ok ? ok(undefined) : response;
  }

  private async post(config: CompatibleConfig, body: unknown): Promise<Result<ChatCompletion, ProviderError>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 60_000);
    try {
      const res = await this.fetch(`${config.apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => ({}))) as ChatCompletion;
      if (!res.ok) return err(statusError(res.status, json));
      // Errors raised mid-generation arrive with HTTP 200 and an `error` field.
      if (json.error) return err(statusError(json.error.code ?? 0, json));
      return ok(json);
    } catch (error) {
      if (controller.signal.aborted) return err(new ProviderError('timeout'));
      if (config.provider === 'litellm') {
        return err(new ProviderError('network', `is the LiteLLM proxy running at ${config.apiUrl.replace(/\/v1$/, '')}?`));
      }
      return err(new ProviderError('network', error instanceof Error ? error.message : undefined));
    } finally {
      clearTimeout(timer);
    }
  }
}

function modeParameters(mode: OutputMode): Record<string, unknown> {
  switch (mode) {
    case 'json_schema':
      return {
        response_format: {
          type: 'json_schema',
          json_schema: { name: APPLY_PATCH_TOOL_NAME, strict: true, schema: strictApplyPatchJsonSchema() },
        },
      };
    case 'tool':
      return {
        tools: [
          {
            type: 'function',
            function: {
              name: APPLY_PATCH_TOOL_NAME,
              description: 'Apply structured DOM patch operations to the selected element of the page.',
              parameters: strictApplyPatchJsonSchema(),
            },
          },
        ],
        tool_choice: { type: 'function', function: { name: APPLY_PATCH_TOOL_NAME } },
      };
    case 'prompted':
      return {};
  }
}

function rawOutput(completion: ChatCompletion, mode: OutputMode): unknown {
  const message = completion.choices?.[0]?.message;
  const text = mode === 'tool' ? (message?.tool_calls?.[0]?.function?.arguments ?? message?.content) : message?.content;
  if (typeof text !== 'string') return { unparsedText: '' };
  try {
    return JSON.parse(text);
  } catch {
    return { unparsedText: text };
  }
}

function statusError(status: number, body: ChatCompletion): ProviderError {
  const kind = STATUS_KINDS[status];
  if (kind) return new ProviderError(kind);
  const message = body.error?.message ?? '';
  if (status === 400 && /response_format|tool/i.test(message)) {
    return new ProviderError('unknown', 'the model rejected the output format; re-check the model in settings');
  }
  return new ProviderError('unknown', status ? `HTTP ${status}` : message || undefined);
}
