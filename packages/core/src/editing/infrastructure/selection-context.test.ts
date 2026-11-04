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
});
