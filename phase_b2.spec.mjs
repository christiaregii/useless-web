import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.use({
  launchOptions: {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  }
});

test('Phase B2 Playback Synchronization Acceptance Test', async ({ page }) => {
  const filePath = 'file://' + path.resolve(__dirname, 'renderer', 'index.html').replace(/\\/g, '/');
  await page.goto(filePath);

  const result = await page.evaluate(async () => {
    const logs = [];
    function log(m) { logs.push(m); }

    log('1. Setting up Host and Guest SessionManagers & SyncEngines...');
    const hostSession = new window.SessionManager();
    const guestSession = new window.SessionManager();

    const hostSync = new window.SyncEngine(hostSession);
    const guestSync = new window.SyncEngine(guestSession);

    // Track remote events received on each peer
    const hostEvents = [];
    const guestEvents = [];

    // Counters to verify loop prevention
    let hostOutMessageCount = 0;
    let guestOutMessageCount = 0;

    // Track raw message sends to detect infinite loops
    const origHostSend = hostSession.sendMessage.bind(hostSession);
    hostSession.sendMessage = (msg) => {
      hostOutMessageCount++;
      return origHostSend(msg);
    };

    const origGuestSend = guestSession.sendMessage.bind(guestSession);
    guestSession.sendMessage = (msg) => {
      guestOutMessageCount++;
      return origGuestSend(msg);
    };

    // When remote events arrive at Guest, simulate media player behavior (which might invoke local handlers if poorly guarded)
    guestSync.onRemotePlay = (ts) => {
      guestEvents.push({ type: 'play', ts });
      // Verify that calling localPlay during remote processing does NOT send an outgoing message
      guestSync.localPlay(ts);
    };
    guestSync.onRemotePause = (ts) => {
      guestEvents.push({ type: 'pause', ts });
      guestSync.localPause(ts);
    };
    guestSync.onRemoteSeek = (ts) => {
      guestEvents.push({ type: 'seek', ts });
      guestSync.localSeek(ts);
    };

    // When remote events arrive at Host, simulate media player behavior
    hostSync.onRemotePlay = (ts) => {
      hostEvents.push({ type: 'play', ts });
      hostSync.localPlay(ts);
    };
    hostSync.onRemotePause = (ts) => {
      hostEvents.push({ type: 'pause', ts });
      hostSync.localPause(ts);
    };
    hostSync.onRemoteSeek = (ts) => {
      hostEvents.push({ type: 'seek', ts });
      hostSync.localSeek(ts);
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
    log('WebRTC connection established.');

    // Helper to wait for a condition
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

    // --- TEST 1: Play on Host (A) affects Guest (B) ---
    log('3. Test: Host calls localPlay(12.5)...');
    hostSync.localPlay(12.5);
    await waitFor(() => guestEvents.some(e => e.type === 'play' && Math.abs(e.ts - 12.5) < 0.01));
    log('Guest received play at 12.5');

    // --- TEST 2: Pause on Host (A) affects Guest (B) ---
    log('4. Test: Host calls localPause(45.2)...');
    hostSync.localPause(45.2);
    await waitFor(() => guestEvents.some(e => e.type === 'pause' && Math.abs(e.ts - 45.2) < 0.01));
    log('Guest received pause at 45.2');

    // --- TEST 3: Seek debouncing & seek on Host (A) affects Guest (B) ---
    log('5. Test: Host simulates slider dragging (seek 100, 101, 102, 105)...');
    const hostSendsBeforeSeek = hostOutMessageCount;
    hostSync.localSeek(100);
    hostSync.localSeek(101);
    hostSync.localSeek(102);
    hostSync.localSeek(105); // Only 105 should be sent after debounce

    await waitFor(() => guestEvents.some(e => e.type === 'seek' && Math.abs(e.ts - 105) < 0.01), 4000);
    log('Guest received final seek position 105');
    // Only 1 seek message should have been sent despite 4 seek calls
    const seeksSent = hostOutMessageCount - hostSendsBeforeSeek;
    log('Number of seek messages sent for 4 drag events: ' + seeksSent);

    // --- TEST 4: Reverse direction (Guest B affects Host A) ---
    log('6. Test: Guest calls localPlay(200.0)...');
    guestSync.localPlay(200.0);
    await waitFor(() => hostEvents.some(e => e.type === 'play' && Math.abs(e.ts - 200.0) < 0.01));
    log('Host received play at 200.0 from Guest');

    log('7. Test: Guest calls localPause(205.5)...');
    guestSync.localPause(205.5);
    await waitFor(() => hostEvents.some(e => e.type === 'pause' && Math.abs(e.ts - 205.5) < 0.01));
    log('Host received pause at 205.5 from Guest');

    log('8. Test: Guest calls localSeek(350.0)...');
    guestSync.localSeek(350.0);
    await waitFor(() => hostEvents.some(e => e.type === 'seek' && Math.abs(e.ts - 350.0) < 0.01), 4000);
    log('Host received seek at 350.0 from Guest');

    // --- TEST 5: Loop prevention check ---
    log('9. Checking message count for infinite loop detection...');
    // We expect bounded message counts:
    // Host initiated: play (1) + pause (1) + debounced seek (1) = 3 messages
    // Guest initiated: play (1) + pause (1) + debounced seek (1) = 3 messages
    // Zero echoed bounce messages!
    log('Host total messages sent: ' + hostOutMessageCount);
    log('Guest total messages sent: ' + guestOutMessageCount);

    const noLoops = hostOutMessageCount <= 4 && guestOutMessageCount <= 4;
    log('Loop prevention passed: ' + noLoops);

    hostSession.closeConnection();
    guestSession.closeConnection();

    return {
      success: true,
      logs,
      hostEvents,
      guestEvents,
      seeksSent,
      noLoops,
      hostOutMessageCount,
      guestOutMessageCount
    };
  });

  console.log('\n--- PHASE B2 ACCEPTANCE TEST LOGS ---');
  console.log(result.logs.join('\n'));
  console.log('--- END LOGS ---\n');

  expect(result.success).toBe(true);
  expect(result.seeksSent).toBe(1);
  expect(result.noLoops).toBe(true);
  expect(result.guestEvents.length).toBe(3);
  expect(result.hostEvents.length).toBe(3);
});
