import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { isProviderId, type PatchGenerator } from '@hew/core/ai/domain';
import {
  AnthropicPatchGenerator,
  OpenRouterModelCatalog,
  OpenRouterPatchGenerator,
  PatchGeneratorRouter,
} from '@hew/core/ai/infrastructure';
import { ok } from '@hew/core/shared/domain';
import { CASES, type EvalCase } from './cases';
import { formatFailures, formatInconsistent, formatTable, summarize } from './report';
import { requireKey, runEval } from './run';

const { values } = parseArgs({
  // `pnpm eval -- --flag` forwards the separator literally.
  args: process.argv.slice(2).filter((arg) => arg !== '--'),
  options: {
    model: { type: 'string', multiple: true },
    provider: { type: 'string', default: 'openrouter' },
    case: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    repeat: { type: 'string', default: '1' },
  },
});

const provider = values.provider ?? 'openrouter';
if (!isProviderId(provider)) {
  console.error(`Unknown provider "${provider}". Use openrouter or anthropic.`);
  process.exit(1);
}
const dryRun = values['dry-run'] ?? false;
const repeat = Number(values.repeat);
if (!Number.isInteger(repeat) || repeat < 1) {
  console.error(`--repeat must be a whole number of at least 1, got "${values.repeat}".`);
  process.exit(1);
}
const cases = CASES.filter((c) => !values.case || c.id.includes(values.case));
if (cases.length === 0) {
  console.error(`No case matches "${values.case}". Cases: ${CASES.map((c) => c.id).join(', ')}`);
  process.exit(1);
}

/** Dry runs answer with each case's reference patch, proving the cases and checks without a provider. */
const referenceGenerator = (evalCase: EvalCase): PatchGenerator => ({
  generate: async () => ok({ raw: evalCase.reference, diagnostics: { latencyMs: 0 } }),
  ping: async () => ok(undefined),
});

let apiKey = 'dry-run';
let models = values.model ?? [];
if (dryRun) {
  models = ['reference'];
} else {
  const key = requireKey(provider, process.env);
  if (!key.ok) {
    console.error(key.error);
    process.exit(1);
  }
  apiKey = key.value;
  if (models.length === 0) {
    console.error('Pass at least one --model, e.g. --model z-ai/glm-5.3-flash --model anthropic/claude-haiku-5.5');
    process.exit(1);
  }
}

const router = new PatchGeneratorRouter({ anthropic: new AnthropicPatchGenerator(), openrouter: new OpenRouterPatchGenerator() });
const runs = cases.length * models.length * repeat;
const times = repeat > 1 ? ` × ${repeat} runs` : '';
console.log(
  dryRun
    ? `Dry run: ${cases.length} cases${times} with their reference patches (no provider calls).`
    : `Running ${cases.length} cases × ${models.length} model(s)${times} on ${provider}: ${runs} generations, up to ${runs * 2} requests with retries.`,
);

const results = await runEval({
  provider,
  // A syntactically valid id is needed for the dry run's settings; it is never sent anywhere.
  models: dryRun ? [provider === 'openrouter' ? 'eval/reference' : 'claude-opus-5-5'] : models,
  cases,
  apiKey,
  generatorFor: (evalCase) => (dryRun ? referenceGenerator(evalCase) : router),
  parser: router,
  catalog: dryRun ? null : new OpenRouterModelCatalog(),
  repeat,
  onResult: (r) =>
    console.log(
      `${r.passed ? '✓' : '✗'} ${r.model} · ${r.caseId}${repeat > 1 ? ` (run ${r.run}/${repeat})` : ''}${
        r.repairs.length ? ` (repaired: ${r.repairs.join(', ')})` : ''
      }`,
    ),
});

const summaries = summarize(results);
console.log(`\n${formatTable(summaries)}`);
const inconsistent = formatInconsistent(summaries);
if (inconsistent) console.log(`\nInconsistent between runs:\n${inconsistent}`);
const failures = formatFailures(results);
if (failures) console.log(`\nFailures:\n${failures}`);

if (!dryRun) {
  const dir = fileURLToPath(new URL('../results/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  const file = `${dir}${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify({ provider, models, repeat, summaries, results }, null, 2));
  console.log(`\nResults written to ${file}`);
}
process.exitCode = dryRun && results.some((r) => !r.passed) ? 1 : 0;
