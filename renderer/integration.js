/**
 * Person A — Integration module
 * Connects UI, VideoController, SnapshotManager, and Person B's SessionManager/SyncEngine.
 */

class Integration {
  constructor() {
    this.videoEl = document.getElementById('main-video');
    this.sessionManager = new window.SessionManager();
    this.videoController = new window.VideoController(this.videoEl);
    this.syncEngine = new window.SyncEngine(this.sessionManager);
    this.snapshotManager = new window.SnapshotManager();
    this.ui = new window.UIManager();

    // Connect Person B's SyncEngine remote callbacks to Person A's VideoController
    this.syncEngine.onRemotePlay = (timestamp) => {
      this.videoController.applyRemotePlay();
    };

    this.syncEngine.onRemotePause = (timestamp) => {
      this.videoController.applyRemotePause();
    };

    this.syncEngine.onRemoteSeek = (timestamp) => {
      this.videoController.applyRemoteSeek(timestamp);
    };

    this.syncEngine.getCurrentPlaybackTime = () => {
      return this.videoController.getCurrentTime();
    };

    this.syncEngine.onDriftCorrection = (targetTime, driftMs) => {
      console.log(`[Integration] Applying drift correction (${driftMs}ms) to ${targetTime}`);
      this.videoController.applyRemoteSeek(targetTime);
    };

    this.syncEngine.captureSnapshot = () => {
      if (window.AppState.cameraAllowed) {
        return this.snapshotManager.captureSnapshot();
      }
      return null;
    };

    this.syncEngine.onRemoteSnapshot = (dataUrl) => {
      console.log('[Integration] Received partner snapshot, displaying popup');
      this.ui.showSnapshot(dataUrl);
    };

    this.bindEvents();
  }

  bindEvents() {
    // 1. Connection State handling
    this.sessionManager.onConnectionStateChange((state) => {
      window.AppState.connectionState = state;
      this.ui.updateConnectionStatus(state);

      if (state === 'connected') {
        this.ui.showToast('WebRTC DataChannel Connected!', 'success');
        this.ui.hideConnectionModal();

        // Share media metadata if already selected
        if (window.AppState.localFileLoaded) {
          this.syncEngine.sendMediaMetadata({
            fileName: window.AppState.localFileName,
            duration: window.AppState.localDuration
          });
        }
      } else if (state === 'disconnected' || state === 'failed') {
        this.ui.showToast('Peer connection lost or closed.', 'danger');
      }
    });

    // 2. Video Controller local events -> Network (Person B)
    this.videoController.onLocalPlay = (time) => {
      console.log('[Integration] Dispatching local play event to partner');
      this.syncEngine.localPlay(time);
    };

    this.videoController.onLocalPause = (time) => {
      console.log('[Integration] Dispatching local pause event to partner with snapshot request');
      this.syncEngine.localPause(time, true);
    };

    this.videoController.onLocalSeek = (time) => {
      console.log('[Integration] Dispatching local seek event to partner');
      this.syncEngine.localSeek(time);
    };

    this.videoController.onMetadataLoaded = (meta) => {
      window.AppState.localDuration = meta.duration;
      if (this.sessionManager.getConnectionState() === 'connected') {
        this.syncEngine.sendMediaMetadata({
          fileName: window.AppState.localFileName,
          duration: meta.duration
        });
      }
    };

    // 3. App Events (received from SyncEngine or UI)
    window.AppEvents.on('remotePauseRequestedSnapshot', async () => {
      console.log('[Integration] Remote pause requested webcam snapshot');
      if (window.AppState.cameraAllowed) {
        const frame = this.snapshotManager.captureSnapshot();
        if (frame) {
          console.log('[Integration] Sending captured webcam snapshot to peer');
          this.syncEngine.sendSnapshotImage(frame);
        }
      }
    });

    window.AppEvents.on('receivedSnapshotImage', (dataUrl) => {
      console.log('[Integration] Received snapshot image from partner, displaying popup');
      this.ui.showSnapshot(dataUrl);
    });

    window.AppEvents.on('driftUpdated', (driftMs) => {
      window.AppState.currentDriftMs = driftMs;
      this.ui.updateDrift(driftMs);
    });

    window.AppEvents.on('partnerMediaMetadata', (metadata) => {
      window.AppState.partnerFileLoaded = true;
      window.AppState.partnerFileName = metadata.fileName;
      window.AppState.partnerDuration = metadata.duration;
      this.ui.updatePartnerFile(metadata);

      if (window.AppState.localDuration && metadata.duration) {
        const diff = Math.abs(window.AppState.localDuration - metadata.duration);
        if (diff > 2) {
          this.ui.showToast(`Warning: Movie duration differs by ${diff.toFixed(1)}s. Ensure identical video files are used.`, 'warning', 6000);
        } else {
          this.ui.showToast(`Partner loaded same movie: ${metadata.fileName}`, 'success');
        }
      }
    });

    window.AppEvents.on('partnerReadyChanged', (ready) => {
      window.AppState.isPartnerReady = ready;
      this.ui.updatePartnerReady(ready);
      this.checkBothReadyCountdown();
    });

    window.AppEvents.on('remoteCountdown', (startAt) => {
      this.ui.showToast('Synchronized countdown initiated!', 'info');
      this.ui.startCountdown(3, () => {
        this.videoController.applyRemotePlay();
      });
    });

    window.AppEvents.on('videoError', (msg) => {
      this.ui.showToast(msg, 'danger');
    });

    // 4. UI Button Bindings
    this.setupUIControls();
  }

  setupUIControls() {
    // Open File
    document.getElementById('btn-open-file').addEventListener('click', async () => {
      try {
        const fileData = await window.electronAPI.openVideoDialog();
        if (fileData) {
          window.AppState.localFileLoaded = true;
          window.AppState.localFileName = fileData.fileName;
          document.getElementById('local-file-status').textContent = `Local File: ${fileData.fileName}`;
          document.getElementById('local-file-status').className = 'badge badge-success';

          // Load into video player
          this.videoController.loadSource(`file://${fileData.filePath}`);
          this.ui.showToast(`Loaded movie: ${fileData.fileName}`, 'info');
        }
      } catch (err) {
        console.error('[Integration] Error opening video file:', err);
        this.ui.showToast('Could not open video file.', 'danger');
      }
    });

    // Camera Consent Button
    document.getElementById('btn-camera-toggle').addEventListener('click', async () => {
      if (!window.AppState.cameraAllowed) {
        const allowed = await this.snapshotManager.requestWebcamConsent();
        if (allowed) {
          document.getElementById('btn-camera-toggle').classList.add('camera-active');
          document.getElementById('btn-camera-toggle').textContent = 'Camera: Active';
          this.ui.showToast('Webcam enabled for pause reaction snapshots.', 'success');
        } else {
          this.ui.showToast('Camera permission denied or camera unavailable.', 'warning');
        }
      } else {
        this.snapshotManager.stopWebcam();
        document.getElementById('btn-camera-toggle').classList.remove('camera-active');
        document.getElementById('btn-camera-toggle').textContent = 'Enable Camera';
        this.ui.showToast('Webcam disabled.', 'info');
      }
    });

    // Ready Button
    document.getElementById('btn-ready').addEventListener('click', () => {
      if (!window.AppState.localFileLoaded) {
        this.ui.showToast('Please select a local movie file first!', 'warning');
        return;
      }
      if (this.sessionManager.getConnectionState() !== 'connected') {
        this.ui.showToast('Please establish a WebRTC connection first!', 'warning');
        return;
      }

      window.AppState.isReady = !window.AppState.isReady;
      this.ui.updateLocalReadyButton(window.AppState.isReady);
      this.syncEngine.sendReady(window.AppState.isReady);
      this.checkBothReadyCountdown();
    });

    // Connect / Signaling Dialog UI
    document.getElementById('btn-connect').addEventListener('click', () => {
      this.ui.showConnectionModal();
    });

    document.getElementById('btn-close-modal').addEventListener('click', () => {
      this.ui.hideConnectionModal();
    });

    document.getElementById('btn-choose-host').addEventListener('click', async () => {
      try {
        window.AppState.isHost = true;
        const offerCode = await this.sessionManager.createHostSession();
        this.ui.showHostPanel(offerCode);
      } catch (err) {
        this.ui.showToast(`Error creating host session: ${err.message}`, 'danger');
      }
    });

    document.getElementById('btn-choose-guest').addEventListener('click', () => {
      window.AppState.isHost = false;
      this.ui.showGuestPanel();
    });

    document.getElementById('btn-copy-offer').addEventListener('click', () => {
      const code = document.getElementById('host-offer-code').value;
      navigator.clipboard.writeText(code);
      this.ui.showToast('Offer code copied to clipboard!', 'info');
    });

    document.getElementById('btn-apply-answer').addEventListener('click', async () => {
      const answerCode = document.getElementById('host-answer-code').value.trim();
      if (!answerCode) {
        this.ui.showToast('Please paste the partner answer code.', 'warning');
        return;
      }
      try {
        await this.sessionManager.setRemoteAnswer(answerCode);
        this.ui.showToast('Answer applied. Finalizing connection...', 'info');
      } catch (err) {
        this.ui.showToast(`Failed to set answer: ${err.message}`, 'danger');
      }
    });

    document.getElementById('btn-generate-answer').addEventListener('click', async () => {
      const offerCode = document.getElementById('guest-offer-code').value.trim();
      if (!offerCode) {
        this.ui.showToast('Please paste the host offer code.', 'warning');
        return;
      }
      try {
        const answerCode = await this.sessionManager.createGuestSession(offerCode);
        this.ui.showGuestAnswer(answerCode);
      } catch (err) {
        this.ui.showToast(`Invalid host code: ${err.message}`, 'danger');
      }
    });

    document.getElementById('btn-copy-answer').addEventListener('click', () => {
      const code = document.getElementById('guest-answer-code').value;
      navigator.clipboard.writeText(code);
      this.ui.showToast('Answer code copied to clipboard!', 'info');
    });

    // Dismiss Snapshot
    document.getElementById('btn-close-snapshot').addEventListener('click', () => {
      document.getElementById('snapshot-overlay').classList.add('hidden');
    });
  }

  checkBothReadyCountdown() {
    if (window.AppState.isReady && window.AppState.isPartnerReady) {
      if (window.AppState.isHost) {
        this.ui.showToast('Both peers ready! Starting countdown...', 'success');
        this.syncEngine.sendCountdown(Date.now());
        this.ui.startCountdown(3, () => {
          this.videoController.applyRemotePlay();
          this.syncEngine.sendPlay(0);
        });
      }
    }
  }
}

window.Integration = Integration;
