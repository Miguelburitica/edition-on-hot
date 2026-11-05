import {
  ClearApiKey,
  GetProviderSettings,
  ListModels,
  LookupModel,
  SaveProviderSettings,
  TestProviderConnection,
} from '@hew/core/ai/application';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { OptionsApp } from '../presentation/options/OptionsApp';
import '../presentation/shared/theme.css';
import { createAiServices } from './ai-services';

export function mountOptions(root: HTMLElement): void {
  const { router, catalog, lister, settings, requestHostAccess } = createAiServices();
  const useCases = {
    get: new GetProviderSettings(settings),
    save: new SaveProviderSettings(settings, catalog),
    clear: new ClearApiKey(settings),
    test: new TestProviderConnection(settings, router),
    lookup: new LookupModel(catalog, settings),
    listModels: new ListModels(lister, settings),
  };
  createRoot(root).render(
    <StrictMode>
      <OptionsApp useCases={useCases} requestHostAccess={requestHostAccess} />
    </StrictMode>,
  );
}
