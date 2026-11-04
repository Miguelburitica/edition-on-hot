import { GeneratePatch } from '@hew/core/ai/application';
import type { PatchGenerator } from '@hew/core/ai/domain';
import { AnthropicPatchGenerator } from '@hew/core/ai/infrastructure';
import { browser } from 'wxt/browser';
import { ChromeSettingsRepository, createHandler, generatePatchMessage, type StorageAreaLike } from '../infrastructure';
import { E2ePatchGenerator } from './e2e-patch-generator';

export function startBackground(): void {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => console.error(error));

  const settings = new ChromeSettingsRepository(browser.storage.local as unknown as StorageAreaLike);
  const generator: PatchGenerator = import.meta.env.MODE === 'e2e' ? new E2ePatchGenerator() : new AnthropicPatchGenerator();
  const generatePatch = new GeneratePatch(settings, generator);

  const listener = createHandler(generatePatchMessage, (message) => generatePatch.execute(message.request), browser.runtime.id);
  browser.runtime.onMessage.addListener(listener as Parameters<typeof browser.runtime.onMessage.addListener>[0]);
}
