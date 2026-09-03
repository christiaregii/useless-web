/**
 * Watch Party - WebRTC Module (Person B: Network/Sync)
 * Wraps RTCPeerConnection and RTCDataChannel lifecycle.
 */

class WebRTCManager {
    constructor() {
        this.pc = null;
        this.dataChannel = null;
        this.role = null; // 'host' | 'guest'
        this.connectionState = 'disconnected'; // 'disconnected' | 'connecting' | 'connected' | 'failed' | 'closed'

        this.onMessageCallback = null;
        this.onConnectionStateCallback = null;

        this.iceServers = [
            { urls: 'stun:stun.l.google.com:19302' }
        ];
    }

    /**
     * Initializes a fresh RTCPeerConnection with STUN.
     */
    _initPeerConnection() {
        this.close();

        this.pc = new RTCPeerConnection({
            iceServers: this.iceServers
        });

        this.pc.onconnectionstatechange = () => {
            if (!this.pc) return;
            console.log('[WebRTC] PeerConnection state:', this.pc.connectionState);
            this._updateConnectionState(this.pc.connectionState);
        };

        this.pc.oniceconnectionstatechange = () => {
            if (!this.pc) return;
            console.log('[WebRTC] ICE connection state:', this.pc.iceConnectionState);
            if (this.pc.iceConnectionState === 'failed') {
                this._updateConnectionState('failed');
            } else if (this.pc.iceConnectionState === 'disconnected') {
                this._updateConnectionState('disconnected');
            }
        };
    }

    /**
     * Binds lifecycle listeners to an RTCDataChannel.
     */
    _bindDataChannel(dc) {
        this.dataChannel = dc;
        this.dataChannel.binaryType = 'arraybuffer';

        this.dataChannel.onopen = () => {
            console.log('[WebRTC] DataChannel OPEN:', this.dataChannel.label);
            this._updateConnectionState('connected');
        };

        this.dataChannel.onclose = () => {
            console.log('[WebRTC] DataChannel CLOSED');
            this._updateConnectionState('disconnected');
        };

        this.dataChannel.onerror = (err) => {
            console.error('[WebRTC] DataChannel error:', err);
        };

        this.dataChannel.onmessage = (event) => {
            if (this.onMessageCallback) {
                this.onMessageCallback(event.data);
            }
        };
    }

    _updateConnectionState(state) {
        this.connectionState = state;
        if (this.onConnectionStateCallback) {
            this.onConnectionStateCallback(state);
        }
    }

    /**
     * Creates Host Session: builds PC, creates DataChannel, creates offer, gathers ICE.
     * Returns the packed offer string to share with guest.
     */
    async createHostOffer() {
        this.role = 'host';
        this._initPeerConnection();
        this._updateConnectionState('connecting');

        // Host creates the data channel
        const dc = this.pc.createDataChannel('watch-party-sync', {
            ordered: true
        });
        this._bindDataChannel(dc);

        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);

        // Wait for ICE candidate gathering so candidates are embedded
        await waitForIceGatheringComplete(this.pc);

        return packSignal(this.pc.localDescription);
    }

    /**
     * Host accepts the Guest's answer token.
     */
    async acceptAnswer(answerToken) {
        if (!this.pc) {
            throw new Error('No active peer connection to accept answer');
        }
        const desc = unpackSignal(answerToken);
        if (desc.type !== 'answer') {
            throw new Error(`Expected "answer" token, received "${desc.type}"`);
        }
        await this.pc.setRemoteDescription(new RTCSessionDescription(desc));
        console.log('[WebRTC] Host set remote answer successfully');
    }

    /**
     * Creates Guest Session from Host's offer token: sets remote desc, creates answer, gathers ICE.
     * Returns the packed answer string to share with host.
     */
    async createGuestAnswer(offerToken) {
        this.role = 'guest';
        this._initPeerConnection();
        this._updateConnectionState('connecting');

        // Guest listens for incoming data channel
        this.pc.ondatachannel = (event) => {
            console.log('[WebRTC] Guest received DataChannel from host');
            this._bindDataChannel(event.channel);
        };

        const desc = unpackSignal(offerToken);
        if (desc.type !== 'offer') {
            throw new Error(`Expected "offer" token, received "${desc.type}"`);
        }
        await this.pc.setRemoteDescription(new RTCSessionDescription(desc));

        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        // Wait for ICE candidate gathering
        await waitForIceGatheringComplete(this.pc);

        return packSignal(this.pc.localDescription);
    }

    /**
     * Sends a raw string or serializable object across the DataChannel.
     */
    send(payload) {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            console.warn('[WebRTC] Cannot send message: DataChannel is not open');
            return false;
        }

        const data = typeof payload === 'string' ? payload : JSON.stringify(payload);
        this.dataChannel.send(data);
        return true;
    }

    /**
     * Closes the connection and resets state.
     */
    close() {
        if (this.dataChannel) {
            try {
                this.dataChannel.close();
            } catch (_) {}
            this.dataChannel = null;
        }
        if (this.pc) {
            try {
                this.pc.close();
            } catch (_) {}
            this.pc = null;
        }
        if (this.connectionState !== 'disconnected' && this.connectionState !== 'closed') {
            this._updateConnectionState('disconnected');
        }
    }

    getConnectionState() {
        return this.connectionState;
    }

    setMessageHandler(cb) {
        this.onMessageCallback = cb;
    }

    setConnectionStateChangeHandler(cb) {
        this.onConnectionStateCallback = cb;
    }
}

// Export for module/browser usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { WebRTCManager };
}
