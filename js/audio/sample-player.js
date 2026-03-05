/**
 * BOTONERA — Sample Player
 * Manages individual sample instances: loading, triggering, stopping.
 */

import { AudioEngine } from './engine.js';
import { FXChain } from './fx-chain.js';

/**
 * @typedef {Object} SampleConfig
 * @property {string} id
 * @property {string} label
 * @property {string} [key] - keyboard shortcut
 * @property {string} [file] - audio file path
 * @property {string} [url] - URL for remote audio
 * @property {number} [start] - start time in seconds (for clip trimming)
 * @property {number} [end] - end time in seconds
 * @property {number} [volume=1]
 * @property {number} [playbackRate=1]
 * @property {'oneshot'|'toggle'|'hold'|'loop'} [mode='oneshot']
 * @property {object} [fx] - FX configuration
 * @property {object} [_synthetic] - Synthetic generation params
 */

export class SamplePlayer {
    /**
     * @param {SampleConfig} config
     * @param {string} sourceType - 'audio'|'youtube'|'midi'|'recorded'
     * @param {string} basePath - Base path for resolving relative file paths
     */
    constructor(config, sourceType, basePath = '') {
        this.config = config;
        this.sourceType = sourceType;
        this.basePath = basePath;

        /** @type {AudioBuffer|null} */
        this.buffer = null;

        /** @type {boolean} */
        this.loaded = false;

        /** @type {boolean} */
        this.loading = false;

        /** @type {boolean} */
        this.playing = false;

        /** @type {string|null} */
        this.error = null;

        /** @type {FXChain|null} */
        this.fxChain = null;

        /** @type {object|null} - Active playback handle */
        this._activePlayback = null;

        /** @type {Function[]} */
        this._listeners = [];
    }

    /**
     * Load the sample buffer.
     * @returns {Promise<void>}
     */
    async load() {
        if (this.loaded || this.loading) return;
        this.loading = true;
        this._notify('loading');

        const engine = AudioEngine.getInstance();

        try {
            if (this.config._synthetic) {
                // Generate synthetic buffer
                const { type, frequency, duration } = this.config._synthetic;
                this.buffer = engine.generateSyntheticBuffer(type, frequency, duration);
            } else if (this.config.file) {
                // Load from file
                const url = this.basePath ? `${this.basePath}/${this.config.file}` : this.config.file;
                this.buffer = await engine.loadBuffer(url, this.config.id);
            } else if (this.config.url) {
                // Load from URL
                this.buffer = await engine.loadBuffer(this.config.url, this.config.id);
            } else {
                throw new Error(`No audio source for sample: ${this.config.id}`);
            }

            // If start/end are specified, trim the buffer
            if (this.buffer && (this.config.start !== undefined || this.config.end !== undefined)) {
                this.buffer = this._trimBuffer(this.buffer, this.config.start || 0, this.config.end);
            }

            // Create FX chain for this sample
            this.fxChain = new FXChain(this.config.id, this.config.fx || {});

            this.loaded = true;
            this.error = null;
            this._notify('loaded');
        } catch (err) {
            this.error = err.message;
            this._notify('error');
            console.error(`[SamplePlayer] Load error for "${this.config.id}":`, err);
        } finally {
            this.loading = false;
        }
    }

    /**
     * Trigger the sample.
     */
    trigger() {
        if (!this.loaded || !this.buffer) return;

        const engine = AudioEngine.getInstance();
        const mode = this.config.mode || 'oneshot';

        switch (mode) {
            case 'toggle':
                if (this.playing) {
                    this.stop();
                    return;
                }
                break;

            case 'oneshot':
                // Stop previous if still playing
                if (this._activePlayback) {
                    this._activePlayback.stop();
                }
                break;

            case 'loop':
                if (this.playing) {
                    this.stop();
                    return;
                }
                break;

            case 'hold':
                // Will be stopped on key release
                if (this._activePlayback) {
                    this._activePlayback.stop();
                }
                break;
        }

        // Route through FX chain if available
        const destination = this.fxChain ? this.fxChain.getInput() : undefined;

        const playback = engine.playBuffer(this.buffer, {
            volume: this.config.volume ?? 1,
            playbackRate: this.config.playbackRate ?? 1,
            destination,
        });

        if (mode === 'loop') {
            playback.source.loop = true;
        }

        this._activePlayback = playback;
        this.playing = true;
        this._notify('playing');

        playback.source.onended = () => {
            if (this._activePlayback === playback) {
                this._activePlayback = null;
                this.playing = false;
                this._notify('stopped');
            }
        };
    }

    /**
     * Stop the currently playing sample.
     */
    stop() {
        if (this._activePlayback) {
            this._activePlayback.stop();
            this._activePlayback = null;
            this.playing = false;
            this._notify('stopped');
        }
    }

    /**
     * Release (for hold mode).
     */
    release() {
        if (this.config.mode === 'hold') {
            this.stop();
        }
    }

    /**
     * Set the buffer directly (for recorded audio).
     * @param {AudioBuffer} buffer
     */
    setBuffer(buffer) {
        this.buffer = buffer;
        this.loaded = true;
        this.error = null;
        this._notify('loaded');
    }

    /**
     * Subscribe to state changes.
     * @param {Function} callback - (event: string, player: SamplePlayer) => void
     * @returns {Function} unsubscribe
     */
    on(callback) {
        this._listeners.push(callback);
        return () => {
            this._listeners = this._listeners.filter(cb => cb !== callback);
        };
    }

    /**
     * @private
     * @param {string} event
     */
    _notify(event) {
        for (const cb of this._listeners) {
            try { cb(event, this); } catch (e) { console.error(e); }
        }
    }

    /**
     * Trim an AudioBuffer to a time range.
     * @private
     * @param {AudioBuffer} buffer
     * @param {number} start - seconds
     * @param {number} [end] - seconds
     * @returns {AudioBuffer}
     */
    _trimBuffer(buffer, start, end) {
        const engine = AudioEngine.getInstance();
        const sampleRate = buffer.sampleRate;
        const startSample = Math.floor(start * sampleRate);
        const endSample = end !== undefined ? Math.floor(end * sampleRate) : buffer.length;
        const length = Math.max(0, endSample - startSample);

        if (length <= 0 || startSample >= buffer.length) return buffer;

        const trimmed = engine.ctx.createBuffer(buffer.numberOfChannels, length, sampleRate);
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const source = buffer.getChannelData(ch);
            const dest = trimmed.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                dest[i] = source[startSample + i] || 0;
            }
        }
        return trimmed;
    }

    /**
     * Get the current state for UI rendering.
     * @returns {object}
     */
    getState() {
        return {
            id: this.config.id,
            label: this.config.label,
            key: this.config.key,
            loaded: this.loaded,
            loading: this.loading,
            playing: this.playing,
            error: this.error,
            mode: this.config.mode || 'oneshot',
            duration: this.buffer ? this.buffer.duration : 0,
        };
    }
}
