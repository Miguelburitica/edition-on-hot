import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, expect, test as base, type BrowserContext, type Page } from '@playwright/test';

/** The slice of the extension API used inside `page.evaluate` on extension pages. */
declare const chrome: {
  tabs: {
    query(query: object): Promise<{ id?: number }[]>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
  };
};

const extensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.output/chrome-mv3-e2e');
const FIXTURE_URL = 'http://localhost:5179/';
/** A placeholder key: e2e builds use a fake PatchGenerator and never call the provider. */
const FAKE_KEY = 'sk-ant-e2e-placeholder-0000';

const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await use(new URL(worker.url()).host);
  },
});

async function saveKey(context: BrowserContext, extensionId: string) {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByLabel('Anthropic API key').fill(FAKE_KEY);
  await options.getByRole('button', { name: 'Save' }).click();
  await expect(options.getByRole('status')).toHaveText('Settings saved. Anthropic is the active provider.');
  await expect(options.getByText('Saved key: sk-ant-…0000')).toBeVisible();
  await options.close();
}

const FAKE_OPENROUTER_KEY = 'sk-or-e2e-placeholder-9999';

async function saveOpenRouter(context: BrowserContext, extensionId: string, model = 'z-ai/glm-5.3-flash'): Promise<Page> {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByRole('button', { name: /^OpenRouter/ }).click();
  await options.getByLabel('OpenRouter API key').fill(FAKE_OPENROUTER_KEY);
  await options.getByLabel('OpenRouter model').fill(model);
  await options.getByRole('button', { name: /^Save/ }).click();
  return options;
}

/** Opens the fixture and a side panel page pinned to its tab. */
async function openEditor(context: BrowserContext, extensionId: string): Promise<{ app: Page; panel: Page }> {
  const app = await context.newPage();
  await app.goto(FIXTURE_URL);
  await expect(app.locator('#signup')).toBeVisible();

  const panel = await context.newPage();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`);
  // Without the "tabs" permission tab URLs are hidden, so find the tab whose content script answers.
  const tabId = await panel.evaluate(async () => {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id === undefined) continue;
      const reply = await chrome.tabs.sendMessage(tab.id, { type: 'editing/getSnapshot' }).catch(() => undefined);
      if (reply) return tab.id;
    }
    return undefined;
  });
  expect(tabId).toBeDefined();
  await panel.goto(`chrome-extension://${extensionId}/sidepanel.html?tabId=${tabId}`);
  await expect(panel.getByRole('button', { name: 'Select element' })).toBeVisible();
  return { app, panel };
}

async function selectSignupCard(app: Page, panel: Page) {
  await panel.getByRole('button', { name: 'Select element' }).click();
  await expect(panel.getByText('Click an element on the page.')).toBeVisible();
  // Click inside the card's padding so the card itself (not a child) is picked.
  await app.locator('section.card').first().click({ position: { x: 6, y: 6 } });
  await expect(panel.getByTestId('selection-label')).toHaveText('section.card');
}

test('select, prompt, preview, undo and redo a change', async ({ context, extensionId }) => {
  await saveKey(context, extensionId);
  const { app, panel } = await openEditor(context, extensionId);
  await selectSignupCard(app, panel);

  await panel.getByRole('textbox').fill('Add a red notification banner above this form');
  await panel.getByRole('button', { name: 'Apply' }).click();

  const banner = app.locator('.hew-e2e-banner');
  await expect(banner).toHaveText('Heads up! This is a new banner.');
  await expect(banner).toHaveCSS('background-color', 'rgb(220, 38, 38)');
  expect(await banner.evaluate((el) => el.nextElementSibling?.matches('section.card'))).toBe(true);
  // The scoped stylesheet must not leak onto the page's own .banner element.
  await expect(app.locator('.banner').first()).toHaveCSS('background-color', 'rgb(254, 243, 199)');
  // The click used for picking never reached the page.
  await expect(app.getByTestId('submitted')).toHaveCount(0);

  const entry = panel.getByTestId('changeset');
  await expect(entry).toHaveAttribute('data-status', 'applied');
  await expect(entry).toContainText('Adds a red notification banner above the selection');

  await panel.getByRole('button', { name: 'Undo' }).click();
  await expect(banner).toHaveCount(0);
  await expect(entry).toHaveAttribute('data-status', 'undone');
  await expect(panel.getByRole('button', { name: 'Undo' })).toBeDisabled();

  await panel.getByRole('button', { name: 'Redo' }).click();
  await expect(banner).toHaveCount(1);
  await expect(entry).toHaveAttribute('data-status', 'applied');
  await expect(panel.getByRole('button', { name: 'Redo' })).toBeDisabled();
});

test('asks for an API key before generating', async ({ context, extensionId }) => {
  const { app, panel } = await openEditor(context, extensionId);
  await selectSignupCard(app, panel);

  await panel.getByRole('textbox').fill('Add a banner');
  await panel.getByRole('button', { name: 'Apply' }).click();

  await expect(panel.getByRole('alert')).toContainText('Add your Anthropic API key in settings');
  await expect(panel.getByRole('button', { name: 'Open settings' })).toBeVisible();
  await expect(app.locator('.hew-e2e-banner')).toHaveCount(0);
});

test('the page cannot read the API key', async ({ context, extensionId }) => {
  await saveKey(context, extensionId);
  const { app } = await openEditor(context, extensionId);
  const leaked = await app.evaluate((key) => {
    const haystack = [document.documentElement.outerHTML, JSON.stringify(localStorage), JSON.stringify(sessionStorage)];
    return haystack.some((s) => s.includes(key));
  }, FAKE_KEY);
  expect(leaked).toBe(false);
});

test('OpenRouter: keys are kept per provider and the edit loop runs with it active', async ({ context, extensionId }) => {
  await saveKey(context, extensionId);
  const options = await saveOpenRouter(context, extensionId);
  await expect(options.getByRole('status')).toHaveText('Settings saved. OpenRouter is the active provider.');
  await expect(options.getByTestId('model-status')).toHaveText(/Found in the OpenRouter catalog · supports structured outputs and tools/);
  await expect(options.getByLabel('Context size')).toHaveValue('compact');

  // Both keys survive a reload, and OpenRouter stays active.
  await options.reload();
  await expect(options.getByRole('button', { name: 'OpenRouter (active)' })).toBeVisible();
  await expect(options.getByText('Saved key: sk-or-e…9999')).toBeVisible();
  await options.getByRole('button', { name: /^Anthropic/ }).click();
  await expect(options.getByText('Saved key: sk-ant-…0000')).toBeVisible();
  await options.close();

  const { app, panel } = await openEditor(context, extensionId);
  await selectSignupCard(app, panel);
  await panel.getByRole('textbox').fill('Add a red notification banner above this form');
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(app.locator('.hew-e2e-banner')).toHaveCount(1);
});

test('OpenRouter: model ids are validated and checked against the catalog', async ({ context, extensionId }) => {
  const options = await saveOpenRouter(context, extensionId, 'glm-flash');
  await expect(options.getByRole('status')).toContainText('Use the vendor/model format');

  await options.getByLabel('OpenRouter model').fill('acme/unknown-model');
  await expect(options.getByTestId('model-status')).toHaveText('Not found in the OpenRouter catalog. You can still save it.');
  await options.getByRole('button', { name: /^Save/ }).click();
  await expect(options.getByRole('status')).toHaveText('Settings saved. OpenRouter is the active provider.');
});

test('provider errors are explained in the side panel', async ({ context, extensionId }) => {
  await (await saveOpenRouter(context, extensionId)).close();
  const { app, panel } = await openEditor(context, extensionId);
  await selectSignupCard(app, panel);
  await panel.getByRole('textbox').fill('simulate no-provider');
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(panel.getByRole('alert')).toContainText('No provider can serve this model with the required features');
  await expect(panel.getByRole('button', { name: 'Open settings' })).toBeVisible();
});
