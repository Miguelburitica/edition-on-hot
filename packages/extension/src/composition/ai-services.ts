import type { ModelCatalog } from '@hew/core/ai/domain';
import {
  AnthropicPatchGenerator,
  OpenRouterModelCatalog,
  OpenRouterPatchGenerator,
  PatchGeneratorRouter,
} from '@hew/core/ai/infrastructure';
import { browser } from 'wxt/browser';
import { ChromeSettingsRepository, type StorageAreaLike } from '../infrastructure';
import { E2eModelCatalog, E2ePatchGenerator } from './e2e-patch-generator';

/** AI adapters shared by the background and options composition roots. */
export function createAiServices() {
  const e2e = import.meta.env.MODE === 'e2e';
  const fake = e2e ? new E2ePatchGenerator() : null;
  const router = new PatchGeneratorRouter({
    anthropic: fake ?? new AnthropicPatchGenerator(),
    openrouter: fake ?? new OpenRouterPatchGenerator(),
  });
  const catalog: ModelCatalog = e2e ? new E2eModelCatalog() : new OpenRouterModelCatalog();
  const settings = new ChromeSettingsRepository(browser.storage.local as unknown as StorageAreaLike);
  return { router, catalog, settings };
}
