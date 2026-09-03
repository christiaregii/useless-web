/**
 * Person A — Snapshot module
 * Manages explicit webcam consent, local webcam stream, 640x480 offscreen capture,
 * JPEG compression, 10s rate limiting, and temporary popup display.
 */

class SnapshotManager {
  constructor() {
    this.stream = null;
    this.lastCaptureTime = 0;
    this.rateLimitMs = 10000; // 10s rate limit
    this.hiddenVideo = document.createElement('video');
    this.hiddenVideo.autoplay = true;
    this.hiddenVideo.muted = true;
    this.hiddenVideo.playsInline = true;

    this.hiddenCanvas = document.createElement('canvas');
    this.hiddenCanvas.width = 640;
    this.hiddenCanvas.height = 480;
  }

  async requestWebcamConsent() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 }
        },
        audio: false
      });
      this.hiddenVideo.srcObject = this.stream;
      await this.hiddenVideo.play();
      window.AppState.cameraAllowed = true;
      window.AppState.cameraStream = this.stream;
      console.log('[SnapshotManager] Webcam stream acquired with consent.');
      return true;
    } catch (err) {
      console.warn('[SnapshotManager] Webcam permission denied or unavailable:', err);
      window.AppState.cameraAllowed = false;
      return false;
    }
  }

  canCapture() {
    if (!this.stream || !window.AppState.cameraAllowed) return false;
    const now = Date.now();
    return (now - this.lastCaptureTime) >= this.rateLimitMs;
  }

  captureSnapshot() {
    if (!this.canCapture()) {
      console.log('[SnapshotManager] Snapshot skipped due to rate limit or camera unavailability.');
      return null;
    }

    try {
      const ctx = this.hiddenCanvas.getContext('2d');
      ctx.drawImage(this.hiddenVideo, 0, 0, 640, 480);
      this.lastCaptureTime = Date.now();

      // Compress to JPEG with 0.7 quality for quick WebRTC data channel transfer
      const dataUrl = this.hiddenCanvas.toDataURL('image/jpeg', 0.7);
      console.log('[SnapshotManager] Captured 640x480 JPEG snapshot frame successfully.');
      return dataUrl;
    } catch (err) {
      console.error('[SnapshotManager] Failed to capture frame:', err);
      return null;
    }
  }

  stopWebcam() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
      window.AppState.cameraAllowed = false;
    }
  }
}

window.SnapshotManager = SnapshotManager;
