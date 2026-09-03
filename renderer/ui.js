/**
 * Person A — UI module
 * Handles modal popups, status indicators, notifications, countdown animation,
 * and snapshot display.
 */

class UIManager {
  constructor() {
    this.modal = document.getElementById('connection-modal');
    this.hostPanel = document.getElementById('host-panel');
    this.guestPanel = document.getElementById('guest-panel');
    this.connectChoice = document.getElementById('connect-choice');

    this.hostOfferArea = document.getElementById('host-offer-code');
    this.hostAnswerInput = document.getElementById('host-answer-code');
    this.guestOfferInput = document.getElementById('guest-offer-code');
    this.guestAnswerArea = document.getElementById('guest-answer-code');

    this.connectionStatusBadge = document.getElementById('connection-status');
    this.driftBadge = document.getElementById('drift-status');
    this.partnerFileBadge = document.getElementById('partner-file-status');
    this.partnerReadyBadge = document.getElementById('partner-ready-status');

    this.readyBtn = document.getElementById('btn-ready');
    this.snapshotOverlay = document.getElementById('snapshot-overlay');
    this.snapshotImg = document.getElementById('partner-snapshot-img');
    this.countdownOverlay = document.getElementById('countdown-overlay');
    this.countdownText = document.getElementById('countdown-text');

    this.toastContainer = document.getElementById('toast-container');
    this.snapshotTimeout = null;
  }

  showToast(message, type = 'info', duration = 3500) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 400);
    }, duration);
  }

  showConnectionModal() {
    this.modal.classList.remove('hidden');
    this.connectChoice.classList.remove('hidden');
    this.hostPanel.classList.add('hidden');
    this.guestPanel.classList.add('hidden');
  }

  hideConnectionModal() {
    this.modal.classList.add('hidden');
  }

  showHostPanel(offerCode) {
    this.connectChoice.classList.add('hidden');
    this.hostPanel.classList.remove('hidden');
    this.guestPanel.classList.add('hidden');
    this.hostOfferArea.value = offerCode;
  }

  showGuestPanel() {
    this.connectChoice.classList.add('hidden');
    this.hostPanel.classList.add('hidden');
    this.guestPanel.classList.remove('hidden');
    document.getElementById('guest-step-answer').classList.add('hidden');
  }

  showGuestAnswer(answerCode) {
    document.getElementById('guest-step-answer').classList.remove('hidden');
    this.guestAnswerArea.value = answerCode;
  }

  updateConnectionStatus(state) {
    this.connectionStatusBadge.textContent = state.toUpperCase();
    this.connectionStatusBadge.className = `badge badge-${state}`;
  }

  updateDrift(ms) {
    this.driftBadge.textContent = `Drift: ${ms}ms`;
    if (ms >= 300) {
      this.driftBadge.className = 'badge badge-warning';
    } else {
      this.driftBadge.className = 'badge badge-success';
    }
  }

  updatePartnerFile(metadata) {
    if (metadata && metadata.fileName) {
      this.partnerFileBadge.textContent = `Partner File: ${metadata.fileName}`;
      this.partnerFileBadge.className = 'badge badge-success';
    } else {
      this.partnerFileBadge.textContent = 'Partner: No File';
      this.partnerFileBadge.className = 'badge badge-muted';
    }
  }

  updatePartnerReady(isReady) {
    this.partnerReadyBadge.textContent = isReady ? 'Partner: READY' : 'Partner: NOT READY';
    this.partnerReadyBadge.className = isReady ? 'badge badge-ready' : 'badge badge-muted';
  }

  updateLocalReadyButton(isReady) {
    if (isReady) {
      this.readyBtn.textContent = 'Ready ✓';
      this.readyBtn.classList.add('ready-active');
    } else {
      this.readyBtn.textContent = 'Set Ready';
      this.readyBtn.classList.remove('ready-active');
    }
  }

  showSnapshot(dataUrl) {
    if (this.snapshotTimeout) {
      clearTimeout(this.snapshotTimeout);
    }
    this.snapshotImg.src = dataUrl;
    this.snapshotOverlay.classList.remove('hidden');

    // Auto dismiss after 5 seconds
    this.snapshotTimeout = setTimeout(() => {
      this.snapshotOverlay.classList.add('hidden');
    }, 5000);
  }

  startCountdown(seconds = 3, onComplete) {
    this.countdownOverlay.classList.remove('hidden');
    let current = seconds;
    this.countdownText.textContent = current;

    const interval = setInterval(() => {
      current -= 1;
      if (current > 0) {
        this.countdownText.textContent = current;
      } else if (current === 0) {
        this.countdownText.textContent = 'WATCH!';
      } else {
        clearInterval(interval);
        this.countdownOverlay.classList.add('hidden');
        if (onComplete) onComplete();
      }
    }, 1000);
  }
}

window.UIManager = UIManager;
