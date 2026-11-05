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
- addCss: add CSS rules. They apply to the selected element (t0), everything inside it, and every element you insert. Use them for repeated items, e.g. "li { … }" or "li:nth-child(odd) { … }", instead of styling items one by one. Select with the page's own tags and classes, and write :scope for t0 itself (e.g. ":scope > li"); target ids and data-hew-target exist only in the HTML you were given, not on the page`;

const RULES = `Rules:
- Apply the request completely, to every element it concerns. Bold, clearly visible changes are welcome when the request asks for them.
- When the request is about a group of similar elements, change all of them, usually with one addCss rule.
- When the request implies a different layout or structure, restructure: use replace on t0 or on the containers involved.
- When the request is about space or size, use the ancestors' layout: e.g. grid-column: 1 / -1 on t0 to span every column of a grid parent, flex: 1 inside a flex row, width: 100% on the elements that should grow.
- Only target ids that appear in the provided HTML, written exactly like "t0".
- Never write JavaScript: no <script>, no on* attributes, no javascript: URLs.
- data-hew-* attributes belong to the extension: never set them or add them to new markup.
- Match the page's existing look unless asked otherwise: reuse its classes, colors, fonts and spacing. Page styles may win over yours; add !important when a change must override them.
- When a design system is given, build with it: write token values as var(--token) (e.g. color: var(--color-primary)) instead of raw values, and reuse its component classes for buttons, inputs, cards and the like.`;

const PROMPTED_EXAMPLE = `{"summary":"Adds a banner and alternates row colors","ops":[{"type":"insert","target":"t0","position":"before","html":"<div class=\\"notice\\">Heads up</div>"},{"type":"addCss","css":"li:nth-child(odd) { background: #f3f4f6; } .notice { padding: 8px; }"},{"type":"setStyle","target":"t0","styles":[{"property":"margin-top","value":"8px"}]}]}`;

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

You receive the HTML of the element the user selected. Every element in it that you may target carries a data-hew-target attribute ("t0" is the selected element itself). You also receive its ancestors (grid and flex containers with their layout), its key computed styles and the user's request.

${answerFormat(mode)}

${OPERATIONS(styles)}

${RULES}`;
}

/** Phase 1 prompt, kept for the Anthropic adapter. */
export const SYSTEM_PROMPT = buildSystemPrompt('tool', 'record');

export function buildUserMessage(context: EditContext, prompt: string, previousIssues?: readonly string[]): string {
  const { html, ancestors, styles, pageUrl, pageTitle, designSystem } = context.props;
  const parts = [
    `Page: ${pageTitle} (${pageUrl})`,
    ...(designSystem ? [`Design system (use these tokens and component classes):\n${designSystem}`] : []),
    `Ancestors (nearest first, with the layout of grid and flex containers): ${ancestors.length ? ancestors.join(' < ') : '(none)'}`,
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
