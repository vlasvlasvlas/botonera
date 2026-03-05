/**
 * BOTONERA — Audio Engine
 * Singleton AudioContext + master output chain.
 * Manages the core audio graph for the entire application.
 */

export class AudioEngine {
  /** @type {AudioEngine|null} */
  static #instance = null;

  /** @returns {AudioEngine} */
  static getInstance() {
    if (!AudioEngine.#instance) {
      AudioEngine.#instance = new AudioEngine();
    }
    return AudioEngine.#instance;
  }

  constructor() {
    if (AudioEngine.#instance) {
      throw new Error('Use AudioEngine.getInstance()');
    }

    /** @type {AudioContext|null} */
    this.ctx = null;

    /** @type {GainNode|null} */
    this.masterGain = null;

    /** @type {AnalyserNode|null} */
    this.analyser = null;

    /** @type {Map<string, AudioBuffer>} */
    this.bufferCache = new Map();

    /** @type {boolean} */
    this.initialized = false;

    /** @type {Set<AudioBufferSourceNode>} */
    this.activeSources = new Set();
  }

  /**
   * Initialize the AudioContext (must be called from a user gesture).
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) return;

    this.ctx = new (window.AudioContext || window.webkitAudioContext)({
      latencyHint: 'interactive',
      sampleRate: 44100,
    });

    // Master gain → Analyser → Destination
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.85;

    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.8;

    this.masterGain.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);

    this.initialized = true;
    console.log(`[AudioEngine] Initialized — sampleRate: ${this.ctx.sampleRate}, latency: ${this.ctx.baseLatency}s`);
  }

  /**
   * Resume context if suspended (browser autoplay policy).
   * @returns {Promise<void>}
   */
  async resume() {
    if (this.ctx && this.ctx.state === 'suspended') {
      await this.ctx.resume();
      console.log('[AudioEngine] Context resumed');
    }
  }

  /**
   * Load an audio file into an AudioBuffer (with caching).
   * @param {string} url - URL or path to audio file
   * @param {string} [cacheKey] - Optional cache key (defaults to url)
   * @returns {Promise<AudioBuffer>}
   */
  async loadBuffer(url, cacheKey) {
    const key = cacheKey || url;

    if (this.bufferCache.has(key)) {
      return this.bufferCache.get(key);
    }

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.bufferCache.set(key, audioBuffer);
      console.log(`[AudioEngine] Loaded buffer: ${key} (${audioBuffer.duration.toFixed(2)}s)`);
      return audioBuffer;
    } catch (err) {
      console.error(`[AudioEngine] Failed to load: ${url}`, err);
      throw err;
    }
  }

  /**
   * Generate a synthetic audio buffer (for demo/testing).
   * @param {'sine'|'square'|'sawtooth'|'triangle'|'noise'|'kick'|'snare'|'hihat'} type
   * @param {number} frequency - Hz
   * @param {number} duration - seconds
   * @returns {AudioBuffer}
   */
  generateSyntheticBuffer(type, frequency = 440, duration = 0.3) {
    const sampleRate = this.ctx.sampleRate;
    const length = Math.ceil(sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);

    switch (type) {
      case 'kick':
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const freqSweep = 150 * Math.exp(-t * 30) + 40;
          const env = Math.exp(-t * 8);
          data[i] = Math.sin(2 * Math.PI * freqSweep * t) * env * 0.9;
        }
        break;

      case 'snare':
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const toneEnv = Math.exp(-t * 20);
          const noiseEnv = Math.exp(-t * 10);
          const tone = Math.sin(2 * Math.PI * 200 * t) * toneEnv * 0.5;
          const noise = (Math.random() * 2 - 1) * noiseEnv * 0.5;
          data[i] = tone + noise;
        }
        break;

      case 'hihat':
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const env = Math.exp(-t * 40);
          // Bandpass-like filtered noise
          const noise = (Math.random() * 2 - 1);
          data[i] = noise * env * 0.4;
        }
        break;

      case 'noise':
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const env = Math.exp(-t * 5);
          data[i] = (Math.random() * 2 - 1) * env * 0.5;
        }
        break;

      default: {
        // Oscillator with envelope
        for (let i = 0; i < length; i++) {
          const t = i / sampleRate;
          const env = Math.exp(-t * 4);
          let sample;
          switch (type) {
            case 'square':
              sample = Math.sign(Math.sin(2 * Math.PI * frequency * t));
              break;
            case 'sawtooth':
              sample = 2 * ((frequency * t) % 1) - 1;
              break;
            case 'triangle':
              sample = 2 * Math.abs(2 * ((frequency * t) % 1) - 1) - 1;
              break;
            default: // sine
              sample = Math.sin(2 * Math.PI * frequency * t);
          }
          data[i] = sample * env * 0.5;
        }
      }
    }

    return buffer;
  }

  /**
   * Play a buffer immediately with minimal latency.
   * @param {AudioBuffer} buffer
   * @param {object} [options]
   * @param {number} [options.volume=1]
   * @param {number} [options.playbackRate=1]
   * @param {AudioNode} [options.destination] - Connect to custom destination (for FX chain)
   * @returns {{ source: AudioBufferSourceNode, gain: GainNode, stop: Function }}
   */
  playBuffer(buffer, options = {}) {
    const { volume = 1, playbackRate = 1, destination } = options;

    const source = this.ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;

    const gainNode = this.ctx.createGain();
    gainNode.gain.value = volume;

    source.connect(gainNode);
    gainNode.connect(destination || this.masterGain);

    source.start(0);
    this.activeSources.add(source);

    source.onended = () => {
      this.activeSources.delete(source);
      try { source.disconnect(); } catch (e) { /* already disconnected */ }
      try { gainNode.disconnect(); } catch (e) { /* already disconnected */ }
    };

    return {
      source,
      gain: gainNode,
      stop: () => {
        try {
          gainNode.gain.setValueAtTime(gainNode.gain.value, this.ctx.currentTime);
          gainNode.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.01);
          source.stop(this.ctx.currentTime + 0.015);
        } catch (e) { /* already stopped */ }
      },
    };
  }

  /**
   * Stop all currently playing sources.
   */
  stopAll() {
    for (const source of this.activeSources) {
      try { source.stop(); } catch (e) { /* ignore */ }
    }
    this.activeSources.clear();
  }

  /**
   * Set master volume (0–1).
   * @param {number} value
   */
  setMasterVolume(value) {
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
    }
  }

  /**
   * Get analyser data for visualizations.
   * @returns {Uint8Array}
   */
  getAnalyserData() {
    if (!this.analyser) return new Uint8Array(0);
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    return data;
  }

  /**
   * Get current context time.
   * @returns {number}
   */
  get currentTime() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  /**
   * Get context state.
   * @returns {string}
   */
  get state() {
    return this.ctx ? this.ctx.state : 'closed';
  }
}
