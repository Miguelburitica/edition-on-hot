import { GeneratePatch, GetContextBudget } from '@hew/core/ai/application';
import { ok } from '@hew/core/shared/domain';
import { browser } from 'wxt/browser';
import { createHandler, generatePatchMessage, getContextBudgetMessage } from '../infrastructure';
import { createAiServices } from './ai-services';

type OnMessageListener = Parameters<typeof browser.runtime.onMessage.addListener>[0];

export function startBackground(): void {
  browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error: unknown) => console.error(error));

  const { router, settings } = createAiServices();
  const generatePatch = new GeneratePatch(settings, router, router);
  const getBudget = new GetContextBudget(settings);

  const listeners = [
    createHandler(generatePatchMessage, (message) => generatePatch.execute(message.request), browser.runtime.id),
    createHandler(getContextBudgetMessage, async () => ok(await getBudget.execute()), browser.runtime.id),
  ];
  for (const listener of listeners) browser.runtime.onMessage.addListener(listener as OnMessageListener);
}
