import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { EditorClient, type EditorStateChanged } from '../infrastructure';
import '../presentation/shared/theme.css';
import { SidePanelApp, type SidePanelServices } from '../presentation/sidepanel/SidePanelApp';

type OnMessageListener = Parameters<typeof browser.runtime.onMessage.addListener>[0];

export function mountSidePanel(root: HTMLElement): void {
  // `?tabId=` pins the panel to one tab when it is opened as a page (used by the e2e tests).
  const pinnedTab = new URLSearchParams(location.search).get('tabId');
  const sendToTab = (tabId: number, message: unknown) => browser.tabs.sendMessage(tabId, message);

  const services: SidePanelServices = {
    async resolveClient() {
      const tabId = pinnedTab ? Number(pinnedTab) : (await browser.tabs.query({ active: true, currentWindow: true }))[0]?.id;
      return tabId === undefined ? null : new EditorClient(sendToTab, tabId);
    },
    onStateChanged(listener) {
      const onMessage = ((message: unknown, sender: { id?: string; tab?: { id?: number } }) => {
        const event = message as Partial<EditorStateChanged> | undefined;
        if (sender.id === browser.runtime.id && event?.type === 'editing/stateChanged' && event.state && sender.tab?.id !== undefined) {
          listener(sender.tab.id, event.state);
        }
        return false;
      }) as OnMessageListener;
      browser.runtime.onMessage.addListener(onMessage);
      return () => browser.runtime.onMessage.removeListener(onMessage);
    },
    onTabChanged(listener) {
      if (pinnedTab) return () => undefined;
      const onActivated = () => listener();
      const onUpdated = (_id: number, info: { status?: string }) => {
        if (info.status === 'complete') listener();
      };
      browser.tabs.onActivated.addListener(onActivated);
      browser.tabs.onUpdated.addListener(onUpdated);
      return () => {
        browser.tabs.onActivated.removeListener(onActivated);
        browser.tabs.onUpdated.removeListener(onUpdated);
      };
    },
    openSettings: () => void browser.runtime.openOptionsPage(),
  };

  createRoot(root).render(
    <StrictMode>
      <SidePanelApp services={services} />
    </StrictMode>,
  );
}
