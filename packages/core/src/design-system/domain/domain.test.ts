import { describe, expect, it } from 'vitest';
import { DesignSystem, type DesignSystemProps } from './design-system';
import { isSafeTokenValue, toTokenName, type Token } from './token';

const now = new Date('2026-11-05T10:00:00Z');
const token = (name: string, value: string, extra: Partial<Token> = {}): Token => ({
  name,
  group: 'color',
  value,
  cssVar: `--${name}`,
  source: 'variable',
  ...extra,
});
const props = (extra: Partial<DesignSystemProps> = {}): DesignSystemProps => ({
  id: 'ds-1',
  name: 'Acme',
  origin: 'https://acme.test',
  tokens: [token('color-primary', '#2563eb')],
  components: [{ name: 'Button', kind: 'button', tag: 'button', classes: ['btn', 'btn-primary'], example: '<button class="btn btn-primary">Go</button>' }],
  createdAt: now,
  updatedAt: now,
  ...extra,
});

describe('DesignSystem', () => {
  it('rejects bad names, duplicate tokens, unsafe values and bad custom properties', () => {
    expect(DesignSystem.create(props({ name: ' ' })).ok).toBe(false);
    expect(DesignSystem.create(props({ tokens: [token('a', '#000'), token('a', '#111', { cssVar: '--b' })] })).ok).toBe(false);
    expect(DesignSystem.create(props({ tokens: [token('a', '#000'), token('b', '#111', { cssVar: '--a' })] })).ok).toBe(false);
    expect(DesignSystem.create(props({ tokens: [token('a', 'red; } body { display: none')] })).ok).toBe(false);
    expect(DesignSystem.create(props({ tokens: [token('a', '#000', { cssVar: 'color' })] })).ok).toBe(false);
    expect(DesignSystem.create(props({ tokens: [token('Not Kebab', '#000')] })).ok).toBe(false);
    expect(DesignSystem.create(props()).ok).toBe(true);
  });

  it('summarizes tokens by group and components, cut at a line boundary', () => {
    const ds = DesignSystem.create(
      props({ tokens: [token('space-1', '4px', { group: 'spacing' }), token('color-primary', '#2563eb')] }),
    );
    if (!ds.ok) throw ds.error;
    const full = ds.value.guidance(10_000);
    expect(full.split('\n')).toEqual([
      'Design system "Acme". Write token values as var(--name).',
      'Colors:',
      '  --color-primary: #2563eb',
      'Spacing:',
      '  --space-1: 4px',
      'Components (reuse these classes):',
      '  Button: <button class="btn btn-primary">Go</button>',
    ]);
    const cut = ds.value.guidance(95);
    expect(cut.split('\n')).toHaveLength(3);
    expect(full.startsWith(cut)).toBe(true);
  });

  it('exposes every token as an injectable custom property', () => {
    const ds = DesignSystem.create(props({ tokens: [token('a', '#000'), token('b', '4px', { source: 'inferred', cssVar: '--ds-b' })] }));
    expect(ds.ok && ds.value.injectableVariables()).toEqual({ '--a': '#000', '--ds-b': '4px' });
  });

  it('renames within the invariants', () => {
    const ds = DesignSystem.create(props());
    if (!ds.ok) throw ds.error;
    const renamed = ds.value.rename('Acme 2', new Date('2026-11-06T00:00:00Z'));
    expect(renamed.ok && renamed.value.name).toBe('Acme 2');
    expect(ds.value.rename('', now).ok).toBe(false);
  });
});

describe('token helpers', () => {
  it('normalizes names and refuses stylesheet breakouts', () => {
    expect(toTokenName('Brand Primary/500')).toBe('brand-primary-500');
    expect(toTokenName('colorPrimary')).toBe('color-primary');
    expect(isSafeTokenValue('0 1px 2px rgb(0 0 0 / 0.2)')).toBe(true);
    for (const bad of ['', 'a;b', 'a}b', '</style>', 'a /* x */', 'x'.repeat(201), 'a\\b']) expect(isSafeTokenValue(bad)).toBe(false);
  });
});

describe('guidance budget', () => {
  it('keeps components even when there are many tokens', () => {
    const tokens = Array.from({ length: 200 }, (_, i) => token(`color-${i}`, `#${String(i).padStart(6, '0')}`));
    const ds = DesignSystem.create(props({ tokens }));
    if (!ds.ok) throw ds.error;
    const text = ds.value.guidance(1_500);
    expect(text.length).toBeLessThanOrEqual(1_500);
    expect(text).toContain('Components (reuse these classes):');
    expect(text).toContain('Button: <button class="btn btn-primary">Go</button>');
    expect(text).toContain('--color-0: #000000');
  });
});
