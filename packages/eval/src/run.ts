import { ProviderSettings, type ModelCatalog, type PatchGenerator, type ProposalParser, type ProviderId } from '@hew/core/ai/domain';
import { err, ok, type Result } from '@hew/core/shared/domain';
import type { EvalCase } from './cases';
import { runCase, type CaseResult } from './harness';

/** Environment variables holding each provider's key, in lookup order. The first one is the documented name. */
export const KEY_VARIABLES: Record<ProviderId, readonly string[]> = {
  anthropic: ['ANTHROPIC_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY', 'OPEN_ROUTER_KEY'],
};

export interface EvalOptions {
  readonly provider: ProviderId;
  readonly models: readonly string[];
  readonly cases: readonly EvalCase[];
  readonly apiKey: string;
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

async function settingsFor(options: EvalOptions, model: string): Promise<ProviderSettings> {
  const capabilities =
    options.provider === 'openrouter' && options.catalog ? await options.catalog.lookup(model) : null;
  const updated = ProviderSettings.empty().update(options.provider, {
    apiKey: options.apiKey,
    model,
    ...(capabilities?.ok ? { capabilities: capabilities.value } : {}),
  });
  if (!updated.ok) throw updated.error;
  return updated.value.activate(options.provider);
}
