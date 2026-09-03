/**
 * Person A — Video Controller
 * Encapsulates the HTML5 <video> element.
 *
 * CRITICAL RULE:
 * Distinguishes between LOCAL USER ACTIONS and REMOTE COMMANDS.
 * An internal flag `isRemoteAction` ensures remote commands do NOT trigger
 * outgoing sync messages to prevent infinite feedback loops.
 */

class VideoController {
  constructor(videoElement) {
    this.video = videoElement;
    this.isRemoteAction = false;
    this.onLocalPlay = null;
    this.onLocalPause = null;
    this.onLocalSeek = null;
    this.onMetadataLoaded = null;

    this.bindEvents();
  }

  bindEvents() {
    this.video.addEventListener('loadedmetadata', () => {
      console.log(`[VideoController] Loaded video metadata: duration=${this.video.duration}s`);
      if (this.onMetadataLoaded) {
        this.onMetadataLoaded({
          duration: this.video.duration,
          videoWidth: this.video.videoWidth,
          videoHeight: this.video.videoHeight
        });
      }
    });

    this.video.addEventListener('play', () => {
      if (this.isRemoteAction) {
        // Suppress outgoing event when triggered remotely
        return;
      }
      console.log('[VideoController] Local play detected at:', this.video.currentTime);
      if (this.onLocalPlay) {
        this.onLocalPlay(this.video.currentTime);
      }
    });

    this.video.addEventListener('pause', () => {
      if (this.isRemoteAction) {
        // Suppress outgoing event when triggered remotely
        return;
      }
      console.log('[VideoController] Local pause detected at:', this.video.currentTime);
      if (this.onLocalPause) {
        this.onLocalPause(this.video.currentTime);
      }
    });

    this.video.addEventListener('seeked', () => {
      if (this.isRemoteAction) {
        // Suppress outgoing event when triggered remotely
        return;
      }
      console.log('[VideoController] Local seek detected to:', this.video.currentTime);
      if (this.onLocalSeek) {
        this.onLocalSeek(this.video.currentTime);
      }
    });

    this.video.addEventListener('error', (e) => {
      console.error('[VideoController] Video element playback error:', e);
      if (window.AppEvents) {
        window.AppEvents.emit('videoError', 'Unsupported video format or video decode error.');
      }
    });
  }

  loadSource(srcOrBlobUrl) {
    this.video.src = srcOrBlobUrl;
    this.video.load();
  }

  hasVideo() {
    return !!(this.video && this.video.readyState >= 1 && this.video.duration);
  }

  getCurrentTime() {
    return this.video.currentTime || 0;
  }

  getDuration() {
    return this.video.duration || 0;
  }

  isPaused() {
    return this.video.paused;
  }

  // --- Remote Command Handlers (Sets isRemoteAction to prevent loops) ---

  applyRemotePlay() {
    if (!this.hasVideo()) return;
    this.isRemoteAction = true;
    const playPromise = this.video.play();
    if (playPromise !== undefined) {
      playPromise
        .catch(err => console.warn('[VideoController] Autoplay policy prevented playback:', err))
        .finally(() => {
          setTimeout(() => {
            this.isRemoteAction = false;
          }, 50);
        });
    } else {
      setTimeout(() => {
        this.isRemoteAction = false;
      }, 50);
    }
  }

  applyRemotePause() {
    if (!this.hasVideo()) return;
    this.isRemoteAction = true;
    this.video.pause();
    setTimeout(() => {
      this.isRemoteAction = false;
    }, 50);
  }

  applyRemoteSeek(targetTime) {
    if (!this.hasVideo()) return;
    this.isRemoteAction = true;
    this.video.currentTime = targetTime;
    setTimeout(() => {
      this.isRemoteAction = false;
    }, 100);
  }
}

window.VideoController = VideoController;
