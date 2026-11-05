import { apiUrlOf, ProviderSettings, type ModelCatalog, type PatchGenerator, type ProposalParser, type ProviderId } from '@hew/core/ai/domain';
import { err, ok, type Result } from '@hew/core/shared/domain';
import type { EvalCase } from './cases';
import { runCase, type CaseResult } from './harness';

/** Environment variables holding each provider's key, in lookup order. The first one is the documented name. */
export const KEY_VARIABLES: Record<ProviderId, readonly string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY', 'OPEN_ROUTER_KEY'],
  opencode: ['OPENCODE_API_KEY', 'OPENCODE_APIKEY'],
  litellm: ['LITELLM_API_KEY'],
};

/** LiteLLM's proxy URL; the other providers have fixed endpoints. */
export const LITELLM_BASE_URL_VARIABLE = 'LITELLM_BASE_URL';

export interface EvalOptions {
  readonly provider: ProviderId;
  readonly models: readonly string[];
  readonly cases: readonly EvalCase[];
  /** `null` only for LiteLLM proxies without auth. */
  readonly apiKey: string | null;
  /** LiteLLM's proxy URL. */
  readonly baseUrl?: string | undefined;
  readonly generatorFor: (evalCase: EvalCase) => PatchGenerator;
  readonly parser: ProposalParser;
  readonly catalog: ModelCatalog | null;
  /** How many times each case runs per model (default 1). */
  readonly repeat?: number;
  readonly onResult?: (result: RunResult) => void;
}

/** A case result tagged with the run it belongs to (1-based). */
export type RunResult = CaseResult & { readonly run: number };

export function requireKey(provider: ProviderId, env: Record<string, string | undefined>): Result<string, string> {
  const variables = KEY_VARIABLES[provider];
  const key = variables.map((variable) => env[variable]?.trim()).find((value) => value);
  return key ? ok(key) : err(`Set ${variables.join(' or ')} to run evals against ${provider}. No provider was called.`);
}

export interface ProviderEnv {
  readonly apiKey: string | null;
  readonly baseUrl?: string;
}

/** What the eval needs from the environment: a key, except for LiteLLM, which needs its proxy URL instead. */
export function requireProviderEnv(provider: ProviderId, env: Record<string, string | undefined>): Result<ProviderEnv, string> {
  if (provider !== 'litellm') {
    const key = requireKey(provider, env);
    return key.ok ? ok({ apiKey: key.value }) : key;
  }
  const baseUrl = env[LITELLM_BASE_URL_VARIABLE]?.trim();
  if (!baseUrl) {
    return err(`Set ${LITELLM_BASE_URL_VARIABLE} (e.g. http://localhost:4000) to run evals against litellm. No provider was called.`);
  }
  const key = requireKey(provider, env);
  return ok({ apiKey: key.ok ? key.value : null, baseUrl });
}

/** Runs every case `repeat` times per model, sequentially, and returns the per-case results. */
export async function runEval(options: EvalOptions): Promise<RunResult[]> {
  const repeat = Math.max(1, Math.floor(options.repeat ?? 1));
  const results: RunResult[] = [];
  for (const model of options.models) {
    const settings = await settingsFor(options, model);
    for (let run = 1; run <= repeat; run++) {
      for (const evalCase of options.cases) {
        const result = { ...(await runCase(evalCase, settings, options.generatorFor(evalCase), options.parser)), run };
        results.push(result);
        options.onResult?.(result);
      }
    }
  }
  return results;
}

/** The same settings validation, catalog lookup and output-mode inputs the extension uses. */
async function settingsFor(options: EvalOptions, model: string): Promise<ProviderSettings> {
  const { provider } = options;
  const updated = ProviderSettings.empty().update(provider, {
    apiKey: options.apiKey,
    model,
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
  });
  if (!updated.ok) throw updated.error;
  let settings = updated.value.activate(provider);
  if (provider !== 'anthropic' && options.catalog) {
    const slot = settings.slot(provider);
    const capabilities = await options.catalog.lookup({ provider, model: slot.model, apiUrl: apiUrlOf(provider, slot.baseUrl), apiKey: slot.apiKey });
    if (capabilities.ok) {
      const withCapabilities = settings.update(provider, { capabilities: capabilities.value });
      if (withCapabilities.ok) settings = withCapabilities.value;
    }
  }
  return settings;
}
