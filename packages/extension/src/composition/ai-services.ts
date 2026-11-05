import type { ModelCatalog, ModelLister } from '@hew/core/ai/domain';
import {
  AnthropicModelLister,
  AnthropicPatchGenerator,
  ChatCompletionsPatchGenerator,
  LiteLlmModelCatalog,
  ModelCatalogRouter,
  ModelListerRouter,
  OpenCodeModelCatalog,
  OpenRouterModelCatalog,
  PatchGeneratorRouter,
} from '@hew/core/ai/infrastructure';
import { browser } from 'wxt/browser';
import { ChromeSettingsRepository, type StorageAreaLike } from '../infrastructure';
import { E2eModelCatalog, E2eModelLister, E2ePatchGenerator, e2eRequestHostAccess } from './e2e-patch-generator';

/** AI adapters shared by the background and options composition roots. */
export function createAiServices() {
  const e2e = import.meta.env.MODE === 'e2e';
  const fake = e2e ? new E2ePatchGenerator() : null;
  // OpenRouter, OpenCode and LiteLLM all speak OpenAI chat completions.
  const chat = fake ?? new ChatCompletionsPatchGenerator();
  const router = new PatchGeneratorRouter({
    anthropic: fake ?? new AnthropicPatchGenerator(),
    openrouter: chat,
    opencode: chat,
    litellm: chat,
  });
  const openrouter = new OpenRouterModelCatalog();
  const opencode = new OpenCodeModelCatalog();
  const litellm = new LiteLlmModelCatalog();
  const catalog: ModelCatalog = e2e ? new E2eModelCatalog() : new ModelCatalogRouter({ openrouter, opencode, litellm });
  const lister: ModelLister = e2e
    ? new E2eModelLister()
    : new ModelListerRouter({ anthropic: new AnthropicModelLister(), openrouter, opencode, litellm });
  const settings = new ChromeSettingsRepository(browser.storage.local as unknown as StorageAreaLike);
  /** Asks Chrome for access to a user-configured host (the LiteLLM proxy). Must run inside a click. */
  const requestHostAccess = e2e
    ? e2eRequestHostAccess
    : (origin: string) => browser.permissions.request({ origins: [`${origin}/*`] });
  return { router, catalog, lister, settings, requestHostAccess };
}
