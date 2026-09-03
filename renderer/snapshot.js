/**
 * Watch Party - Snapshot Module (Person A: Media/UI)
 * Manages webcam stream with user consent, frame capture, JPEG compression, and rate-limiting.
 * 
 * Exposes interface for networking/sync layer:
 *   - initCamera()
 *   - stopCamera()
 *   - isCameraActive()
 *   - captureSnapshot(ignoreRateLimit)
 */

const SNAPSHOT_WIDTH = 640;
const SNAPSHOT_HEIGHT = 480;
const SNAPSHOT_RATE_LIMIT_MS = 10000; // 10 seconds rate-limit between captures for partner sync

class SnapshotManager {
    constructor() {
        this.stream = null;
        this.video = null;
        this.canvas = null;
        this.ctx = null;
        this.isConsentGranted = false;
        this.lastCaptureTime = 0;

        this._initElements();
    }

    _initElements() {
        // Hidden/local video element to play camera stream for frame capture
        this.video = document.createElement('video');
        this.video.setAttribute('playsinline', '');
        this.video.setAttribute('autoplay', '');
        this.video.muted = true;
        this.video.style.display = 'none';
        document.body.appendChild(this.video);

        // Hidden canvas to perform JPEG compression and frame resizing
        this.canvas = document.createElement('canvas');
        this.canvas.width = SNAPSHOT_WIDTH;
        this.canvas.height = SNAPSHOT_HEIGHT;
        this.canvas.style.display = 'none';
        document.body.appendChild(this.canvas);

        this.ctx = this.canvas.getContext('2d');
    }

    /**
     * Explicit camera initialization with user consent.
     * Uses navigator.mediaDevices.getUserMedia({ video: true, audio: false }).
     * Failure does NOT break movie playback.
     */
    async initCamera() {
        try {
            console.log('[Snapshot] Requesting camera access with user consent...');
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: { ideal: SNAPSHOT_WIDTH },
                    height: { ideal: SNAPSHOT_HEIGHT },
                    facingMode: 'user'
                },
                audio: false
            });

            this.video.srcObject = this.stream;
            await this.video.play();
            this.isConsentGranted = true;

            if (window.appState) {
                window.appState.set('cameraConsent', true);
                window.appState.set('cameraActive', true);
            }

            console.log('[Snapshot] Camera activated successfully');
            return true;
        } catch (err) {
            console.warn('[Snapshot] Camera access denied or unavailable:', err);
            this.stopCamera();
            if (window.appState) {
                window.appState.set('cameraConsent', false);
                window.appState.set('cameraActive', false);
            }
            return false;
        }
    }

    /**
     * Stops the local camera stream and releases hardware tracks.
     */
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => {
                try { track.stop(); } catch (_) {}
            });
            this.stream = null;
        }
        if (this.video) {
            this.video.srcObject = null;
        }
        this.isConsentGranted = false;

        if (window.appState) {
            window.appState.set('cameraConsent', false);
            window.appState.set('cameraActive', false);
        }
        console.log('[Snapshot] Camera deactivated and released');
    }

    /**
     * Returns true if camera is active and stream is running.
     */
    isCameraActive() {
        return Boolean(this.isConsentGranted && this.stream && this.stream.active);
    }

    /**
     * Toggles camera state based on explicit user action.
     */
    async toggleCamera() {
        if (this.isCameraActive()) {
            this.stopCamera();
            return false;
        } else {
            return await this.initCamera();
        }
    }

    /**
     * Captures a single frame from local webcam, resizes to 640x480, and compresses to JPEG.
     * Returns data-URL string ("data:image/jpeg;base64,...") or null.
     * Does NOT send anything over the network.
     * Any failure is caught gracefully so movie playback is never interrupted.
     */
    captureSnapshot(ignoreRateLimit = false) {
        try {
            if (!this.isCameraActive() || !this.video) {
                console.log('[Snapshot] Skipped: Camera is not active');
                return null;
            }

            const now = Date.now();
            const elapsed = now - this.lastCaptureTime;
            if (!ignoreRateLimit && elapsed < SNAPSHOT_RATE_LIMIT_MS) {
                console.log(`[Snapshot] Skipped: Rate limit active (${Math.round((SNAPSHOT_RATE_LIMIT_MS - elapsed) / 1000)}s remaining)`);
                return null;
            }

            if (this.video.readyState < 2) {
                console.warn('[Snapshot] Skipped: Webcam video frame not ready yet');
                return null;
            }

            // Draw current frame to canvas and scale to 640x480
            this.ctx.drawImage(this.video, 0, 0, SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT);

            // Compress to JPEG (0.6 quality)
            const dataUrl = this.canvas.toDataURL('image/jpeg', 0.6);
            this.lastCaptureTime = now;

            console.log(`[Snapshot] Frame captured successfully (${Math.round(dataUrl.length / 1024)} KB)`);
            return dataUrl;
        } catch (err) {
            // NEVER break movie playback on snapshot failure
            console.error('[Snapshot] Non-fatal capture failure:', err);
            return null;
        }
    }

    // Alias for backward compatibility
    captureFrame() {
        return this.captureSnapshot(false);
    }
}

// Export for module/browser usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SnapshotManager, SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT };
}
