import { describe, expect, it } from 'vitest';
import { anchor } from '../../../test/fakes';
import { ElementAnchor } from './element-anchor';
import { validatePatchOp, validatePatchOps } from './patch-op';
import { Prompt } from './prompt';

describe('Prompt', () => {
  it('rejects blank text', () => {
    const result = Prompt.create('   \n ');
    expect(!result.ok && result.error.code).toBe('empty-prompt');
  });

  it('trims text and rejects overly long text', () => {
    expect(Prompt.create('  add a banner ').ok && Prompt.create('  add a banner ')).toMatchObject({
      value: { text: 'add a banner' },
    });
    expect(Prompt.create('x'.repeat(Prompt.MAX_LENGTH + 1)).ok).toBe(false);
  });
});

describe('ElementAnchor', () => {
  it('normalizes the text fingerprint and tag', () => {
    const result = ElementAnchor.create({ selector: '#a', tag: 'BUTTON', textFingerprint: '  Sign\n  up ' });
    expect(result.ok && result.value.toJSON()).toEqual({
      selector: '#a',
      tag: 'button',
      role: undefined,
      textFingerprint: 'Sign up',
    });
  });

  it('caps the fingerprint length', () => {
    const result = ElementAnchor.create({ selector: '#a', tag: 'p', textFingerprint: 'y'.repeat(200) });
    expect(result.ok && result.value.textFingerprint).toHaveLength(ElementAnchor.FINGERPRINT_LENGTH);
  });

  it('rejects empty selectors and invalid tags', () => {
    expect(ElementAnchor.create({ selector: ' ', tag: 'div', textFingerprint: '' }).ok).toBe(false);
    expect(ElementAnchor.create({ selector: '#a', tag: '<div>', textFingerprint: '' }).ok).toBe(false);
  });
});

describe('PatchOp validation', () => {
  const target = anchor('#x');

  it('refuses event handler attributes', () => {
    const result = validatePatchOp({ type: 'setAttr', target, name: 'onClick', value: 'alert(1)' });
    expect(!result.ok && result.error.code).toBe('invalid-patch');
  });

  it('refuses javascript: URLs and reserved attributes', () => {
    expect(validatePatchOp({ type: 'setAttr', target, name: 'href', value: ' javascript:alert(1)' }).ok).toBe(false);
    expect(validatePatchOp({ type: 'setAttr', target, name: 'data-hew-cs', value: 'x' }).ok).toBe(false);
  });

  it('accepts normal attributes and removal', () => {
    expect(validatePatchOp({ type: 'setAttr', target, name: 'aria-label', value: 'Close' }).ok).toBe(true);
    expect(validatePatchOp({ type: 'setAttr', target, name: 'disabled', value: null }).ok).toBe(true);
  });

  it('refuses empty html, styles and css', () => {
    expect(validatePatchOp({ type: 'insert', target, position: 'before', html: ' ' }).ok).toBe(false);
    expect(validatePatchOp({ type: 'setStyle', target, styles: {} }).ok).toBe(false);
    expect(validatePatchOp({ type: 'setStyle', target, styles: { 'color;': 'red' } }).ok).toBe(false);
    expect(validatePatchOp({ type: 'addCss', css: '' }).ok).toBe(false);
  });

  it('accepts custom properties in styles', () => {
    expect(validatePatchOp({ type: 'setStyle', target, styles: { '--brand': '#f00', 'background-color': 'red' } }).ok).toBe(true);
  });

  it('refuses an empty op list', () => {
    expect(validatePatchOps([]).ok).toBe(false);
  });
});
