import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { GeneratePatch, GetContextBudget, type GenerationDiagnostics } from '@hew/core/ai/application';
import type { PatchGenerator, ProposalParser, ProviderId, ProviderSettings, ProviderSettingsRepository, RepairKind } from '@hew/core/ai/domain';
import { ApplyPromptToSelection, SelectElement } from '@hew/core/editing/application';
import {
  AiPatchSourceAdapter,
  buildAnchor,
  describeElement,
  DomAnchorResolver,
  DomPageGateway,
  HtmlSanitizer,
  InMemoryEditSessionRepository,
  type PatchRequester,
} from '@hew/core/editing/infrastructure';
import { ok } from '@hew/core/shared/domain';
import { JSDOM } from 'jsdom';
import type { EvalCase } from './cases';

export interface CaseResult {
  readonly caseId: string;
  readonly provider: ProviderId;
  readonly model: string;
  /** A schema-valid proposal with known targets was produced (after repair and retry). */
  readonly valid: boolean;
  readonly firstTryValid: boolean;
  readonly repairs: readonly RepairKind[];
  readonly applied: boolean;
  readonly passed: boolean;
  readonly failedChecks: readonly string[];
  readonly attempts: number;
  readonly latencyMs: number;
  readonly costUsd?: number | undefined;
  readonly summary?: string | undefined;
  readonly error?: { readonly code: string; readonly message: string } | undefined;
  /** The ops of the accepted proposal, after repair, as the model's target ids. */
  readonly ops?: readonly unknown[] | undefined;
  /** What the model returned on each attempt, for diagnosing failures. */
  readonly rawOutputs: readonly unknown[];
}

const root = (path: string) => fileURLToPath(new URL(`../${path}`, import.meta.url));

/** The demo page with the demo app's stylesheet inlined, so computed styles behave like the real page. */
export function loadFixture(name: EvalCase['fixture']): JSDOM {
  const html = readFileSync(root(`fixtures/${name}.html`), 'utf8');
  const css = readFileSync(root('../../fixtures/demo-app/src/styles.css'), 'utf8');
  return new JSDOM(html.replace('</head>', `<style>${css}</style></head>`), { url: 'http://localhost:5179/' });
}

class FixedSettings implements ProviderSettingsRepository {
  constructor(private readonly value: ProviderSettings) {}
  async load() {
    return this.value;
  }
  async save() {}
}

/** Runs one case through the same use cases and adapters the extension uses, in a fresh DOM. */
export async function runCase(
  evalCase: EvalCase,
  settings: ProviderSettings,
  generator: PatchGenerator,
  parser: ProposalParser,
): Promise<CaseResult> {
  const config = settings.toConfig();
  if (!config.ok) throw config.error;
  const { window } = loadFixture(evalCase.fixture);
  const doc = window.document;
  const target = doc.querySelector(evalCase.select);
  if (!target) throw new Error(`case ${evalCase.id}: selector ${evalCase.select} matches nothing`);

  const repo = new FixedSettings(settings);
  const rawOutputs: unknown[] = [];
  const recording: PatchGenerator = {
    generate: async (request) => {
      const output = await generator.generate(request);
      rawOutputs.push(output.ok ? output.value.raw : { error: output.error });
      return output;
    },
    ping: (config) => generator.ping(config),
  };
  const generatePatch = new GeneratePatch(repo, recording, parser);
  const getBudget = new GetContextBudget(repo);
  let diagnostics: GenerationDiagnostics | undefined;
  let generated = false;
  let summary: string | undefined;
  let ops: readonly unknown[] | undefined;
  const requestPatch: PatchRequester = async (request) => {
    const result = await generatePatch.execute(request);
    diagnostics = result.ok ? result.value.diagnostics : result.error.diagnostics;
    generated = result.ok;
    if (result.ok) {
      summary = result.value.summary;
      ops = result.value.ops;
    }
    return result;
  };

  const resolver = new DomAnchorResolver(doc);
  let n = 0;
  const deps = {
    sessions: new InMemoryEditSessionRepository(),
    page: new DomPageGateway(doc, resolver, new HtmlSanitizer(window as unknown as Window)),
    patchSource: new AiPatchSourceAdapter(resolver, requestPatch, async () => ok(await getBudget.execute())),
    ids: { next: () => `eval-${++n}` },
    clock: { now: () => new Date() },
  };
  await new SelectElement(deps).execute({ sessionId: 'eval', anchor: buildAnchor(target).toJSON(), label: describeElement(target) });
  const applied = await new ApplyPromptToSelection(deps).execute({ sessionId: 'eval', prompt: evalCase.prompt });

  const failedChecks = applied.ok
    ? evalCase.checks.flatMap(({ name, check }) => {
        const problem = check(doc);
        return problem ? [`${name}: ${problem}`] : [];
      })
    : [];
  window.close();

  return {
    caseId: evalCase.id,
    provider: config.value.provider,
    model: config.value.model,
    valid: generated,
    firstTryValid: generated && diagnostics?.attempts === 1,
    repairs: diagnostics?.repairs ?? [],
    applied: applied.ok,
    passed: applied.ok && failedChecks.length === 0,
    failedChecks,
    attempts: diagnostics?.attempts ?? 0,
    latencyMs: diagnostics?.latencyMs ?? 0,
    costUsd: diagnostics?.costUsd,
    summary,
    error: applied.ok ? undefined : { code: applied.error.code, message: applied.error.message },
    ops,
    rawOutputs,
  };
}
