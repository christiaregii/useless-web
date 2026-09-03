/**
 * Watch Party - Web Application Bootstrap
 * Reuses the existing renderer modules directly in standard browser environments.
 */

window.addEventListener('DOMContentLoaded', () => {
    console.log('[WatchParty-Web] Bootstrapping Web Application Shell...');

    try {
        // Instantiate UI Manager (from renderer/ui.js)
        const ui = new window.UIManager();

        // Instantiate Video Controller (from renderer/videoController.js)
        const videoElement = document.getElementById('video-element');
        const videoCtrl = new window.VideoController(videoElement);

        // Instantiate Snapshot Manager (from renderer/snapshot.js)
        const snapshotMgr = new window.SnapshotManager();

        // Instantiate Session Manager (from renderer/sessionManager.js)
        const sessionMgr = new window.SessionManager();

        // Instantiate Integration Bridge (from renderer/integration.js)
        const integration = new window.AppIntegration(ui, videoCtrl, snapshotMgr, sessionMgr);

        // Expose instances on window for debugging & inspection
        window.watchParty = {
            ui,
            video: videoCtrl,
            snapshot: snapshotMgr,
            session: sessionMgr,
            integration,
            isWeb: true
        };

        // Keyboard Shortcuts (Space, F, M, Left/Right arrows, Escape)
        window.addEventListener('keydown', (e) => {
            const targetTag = e.target.tagName.toLowerCase();
            if (targetTag === 'input' || targetTag === 'textarea') {
                return;
            }

            if (e.code === 'Space') {
                e.preventDefault();
                videoCtrl.togglePlay();
            } else if (e.code === 'KeyF') {
                e.preventDefault();
                const theater = document.getElementById('theater-container');
                if (!document.fullscreenElement) {
                    theater.requestFullscreen().catch(() => {});
                } else {
                    document.exitFullscreen().catch(() => {});
                }
            } else if (e.code === 'KeyM') {
                e.preventDefault();
                videoCtrl.toggleMute();
            } else if (e.code === 'ArrowRight') {
                e.preventDefault();
                videoCtrl.seek(videoCtrl.getCurrentTime() + 5);
            } else if (e.code === 'ArrowLeft') {
                e.preventDefault();
                videoCtrl.seek(videoCtrl.getCurrentTime() - 5);
            } else if (e.code === 'Escape') {
                ui.closeSignalingModal();
                ui.hideReactionPopup();
            }
        });

        console.log('[WatchParty-Web] Web Application initialized successfully. Ready for P2P movie party!');
    } catch (err) {
        console.error('[WatchParty-Web] Fatal bootstrap error:', err);
    }
});
