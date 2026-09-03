/**
 * Person B — WebRTC module
 * Manages RTCPeerConnection and RTCDataChannel using STUN.
 */

class WebRTCConnection {
  constructor(config = {}) {
    this.iceServers = config.iceServers || [
      { urls: 'stun:stun.l.google.com:19302' }
    ];
    this.peerConnection = null;
    this.dataChannel = null;
    this.isHost = false;
    this.onMessageCallback = null;
    this.onStateChangeCallback = null;
  }

  initPeerConnection() {
    if (this.peerConnection) {
      this.close();
    }

    this.peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers
    });

    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection ? this.peerConnection.connectionState : 'closed';
      console.log(`[WebRTC] Connection state changed: ${state}`);
      if (this.onStateChangeCallback) {
        this.onStateChangeCallback(state);
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE connection state: ${this.peerConnection.iceConnectionState}`);
    };
  }

  setupDataChannel(channel) {
    this.dataChannel = channel;
    this.dataChannel.onopen = () => {
      console.log('[WebRTC] RTCDataChannel opened successfully');
      if (this.onStateChangeCallback) {
        this.onStateChangeCallback('connected');
      }
    };

    this.dataChannel.onclose = () => {
      console.log('[WebRTC] RTCDataChannel closed');
      if (this.onStateChangeCallback) {
        this.onStateChangeCallback('disconnected');
      }
    };

    this.dataChannel.onerror = (err) => {
      console.error('[WebRTC] RTCDataChannel error:', err);
    };

    this.dataChannel.onmessage = (event) => {
      if (this.onMessageCallback) {
        this.onMessageCallback(event.data);
      }
    };
  }

  // Waits until ICE gathering is complete so offer/answer contains all candidates
  waitForIceGatheringComplete() {
    return new Promise((resolve) => {
      if (this.peerConnection.iceGatheringState === 'complete') {
        resolve();
        return;
      }

      const checkState = () => {
        if (this.peerConnection.iceGatheringState === 'complete') {
          this.peerConnection.removeEventListener('icegatheringstatechange', checkState);
          resolve();
        }
      };

      this.peerConnection.addEventListener('icegatheringstatechange', checkState);

      // Safety timeout in case gathering takes too long
      setTimeout(() => {
        resolve();
      }, 4000);
    });
  }

  async createOffer() {
    this.isHost = true;
    this.initPeerConnection();

    // Host creates the data channel
    const channel = this.peerConnection.createDataChannel('watchPartyChannel', {
      ordered: true
    });
    this.setupDataChannel(channel);

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);

    await this.waitForIceGatheringComplete();
    return this.peerConnection.localDescription;
  }

  async handleOfferAndCreateAnswer(remoteOffer) {
    this.isHost = false;
    this.initPeerConnection();

    // Guest listens for the data channel created by Host
    this.peerConnection.ondatachannel = (event) => {
      console.log('[WebRTC] Guest received remote data channel');
      this.setupDataChannel(event.channel);
    };

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(remoteOffer));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    await this.waitForIceGatheringComplete();
    return this.peerConnection.localDescription;
  }

  async handleAnswer(remoteAnswer) {
    if (!this.peerConnection) {
      throw new Error('PeerConnection not initialized.');
    }
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(remoteAnswer));
  }

  send(data) {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      console.warn('[WebRTC] Cannot send, data channel not open. ReadyState:', this.dataChannel?.readyState);
      return false;
    }
    this.dataChannel.send(data);
    return true;
  }

  getConnectionState() {
    if (!this.dataChannel) return 'disconnected';
    if (this.dataChannel.readyState === 'open') return 'connected';
    return this.peerConnection?.connectionState || 'disconnected';
  }

  close() {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }
}

window.WebRTCConnection = WebRTCConnection;
