/**
 * BOTONERA — Video Viewer
 * Floating/dockable component that displays the active YouTube video.
 */

export class VideoViewer {
    constructor() {
        /** @type {HTMLElement} */
        this.el = this._build();

        /** @type {HTMLElement} */
        this._videoSlot = this.el.querySelector('.video-slot');

        /** @type {HTMLElement} */
        this._titleEl = this.el.querySelector('.video-title');

        /** @type {HTMLElement} */
        this._timeEl = this.el.querySelector('.video-time');

        /** @type {boolean} */
        this._minimized = false;

        /** @type {string|null} */
        this._activeSampleId = null;

        /** @type {import('../audio/youtube-player.js').YouTubePlayer|null} */
        this._activePlayer = null;

        /** @type {number|null} */
        this._timeUpdateInterval = null;

        document.body.appendChild(this.el);
    }

    /**
     * Build the viewer DOM.
     * @private
     * @returns {HTMLElement}
     */
    _build() {
        const viewer = document.createElement('div');
        viewer.className = 'video-viewer';
        viewer.innerHTML = `
            <div class="video-viewer-header">
                <div class="video-viewer-info">
                    <span class="video-viewer-icon">▶</span>
                    <span class="video-title">No video</span>
                </div>
                <div class="video-viewer-controls">
                    <span class="video-time">0:00</span>
                    <button class="video-btn video-minimize" title="Minimize">─</button>
                    <button class="video-btn video-close" title="Close">✕</button>
                </div>
            </div>
            <div class="video-slot"></div>
        `;

        // Minimize button
        const minBtn = viewer.querySelector('.video-minimize');
        minBtn.addEventListener('click', () => this.toggleMinimize());

        // Close button
        const closeBtn = viewer.querySelector('.video-close');
        closeBtn.addEventListener('click', () => this.hide());

        return viewer;
    }

    /**
     * Show a YouTube player's video in the viewer.
     * @param {import('../audio/youtube-player.js').YouTubePlayer} ytPlayer
     */
    show(ytPlayer) {
        if (!ytPlayer) return;

        this._activeSampleId = ytPlayer.config.id;
        this._activePlayer = ytPlayer;

        // Clear previous
        this._videoSlot.innerHTML = '';

        // Get the iframe and clone it into the viewer
        const iframe = ytPlayer.getIframe();
        if (iframe) {
            // Move the iframe into the visible slot
            iframe.style.cssText = 'width:100%;height:100%;border:none;border-radius:0 0 var(--radius-md) var(--radius-md);';
            this._videoSlot.appendChild(iframe);
        }

        // Update info
        const info = ytPlayer.getVideoInfo();
        this._titleEl.textContent = info.title;

        // Show viewer
        this.el.classList.add('visible');
        this._minimized = false;
        this.el.classList.remove('minimized');

        // Start time updates
        this._startTimeUpdate();
    }

    /**
     * Hide the viewer.
     */
    hide() {
        this.el.classList.remove('visible');
        this._stopTimeUpdate();

        // Move iframe back to hidden container
        if (this._activePlayer) {
            const iframe = this._activePlayer.getIframe();
            if (iframe && this._activePlayer._container) {
                this._activePlayer._container.appendChild(iframe);
                iframe.style.cssText = 'width:1px;height:1px;';
            }
            this._activePlayer.stop();
        }

        this._activePlayer = null;
        this._activeSampleId = null;
        this._videoSlot.innerHTML = '';
        this._titleEl.textContent = 'No video';
        this._timeEl.textContent = '0:00';
    }

    /**
     * Toggle minimize state.
     */
    toggleMinimize() {
        this._minimized = !this._minimized;
        this.el.classList.toggle('minimized', this._minimized);
    }

    /**
     * Format seconds to M:SS.
     * @private
     * @param {number} seconds
     * @returns {string}
     */
    _formatTime(seconds) {
        const m = Math.floor(seconds / 60);
        const s = Math.floor(seconds % 60);
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    /**
     * Start updating the time display.
     * @private
     */
    _startTimeUpdate() {
        this._stopTimeUpdate();
        this._timeUpdateInterval = setInterval(() => {
            if (this._activePlayer && this._activePlayer.player && this._activePlayer.player.getCurrentTime) {
                const current = this._activePlayer.player.getCurrentTime();
                this._timeEl.textContent = this._formatTime(current);
            }
        }, 500);
    }

    /**
     * Stop updating time.
     * @private
     */
    _stopTimeUpdate() {
        if (this._timeUpdateInterval) {
            clearInterval(this._timeUpdateInterval);
            this._timeUpdateInterval = null;
        }
    }

    /**
     * Check if a sample is currently active.
     * @param {string} sampleId
     * @returns {boolean}
     */
    isActive(sampleId) {
        return this._activeSampleId === sampleId;
    }

    /**
     * Destroy and clean up.
     */
    destroy() {
        this._stopTimeUpdate();
        this.el.remove();
    }
}
