/**
 * Person B — Protocol module
 * Handles message validation, serialization, and deserialization.
 */

const MessageTypes = {
  PLAY: 'play',
  PAUSE: 'pause',
  SEEK: 'seek',
  READY: 'ready',
  COUNTDOWN: 'countdown',
  SYNC_REQUEST: 'sync_request',
  SYNC_RESPONSE: 'sync_response',
  SNAPSHOT_IMAGE: 'snapshot_image',
  MEDIA_METADATA: 'media_metadata'
};

function createMessage(type, payload = {}) {
  return JSON.stringify({
    type,
    sentAt: Date.now(),
    ...payload
  });
}

function parseMessage(rawString) {
  try {
    const data = JSON.parse(rawString);
    if (!data || typeof data !== 'object' || !data.type) {
      console.warn('[Protocol] Discarded invalid message:', rawString);
      return null;
    }
    return data;
  } catch (err) {
    console.error('[Protocol] Failed to parse message JSON:', err);
    return null;
  }
}

window.Protocol = {
  MessageTypes,
  createMessage,
  parseMessage
};
