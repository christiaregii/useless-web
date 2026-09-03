/**
 * Person B — Synchronization Engine
 * Handles:
 * - play/pause/seek synchronization
 * - feedback loop prevention
 * - ready handshake & both_ready detection
 * - periodic drift synchronization (~5s) & 300ms threshold correction
 *
 * ARCHITECTURAL RULE:
 * SyncEngine communicates strictly through the SessionManager and callbacks.
 * It does NOT directly manipulate the HTML video element.
 */

class SyncEngine {
  constructor(sessionManager) {
    this.sessionManager = sessionManager;

    // Callbacks to notify Media/UI layer (Person A)
    this.onRemotePlay = null;
    this.onRemotePause = null;
    this.onRemoteSeek = null;
    this.onBothReady = null;
    this.onDriftCorrection = null; // (targetTimestamp, driftMs) => void
    this.getCurrentPlaybackTime = null; // () => number (provided by media layer)

    // Snapshot hooks (Person B <-> Person A contract)
    this.onSnapshotRequested = null; // Called when remote peer pauses and requests snapshot
    this.captureSnapshot = null; // () => Promise<string> | string (provided by media layer)
    this.onRemoteSnapshot = null; // (imageDataUrl) => void (when partner's snapshot arrives)

    // Snapshot rate limiting state (approx 1 every 10 seconds)
    this.lastSnapshotSentTime = 0;
    this.snapshotRateLimitMs = 10000;

    // Ready handshake state
    this.localReady = false;
    this.remoteReady = false;

    // Seek debounce state to ensure only final seek position is transmitted
    this.seekDebounceTimer = null;
    this.pendingSeekTimestamp = null;
    this.seekDebounceMs = 250; // 250ms debounce for scrubbing/sliders

    // Guard flag to strictly prevent remote events from triggering outgoing messages
    this.isProcessingRemote = false;

    // Periodic sync interval (~5 seconds)
    this.syncInterval = null;
    this.driftThresholdSeconds = 0.3; // 300ms MVP threshold

    // Hook incoming network messages from SessionManager
    this.sessionManager.onMessage((msg) => this.handleRemoteMessage(msg));
  }

  // --- Ready Handshake ---

  setLocalReady(isReady = true) {
    this.localReady = !!isReady;
    console.log(`[SyncEngine] Local ready set to: ${this.localReady}`);
    const msg = window.Protocol.createMessage(window.Protocol.MessageTypes.READY, {
      ready: this.localReady
    });
    this.sessionManager.sendMessage(msg);
    this.checkBothReady();
  }

  // Alias for backward compatibility
  sendReady(isReady = true) {
    this.setLocalReady(isReady);
  }

  checkBothReady() {
    if (this.localReady && this.remoteReady) {
      console.log('[SyncEngine] Both peers are READY! Emitting both_ready.');
      if (this.onBothReady) {
        this.onBothReady();
      }
      if (window.AppEvents) {
        window.AppEvents.emit('both_ready');
      }
    }
  }

  // --- Periodic Synchronization & Drift Correction ---

  startPeriodicSync(intervalMs = 5000) {
    this.stopPeriodicSync();
    console.log(`[SyncEngine] Starting periodic sync every ${intervalMs}ms`);
    this.syncInterval = setInterval(() => {
      if (this.sessionManager.getConnectionState() === 'connected') {
        this.sendSyncRequest();
      }
    }, intervalMs);
  }

  stopPeriodicSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
      console.log('[SyncEngine] Stopped periodic sync.');
    }
  }

  sendSyncRequest() {
    const currentPosition = typeof this.getCurrentPlaybackTime === 'function'
      ? this.getCurrentPlaybackTime()
      : 0;

    const msg = window.Protocol.createMessage(window.Protocol.MessageTypes.SYNC_REQUEST, {
      timestamp: currentPosition
    });
    this.sessionManager.sendMessage(msg);
  }

  // --- Local Event Handlers (Called by Person A / Media Layer) ---

  localPlay(timestamp) {
    if (this.isProcessingRemote) {
      console.log('[SyncEngine] Suppressed outgoing play because remote command is active');
      return;
    }
    const time = typeof timestamp === 'number' ? timestamp : 0;
    console.log('[SyncEngine] localPlay at:', time);
    const msg = window.Protocol.createMessage(window.Protocol.MessageTypes.PLAY, {
      timestamp: time
    });
    this.sessionManager.sendMessage(msg);
  }

  localPause(timestamp, requestSnapshot = true) {
    if (this.isProcessingRemote) {
      console.log('[SyncEngine] Suppressed outgoing pause because remote command is active');
      return;
    }
    const time = typeof timestamp === 'number' ? timestamp : 0;
    console.log('[SyncEngine] localPause at:', time);
    const msg = window.Protocol.createMessage(window.Protocol.MessageTypes.PAUSE, {
      timestamp: time,
      requestSnapshot
    });
    this.sessionManager.sendMessage(msg);
  }

  localSeek(timestamp) {
    if (this.isProcessingRemote) {
      console.log('[SyncEngine] Suppressed outgoing seek because remote command is active');
      return;
    }

    // Debounce seek: Only send final position when seek operation settles
    this.pendingSeekTimestamp = typeof timestamp === 'number' ? timestamp : 0;
    if (this.seekDebounceTimer) {
      clearTimeout(this.seekDebounceTimer);
    }

    this.seekDebounceTimer = setTimeout(() => {
      if (this.pendingSeekTimestamp !== null) {
        console.log('[SyncEngine] localSeek (debounced final position) to:', this.pendingSeekTimestamp);
        const msg = window.Protocol.createMessage(window.Protocol.MessageTypes.SEEK, {
          timestamp: this.pendingSeekTimestamp
        });
        this.sessionManager.sendMessage(msg);
        this.pendingSeekTimestamp = null;
      }
      this.seekDebounceTimer = null;
    }, this.seekDebounceMs);
  }

  // Aliases for compatibility
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
    const msg = window.Protocol.createMessage(window.Protocol.MessageTypes.COUNTDOWN, {
      startAt: startAtTime
    });
    this.sessionManager.sendMessage(msg);
  }

  sendMediaMetadata(metadata) {
    const msg = window.Protocol.createMessage(window.Protocol.MessageTypes.MEDIA_METADATA, {
      metadata
    });
    this.sessionManager.sendMessage(msg);
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
      console.warn(`[SyncEngine] Snapshot rate-limited! Please wait ${waitRemaining}s before sending another snapshot.`);
      return false;
    }

    this.lastSnapshotSentTime = now;
    console.log('[SyncEngine] Transmitting snapshot image over WebRTC DataChannel (length: ' + imageDataUrl.length + ')');
    const msg = window.Protocol.createMessage(window.Protocol.MessageTypes.SNAPSHOT_IMAGE, {
      imageData: imageDataUrl
    });
    return this.sessionManager.sendMessage(msg);
  }

  async triggerSnapshotCaptureAndSend() {
    if (typeof this.captureSnapshot === 'function') {
      try {
        const image = await this.captureSnapshot();
        if (image) {
          this.sendSnapshotImage(image);
        }
      } catch (err) {
        console.error('[SyncEngine] Error obtaining snapshot from media provider:', err);
      }
    }
  }

  // --- Remote Message Dispatcher ---

  handleRemoteMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    const types = window.Protocol.MessageTypes;

    switch (msg.type) {
      case types.PLAY: {
        console.log('[SyncEngine] Received remote PLAY at:', msg.timestamp);
        this.isProcessingRemote = true;
        try {
          if (this.onRemotePlay) {
            this.onRemotePlay(msg.timestamp, msg);
          }
        } finally {
          this.isProcessingRemote = false;
        }
        break;
      }

      case types.PAUSE: {
        console.log('[SyncEngine] Received remote PAUSE at:', msg.timestamp, 'requestSnapshot:', msg.requestSnapshot);
        this.isProcessingRemote = true;
        try {
          if (this.onRemotePause) {
            this.onRemotePause(msg.timestamp, msg);
          }

          // If peer requested a snapshot, emit snapshot_requested event
          if (msg.requestSnapshot) {
            console.log('[SyncEngine] Emitting snapshot_requested to media layer');
            if (this.onSnapshotRequested) {
              this.onSnapshotRequested();
            }
            if (window.AppEvents) {
              window.AppEvents.emit('snapshot_requested');
              window.AppEvents.emit('remotePauseRequestedSnapshot');
            }
            // If media layer bound captureSnapshot directly to SyncEngine, capture and transmit automatically
            this.triggerSnapshotCaptureAndSend();
          }
        } finally {
          this.isProcessingRemote = false;
        }
        break;
      }

      case types.SEEK: {
        console.log('[SyncEngine] Received remote SEEK to:', msg.timestamp);
        this.isProcessingRemote = true;
        try {
          if (this.onRemoteSeek) {
            this.onRemoteSeek(msg.timestamp, msg);
          }
        } finally {
          this.isProcessingRemote = false;
        }
        break;
      }

      case types.READY: {
        console.log('[SyncEngine] Received remote READY:', msg.ready);
        this.remoteReady = !!msg.ready;
        if (window.AppEvents) {
          window.AppEvents.emit('partnerReadyChanged', this.remoteReady);
        }
        this.checkBothReady();
        break;
      }

      case types.SYNC_REQUEST: {
        // Peer is asking for sync position; respond with our current playback position
        const localPosition = typeof this.getCurrentPlaybackTime === 'function'
          ? this.getCurrentPlaybackTime()
          : 0;

        const response = window.Protocol.createMessage(types.SYNC_RESPONSE, {
          timestamp: localPosition
        });
        this.sessionManager.sendMessage(response);

        // Also evaluate remote timestamp against our local position
        if (typeof msg.timestamp === 'number') {
          this.evaluateDrift(msg.timestamp);
        }
        break;
      }

      case types.SYNC_RESPONSE: {
        // Evaluate partner's reported position
        if (typeof msg.timestamp === 'number') {
          this.evaluateDrift(msg.timestamp);
        }
        break;
      }

      case types.COUNTDOWN: {
        if (window.AppEvents) {
          window.AppEvents.emit('remoteCountdown', msg.startAt);
        }
        break;
      }

      case types.MEDIA_METADATA: {
        if (window.AppEvents) {
          window.AppEvents.emit('partnerMediaMetadata', msg.metadata);
        }
        break;
      }

      case types.SNAPSHOT_IMAGE: {
        console.log('[SyncEngine] Received remote SNAPSHOT_IMAGE (length: ' + (msg.imageData ? msg.imageData.length : 0) + ')');
        if (msg.imageData) {
          if (this.onRemoteSnapshot) {
            this.onRemoteSnapshot(msg.imageData, msg);
          }
          if (window.AppEvents) {
            window.AppEvents.emit('receivedSnapshotImage', msg.imageData);
          }
        }
        break;
      }

      default:
        console.log('[SyncEngine] Other message type received:', msg.type);
    }
  }

  evaluateDrift(remoteTimestamp) {
    const localPosition = typeof this.getCurrentPlaybackTime === 'function'
      ? this.getCurrentPlaybackTime()
      : 0;

    const driftSeconds = Math.abs(localPosition - remoteTimestamp);
    const driftMs = Math.round(driftSeconds * 1000);

    console.log(`[SyncEngine] Drift evaluation: local=${localPosition.toFixed(3)}s, remote=${remoteTimestamp.toFixed(3)}s, diff=${driftMs}ms`);

    if (window.AppEvents) {
      window.AppEvents.emit('driftUpdated', driftMs);
    }

    // MVP DRIFT RULE:
    // difference < 300ms => no correction
    // difference >= 300ms => request/apply correction
    if (driftSeconds >= this.driftThresholdSeconds) {
      console.warn(`[SyncEngine] Drift of ${driftMs}ms exceeds 300ms threshold! Requesting correction to ${remoteTimestamp.toFixed(3)}s`);
      if (this.onDriftCorrection) {
        this.onDriftCorrection(remoteTimestamp, driftMs);
      }
    } else {
      console.log(`[SyncEngine] Drift of ${driftMs}ms is within 300ms tolerance. No correction needed.`);
    }
  }
}

window.SyncEngine = SyncEngine;
