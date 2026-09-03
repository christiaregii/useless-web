/**
 * Watch Party - Integration Layer (Person A: Media/UI & Person B: Network/Sync Bridge)
 * Wires UI, Video Controller, and Snapshot Manager to Session Manager and Sync Engine.
 */

class AppIntegration {
    constructor(ui, videoCtrl, snapshotMgr, sessionMgr) {
        this.ui = ui;
        this.video = videoCtrl;
        this.snapshot = snapshotMgr;
        this.session = sessionMgr;

        // Instantiate Person B's Sync Engine
        this.sync = new SyncEngine(
            this.session,
            () => ({
                currentTime: this.video.getCurrentTime(),
                isPlaying: this.video.isPlaying(),
                isReady: window.appState.get('localReady')
            }),
            (targetTimestamp) => {
                this.video.correctDrift(targetTimestamp);
            }
        );

        this._setupNetworkEvents();
        this._setupVideoEvents();
        this._setupUIEvents();
        this._setupSyncEvents();
    }

    _setupNetworkEvents() {
        // Handle connection state transitions
        this.session.onConnectionStateChange((state) => {
            console.log('[Integration] Connection state changed:', state);
            window.appState.set('connectionState', state);
            this.ui.updateConnectionStatus(state);

            if (state === 'connected') {
                this.ui.closeSignalingModal();
                this.ui.showToast('WebRTC DataChannel Connected!', 'success');
                this.sync.startPeriodicSync();

                // If local movie is already selected, broadcast ready/movie info
                const localMovie = window.appState.get('localMovie');
                if (localMovie) {
                    this.session.sendMessage(createReadyMessage(window.appState.get('localReady'), localMovie));
                }
            } else if (state === 'disconnected' || state === 'failed') {
                this.sync.stopPeriodicSync();
                this.ui.showToast(`Connection ${state}`, 'warning');
            }
        });

        // Handle incoming verified protocol messages from peer
        this.session.onMessage((msg) => {
            this._handlePeerMessage(msg);
        });
    }

    _handlePeerMessage(msg) {
        switch (msg.type) {
            case MessageType.PLAY:
                console.log('[Integration] Remote peer PLAY command at', msg.timestamp);
                this.video.playFromRemote(msg.timestamp);
                this.ui.setPlayState(true);
                break;

            case MessageType.PAUSE:
                console.log('[Integration] Remote peer PAUSE command at', msg.timestamp);
                this.video.pauseFromRemote(msg.timestamp);
                this.ui.setPlayState(false);

                // If remote peer requested snapshot on pause, capture webcam frame
                if (msg.requestSnapshot && this.snapshot.isCameraActive()) {
                    const frame = this.snapshot.captureSnapshot();
                    if (frame) {
                        const snapMsg = createSnapshotMessage(frame);
                        this.session.sendMessage(snapMsg);
                    }
                }
                break;

            case MessageType.SEEK:
                console.log('[Integration] Remote peer SEEK command to', msg.timestamp);
                this.video.seekFromRemote(msg.timestamp);
                this.ui.updateTimeline(msg.timestamp, this.video.getDuration());
                break;

            case MessageType.READY:
                console.log('[Integration] Remote peer READY status:', msg.isReady, msg.movieMeta);
                window.appState.set('remoteReady', msg.isReady);
                if (msg.movieMeta) {
                    window.appState.set('remoteMovie', msg.movieMeta);
                }
                this.ui.showMovieInfo(window.appState.get('localMovie'), window.appState.get('remoteMovie'));
                this.ui.updateReadyButton(window.appState.get('localReady'), msg.isReady);

                // If both peers now ready, Host initiates synchronized countdown
                if (window.appState.isBothReady() && window.appState.get('sessionRole') === 'host') {
                    this.ui.showToast('Both peers ready! Starting countdown...', 'info');
                    this.sync.initiateCountdown(3000);
                }
                break;

            case MessageType.COUNTDOWN:
                console.log('[Integration] Received synchronized countdown target:', msg.startTimestamp);
                this.sync.startCountdownTimer(msg.startTimestamp);
                break;

            case MessageType.SYNC_REQUEST:
                this.sync.handleSyncRequest(msg);
                break;

            case MessageType.SYNC_RESPONSE:
                this.sync.handleSyncResponse(msg);
                break;

            case MessageType.SNAPSHOT_IMAGE:
                console.log('[Integration] Received partner reaction snapshot!');
                this.ui.showReactionPopup(msg.imageData);
                break;

            default:
                console.warn('[Integration] Unhandled message:', msg);
        }
    }

    _setupVideoEvents() {
        // LOCAL PLAY: user clicked play button or keyboard spacebar
        this.video.onLocalPlay = (timestamp) => {
            this.ui.setPlayState(true);
            if (this.session.getConnectionState() === 'connected') {
                this.session.sendMessage(createPlayMessage(timestamp));
            }
        };

        // LOCAL PAUSE: user clicked pause button
        this.video.onLocalPause = (timestamp) => {
            this.ui.setPlayState(false);
            if (this.session.getConnectionState() === 'connected') {
                // When local user pauses, request snapshot from remote peer
                this.session.sendMessage(createPauseMessage(timestamp, true));
            }
        };

        // LOCAL SEEK: user scrubbed timeline
        this.video.onLocalSeek = (timestamp) => {
            if (this.session.getConnectionState() === 'connected') {
                this.session.sendMessage(createSeekMessage(timestamp));
            }
        };

        // TIME UPDATE: smoothly updates timeline UI
        this.video.onTimeUpdate = (current, duration) => {
            this.ui.updateTimeline(current, duration);
        };
    }

    _setupUIEvents() {
        // File selection via native Electron dialog or fallback HTML5 file input
        this.ui.btnSelectFile.addEventListener('click', async () => {
            if (window.electronAPI && window.electronAPI.openVideoFile) {
                const res = await window.electronAPI.openVideoFile();
                if (!res.canceled && (res.fileBuffer || res.filePath)) {
                    this._loadVideoFromPath(res.filePath, res.fileName, res.fileSize, res.fileBuffer);
                }
            } else {
                this.ui.fileInputHidden.click();
            }
        });

        this.ui.fileInputHidden.addEventListener('change', (e) => {
            const file = e.target.files && e.target.files[0];
            if (file) {
                this._loadVideoFromFile(file);
            }
        });

        // Drag and Drop handling on empty state
        this.ui.emptyDropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            this.ui.emptyDropzone.classList.add('drag-active');
        });
        this.ui.emptyDropzone.addEventListener('dragleave', () => {
            this.ui.emptyDropzone.classList.remove('drag-active');
        });
        this.ui.emptyDropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            this.ui.emptyDropzone.classList.remove('drag-active');
            const file = e.dataTransfer.files && e.dataTransfer.files[0];
            if (file) {
                this._loadVideoFromFile(file);
            }
        });

        // Custom Play/Pause button
        this.ui.btnPlayPause.addEventListener('click', () => {
            this.video.togglePlay();
        });

        // Timeline scrubber
        this.ui.timelineScrubber.addEventListener('input', (e) => {
            const fraction = parseFloat(e.target.value) / 100;
            const targetTime = fraction * this.video.getDuration();
            this.video.seek(targetTime);
        });

        // Volume control
        this.ui.volumeSlider.addEventListener('input', (e) => {
            this.video.setVolume(parseFloat(e.target.value));
        });
        this.ui.btnVolume.addEventListener('click', () => {
            this.video.toggleMute();
            this.ui.volumeSlider.value = this.video.video.muted ? 0 : this.video.video.volume;
        });

        // Fullscreen
        this.ui.btnFullscreen.addEventListener('click', () => {
            if (!document.fullscreenElement) {
                this.ui.theaterContainer.requestFullscreen().catch(err => {
                    console.warn('[UI] Fullscreen error:', err);
                });
            } else {
                document.exitFullscreen();
            }
        });

        // Camera consent toggle
        this.ui.btnCamera.addEventListener('click', async () => {
            const active = await this.snapshot.toggleCamera();
            this.ui.updateCameraStatus(active);
            if (active) {
                this.ui.showToast('Reaction camera enabled (640x480, opt-in)', 'info');
            } else {
                this.ui.showToast('Reaction camera disabled', 'info');
            }
        });

        // Local Test Snapshot button (Requirement 4 & 5: capture and display locally)
        if (this.ui.btnTestSnapshot) {
            this.ui.btnTestSnapshot.addEventListener('click', () => {
                if (!this.snapshot.isCameraActive()) {
                    this.ui.showToast('Please enable Reaction Cam first!', 'warning');
                    return;
                }
                const snap = this.snapshot.captureSnapshot(true);
                if (snap) {
                    this.ui.showReactionPopup(snap, 'Local Test Snapshot', 'Captured from your webcam');
                    this.ui.showToast('Local snapshot captured successfully!', 'success');
                } else {
                    this.ui.showToast('Camera frame not ready yet, try again', 'warning');
                }
            });
        }

        // Ready button toggle
        this.ui.btnReady.addEventListener('click', () => {
            if (!window.appState.isMovieLoaded()) {
                this.ui.showToast('Please select a movie first!', 'warning');
                return;
            }

            const current = window.appState.get('localReady');
            const newReady = !current;
            window.appState.set('localReady', newReady);

            this.ui.updateReadyButton(newReady, window.appState.get('remoteReady'));

            if (this.session.getConnectionState() === 'connected') {
                this.session.sendMessage(createReadyMessage(newReady, window.appState.get('localMovie')));
            }

            // Check if both ready
            if (newReady && window.appState.get('remoteReady') && window.appState.get('sessionRole') === 'host') {
                this.ui.showToast('Both peers ready! Starting countdown...', 'info');
                this.sync.initiateCountdown(3000);
            }
        });

        // Signaling UI Bindings:
        // Host Create Offer
        this.ui.btnHostCreate.addEventListener('click', async () => {
            try {
                this.ui.hostStatus.textContent = 'Generating Offer & Gathering ICE candidates...';
                this.ui.btnHostCreate.disabled = true;
                window.appState.set('sessionRole', 'host');

                const offerToken = await this.session.createHostSession();
                this.ui.hostOfferArea.value = offerToken;
                this.ui.hostStatus.textContent = '✓ Offer ready! Copy & send to partner.';
                this.ui.showToast('Offer created. Copy and send to Guest.', 'info');
            } catch (err) {
                console.error('[Host] Error creating offer:', err);
                this.ui.hostStatus.textContent = `Error: ${err.message}`;
                this.ui.showToast('Failed to create offer', 'error');
            } finally {
                this.ui.btnHostCreate.disabled = false;
            }
        });

        // Host Copy Offer
        this.ui.btnHostCopyOffer.addEventListener('click', async () => {
            const text = this.ui.hostOfferArea.value.trim();
            if (!text) return;
            await this._copyToClipboard(text);
            this.ui.showToast('Host Offer copied to clipboard!', 'success');
        });

        // Host Accept Answer
        this.ui.btnHostAcceptAnswer.addEventListener('click', async () => {
            const answerToken = this.ui.hostAnswerArea.value.trim();
            if (!answerToken) {
                this.ui.showToast('Please paste the Answer code from Guest', 'warning');
                return;
            }
            try {
                this.ui.hostStatus.textContent = 'Connecting to Guest...';
                await this.session.setRemoteAnswer(answerToken);
                this.ui.hostStatus.textContent = '✓ Answer applied! Establishing P2P...';
            } catch (err) {
                console.error('[Host] Error applying answer:', err);
                this.ui.hostStatus.textContent = `Error: ${err.message}`;
                this.ui.showToast(`Invalid Answer: ${err.message}`, 'error');
            }
        });

        // Guest Create Answer from Host's Offer
        this.ui.btnGuestCreateAnswer.addEventListener('click', async () => {
            const offerToken = this.ui.guestOfferArea.value.trim();
            if (!offerToken) {
                this.ui.showToast('Please paste the Host Offer code first', 'warning');
                return;
            }
            try {
                this.ui.guestStatus.textContent = 'Generating Answer & Gathering ICE candidates...';
                this.ui.btnGuestCreateAnswer.disabled = true;
                window.appState.set('sessionRole', 'guest');

                const answerToken = await this.session.createGuestSession(offerToken);
                this.ui.guestAnswerArea.value = answerToken;
                this.ui.guestStatus.textContent = '✓ Answer ready! Copy & send back to Host.';
                this.ui.showToast('Answer created! Copy and send back to Host.', 'info');
            } catch (err) {
                console.error('[Guest] Error creating answer:', err);
                this.ui.guestStatus.textContent = `Error: ${err.message}`;
                this.ui.showToast(`Invalid Offer: ${err.message}`, 'error');
            } finally {
                this.ui.btnGuestCreateAnswer.disabled = false;
            }
        });

        // Guest Copy Answer
        this.ui.btnGuestCopyAnswer.addEventListener('click', async () => {
            const text = this.ui.guestAnswerArea.value.trim();
            if (!text) return;
            await this._copyToClipboard(text);
            this.ui.showToast('Guest Answer copied to clipboard!', 'success');
        });
    }

    _setupSyncEvents() {
        this.sync.onCountdownTick = (secondsLeft) => {
            this.ui.showCountdown(secondsLeft);
        };

        this.sync.onCountdownComplete = () => {
            console.log('[Integration] Countdown complete! Playing video synchronously.');
            this.video.video.currentTime = 0;
            this.video.video.play().catch(e => console.warn('[Video] Play after countdown error:', e));
            this.ui.setPlayState(true);
        };

        // Wire loading and error states to UI
        this.video.onLoadStart = () => {
            this.ui.showLoading();
        };

        this.video.onCanPlay = () => {
            this.ui.hideLoading();
            this.ui.hideError();
        };

        this.video.onError = (errMsg) => {
            this.ui.showError(errMsg);
        };

        // Retry / choose another file button
        if (this.ui.btnRetryFile) {
            this.ui.btnRetryFile.addEventListener('click', () => {
                this.ui.hideError();
                this.ui.btnSelectFile.click();
            });
        }
    }

    _loadVideoFromFile(file) {
        try {
            this.ui.showLoading();
            const movieMeta = this.video.loadSource(file);
            this.ui.showMovieInfo(movieMeta, window.appState.get('remoteMovie'));
            this.ui.showToast(`Loaded: ${file.name}`, 'info');

            if (this.session.getConnectionState() === 'connected') {
                this.session.sendMessage(createReadyMessage(window.appState.get('localReady'), movieMeta));
            }
        } catch (err) {
            this.ui.showError(err.message || 'Failed to load video file');
        }
    }

    _loadVideoFromPath(filePath, fileName, fileSize, fileBuffer) {
        try {
            this.ui.showLoading();
            let source;
            if (fileBuffer) {
                source = new Blob([fileBuffer], { type: 'video/mp4' });
            } else if (filePath) {
                // Fallback if needed
                source = `file:///${filePath.replace(/\\/g, '/')}`;
            }

            const movieMeta = this.video.loadSource(source, { name: fileName, size: fileSize });
            this.ui.showMovieInfo(movieMeta, window.appState.get('remoteMovie'));
            this.ui.showToast(`Loaded: ${fileName}`, 'info');

            if (this.session.getConnectionState() === 'connected') {
                this.session.sendMessage(createReadyMessage(window.appState.get('localReady'), movieMeta));
            }
        } catch (err) {
            this.ui.showError(err.message || 'Failed to load selected video');
        }
    }

    async _copyToClipboard(text) {
        if (window.electronAPI && window.electronAPI.copyToClipboard) {
            await window.electronAPI.copyToClipboard(text);
        } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(text);
        }
    }
}

// Global browser instance
if (typeof window !== 'undefined') {
    window.AppIntegration = AppIntegration;
    window.Integration = AppIntegration;
}

// Export for module/browser usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AppIntegration, Integration: AppIntegration };
}
