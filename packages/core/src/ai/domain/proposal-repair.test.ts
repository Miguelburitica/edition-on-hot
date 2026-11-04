import { describe, expect, it } from 'vitest';
import { EditContext } from './edit-context';
import { PatchProposal, type ProposalDraft } from './patch-proposal';
import { extractJson, repairDraft } from './proposal-repair';

const draft = { summary: 's', ops: [{ type: 'remove', target: 't0' }] };

describe('repairDraft', () => {
  it('extracts JSON from a fenced code block', () => {
    const result = repairDraft({ unparsedText: 'Here you go:\n```json\n' + JSON.stringify(draft) + '\n```' });
    expect(result.value).toEqual(draft);
    expect(result.repairs).toEqual(['extracted-json']);
  });

  it('extracts JSON surrounded by prose and from a raw string', () => {
    expect(repairDraft({ unparsedText: `Sure! ${JSON.stringify(draft)} Done.` }).value).toEqual(draft);
    expect(repairDraft(JSON.stringify(draft)).value).toEqual(draft);
  });

  it('leaves non-JSON text alone and reports no repairs', () => {
    const raw = { unparsedText: 'I cannot do that.' };
    expect(repairDraft(raw)).toEqual({ value: raw, repairs: [] });
  });

  it('wraps a bare op, an op list and a single ops object', () => {
    expect(repairDraft({ type: 'remove', target: 't0' }).value).toMatchObject({ ops: [{ type: 'remove' }] });
    expect(repairDraft([{ type: 'remove', target: 't0' }]).value).toMatchObject({ ops: [{ type: 'remove' }] });
    expect(repairDraft({ summary: 's', ops: { type: 'remove', target: 't0' } }).value).toMatchObject({ ops: [{ type: 'remove' }] });
    expect(repairDraft({ summary: 's', op: { type: 'remove', target: 't0' } }).value).toMatchObject({ ops: [{ type: 'remove' }] });
  });

  it('adds a missing summary', () => {
    const result = repairDraft({ ops: [{ type: 'remove', target: 't0' }] });
    expect(result.value).toMatchObject({ summary: 'Applied change' });
    expect(result.repairs).toContain('added-summary');
  });

  it('normalizes bare target numbers and position aliases', () => {
    const result = repairDraft({ summary: 's', ops: [{ type: 'insert', target: '2', position: 'above', html: '<p/>' }] });
    expect(result.value).toMatchObject({ ops: [{ target: 't2', position: 'before' }] });
    expect(result.repairs).toEqual(expect.arrayContaining(['normalized-target', 'normalized-position']));
  });

  it.each([
    [3, 't3'],
    ['#t4', 't4'],
    ['[data-hew-target="t5"]', 't5'],
    ['T6', 't6'],
  ])('normalizes target %j to %s', (target, expected) => {
    expect(repairDraft({ summary: 's', ops: [{ type: 'remove', target }] }).value).toMatchObject({ ops: [{ target: expected }] });
  });

  it('normalizes type aliases and camelCase CSS properties in both style formats', () => {
    const result = repairDraft({
      summary: 's',
      ops: [
        { type: 'style', target: 't0', styles: { backgroundColor: 'red', '--brandColor': 'x' } },
        { type: 'set_style', target: 't0', styles: [{ property: 'fontSize', value: '12px' }] },
        { type: 'insertHTML', target: 't0', position: 'append', html: '<b/>' },
      ],
    });
    expect(result.value).toMatchObject({
      ops: [
        { type: 'setStyle', styles: { 'background-color': 'red', '--brandColor': 'x' } },
        { type: 'setStyle', styles: [{ property: 'font-size' }] },
        { type: 'insert' },
      ],
    });
    expect(result.repairs).toEqual(expect.arrayContaining(['normalized-type', 'kebab-case-styles']));
  });

  it('never adds ops or targets', () => {
    const input = { summary: 's', ops: [{ type: 'remove' }, { type: 'setText', target: 'header', text: 'x' }] };
    const result = repairDraft(input);
    const ops = (result.value as { ops: unknown[] }).ops;
    expect(ops).toHaveLength(2);
    expect(ops[0]).not.toHaveProperty('target');
    expect(ops[1]).toMatchObject({ target: 'header' });
  });

  it('does not make an unknown repaired target acceptable', () => {
    const ctx = EditContext.create({ html: '<p data-hew-target="t0"></p>', ancestors: [], styles: {}, targetIds: ['t0'], pageUrl: '', pageTitle: '' });
    const repaired = repairDraft({ summary: 's', ops: [{ type: 'remove', target: '7' }] }).value as ProposalDraft;
    const result = PatchProposal.fromDraft(repaired, ctx);
    expect(!result.ok && result.error.issues[0]).toContain('"t7"');
  });

  it('reports nothing for already-valid drafts', () => {
    expect(repairDraft(draft).repairs).toEqual([]);
  });
});

describe('extractJson', () => {
  it('returns undefined when there is no JSON', () => {
    expect(extractJson('nope {')).toBeUndefined();
  });
});
