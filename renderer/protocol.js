/**
 * Watch Party - Protocol Module (Person B: Network/Sync)
 * Defines message types, message creators, and message validation.
 */

const MessageType = {
    PLAY: 'play',
    PAUSE: 'pause',
    SEEK: 'seek',
    READY: 'ready',
    COUNTDOWN: 'countdown',
    SYNC_REQUEST: 'sync_request',
    SYNC_RESPONSE: 'sync_response',
    SNAPSHOT_IMAGE: 'snapshot_image'
};

/**
 * Message Creators
 */
function createPlayMessage(timestamp) {
    return {
        type: MessageType.PLAY,
        timestamp: typeof timestamp === 'number' ? timestamp : 0,
        sentAt: Date.now()
    };
}

function createPauseMessage(timestamp, requestSnapshot = true) {
    return {
        type: MessageType.PAUSE,
        timestamp: typeof timestamp === 'number' ? timestamp : 0,
        requestSnapshot: Boolean(requestSnapshot),
        sentAt: Date.now()
    };
}

function createSeekMessage(timestamp) {
    return {
        type: MessageType.SEEK,
        timestamp: typeof timestamp === 'number' ? timestamp : 0,
        sentAt: Date.now()
    };
}

function createReadyMessage(isReady, movieMeta = null) {
    return {
        type: MessageType.READY,
        isReady: Boolean(isReady),
        movieMeta: movieMeta ? {
            name: movieMeta.name || 'Unknown',
            duration: typeof movieMeta.duration === 'number' ? movieMeta.duration : 0,
            size: typeof movieMeta.size === 'number' ? movieMeta.size : null
        } : null,
        sentAt: Date.now()
    };
}

function createCountdownMessage(startTimestamp) {
    return {
        type: MessageType.COUNTDOWN,
        startTimestamp: typeof startTimestamp === 'number' ? startTimestamp : Date.now() + 3000,
        sentAt: Date.now()
    };
}

function createSyncRequest() {
    return {
        type: MessageType.SYNC_REQUEST,
        sentAt: Date.now()
    };
}

function createSyncResponse(timestamp, isPlaying, originalSentAt) {
    return {
        type: MessageType.SYNC_RESPONSE,
        timestamp: typeof timestamp === 'number' ? timestamp : 0,
        isPlaying: Boolean(isPlaying),
        originalSentAt: typeof originalSentAt === 'number' ? originalSentAt : Date.now(),
        sentAt: Date.now()
    };
}

function createSnapshotMessage(imageData) {
    return {
        type: MessageType.SNAPSHOT_IMAGE,
        imageData: String(imageData || ''),
        sentAt: Date.now()
    };
}

/**
 * Validates and parses raw incoming message string or object.
 * Returns null if invalid or malformed.
 */
function parseAndValidateMessage(raw) {
    try {
        const msg = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
            return null;
        }

        switch (msg.type) {
            case MessageType.PLAY:
            case MessageType.SEEK:
                if (typeof msg.timestamp !== 'number') return null;
                return msg;

            case MessageType.PAUSE:
                if (typeof msg.timestamp !== 'number') return null;
                msg.requestSnapshot = Boolean(msg.requestSnapshot);
                return msg;

            case MessageType.READY:
                msg.isReady = Boolean(msg.isReady);
                return msg;

            case MessageType.COUNTDOWN:
                if (typeof msg.startTimestamp !== 'number') return null;
                return msg;

            case MessageType.SYNC_REQUEST:
                return msg;

            case MessageType.SYNC_RESPONSE:
                if (typeof msg.timestamp !== 'number' || typeof msg.isPlaying !== 'boolean') return null;
                return msg;

            case MessageType.SNAPSHOT_IMAGE:
                if (typeof msg.imageData !== 'string' || !msg.imageData.startsWith('data:image/')) return null;
                return msg;

            default:
                console.warn('[Protocol] Unknown message type ignored:', msg.type);
                return null;
        }
    } catch (err) {
        console.error('[Protocol] Failed to parse message:', err);
        return null;
    }
}

// Export for module/browser usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MessageType,
        createPlayMessage,
        createPauseMessage,
        createSeekMessage,
        createReadyMessage,
        createCountdownMessage,
        createSyncRequest,
        createSyncResponse,
        createSnapshotMessage,
        parseAndValidateMessage
    };
}
