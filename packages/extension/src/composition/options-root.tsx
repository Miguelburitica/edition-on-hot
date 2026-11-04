import { ClearApiKey, GetProviderSettings, SaveProviderSettings, TestProviderConnection } from '@hew/core/ai/application';
import { AnthropicPatchGenerator } from '@hew/core/ai/infrastructure';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { browser } from 'wxt/browser';
import { ChromeSettingsRepository, type StorageAreaLike } from '../infrastructure';
import { OptionsApp } from '../presentation/options/OptionsApp';
import '../presentation/shared/theme.css';

export function mountOptions(root: HTMLElement): void {
  const settings = new ChromeSettingsRepository(browser.storage.local as unknown as StorageAreaLike);
  const useCases = {
    get: new GetProviderSettings(settings),
    save: new SaveProviderSettings(settings),
    clear: new ClearApiKey(settings),
    test: new TestProviderConnection(settings, new AnthropicPatchGenerator()),
  };
  createRoot(root).render(
    <StrictMode>
      <OptionsApp useCases={useCases} />
    </StrictMode>,
  );
}
