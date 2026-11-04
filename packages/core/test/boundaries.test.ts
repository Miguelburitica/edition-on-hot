import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const eslint = new ESLint({ cwd: repoRoot });

/** Lints `code` as if it lived at `file` (repo-relative), returning the rule ids reported. */
async function lint(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: path.join(repoRoot, file) });
  return (result?.messages ?? []).map((m) => m.ruleId ?? m.message);
}

describe('architecture boundaries', () => {
  it('forbids domain → infrastructure imports', async () => {
    const rules = await lint(
      'packages/core/src/editing/domain/violation.ts',
      "import { DomPageGateway } from '../infrastructure/dom-page-gateway';\nexport const x = DomPageGateway;\n",
    );
    expect(rules).toContain('boundaries/dependencies');
  });

  it('forbids application → infrastructure imports', async () => {
    const rules = await lint(
      'packages/core/src/ai/application/violation.ts',
      "import { AnthropicPatchGenerator } from '../infrastructure/anthropic-patch-generator';\nexport const x = AnthropicPatchGenerator;\n",
    );
    expect(rules).toContain('boundaries/dependencies');
  });

  it('forbids one context reaching into another context’s domain', async () => {
    const rules = await lint(
      'packages/core/src/editing/infrastructure/violation.ts',
      "import { EditContext } from '../../ai/domain/edit-context';\nexport const x = EditContext;\n",
    );
    expect(rules).toContain('boundaries/dependencies');
  });

  it('allows the anti-corruption layer to use the other context’s application API', async () => {
    const rules = await lint(
      'packages/core/src/editing/infrastructure/ok.ts',
      "import type { GeneratePatchRequest } from '../../ai/application';\nexport type X = GeneratePatchRequest;\n",
    );
    expect(rules).toEqual([]);
  });

  it('forbids frameworks and browser globals in the domain', async () => {
    const rules = await lint(
      'packages/core/src/editing/domain/violation.ts',
      "import { z } from 'zod';\nexport const s = z.string();\nexport const el = document.body;\n",
    );
    expect(rules).toEqual(expect.arrayContaining(['no-restricted-imports', 'no-restricted-globals']));
  });
});
