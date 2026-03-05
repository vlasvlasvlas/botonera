/**
 * BOTONERA — Config Loader
 * Loads and validates YAML/JSON pack configuration.
 * Uses js-yaml for YAML parsing.
 */

/**
 * @typedef {Object} SampleDef
 * @property {string} id
 * @property {string} label
 * @property {string} [key]
 * @property {string} [file]
 * @property {string} [url]
 * @property {number} [start]
 * @property {number} [end]
 * @property {number} [volume]
 * @property {number} [playbackRate]
 * @property {'oneshot'|'toggle'|'hold'|'loop'} [mode]
 * @property {object} [fx]
 * @property {object} [_synthetic]
 */

/**
 * @typedef {Object} SourceDef
 * @property {string} name
 * @property {'audio'|'youtube'|'midi'|'recorded'} type
 * @property {string} [color]
 * @property {SampleDef[]} samples
 */

/**
 * @typedef {Object} PackConfig
 * @property {string} name
 * @property {number} [bpm]
 * @property {SourceDef[]} sources
 */

const DEFAULT_SOURCE_COLORS = [
    '#ff6b35', '#4ecdc4', '#c7f464', '#7c4dff',
    '#ff6b9d', '#ffd93d', '#45b7d1', '#96e6a1',
];

export class ConfigLoader {

    /**
     * Load a pack from a URL (YAML or JSON).
     * @param {string} url
     * @returns {Promise<PackConfig>}
     */
    static async loadFromUrl(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to load pack: ${url} (${response.status})`);

        const text = await response.text();

        if (url.endsWith('.yaml') || url.endsWith('.yml')) {
            return ConfigLoader.parseYaml(text);
        } else {
            return ConfigLoader.parseJson(text);
        }
    }

    /**
     * Parse YAML text into a PackConfig.
     * @param {string} text
     * @returns {PackConfig}
     */
    static parseYaml(text) {
        if (typeof jsyaml === 'undefined') {
            throw new Error('js-yaml library not loaded. Include it via CDN.');
        }
        const raw = jsyaml.load(text);
        return ConfigLoader.validate(raw);
    }

    /**
     * Parse JSON text into a PackConfig.
     * @param {string} text
     * @returns {PackConfig}
     */
    static parseJson(text) {
        const raw = JSON.parse(text);
        return ConfigLoader.validate(raw);
    }

    /**
     * Validate and normalize a raw pack config object.
     * @param {object} raw
     * @returns {PackConfig}
     */
    static validate(raw) {
        if (!raw || typeof raw !== 'object') {
            throw new Error('Invalid pack config: expected an object');
        }

        const config = {
            name: raw.name || 'Untitled Pack',
            bpm: raw.bpm || 120,
            sources: [],
        };

        if (!Array.isArray(raw.sources) || raw.sources.length === 0) {
            throw new Error('Pack must have at least one source');
        }

        for (let i = 0; i < raw.sources.length; i++) {
            const src = raw.sources[i];
            const source = {
                name: src.name || `Source ${i + 1}`,
                type: ConfigLoader._validateType(src.type),
                color: src.color || DEFAULT_SOURCE_COLORS[i % DEFAULT_SOURCE_COLORS.length],
                samples: [],
            };

            if (Array.isArray(src.samples)) {
                for (let j = 0; j < src.samples.length; j++) {
                    const s = src.samples[j];
                    source.samples.push({
                        id: s.id || `${source.name.toLowerCase().replace(/\s/g, '-')}-${j}`,
                        label: s.label || `Sample ${j + 1}`,
                        key: s.key || null,
                        file: s.file || null,
                        url: s.url || null,
                        start: s.start !== undefined ? Number(s.start) : undefined,
                        end: s.end !== undefined ? Number(s.end) : undefined,
                        volume: s.volume !== undefined ? Number(s.volume) : 1,
                        playbackRate: s.playbackRate !== undefined ? Number(s.playbackRate) : 1,
                        mode: s.mode || 'oneshot',
                        fx: s.fx || null,
                        _synthetic: s._synthetic || null,
                    });
                }
            }

            config.sources.push(source);
        }

        return config;
    }

    /**
     * Validate source type.
     * @private
     */
    static _validateType(type) {
        const valid = ['audio', 'youtube', 'midi', 'recorded'];
        if (valid.includes(type)) return type;
        console.warn(`[ConfigLoader] Unknown source type "${type}", defaulting to "audio"`);
        return 'audio';
    }

    /**
     * Generate a default demo pack config with synthetic samples.
     * @returns {PackConfig}
     */
    static generateDemoPack() {
        return {
            name: 'Demo Pack — Synthetic',
            bpm: 120,
            sources: [
                {
                    name: 'Drums',
                    type: 'audio',
                    color: '#ff6b35',
                    samples: [
                        { id: 'kick', label: 'Kick', key: 'q', mode: 'oneshot', _synthetic: { type: 'kick', duration: 0.5 } },
                        { id: 'snare', label: 'Snare', key: 'w', mode: 'oneshot', _synthetic: { type: 'snare', duration: 0.3 } },
                        { id: 'hihat', label: 'Hi-Hat', key: 'e', mode: 'oneshot', _synthetic: { type: 'hihat', duration: 0.15 } },
                        { id: 'hihat-open', label: 'Open HH', key: 'r', mode: 'oneshot', _synthetic: { type: 'noise', duration: 0.4 } },
                    ],
                },
                {
                    name: 'Synth',
                    type: 'audio',
                    color: '#4ecdc4',
                    samples: [
                        { id: 'bass-c', label: 'Bass C', key: 'a', mode: 'oneshot', _synthetic: { type: 'sine', frequency: 65.41, duration: 0.6 } },
                        { id: 'bass-e', label: 'Bass E', key: 's', mode: 'oneshot', _synthetic: { type: 'sine', frequency: 82.41, duration: 0.6 } },
                        { id: 'bass-g', label: 'Bass G', key: 'd', mode: 'oneshot', _synthetic: { type: 'sine', frequency: 98.00, duration: 0.6 } },
                        { id: 'lead-c', label: 'Lead C', key: 'f', mode: 'oneshot', _synthetic: { type: 'sawtooth', frequency: 261.63, duration: 0.4 } },
                    ],
                },
                {
                    name: 'FX',
                    type: 'audio',
                    color: '#c7f464',
                    samples: [
                        { id: 'rise', label: 'Rise', key: 'z', mode: 'oneshot', _synthetic: { type: 'sawtooth', frequency: 200, duration: 1.0 } },
                        { id: 'noise-burst', label: 'Noise', key: 'x', mode: 'oneshot', _synthetic: { type: 'noise', duration: 0.5 } },
                        { id: 'beep', label: 'Beep', key: 'c', mode: 'oneshot', _synthetic: { type: 'square', frequency: 880, duration: 0.1 } },
                        { id: 'sub', label: 'Sub', key: 'v', mode: 'oneshot', _synthetic: { type: 'triangle', frequency: 40, duration: 0.8 } },
                    ],
                },
            ],
        };
    }

    /**
     * Serialize a pack config to YAML string.
     * @param {PackConfig} config
     * @returns {string}
     */
    static toYaml(config) {
        if (typeof jsyaml === 'undefined') {
            throw new Error('js-yaml library not loaded');
        }
        // Clean out internal properties before serializing
        const clean = JSON.parse(JSON.stringify(config));
        for (const source of clean.sources) {
            for (const sample of source.samples) {
                delete sample._synthetic;
            }
        }
        return jsyaml.dump(clean, { indent: 2, lineWidth: 120 });
    }

    /**
     * Serialize a pack config to JSON string.
     * @param {PackConfig} config
     * @returns {string}
     */
    static toJson(config) {
        const clean = JSON.parse(JSON.stringify(config));
        for (const source of clean.sources) {
            for (const sample of source.samples) {
                delete sample._synthetic;
            }
        }
        return JSON.stringify(clean, null, 2);
    }
}
