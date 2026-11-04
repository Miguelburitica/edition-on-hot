import type { PatchGenerator } from '@hew/core/ai/domain';
import { ok } from '@hew/core/shared/domain';

/**
 * Deterministic PatchGenerator compiled only into `--mode e2e` builds, so end-to-end tests run the
 * whole extension without calling the provider.
 */
export class E2ePatchGenerator implements PatchGenerator {
  async generate({ prompt }: Parameters<PatchGenerator['generate']>[0]) {
    if (/banner/i.test(prompt)) {
      return ok({
        summary: 'Adds a red notification banner above the selection',
        ops: [
          {
            type: 'insert' as const,
            target: 't0',
            position: 'before' as const,
            html: '<div class="hew-e2e-banner" role="status">Heads up! This is a new banner.</div>',
          },
          { type: 'addCss' as const, css: '.hew-e2e-banner { background: rgb(220, 38, 38); color: white; padding: 12px; }' },
        ],
      });
    }
    return ok({ summary: 'Highlights the selection', ops: [{ type: 'setStyle' as const, target: 't0', styles: { outline: '3px solid red' } }] });
  }

  async ping() {
    return ok(undefined);
  }
}
