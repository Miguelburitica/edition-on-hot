import { ok } from '@hew/core/shared/domain';
import { PatchGeneratorRouter } from '@hew/core/ai/infrastructure';
import type { PatchGenerator } from '@hew/core/ai/domain';
import { describe, expect, it, vi } from 'vitest';
import { CASES, type EvalCase } from './cases';
import { isReddish } from './checks';
import { loadFixture } from './harness';
import { formatInconsistent, formatTable, summarize } from './report';
import { requireKey, runEval } from './run';

const parser = new PatchGeneratorRouter({});
const answering = (raw: unknown, costUsd?: number): PatchGenerator => ({
  generate: vi.fn(async () => ok({ raw, diagnostics: { latencyMs: 1200, costUsd } })),
  ping: vi.fn(async () => ok(undefined)),
});

describe('eval cases', () => {
  it.each(CASES.map((c) => [c.id, c] as const))('%s: checks fail on the untouched page', (_id, evalCase) => {
    const { window } = loadFixture(evalCase.fixture);
    const problems = evalCase.checks.map(({ check }) => check(window.document)).filter(Boolean);
    expect(problems.length).toBeGreaterThan(0);
  });

  it('recognizes red colors', () => {
    expect(['red', '#dc2626', '#f00', 'rgb(220, 38, 38)', 'rgba(239, 68, 68, 1)'].every(isReddish)).toBe(true);
    expect(['blue', '#4f46e5', 'rgb(254, 243, 199)', 'transparent'].some(isReddish)).toBe(false);
  });
});

describe('runEval', () => {
  const bannerCase = CASES.find((c) => c.id === 'banner-above-form')!;
  const buttonCase = CASES.find((c) => c.id === 'red-primary-button')!;

  it('runs cases per model and reports metrics, including repairs and wrong edits', async () => {
    const answers = new Map<string, PatchGenerator>([
      // Fenced JSON with a bare target number: repaired, then passes.
      [bannerCase.id, answering({ unparsedText: '```json\n' + JSON.stringify({ ...bannerCase.reference, ops: bannerCase.reference.ops.map((op) => ('target' in op ? { ...op, target: '0' } : op)) }) + '\n```' }, 0.001)],
      // Valid but wrong: colors the button blue.
      [buttonCase.id, answering({ summary: 'Blue', ops: [{ type: 'setStyle', target: 't0', styles: { 'background-color': 'blue' } }] }, 0.002)],
    ]);
    const results = await runEval({
      provider: 'openrouter',
      models: ['vendor/fake-model'],
      cases: [bannerCase, buttonCase],
      apiKey: 'sk-or-test',
      generatorFor: (c: EvalCase) => answers.get(c.id)!,
      parser,
      catalog: { lookup: async () => ok({ status: 'found', structuredOutputs: true, tools: true }) },
    });

    expect(results.map((r) => [r.caseId, r.passed])).toEqual([
      ['banner-above-form', true],
      ['red-primary-button', false],
    ]);
    expect(results[0]!.repairs).toEqual(expect.arrayContaining(['extracted-json', 'normalized-target']));
    expect(results[1]!.failedChecks[0]).toContain('the sign up button has a red background');

    const [summary] = summarize(results);
    expect(summary).toMatchObject({
      model: 'vendor/fake-model',
      cases: 2,
      firstTryValid: 1,
      validAfterRetry: 1,
      repaired: 0.5,
      applied: 1,
      passed: 0.5,
      medianLatencyMs: 1200,
    });
    expect(summary!.totalCostUsd).toBeCloseTo(0.003);
    expect(formatTable([summary!])).toContain('openrouter:vendor/fake-model');
  });

  it('fails only the position check when the banner lands inside the form', async () => {
    // GLM 5.3 Flash's real answer on 2026-11-04: right banner, wrong place.
    const prepended = {
      ...bannerCase.reference,
      ops: bannerCase.reference.ops.map((op) => (op.type === 'insert' ? { ...op, position: 'prepend' as const } : op)),
    };
    const [result] = await runEval({
      provider: 'openrouter',
      models: ['vendor/fake-model'],
      cases: [bannerCase],
      apiKey: 'k',
      generatorFor: () => answering(prepended),
      parser,
      catalog: null,
    });
    expect(result!.failedChecks).toEqual(['the banner sits above the form, outside it: the banner is inside the form']);
  });

  it('counts a case whose output never validates as invalid and not applied', async () => {
    const results = await runEval({
      provider: 'openrouter',
      models: ['vendor/fake-model'],
      cases: [buttonCase],
      apiKey: 'k',
      generatorFor: () => answering({ unparsedText: 'I would rather not.' }),
      parser,
      catalog: null,
    });
    expect(results[0]).toMatchObject({ valid: false, applied: false, passed: false, attempts: 2, error: { code: 'invalid-patch' } });
  });
});

describe('repeat', () => {
  const buttonCase = CASES.find((c) => c.id === 'red-primary-button')!;
  const headingCase = CASES.find((c) => c.id === 'rename-heading')!;
  const red = { summary: 'Red', ops: [{ type: 'setStyle', target: 't0', styles: { 'background-color': 'red' } }] };
  const blue = { summary: 'Blue', ops: [{ type: 'setStyle', target: 't0', styles: { 'background-color': 'blue' } }] };

  /** The button case alternates pass/fail/pass across runs; the heading case always passes. */
  function flakyGenerators() {
    let buttonCalls = 0;
    return (c: EvalCase): PatchGenerator =>
      c.id === buttonCase.id ? answering(++buttonCalls === 2 ? blue : red) : answering(headingCase.reference);
  }

  it('runs each case N times and reports the mean pass rate, its range and inconsistent cases', async () => {
    const results = await runEval({
      provider: 'openrouter',
      models: ['vendor/fake-model'],
      cases: [buttonCase, headingCase],
      apiKey: 'k',
      generatorFor: flakyGenerators(),
      parser,
      catalog: null,
      repeat: 3,
    });
    expect(results.map((r) => [r.run, r.caseId, r.passed])).toEqual([
      [1, 'red-primary-button', true],
      [1, 'rename-heading', true],
      [2, 'red-primary-button', false],
      [2, 'rename-heading', true],
      [3, 'red-primary-button', true],
      [3, 'rename-heading', true],
    ]);
    const [summary] = summarize(results);
    expect(summary).toMatchObject({ cases: 6, runs: 3, passedMin: 0.5, passedMax: 1 });
    expect(summary!.passed).toBeCloseTo(5 / 6);
    expect(summary!.inconsistent).toEqual([{ caseId: 'red-primary-button', passedRuns: 2, runs: 3 }]);
    expect(formatTable([summary!])).toContain('83% (50%–100%)');
    expect(formatTable([summary!])).toContain('2 × 3');
    expect(formatInconsistent([summary!])).toBe('  ~ vendor/fake-model · red-primary-button — passed 2/3 runs');
  });

  it('keeps single-run output unchanged', async () => {
    const results = await runEval({
      provider: 'openrouter',
      models: ['vendor/fake-model'],
      cases: [headingCase],
      apiKey: 'k',
      generatorFor: () => answering(headingCase.reference),
      parser,
      catalog: null,
    });
    const [summary] = summarize(results);
    expect(summary).toMatchObject({ runs: 1, passedMin: 1, passedMax: 1, inconsistent: [] });
    const table = formatTable([summary!]);
    expect(table.split('\n')[0]).toMatch(/^model\s+cases\s+first-try valid/);
    expect(table).toMatch(/100%\s+1\.2s/);
    expect(table).not.toContain('–');
  });
});

describe('requireKey', () => {
  it('names the variable to set and never returns an empty key', () => {
    const missing = requireKey('openrouter', {});
    expect(!missing.ok && missing.error).toBe('Set OPENROUTER_API_KEY to run evals against openrouter. No provider was called.');
    expect(requireKey('anthropic', { ANTHROPIC_API_KEY: '  ' }).ok).toBe(false);
    expect(requireKey('openrouter', { OPENROUTER_API_KEY: 'sk-or-1' })).toEqual(ok('sk-or-1'));
  });
});
