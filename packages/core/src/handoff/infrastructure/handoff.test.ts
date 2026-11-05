import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ExportChangeSpec } from '../application';
import { ChangeSpec, describeOp, type ChangeSpecInput } from '../domain';
import { crc32, fenced, JsonSpecRenderer, MarkdownSpecRenderer, OpenSpecChangeRenderer, openSpecFiles } from '.';

const now = new Date('2026-11-05T10:00:00Z');
const form = { selector: 'main > form#signup', tag: 'form', text: 'Create your account Email Sign up' };
const input: ChangeSpecInput = {
  page: { url: 'https://www.acme.test/signup?ref=x', title: 'Acme Signup' },
  designSystem: {
    name: 'Acme',
    tokens: [
      { cssVar: '--color-danger', value: '#dc2626', group: 'color' },
      { cssVar: '--ds-space-2', value: '8px', group: 'spacing' },
    ],
  },
  changes: [
    {
      id: 'cs-1',
      prompt: 'Add a red notification banner above this form',
      summary: 'Adds a red notification banner above the form.',
      createdAt: '2026-11-05T09:00:00.000Z',
      ops: [
        { type: 'insert', target: form, position: 'before', html: '<div class="notice">Heads up ```</div>' },
        { type: 'addCss', css: '.notice { background: var(--color-danger); padding: var(--ds-space-2); }', scope: form },
      ],
      warnings: ['A rule matched nothing'],
    },
    {
      id: 'cs-2',
      prompt: 'Disable the submit button',
      summary: 'Adds a red notification banner above the form',
      createdAt: '2026-11-05T09:01:00.000Z',
      ops: [
        { type: 'setAttr', target: { selector: 'button', tag: 'button', text: 'Sign up' }, name: 'disabled', value: '' },
        { type: 'setStyle', target: { selector: 'button', tag: 'button', text: 'Sign up' }, styles: { opacity: '0.5' } },
        { type: 'setText', target: { selector: 'h2', tag: 'h2', text: 'Old' }, text: 'New  title' },
        { type: 'remove', target: { selector: '.promo', tag: 'div', text: '' } },
        { type: 'replace', target: form, html: '<form></form>' },
        { type: 'setAttr', target: form, name: 'novalidate', value: null },
      ],
    },
  ],
};

describe('ChangeSpec', () => {
  it('derives names, unique requirements, scenarios and tokens used', () => {
    const spec = ChangeSpec.create(input, now);
    if (!spec.ok) throw spec.error;
    const s = spec.value;
    expect(s.changeName).toBe('ui-acme-test-20261105-1000');
    expect(s.capability).toBe('ui-acme-test-signup');
    expect(s.page).toMatchObject({ host: 'www.acme.test', path: '/signup' });
    expect(s.changes.map((c) => c.requirement)).toEqual([
      'Adds a red notification banner above the form',
      'Adds a red notification banner above the form (2)',
    ]);
    expect(s.changes[0]!.statement).toBe('The page at `/signup` SHALL include this change: adds a red notification banner above the form.');
    expect(s.changes[0]!.scenario.when).toBe('a user opens `/signup`');
    expect(s.changes[0]!.tokensUsed.map((t) => t.cssVar)).toEqual(['--color-danger', '--ds-space-2']);
    expect(s.changes[1]!.targets.map((t) => t.selector)).toEqual(['button', 'h2', '.promo', 'main > form#signup']);
    expect(s.tokensUsed).toHaveLength(2);
  });

  it('refuses an empty session', () => {
    expect(ChangeSpec.create({ ...input, changes: [] }, now)).toMatchObject({ ok: false, error: { code: 'nothing-to-export' } });
  });

  it('describes every op type in plain language', () => {
    expect(describeOp(input.changes[1]!.ops[0]!).description).toBe('Add the `disabled` attribute to `button` (button, "Sign up").');
    expect(describeOp(input.changes[1]!.ops[5]!).description).toContain('Remove the `novalidate` attribute');
    expect(describeOp(input.changes[1]!.ops[2]!).description).toContain('to "New title"');
    expect(describeOp(input.changes[0]!.ops[0]!).description).toMatch(/^Insert new markup before `main > form#signup`/);
  });
});

describe('renderers', () => {
  const spec = (() => {
    const s = ChangeSpec.create(input, now);
    if (!s.ok) throw s.error;
    return s.value;
  })();

  it('Markdown has requirements, notes, tokens and tasks, with safe fences', () => {
    const file = new MarkdownSpecRenderer().render(spec);
    expect(file.fileName).toBe('ui-acme-test-20261105-1000.md');
    const md = String(file.content);
    expect(md).toContain('### Requirement: Adds a red notification banner above the form');
    expect(md).toContain('Requested: "Add a red notification banner above this form"');
    expect(md).toContain('| `--color-danger` | `#dc2626` | color |');
    expect(md).toContain('- [ ] 1.1 Find the component that renders `main > form#signup` on `/signup`');
    expect(md).toContain('````html'); // the inserted HTML contains ``` so the fence is longer
    expect(md).toContain('> Note from the preview: A rule matched nothing');
  });

  it('fences grow past backtick runs', () => {
    expect(fenced('css', 'a ```` b')).toBe('`````css\na ```` b\n`````');
  });

  it('JSON is machine readable', () => {
    const json = JSON.parse(String(new JsonSpecRenderer().render(spec).content));
    expect(json).toMatchObject({ format: 'hew-change-spec', version: 1, changeName: 'ui-acme-test-20261105-1000' });
    expect(json.changes[0].steps[0].code.language).toBe('html');
  });

  it('the OpenSpec archive unzips into a change that passes strict validation', () => {
    const file = new OpenSpecChangeRenderer().render(spec);
    expect(file.fileName).toBe('ui-acme-test-20261105-1000.zip');
    const dir = mkdtempSync(path.join(tmpdir(), 'hew-openspec-'));
    const changes = path.join(dir, 'openspec', 'changes');
    mkdirSync(changes, { recursive: true });
    mkdirSync(path.join(dir, 'openspec', 'specs'), { recursive: true });
    writeFileSync(path.join(dir, 'openspec', 'config.yaml'), 'schema: spec-driven\n');
    writeFileSync(path.join(changes, 'change.zip'), file.content);
    execFileSync('unzip', ['-q', 'change.zip'], { cwd: changes });
    expect(readFileSync(path.join(changes, spec.changeName, 'specs', spec.capability, 'spec.md'), 'utf8')).toContain('## ADDED Requirements');
    const openspec = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../node_modules/.bin/openspec');
    const out = execFileSync(openspec, ['validate', spec.changeName, '--strict'], { cwd: dir, encoding: 'utf8' });
    expect(out).toContain('is valid');
  });

  it('OpenSpec files are named for the change', () => {
    expect(Object.keys(openSpecFiles(spec))).toEqual(['proposal.md', 'design.md', 'tasks.md', 'specs/ui-acme-test-signup/spec.md']);
  });

  it('crc32 matches the reference value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });
});

describe('ExportChangeSpec', () => {
  const renderers = { markdown: new MarkdownSpecRenderer(), openspec: new OpenSpecChangeRenderer(), json: new JsonSpecRenderer() };
  const exporter = new ExportChangeSpec(renderers, { now: () => now });

  it('renders the requested format', () => {
    const result = exporter.execute({ format: 'json', spec: input });
    expect(result.ok && result.value.mimeType).toBe('application/json');
  });

  it('reports unknown formats and empty sessions', () => {
    expect(exporter.execute({ format: 'pdf', spec: input })).toMatchObject({ ok: false, error: { code: 'unknown-export-format' } });
    expect(exporter.execute({ format: 'markdown', spec: { ...input, changes: [] } })).toMatchObject({ ok: false, error: { code: 'nothing-to-export' } });
  });
});

describe('hostile page text in exports', () => {
  it('cannot add headings, requirements or raw HTML to the Markdown', () => {
    const evil = {
      ...input,
      page: { url: 'https://acme.test/x', title: 'T\n## Pwned' },
      designSystem: { name: 'DS', tokens: [{ cssVar: '--t', value: 'x\n## Pwned', group: 'color' }] },
      changes: [
        {
          id: 'c',
          prompt: 'p\n### Requirement: Evil',
          summary: 'Uses var(--t)\n## ADDED Requirements',
          createdAt: '2026-11-05T09:00:00.000Z',
          ops: [
            { type: 'setAttr' as const, target: { selector: '[data-testid="a`b"]', tag: 'div', text: '<img src=x onerror=alert(1)>' }, name: 'title', value: 'v\n### Requirement: Evil' },
            { type: 'setStyle' as const, target: { selector: 'p', tag: 'p', text: '' }, styles: { color: 'var(--t)' } },
          ],
        },
      ],
    };
    const spec = ChangeSpec.create(evil, now);
    if (!spec.ok) throw spec.error;
    const outputs = [String(new MarkdownSpecRenderer().render(spec.value).content), ...Object.values(openSpecFiles(spec.value))];
    for (const text of outputs) {
      expect(text).not.toMatch(/^#{1,4} (Pwned|Requirement: Evil)/m);
      expect(text.match(/^## ADDED Requirements$/gm)?.length ?? 0).toBeLessThanOrEqual(1);
      expect(text).not.toContain('<img');
    }
    expect(outputs[0]).toContain('``[data-testid="a`b"]``');
  });
});
