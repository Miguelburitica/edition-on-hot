import { describe, expect, it } from 'vitest';
import { parseProposalDraft, strictApplyPatchJsonSchema } from './patch-schema';
import { EditContext } from '../domain';
import { buildSystemPrompt, buildUserMessage } from './prompt-builder';

/** Walks every node of a JSON schema. */
function* nodes(schema: unknown): Generator<Record<string, unknown>> {
  if (typeof schema !== 'object' || schema === null) return;
  if (Array.isArray(schema)) {
    for (const item of schema) yield* nodes(item);
    return;
  }
  const node = schema as Record<string, unknown>;
  yield node;
  for (const value of Object.values(node)) yield* nodes(value);
}

describe('strict OpenRouter schema', () => {
  const schema = strictApplyPatchJsonSchema();

  it('avoids features strict modes commonly reject', () => {
    const json = JSON.stringify(schema);
    for (const keyword of ['"$ref"', '"oneOf"', '"pattern"', '"format"', '"$schema"']) expect(json).not.toContain(keyword);
  });

  it('closes every object and requires all of its keys', () => {
    for (const node of nodes(schema)) {
      if (node.type !== 'object') continue;
      expect(node.additionalProperties).toBe(false);
      expect([...(node.required as string[])].sort()).toEqual(Object.keys(node.properties as object).sort());
    }
  });

  it('describes all seven op types', () => {
    const ops = (schema.properties as { ops: { items: { anyOf: { properties: { type: { enum: string[] } } }[] } } }).ops;
    expect(ops.items.anyOf.map((o) => o.properties.type.enum[0])).toEqual([
      'insert',
      'replace',
      'setStyle',
      'setAttr',
      'setText',
      'remove',
      'addCss',
    ]);
  });
});

describe('parseProposalDraft', () => {
  it('round-trips every op type and maps style pairs back to a record', () => {
    const ops = [
      { type: 'insert', target: 't0', position: 'before', html: '<p>a</p>' },
      { type: 'replace', target: 't1', html: '<p>b</p>' },
      { type: 'setStyle', target: 't0', styles: [{ property: 'color', value: 'red' }] },
      { type: 'setStyle', target: 't0', styles: { padding: '4px' } },
      { type: 'setAttr', target: 't0', name: 'disabled', value: null },
      { type: 'setText', target: 't0', text: 'Hi' },
      { type: 'remove', target: 't2' },
      { type: 'addCss', css: '.a{}' },
    ];
    const result = parseProposalDraft({ summary: 's', ops });
    expect(result.ok && result.value.ops).toEqual([
      ops[0],
      ops[1],
      { type: 'setStyle', target: 't0', styles: { color: 'red' } },
      ops[3],
      ops[4],
      ops[5],
      ops[6],
      ops[7],
    ]);
  });

  it('accepts up to 60 operations', () => {
    const ops = (n: number) => Array.from({ length: n }, () => ({ type: 'remove', target: 't0' }));
    expect(parseProposalDraft({ summary: 's', ops: ops(45) }).ok).toBe(true);
    expect(parseProposalDraft({ summary: 's', ops: ops(60) }).ok).toBe(true);
    expect(parseProposalDraft({ summary: 's', ops: ops(61) }).ok).toBe(false);
  });

  it('reports readable issues', () => {
    const result = parseProposalDraft({ summary: 's', ops: [{ type: 'remove', target: '2' }] });
    expect(!result.ok && result.error.issues[0]).toMatch(/^ops\.0\.target: must be a data-hew-target id/);
  });
});

describe('system prompt', () => {
  it.each(['tool', 'json_schema', 'prompted'] as const)('%s mode asks for complete, selection-scoped changes', (mode) => {
    const prompt = buildSystemPrompt(mode, 'pairs');
    expect(prompt).toContain('They apply to the selected element (t0), everything inside it');
    expect(prompt).toContain('Apply the request completely, to every element it concerns');
    expect(prompt).toContain('never set them');
    expect(prompt).not.toContain('smallest set');
  });

  it('tells the model to use the ancestors\' layout for space and size requests', () => {
    expect(buildSystemPrompt('json_schema', 'pairs')).toContain('grid-column: 1 / -1 on t0 to span every column of a grid parent');
    const context = EditContext.create({
      html: '<section data-hew-target="t0"></section>',
      ancestors: ['main (display: grid; grid-template-columns: 1fr 1fr)'],
      styles: {},
      targetIds: ['t0'],
      pageUrl: '',
      pageTitle: '',
    });
    expect(buildUserMessage(context, 'fill the space')).toContain(
      'Ancestors (nearest first, with the layout of grid and flex containers): main (display: grid; grid-template-columns: 1fr 1fr)',
    );
  });
});
