/**
 * Person B — Signaling module
 * Encodes and decodes SDP offer/answers and ICE candidates for manual copy/paste exchange.
 */

function encodeSignal(payload) {
  try {
    const jsonStr = JSON.stringify(payload);
    return btoa(unescape(encodeURIComponent(jsonStr)));
  } catch (err) {
    console.error('[Signaling] Failed to encode signal payload:', err);
    throw new Error('Could not encode signaling data.');
  }
}

function decodeSignal(base64Str) {
  try {
    const cleanStr = base64Str.trim();
    const jsonStr = decodeURIComponent(escape(atob(cleanStr)));
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error('[Signaling] Failed to decode signal string:', err);
    throw new Error('Invalid signaling code. Please verify the code was copied completely.');
  }
}

window.Signaling = {
  encodeSignal,
  decodeSignal
};
