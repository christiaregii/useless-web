/**
 * Watch Party - UI Manager (Person A: Media/UI)
 * Handles DOM bindings, modals, custom controls, countdown overlay, and reaction popups.
 */

class UIManager {
    constructor() {
        this._bindElements();
        this._initListeners();
    }

    _bindElements() {
        // Top Navigation / Header
        this.statusBadge = document.getElementById('connection-status-badge');
        this.statusDot = document.getElementById('connection-status-dot');
        this.statusText = document.getElementById('connection-status-text');
        this.btnOpenConnect = document.getElementById('btn-open-connect');
        this.btnReady = document.getElementById('btn-ready');
        this.btnCamera = document.getElementById('btn-camera');
        this.btnTestSnapshot = document.getElementById('btn-test-snapshot');
        this.cameraDot = document.getElementById('camera-status-dot');
        this.syncBadge = document.getElementById('sync-status-badge');

        // Signaling Modal
        this.modalSignaling = document.getElementById('modal-signaling');
        this.btnCloseSignaling = document.getElementById('btn-close-signaling');
        this.tabHost = document.getElementById('tab-host');
        this.tabGuest = document.getElementById('tab-guest');
        this.hostSection = document.getElementById('section-host');
        this.guestSection = document.getElementById('section-guest');

        // Host controls
        this.btnHostCreate = document.getElementById('btn-host-create');
        this.hostOfferArea = document.getElementById('host-offer-text');
        this.btnHostCopyOffer = document.getElementById('btn-host-copy-offer');
        this.hostAnswerArea = document.getElementById('host-answer-text');
        this.btnHostAcceptAnswer = document.getElementById('btn-host-accept-answer');
        this.hostStatus = document.getElementById('host-status-msg');

        // Guest controls
        this.guestOfferArea = document.getElementById('guest-offer-text');
        this.btnGuestCreateAnswer = document.getElementById('btn-guest-create-answer');
        this.guestAnswerArea = document.getElementById('guest-answer-text');
        this.btnGuestCopyAnswer = document.getElementById('btn-guest-copy-answer');
        this.guestStatus = document.getElementById('guest-status-msg');

        // Video Stage & Empty State
        this.theaterContainer = document.getElementById('theater-container');
        this.emptyDropzone = document.getElementById('empty-dropzone');
        this.btnSelectFile = document.getElementById('btn-select-file');
        this.fileInputHidden = document.getElementById('file-input-hidden');
        this.videoElement = document.getElementById('video-element');
        this.videoControls = document.getElementById('video-controls');
        this.videoLoading = document.getElementById('video-loading');
        this.videoError = document.getElementById('video-error');
        this.videoErrorText = document.getElementById('video-error-text');
        this.btnRetryFile = document.getElementById('btn-retry-file');

        // Player controls
        this.btnPlayPause = document.getElementById('btn-play-pause');
        this.playIcon = document.getElementById('icon-play');
        this.pauseIcon = document.getElementById('icon-pause');
        this.timeCurrent = document.getElementById('time-current');
        this.timeDuration = document.getElementById('time-duration');
        this.timelineScrubber = document.getElementById('timeline-scrubber');
        this.timelineProgress = document.getElementById('timeline-progress');
        this.btnVolume = document.getElementById('btn-volume');
        this.volumeSlider = document.getElementById('volume-slider');
        this.btnFullscreen = document.getElementById('btn-fullscreen');

        // Movie Info Bar
        this.movieMetaBar = document.getElementById('movie-meta-bar');
        this.localMovieName = document.getElementById('local-movie-name');
        this.partnerMovieName = document.getElementById('partner-movie-name');
        this.movieMatchBadge = document.getElementById('movie-match-badge');

        // Overlays
        this.countdownOverlay = document.getElementById('countdown-overlay');
        this.countdownNumber = document.getElementById('countdown-number');
        this.reactionPopup = document.getElementById('reaction-popup');
        this.reactionImage = document.getElementById('reaction-image');
        this.reactionTitleText = document.getElementById('reaction-title-text');
        this.reactionCaption = document.getElementById('reaction-caption');
        this.btnReactionClose = document.getElementById('btn-reaction-close');
        this.toastContainer = document.getElementById('toast-container');
    }

    _initListeners() {
        // Modal toggling
        this.btnOpenConnect.addEventListener('click', () => this.openSignalingModal());
        this.btnCloseSignaling.addEventListener('click', () => this.closeSignalingModal());
        this.modalSignaling.addEventListener('click', (e) => {
            if (e.target === this.modalSignaling) this.closeSignalingModal();
        });

        // Tabs
        this.tabHost.addEventListener('click', () => this.switchTab('host'));
        this.tabGuest.addEventListener('click', () => this.switchTab('guest'));

        // Dismiss reaction popup
        this.btnReactionClose.addEventListener('click', () => {
            this.hideReactionPopup();
        });
    }

    openSignalingModal() {
        this.modalSignaling.classList.remove('hidden');
    }

    closeSignalingModal() {
        this.modalSignaling.classList.add('hidden');
    }

    switchTab(tab) {
        if (tab === 'host') {
            this.tabHost.classList.add('active');
            this.tabGuest.classList.remove('active');
            this.hostSection.classList.remove('hidden');
            this.guestSection.classList.add('hidden');
        } else {
            this.tabGuest.classList.add('active');
            this.tabHost.classList.remove('active');
            this.guestSection.classList.remove('hidden');
            this.hostSection.classList.add('hidden');
        }
    }

    updateConnectionStatus(state) {
        this.statusBadge.className = 'status-pill ' + state;
        switch (state) {
            case 'connected':
                this.statusText.textContent = 'P2P Connected';
                this.btnOpenConnect.textContent = 'Session Active';
                break;
            case 'connecting':
                this.statusText.textContent = 'Connecting...';
                this.btnOpenConnect.textContent = 'Connecting...';
                break;
            case 'failed':
                this.statusText.textContent = 'Connection Failed';
                this.btnOpenConnect.textContent = 'Reconnect';
                break;
            case 'closed':
            case 'disconnected':
            default:
                this.statusText.textContent = 'Disconnected';
                this.btnOpenConnect.textContent = 'Connect Peer';
                break;
        }
    }

    updateReadyButton(isLocalReady, isRemoteReady) {
        if (isLocalReady) {
            this.btnReady.classList.add('ready-active');
            this.btnReady.textContent = '✓ Ready to Watch';
        } else {
            this.btnReady.classList.remove('ready-active');
            this.btnReady.textContent = 'Set Ready';
        }

        // Ready indicator badge
        if (isLocalReady && isRemoteReady) {
            this.btnReady.title = 'Both peers are ready! Initiating countdown...';
        } else if (isRemoteReady) {
            this.btnReady.title = 'Partner is ready! Click to match ready state.';
        } else {
            this.btnReady.title = 'Click when ready to start movie';
        }
    }

    updateCameraStatus(isActive) {
        if (isActive) {
            this.btnCamera.classList.add('camera-active');
            this.cameraDot.classList.add('active');
            this.btnCamera.title = 'Reaction Camera ON (Click to disable)';
        } else {
            this.btnCamera.classList.remove('camera-active');
            this.cameraDot.classList.remove('active');
            this.btnCamera.title = 'Reaction Camera OFF (Click to enable)';
        }
    }

    updateSyncBadge(driftSeconds, wasCorrected) {
        const ms = Math.round(driftSeconds * 1000);
        this.syncBadge.textContent = `Sync: ${ms}ms`;
        this.syncBadge.classList.remove('hidden');

        if (wasCorrected) {
            this.syncBadge.classList.add('corrected');
            setTimeout(() => this.syncBadge.classList.remove('corrected'), 1200);
        }
    }

    showMovieInfo(localMovie, remoteMovie) {
        this.emptyDropzone.classList.add('hidden');
        this.theaterContainer.classList.remove('hidden');
        this.movieMetaBar.classList.remove('hidden');

        if (localMovie) {
            this.localMovieName.textContent = localMovie.name;
        }

        if (remoteMovie) {
            this.partnerMovieName.textContent = remoteMovie.name;
            // Check duration alignment
            if (localMovie && localMovie.duration > 0 && remoteMovie.duration > 0) {
                const diff = Math.abs(localMovie.duration - remoteMovie.duration);
                if (diff < 3.0) {
                    this.movieMatchBadge.textContent = '✓ Match Confirmed';
                    this.movieMatchBadge.className = 'match-badge match-ok';
                } else {
                    this.movieMatchBadge.textContent = `⚠ Duration Mismatch (${diff.toFixed(0)}s diff)`;
                    this.movieMatchBadge.className = 'match-badge match-warning';
                }
            } else {
                this.movieMatchBadge.textContent = 'Partner Loaded Movie';
                this.movieMatchBadge.className = 'match-badge match-neutral';
            }
        } else {
            this.partnerMovieName.textContent = 'Waiting for partner...';
            this.movieMatchBadge.textContent = 'Local Only';
            this.movieMatchBadge.className = 'match-badge match-neutral';
        }
    }

    showLoading() {
        this.videoLoading.classList.remove('hidden');
        this.videoError.classList.add('hidden');
    }

    hideLoading() {
        this.videoLoading.classList.add('hidden');
    }

    showError(errorMessage) {
        this.videoLoading.classList.add('hidden');
        this.videoError.classList.remove('hidden');
        if (errorMessage) {
            this.videoErrorText.textContent = errorMessage;
        }
    }

    hideError() {
        this.videoError.classList.add('hidden');
    }

    setPlayState(isPlaying) {
        if (isPlaying) {
            this.playIcon.classList.add('hidden');
            this.pauseIcon.classList.remove('hidden');
        } else {
            this.playIcon.classList.remove('hidden');
            this.pauseIcon.classList.add('hidden');
        }
    }

    updateTimeline(currentTime, duration) {
        this.timeCurrent.textContent = this._formatTime(currentTime);
        this.timeDuration.textContent = this._formatTime(duration);

        if (duration > 0) {
            const percentage = (currentTime / duration) * 100;
            this.timelineScrubber.value = percentage;
            this.timelineProgress.style.width = `${percentage}%`;
        }
    }

    _formatTime(seconds) {
        if (!seconds || isNaN(seconds)) return '00:00';
        const s = Math.floor(seconds % 60);
        const m = Math.floor((seconds / 60) % 60);
        const h = Math.floor(seconds / 3600);

        const pad = (n) => String(n).padStart(2, '0');
        if (h > 0) {
            return `${pad(h)}:${pad(m)}:${pad(s)}`;
        }
        return `${pad(m)}:${pad(s)}`;
    }

    showCountdown(value) {
        this.countdownOverlay.classList.remove('hidden');
        if (value === 0) {
            this.countdownNumber.textContent = 'PLAY!';
            this.countdownNumber.classList.add('countdown-zoom');
            setTimeout(() => {
                this.countdownOverlay.classList.add('hidden');
                this.countdownNumber.classList.remove('countdown-zoom');
            }, 700);
        } else {
            this.countdownNumber.textContent = String(value);
            this.countdownNumber.classList.remove('countdown-zoom');
            // Trigger reflow for CSS pulse
            void this.countdownNumber.offsetWidth;
            this.countdownNumber.classList.add('countdown-pulse');
        }
    }

    hideCountdown() {
        this.countdownOverlay.classList.add('hidden');
    }

    showReactionPopup(imageData, title = 'Partner Reaction', caption = 'Captured when playback paused') {
        this.reactionImage.src = imageData;
        if (this.reactionTitleText) {
            this.reactionTitleText.textContent = title;
        }
        if (this.reactionCaption) {
            this.reactionCaption.textContent = caption;
        }
        this.reactionPopup.classList.remove('hidden');
        this.reactionPopup.classList.add('popup-in');

        // Auto dismiss after 4 seconds
        if (this.reactionTimeout) clearTimeout(this.reactionTimeout);
        this.reactionTimeout = setTimeout(() => {
            this.hideReactionPopup();
        }, 4000);
    }

    hideReactionPopup() {
        this.reactionPopup.classList.remove('popup-in');
        this.reactionPopup.classList.add('popup-out');
        setTimeout(() => {
            this.reactionPopup.classList.add('hidden');
            this.reactionPopup.classList.remove('popup-out');
        }, 300);
    }

    showToast(message, type = 'info', duration = 3500) {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        this.toastContainer.appendChild(toast);
        // Fade in
        requestAnimationFrame(() => toast.classList.add('toast-show'));

        setTimeout(() => {
            toast.classList.remove('toast-show');
            setTimeout(() => toast.remove(), 400);
        }, duration);
    }
}

// Global browser instance
if (typeof window !== 'undefined') {
    window.UIManager = UIManager;
}

// Export for module/browser usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { UIManager };
}
