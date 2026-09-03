import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.use({
  launchOptions: {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  }
});

test('Web Shell Browser Launch and Startup Test', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => {
    errors.push(err.message);
  });

  const logs = [];
  page.on('console', (msg) => {
    logs.push(`[${msg.type()}] ${msg.text()}`);
  });

  const webIndexPath = 'file://' + path.resolve(__dirname, 'web', 'index.html').replace(/\\/g, '/');
  console.log('Loading web shell at:', webIndexPath);
  await page.goto(webIndexPath);

  // Verify critical elements are rendered
  await expect(page.locator('#app-root')).toBeVisible();
  await expect(page.locator('.brand-title')).toContainText('WATCH PARTY');
  await expect(page.locator('.web-badge')).toHaveText('WEB');
  await expect(page.locator('#empty-dropzone')).toBeVisible();
  await expect(page.locator('#btn-select-file')).toBeVisible();

  // Verify window.watchParty instances exist and initialized without errors
  const watchPartyState = await page.evaluate(() => {
    return {
      hasWatchParty: !!window.watchParty,
      isWeb: !!window.watchParty?.isWeb,
      hasUI: !!window.watchParty?.ui,
      hasVideo: !!window.watchParty?.video,
      hasSnapshot: !!window.watchParty?.snapshot,
      hasSession: !!window.watchParty?.session,
      hasIntegration: !!window.watchParty?.integration,
      connectionState: window.appState?.get('connectionState')
    };
  });

  console.log('Evaluated Web Shell State:', JSON.stringify(watchPartyState, null, 2));

  expect(watchPartyState.hasWatchParty).toBe(true);
  expect(watchPartyState.isWeb).toBe(true);
  expect(watchPartyState.hasUI).toBe(true);
  expect(watchPartyState.hasVideo).toBe(true);
  expect(watchPartyState.hasSnapshot).toBe(true);
  expect(watchPartyState.hasSession).toBe(true);
  expect(watchPartyState.hasIntegration).toBe(true);
  expect(watchPartyState.connectionState).toBe('disconnected');

  // Verify no fatal JS exceptions occurred during page load
  expect(errors).toHaveLength(0);
});
