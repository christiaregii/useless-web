import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.use({
  launchOptions: {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  }
});

test('Phase B4 Snapshot Transmission Acceptance Test', async ({ page }) => {
  const filePath = 'file://' + path.resolve(__dirname, 'renderer', 'index.html').replace(/\\/g, '/');
  await page.goto(filePath);

  const result = await page.evaluate(async () => {
    const logs = [];
    function log(m) { logs.push(m); }

    log('1. Setting up Host (A) and Guest (B) SessionManagers & SyncEngines...');
    const hostSession = new window.SessionManager();
    const guestSession = new window.SessionManager();

    const hostSync = new window.SyncEngine(hostSession);
    const guestSync = new window.SyncEngine(guestSession);

    // Track snapshot flow
    let guestSnapshotRequestedFired = false;
    let hostReceivedSnapshot = null;
    let guestSnapshotSuppliedCount = 0;

    // A mock 640x480 compressed JPEG data URL (small test payload)
    const mock640x480Jpeg = 'data:image/jpeg;base64,' + 'A'.repeat(800);

    // B provides captureSnapshot implementation
    guestSync.captureSnapshot = () => {
      guestSnapshotSuppliedCount++;
      log(`Guest captureSnapshot called (count: ${guestSnapshotSuppliedCount})`);
      return mock640x480Jpeg;
    };

    guestSync.onSnapshotRequested = () => {
      guestSnapshotRequestedFired = true;
      log('Guest received onSnapshotRequested!');
    };

    // A receives the image
    hostSync.onRemoteSnapshot = (imageDataUrl) => {
      hostReceivedSnapshot = imageDataUrl;
      log(`Host onRemoteSnapshot received! Length: ${imageDataUrl.length}`);
    };

    log('2. Establishing WebRTC connection...');
    const offer = await hostSession.createHostSession();
    const answer = await guestSession.setRemoteOffer(offer);
    await hostSession.setRemoteAnswer(answer);

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Connection timeout')), 8000);
      const interval = setInterval(() => {
        if (hostSession.getConnectionState() === 'connected' && guestSession.getConnectionState() === 'connected') {
          clearInterval(interval);
          clearTimeout(timeout);
          resolve();
        }
      }, 50);
    });
    log('WebRTC DataChannel connected.');

    const waitFor = (fn, timeoutMs = 4000) => {
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Wait timeout: ' + fn.toString())), timeoutMs);
        const check = setInterval(() => {
          if (fn()) {
            clearInterval(check);
            clearTimeout(timeout);
            resolve();
          }
        }, 50);
      });
    };

    // --- TEST 1: Full Flow: A pauses -> B requests snapshot -> B supplies -> B sends -> A receives ---
    log('3. Test: Peer A pauses with requestSnapshot: true...');
    hostSync.localPause(120.0, true);

    await waitFor(() => guestSnapshotRequestedFired);
    log('Peer B successfully received snapshot request event.');

    await waitFor(() => hostReceivedSnapshot !== null);
    log('Peer A successfully received the partner snapshot image over DataChannel!');
    const imageMatches = hostReceivedSnapshot === mock640x480Jpeg;
    log(`Image data matches expected mock: ${imageMatches}`);

    // --- TEST 2: Rate Limiting (10 seconds) ---
    log('4. Test: Verifying snapshot rate limiting (10-second rule)...');
    // B attempts to send another snapshot immediately
    const immediateSendResult = guestSync.sendSnapshotImage(mock640x480Jpeg);
    log(`Immediate subsequent send returned: ${immediateSendResult} (expected: false)`);

    // Reset host received
    hostReceivedSnapshot = null;

    // Simulate another pause immediately
    hostSync.localPause(122.0, true);
    await new Promise(r => setTimeout(r, 600));

    log(`Host received snapshot during cooldown: ${hostReceivedSnapshot !== null} (expected: false)`);
    const rateLimitBlocked = immediateSendResult === false && hostReceivedSnapshot === null;
    log(`Rate-limiting successfully protected WebRTC channel: ${rateLimitBlocked}`);

    // --- TEST 3: Verify rate-limit expiry ---
    log('5. Test: Simulating rate-limit cooldown expiry (advancing lastSnapshotSentTime)...');
    guestSync.lastSnapshotSentTime = Date.now() - 11000; // 11s ago
    const afterCooldownSendResult = guestSync.sendSnapshotImage(mock640x480Jpeg);
    log(`Send after cooldown returned: ${afterCooldownSendResult} (expected: true)`);

    await waitFor(() => hostReceivedSnapshot !== null);
    log('Host received snapshot after cooldown successfully!');

    hostSession.closeConnection();
    guestSession.closeConnection();

    return {
      success: true,
      logs,
      guestSnapshotRequestedFired,
      imageMatches,
      rateLimitBlocked,
      afterCooldownSendResult
    };
  });

  console.log('\n--- PHASE B4 ACCEPTANCE TEST LOGS ---');
  console.log(result.logs.join('\n'));
  console.log('--- END LOGS ---\n');

  expect(result.success).toBe(true);
  expect(result.guestSnapshotRequestedFired).toBe(true);
  expect(result.imageMatches).toBe(true);
  expect(result.rateLimitBlocked).toBe(true);
  expect(result.afterCooldownSendResult).toBe(true);
});
