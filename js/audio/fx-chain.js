/**
 * BOTONERA — FX Chain
 * Per-sample effects chain: Delay, Reverb, Distortion, Filter, Compressor.
 * Each chain is a series of Web Audio API nodes connected in sequence.
 */

import { AudioEngine } from './engine.js';

/**
 * @typedef {Object} DelayConfig
 * @property {number} time - Delay time in seconds (0–2)
 * @property {number} feedback - Feedback amount (0–0.95)
 * @property {number} mix - Wet/dry mix (0–1)
 */

/**
 * @typedef {Object} ReverbConfig
 * @property {number} decay - Decay time in seconds (0.1–10)
 * @property {number} mix - Wet/dry mix (0–1)
 */

/**
 * @typedef {Object} DistortionConfig
 * @property {number} amount - Distortion amount (0–100)
 * @property {number} mix - Wet/dry mix (0–1)
 */

/**
 * @typedef {Object} FilterConfig
 * @property {'lowpass'|'highpass'|'bandpass'|'notch'} type
 * @property {number} frequency - Cutoff frequency in Hz (20–20000)
 * @property {number} Q - Resonance/Q factor (0.1–30)
 */

/**
 * @typedef {Object} CompressorConfig
 * @property {number} threshold - dB (-100–0)
 * @property {number} knee - dB (0–40)
 * @property {number} ratio - (1–20)
 * @property {number} attack - seconds (0–1)
 * @property {number} release - seconds (0–1)
 */

/**
 * @typedef {Object} FXConfig
 * @property {DelayConfig} [delay]
 * @property {ReverbConfig} [reverb]
 * @property {DistortionConfig} [distortion]
 * @property {FilterConfig} [filter]
 * @property {CompressorConfig} [compressor]
 */

/** Default FX values */
export const FX_DEFAULTS = {
    delay: { time: 0.3, feedback: 0.3, mix: 0 },
    reverb: { decay: 2.0, mix: 0 },
    distortion: { amount: 20, mix: 0 },
    filter: { type: 'lowpass', frequency: 20000, Q: 1 },
    compressor: { threshold: -24, knee: 30, ratio: 4, attack: 0.003, release: 0.25 },
};

export class FXChain {
    /**
     * @param {string} sampleId - Owner sample ID
     * @param {FXConfig} [config] - Initial FX configuration
     */
    constructor(sampleId, config = {}) {
        this.sampleId = sampleId;
        this.engine = AudioEngine.getInstance();
        const ctx = this.engine.ctx;

        // ─── Build the FX node graph ───

        // Input gain (receives audio from sample player)
        this.inputGain = ctx.createGain();
        this.inputGain.gain.value = 1;

        // ── Filter ──
        this.filter = ctx.createBiquadFilter();
        const fc = { ...FX_DEFAULTS.filter, ...config.filter };
        this.filter.type = fc.type;
        this.filter.frequency.value = fc.frequency;
        this.filter.Q.value = fc.Q;
        this.filterConfig = fc;

        // ── Distortion ──
        this.distortion = ctx.createWaveShaper();
        this.distortionDryGain = ctx.createGain();
        this.distortionWetGain = ctx.createGain();
        this.distortionMerge = ctx.createGain();
        const dc = { ...FX_DEFAULTS.distortion, ...config.distortion };
        this.distortion.curve = this._makeDistortionCurve(dc.amount);
        this.distortion.oversample = '4x';
        this.distortionDryGain.gain.value = 1 - dc.mix;
        this.distortionWetGain.gain.value = dc.mix;
        this.distortionConfig = dc;

        // ── Delay ──
        this.delay = ctx.createDelay(5);
        this.delayFeedback = ctx.createGain();
        this.delayDryGain = ctx.createGain();
        this.delayWetGain = ctx.createGain();
        this.delayMerge = ctx.createGain();
        const dlc = { ...FX_DEFAULTS.delay, ...config.delay };
        this.delay.delayTime.value = dlc.time;
        this.delayFeedback.gain.value = dlc.feedback;
        this.delayDryGain.gain.value = 1 - dlc.mix;
        this.delayWetGain.gain.value = dlc.mix;
        this.delayConfig = dlc;

        // ── Reverb ──
        this.reverb = ctx.createConvolver();
        this.reverbDryGain = ctx.createGain();
        this.reverbWetGain = ctx.createGain();
        this.reverbMerge = ctx.createGain();
        const rc = { ...FX_DEFAULTS.reverb, ...config.reverb };
        this.reverb.buffer = this._generateImpulseResponse(rc.decay);
        this.reverbDryGain.gain.value = 1 - rc.mix;
        this.reverbWetGain.gain.value = rc.mix;
        this.reverbConfig = rc;

        // ── Compressor ──
        this.compressor = ctx.createDynamicsCompressor();
        const cc = { ...FX_DEFAULTS.compressor, ...config.compressor };
        this.compressor.threshold.value = cc.threshold;
        this.compressor.knee.value = cc.knee;
        this.compressor.ratio.value = cc.ratio;
        this.compressor.attack.value = cc.attack;
        this.compressor.release.value = cc.release;
        this.compressorConfig = cc;

        // ── Output Gain ──
        this.outputGain = ctx.createGain();
        this.outputGain.gain.value = 1;

        // ─── Connect the chain ───
        // Input → Filter → Distortion (wet/dry) → Delay (wet/dry) → Reverb (wet/dry) → Compressor → Output
        this._connectChain();

        // Track active state for each FX
        this.activeEffects = {
            filter: fc.frequency < 20000 || fc.type !== 'lowpass',
            distortion: dc.mix > 0,
            delay: dlc.mix > 0,
            reverb: rc.mix > 0,
            compressor: cc.threshold > -100,
        };

        /** @type {Function[]} */
        this._listeners = [];
    }

    /**
     * Connect all nodes in the FX chain.
     * @private
     */
    _connectChain() {
        // Disconnect all first
        try {
            this.inputGain.disconnect();
            this.filter.disconnect();
            this.distortionMerge.disconnect();
            this.delayMerge.disconnect();
            this.reverbMerge.disconnect();
            this.compressor.disconnect();
        } catch (e) { /* first time, nothing connected */ }

        // Input → Filter
        this.inputGain.connect(this.filter);

        // Filter → Distortion (dry + wet mix)
        this.filter.connect(this.distortionDryGain);
        this.filter.connect(this.distortion);
        this.distortion.connect(this.distortionWetGain);
        this.distortionDryGain.connect(this.distortionMerge);
        this.distortionWetGain.connect(this.distortionMerge);

        // Distortion → Delay (dry + wet mix)
        this.distortionMerge.connect(this.delayDryGain);
        this.distortionMerge.connect(this.delay);
        this.delay.connect(this.delayFeedback);
        this.delayFeedback.connect(this.delay); // feedback loop
        this.delay.connect(this.delayWetGain);
        this.delayDryGain.connect(this.delayMerge);
        this.delayWetGain.connect(this.delayMerge);

        // Delay → Reverb (dry + wet mix)
        this.delayMerge.connect(this.reverbDryGain);
        this.delayMerge.connect(this.reverb);
        this.reverb.connect(this.reverbWetGain);
        this.reverbDryGain.connect(this.reverbMerge);
        this.reverbWetGain.connect(this.reverbMerge);

        // Reverb → Compressor → Output
        this.reverbMerge.connect(this.compressor);
        this.compressor.connect(this.outputGain);

        // Output connects to master (done externally)
        this.outputGain.connect(this.engine.masterGain);
    }

    /**
     * Get the input node (connect sample player here).
     * @returns {GainNode}
     */
    getInput() {
        return this.inputGain;
    }

    /**
     * Get the output node.
     * @returns {GainNode}
     */
    getOutput() {
        return this.outputGain;
    }

    // ─── Parameter Setters ───

    /**
     * Update delay parameters.
     * @param {Partial<DelayConfig>} params
     */
    setDelay(params) {
        const ctx = this.engine.ctx;
        const t = ctx.currentTime;

        if (params.time !== undefined) {
            this.delayConfig.time = params.time;
            this.delay.delayTime.setTargetAtTime(params.time, t, 0.01);
        }
        if (params.feedback !== undefined) {
            this.delayConfig.feedback = Math.min(params.feedback, 0.95); // safety cap
            this.delayFeedback.gain.setTargetAtTime(this.delayConfig.feedback, t, 0.01);
        }
        if (params.mix !== undefined) {
            this.delayConfig.mix = params.mix;
            this.delayDryGain.gain.setTargetAtTime(1 - params.mix, t, 0.01);
            this.delayWetGain.gain.setTargetAtTime(params.mix, t, 0.01);
            this.activeEffects.delay = params.mix > 0;
        }
        this._notify('delay', this.delayConfig);
    }

    /**
     * Update reverb parameters.
     * @param {Partial<ReverbConfig>} params
     */
    setReverb(params) {
        const ctx = this.engine.ctx;
        const t = ctx.currentTime;

        if (params.decay !== undefined) {
            this.reverbConfig.decay = params.decay;
            this.reverb.buffer = this._generateImpulseResponse(params.decay);
        }
        if (params.mix !== undefined) {
            this.reverbConfig.mix = params.mix;
            this.reverbDryGain.gain.setTargetAtTime(1 - params.mix, t, 0.01);
            this.reverbWetGain.gain.setTargetAtTime(params.mix, t, 0.01);
            this.activeEffects.reverb = params.mix > 0;
        }
        this._notify('reverb', this.reverbConfig);
    }

    /**
     * Update distortion parameters.
     * @param {Partial<DistortionConfig>} params
     */
    setDistortion(params) {
        const ctx = this.engine.ctx;
        const t = ctx.currentTime;

        if (params.amount !== undefined) {
            this.distortionConfig.amount = params.amount;
            this.distortion.curve = this._makeDistortionCurve(params.amount);
        }
        if (params.mix !== undefined) {
            this.distortionConfig.mix = params.mix;
            this.distortionDryGain.gain.setTargetAtTime(1 - params.mix, t, 0.01);
            this.distortionWetGain.gain.setTargetAtTime(params.mix, t, 0.01);
            this.activeEffects.distortion = params.mix > 0;
        }
        this._notify('distortion', this.distortionConfig);
    }

    /**
     * Update filter parameters.
     * @param {Partial<FilterConfig>} params
     */
    setFilter(params) {
        const ctx = this.engine.ctx;
        const t = ctx.currentTime;

        if (params.type !== undefined) {
            this.filterConfig.type = params.type;
            this.filter.type = params.type;
        }
        if (params.frequency !== undefined) {
            this.filterConfig.frequency = params.frequency;
            this.filter.frequency.setTargetAtTime(params.frequency, t, 0.01);
        }
        if (params.Q !== undefined) {
            this.filterConfig.Q = params.Q;
            this.filter.Q.setTargetAtTime(params.Q, t, 0.01);
        }
        this.activeEffects.filter = this.filterConfig.frequency < 20000 || this.filterConfig.type !== 'lowpass';
        this._notify('filter', this.filterConfig);
    }

    /**
     * Update compressor parameters.
     * @param {Partial<CompressorConfig>} params
     */
    setCompressor(params) {
        const t = this.engine.ctx.currentTime;

        if (params.threshold !== undefined) {
            this.compressorConfig.threshold = params.threshold;
            this.compressor.threshold.setTargetAtTime(params.threshold, t, 0.01);
        }
        if (params.knee !== undefined) {
            this.compressorConfig.knee = params.knee;
            this.compressor.knee.setTargetAtTime(params.knee, t, 0.01);
        }
        if (params.ratio !== undefined) {
            this.compressorConfig.ratio = params.ratio;
            this.compressor.ratio.setTargetAtTime(params.ratio, t, 0.01);
        }
        if (params.attack !== undefined) {
            this.compressorConfig.attack = params.attack;
            this.compressor.attack.setTargetAtTime(params.attack, t, 0.01);
        }
        if (params.release !== undefined) {
            this.compressorConfig.release = params.release;
            this.compressor.release.setTargetAtTime(params.release, t, 0.01);
        }
        this._notify('compressor', this.compressorConfig);
    }

    // ─── Utility Methods ───

    /**
     * Get all current FX configurations.
     * @returns {FXConfig}
     */
    getConfig() {
        return {
            delay: { ...this.delayConfig },
            reverb: { ...this.reverbConfig },
            distortion: { ...this.distortionConfig },
            filter: { ...this.filterConfig },
            compressor: { ...this.compressorConfig },
        };
    }

    /**
     * Reset all FX to defaults.
     */
    reset() {
        this.setDelay(FX_DEFAULTS.delay);
        this.setReverb(FX_DEFAULTS.reverb);
        this.setDistortion(FX_DEFAULTS.distortion);
        this.setFilter(FX_DEFAULTS.filter);
        this.setCompressor(FX_DEFAULTS.compressor);
    }

    /**
     * Generate a distortion curve.
     * @private
     * @param {number} amount - 0–100
     * @returns {Float32Array}
     */
    _makeDistortionCurve(amount) {
        const k = Math.max(0, amount);
        const samples = 44100;
        const curve = new Float32Array(samples);
        const deg = Math.PI / 180;
        for (let i = 0; i < samples; i++) {
            const x = (i * 2) / samples - 1;
            curve[i] = ((3 + k) * x * 20 * deg) / (Math.PI + k * Math.abs(x));
        }
        return curve;
    }

    /**
     * Generate a synthetic impulse response for reverb.
     * @private
     * @param {number} decay - Decay time in seconds
     * @returns {AudioBuffer}
     */
    _generateImpulseResponse(decay) {
        const ctx = this.engine.ctx;
        const sampleRate = ctx.sampleRate;
        const length = Math.ceil(sampleRate * Math.max(0.1, decay));
        const buffer = ctx.createBuffer(2, length, sampleRate);

        for (let ch = 0; ch < 2; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                const t = i / sampleRate;
                // Exponential decay with random noise
                data[i] = (Math.random() * 2 - 1) * Math.exp(-t * (3 / decay));
            }
        }
        return buffer;
    }

    /**
     * Subscribe to parameter changes.
     * @param {Function} callback - (fxType: string, config: object) => void
     * @returns {Function} unsubscribe
     */
    on(callback) {
        this._listeners.push(callback);
        return () => {
            this._listeners = this._listeners.filter(cb => cb !== callback);
        };
    }

    /** @private */
    _notify(fxType, config) {
        for (const cb of this._listeners) {
            try { cb(fxType, config, this); } catch (e) { console.error(e); }
        }
    }

    /**
     * Disconnect and cleanup.
     */
    destroy() {
        try {
            this.outputGain.disconnect();
            this.inputGain.disconnect();
        } catch (e) { /* ignore */ }
        this._listeners = [];
    }
}
