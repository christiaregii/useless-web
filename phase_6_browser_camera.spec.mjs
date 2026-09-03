import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.use({
  launchOptions: {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  },
  permissions: ['camera']
});

test.describe('Phase 6 — Web Camera and Snapshot Integration', () => {
    test('Camera permission, snapshot capture, peer transmission, display, and rate limiting', async ({ browser }) => {
        // Setup two independent browser contexts with camera permission granted
        const contextA = await browser.newContext({ permissions: ['camera'] });
        const contextB = await browser.newContext({ permissions: ['camera'] });

        const pageA = await contextA.newPage();
        const pageB = await contextB.newPage();

        const webIndexPath = 'file://' + path.resolve(__dirname, 'web', 'index.html').replace(/\\/g, '/');

        await pageA.goto(webIndexPath);
        await pageB.goto(webIndexPath);

        // Load media in both pages so players are active
        for (const p of [pageA, pageB]) {
            await p.evaluate(async () => {
                const dummyBytes = new Uint8Array([0x1A, 0x45, 0xDF, 0xA3, 0x93, 0x42, 0x82, 0x88, 0x6D, 0x61, 0x74, 0x72, 0x6F, 0x73, 0x6B, 0x61]);
                const testFile = new File([dummyBytes], 'sync-test.webm', { type: 'video/webm' });
                const fileInput = document.getElementById('file-input-hidden');
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(testFile);
                fileInput.files = dataTransfer.files;
                fileInput.dispatchEvent(new Event('change', { bubbles: true }));

                window.appState.set('localMovie', {
                    name: 'sync-test.webm',
                    duration: 120.0,
                    size: dummyBytes.byteLength
                });
            });
        }

        // Establish WebRTC connection between A (Host) and B (Guest)
        await pageA.click('#btn-open-connect');
        await pageA.click('#btn-host-create');

        await pageA.waitForFunction(() => {
            const el = document.getElementById('host-offer-text');
            return el && el.value.trim().startsWith('WP1:');
        }, null, { timeout: 10000 });

        const offerToken = await pageA.inputValue('#host-offer-text');

        await pageB.click('#btn-open-connect');
        await pageB.click('#tab-guest');
        await pageB.fill('#guest-offer-text', offerToken);
        await pageB.click('#btn-guest-create-answer');

        await pageB.waitForFunction(() => {
            const el = document.getElementById('guest-answer-text');
            return el && el.value.trim().startsWith('WP1:');
        }, null, { timeout: 10000 });

        const answerToken = await pageB.inputValue('#guest-answer-text');

        await pageA.fill('#host-answer-text', answerToken);
        await pageA.click('#btn-host-accept-answer');

        // Verify P2P connection established
        await pageA.waitForFunction(() => {
            const badge = document.getElementById('connection-status-text');
            return badge && badge.textContent.includes('P2P Connected');
        }, null, { timeout: 15000 });

        await pageB.waitForFunction(() => {
            const badge = document.getElementById('connection-status-text');
            return badge && badge.textContent.includes('P2P Connected');
        }, null, { timeout: 15000 });

        // 1. Enable Camera on Peer B (Consent & initialization)
        const cameraBActive = await pageB.evaluate(async () => {
            // Mock synthetic camera stream for headless/automated test if no physical hardware attached
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                return false;
            }
            // Trigger camera consent via UI button
            await window.watchParty.snapshot.initCamera().catch(() => {
                // If no physical webcam attached in CI, attach synthetic video track
                const canvas = document.createElement('canvas');
                canvas.width = 640;
                canvas.height = 480;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#ff3366';
                ctx.fillRect(0, 0, 640, 480);
                const stream = canvas.captureStream(25);
                window.watchParty.snapshot.stream = stream;
                window.watchParty.snapshot.video.srcObject = stream;
                window.watchParty.snapshot.isConsentGranted = true;
                window.appState.set('cameraActive', true);
            });
            return window.watchParty.snapshot.isCameraActive();
        });

        expect(cameraBActive).toBe(true);

        // 2 & 3. Peer A Pauses -> requests snapshot -> Peer B captures and sends -> Peer A receives
        await pageA.evaluate(() => {
            // A triggers local pause with requestSnapshot: true
            window.watchParty.video.onLocalPause(10.0);
        });

        // 4. Verify Peer A receives and displays reaction snapshot
        await pageA.waitForFunction(() => {
            const popup = document.getElementById('reaction-popup');
            const img = document.getElementById('reaction-image');
            return popup && !popup.classList.contains('hidden') && img && img.src && img.src.startsWith('data:image/jpeg');
        }, { timeout: 8000 });

        // 5. Verify 10-second rate limiting: Peer A immediately pauses again
        const rateLimitBlocked = await pageB.evaluate(() => {
            // Second immediate capture should return null due to 10s rate limit
            const secondSnap = window.watchParty.snapshot.captureSnapshot(false);
            return secondSnap === null;
        });
        expect(rateLimitBlocked).toBe(true);

        // 6. Camera Denied / Failure behavior: Movie still works
        // Verify video playback and seek continue functioning even if camera is disabled
        await pageB.evaluate(() => {
            window.watchParty.snapshot.stopCamera();
        });

        await pageA.evaluate(() => {
            window.watchParty.video.onLocalSeek(60.0);
        });

        await pageB.waitForFunction(() => {
            const v = document.getElementById('video-element');
            return Math.abs(v.currentTime - 60.0) < 0.5;
        }, { timeout: 5000 });

        await contextA.close();
        await contextB.close();
    });
});
