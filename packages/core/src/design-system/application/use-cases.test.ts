import { describe, expect, it } from 'vitest';
import { ok } from '../../shared/domain';
import type { DesignSystemDraft, DesignTokenCodec } from '../domain';
import { DtcgCodec, InMemoryDesignSystemRepository } from '../infrastructure';
import {
  ActivateDesignSystem,
  DeleteDesignSystem,
  ExportDesignSystem,
  ExtractDesignSystem,
  GetDesignGuidance,
  GetInjectableTokens,
  ImportDesignSystem,
  ListDesignSystems,
  originOf,
  RenameDesignSystem,
  SaveDesignSystem,
} from './use-cases';

const draft: DesignSystemDraft = {
  name: 'Acme',
  tokens: [{ name: 'color-primary', group: 'color', value: '#2563eb', cssVar: '--color-primary', source: 'variable' }],
  components: [],
};

function deps() {
  let n = 0;
  let t = Date.parse('2026-11-05T10:00:00Z');
  return {
    repo: new InMemoryDesignSystemRepository(),
    ids: { next: () => `ds-${++n}` },
    clock: { now: () => new Date((t += 1000)) },
  };
}

describe('design system use cases', () => {
  it('extraction fails when nothing was found', () => {
    expect(new ExtractDesignSystem({ extract: () => draft }).execute()).toEqual(ok(draft));
    const empty = new ExtractDesignSystem({ extract: () => ({ name: 'x', tokens: [], components: [] }) }).execute();
    expect(!empty.ok && empty.error.code).toBe('nothing-extracted');
  });

  it('saves a draft, activates it for the site and lists it as active', async () => {
    const d = deps();
    const saved = await new SaveDesignSystem(d).execute({ draft, origin: 'https://acme.test' });
    expect(saved.ok && saved.value).toMatchObject({ id: 'ds-1', name: 'Acme', origin: 'https://acme.test' });
    const library = await new ListDesignSystems(d.repo).execute({ origin: 'https://acme.test' });
    expect(library.activeId).toBe('ds-1');
    expect((await new ListDesignSystems(d.repo).execute({ origin: 'https://other.test' })).activeId).toBeNull();
  });

  it('gives guidance and injectable tokens only for the site it is active on', async () => {
    const d = deps();
    await new SaveDesignSystem(d).execute({ draft, origin: 'https://acme.test' });
    const guidance = new GetDesignGuidance(d.repo);
    expect(await guidance.execute({ pageUrl: 'https://acme.test/pricing?x=1', maxChars: 1000 })).toContain('--color-primary: #2563eb');
    expect(await guidance.execute({ pageUrl: 'https://other.test/', maxChars: 1000 })).toBeNull();
    expect(await guidance.execute({ pageUrl: 'chrome://extensions', maxChars: 1000 })).toBeNull();
    expect(await new GetInjectableTokens(d.repo).execute({ pageUrl: 'https://acme.test/' })).toEqual({ '--color-primary': '#2563eb' });
  });

  it('switches, turns off and deletes', async () => {
    const d = deps();
    await new SaveDesignSystem(d).execute({ draft, origin: 'https://acme.test' });
    await new SaveDesignSystem(d).execute({ draft: { ...draft, name: 'Second' }, origin: 'https://acme.test' });
    const activate = new ActivateDesignSystem(d.repo);
    expect((await activate.execute({ origin: 'https://acme.test', id: 'ds-1' })).ok).toBe(true);
    expect((await new ListDesignSystems(d.repo).execute({ origin: 'https://acme.test' })).activeId).toBe('ds-1');
    expect((await activate.execute({ origin: 'https://acme.test', id: 'missing' })).ok).toBe(false);
    await new DeleteDesignSystem(d.repo).execute({ id: 'ds-1' });
    const after = await new ListDesignSystems(d.repo).execute({ origin: 'https://acme.test' });
    expect(after.activeId).toBeNull();
    expect(after.systems.map((s) => s.name)).toEqual(['Second']);
  });

  it('imports, exports and renames', async () => {
    const d = deps();
    const codec = new DtcgCodec();
    const file = JSON.stringify({ color: { brand: { $type: 'color', $value: '#ff0000' } } });
    const imported = await new ImportDesignSystem(d, codec).execute({ text: file, fileName: 'brand.tokens.json', origin: 'https://acme.test' });
    expect(imported.ok && imported.value).toMatchObject({ name: 'brand', origin: null, tokens: [{ name: 'color-brand', cssVar: '--color-brand' }] });
    expect((await new ListDesignSystems(d.repo).execute({ origin: 'https://acme.test' })).activeId).toBe('ds-1');
    const bad = await new ImportDesignSystem(d, codec).execute({ text: '{', fileName: 'x.json', origin: null });
    expect(!bad.ok && bad.error.code).toBe('invalid-token-file');

    const exported = await new ExportDesignSystem(d.repo, codec).execute({ id: 'ds-1' });
    expect(exported.ok && exported.value.fileName).toBe('brand.tokens.json');
    const renamed = await new RenameDesignSystem(d.repo, d.clock).execute({ id: 'ds-1', name: 'Brand' });
    expect(renamed.ok && renamed.value.name).toBe('Brand');
    expect((await new ExportDesignSystem(d.repo, {} as DesignTokenCodec).execute({ id: 'nope' })).ok).toBe(false);
  });

  it('origin helper', () => {
    expect(originOf('https://a.test:8080/x')).toBe('https://a.test:8080');
    expect(originOf('file:///tmp/x.html')).toBeNull();
    expect(originOf('not a url')).toBeNull();
  });
});
