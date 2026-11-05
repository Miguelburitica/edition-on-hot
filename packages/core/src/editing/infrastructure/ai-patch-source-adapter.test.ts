// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ok } from '../../shared/domain';
import { prompt } from '../../../test/fakes';
import { Selection } from '../domain';
import { AiPatchSourceAdapter, type BudgetRequester, type PatchRequester } from './ai-patch-source-adapter';
import { buildAnchor } from './anchor-builder';
import { DomAnchorResolver } from './dom-anchor-resolver';

beforeEach(() => {
  document.body.innerHTML = '<form id="f"><input name="email"><button id="go">Go</button></form>';
});

const selectForm = () => new Selection(buildAnchor(document.querySelector('#f')!), 'form#f');
const standard: BudgetRequester = async () => ok({ maxHtmlChars: 12_000, maxTargets: 40 });
const diagnostics = { provider: 'openrouter' as const, model: 'a/b', mode: 'json_schema' as const, attempts: 1, repairs: [], latencyMs: 1 };

describe('AiPatchSourceAdapter', () => {
  it('sends the labeled selection and maps target ids back to anchors', async () => {
    const requester = vi.fn<PatchRequester>(async () =>
      ok({ summary: 'Red button', ops: [{ type: 'setStyle', target: 't2', styles: { color: 'red' } }], contextTruncated: false, diagnostics }),
    );
    const adapter = new AiPatchSourceAdapter(new DomAnchorResolver(document), requester, standard);
    const result = await adapter.propose(selectForm(), prompt('make the button red'));

    const sent = requester.mock.calls[0]![0];
    expect(sent.context.targetIds).toEqual(['t0', 't1', 't2']);
    expect(sent.context.html).toContain('data-hew-target="t2"');
    expect(result.ok && result.value.ops[0]).toMatchObject({ type: 'setStyle', target: { selector: '#go', tag: 'button' } });
  });

  it('scopes stylesheet rules to the selection', async () => {
    const requester: PatchRequester = async () =>
      ok({ summary: 's', ops: [{ type: 'addCss', css: 'button{color:red}' }], contextTruncated: false, diagnostics });
    const result = await new AiPatchSourceAdapter(new DomAnchorResolver(document), requester, standard).propose(selectForm(), prompt('x'));
    expect(result.ok && result.value.ops[0]).toMatchObject({ type: 'addCss', scope: { selector: '#f', tag: 'form' } });
  });

  it('rejects ops that target unknown ids', async () => {
    const requester: PatchRequester = async () =>
      ok({ summary: 's', ops: [{ type: 'remove', target: 't9' }], contextTruncated: false, diagnostics });
    const result = await new AiPatchSourceAdapter(new DomAnchorResolver(document), requester, standard).propose(selectForm(), prompt('x'));
    expect(!result.ok && result.error.code).toBe('invalid-patch');
  });

  it('passes AI errors through with their codes', async () => {
    const requester: PatchRequester = async () => ({ ok: false, error: { code: 'missing-api-key', message: 'Add a key' } });
    const result = await new AiPatchSourceAdapter(new DomAnchorResolver(document), requester, standard).propose(selectForm(), prompt('x'));
    expect(!result.ok && result.error.code).toBe('missing-api-key');
  });

  it('labels only as many targets as the budget allows', async () => {
    const requester = vi.fn<PatchRequester>(async () => ok({ summary: 's', ops: [{ type: 'remove', target: 't0' }], contextTruncated: false, diagnostics }));
    const compact: BudgetRequester = async () => ok({ maxHtmlChars: 6_000, maxTargets: 2 });
    await new AiPatchSourceAdapter(new DomAnchorResolver(document), requester, compact).propose(selectForm(), prompt('x'));
    expect(requester.mock.calls[0]![0].context.targetIds).toEqual(['t0', 't1']);
  });

  it('reports a budget failure without requesting a patch', async () => {
    const requester = vi.fn<PatchRequester>();
    const failing: BudgetRequester = async () => ({ ok: false, error: { code: 'extension-error', message: 'background gone' } });
    const result = await new AiPatchSourceAdapter(new DomAnchorResolver(document), requester, failing).propose(selectForm(), prompt('x'));
    expect(!result.ok && result.error.code).toBe('extension-error');
    expect(requester).not.toHaveBeenCalled();
  });

  it('fails when the selection disappeared', async () => {
    const selection = selectForm();
    document.body.innerHTML = '';
    const result = await new AiPatchSourceAdapter(new DomAnchorResolver(document), vi.fn(), standard).propose(selection, prompt('x'));
    expect(!result.ok && result.error.code).toBe('anchor-not-found');
  });
});
