/**
 * Watch Party - Sync Engine (Person B: Network/Sync)
 * Handles drift measurement, periodic heartbeat, ready handshake, and synchronized countdown.
 * Supports dual usage:
 *  - High-level app integration via (sessionManager, getLocalPlaybackState, applyDriftCorrection)
 *  - Callback/event contract with localPlay/localPause/localSeek/setLocalReady/sendSyncRequest
 */

const DRIFT_THRESHOLD_SECONDS = 0.3; // 300ms
const SYNC_INTERVAL_MS = 5000;       // 5 seconds

class SyncEngine {
    constructor(sessionManager, getLocalPlaybackState, applyDriftCorrection) {
        this.sessionManager = sessionManager;
        /**
         * Optional function returning { currentTime: number, isPlaying: boolean, isReady: boolean }
         */
        this.getLocalPlaybackState = typeof getLocalPlaybackState === 'function' ? getLocalPlaybackState : null;
        /**
         * Optional function to execute correction: (targetTimestamp) => void
         */
        this.applyDriftCorrection = typeof applyDriftCorrection === 'function' ? applyDriftCorrection : null;

        // Callback hooks for Person A Media/UI layer
        this.onRemotePlay = null;          // (timestamp, msg) => void
        this.onRemotePause = null;         // (timestamp, msg) => void
        this.onRemoteSeek = null;          // (timestamp, msg) => void
        this.onBothReady = null;           // () => void
        this.onDriftCorrection = null;     // (targetTimestamp, driftMs) => void
        this.getCurrentPlaybackTime = null;// () => number
        this.onSnapshotRequested = null;   // () => void
        this.captureSnapshot = null;       // () => Promise<string> | string
        this.onRemoteSnapshot = null;      // (imageDataUrl) => void

        // Ready handshake state
        this.localReady = false;
        this.remoteReady = false;

        // Snapshot rate limiting state (approx 1 every 10 seconds)
        this.lastSnapshotSentTime = 0;
        this.snapshotRateLimitMs = 10000;

        // Seek debounce state
        this.seekDebounceTimer = null;
        this.pendingSeekTimestamp = null;
        this.seekDebounceMs = 250;

        // Guard against remote echoes
        this.isProcessingRemote = false;

        // Sync interval state
        this.syncIntervalId = null;
        this.syncInterval = null; // alias
        this.driftThresholdSeconds = DRIFT_THRESHOLD_SECONDS;

        // Countdown state
        this.countdownTimeoutId = null;
        this.onCountdownTick = null;       // (secondsLeft) => void
        this.onCountdownComplete = null;   // () => void
        this.onDriftReport = null;         // (driftSeconds, wasCorrected) => void

        // Automatically wire incoming messages from SessionManager
        if (this.sessionManager && typeof this.sessionManager.onMessage === 'function') {
            this.sessionManager.onMessage((msg) => this.handleRemoteMessage(msg));
        }
    }

    // --- Ready Handshake ---

    setLocalReady(isReady = true) {
        this.localReady = !!isReady;
        console.log(`[SyncEngine] Local ready set to: ${this.localReady}`);
        if (this.sessionManager) {
            this.sessionManager.sendMessage({
                type: 'ready',
                ready: this.localReady,
                isReady: this.localReady,
                sentAt: Date.now()
            });
        }
        this.checkBothReady();
    }

    checkBothReady() {
        if (this.localReady && this.remoteReady) {
            console.log('[SyncEngine] Both peers report READY!');
            if (this.onBothReady) {
                this.onBothReady();
            }
            if (typeof window !== 'undefined' && window.AppEvents) {
                window.AppEvents.emit('bothReady');
            }
        }
    }

    // --- Local Operations ---

    localPlay(timestamp) {
        if (this.isProcessingRemote) {
            console.log('[SyncEngine] Suppressed outgoing play because remote command is active');
            return;
        }
        const time = typeof timestamp === 'number' ? timestamp : (this.getCurrentPlaybackTime ? this.getCurrentPlaybackTime() : 0);
        console.log('[SyncEngine] localPlay at:', time);
        if (this.sessionManager) {
            this.sessionManager.sendMessage(createPlayMessage ? createPlayMessage(time) : {
                type: 'play',
                timestamp: time,
                sentAt: Date.now()
            });
        }
    }

    localPause(timestamp, requestSnapshot = true) {
        if (this.isProcessingRemote) {
            console.log('[SyncEngine] Suppressed outgoing pause because remote command is active');
            return;
        }
        const time = typeof timestamp === 'number' ? timestamp : (this.getCurrentPlaybackTime ? this.getCurrentPlaybackTime() : 0);
        console.log('[SyncEngine] localPause at:', time);
        if (this.sessionManager) {
            this.sessionManager.sendMessage(createPauseMessage ? createPauseMessage(time, requestSnapshot) : {
                type: 'pause',
                timestamp: time,
                requestSnapshot: !!requestSnapshot,
                sentAt: Date.now()
            });
        }
    }

    localSeek(timestamp) {
        if (this.isProcessingRemote) {
            console.log('[SyncEngine] Suppressed outgoing seek because remote command is active');
            return;
        }

        this.pendingSeekTimestamp = typeof timestamp === 'number' ? timestamp : 0;
        if (this.seekDebounceTimer) {
            clearTimeout(this.seekDebounceTimer);
        }

        this.seekDebounceTimer = setTimeout(() => {
            if (this.pendingSeekTimestamp !== null) {
                console.log('[SyncEngine] localSeek (debounced final position) to:', this.pendingSeekTimestamp);
                if (this.sessionManager) {
                    this.sessionManager.sendMessage(createSeekMessage ? createSeekMessage(this.pendingSeekTimestamp) : {
                        type: 'seek',
                        timestamp: this.pendingSeekTimestamp,
                        sentAt: Date.now()
                    });
                }
                this.pendingSeekTimestamp = null;
            }
            this.seekDebounceTimer = null;
        }, this.seekDebounceMs);
    }

    sendPlay(timestamp) {
        this.localPlay(timestamp);
    }

    sendPause(timestamp, requestSnapshot = true) {
        this.localPause(timestamp, requestSnapshot);
    }

    sendSeek(timestamp) {
        this.localSeek(timestamp);
    }

    sendCountdown(startAtTime) {
        if (this.sessionManager) {
            this.sessionManager.sendMessage(createCountdownMessage ? createCountdownMessage(startAtTime) : {
                type: 'countdown',
                startTimestamp: startAtTime,
                startAt: startAtTime,
                sentAt: Date.now()
            });
        }
    }

    sendMediaMetadata(metadata) {
        if (this.sessionManager) {
            this.sessionManager.sendMessage({
                type: 'media_metadata',
                metadata,
                sentAt: Date.now()
            });
        }
    }

    sendSnapshotImage(imageDataUrl) {
        if (!imageDataUrl) {
            console.warn('[SyncEngine] Cannot send empty snapshot image.');
            return false;
        }

        const now = Date.now();
        const timeSinceLast = now - this.lastSnapshotSentTime;
        if (timeSinceLast < this.snapshotRateLimitMs) {
            const waitRemaining = Math.ceil((this.snapshotRateLimitMs - timeSinceLast) / 1000);
            console.warn(`[SyncEngine] Snapshot rate-limited! Please wait ${waitRemaining}s`);
            return false;
        }

        this.lastSnapshotSentTime = now;
        console.log('[SyncEngine] Transmitting snapshot image over WebRTC DataChannel (length: ' + imageDataUrl.length + ')');
        const msg = createSnapshotMessage ? createSnapshotMessage(imageDataUrl) : {
            type: 'snapshot_image',
            imageData: imageDataUrl,
            sentAt: Date.now()
        };
        return Boolean(this.sessionManager && this.sessionManager.sendMessage(msg));
    }

    async triggerSnapshotCaptureAndSend() {
        if (typeof this.captureSnapshot === 'function') {
            try {
                const image = await this.captureSnapshot();
                if (image) {
                    this.sendSnapshotImage(image);
                }
            } catch (err) {
                console.error('[SyncEngine] Error obtaining snapshot:', err);
            }
        }
    }

    // --- Periodic Sync Heartbeat ---

    startPeriodicSync() {
        this.stopPeriodicSync();
        this.syncIntervalId = setInterval(() => {
            this.sendSyncRequest();
        }, SYNC_INTERVAL_MS);
        this.syncInterval = this.syncIntervalId;
    }

    stopPeriodicSync() {
        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId);
            this.syncIntervalId = null;
            this.syncInterval = null;
        }
    }

    sendSyncRequest() {
        if (!this.sessionManager || this.sessionManager.getConnectionState() !== 'connected') {
            return;
        }
        const localPos = this._getLocalPosition();
        const req = createSyncRequest ? createSyncRequest() : {
            type: 'sync_request',
            timestamp: localPos,
            sentAt: Date.now()
        };
        this.sessionManager.sendMessage(req);
    }

    _sendSyncCheck() {
        this.sendSyncRequest();
    }

    _getLocalPosition() {
        if (typeof this.getCurrentPlaybackTime === 'function') {
            return this.getCurrentPlaybackTime();
        }
        if (this.getLocalPlaybackState) {
            const state = this.getLocalPlaybackState();
            return state ? state.currentTime : 0;
        }
        return 0;
    }

    // --- Remote Message Handling ---

    handleRemoteMessage(msg) {
        if (!msg || typeof msg !== 'object') return;

        switch (msg.type) {
            case 'play': {
                console.log('[SyncEngine] Received remote PLAY at:', msg.timestamp);
                this.isProcessingRemote = true;
                try {
                    if (this.onRemotePlay) this.onRemotePlay(msg.timestamp, msg);
                } finally {
                    this.isProcessingRemote = false;
                }
                break;
            }

            case 'pause': {
                console.log('[SyncEngine] Received remote PAUSE at:', msg.timestamp, 'requestSnapshot:', msg.requestSnapshot);
                this.isProcessingRemote = true;
                try {
                    if (this.onRemotePause) this.onRemotePause(msg.timestamp, msg);

                    if (msg.requestSnapshot) {
                        if (this.onSnapshotRequested) this.onSnapshotRequested();
                        if (typeof window !== 'undefined' && window.AppEvents) {
                            window.AppEvents.emit('snapshot_requested');
                            window.AppEvents.emit('remotePauseRequestedSnapshot');
                        }
                        this.triggerSnapshotCaptureAndSend();
                    }
                } finally {
                    this.isProcessingRemote = false;
                }
                break;
            }

            case 'seek': {
                console.log('[SyncEngine] Received remote SEEK to:', msg.timestamp);
                this.isProcessingRemote = true;
                try {
                    if (this.onRemoteSeek) this.onRemoteSeek(msg.timestamp, msg);
                } finally {
                    this.isProcessingRemote = false;
                }
                break;
            }

            case 'ready': {
                console.log('[SyncEngine] Received remote READY:', msg.ready !== undefined ? msg.ready : msg.isReady);
                this.remoteReady = !!(msg.ready !== undefined ? msg.ready : msg.isReady);
                if (typeof window !== 'undefined' && window.AppEvents) {
                    window.AppEvents.emit('partnerReadyChanged', this.remoteReady);
                }
                this.checkBothReady();
                break;
            }

            case 'sync_request': {
                const localPos = this._getLocalPosition();
                let isPlaying = false;
                if (this.getLocalPlaybackState) {
                    const st = this.getLocalPlaybackState();
                    if (st) isPlaying = !!st.isPlaying;
                }
                const res = createSyncResponse ? createSyncResponse(localPos, isPlaying, msg.sentAt) : {
                    type: 'sync_response',
                    timestamp: localPos,
                    isPlaying,
                    originalSentAt: msg.sentAt || Date.now(),
                    sentAt: Date.now()
                };
                if (this.sessionManager) {
                    this.sessionManager.sendMessage(res);
                }
                if (typeof msg.timestamp === 'number') {
                    this.evaluateDrift(msg.timestamp);
                }
                break;
            }

            case 'sync_response': {
                this.handleSyncResponse(msg);
                break;
            }

            case 'countdown': {
                const targetTime = msg.startTimestamp || msg.startAt;
                if (targetTime) {
                    this.startCountdownTimer(targetTime);
                }
                if (typeof window !== 'undefined' && window.AppEvents) {
                    window.AppEvents.emit('remoteCountdown', targetTime);
                }
                break;
            }

            case 'media_metadata': {
                if (typeof window !== 'undefined' && window.AppEvents) {
                    window.AppEvents.emit('partnerMediaMetadata', msg.metadata);
                }
                break;
            }

            case 'snapshot_image': {
                console.log('[SyncEngine] Received remote SNAPSHOT_IMAGE (length: ' + (msg.imageData ? msg.imageData.length : 0) + ')');
                if (msg.imageData) {
                    if (this.onRemoteSnapshot) {
                        this.onRemoteSnapshot(msg.imageData, msg);
                    }
                    if (typeof window !== 'undefined' && window.AppEvents) {
                        window.AppEvents.emit('receivedSnapshotImage', msg.imageData);
                    }
                }
                break;
            }

            default:
                break;
        }
    }

    handleSyncRequest(msg) {
        this.handleRemoteMessage(msg);
    }

    handleSyncResponse(msg) {
        const now = Date.now();
        const rtt = Math.max(0, now - (msg.originalSentAt || now));
        const oneWayLatencySeconds = (rtt / 2) / 1000;
        const estimatedRemoteTime = msg.timestamp + (msg.isPlaying ? oneWayLatencySeconds : 0);

        this.evaluateDrift(estimatedRemoteTime, rtt);
    }

    evaluateDrift(remoteTimestamp, rtt = 0) {
        const localPos = this._getLocalPosition();
        const driftSeconds = Math.abs(localPos - remoteTimestamp);
        const driftMs = Math.round(driftSeconds * 1000);
        const needsCorrection = driftSeconds >= this.driftThresholdSeconds;

        console.log(`[SyncEngine] Drift evaluation: local=${localPos.toFixed(3)}s, remote=${remoteTimestamp.toFixed(3)}s, diff=${driftMs}ms (RTT: ${rtt}ms). Correction needed: ${needsCorrection}`);

        if (typeof window !== 'undefined' && window.AppEvents) {
            window.AppEvents.emit('driftUpdated', driftMs);
        }

        if (needsCorrection) {
            if (this.applyDriftCorrection) {
                this.applyDriftCorrection(remoteTimestamp);
            }
            if (this.onDriftCorrection) {
                this.onDriftCorrection(remoteTimestamp, driftMs);
            }
        }

        if (this.onDriftReport) {
            this.onDriftReport(driftSeconds, needsCorrection);
        }
    }

    // --- Countdown Coordination ---

    initiateCountdown(delayMs = 3000) {
        const startTime = Date.now() + delayMs;
        this.sendCountdown(startTime);
        this.startCountdownTimer(startTime);
    }

    startCountdownTimer(targetTimestamp) {
        if (this.countdownTimeoutId) {
            clearTimeout(this.countdownTimeoutId);
        }

        const updateInterval = 100;
        const tick = () => {
            const remainingMs = targetTimestamp - Date.now();
            if (remainingMs <= 0) {
                if (this.onCountdownTick) this.onCountdownTick(0);
                if (this.onCountdownComplete) this.onCountdownComplete();
            } else {
                const secondsLeft = Math.ceil(remainingMs / 1000);
                if (this.onCountdownTick) this.onCountdownTick(secondsLeft);
                this.countdownTimeoutId = setTimeout(tick, updateInterval);
            }
        };

        tick();
    }

    cancelCountdown() {
        if (this.countdownTimeoutId) {
            clearTimeout(this.countdownTimeoutId);
            this.countdownTimeoutId = null;
        }
    }
}

// Global browser instance
if (typeof window !== 'undefined') {
    window.SyncEngine = SyncEngine;
}

// Export for module/browser usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SyncEngine, DRIFT_THRESHOLD_SECONDS, SYNC_INTERVAL_MS };
}
