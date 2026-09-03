/**
 * Watch Party - Application Entry Point (Person A: Media/UI)
 * Bootstraps the application modules and registers global keyboard shortcuts.
 */

window.addEventListener('DOMContentLoaded', () => {
    console.log('[WatchParty] Bootstrapping application...');

    try {
        // Instantiate UI Manager
        const ui = new UIManager();

        // Instantiate Video Controller
        const videoElement = document.getElementById('video-element');
        const videoCtrl = new VideoController(videoElement);

        // Instantiate Snapshot Manager (webcam handler)
        const snapshotMgr = new SnapshotManager();

        // Instantiate Session Manager (Person B Shared Contract)
        const sessionMgr = new SessionManager();

        // Instantiate Integration Bridge
        const integration = new AppIntegration(ui, videoCtrl, snapshotMgr, sessionMgr);

        // Expose instances on window for debugging/inspection
        window.watchParty = {
            ui,
            video: videoCtrl,
            snapshot: snapshotMgr,
            session: sessionMgr,
            integration
        };

        // Global Keyboard Shortcuts
        window.addEventListener('keydown', (e) => {
            // Ignore if user is currently typing in an input or textarea
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

        console.log('[WatchParty] Application initialized successfully. Ready for P2P movie party!');
    } catch (err) {
        console.error('[WatchParty] Fatal initialization error:', err);
    }
});
