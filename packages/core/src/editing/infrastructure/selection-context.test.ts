// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { DomAnchorResolver } from './dom-anchor-resolver';
import { buildSelectionContext } from './selection-context';

describe('buildSelectionContext', () => {
  it('labels targets, excludes typed and attribute values, and lists ancestors', () => {
    document.body.innerHTML = `<main id="app"><form id="f"><input name="email" value="me@x.com"><input type="hidden" name="csrf" value="secret"><textarea>draft</textarea><button>Go</button></form></main>`;
    const input = document.querySelector('input')!;
    input.value = 'typed@x.com';

    const ctx = buildSelectionContext(document.querySelector('#f')!);

    expect(ctx.html).toContain('data-hew-target="t0"');
    expect(ctx.html).not.toContain('me@x.com');
    expect(ctx.html).not.toContain('typed@x.com');
    expect(ctx.html).not.toContain('secret');
    expect(ctx.html).not.toContain('draft');
    expect(ctx.ancestors[0]).toBe('main#app');
    expect(ctx.targets.size).toBe(5);
    expect(new DomAnchorResolver(document).resolve(ctx.targets.get('t4')!)).toBe(document.querySelector('button'));
    expect(document.querySelector('[data-hew-target]')).toBeNull();
  });

  it('drops earlier changesets\' data-hew attributes so the model never sees them', () => {
    document.body.innerHTML = '<div id="s" data-hew-scope="cs1"><p data-hew-cs="cs1" data-x="keep">hi</p></div>';
    const ctx = buildSelectionContext(document.querySelector('#s')!);
    expect(ctx.html).toBe('<div id="s" data-hew-target="t0"><p data-x="keep" data-hew-target="t1">hi</p></div>');
    expect(document.querySelector('#s')!.getAttribute('data-hew-scope')).toBe('cs1');
  });

  it('limits labeled targets to the budget, always starting with the selection', () => {
    document.body.innerHTML = '<ul id="l"><li>a</li><li>b</li><li>c</li><li>d</li></ul>';
    const ctx = buildSelectionContext(document.querySelector('#l')!, { maxTargets: 3 });
    expect([...ctx.targets.keys()]).toEqual(['t0', 't1', 't2']);
    expect(ctx.html.match(/data-hew-target/g)).toHaveLength(3);
    expect(ctx.html.startsWith('<ul id="l" data-hew-target="t0"')).toBe(true);
    expect(buildSelectionContext(document.querySelector('#l')!, { maxTargets: 0 }).targets.size).toBe(1);
  });

  it('describes grid and flex ancestors with their layout, and block ancestors by name only', () => {
    document.head.innerHTML = `<style>
      main { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
      .row { display: flex; flex-direction: row; }
      .card { grid-column: 1; }
    </style>`;
    document.body.innerHTML = '<div id="page"><main><div class="row"><section class="card">Hi</section></div></main></div>';
    const ctx = buildSelectionContext(document.querySelector('.card')!);
    expect(ctx.ancestors[0]).toBe('div.row (display: flex; flex-direction: row)');
    expect(ctx.ancestors[1]).toBe('main (display: grid; grid-template-columns: 1fr 1fr; gap: 24px)');
    expect(ctx.ancestors[2]).toBe('div#page');
    expect(ctx.styles['grid-column']).toMatch(/^1/);
    document.head.innerHTML = '';
  });
});
