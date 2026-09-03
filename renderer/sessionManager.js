/**
 * Watch Party - Session Manager (Person B: Network/Sync)
 * Implements the shared contract interface for Person A (Media/UI).
 */

class SessionManager {
    constructor() {
        this.webrtc = new WebRTCManager();
        this.messageCallbacks = new Set();
        this.stateChangeCallbacks = new Set();

        // Wire WebRTC internal callbacks
        this.webrtc.setMessageHandler((rawData) => {
            this._handleIncomingRawData(rawData);
        });

        this.webrtc.setConnectionStateChangeHandler((state) => {
            this._notifyStateChange(state);
        });
    }

    _handleIncomingRawData(raw) {
        const msg = parseAndValidateMessage(raw);
        if (!msg) {
            console.warn('[SessionManager] Dropped invalid message payload');
            return;
        }

        for (const cb of this.messageCallbacks) {
            try {
                cb(msg);
            } catch (err) {
                console.error('[SessionManager] Error in message callback:', err);
            }
        }
    }

    _notifyStateChange(state) {
        for (const cb of this.stateChangeCallbacks) {
            try {
                cb(state);
            } catch (err) {
                console.error('[SessionManager] Error in state change callback:', err);
            }
        }
    }

    /**
     * Shared Contract Methods
     */

    /**
     * Starts Host Session. Returns packed offer code string to be shared with Guest.
     */
    async createHostSession() {
        console.log('[SessionManager] Creating host session...');
        const offerCode = await this.webrtc.createHostOffer();
        return offerCode;
    }

    /**
     * Starts Guest Session using Host's offer code.
     * Returns packed answer code string to return to Host.
     */
    async createGuestSession(offerCode) {
        console.log('[SessionManager] Creating guest session from offer...');
        const answerCode = await this.webrtc.createGuestAnswer(offerCode);
        return answerCode;
    }

    /**
     * Alternative alias for guest setting remote offer.
     */
    async setRemoteOffer(offerCode) {
        return this.createGuestSession(offerCode);
    }

    /**
     * Host sets the remote answer received from Guest.
     */
    async setRemoteAnswer(answerCode) {
        console.log('[SessionManager] Host applying remote answer...');
        await this.webrtc.acceptAnswer(answerCode);
    }

    /**
     * Sends a protocol message over the WebRTC DataChannel.
     */
    sendMessage(message) {
        if (!message || typeof message !== 'object') {
            console.warn('[SessionManager] Cannot send non-object message');
            return false;
        }
        return this.webrtc.send(message);
    }

    /**
     * Subscribes a listener for validated incoming protocol messages.
     */
    onMessage(callback) {
        if (typeof callback === 'function') {
            this.messageCallbacks.add(callback);
        }
    }

    /**
     * Unsubscribes a message listener.
     */
    offMessage(callback) {
        this.messageCallbacks.delete(callback);
    }

    /**
     * Subscribes a listener for connection state changes:
     * 'disconnected' | 'connecting' | 'connected' | 'failed' | 'closed'
     */
    onConnectionStateChange(callback) {
        if (typeof callback === 'function') {
            this.stateChangeCallbacks.add(callback);
        }
    }

    /**
     * Unsubscribes a state change listener.
     */
    offConnectionStateChange(callback) {
        this.stateChangeCallbacks.delete(callback);
    }

    /**
     * Returns the current connection state.
     */
    getConnectionState() {
        return this.webrtc.getConnectionState();
    }

    /**
     * Closes the active session and WebRTC peer connection.
     */
    closeConnection() {
        console.log('[SessionManager] Closing connection...');
        this.webrtc.close();
    }
}

// Global browser instance
if (typeof window !== 'undefined') {
    window.SessionManager = SessionManager;
}

// Export for module/browser usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { SessionManager };
}
