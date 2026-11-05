import { codeSpan, plainText, type ChangeSpec, type SpecChange, type SpecStep, type SpecToken } from '../domain';

/** A code fence longer than any backtick run in the content, so content can never close it. */
export function fenced(language: string, content: string): string {
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${content.replace(/\n+$/, '')}\n${fence}`;
}

/** Inline text safe on one Markdown line (already plain in the spec; applied again defensively). */
export const inline = (value: string): string => value.replace(/\s+/g, ' ').trim();

export function quoted(value: string): string {
  return inline(value).replace(/"/g, '\u201d');
}

const cell = (value: string) => codeSpan(value).replace(/\|/g, '\\|');

export function stepLines(steps: readonly SpecStep[]): string[] {
  return steps.flatMap((step, i) => [`${i + 1}. ${step.description}`, ...(step.code ? ['', indent(fenced(step.code.language, step.code.content)), ''] : [])]);
}

const indent = (block: string) =>
  block
    .split('\n')
    .map((line) => (line ? `   ${line}` : line))
    .join('\n');

export function tokenTable(tokens: readonly SpecToken[]): string[] {
  if (tokens.length === 0) return [];
  return ['| Token | Value | Group |', '| --- | --- | --- |', ...tokens.map((t) => `| ${cell(t.cssVar)} | ${cell(t.value)} | ${plainText(t.group)} |`)];
}

export function scenarioLines(change: SpecChange): string[] {
  return [
    `#### Scenario: ${change.scenario.name}`,
    `- **WHEN** ${change.scenario.when}`,
    `- **THEN** ${change.scenario.then}`,
    ...change.scenario.and.map((line) => `- **AND** ${line}`),
  ];
}

export function requirementBlock(change: SpecChange): string[] {
  return [`### Requirement: ${change.requirement}`, change.statement, '', ...scenarioLines(change)];
}

export function taskLines(spec: ChangeSpec): string[] {
  const lines: string[] = [];
  for (const change of spec.changes) {
    lines.push(`## ${change.index}. ${change.requirement}`, '');
    const where = change.targets.map((t) => codeSpan(t.selector)).join(', ') || 'the page';
    let n = 1;
    lines.push(`- [ ] ${change.index}.${n++} Find the component that renders ${where} on ${codeSpan(spec.page.path)}`);
    for (const step of change.steps) lines.push(`- [ ] ${change.index}.${n++} ${inline(step.description).replace(/:$/, '')} (see the implementation notes)`);
    if (change.tokensUsed.length) lines.push(`- [ ] ${change.index}.${n++} Use the design tokens ${change.tokensUsed.map((t) => codeSpan(t.cssVar)).join(', ')} instead of raw values`);
    lines.push(`- [ ] ${change.index}.${n} Verify: ${change.scenario.then}`, '');
  }
  return lines;
}

export function notesFor(change: SpecChange): string[] {
  return [
    `### ${change.index}. ${change.requirement}`,
    '',
    `Requested: "${quoted(change.prompt)}"`,
    '',
    ...(change.targets.length ? [`Elements: ${change.targets.map((t) => `${codeSpan(t.selector)} (${plainText(t.tag)})`).join(', ')}`, ''] : []),
    ...stepLines(change.steps),
    ...(change.tokensUsed.length ? ['', 'Design tokens used:', '', ...tokenTable(change.tokensUsed)] : []),
    ...(change.warnings.length ? ['', ...change.warnings.map((w) => `> Note from the preview: ${inline(w)}`)] : []),
    '',
  ];
}

export function whyParagraph(spec: ChangeSpec): string {
  const count = spec.changes.length;
  return `${count === 1 ? 'This change was' : `These ${count} changes were`} prototyped live on ${spec.page.title ? `"${quoted(spec.page.title)}" ` : ''}(${codeSpan(spec.page.url)}) with Hot Edit Web and approved in the preview. This spec records what was asked and exactly what changed, so it can be implemented in the codebase.`;
}

/** A single readable spec: why, what, design tokens, requirements, implementation notes and tasks. */
export function renderMarkdown(spec: ChangeSpec): string {
  const lines = [
    `# ${spec.title}`,
    '',
    `> Exported from Hot Edit Web on ${spec.exportedAt.slice(0, 10)} · Page: ${codeSpan(spec.page.url)}${spec.designSystem ? ` · Design system: ${inline(spec.designSystem)}` : ''}`,
    '',
    '## Why',
    '',
    whyParagraph(spec),
    '',
    '## What Changes',
    '',
    ...spec.changes.map((c) => `- ${inline(c.summary)}`),
    '',
  ];
  if (spec.tokensUsed.length) lines.push('## Design tokens', '', ...tokenTable(spec.tokensUsed), '');
  lines.push('## Requirements', '');
  for (const change of spec.changes) lines.push(...requirementBlock(change), '');
  lines.push('## Implementation notes', '', ...spec.changes.flatMap(notesFor));
  lines.push('## Tasks', '', ...taskLines(spec));
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}
