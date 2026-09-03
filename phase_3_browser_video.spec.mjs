import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test.use({
  launchOptions: {
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  }
});

test('Phase 3 Browser Local Video Selection and Playback Test', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (err) => {
    errors.push(err.message);
  });

  const webIndexPath = 'file://' + path.resolve(__dirname, 'web', 'index.html').replace(/\\/g, '/');
  console.log('Loading web shell at:', webIndexPath);
  await page.goto(webIndexPath);

  // 1. Initial State: Dropzone visible, theater container hidden
  await expect(page.locator('#empty-dropzone')).toBeVisible();
  await expect(page.locator('#theater-container')).toHaveClass(/hidden/);

  // 2. Select a local video via the file input
  console.log('Simulating local video file selection...');
  await page.evaluate(async () => {
    // Generate dummy video bytes
    const dummyBytes = new Uint8Array([0x1A, 0x45, 0xDF, 0xA3, 0x93, 0x42, 0x82, 0x88, 0x6D, 0x61, 0x74, 0x72, 0x6F, 0x73, 0x6B, 0x61]);
    const testFile = new File([dummyBytes], 'my-test-movie.webm', { type: 'video/webm' });

    // Directly load via videoController / integration loadSource
    const fileInput = document.getElementById('file-input-hidden');
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(testFile);
    fileInput.files = dataTransfer.files;

    fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // 3. Verify Video Loads and UI transitions
  await expect(page.locator('#empty-dropzone')).toHaveClass(/hidden/);
  await expect(page.locator('#theater-container')).toBeVisible();
  await expect(page.locator('#movie-meta-bar')).toBeVisible();
  await expect(page.locator('#local-movie-name')).toHaveText('my-test-movie.webm');
  await expect(page.locator('#movie-match-badge')).toHaveText('Local Only');

  // 4. Verify Play, Pause, and Seek controls work locally
  const playbackStatus = await page.evaluate(() => {
    const videoCtrl = window.watchParty.video;
    const videoEl = videoCtrl.video;

    // Check object URL creation (no server upload)
    const isBlobUrl = videoEl.src && videoEl.src.startsWith('blob:');

    // Test Play
    videoCtrl.togglePlay();
    const playAttempted = !videoEl.paused || videoCtrl.isPlaying() !== undefined;

    // Test Pause
    videoCtrl.video.pause();
    const paused = videoEl.paused;

    // Test Seek
    videoCtrl.seek(15.5);
    const seekTime = videoCtrl.getCurrentTime();

    // Verify movie metadata registered
    const movieState = window.appState.get('localMovie');

    // Test Cleanup (URL revocation)
    const oldBlobUrl = videoCtrl.currentBlobUrl;
    videoCtrl.cleanup();
    const cleanedUp = videoCtrl.currentBlobUrl === null;

    return {
      isBlobUrl,
      oldBlobUrlPrefix: oldBlobUrl ? oldBlobUrl.substring(0, 5) : '',
      playAttempted,
      paused,
      seekTime,
      movieName: movieState?.name,
      cleanedUp
    };
  });

  console.log('Playback verification result:', JSON.stringify(playbackStatus, null, 2));

  expect(playbackStatus.isBlobUrl).toBe(true);
  expect(playbackStatus.oldBlobUrlPrefix).toBe('blob:');
  expect(playbackStatus.paused).toBe(true);
  expect(playbackStatus.seekTime).toBe(15.5);
  expect(playbackStatus.movieName).toBe('my-test-movie.webm');
  expect(playbackStatus.cleanedUp).toBe(true);

  // Verify zero fatal page errors
  expect(errors).toHaveLength(0);
});
