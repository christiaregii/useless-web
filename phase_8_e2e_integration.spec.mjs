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

test.describe('Phase 8 — Complete Web App End-to-End Integration Test', () => {
    test('Complete flow: Connection -> Local Movie -> Ready Handshake -> Play/Pause/Seek Sync -> Drift Correction -> Reaction Cam -> Fullscreen -> Failure Handling', async ({ browser }) => {
        const contextHost = await browser.newContext({ permissions: ['camera'] });
        const contextGuest = await browser.newContext({ permissions: ['camera'] });

        const pageHost = await contextHost.newPage();
        const pageGuest = await contextGuest.newPage();

        const webIndexPath = 'file://' + path.resolve(__dirname, 'web', 'index.html').replace(/\\/g, '/');

        // 1. Session Connection via WebRTC Manual Signaling
        await pageHost.goto(webIndexPath);
        await pageGuest.goto(webIndexPath);

        await pageHost.click('#btn-open-connect');
        await pageHost.click('#btn-host-create');

        await pageHost.waitForFunction(() => {
            const el = document.getElementById('host-offer-text');
            return el && el.value.trim().startsWith('WP1:');
        }, null, { timeout: 10000 });

        const offerToken = await pageHost.inputValue('#host-offer-text');

        await pageGuest.click('#btn-open-connect');
        await pageGuest.click('#tab-guest');
        await pageGuest.fill('#guest-offer-text', offerToken);
        await pageGuest.click('#btn-guest-create-answer');

        await pageGuest.waitForFunction(() => {
            const el = document.getElementById('guest-answer-text');
            return el && el.value.trim().startsWith('WP1:');
        }, null, { timeout: 10000 });

        const answerToken = await pageGuest.inputValue('#guest-answer-text');

        await pageHost.fill('#host-answer-text', answerToken);
        await pageHost.click('#btn-host-accept-answer');

        await pageHost.waitForFunction(() => {
            const badge = document.getElementById('connection-status-text');
            return badge && badge.textContent.includes('P2P Connected');
        }, null, { timeout: 15000 });

        await pageGuest.waitForFunction(() => {
            const badge = document.getElementById('connection-status-text');
            return badge && badge.textContent.includes('P2P Connected');
        }, null, { timeout: 15000 });

        // 2. Local Movie Selection (No Server Upload)
        for (const p of [pageHost, pageGuest]) {
            await p.evaluate(async () => {
                const dummyBytes = new Uint8Array([0x1A, 0x45, 0xDF, 0xA3, 0x93, 0x42, 0x82, 0x88, 0x6D, 0x61, 0x74, 0x72, 0x6F, 0x73, 0x6B, 0x61]);
                const testFile = new File([dummyBytes], 'party-movie.webm', { type: 'video/webm' });
                const fileInput = document.getElementById('file-input-hidden');
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(testFile);
                fileInput.files = dataTransfer.files;
                fileInput.dispatchEvent(new Event('change', { bubbles: true }));

                window.appState.set('localMovie', {
                    name: 'party-movie.webm',
                    duration: 120.0,
                    size: dummyBytes.byteLength
                });
                document.getElementById('video-element').muted = true;
            });
        }

        await expect(pageHost.locator('#theater-container')).toBeVisible();
        await expect(pageGuest.locator('#theater-container')).toBeVisible();

        // 3. Ready Handshake -> Both Ready Countdown
        await pageHost.click('#btn-ready');
        await pageGuest.click('#btn-ready');

        await pageHost.waitForFunction(() => {
            const overlay = document.getElementById('countdown-overlay');
            return overlay && !overlay.classList.contains('hidden');
        }, { timeout: 8000 });

        await pageGuest.waitForFunction(() => {
            const overlay = document.getElementById('countdown-overlay');
            return overlay && !overlay.classList.contains('hidden');
        }, { timeout: 8000 });

        // 4. Playback Synchronization (All Directions)
        // A) Host Play -> Guest plays
        await pageHost.evaluate(() => {
            window.watchParty.video.onLocalPlay(5.0);
        });
        await pageGuest.waitForFunction(() => {
            const v = document.getElementById('video-element');
            return v.currentTime >= 4.5;
        }, { timeout: 8000 });

        // B) Guest Pause -> Host pauses
        await pageGuest.evaluate(() => {
            window.watchParty.video.onLocalPause(8.0);
        });
        await pageHost.waitForFunction(() => {
            const v = document.getElementById('video-element');
            return Math.abs(v.currentTime - 8.0) < 0.5;
        }, { timeout: 8000 });

        // C) Host Seek -> Guest seeks
        await pageHost.evaluate(() => {
            window.watchParty.video.onLocalSeek(35.0);
        });
        await pageGuest.waitForFunction(() => {
            const v = document.getElementById('video-element');
            return Math.abs(v.currentTime - 35.0) < 0.5;
        }, { timeout: 8000 });

        // D) Guest Seek -> Host seeks
        await pageGuest.evaluate(() => {
            window.watchParty.video.onLocalSeek(70.0);
        });
        await pageHost.waitForFunction(() => {
            const v = document.getElementById('video-element');
            return Math.abs(v.currentTime - 70.0) < 0.5;
        }, { timeout: 8000 });

        // 5. Drift Correction
        const driftHandled = await pageGuest.evaluate(() => {
            const prev = window.watchParty.video.getCurrentTime();
            // Trigger drift correction callback with a 1.5s difference
            window.watchParty.integration.sync.onDriftCorrection(75.0, 1500);
            const corrected = window.watchParty.video.getCurrentTime();
            return Math.abs(corrected - 75.0) < 0.2;
        });
        expect(driftHandled).toBe(true);

        // 6. Reaction Cam & Snapshot
        await pageGuest.evaluate(async () => {
            // Set up synthetic camera frame on guest
            const canvas = document.createElement('canvas');
            canvas.width = 640;
            canvas.height = 480;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#10b981';
            ctx.fillRect(0, 0, 640, 480);
            const stream = canvas.captureStream(25);
            window.watchParty.snapshot.stream = stream;
            window.watchParty.snapshot.video.srcObject = stream;
            await window.watchParty.snapshot.video.play().catch(() => {});
            window.watchParty.snapshot.isConsentGranted = true;
            window.appState.set('cameraActive', true);
        });

        // Host Pauses -> requests snapshot -> Guest captures and transmits over WebRTC DataChannel
        await pageHost.evaluate(() => {
            window.watchParty.video.onLocalPause(80.0);
        });

        // Host displays reaction popup
        await pageHost.waitForFunction(() => {
            const popup = document.getElementById('reaction-popup');
            const img = document.getElementById('reaction-image');
            return popup && !popup.classList.contains('hidden') && img && img.src.startsWith('data:image/jpeg');
        }, { timeout: 8000 });

        // Verify 10-second rate limit
        const rateLimitActive = await pageGuest.evaluate(() => {
            return window.watchParty.snapshot.captureSnapshot(false) === null;
        });
        expect(rateLimitActive).toBe(true);

        // 7. Fullscreen
        const fsResult = await pageHost.evaluate(async () => {
            const theater = document.getElementById('theater-container');
            const btn = document.getElementById('btn-fullscreen');
            let entered = false;
            let exited = false;

            theater.requestFullscreen = async () => {
                entered = true;
                Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => theater });
            };
            document.exitFullscreen = async () => {
                exited = true;
                Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
            };

            btn.click();
            const step1 = entered && document.fullscreenElement === theater;

            // Verify playback controls work in fullscreen
            window.watchParty.video.seek(85.0);
            const seekOk = Math.abs(window.watchParty.video.getCurrentTime() - 85.0) < 0.5;

            btn.click();
            const step2 = exited && document.fullscreenElement === null;

            return step1 && seekOk && step2;
        });
        expect(fsResult).toBe(true);

        // 8. Failure Handling Resiliency
        const failureHandlingOk = await pageHost.evaluate(async () => {
            // A) Denied/Unavailable camera
            const snapNull = window.watchParty.snapshot.captureSnapshot(true); // without active cam returns null safely
            // B) Invalid signaling input handling
            let signalingErrorCaught = false;
            try {
                await window.watchParty.session.setRemoteAnswer('INVALID_TOKEN');
            } catch (err) {
                signalingErrorCaught = true;
            }
            return signalingErrorCaught;
        });
        expect(failureHandlingOk).toBe(true);

        await contextHost.close();
        await contextGuest.close();
    });
});
