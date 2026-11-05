import { codeSpan, type ChangeSpec, type ChangeSpecRenderer, type RenderedFile } from '../domain';
import { inline, notesFor, renderMarkdown, requirementBlock, taskLines, tokenTable, whyParagraph } from './markdown';
import { zip } from './zip-writer';

const finish = (lines: readonly string[]) => `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;

export class MarkdownSpecRenderer implements ChangeSpecRenderer {
  render(spec: ChangeSpec): RenderedFile {
    return { fileName: `${spec.changeName}.md`, mimeType: 'text/markdown', content: renderMarkdown(spec) };
  }
}

/** The files of an OpenSpec change, keyed by their path inside the change directory. */
export function openSpecFiles(spec: ChangeSpec): Record<string, string> {
  const proposal = finish([
    '## Why',
    '',
    whyParagraph(spec),
    '',
    '## What Changes',
    '',
    ...spec.changes.map((c) => `- ${inline(c.summary)}`),
    '',
    '## Capabilities',
    '',
    '### New Capabilities',
    `- \`${spec.capability}\`: UI behaviour of ${spec.page.host || 'the page'}${spec.page.path !== '/' ? spec.page.path : ''} prototyped in Hot Edit Web`,
    '',
    '### Modified Capabilities',
    '',
    '## Impact',
    '',
    `- Page: ${codeSpan(spec.page.url)}`,
    `- Elements: ${[...new Set(spec.changes.flatMap((c) => c.targets.map((t) => codeSpan(t.selector))))].join(', ') || 'see the design'}`,
    ...(spec.designSystem ? [`- Design system: ${inline(spec.designSystem)}`] : []),
  ]);
  const design = finish([
    '## Context',
    '',
    `The changes below were made on the live page with Hot Edit Web. Selectors are CSS paths from the rendered DOM: map them to the components that render them. Inserted markup and CSS are what the preview applied; adapt them to the codebase's components and styling conventions.${
      spec.tokensUsed.length ? ' Use the design tokens listed rather than raw values.' : ''
    }`,
    '',
    '## Goals / Non-Goals',
    '',
    '**Goals:** implement the approved changes faithfully.',
    '**Non-Goals:** redesigning anything beyond them.',
    '',
    '## Decisions',
    '',
    ...spec.changes.flatMap(notesFor),
    ...(spec.tokensUsed.length ? ['## Design tokens', '', ...tokenTable(spec.tokensUsed), ''] : []),
    '## Risks / Trade-offs',
    '',
    '- The page may render differently in states the preview did not show (empty, loading, error, other viewports); check them.',
  ]);
  const specDelta = finish(['## ADDED Requirements', '', ...spec.changes.flatMap((c) => [...requirementBlock(c), ''])]);
  return {
    'proposal.md': proposal,
    'design.md': design,
    'tasks.md': finish(taskLines(spec)),
    [`specs/${spec.capability}/spec.md`]: specDelta,
  };
}

/** An OpenSpec change as a .zip whose top folder is the change name, ready for `openspec/changes/`. */
export class OpenSpecChangeRenderer implements ChangeSpecRenderer {
  render(spec: ChangeSpec): RenderedFile {
    const files = Object.entries(openSpecFiles(spec)).map(([path, content]) => ({ path: `${spec.changeName}/${path}`, content }));
    return { fileName: `${spec.changeName}.zip`, mimeType: 'application/zip', content: zip(files) };
  }
}

export class JsonSpecRenderer implements ChangeSpecRenderer {
  render(spec: ChangeSpec): RenderedFile {
    const body = {
      format: 'hew-change-spec',
      version: 1,
      title: spec.title,
      changeName: spec.changeName,
      capability: spec.capability,
      exportedAt: spec.exportedAt,
      page: spec.page,
      designSystem: spec.designSystem,
      tokensUsed: spec.tokensUsed,
      changes: spec.changes,
    };
    return { fileName: `${spec.changeName}.json`, mimeType: 'application/json', content: `${JSON.stringify(body, null, 2)}\n` };
  }
}
