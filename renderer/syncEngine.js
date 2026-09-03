/**
 * Watch Party - Sync Engine (Person B: Network/Sync)
 * Handles drift measurement, periodic heartbeat, and synchronized countdown.
 */

const DRIFT_THRESHOLD_SECONDS = 0.3; // 300ms
const SYNC_INTERVAL_MS = 5000;       // 5 seconds

class SyncEngine {
    constructor(sessionManager, getLocalPlaybackState, applyDriftCorrection) {
        this.sessionManager = sessionManager;
        /**
         * Function returning { currentTime: number, isPlaying: boolean, isReady: boolean }
         */
        this.getLocalPlaybackState = getLocalPlaybackState;
        /**
         * Function to execute correction: (targetTimestamp) => void
         */
        this.applyDriftCorrection = applyDriftCorrection;

        this.syncIntervalId = null;
        this.countdownTimeoutId = null;
        this.onCountdownTick = null; // (secondsLeft) => void
        this.onCountdownComplete = null; // () => void
        this.onDriftReport = null; // (driftSeconds, wasCorrected) => void
    }

    /**
     * Starts the periodic 5-second sync heartbeat.
     */
    startPeriodicSync() {
        this.stopPeriodicSync();
        this.syncIntervalId = setInterval(() => {
            this._sendSyncCheck();
        }, SYNC_INTERVAL_MS);
    }

    stopPeriodicSync() {
        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId);
            this.syncIntervalId = null;
        }
    }

    _sendSyncCheck() {
        if (this.sessionManager.getConnectionState() !== 'connected') {
            return;
        }
        const localState = this.getLocalPlaybackState();
        if (!localState || !localState.isReady || !localState.isPlaying) {
            return;
        }

        const req = createSyncRequest();
        this.sessionManager.sendMessage(req);
    }

    /**
     * Handles incoming sync_request from peer:
     * Immediately replies with current local playback state.
     */
    handleSyncRequest(msg) {
        const localState = this.getLocalPlaybackState();
        if (!localState) return;

        const res = createSyncResponse(
            localState.currentTime,
            localState.isPlaying,
            msg.sentAt
        );
        this.sessionManager.sendMessage(res);
    }

    /**
     * Handles incoming sync_response from peer:
     * Calculates RTT and drift; applies correction if drift >= 300ms.
     */
    handleSyncResponse(msg) {
        const now = Date.now();
        const rtt = Math.max(0, now - (msg.originalSentAt || now));
        const oneWayLatencySeconds = (rtt / 2) / 1000;

        // If the peer was playing, advance their reported time by estimated one-way latency
        const estimatedRemoteTime = msg.timestamp + (msg.isPlaying ? oneWayLatencySeconds : 0);

        const localState = this.getLocalPlaybackState();
        if (!localState || !localState.isPlaying) {
            return;
        }

        const drift = Math.abs(localState.currentTime - estimatedRemoteTime);
        const needsCorrection = drift >= DRIFT_THRESHOLD_SECONDS;

        console.log(`[SyncEngine] Drift: ${(drift * 1000).toFixed(1)}ms (RTT: ${rtt}ms). Correction needed: ${needsCorrection}`);

        if (needsCorrection && this.applyDriftCorrection) {
            this.applyDriftCorrection(estimatedRemoteTime);
        }

        if (this.onDriftReport) {
            this.onDriftReport(drift, needsCorrection);
        }
    }

    /**
     * Initiates a synchronized 3-second countdown broadcast.
     */
    initiateCountdown(delayMs = 3000) {
        const startTime = Date.now() + delayMs;
        const msg = createCountdownMessage(startTime);
        this.sessionManager.sendMessage(msg);
        this.startCountdownTimer(startTime);
    }

    /**
     * Starts the local countdown timer targeting exact absolute timestamp.
     */
    startCountdownTimer(targetTimestamp) {
        if (this.countdownTimeoutId) {
            clearTimeout(this.countdownTimeoutId);
        }

        const updateInterval = 100; // frequent tick for smooth UI countdown
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

// Export for module/browser usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SyncEngine, DRIFT_THRESHOLD_SECONDS, SYNC_INTERVAL_MS };
}
