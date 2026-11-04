import { ProviderError, type ModelCapabilities, type ModelCatalog, type PatchGenerator } from '@hew/core/ai/domain';
import { err, ok } from '@hew/core/shared/domain';

/**
 * Deterministic PatchGenerator compiled only into `--mode e2e` builds, so end-to-end tests run the
 * whole extension without calling any provider.
 */
export class E2ePatchGenerator implements PatchGenerator {
  async generate({ prompt }: Parameters<PatchGenerator['generate']>[0]) {
    // Lets tests exercise provider error handling end to end.
    if (/simulate no-provider/i.test(prompt)) return err(new ProviderError('no-provider'));
    const raw = /banner/i.test(prompt)
      ? {
          summary: 'Adds a red notification banner above the selection',
          ops: [
            {
              type: 'insert',
              target: 't0',
              position: 'before',
              html: '<div class="hew-e2e-banner" role="status">Heads up! This is a new banner.</div>',
            },
            { type: 'addCss', css: '.hew-e2e-banner { background: rgb(220, 38, 38); color: white; padding: 12px; }' },
          ],
        }
      : { summary: 'Highlights the selection', ops: [{ type: 'setStyle', target: 't0', styles: { outline: '3px solid red' } }] };
    return ok({ raw, diagnostics: { latencyMs: 0 } });
  }

  async ping() {
    return ok(undefined);
  }
}

/** Catalog for e2e builds: knows the suggested models, so tests never reach openrouter.ai. */
export class E2eModelCatalog implements ModelCatalog {
  async lookup(modelId: string) {
    const found: ModelCapabilities = { status: 'found', structuredOutputs: true, tools: true };
    return ok(modelId.startsWith('z-ai/') || modelId.startsWith('anthropic/') ? found : { ...found, status: 'not-found' as const });
  }
}
