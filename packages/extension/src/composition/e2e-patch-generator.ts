import {
  ProviderError,
  type CatalogQuery,
  type ModelCapabilities,
  type ModelCatalog,
  type ModelLister,
  type ModelListQuery,
  type PatchGenerator,
} from '@hew/core/ai/domain';
import { err, ok } from '@hew/core/shared/domain';

/**
 * Deterministic PatchGenerator compiled only into `--mode e2e` builds, so end-to-end tests run the
 * whole extension without calling any provider.
 */
export class E2ePatchGenerator implements PatchGenerator {
  async generate({ prompt, context }: Parameters<PatchGenerator['generate']>[0]) {
    // Shows what design system guidance reached the generator.
    if (/show the design system/i.test(prompt)) {
      const guidance = context.props.designSystem ?? 'none';
      const escaped = guidance.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
      return ok({
        raw: { summary: 'Shows the design system guidance', ops: [{ type: 'insert', target: 't0', position: 'before', html: `<pre class="hew-e2e-ds">${escaped}</pre>` }] },
        diagnostics: { latencyMs: 0 },
      });
    }
    // Uses a token the page does not define, which only renders when the design system is injected.
    if (/token banner/i.test(prompt)) {
      return ok({
        raw: {
          summary: 'Adds a banner in the accent token color',
          ops: [
            { type: 'insert', target: 't0', position: 'before', html: '<div class="hew-e2e-token">Token banner</div>' },
            { type: 'addCss', css: '.hew-e2e-token { background-color: var(--color-accent, rgb(1, 2, 3)); padding: 8px; }' },
          ],
        },
        diagnostics: { latencyMs: 0 },
      });
    }
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

const E2E_MODELS: Record<ModelListQuery['provider'], readonly string[]> = {
  anthropic: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'],
  openrouter: ['z-ai/glm-5.3-flash', 'anthropic/claude-haiku-5.5', 'z-ai/glm-5.3'],
  opencode: ['glm-5.3-flash', 'claude-haiku-5-5', 'kimi-k3'],
  litellm: ['team-gpt'],
};

/** Lister for e2e builds: a fixed list per provider; OpenCode answers the account list only with a key. */
export class E2eModelLister implements ModelLister {
  async list({ provider, apiKey }: ModelListQuery) {
    const found: ModelCapabilities = { status: 'found', structuredOutputs: true, tools: true };
    const ids = provider === 'opencode' && !apiKey ? [...E2E_MODELS.opencode, 'gpt-5.5'] : E2E_MODELS[provider];
    return ok({
      scope: apiKey ? ('account' as const) : ('public' as const),
      models: ids.map((id) => ({ id, label: id, capabilities: found })),
    });
  }
}

/** e2e builds grant host access without a browser prompt. */
export const e2eRequestHostAccess = async (_origin: string) => true;
