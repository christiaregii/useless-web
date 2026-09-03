/**
 * Watch Party - Video Controller (Person A: Media/UI)
 * Handles HTML5 video playback, local user interaction, and remote command execution.
 * Enforces the critical guard against echo loops between local actions and remote commands.
 */

class VideoController {
    constructor(videoElement) {
        this.video = videoElement;
        this.isRemoteCommand = false;
        this.seekingFromScrubber = false;

        // Callback hooks for Person A Integration layer
        this.onLocalPlay = null;   // (timestamp) => void
        this.onLocalPause = null;  // (timestamp) => void
        this.onLocalSeek = null;   // (timestamp) => void
        this.onTimeUpdate = null;  // (currentTime, duration) => void

        this._bindVideoEvents();
    }

    _bindVideoEvents() {
        this.video.addEventListener('play', () => {
            if (this.isRemoteCommand) {
                console.log('[VideoController] Remote play applied (no outbound echo)');
                this.isRemoteCommand = false;
                return;
            }
            console.log('[VideoController] Local user triggered PLAY at', this.video.currentTime);
            if (this.onLocalPlay) {
                this.onLocalPlay(this.video.currentTime);
            }
        });

        this.video.addEventListener('pause', () => {
            if (this.isRemoteCommand) {
                console.log('[VideoController] Remote pause applied (no outbound echo)');
                this.isRemoteCommand = false;
                return;
            }
            console.log('[VideoController] Local user triggered PAUSE at', this.video.currentTime);
            if (this.onLocalPause) {
                this.onLocalPause(this.video.currentTime);
            }
        });

        this.video.addEventListener('seeked', () => {
            if (this.isRemoteCommand) {
                console.log('[VideoController] Remote seek applied (no outbound echo)');
                this.isRemoteCommand = false;
                return;
            }
            console.log('[VideoController] Local user SEEKED to', this.video.currentTime);
            if (this.onLocalSeek) {
                this.onLocalSeek(this.video.currentTime);
            }
        });

        this.video.addEventListener('loadstart', () => {
            console.log('[VideoController] Video load started...');
            if (this.onLoadStart) {
                this.onLoadStart();
            }
        });

        this.video.addEventListener('canplay', () => {
            console.log('[VideoController] Video can play');
            if (this.onCanPlay) {
                this.onCanPlay();
            }
        });

        this.video.addEventListener('timeupdate', () => {
            if (this.onTimeUpdate) {
                this.onTimeUpdate(this.video.currentTime, this.video.duration || 0);
            }
        });

        this.video.addEventListener('loadedmetadata', () => {
            console.log(`[VideoController] Video loaded. Duration: ${this.video.duration.toFixed(1)}s`);
            if (this.onLoadedMetadata) {
                this.onLoadedMetadata(this.video.duration);
            }
            if (window.appState) {
                window.appState.set('duration', this.video.duration);
                const localMovie = window.appState.get('localMovie');
                if (localMovie) {
                    window.appState.set('localMovie', {
                        ...localMovie,
                        duration: this.video.duration
                    });
                }
            }
        });

        this.video.addEventListener('error', (e) => {
            const err = this.video.error;
            let errMsg = 'Failed to load video';
            if (err) {
                switch (err.code) {
                    case 1: errMsg = 'Video loading aborted'; break;
                    case 2: errMsg = 'Network error loading video'; break;
                    case 3: errMsg = 'Video decoding failed or format unsupported'; break;
                    case 4: errMsg = 'Video format not supported or file not found'; break;
                    default: errMsg = err.message || 'Unknown video error';
                }
            }
            console.error('[VideoController] Video error:', errMsg, e);
            if (this.onError) {
                this.onError(errMsg);
            }
        });
    }

    /**
     * Loads a video file via File Object, Blob, or Uint8Array.
     * Uses URL.createObjectURL to ensure filesystem is not directly exposed.
     */
    loadSource(fileOrBlob, metadata = {}) {
        try {
            // Revoke previous blob URL if any to avoid memory leaks
            if (this.currentBlobUrl) {
                URL.revokeObjectURL(this.currentBlobUrl);
                this.currentBlobUrl = null;
            }

            let blobUrl;
            if (fileOrBlob instanceof Blob || fileOrBlob instanceof File) {
                blobUrl = URL.createObjectURL(fileOrBlob);
            } else if (fileOrBlob instanceof Uint8Array || ArrayBuffer.isView(fileOrBlob) || (fileOrBlob && fileOrBlob.buffer)) {
                const blob = new Blob([fileOrBlob], { type: metadata.mimeType || 'video/mp4' });
                blobUrl = URL.createObjectURL(blob);
            } else if (typeof fileOrBlob === 'string' && fileOrBlob.startsWith('blob:')) {
                blobUrl = fileOrBlob;
            } else {
                throw new Error('Video must be loaded as a Blob or File object');
            }

            this.currentBlobUrl = blobUrl;
            this.video.src = blobUrl;
            this.video.load();

            const movieData = {
                name: metadata.name || (fileOrBlob && fileOrBlob.name) || 'Local Movie',
                url: blobUrl,
                duration: 0,
                size: metadata.size || (fileOrBlob && fileOrBlob.size) || null
            };

            if (window.appState) {
                window.appState.set('localMovie', movieData);
            }
            console.log('[VideoController] Loaded video source via Blob URL:', movieData.name);
            return movieData;
        } catch (err) {
            console.error('[VideoController] Failed to load video source:', err);
            if (this.onError) {
                this.onError(err.message || 'Could not load video');
            }
            throw err;
        }
    }

    /**
     * REMOTE COMMAND EXECUTIONS
     * Sets the isRemoteCommand guard so local event handlers do NOT echo out network messages.
     */

    playFromRemote(timestamp) {
        this.isRemoteCommand = true;
        if (typeof timestamp === 'number' && Math.abs(this.video.currentTime - timestamp) > 0.2) {
            this.video.currentTime = timestamp;
        }
        const promise = this.video.play();
        if (promise) {
            promise.catch((err) => {
                console.warn('[VideoController] Autoplay error on remote play:', err);
                this.isRemoteCommand = false;
            });
        }
    }

    pauseFromRemote(timestamp) {
        this.isRemoteCommand = true;
        if (typeof timestamp === 'number') {
            this.video.currentTime = timestamp;
        }
        this.video.pause();
    }

    seekFromRemote(timestamp) {
        this.isRemoteCommand = true;
        if (typeof timestamp === 'number') {
            this.video.currentTime = timestamp;
        }
    }

    correctDrift(targetTimestamp) {
        this.isRemoteCommand = true;
        console.log(`[VideoController] Correcting drift: adjusting time to ${targetTimestamp.toFixed(2)}s`);
        this.video.currentTime = targetTimestamp;
    }

    /**
     * LOCAL USER CONTROLS
     */

    togglePlay() {
        if (this.video.paused) {
            this.video.play().catch(e => console.warn('[VideoController] Play error:', e));
        } else {
            this.video.pause();
        }
    }

    seek(seconds) {
        const dur = this.video.duration;
        const target = (typeof dur === 'number' && !isNaN(dur) && dur > 0)
            ? Math.max(0, Math.min(dur, seconds))
            : Math.max(0, seconds);
        this.video.currentTime = target;
    }

    setVolume(value) {
        this.video.volume = Math.max(0, Math.min(1, value));
        this.video.muted = this.video.volume === 0;
    }

    toggleMute() {
        this.video.muted = !this.video.muted;
    }

    getCurrentTime() {
        return this.video.currentTime;
    }

    getDuration() {
        return this.video.duration || 0;
    }

    isPlaying() {
        return !this.video.paused && !this.video.ended && this.video.readyState > 2;
    }

    cleanup() {
        if (this.currentBlobUrl) {
            try {
                URL.revokeObjectURL(this.currentBlobUrl);
            } catch (_) {}
            this.currentBlobUrl = null;
        }
        if (this.video) {
            this.video.pause();
            this.video.removeAttribute('src');
            this.video.load();
        }
    }
}

// Global browser instance
if (typeof window !== 'undefined') {
    window.VideoController = VideoController;
}

// Export for module/browser usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VideoController };
}
