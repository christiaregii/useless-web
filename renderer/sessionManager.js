/**
 * Person B — Session Manager
 * Exposes the standard public networking contract for Person A.
 */

class SessionManager {
  constructor() {
    this.webrtc = new WebRTCConnection();
    this.messageListeners = [];
    this.stateListeners = [];

    this.webrtc.onMessageCallback = (rawString) => {
      const parsed = window.Protocol.parseMessage(rawString);
      if (parsed) {
        this.notifyMessageListeners(parsed);
      }
    };

    this.webrtc.onStateChangeCallback = (state) => {
      this.notifyStateListeners(state);
    };
  }

  // Host creates an offer and returns the encoded signaling code
  async createHostSession() {
    const localDescription = await this.webrtc.createOffer();
    return window.Signaling.encodeSignal(localDescription);
  }

  // Guest can set remote offer directly, or generate answer via createGuestSession
  async setRemoteOffer(offerCode) {
    return this.createGuestSession(offerCode);
  }

  // Guest sets the host's offer and generates an encoded answer
  async createGuestSession(offerCode) {
    if (!offerCode) {
      throw new Error('Offer code is required to create guest session.');
    }
    const offerObj = window.Signaling.decodeSignal(offerCode);
    const answerDescription = await this.webrtc.handleOfferAndCreateAnswer(offerObj);
    return window.Signaling.encodeSignal(answerDescription);
  }

  // Host sets the answer code returned from the guest
  async setRemoteAnswer(answerCode) {
    const answerObj = window.Signaling.decodeSignal(answerCode);
    await this.webrtc.handleAnswer(answerObj);
  }

  // Sends raw or structured message
  sendMessage(message) {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    return this.webrtc.send(payload);
  }

  onMessage(callback) {
    if (typeof callback === 'function') {
      this.messageListeners.push(callback);
    }
  }

  onConnectionStateChange(callback) {
    if (typeof callback === 'function') {
      this.stateListeners.push(callback);
    }
  }

  notifyMessageListeners(parsed) {
    for (const cb of this.messageListeners) {
      try {
        cb(parsed);
      } catch (err) {
        console.error('[SessionManager] Listener error:', err);
      }
    }
  }

  notifyStateListeners(state) {
    for (const cb of this.stateListeners) {
      try {
        cb(state);
      } catch (err) {
        console.error('[SessionManager] State listener error:', err);
      }
    }
  }

  getConnectionState() {
    return this.webrtc.getConnectionState();
  }

  closeConnection() {
    this.webrtc.close();
  }
}

window.SessionManager = SessionManager;
