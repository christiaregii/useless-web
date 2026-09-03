/**
 * Person A — State store and event emitter
 */

class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(event, listener) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(listener);
  }

  off(event, listener) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(l => l !== listener);
  }

  emit(event, ...args) {
    if (!this.events[event]) return;
    for (const listener of this.events[event]) {
      try {
        listener(...args);
      } catch (err) {
        console.error(`[EventEmitter] Error in event '${event}':`, err);
      }
    }
  }
}

window.AppEvents = new EventEmitter();

window.AppState = {
  connectionState: 'disconnected', // 'disconnected' | 'connecting' | 'connected'
  isHost: false,
  localFileLoaded: false,
  localFileName: '',
  localDuration: 0,
  partnerFileLoaded: false,
  partnerFileName: '',
  partnerDuration: 0,
  isReady: false,
  isPartnerReady: false,
  cameraAllowed: false,
  cameraStream: null,
  currentDriftMs: 0
};
