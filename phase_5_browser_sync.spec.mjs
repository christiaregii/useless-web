import { test, expect } from '@playwright/test';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test.use({
  launchOptions: {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  }
});

test.describe('Phase 5 — Web Playback Synchronization', () => {
    test('Two browsers synchronize play, pause, seek, and reverse direction', async ({ browser }) => {
        const hostContext = await browser.newContext();
        const guestContext = await browser.newContext();

        const hostPage = await hostContext.newPage();
        const guestPage = await guestContext.newPage();

        const webIndexPath = 'file://' + path.resolve(__dirname, 'web', 'index.html').replace(/\\/g, '/');

        await hostPage.goto(webIndexPath);
        await guestPage.goto(webIndexPath);

        // Load media in both pages via file input
        for (const p of [hostPage, guestPage]) {
            await p.evaluate(async () => {
                const dummyBytes = new Uint8Array([0x1A, 0x45, 0xDF, 0xA3, 0x93, 0x42, 0x82, 0x88, 0x6D, 0x61, 0x74, 0x72, 0x6F, 0x73, 0x6B, 0x61]);
                const testFile = new File([dummyBytes], 'sync-test.webm', { type: 'video/webm' });
                const fileInput = document.getElementById('file-input-hidden');
                const dataTransfer = new DataTransfer();
                dataTransfer.items.add(testFile);
                fileInput.files = dataTransfer.files;
                fileInput.dispatchEvent(new Event('change', { bubbles: true }));

                // Ensure localMovie duration is registered so isMovieLoaded() passes
                window.appState.set('localMovie', {
                    name: 'sync-test.webm',
                    duration: 120.0,
                    size: dummyBytes.byteLength
                });
            });
        }

        // 1. Host opens signaling modal and generates offer
        await hostPage.click('#btn-open-connect');
        await hostPage.click('#btn-host-create');

        await hostPage.waitForFunction(() => {
            const el = document.getElementById('host-offer-text');
            return el && el.value.trim().startsWith('WP1:');
        }, null, { timeout: 10000 });

        const offerToken = await hostPage.inputValue('#host-offer-text');

        // 2. Guest joins, enters offer, creates answer
        await guestPage.click('#btn-open-connect');
        await guestPage.click('#tab-guest');
        await guestPage.fill('#guest-offer-text', offerToken);
        await guestPage.click('#btn-guest-create-answer');

        await guestPage.waitForFunction(() => {
            const el = document.getElementById('guest-answer-text');
            return el && el.value.trim().startsWith('WP1:');
        }, null, { timeout: 10000 });

        const answerToken = await guestPage.inputValue('#guest-answer-text');

        // 3. Host confirms answer
        await hostPage.fill('#host-answer-text', answerToken);
        await hostPage.click('#btn-host-accept-answer');

        // Wait for connection
        await hostPage.waitForFunction(() => {
            const badge = document.getElementById('connection-status-text');
            return badge && badge.textContent.includes('P2P Connected');
        }, null, { timeout: 15000 });

        await guestPage.waitForFunction(() => {
            const badge = document.getElementById('connection-status-text');
            return badge && badge.textContent.includes('P2P Connected');
        }, null, { timeout: 15000 });

        // Unmute video so browsers allow play() without user gesture rejection
        for (const p of [hostPage, guestPage]) {
            await p.evaluate(() => {
                const v = document.getElementById('video-element');
                v.muted = true;
            });
        }

        // Test 1: Browser A plays -> Browser B receives play
        await hostPage.evaluate(() => {
            window.watchParty.video.onLocalPlay(5.0);
        });

        await guestPage.waitForFunction(() => {
            const v = document.getElementById('video-element');
            return v.currentTime >= 4.5;
        }, { timeout: 8000 });

        // Test 2: Browser A pauses -> Browser B pauses
        await hostPage.evaluate(() => {
            window.watchParty.video.onLocalPause(12.0);
        });

        await guestPage.waitForFunction(() => {
            const v = document.getElementById('video-element');
            return v.currentTime >= 11.5 && v.paused;
        }, { timeout: 5000 });

        // Test 3: Browser A seeks -> Browser B moves to timestamp
        await hostPage.evaluate(() => {
            window.watchParty.video.onLocalSeek(35.0);
        });

        await guestPage.waitForFunction(() => {
            const v = document.getElementById('video-element');
            return Math.abs(v.currentTime - 35.0) < 0.5;
        }, { timeout: 5000 });

        // Test 4: Reverse direction (Browser B control -> Browser A)
        await guestPage.evaluate(() => {
            window.watchParty.video.onLocalSeek(42.0);
        });

        await hostPage.waitForFunction(() => {
            const v = document.getElementById('video-element');
            return Math.abs(v.currentTime - 42.0) < 0.5;
        }, { timeout: 5000 });

        // Test 5: Verify no infinite loop / duplicate message cascades
        await hostPage.evaluate(() => {
            let count = 0;
            const origSend = window.watchParty.session.sendMessage.bind(window.watchParty.session);
            window.watchParty.session.sendMessage = (msg) => {
                count++;
                return origSend(msg);
            };
            window.testSendCount = () => count;
            return true;
        });

        // Browser B sends a play event
        await guestPage.evaluate(() => {
            window.watchParty.video.onLocalPlay(50.0);
        });

        // Wait a moment to ensure no ping-pong echo loops happen
        await hostPage.waitForTimeout(500);
        const aSentAfterRemote = await hostPage.evaluate(() => window.testSendCount());
        expect(aSentAfterRemote).toBe(0);

        // Test 6: Ready handshake verification
        await hostPage.click('#btn-ready');
        await guestPage.click('#btn-ready');

        // Both ready should initiate countdown overlay
        await hostPage.waitForFunction(() => {
            const cd = document.getElementById('countdown-overlay');
            return cd && !cd.classList.contains('hidden');
        }, { timeout: 8000 });

        await guestPage.waitForFunction(() => {
            const cd = document.getElementById('countdown-overlay');
            return cd && !cd.classList.contains('hidden');
        }, { timeout: 8000 });

        await hostContext.close();
        await guestContext.close();
    });
});
