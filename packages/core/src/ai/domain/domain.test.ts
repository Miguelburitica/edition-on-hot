import { describe, expect, it } from 'vitest';
import { EditContext } from './edit-context';
import { PatchProposal } from './patch-proposal';
import { ProviderSettings } from './provider-settings';

const baseContext = { ancestors: [], styles: {}, targetIds: ['t0', 't1'], pageUrl: 'http://x', pageTitle: 'X' };

describe('EditContext', () => {
  it('truncates large HTML and marks it truncated', () => {
    const ctx = EditContext.create({ ...baseContext, html: `<div>${'a'.repeat(50)}</div>` }, 20);
    expect(ctx.props.html).toHaveLength(20);
    expect(ctx.truncated).toBe(true);
  });

  it('keeps small HTML intact', () => {
    const ctx = EditContext.create({ ...baseContext, html: '<p>hi</p>' });
    expect(ctx.truncated).toBe(false);
    expect(ctx.props.html).toBe('<p>hi</p>');
  });

  it('removes input value attributes', () => {
    const ctx = EditContext.create({ ...baseContext, html: `<input name="e" value="me@x.com"><input value='y' type="text">` });
    expect(ctx.props.html).toBe('<input name="e"><input type="text">');
  });
});

describe('PatchProposal', () => {
  const ctx = EditContext.create({ ...baseContext, html: '<form></form>' });

  it('accepts ops that target known ids', () => {
    const result = PatchProposal.fromDraft({ summary: 'ok', ops: [{ type: 'remove', target: 't1' }, { type: 'addCss', css: 'a{}' }] }, ctx);
    expect(result.ok).toBe(true);
  });

  it('rejects unknown targets and empty op lists', () => {
    const unknown = PatchProposal.fromDraft({ summary: 'x', ops: [{ type: 'remove', target: 't9' }] }, ctx);
    expect(!unknown.ok && unknown.error.issues[0]).toContain('t9');
    expect(PatchProposal.fromDraft({ summary: 'x', ops: [] }, ctx).ok).toBe(false);
  });
});

describe('ProviderSettings', () => {
  it('defaults to Opus 5.5 with no key', () => {
    const settings = ProviderSettings.empty();
    expect(settings.model).toBe('claude-opus-5-5');
    expect(settings.toConfig().ok).toBe(false);
  });

  it('masks the key', () => {
    const result = ProviderSettings.create({ apiKey: ' sk-ant-api03-abcdefghijk1234 ', model: 'claude-sonnet-5-5' });
    expect(result.ok && result.value.maskedKey).toBe('sk-ant-…1234');
    expect(result.ok && result.value.apiKey).toBe('sk-ant-api03-abcdefghijk1234');
  });

  it('rejects unknown models and malformed keys', () => {
    expect(ProviderSettings.create({ apiKey: 'k', model: 'gpt-x' }).ok).toBe(false);
    expect(ProviderSettings.create({ apiKey: 'a b', model: 'claude-opus-5-5' }).ok).toBe(false);
  });
});
