/**
 * Watch Party - Signaling Module (Person B: Network/Sync)
 * Handles SDP packing/unpacking and ICE gathering completion for manual copy-paste exchange.
 */

const SIGNAL_PREFIX = 'WP1:';

/**
 * Packs an RTCSessionDescription (or { type, sdp }) into a single copy-pasteable string.
 */
function packSignal(description) {
    if (!description || !description.type || !description.sdp) {
        throw new Error('Invalid session description to pack');
    }
    const payload = JSON.stringify({
        type: description.type,
        sdp: description.sdp
    });
    // Base64 encode for clean clipboard transport
    const base64 = btoa(encodeURIComponent(payload));
    return `${SIGNAL_PREFIX}${base64}`;
}

/**
 * Unpacks and validates a copy-pasted signaling string into an RTCSessionDescriptionInit object.
 */
function unpackSignal(token) {
    if (typeof token !== 'string') {
        throw new Error('Signaling token must be a string');
    }

    let cleanToken = token.trim();
    if (cleanToken.startsWith(SIGNAL_PREFIX)) {
        cleanToken = cleanToken.slice(SIGNAL_PREFIX.length);
    }

    let jsonStr;
    try {
        jsonStr = decodeURIComponent(atob(cleanToken));
    } catch (e) {
        // Fallback in case user pasted un-encoded raw JSON directly
        try {
            jsonStr = cleanToken;
        } catch (_) {
            throw new Error('Invalid signaling code: Not valid Base64 or JSON');
        }
    }

    let parsed;
    try {
        parsed = JSON.parse(jsonStr);
    } catch (e) {
        throw new Error('Invalid signaling code: Malformed JSON payload');
    }

    if (!parsed || (parsed.type !== 'offer' && parsed.type !== 'answer') || typeof parsed.sdp !== 'string' || !parsed.sdp.trim()) {
        throw new Error('Invalid signaling code: Missing valid SDP type or content');
    }

    return {
        type: parsed.type,
        sdp: parsed.sdp
    };
}

/**
 * Waits until ICE candidate gathering is finished (or times out)
 * so the resulting localDescription contains all gathered candidates for serverless manual exchange.
 */
function waitForIceGatheringComplete(pc, maxWaitMs = 2500) {
    return new Promise((resolve) => {
        if (pc.iceGatheringState === 'complete') {
            resolve();
            return;
        }

        let isResolved = false;
        const finish = (reason) => {
            if (!isResolved) {
                isResolved = true;
                clearTimeout(timer);
                pc.removeEventListener('icegatheringstatechange', checkState);
                pc.removeEventListener('icecandidate', checkCandidate);
                console.log(`[Signaling] ICE gathering ended (${reason}). State: ${pc.iceGatheringState}`);
                resolve();
            }
        };

        const checkState = () => {
            if (pc.iceGatheringState === 'complete') {
                finish('state complete');
            }
        };

        const checkCandidate = (evt) => {
            if (!evt.candidate) {
                finish('null candidate');
            }
        };

        const timer = setTimeout(() => {
            finish('timeout');
        }, maxWaitMs);

        pc.addEventListener('icegatheringstatechange', checkState);
        pc.addEventListener('icecandidate', checkCandidate);
    });
}

// Export for module/browser usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        SIGNAL_PREFIX,
        packSignal,
        unpackSignal,
        waitForIceGatheringComplete
    };
}
