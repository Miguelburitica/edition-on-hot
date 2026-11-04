import type { EditContext, OutputMode } from '../domain';
import { APPLY_PATCH_TOOL_NAME } from './patch-schema';

export type StylesFormat = 'record' | 'pairs';

const OPERATIONS = (styles: StylesFormat) => `Operations:
- insert: add HTML before/after a target or as its first (prepend) / last (append) child
- replace: replace a target with new HTML
- setStyle: set inline CSS properties on a target (kebab-case names)${
  styles === 'pairs' ? ', given as a list of {"property", "value"} pairs' : ''
}
- setAttr: set an attribute, or remove it with value null
- setText: replace a target's text content
- remove: remove a target
- addCss: add CSS rules; they only apply to elements you inserted, so use it to style new markup by class`;

const RULES = `Rules:
- Only target ids that appear in the provided HTML, written exactly like "t0".
- Never write JavaScript: no <script>, no on* attributes, no javascript: URLs. They are stripped anyway.
- Match the page's existing look: reuse its classes, colors, fonts and spacing from the provided styles and markup.
- Prefer the smallest set of operations that fulfills the request.
- Do not add data-hew-* attributes to new markup.`;

const PROMPTED_EXAMPLE = `{"summary":"Adds a warning banner above the form","ops":[{"type":"insert","target":"t0","position":"before","html":"<div class=\\"notice\\">Heads up</div>"},{"type":"setStyle","target":"t0","styles":[{"property":"margin-top","value":"8px"}]}]}`;

function answerFormat(mode: OutputMode): string {
  switch (mode) {
    case 'tool':
      return `Respond by calling the ${APPLY_PATCH_TOOL_NAME} tool exactly once with a short summary and a list of operations.`;
    case 'json_schema':
      return 'Respond with a JSON object matching the provided schema: a short summary and a list of operations.';
    case 'prompted':
      return `Respond with only a JSON object, no prose and no code fences, shaped like this example:\n${PROMPTED_EXAMPLE}`;
  }
}

export function buildSystemPrompt(mode: OutputMode, styles: StylesFormat): string {
  return `You are the editing engine of Hot Edit Web, a browser extension that lets product owners try UI changes on a live web page.

You receive the HTML of the element the user selected. Every element in it that you may target carries a data-hew-target attribute ("t0" is the selected element itself). You also receive its ancestors, its key computed styles and the user's request.

${answerFormat(mode)}

${OPERATIONS(styles)}

${RULES}`;
}

/** Phase 1 prompt, kept for the Anthropic adapter. */
export const SYSTEM_PROMPT = buildSystemPrompt('tool', 'record');

export function buildUserMessage(context: EditContext, prompt: string, previousIssues?: readonly string[]): string {
  const { html, ancestors, styles, pageUrl, pageTitle } = context.props;
  const parts = [
    `Page: ${pageTitle} (${pageUrl})`,
    `Ancestors (nearest first): ${ancestors.length ? ancestors.join(' < ') : '(none)'}`,
    `Computed styles of t0:\n${Object.entries(styles)
      .map(([k, v]) => `  ${k}: ${v}`)
      .join('\n')}`,
    `Selected element HTML${context.truncated ? ' (truncated)' : ''}:\n${html}`,
    `Request: ${prompt}`,
  ];
  if (previousIssues?.length) {
    parts.push(
      `Your previous answer was invalid:\n${previousIssues.map((i) => `- ${i}`).join('\n')}\nAnswer again with a corrected patch.`,
    );
  }
  return parts.join('\n\n');
}
