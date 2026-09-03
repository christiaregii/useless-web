/**
 * Watch Party - Application State (Person A: Media/UI)
 * Reactive state store managing application lifecycle and synchronization status.
 */

class AppState {
    constructor() {
        this.data = {
            connectionState: 'disconnected', // 'disconnected' | 'connecting' | 'connected' | 'failed'
            sessionRole: null, // 'host' | 'guest' | null
            
            localMovie: null, // { name: string, url: string, duration: number, size: number }
            remoteMovie: null, // { name: string, duration: number, size: number }
            
            localReady: false,
            remoteReady: false,
            
            isPlaying: false,
            currentTime: 0,
            duration: 0,
            
            cameraConsent: false,
            cameraActive: false,
            
            driftMs: 0,
            countdownValue: null
        };

        this.listeners = new Map();
    }

    get(key) {
        return this.data[key];
    }

    set(key, value) {
        const oldValue = this.data[key];
        if (oldValue === value) return;

        this.data[key] = value;
        this._emit(key, value, oldValue);
    }

    update(partial) {
        for (const [key, value] of Object.entries(partial)) {
            this.set(key, value);
        }
    }

    subscribe(key, callback) {
        if (!this.listeners.has(key)) {
            this.listeners.set(key, new Set());
        }
        this.listeners.get(key).add(callback);
        // Call immediately with current value
        callback(this.data[key], undefined);
        return () => this.listeners.get(key).delete(callback);
    }

    _emit(key, newValue, oldValue) {
        if (this.listeners.has(key)) {
            for (const cb of this.listeners.get(key)) {
                try {
                    cb(newValue, oldValue);
                } catch (e) {
                    console.error(`[State] Error in listener for "${key}":`, e);
                }
            }
        }
    }

    isBothReady() {
        return this.data.localReady && this.data.remoteReady;
    }

    isMovieLoaded() {
        return Boolean(this.data.localMovie && this.data.localMovie.duration > 0);
    }
}

// Global instance in renderer
if (typeof window !== 'undefined') {
    window.AppState = AppState;
    window.appState = new AppState();
}

// Export for module/browser usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { AppState };
}
