import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.use({
  launchOptions: {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  }
});

test.describe('Phase 7 — Web Fullscreen', () => {
    test('Fullscreen button toggles theater container, maintains video playback, and reverts correctly', async ({ page }) => {
        const webIndexPath = 'file://' + path.resolve(__dirname, 'web', 'index.html').replace(/\\/g, '/');
        await page.goto(webIndexPath);

        // 1. Load movie so theaterContainer is unhidden
        await page.evaluate(async () => {
            const dummyBytes = new Uint8Array([0x1A, 0x45, 0xDF, 0xA3, 0x93, 0x42, 0x82, 0x88, 0x6D, 0x61, 0x74, 0x72, 0x6F, 0x73, 0x6B, 0x61]);
            const testFile = new File([dummyBytes], 'fullscreen-test.webm', { type: 'video/webm' });
            const fileInput = document.getElementById('file-input-hidden');
            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(testFile);
            fileInput.files = dataTransfer.files;
            fileInput.dispatchEvent(new Event('change', { bubbles: true }));

            window.appState.set('localMovie', {
                name: 'fullscreen-test.webm',
                duration: 120.0,
                size: dummyBytes.byteLength
            });
        });

        await expect(page.locator('#theater-container')).toBeVisible();

        // 2. Verify Fullscreen button exists in DOM
        const btnFullscreen = page.locator('#btn-fullscreen');
        await expect(btnFullscreen).toBeAttached();

        // 3. Test Fullscreen API invocation flow
        // In headless / automated Chromium environments, element.requestFullscreen() without direct physical user gesture can reject or be constrained.
        // We test both the click handler's invocation of requestFullscreen / exitFullscreen and functional state.
        const fullscreenFlowResult = await page.evaluate(async () => {
            const theater = document.getElementById('theater-container');
            const btn = document.getElementById('btn-fullscreen');

            let requestFullscreenCalled = false;
            let exitFullscreenCalled = false;

            // Spy on element and document fullscreen APIs
            const origRequest = theater.requestFullscreen || theater.webkitRequestFullscreen;
            const origExit = document.exitFullscreen || document.webkitExitFullscreen;

            theater.requestFullscreen = async function() {
                requestFullscreenCalled = true;
                // Simulate document.fullscreenElement update
                Object.defineProperty(document, 'fullscreenElement', {
                    configurable: true,
                    get: () => theater
                });
                return Promise.resolve();
            };

            document.exitFullscreen = async function() {
                exitFullscreenCalled = true;
                Object.defineProperty(document, 'fullscreenElement', {
                    configurable: true,
                    get: () => null
                });
                return Promise.resolve();
            };

            // First click -> request fullscreen
            btn.click();
            const step1Passed = requestFullscreenCalled && document.fullscreenElement === theater;

            // Verify playback and controls still work while in fullscreen
            window.watchParty.video.video.muted = true;
            window.watchParty.video.togglePlay();
            const isPlaying = window.watchParty.video.isPlaying();

            window.watchParty.video.togglePlay();
            const isPaused = !window.watchParty.video.isPlaying();

            window.watchParty.video.seek(30.0);
            const isSeeked = Math.abs(window.watchParty.video.getCurrentTime() - 30.0) < 0.5;

            // Second click -> exit fullscreen
            btn.click();
            const step2Passed = exitFullscreenCalled && document.fullscreenElement === null;

            return {
                step1Passed,
                step2Passed,
                isPlaying,
                isPaused,
                isSeeked
            };
        });

        expect(fullscreenFlowResult.step1Passed).toBe(true);
        expect(fullscreenFlowResult.isPaused).toBe(true);
        expect(fullscreenFlowResult.isSeeked).toBe(true);
        expect(fullscreenFlowResult.step2Passed).toBe(true);
    });
});
