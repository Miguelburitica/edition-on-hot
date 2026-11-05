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

const extensionPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/chrome-mv3-e2e');
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

async function selectCard(app: Page, panel: Page, index: number) {
  await panel.getByRole('button', { name: /^(Select element|Change)$/ }).click();
  await expect(panel.getByText('Click an element on the page.')).toBeVisible();
  // Click inside the card's padding so the card itself (not a child) is picked.
  await app.locator('section.card').nth(index).click({ position: { x: 6, y: 6 } });
  await expect(panel.getByTestId('selection-label')).toHaveText('section.card');
}

const selectSignupCard = (app: Page, panel: Page) => selectCard(app, panel, 0);

async function applyPrompt(panel: Page, prompt: string) {
  await panel.getByRole('textbox').fill(prompt);
  await panel.getByRole('button', { name: 'Apply' }).click();
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

test('OpenCode: the model is checked against its catalog and the edit loop runs with it active', async ({ context, extensionId }) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByRole('button', { name: /^OpenCode/ }).click();
  await expect(options.getByLabel('OpenCode model')).toHaveValue('glm-5.3-flash');
  await expect(options.getByTestId('model-status')).toHaveText(/Found in the OpenCode catalog · supports structured outputs and tools/);
  await options.getByLabel('OpenCode API key').fill('sk-oc-e2e-placeholder-7777');
  await options.getByRole('button', { name: /^Save/ }).click();
  await expect(options.getByRole('status')).toHaveText('Settings saved. OpenCode is the active provider.');
  await options.close();

  const { app, panel } = await openEditor(context, extensionId);
  await selectSignupCard(app, panel);
  await panel.getByRole('textbox').fill('Add a red notification banner above this form');
  await panel.getByRole('button', { name: 'Apply' }).click();
  await expect(app.locator('.hew-e2e-banner')).toHaveCount(1);
});

test('LiteLLM: a proxy URL and model without a key are saved and survive a reload', async ({ context, extensionId }) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByRole('button', { name: /^LiteLLM/ }).click();
  await expect(options.getByLabel('LiteLLM proxy URL')).toHaveValue('http://localhost:4000');
  await expect(options.getByLabel('LiteLLM API key (optional)')).toBeVisible();

  await options.getByRole('button', { name: /^Save/ }).click();
  await expect(options.getByRole('status')).toContainText('Set the LiteLLM model');

  await options.getByLabel('LiteLLM proxy URL').fill('https://llm.example.com/v1/');
  await options.getByLabel('LiteLLM model').fill('team-gpt');
  await expect(options.getByTestId('model-status')).toContainText('Found in the LiteLLM proxy');
  await options.getByRole('button', { name: /^Save/ }).click();
  await expect(options.getByRole('status')).toHaveText('Settings saved. LiteLLM is the active provider.');

  await options.reload();
  await expect(options.getByRole('button', { name: 'LiteLLM (active)' })).toBeVisible();
  await expect(options.getByLabel('LiteLLM proxy URL')).toHaveValue('https://llm.example.com');
  await expect(options.getByLabel('LiteLLM model')).toHaveValue('team-gpt');
  await expect(options.getByRole('button', { name: 'Test connection' })).toBeEnabled();
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

test('version timeline: jump to the original and to any step, and replace later versions', async ({ context, extensionId }) => {
  await saveKey(context, extensionId);
  const { app, panel } = await openEditor(context, extensionId);
  const banner = app.locator('.hew-e2e-banner');
  const items = app.locator('ul.list li');

  await selectSignupCard(app, panel);
  await applyPrompt(panel, 'Add a red notification banner above this form');
  await expect(banner).toHaveCount(1);

  // A selection-scoped rule styles every item of the selected card.
  await selectCard(app, panel, 1);
  await applyPrompt(panel, 'Put a border on every item');
  for (const li of await items.all()) await expect(li).toHaveCSS('border-top-color', 'rgb(0, 128, 0)');
  await expect(panel.getByTestId('changeset').nth(1)).toHaveAttribute('data-current', 'true');

  await panel.getByRole('button', { name: 'Show the original page' }).click();
  await expect(banner).toHaveCount(0);
  await expect(items.first()).not.toHaveCSS('border-top-color', 'rgb(0, 128, 0)');
  await expect(panel.getByTestId('version-original')).toHaveAttribute('data-current', 'true');
  await expect(app.locator('[data-hew-scope]')).toHaveCount(0);

  await panel.getByRole('button', { name: 'Show version 1' }).click();
  await expect(banner).toHaveCount(1);
  await expect(items.first()).not.toHaveCSS('border-top-color', 'rgb(0, 128, 0)');
  await expect(panel.getByTestId('replace-note')).toHaveText('You are viewing version 1 of 2. Applying will replace 1 later version.');

  await applyPrompt(panel, 'Highlight it');
  await expect(panel.getByTestId('changeset')).toHaveCount(2);
  await expect(panel.getByTestId('changeset').nth(1)).toContainText('Highlights the selection');
  await expect(panel.getByTestId('replace-note')).toHaveCount(0);
});

test('a change with no visible effect is flagged and its ops are listed', async ({ context, extensionId }) => {
  await saveKey(context, extensionId);
  const { app, panel } = await openEditor(context, extensionId);
  await selectSignupCard(app, panel);
  await applyPrompt(panel, 'Style something that will match nothing');

  const entry = panel.getByTestId('changeset');
  await expect(entry).toContainText('applied with warnings');
  await entry.getByText('1 op · 1 warning').click();
  await expect(entry).toContainText('addCss → section');
  await expect(entry).toContainText('No visible effect: rule ".does-not-exist" matched nothing');
});

test('settings list the models the account can use, for every provider', async ({ context, extensionId }) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(options.getByTestId('model-list-status')).toHaveText('Save a key to list the models your account can use.');
  await options.getByLabel('Anthropic API key').fill(FAKE_KEY);
  await options.getByRole('button', { name: 'Save' }).click();
  await expect(options.getByTestId('model-list-status')).toHaveText('3 models available to your account');
  await expect(options.getByTestId('model-options').locator('option[value="claude-haiku-5-5"]')).toHaveCount(1);
  // Any listed Claude model can be picked, not only the two built-in ones.
  await options.getByLabel('Anthropic model').fill('claude-haiku-5-5');
  await options.getByRole('button', { name: 'Save' }).click();
  await expect(options.getByRole('status')).toHaveText('Settings saved. Anthropic is the active provider.');
  await options.reload();
  await expect(options.getByLabel('Anthropic model')).toHaveValue('claude-haiku-5-5');

  // Without a key OpenCode shows its public list; with one, only the account's enabled models.
  await options.getByRole('button', { name: /^OpenCode/ }).click();
  await expect(options.getByTestId('model-list-status')).toHaveText(/4 models available \(add a key/);
  await options.getByLabel('OpenCode API key').fill('sk-oc-e2e-placeholder-7777');
  await options.getByRole('button', { name: 'Refresh models' }).click();
  await expect(options.getByTestId('model-list-status')).toHaveText('3 models available to your account');
  await expect(options.getByTestId('model-options').locator('option[value="kimi-k3"]')).toHaveCount(1);
  await expect(options.getByTestId('model-options').locator('option[value="gpt-5.5"]')).toHaveCount(0);
});

test('design system: extract from the page, guide generation, import tokens, inject them and switch off', async ({ context, extensionId }) => {
  await saveKey(context, extensionId);
  const { app, panel } = await openEditor(context, extensionId);

  await panel.getByRole('button', { name: 'Extract from page' }).click();
  await expect(panel.getByRole('status')).toContainText(/Saved ".+" with \d+ tokens and \d+ components/);
  await expect(panel.getByTestId('design-system-summary')).toBeVisible();
  await panel.getByTestId('design-system-summary').click();
  await expect(panel.getByTestId('design-token').filter({ hasText: '--brand' }).first()).toContainText('#4f46e5');

  // The active design system reaches the generator with the change request.
  await selectSignupCard(app, panel);
  await applyPrompt(panel, 'show the design system');
  await expect(app.locator('.hew-e2e-ds')).toContainText('--brand: #4f46e5');
  await expect(app.locator('.hew-e2e-ds')).toContainText('Components (reuse these classes):');

  // An imported token the page lacks is injected, so changes using it render.
  const tokens = JSON.stringify({ color: { $type: 'color', accent: { $value: '#10b981' } } });
  await panel.getByLabel('Token file').setInputFiles({ name: 'brand.tokens.json', mimeType: 'application/json', buffer: Buffer.from(tokens) });
  await expect(panel.getByRole('status')).toHaveText('Imported "brand" with 1 tokens.');
  await expect(panel.getByLabel('Active design system')).toHaveValue(/.+/);
  await expect(panel.getByLabel('Active design system').locator('option:checked')).toHaveText('brand');
  await applyPrompt(panel, 'Add a token banner');
  const tokenBanner = app.locator('.hew-e2e-token');
  await expect(tokenBanner).toHaveCSS('background-color', 'rgb(16, 185, 129)');

  // Switching off removes the injected tokens; the page's own variables were never touched.
  await panel.getByLabel('Active design system').selectOption('');
  await expect(tokenBanner).toHaveCSS('background-color', 'rgb(1, 2, 3)');
  await expect(app.locator('style[data-hew-design-system]')).toHaveCount(0);
  expect(await app.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--brand').trim())).toBe('#4f46e5');
});

test('export: the applied changes download as Markdown, JSON and an OpenSpec archive', async ({ context, extensionId }) => {
  await saveKey(context, extensionId);
  const { app, panel } = await openEditor(context, extensionId);
  await expect(panel.getByText('Apply a change to export the session as a spec.')).toBeVisible();
  await selectSignupCard(app, panel);
  await applyPrompt(panel, 'Add a red notification banner above this form');
  await expect(app.locator('.hew-e2e-banner')).toHaveCount(1);

  const download = async (format: string) => {
    await panel.getByLabel('Export format').selectOption(format);
    const [file] = await Promise.all([panel.waitForEvent('download'), panel.getByRole('button', { name: 'Download' }).click()]);
    return { name: file.suggestedFilename(), path: await file.path() };
  };
  const { readFile } = await import('node:fs/promises');

  const md = await download('markdown');
  expect(md.name).toMatch(/^ui-localhost-5179-\d{8}-\d{4}\.md$/);
  const markdown = await readFile(md.path, 'utf8');
  expect(markdown).toContain('### Requirement: Adds a red notification banner above the selection');
  expect(markdown).toContain('Requested: "Add a red notification banner above this form"');
  expect(markdown).toContain('hew-e2e-banner');

  const json = JSON.parse(await readFile((await download('json')).path, 'utf8'));
  expect(json).toMatchObject({ format: 'hew-change-spec', changes: [{ prompt: 'Add a red notification banner above this form' }] });

  const archive = await download('openspec');
  expect(archive.name).toMatch(/\.zip$/);
  expect((await readFile(archive.path)).subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));

  // Undone changes are not exported.
  await panel.getByRole('button', { name: 'Undo' }).click();
  await expect(panel.getByText('Apply a change to export the session as a spec.')).toBeVisible();
});
