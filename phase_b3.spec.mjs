import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.use({
  launchOptions: {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  }
});

test('Phase B3 Ready Handshake and Drift Correction Acceptance Test', async ({ page }) => {
  const filePath = 'file://' + path.resolve(__dirname, 'renderer', 'index.html').replace(/\\/g, '/');
  await page.goto(filePath);

  const result = await page.evaluate(async () => {
    const logs = [];
    function log(m) { logs.push(m); }

    log('1. Instantiating Host and Guest sessions & SyncEngines...');
    const hostSession = new window.SessionManager();
    const guestSession = new window.SessionManager();

    const hostSync = new window.SyncEngine(hostSession);
    const guestSync = new window.SyncEngine(guestSession);

    // Track both_ready events
    let hostSawBothReady = false;
    let guestSawBothReady = false;

    hostSync.onBothReady = () => {
      hostSawBothReady = true;
      log('Host detected both_ready!');
    };

    guestSync.onBothReady = () => {
      guestSawBothReady = true;
      log('Guest detected both_ready!');
    };

    // Simulated playback positions
    let hostPosition = 50.0;
    let guestPosition = 50.0;

    hostSync.getCurrentPlaybackTime = () => hostPosition;
    guestSync.getCurrentPlaybackTime = () => guestPosition;

    // Track drift corrections
    const hostCorrections = [];
    const guestCorrections = [];

    hostSync.onDriftCorrection = (targetTs, driftMs) => {
      hostCorrections.push({ targetTs, driftMs });
      log(`Host drift correction received: target=${targetTs}, drift=${driftMs}ms`);
      // Simulate applying correction
      hostPosition = targetTs;
    };

    guestSync.onDriftCorrection = (targetTs, driftMs) => {
      guestCorrections.push({ targetTs, driftMs });
      log(`Guest drift correction received: target=${targetTs}, drift=${driftMs}ms`);
      guestPosition = targetTs;
    };

    log('2. Establishing WebRTC P2P connection...');
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
    log('WebRTC connected.');

    const waitFor = (fn, timeoutMs = 3000) => {
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

    // --- TEST 1: Ready Handshake ---
    log('3. Test: Host reports ready...');
    hostSync.setLocalReady(true);
    await waitFor(() => guestSync.remoteReady === true);
    log('Guest acknowledged host is ready.');
    log(`Both ready before guest ready: Host=${hostSawBothReady}, Guest=${guestSawBothReady}`);

    log('4. Test: Guest reports ready...');
    guestSync.setLocalReady(true);
    await waitFor(() => hostSync.remoteReady === true);
    await waitFor(() => hostSawBothReady && guestSawBothReady);
    log('Both peers successfully transitioned to both_ready state!');

    // --- TEST 2: Minor Drift (< 300ms) -> No correction ---
    log('5. Test: Simulating minor drift of 150ms (Host: 50.0s, Guest: 50.15s)...');
    hostPosition = 50.0;
    guestPosition = 50.15; // 150ms drift (< 300ms)

    hostSync.sendSyncRequest();
    // Wait brief period for response exchange
    await new Promise(r => setTimeout(r, 400));

    log(`Host corrections with 150ms drift: ${hostCorrections.length}`);
    log(`Guest corrections with 150ms drift: ${guestCorrections.length}`);
    const minorDriftIgnored = hostCorrections.length === 0 && guestCorrections.length === 0;
    log(`Minor drift ignored (no unnecessary seek): ${minorDriftIgnored}`);

    // --- TEST 3: Artificial Large Drift (>= 300ms) -> Correction Issued ---
    log('6. Test: Simulating artificial large drift of 1200ms (Host: 50.0s, Guest: 51.2s)...');
    hostPosition = 50.0;
    guestPosition = 51.2; // 1200ms drift (>= 300ms)

    guestSync.sendSyncRequest();
    await waitFor(() => hostCorrections.length > 0 || guestCorrections.length > 0, 4000);

    const correctionTriggered = hostCorrections.length > 0 || guestCorrections.length > 0;
    log(`Drift correction successfully issued: ${correctionTriggered}`);

    hostSync.stopPeriodicSync();
    guestSync.stopPeriodicSync();
    hostSession.closeConnection();
    guestSession.closeConnection();

    return {
      success: true,
      logs,
      hostSawBothReady,
      guestSawBothReady,
      minorDriftIgnored,
      correctionTriggered,
      hostCorrections,
      guestCorrections
    };
  });

  console.log('\n--- PHASE B3 ACCEPTANCE TEST LOGS ---');
  console.log(result.logs.join('\n'));
  console.log('--- END LOGS ---\n');

  expect(result.success).toBe(true);
  expect(result.hostSawBothReady).toBe(true);
  expect(result.guestSawBothReady).toBe(true);
  expect(result.minorDriftIgnored).toBe(true);
  expect(result.correctionTriggered).toBe(true);
});
