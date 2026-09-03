/**
 * Watch Party - Snapshot Module (Person A: Media/UI)
 * Manages webcam stream with user consent, frame capture, JPEG compression, and rate-limiting.
 * Guarantees that any camera or capture failure will NEVER disrupt movie synchronization.
 */

const SNAPSHOT_WIDTH = 640;
const SNAPSHOT_HEIGHT = 480;
const SNAPSHOT_RATE_LIMIT_MS = 10000; // 10 seconds rate-limit between captures

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
        // Hidden video element to play camera stream for frame capture
        this.video = document.createElement('video');
        this.video.setAttribute('playsinline', '');
        this.video.setAttribute('autoplay', '');
        this.video.muted = true;
        this.video.style.display = 'none';
        document.body.appendChild(this.video);

        // Hidden canvas to perform JPEG compression
        this.canvas = document.createElement('canvas');
        this.canvas.width = SNAPSHOT_WIDTH;
        this.canvas.height = SNAPSHOT_HEIGHT;
        this.canvas.style.display = 'none';
        document.body.appendChild(this.canvas);

        this.ctx = this.canvas.getContext('2d');
    }

    /**
     * Requests user consent and starts the local webcam stream.
     */
    async requestCameraAccess() {
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
            this.disableCamera();
            if (window.appState) {
                window.appState.set('cameraConsent', false);
                window.appState.set('cameraActive', false);
            }
            return false;
        }
    }

    /**
     * Completely disables webcam, releases hardware, and revokes consent state.
     */
    disableCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
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
     * Toggles camera state based on explicit user action.
     */
    async toggleCamera() {
        if (this.isConsentGranted && this.stream) {
            this.disableCamera();
            return false;
        } else {
            return await this.requestCameraAccess();
        }
    }

    /**
     * Captures a single JPEG snapshot frame from local webcam.
     * Enforces rate limiting and safety rules.
     * Returns base64 data URL or null.
     */
    captureFrame() {
        try {
            if (!this.isConsentGranted || !this.stream || !this.video) {
                console.log('[Snapshot] Skipped: Camera is not enabled by user');
                return null;
            }

            const now = Date.now();
            const elapsed = now - this.lastCaptureTime;
            if (elapsed < SNAPSHOT_RATE_LIMIT_MS) {
                console.log(`[Snapshot] Skipped: Rate limit active (${Math.round((SNAPSHOT_RATE_LIMIT_MS - elapsed) / 1000)}s remaining)`);
                return null;
            }

            if (this.video.readyState < 2) {
                console.warn('[Snapshot] Skipped: Webcam video frame not ready');
                return null;
            }

            // Draw current frame to canvas and scale to 640x480
            this.ctx.drawImage(this.video, 0, 0, SNAPSHOT_WIDTH, SNAPSHOT_HEIGHT);

            // Compress to JPEG with 0.6 quality for fast data channel delivery
            const dataUrl = this.canvas.toDataURL('image/jpeg', 0.6);
            this.lastCaptureTime = now;

            console.log(`[Snapshot] Frame captured successfully (${Math.round(dataUrl.length / 1024)} KB)`);
            return dataUrl;
        } catch (err) {
            // NEVER let snapshot error break movie playback or sync
            console.error('[Snapshot] Non-fatal capture failure:', err);
            return null;
        }
    }
}

// Export for module/browser usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SnapshotManager };
}
