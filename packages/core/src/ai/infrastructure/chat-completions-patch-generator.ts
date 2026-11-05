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

/** Some hosts (e.g. Mistral through OpenCode) send content as parts: thinking, then text. */
type ContentPart = { type?: string; text?: unknown };

interface ChatCompletion {
  choices?: {
    finish_reason?: string | null;
    message?: { content?: string | ContentPart[] | null; tool_calls?: { function?: { arguments?: string } }[] | null };
  }[];
  usage?: { cost?: number };
  error?: { code?: number | string; message?: string; type?: string };
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

export const MAX_OUTPUT_TOKENS = 16000;
const FALLBACK_OUTPUT_TOKENS = 4096;
const MAX_TOKENS_REJECTED = /max_tokens|max_completion_tokens|max_output_tokens|maximum (?:output|completion) tokens/i;

interface PostFailure {
  readonly error: ProviderError;
  readonly rejectedMaxTokens: boolean;
}
const failure = (error: ProviderError): PostFailure => ({ error, rejectedMaxTokens: false });
const isUnparsed = (raw: unknown) => typeof raw === 'object' && raw !== null && 'unparsedText' in raw;

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
      // Reasoning models spend thousands of hidden tokens before the answer; a low cap left them
      // with nothing to write. Proxies whose model caps output lower get one retry at the old cap.
      max_tokens: MAX_OUTPUT_TOKENS,
      // OpenRouter-only: report the cost, and route only to hosts that honour the output format.
      ...(openRouter ? { usage: { include: true } } : {}),
      messages: [
        { role: 'system', content: buildSystemPrompt(mode, 'pairs') },
        { role: 'user', content: buildUserMessage(request.context, request.prompt, request.previousIssues) },
      ],
      ...modeParameters(mode),
      ...(openRouter && mode !== 'prompted' ? { provider: { require_parameters: true } } : {}),
    };
    let response = await this.post(config, body);
    if (!response.ok && response.error.rejectedMaxTokens) {
      response = await this.post(config, { ...body, max_tokens: FALLBACK_OUTPUT_TOKENS });
    }
    if (!response.ok) return err(response.error.error);
    const completion = response.value;
    const raw = rawOutput(completion, mode);
    // Cut off mid-answer: the JSON is incomplete, and asking again would hit the same limit.
    if (completion.choices?.[0]?.finish_reason === 'length' && isUnparsed(raw)) {
      return err(new ProviderError('output-limit'));
    }
    return ok({
      raw,
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
    return response.ok ? ok(undefined) : err(response.error.error);
  }

  private async post(config: CompatibleConfig, body: unknown): Promise<Result<ChatCompletion, PostFailure>> {
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
      if (!res.ok) {
        const rejectedMaxTokens = res.status === 400 && MAX_TOKENS_REJECTED.test(json.error?.message ?? '');
        return err({ error: statusError(res.status, json), rejectedMaxTokens });
      }
      // Errors raised mid-generation arrive with HTTP 200 and an `error` field.
      if (json.error) return err(failure(statusError(typeof json.error.code === 'number' ? json.error.code : 0, json)));
      return ok(json);
    } catch (error) {
      if (controller.signal.aborted) return err(failure(new ProviderError('timeout')));
      if (config.provider === 'litellm') {
        return err(failure(new ProviderError('network', `is the LiteLLM proxy running at ${config.apiUrl.replace(/\/v1$/, '')}?`)));
      }
      return err(failure(new ProviderError('network', error instanceof Error ? error.message : undefined)));
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

/** The answer text: a plain string, or the `text` parts of a content array (thinking parts are skipped). */
export function contentText(content: string | ContentPart[] | null | undefined): string | undefined {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return undefined;
  const text = content
    .filter((part) => part?.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text as string)
    .join('');
  return text === '' ? undefined : text;
}

function rawOutput(completion: ChatCompletion, mode: OutputMode): unknown {
  const message = completion.choices?.[0]?.message;
  const content = contentText(message?.content);
  const text = mode === 'tool' ? (message?.tool_calls?.[0]?.function?.arguments ?? content) : content;
  if (typeof text !== 'string') return { unparsedText: '' };
  try {
    return JSON.parse(text);
  } catch {
    return { unparsedText: text };
  }
}

const MODEL_ACCESS = /access is disabled|not enabled|not available (?:for|to) your|no access to (?:this )?model|model access/i;

/** The provider's own message, shortened, so users see e.g. "Free usage limit reached". */
function providerDetail(body: ChatCompletion): string | undefined {
  const message = body.error?.message?.replace(/^Upstream request failed:\s*/i, '').trim();
  if (!message) return undefined;
  return message.length > 160 ? `${message.slice(0, 157)}…` : message;
}

export function statusError(status: number, body: ChatCompletion): ProviderError {
  const message = body.error?.message ?? '';
  const detail = providerDetail(body);
  if (MODEL_ACCESS.test(message)) return new ProviderError('model-access', detail);
  if (status === 400 && /response_format|json_schema|tool/i.test(message)) {
    return new ProviderError('unknown', 'the model rejected the output format; re-check the model in settings');
  }
  if (status === 410) return new ProviderError('unavailable', detail);
  const kind = STATUS_KINDS[status];
  // Auth and moderation messages are already clear; for the rest, the provider's words help.
  if (kind) return new ProviderError(kind, kind === 'auth' || kind === 'moderation' ? undefined : detail);
  return new ProviderError('unknown', [status ? `HTTP ${status}` : '', detail].filter(Boolean).join(': ') || undefined);
}
