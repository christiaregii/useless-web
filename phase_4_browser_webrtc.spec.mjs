import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.use({
  launchOptions: {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  }
});

test('Phase 4 Two Browser Contexts WebRTC Manual Signaling and DataChannel Test', async ({ browser }) => {
  // Create two completely independent browser contexts (Host and Guest)
  const hostContext = await browser.newContext();
  const guestContext = await browser.newContext();

  const hostPage = await hostContext.newPage();
  const guestPage = await guestContext.newPage();

  const webIndexPath = 'file://' + path.resolve(__dirname, 'web', 'index.html').replace(/\\/g, '/');

  console.log('Loading Browser Host at:', webIndexPath);
  await hostPage.goto(webIndexPath);

  console.log('Loading Browser Guest at:', webIndexPath);
  await guestPage.goto(webIndexPath);

  // 1. Host opens signaling modal and generates offer
  console.log('Host generating offer...');
  await hostPage.click('#btn-open-connect');
  await expect(hostPage.locator('#modal-signaling')).toBeVisible();
  await hostPage.click('#btn-host-create');

  // Wait until offer textarea has content (starts with WP1:)
  await hostPage.waitForFunction(() => {
    const el = document.getElementById('host-offer-text');
    return el && el.value.trim().startsWith('WP1:');
  }, null, { timeout: 10000 });

  const offerToken = await hostPage.inputValue('#host-offer-text');
  console.log('Host generated offer token length:', offerToken.length);
  expect(offerToken.startsWith('WP1:')).toBe(true);

  // 2. Guest opens signaling modal, switches to Join tab, pastes offer, and generates answer
  console.log('Guest receiving offer and generating answer...');
  await guestPage.click('#btn-open-connect');
  await expect(guestPage.locator('#modal-signaling')).toBeVisible();
  await guestPage.click('#tab-guest');
  await guestPage.fill('#guest-offer-text', offerToken);
  await guestPage.click('#btn-guest-create-answer');

  // Wait until answer textarea has content
  await guestPage.waitForFunction(() => {
    const el = document.getElementById('guest-answer-text');
    return el && el.value.trim().startsWith('WP1:');
  }, null, { timeout: 10000 });

  const answerToken = await guestPage.inputValue('#guest-answer-text');
  console.log('Guest generated answer token length:', answerToken.length);
  expect(answerToken.startsWith('WP1:')).toBe(true);

  // 3. Host pastes answer and accepts it
  console.log('Host accepting guest answer...');
  await hostPage.fill('#host-answer-text', answerToken);
  await hostPage.click('#btn-host-accept-answer');

  // 4. Wait for WebRTC DataChannel connection on both browser pages
  console.log('Waiting for P2P connection state on both browsers...');
  await hostPage.waitForFunction(() => {
    const badge = document.getElementById('connection-status-text');
    return badge && badge.textContent.includes('P2P Connected');
  }, null, { timeout: 12000 });

  await guestPage.waitForFunction(() => {
    const badge = document.getElementById('connection-status-text');
    return badge && badge.textContent.includes('P2P Connected');
  }, null, { timeout: 12000 });

  console.log('DataChannel connected on both Browser Host and Browser Guest!');

  // 5. Test bi-directional messaging over DataChannel
  console.log('Testing bi-directional message transmission...');

  // Setup message receivers
  await hostPage.evaluate(() => {
    window.testReceivedFromGuest = [];
    window.watchParty.session.onMessage((msg) => {
      window.testReceivedFromGuest.push(msg);
    });
  });

  await guestPage.evaluate(() => {
    window.testReceivedFromHost = [];
    window.watchParty.session.onMessage((msg) => {
      window.testReceivedFromHost.push(msg);
    });
  });

  // Host sends to Guest
  await hostPage.evaluate(() => {
    window.watchParty.session.sendMessage({
      type: 'control',
      text: 'hello from host browser',
      timestamp: 42.5
    });
  });

  // Guest receives from Host
  await guestPage.waitForFunction(() => {
    return window.testReceivedFromHost && window.testReceivedFromHost.some(m => m.text === 'hello from host browser');
  }, null, { timeout: 5000 });
  console.log('Guest successfully received message from Host!');

  // Guest sends to Host
  await guestPage.evaluate(() => {
    window.watchParty.session.sendMessage({
      type: 'control',
      text: 'hello from guest browser',
      timestamp: 99.1
    });
  });

  // Host receives from Guest
  await hostPage.waitForFunction(() => {
    return window.testReceivedFromGuest && window.testReceivedFromGuest.some(m => m.text === 'hello from guest browser');
  }, null, { timeout: 5000 });
  console.log('Host successfully received message from Guest!');

  // Close contexts
  await hostContext.close();
  await guestContext.close();
});
