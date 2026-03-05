/**
 * BOTONERA — Recorder
 * Mic recording via getUserMedia + MediaRecorder.
 * Captures audio, converts to AudioBuffer, supports monitoring.
 */

import { AudioEngine } from './engine.js';

export class Recorder {
    constructor() {
        this.engine = AudioEngine.getInstance();

        /** @type {MediaStream|null} */
        this.stream = null;

        /** @type {MediaRecorder|null} */
        this.mediaRecorder = null;

        /** @type {Blob[]} */
        this._chunks = [];

        /** @type {'idle'|'recording'|'paused'} */
        this.state = 'idle';

        /** @type {MediaStreamAudioSourceNode|null} */
        this._sourceNode = null;

        /** @type {GainNode|null} */
        this._monitorGain = null;

        /** @type {AnalyserNode|null} */
        this.analyser = null;

        /** @type {number} */
        this._startTime = 0;

        /** @type {number} */
        this.maxDuration = 30; // seconds

        /** @type {number|null} */
        this._stopTimer = null;

        /** @type {Function[]} */
        this._listeners = [];
    }

    /**
     * Request microphone access and setup audio routing.
     * @returns {Promise<void>}
     */
    async init() {
        if (this.stream) return;

        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    autoGainControl: false,
                    noiseSuppression: false,
                    channelCount: 1,
                    sampleRate: 44100,
                }
            });

            const ctx = this.engine.ctx;

            // Create source from mic stream
            this._sourceNode = ctx.createMediaStreamSource(this.stream);

            // Analyser for level metering
            this.analyser = ctx.createAnalyser();
            this.analyser.fftSize = 512;
            this.analyser.smoothingTimeConstant = 0.8;

            // Monitor gain (muted by default to prevent feedback)
            this._monitorGain = ctx.createGain();
            this._monitorGain.gain.value = 0;

            this._sourceNode.connect(this.analyser);
            this._sourceNode.connect(this._monitorGain);
            this._monitorGain.connect(ctx.destination);

            console.log('[Recorder] Mic initialized');
        } catch (err) {
            console.error('[Recorder] Mic access denied:', err);
            throw new Error('Microphone access denied. Please allow microphone access.');
        }
    }

    /**
     * Start recording.
     * @returns {Promise<void>}
     */
    async start() {
        if (!this.stream) await this.init();
        if (this.state === 'recording') return;

        this._chunks = [];

        // Use MediaRecorder to capture the stream
        const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : 'audio/webm';

        this.mediaRecorder = new MediaRecorder(this.stream, {
            mimeType,
            audioBitsPerSecond: 128000,
        });

        this.mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
                this._chunks.push(e.data);
            }
        };

        this.mediaRecorder.start(100); // Collect data every 100ms
        this.state = 'recording';
        this._startTime = Date.now();
        this._notify('recording');

        // Auto-stop after maxDuration
        this._stopTimer = setTimeout(() => {
            if (this.state === 'recording') {
                this.stop();
            }
        }, this.maxDuration * 1000);

        console.log('[Recorder] Recording started');
    }

    /**
     * Stop recording and return an AudioBuffer.
     * @returns {Promise<AudioBuffer>}
     */
    async stop() {
        if (this.state !== 'recording') return null;

        if (this._stopTimer) {
            clearTimeout(this._stopTimer);
            this._stopTimer = null;
        }

        return new Promise((resolve, reject) => {
            this.mediaRecorder.onstop = async () => {
                try {
                    const blob = new Blob(this._chunks, { type: this.mediaRecorder.mimeType });
                    const arrayBuffer = await blob.arrayBuffer();
                    const audioBuffer = await this.engine.ctx.decodeAudioData(arrayBuffer);

                    this.state = 'idle';
                    this._notify('stopped', audioBuffer);
                    console.log(`[Recorder] Stopped — ${audioBuffer.duration.toFixed(2)}s captured`);
                    resolve(audioBuffer);
                } catch (err) {
                    console.error('[Recorder] Error decoding recorded audio:', err);
                    this.state = 'idle';
                    this._notify('error', err);
                    reject(err);
                }
            };

            this.mediaRecorder.stop();
        });
    }

    /**
     * Get recording duration in seconds.
     * @returns {number}
     */
    getElapsedTime() {
        if (this.state !== 'recording') return 0;
        return (Date.now() - this._startTime) / 1000;
    }

    /**
     * Get current input level (0–1) from the analyser.
     * @returns {number}
     */
    getInputLevel() {
        if (!this.analyser) return 0;
        const data = new Uint8Array(this.analyser.frequencyBinCount);
        this.analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) {
            const val = Math.abs(data[i] - 128) / 128;
            if (val > peak) peak = val;
        }
        return peak;
    }

    /**
     * Enable/disable monitor (hear yourself through speakers).
     * @param {boolean} enabled
     */
    setMonitor(enabled) {
        if (this._monitorGain) {
            this._monitorGain.gain.setTargetAtTime(
                enabled ? 0.7 : 0,
                this.engine.ctx.currentTime,
                0.01
            );
        }
    }

    /**
     * Subscribe to state changes.
     * @param {Function} callback - (event, data) => void
     * @returns {Function} unsubscribe
     */
    on(callback) {
        this._listeners.push(callback);
        return () => {
            this._listeners = this._listeners.filter(cb => cb !== callback);
        };
    }

    /** @private */
    _notify(event, data) {
        for (const cb of this._listeners) {
            try { cb(event, data); } catch (e) { console.error(e); }
        }
    }

    /**
     * Release mic and cleanup.
     */
    destroy() {
        if (this._stopTimer) clearTimeout(this._stopTimer);
        if (this.stream) {
            this.stream.getTracks().forEach(t => t.stop());
            this.stream = null;
        }
        if (this._sourceNode) {
            try { this._sourceNode.disconnect(); } catch (e) { }
        }
        if (this._monitorGain) {
            try { this._monitorGain.disconnect(); } catch (e) { }
        }
        this.state = 'idle';
        this._listeners = [];
    }
}
