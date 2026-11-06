import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import {
  ActivateDesignSystem,
  DeleteDesignSystem,
  ExportDesignSystem,
  ImportDesignSystem,
  ListDesignSystems,
  SaveDesignSystem,
} from '@hew/core/design-system/application';
import { GetProviderSettings } from '@hew/core/ai/application';
import { DtcgCodec } from '@hew/core/design-system/infrastructure';
import { ExportChangeSpec } from '@hew/core/handoff/application';
import { JsonSpecRenderer, MarkdownSpecRenderer, OpenSpecChangeRenderer } from '@hew/core/handoff/infrastructure';
import { ChromeDesignSystemRepository, ChromeSettingsRepository, EditorClient, type EditorStateChanged, type StorageAreaLike } from '../infrastructure';
import '../presentation/shared/theme.css';
import { SidePanelApp, type SidePanelServices } from '../presentation/sidepanel/SidePanelApp';

type OnMessageListener = Parameters<typeof browser.runtime.onMessage.addListener>[0];

export function mountSidePanel(root: HTMLElement): void {
  // `?tabId=` pins the panel to one tab when it is opened as a page (used by the e2e tests).
  const pinnedTab = new URLSearchParams(location.search).get('tabId');
  const sendToTab = (tabId: number, message: unknown) => browser.tabs.sendMessage(tabId, message);

  const repo = new ChromeDesignSystemRepository(browser.storage.local as unknown as StorageAreaLike);
  let counter = 0;
  const library = {
    repo,
    ids: { next: () => `ds-${Date.now().toString(36)}-${++counter}` },
    clock: { now: () => new Date() },
  };
  const codec = new DtcgCodec();

  const settings = new GetProviderSettings(new ChromeSettingsRepository(browser.storage.local as unknown as StorageAreaLike));

  const services: SidePanelServices = {
    async provider() {
      const view = await settings.execute();
      const slot = view[view.active];
      const keyOptional = 'keyRequired' in slot && !slot.keyRequired;
      return { label: slot.label, model: slot.model, ready: slot.hasKey || keyOptional };
    },
    onSettingsChanged(listener) {
      const onChanged = (_changes: unknown, area: string) => {
        if (area === 'local') listener();
      };
      browser.storage.onChanged.addListener(onChanged);
      return () => browser.storage.onChanged.removeListener(onChanged);
    },
    designSystems: {
      list: new ListDesignSystems(repo),
      save: new SaveDesignSystem(library),
      importFile: new ImportDesignSystem(library, codec),
      exportFile: new ExportDesignSystem(repo, codec),
      activate: new ActivateDesignSystem(repo),
      remove: new DeleteDesignSystem(repo),
    },
    exportSpec: new ExportChangeSpec(
      { markdown: new MarkdownSpecRenderer(), openspec: new OpenSpecChangeRenderer(), json: new JsonSpecRenderer() },
      library.clock,
    ),
    download(file) {
      const blob = new Blob([file.content as BlobPart], { type: file.mimeType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    },
    copyText: (text) => navigator.clipboard.writeText(text),
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
