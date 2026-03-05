/**
 * BOTONERA — YouTube Player
 * Manages YouTube IFrame API players for video sample triggering.
 * Each sample gets a hidden YT.Player instance that can be seeked & played on trigger.
 */

export class YouTubePlayer {
    /** @type {boolean} */
    static apiLoaded = false;

    /** @type {boolean} */
    static apiLoading = false;

    /** @type {Function[]} */
    static _apiCallbacks = [];

    /**
     * Load the YouTube IFrame API script (once).
     * @returns {Promise<void>}
     */
    static loadAPI() {
        return new Promise((resolve, reject) => {
            if (YouTubePlayer.apiLoaded) {
                resolve();
                return;
            }

            YouTubePlayer._apiCallbacks.push(resolve);

            if (YouTubePlayer.apiLoading) return;
            YouTubePlayer.apiLoading = true;

            // YouTube API calls this global function when ready
            window.onYouTubeIframeAPIReady = () => {
                YouTubePlayer.apiLoaded = true;
                YouTubePlayer.apiLoading = false;
                console.log('[YouTubePlayer] IFrame API loaded');
                YouTubePlayer._apiCallbacks.forEach(cb => cb());
                YouTubePlayer._apiCallbacks = [];
            };

            const script = document.createElement('script');
            script.src = 'https://www.youtube.com/iframe_api';
            script.onerror = () => {
                YouTubePlayer.apiLoading = false;
                reject(new Error('Failed to load YouTube IFrame API'));
            };
            document.head.appendChild(script);
        });
    }

    /**
     * @param {object} config - Sample config with youtube property
     * @param {string} config.id
     * @param {string} config.label
     * @param {object} config.youtube
     * @param {string} config.youtube.videoId
     * @param {number} [config.youtube.start=0]
     * @param {number} [config.youtube.end]
     * @param {number} [config.volume=100]
     */
    constructor(config) {
        this.config = config;
        this.youtube = config.youtube || {};

        /** @type {YT.Player|null} */
        this.player = null;

        /** @type {boolean} */
        this.ready = false;

        /** @type {boolean} */
        this.playing = false;

        /** @type {boolean} */
        this.loaded = false;

        /** @type {string|null} */
        this.error = null;

        /** @type {HTMLElement|null} */
        this._container = null;

        /** @type {Function[]} */
        this._listeners = [];

        /** @type {number|null} */
        this._endCheckInterval = null;

        /** @type {number} */
        this.volume = config.volume || 100;
    }

    /**
     * Register a state change listener.
     * @param {Function} fn - (event, player) => void
     */
    on(fn) {
        this._listeners.push(fn);
    }

    /**
     * Notify listeners.
     * @private
     * @param {string} event
     */
    _notify(event) {
        for (const fn of this._listeners) {
            fn(event, this);
        }
    }

    /**
     * Initialize the YouTube player in a hidden container.
     * @param {HTMLElement} hostContainer - DOM element to append the hidden iframe to
     * @returns {Promise<void>}
     */
    async init(hostContainer) {
        await YouTubePlayer.loadAPI();

        this._container = document.createElement('div');
        this._container.id = `yt-player-${this.config.id}`;
        this._container.style.cssText = 'width:1px;height:1px;position:absolute;left:-9999px;overflow:hidden;';
        hostContainer.appendChild(this._container);

        this._notify('loading');

        return new Promise((resolve) => {
            this.player = new YT.Player(this._container.id, {
                width: '100%',
                height: '100%',
                videoId: this.youtube.videoId,
                playerVars: {
                    autoplay: 0,
                    controls: 0,
                    disablekb: 1,
                    modestbranding: 1,
                    rel: 0,
                    showinfo: 0,
                    start: Math.floor(this.youtube.start || 0),
                    enablejsapi: 1,
                    origin: window.location.origin,
                    playsinline: 1,
                },
                events: {
                    onReady: () => {
                        this.ready = true;
                        this.loaded = true;
                        this.player.setVolume(this.volume);
                        console.log(`[YouTubePlayer] Ready: ${this.config.label} (${this.youtube.videoId})`);
                        this._notify('loaded');
                        resolve();
                    },
                    onStateChange: (event) => {
                        this._onStateChange(event);
                    },
                    onError: (event) => {
                        this.error = `YouTube error: ${event.data}`;
                        console.error(`[YouTubePlayer] Error for ${this.config.id}:`, event.data);
                        this.loaded = true; // Mark as loaded even on error
                        this._notify('error');
                        resolve();
                    },
                },
            });
        });
    }

    /**
     * Handle YT player state changes.
     * @private
     */
    _onStateChange(event) {
        switch (event.data) {
            case YT.PlayerState.PLAYING:
                this.playing = true;
                this._notify('playing');
                this._startEndCheck();
                break;

            case YT.PlayerState.PAUSED:
            case YT.PlayerState.ENDED:
                this.playing = false;
                this._stopEndCheck();
                this._notify('stopped');
                break;
        }
    }

    /**
     * Start checking if we've reached the end time.
     * @private
     */
    _startEndCheck() {
        this._stopEndCheck();
        if (this.youtube.end) {
            this._endCheckInterval = setInterval(() => {
                if (this.player && this.player.getCurrentTime) {
                    const currentTime = this.player.getCurrentTime();
                    if (currentTime >= this.youtube.end) {
                        this.stop();
                    }
                }
            }, 100);
        }
    }

    /**
     * Stop checking end time.
     * @private
     */
    _stopEndCheck() {
        if (this._endCheckInterval) {
            clearInterval(this._endCheckInterval);
            this._endCheckInterval = null;
        }
    }

    /**
     * Trigger playback — seek to start and play.
     */
    trigger() {
        if (!this.ready || !this.player) return;

        const startTime = this.youtube.start || 0;

        try {
            this.player.seekTo(startTime, true);
            this.player.playVideo();
        } catch (e) {
            console.error(`[YouTubePlayer] Trigger failed for ${this.config.id}:`, e);
        }
    }

    /**
     * Stop playback.
     */
    stop() {
        if (!this.player) return;
        this._stopEndCheck();

        try {
            this.player.pauseVideo();
            this.playing = false;
            this._notify('stopped');
        } catch (e) {
            // Player might be disposed
        }
    }

    /**
     * Release (alias for stop for compatibility with SamplePlayer interface).
     */
    release() {
        // YouTube videos don't need release handling
    }

    /**
     * Set volume (0-100).
     * @param {number} vol
     */
    setVolume(vol) {
        this.volume = vol;
        if (this.player && this.player.setVolume) {
            this.player.setVolume(vol);
        }
    }

    /**
     * Get the iframe element for display in the video viewer.
     * @returns {HTMLIFrameElement|null}
     */
    getIframe() {
        if (this.player && this.player.getIframe) {
            return this.player.getIframe();
        }
        return null;
    }

    /**
     * Get current video info.
     * @returns {{ videoId: string, title: string, duration: number }}
     */
    getVideoInfo() {
        return {
            videoId: this.youtube.videoId,
            title: this.config.label,
            start: this.youtube.start || 0,
            end: this.youtube.end || null,
        };
    }

    /**
     * Destroy the player and clean up.
     */
    destroy() {
        this._stopEndCheck();
        if (this.player) {
            try {
                this.player.destroy();
            } catch (e) { /* ignore */ }
            this.player = null;
        }
        if (this._container) {
            this._container.remove();
            this._container = null;
        }
        this._listeners = [];
    }
}
