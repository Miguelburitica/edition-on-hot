// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { EditSession, type PatchOp } from '../domain';
import { prompt } from '../../../test/fakes';
import { buildAnchor } from './anchor-builder';
import { DomAnchorResolver } from './dom-anchor-resolver';
import { DomPageGateway } from './dom-page-gateway';
import { HtmlSanitizer } from './html-sanitizer';

const FIXTURE = `
  <div class="banner">Existing banner</div>
  <main id="app">
    <form id="signup" class="card"><h2>Join</h2><p>Hello <b>you</b></p><button id="go">Go</button></form>
  </main>`;

let gateway: DomPageGateway;
beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = FIXTURE;
  gateway = new DomPageGateway(document, new DomAnchorResolver(document), new HtmlSanitizer(window));
});

const $ = (s: string) => document.querySelector(s)!;
const anchorOf = (s: string) => buildAnchor($(s));

function applyAndRevert(op: PatchOp) {
  const before = document.body.innerHTML;
  const applied = gateway.apply(op, 'cs1');
  if (!applied.ok) throw applied.error;
  const during = document.body.innerHTML;
  gateway.revert(applied.value);
  return { before, during, after: document.body.innerHTML };
}

describe('DomPageGateway', () => {
  it('inserts a banner before a form and marks it with the changeset', () => {
    const result = gateway.apply(
      { type: 'insert', target: anchorOf('#signup'), position: 'before', html: '<div class="alert">Heads up</div>' },
      'cs1',
    );
    expect(result.ok).toBe(true);
    const inserted = $('#signup').previousElementSibling!;
    expect(inserted.textContent).toBe('Heads up');
    expect(inserted.getAttribute('data-hew-cs')).toBe('cs1');
  });

  it('sets an inline style', () => {
    gateway.apply({ type: 'setStyle', target: anchorOf('#go'), styles: { 'background-color': 'red' } }, 'cs1');
    expect(($('#go') as HTMLElement).style.backgroundColor).toBe('red');
  });

  it.each<[string, () => PatchOp]>([
    ['insert before', () => ({ type: 'insert', target: anchorOf('#signup'), position: 'before', html: '<p>x</p>' })],
    ['insert after', () => ({ type: 'insert', target: anchorOf('#signup'), position: 'after', html: '<p>x</p>' })],
    ['insert prepend', () => ({ type: 'insert', target: anchorOf('#signup'), position: 'prepend', html: '<p>x</p>' })],
    ['insert append', () => ({ type: 'insert', target: anchorOf('#signup'), position: 'append', html: 'text <i>y</i>' })],
    ['replace', () => ({ type: 'replace', target: anchorOf('#go'), html: '<a href="/x">Go now</a>' })],
    ['setStyle', () => ({ type: 'setStyle', target: anchorOf('#go'), styles: { color: 'blue', padding: '4px !important' } })],
    ['setAttr', () => ({ type: 'setAttr', target: anchorOf('#go'), name: 'aria-label', value: 'Submit' })],
    ['remove attr', () => ({ type: 'setAttr', target: anchorOf('#signup'), name: 'class', value: null })],
    ['setText', () => ({ type: 'setText', target: anchorOf('#signup p'), text: 'Bye' })],
    ['remove', () => ({ type: 'remove', target: anchorOf('#signup h2') })],
  ])('%s: apply changes the DOM and revert restores it exactly', (_name, makeOp) => {
    const { before, during, after } = applyAndRevert(makeOp());
    expect(during).not.toBe(before);
    expect(after).toBe(before);
  });

  it('addCss is reverted by removing its stylesheet', () => {
    const applied = gateway.apply({ type: 'addCss', css: '.alert{color:red}' }, 'cs1');
    expect(document.head.querySelectorAll('style')).toHaveLength(1);
    if (applied.ok) gateway.revert(applied.value);
    expect(document.head.innerHTML).toBe('');
  });

  it('strips scripts and event handlers from inserted HTML', () => {
    gateway.apply(
      {
        type: 'insert',
        target: anchorOf('#signup'),
        position: 'append',
        html: '<button onclick="steal()">Hi</button><script>steal()</script><a href="javascript:steal()">x</a>',
      },
      'cs1',
    );
    const html = $('#signup').innerHTML;
    expect(html).not.toContain('script');
    expect(html).not.toContain('onclick');
    expect(html).not.toContain('javascript:');
  });

  it('fails when the HTML is empty after sanitizing', () => {
    const result = gateway.apply({ type: 'insert', target: anchorOf('#signup'), position: 'after', html: '<script>x()</script>' }, 'cs1');
    expect(!result.ok && result.error.code).toBe('patch-apply-failed');
  });

  it('scoped rules do not leak to unrelated page elements', () => {
    gateway.apply(
      { type: 'insert', target: anchorOf('#signup'), position: 'before', html: '<div class="banner">New</div>' },
      'cs1',
    );
    gateway.apply({ type: 'addCss', css: '.banner { color: rgb(255, 0, 0); }' }, 'cs1');
    const [existing, inserted] = Array.from(document.querySelectorAll('.banner'));
    expect(getComputedStyle(inserted!).color).toBe('rgb(255, 0, 0)');
    expect(getComputedStyle(existing!).color).not.toBe('rgb(255, 0, 0)');
  });

  it('rolls back the whole changeset when one target is missing', () => {
    const before = document.body.innerHTML;
    const missing = anchorOf('#go');
    const session = EditSession.start('tab');
    $('#go').remove();
    const snapshotWithoutGo = document.body.innerHTML;
    const result = session.apply(
      {
        id: 'cs1',
        prompt: prompt('x'),
        summary: 's',
        ops: [
          { type: 'insert', target: anchorOf('#signup'), position: 'before', html: '<p>banner</p>' },
          { type: 'setText', target: missing, text: 'Go!' },
        ],
        now: new Date(),
      },
      gateway,
    );
    expect(!result.ok && result.error.code).toBe('anchor-not-found');
    expect(!result.ok && result.error.message).toContain('#go');
    expect(document.body.innerHTML).toBe(snapshotWithoutGo);
    expect(before).not.toBe(snapshotWithoutGo);
  });

  it('reverting a mixed changeset restores the subtree HTML', () => {
    const session = EditSession.start('tab');
    const before = $('#app').innerHTML;
    session.apply(
      {
        id: 'cs1',
        prompt: prompt('x'),
        summary: 's',
        ops: [
          { type: 'insert', target: anchorOf('#signup'), position: 'prepend', html: '<div>New</div>' },
          { type: 'setStyle', target: anchorOf('#go'), styles: { color: 'red' } },
          { type: 'setText', target: anchorOf('#signup h2'), text: 'Join us' },
        ],
        now: new Date(),
      },
      gateway,
    );
    expect($('#app').innerHTML).not.toBe(before);
    session.undo(gateway, new Date());
    expect($('#app').innerHTML).toBe(before);
  });

  it('keeps finding the selection after earlier ops in the same changeset changed its text', () => {
    const session = EditSession.start('tab');
    const form = anchorOf('#signup');
    const result = session.apply(
      {
        id: 'cs1',
        prompt: prompt('x'),
        summary: 's',
        ops: [
          { type: 'insert', target: form, position: 'prepend', html: '<p class="intro">Brand new intro text</p>' },
          { type: 'setText', target: anchorOf('#signup h2'), text: 'Completely different heading' },
          { type: 'setStyle', target: form, styles: { padding: '24px' } },
          { type: 'addCss', css: '.intro { color: rgb(1, 2, 3); }', scope: form },
        ],
        now: new Date(),
      },
      gateway,
    );
    expect(result.ok).toBe(true);
    expect(($('#signup') as HTMLElement).style.padding).toBe('24px');
  });

  it('resolves anchors in a new changeset while earlier inserted content is still on the page', () => {
    const form = anchorOf('#signup');
    gateway.apply({ type: 'insert', target: form, position: 'append', html: '<p>Inserted by cs1</p>' }, 'cs1');
    expect(gateway.apply({ type: 'setStyle', target: form, styles: { color: 'red' } }, 'cs2').ok).toBe(true);
  });

  describe('selection-scoped stylesheets', () => {
    beforeEach(() => {
      document.body.innerHTML = `
        <ul id="mine"><li>One</li><li>Two</li><li>Three</li></ul>
        <ul id="other"><li>Elsewhere</li></ul>`;
    });

    const color = (s: string) => getComputedStyle($(s)).color;

    it('styles every item in the selection and nothing outside it', () => {
      const applied = gateway.apply({ type: 'addCss', css: 'li:nth-child(odd) { color: rgb(255, 0, 0); }', scope: anchorOf('#mine') }, 'cs1');
      expect(applied.ok).toBe(true);
      expect(color('#mine li:nth-child(1)')).toBe('rgb(255, 0, 0)');
      expect(color('#mine li:nth-child(3)')).toBe('rgb(255, 0, 0)');
      expect(color('#mine li:nth-child(2)')).not.toBe('rgb(255, 0, 0)');
      expect(color('#other li')).not.toBe('rgb(255, 0, 0)');
    });

    it('matches selectors that name the selection itself by tag', () => {
      document.body.innerHTML = `
        <ul id="mine" class="list"><li>One</li><li>Two</li></ul>
        <ul id="other" class="list"><li>Elsewhere</li></ul>`;
      gateway.apply({ type: 'addCss', css: 'ul.list li { color: rgb(255, 0, 0); } ul > li:nth-child(even) { color: rgb(0, 0, 255); }', scope: anchorOf('#mine') }, 'cs1');
      expect(color('#mine li:nth-child(1)')).toBe('rgb(255, 0, 0)');
      expect(color('#mine li:nth-child(2)')).toBe('rgb(0, 0, 255)');
      expect(color('#other li')).not.toBe('rgb(255, 0, 0)');
    });

    it('maps :scope to the selection', () => {
      gateway.apply({ type: 'addCss', css: 'ul:scope > li { color: rgb(255, 0, 0); }', scope: anchorOf('#mine') }, 'cs1');
      expect(color('#mine li')).toBe('rgb(255, 0, 0)');
      expect(color('#other li')).not.toBe('rgb(255, 0, 0)');
    });

    it('styles inserted elements outside the selection', () => {
      gateway.apply({ type: 'insert', target: anchorOf('#mine'), position: 'before', html: '<p class="note">Hi</p>' }, 'cs1');
      gateway.apply({ type: 'addCss', css: '.note { color: rgb(0, 128, 0); }', scope: anchorOf('#mine') }, 'cs1');
      expect(color('.note')).toBe('rgb(0, 128, 0)');
    });

    it('undo restores the selection HTML exactly, also with several changesets scoping it', () => {
      const before = document.body.innerHTML;
      const first = gateway.apply({ type: 'addCss', css: 'li{color:red}', scope: anchorOf('#mine') }, 'cs1');
      const second = gateway.apply({ type: 'addCss', css: 'li{color:blue}', scope: anchorOf('#mine') }, 'cs2');
      expect($('#mine').getAttribute('data-hew-scope')).toBe('cs1 cs2');
      if (!first.ok || !second.ok) throw new Error('apply failed');
      gateway.revert(second.value);
      expect($('#mine').getAttribute('data-hew-scope')).toBe('cs1');
      gateway.revert(first.value);
      expect(document.body.innerHTML).toBe(before);
      expect(document.head.innerHTML).toBe('');
    });

    it('fails like any targeted op when the scope is gone', () => {
      const scope = anchorOf('#mine');
      $('#mine').remove();
      expect(gateway.apply({ type: 'addCss', css: 'li{color:red}', scope }, 'cs1')).toMatchObject({ ok: false, error: { code: 'anchor-not-found' } });
    });
  });

  describe('visibility warnings', () => {
    const warningsOf = (ops: PatchOp[]) => {
      const session = EditSession.start('tab');
      const result = session.apply({ id: 'cs1', prompt: prompt('x'), summary: 's', ops, now: new Date() }, gateway);
      if (!result.ok) throw result.error;
      return result.value.warnings.map((w) => [w.opIndex, w.warning.kind]);
    };

    it('flags a rule that matches nothing, and not one matching a later insert', () => {
      expect(warningsOf([{ type: 'addCss', css: '.missing { color: red }', scope: anchorOf('#signup') }])).toEqual([[0, 'no-match']]);
      document.body.innerHTML = FIXTURE;
      expect(
        warningsOf([
          { type: 'addCss', css: '.late { color: red }', scope: anchorOf('#signup') },
          { type: 'insert', target: anchorOf('#signup'), position: 'append', html: '<p class="late">x</p>' },
        ]),
      ).toEqual([]);
    });

    it('treats interaction states and pseudo-elements by their element', () => {
      expect(warningsOf([{ type: 'addCss', css: 'button:hover::after { content: "!" }', scope: anchorOf('#signup') }])).toEqual([]);
    });

    it('flags a style change on a hidden target and an insert into a hidden container', () => {
      ($('#signup p') as HTMLElement).style.display = 'none';
      expect(warningsOf([{ type: 'setStyle', target: anchorOf('#signup p'), styles: { color: 'red' } }])).toEqual([[0, 'hidden-target']]);
      document.body.innerHTML = FIXTURE;
      $('#signup').setAttribute('hidden', '');
      expect(warningsOf([{ type: 'insert', target: anchorOf('#go'), position: 'after', html: '<b>x</b>' }])).toEqual([[0, 'hidden-target']]);
    });

    it('does not flag intentional hiding or removal', () => {
      expect(
        warningsOf([
          { type: 'setStyle', target: anchorOf('#go'), styles: { display: 'none' } },
          { type: 'remove', target: anchorOf('#signup h2') },
        ]),
      ).toEqual([]);
    });
  });
});
