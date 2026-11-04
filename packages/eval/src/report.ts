import type { RunResult } from './run';

export interface ModelSummary {
  readonly provider: string;
  readonly model: string;
  readonly cases: number;
  readonly firstTryValid: number;
  readonly validAfterRetry: number;
  readonly repaired: number;
  readonly applied: number;
  readonly passed: number;
  readonly medianLatencyMs: number;
  readonly totalCostUsd: number | null;
  readonly runs: number;
  /** Lowest and highest per-run pass rate; equal to `passed` for a single run. */
  readonly passedMin: number;
  readonly passedMax: number;
  /** Cases that passed in some runs and failed in others. */
  readonly inconsistent: readonly { readonly caseId: string; readonly passedRuns: number; readonly runs: number }[];
}

const rate = (results: readonly RunResult[], pick: (r: RunResult) => boolean) =>
  results.length ? results.filter(pick).length / results.length : 0;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string | number): Map<string | number, T[]> {
  const groups = new Map<string | number, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}

export function summarize(results: readonly RunResult[]): ModelSummary[] {
  const groups = new Map<string, RunResult[]>();
  for (const r of results) {
    const key = `${r.provider}\u0000${r.model}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.values()].map((rs) => {
    const costs = rs.map((r) => r.costUsd).filter((c): c is number => c !== undefined);
    const perRun = [...groupBy(rs, (r) => r.run).values()].map((run) => rate(run, (r) => r.passed));
    const inconsistent = [...groupBy(rs, (r) => r.caseId).entries()]
      .map(([caseId, runs]) => ({ caseId: String(caseId), passedRuns: runs.filter((r) => r.passed).length, runs: runs.length }))
      .filter((c) => c.passedRuns > 0 && c.passedRuns < c.runs);
    return {
      provider: rs[0]!.provider,
      model: rs[0]!.model,
      cases: rs.length,
      firstTryValid: rate(rs, (r) => r.firstTryValid),
      validAfterRetry: rate(rs, (r) => r.valid),
      repaired: rate(rs, (r) => r.repairs.length > 0),
      applied: rate(rs, (r) => r.applied),
      passed: rate(rs, (r) => r.passed),
      medianLatencyMs: median(rs.map((r) => r.latencyMs)),
      totalCostUsd: costs.length ? costs.reduce((a, b) => a + b, 0) : null,
      runs: perRun.length,
      passedMin: Math.min(...perRun),
      passedMax: Math.max(...perRun),
      inconsistent,
    };
  });
}

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function formatTable(summaries: readonly ModelSummary[]): string {
  const header = ['model', summaries.some((s) => s.runs > 1) ? 'cases × runs' : 'cases', 'first-try valid', 'valid after retry', 'repaired', 'applied', 'passed', 'median latency', 'cost'];
  const rows = summaries.map((s) => [
    `${s.provider}:${s.model}`,
    s.runs > 1 ? `${s.cases / s.runs} × ${s.runs}` : String(s.cases),
    pct(s.firstTryValid),
    pct(s.validAfterRetry),
    pct(s.repaired),
    pct(s.applied),
    s.runs > 1 ? `${pct(s.passed)} (${pct(s.passedMin)}–${pct(s.passedMax)})` : pct(s.passed),
    `${(s.medianLatencyMs / 1000).toFixed(1)}s`,
    s.totalCostUsd === null ? 'n/a' : `$${s.totalCostUsd.toFixed(4)}`,
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i]!.length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i]!)).join('  ');
  return [line(header), widths.map((w) => '-'.repeat(w)).join('  '), ...rows.map(line)].join('\n');
}

export function formatFailures(results: readonly RunResult[]): string {
  const repeated = results.some((r) => r.run > 1);
  return results
    .filter((r) => !r.passed)
    .map((r) => {
      const why = r.error ? `${r.error.code}: ${r.error.message}` : r.failedChecks.join('; ');
      return `  ✗ ${r.model} · ${r.caseId}${repeated ? ` (run ${r.run})` : ''} — ${why}`;
    })
    .join('\n');
}

export function formatInconsistent(summaries: readonly ModelSummary[]): string {
  return summaries
    .flatMap((s) => s.inconsistent.map((c) => `  ~ ${s.model} · ${c.caseId} — passed ${c.passedRuns}/${c.runs} runs`))
    .join('\n');
}
