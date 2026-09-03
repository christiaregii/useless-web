import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.use({
  launchOptions: {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  }
});

test('Phase B1 WebRTC Manual Signaling Acceptance Test', async ({ page }) => {
  const filePath = 'file://' + path.resolve(__dirname, 'renderer', 'index.html').replace(/\\/g, '/');
  await page.goto(filePath);

  const result = await page.evaluate(async () => {
    const logs = [];
    function log(m) { logs.push(m); }

    log('1. Instantiating Host and Guest SessionManagers...');
    const host = new window.SessionManager();
    const guest = new window.SessionManager();

    log('2. Host generates offer...');
    const offer = await host.createHostSession();
    log('Offer generated with length ' + offer.length);

    log('3. Guest imports offer & generates answer...');
    const answer = await guest.setRemoteOffer(offer);
    log('Answer generated with length ' + answer.length);

    log('4. Host imports answer...');
    await host.setRemoteAnswer(answer);

    log('5. Awaiting RTCDataChannel open state...');
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('RTCDataChannel timeout')), 10000);
      const interval = setInterval(() => {
        if (host.getConnectionState() === 'connected' && guest.getConnectionState() === 'connected') {
          clearInterval(interval);
          clearTimeout(timeout);
          resolve();
        }
      }, 100);
    });

    log('6. Data channel open on both Host and Guest! Testing message transmission...');
    const msgPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Guest onMessage timeout')), 5000);
      guest.onMessage((msg) => {
        if (msg.greeting === 'hello') {
          clearTimeout(timeout);
          resolve(msg);
        }
      });
    });

    log('7. Host sends message: { type: "control", greeting: "hello" }');
    host.sendMessage({ type: 'control', greeting: 'hello' });

    const received = await msgPromise;
    log('8. Guest successfully received message: ' + JSON.stringify(received));

    host.closeConnection();
    guest.closeConnection();

    return { success: true, logs, received };
  });

  console.log('\n--- ACCEPTANCE TEST LOGS ---');
  console.log(result.logs.join('\n'));
  console.log('--- END LOGS ---\n');

  expect(result.success).toBe(true);
  expect(result.received.greeting).toBe('hello');
});
