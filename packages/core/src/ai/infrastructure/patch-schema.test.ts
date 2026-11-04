import { describe, expect, it } from 'vitest';
import { parseProposalDraft, strictApplyPatchJsonSchema } from './patch-schema';

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

  it('reports readable issues', () => {
    const result = parseProposalDraft({ summary: 's', ops: [{ type: 'remove', target: '2' }] });
    expect(!result.ok && result.error.issues[0]).toMatch(/^ops\.0\.target: must be a data-hew-target id/);
  });
});
