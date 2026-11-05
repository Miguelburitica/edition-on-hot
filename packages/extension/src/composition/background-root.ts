import { GeneratePatch, GetContextBudget } from '@hew/core/ai/application';
import { GetDesignGuidance } from '@hew/core/design-system/application';
import { ok } from '@hew/core/shared/domain';
import { browser } from 'wxt/browser';
import {
  ChromeDesignSystemRepository,
  createHandler,
  generatePatchMessage,
  getContextBudgetMessage,
  type StorageAreaLike,
} from '../infrastructure';
import { createAiServices } from './ai-services';

type OnMessageListener = Parameters<typeof browser.runtime.onMessage.addListener>[0];

export function startBackground(): void {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => console.error(error));

  const { router, settings } = createAiServices();
  // The Design System context feeds the AI context only through this port, wired here.
  const guidance = new GetDesignGuidance(new ChromeDesignSystemRepository(browser.storage.local as unknown as StorageAreaLike));
  const generatePatch = new GeneratePatch(settings, router, router, {
    forPage: (pageUrl, maxChars) => guidance.execute({ pageUrl, maxChars }),
  });
  const getBudget = new GetContextBudget(settings);

  const listeners = [
    createHandler(
      generatePatchMessage,
      // Guidance is chosen by the page the browser says sent the request, not by what the page claims.
      (message, sender) => generatePatch.execute({ ...message.request, context: { ...message.request.context, pageUrl: sender.url ?? '' } }),
      browser.runtime.id,
    ),
    createHandler(getContextBudgetMessage, async () => ok(await getBudget.execute()), browser.runtime.id),
  ];
  for (const listener of listeners) browser.runtime.onMessage.addListener(listener as OnMessageListener);
}
