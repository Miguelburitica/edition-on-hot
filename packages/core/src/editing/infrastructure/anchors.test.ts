// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { buildAnchor, uniqueSelector } from './anchor-builder';
import { DomAnchorResolver, similarity } from './dom-anchor-resolver';

beforeEach(() => {
  document.body.innerHTML = `
    <main>
      <section><label>Other</label><p>Intro</p><button>Save</button><button>Cancel</button></section>
      <form id="signup"><label>Email</label><input name="email"></form>
      <ul><li data-testid="row">One</li><li>Two</li></ul>
    </main>`;
});

describe('uniqueSelector', () => {
  it('prefers a unique id', () => {
    expect(uniqueSelector(document.querySelector('form')!)).toBe('#signup');
  });

  it('uses nth-of-type and data-testid when needed', () => {
    const cancel = document.querySelectorAll('button')[1]!;
    expect(document.querySelector(uniqueSelector(cancel))).toBe(cancel);
    expect(uniqueSelector(document.querySelector('li')!)).toContain('[data-testid="row"]');
  });

  it('anchors inside an id-ed ancestor', () => {
    const label = document.querySelector('#signup label')!;
    expect(uniqueSelector(label)).toBe('#signup > label');
  });
});

describe('DomAnchorResolver', () => {
  const resolver = () => new DomAnchorResolver(document);

  it('resolves an unchanged page to the original element', () => {
    const cancel = document.querySelectorAll('button')[1]!;
    expect(resolver().resolve(buildAnchor(cancel))).toBe(cancel);
  });

  it('still resolves after a sibling is inserted before the element', () => {
    const cancel = document.querySelectorAll('button')[1]!;
    const anchor = buildAnchor(cancel);
    cancel.before(document.createElement('button'));
    expect(resolver().resolve(anchor)).toBe(cancel);
  });

  it('reports not found when the element was removed', () => {
    const cancel = document.querySelectorAll('button')[1]!;
    const anchor = buildAnchor(cancel);
    cancel.remove();
    expect(resolver().resolve(anchor)).toBeNull();
  });

  it('ignores the extension overlay', () => {
    const overlay = document.createElement('div');
    overlay.setAttribute('data-hew-overlay', '');
    overlay.innerHTML = '<button>Cancel</button>';
    const cancel = document.querySelectorAll('button')[1]!;
    const anchor = buildAnchor(cancel);
    cancel.remove();
    document.body.prepend(overlay);
    expect(resolver().resolve(anchor)).toBeNull();
  });
});

describe('similarity', () => {
  it('scores identical strings 1 and unrelated strings low', () => {
    expect(similarity('Sign up now', 'Sign up now')).toBe(1);
    expect(similarity('Sign up now', 'Delete account')).toBeLessThan(0.3);
  });
});
