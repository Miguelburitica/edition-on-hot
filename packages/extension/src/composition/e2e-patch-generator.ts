import { ProviderError, type CatalogQuery, type ModelCapabilities, type ModelCatalog, type PatchGenerator } from '@hew/core/ai/domain';
import { err, ok } from '@hew/core/shared/domain';

/**
 * Deterministic PatchGenerator compiled only into `--mode e2e` builds, so end-to-end tests run the
 * whole extension without calling any provider.
 */
export class E2ePatchGenerator implements PatchGenerator {
  async generate({ prompt }: Parameters<PatchGenerator['generate']>[0]) {
    // Lets tests exercise provider error handling end to end.
    if (/simulate no-provider/i.test(prompt)) return err(new ProviderError('no-provider'));
    if (/every item/i.test(prompt)) {
      return ok({
        raw: { summary: 'Borders every item', ops: [{ type: 'addCss', css: 'li { border: 2px solid rgb(0, 128, 0) !important; }' }] },
        diagnostics: { latencyMs: 0 },
      });
    }
    if (/match nothing/i.test(prompt)) {
      return ok({
        raw: { summary: 'Styles an element that does not exist', ops: [{ type: 'addCss', css: '.does-not-exist { color: red; }' }] },
        diagnostics: { latencyMs: 0 },
      });
    }
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

/** Catalog for e2e builds: knows the suggested models, so tests never reach a real catalog or proxy. */
export class E2eModelCatalog implements ModelCatalog {
  async lookup({ provider, model }: CatalogQuery) {
    const found: ModelCapabilities = { status: 'found', structuredOutputs: true, tools: true };
    const known =
      provider === 'openrouter'
        ? model.startsWith('z-ai/') || model.startsWith('anthropic/')
        : provider === 'opencode'
          ? model === 'glm-5.3-flash' || model === 'claude-haiku-5-5'
          : model === 'team-gpt';
    // The fake LiteLLM proxy only proves the model exists, like a proxy without /model/info.
    if (known && provider === 'litellm') return ok({ status: 'found' as const, structuredOutputs: false, tools: false });
    return ok(known ? found : { ...found, status: 'not-found' as const });
  }
}

/** e2e builds grant host access without a browser prompt. */
export const e2eRequestHostAccess = async (_origin: string) => true;
