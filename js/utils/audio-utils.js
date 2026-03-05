/**
 * BOTONERA — Audio Utilities
 * Buffer manipulation helpers: trim, reverse, normalize, fade, resample.
 */

import { AudioEngine } from '../audio/engine.js';

export class AudioUtils {

    /**
     * Trim an AudioBuffer to a time range.
     * @param {AudioBuffer} buffer
     * @param {number} startTime - Start time in seconds
     * @param {number} endTime - End time in seconds
     * @returns {AudioBuffer}
     */
    static trim(buffer, startTime, endTime) {
        const ctx = AudioEngine.getInstance().ctx;
        const sr = buffer.sampleRate;
        const startSample = Math.max(0, Math.floor(startTime * sr));
        const endSample = Math.min(buffer.length, Math.floor(endTime * sr));
        const length = endSample - startSample;

        if (length <= 0) return buffer;

        const trimmed = ctx.createBuffer(buffer.numberOfChannels, length, sr);
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const src = buffer.getChannelData(ch);
            const dst = trimmed.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                dst[i] = src[startSample + i];
            }
        }
        return trimmed;
    }

    /**
     * Reverse an AudioBuffer.
     * @param {AudioBuffer} buffer
     * @returns {AudioBuffer}
     */
    static reverse(buffer) {
        const ctx = AudioEngine.getInstance().ctx;
        const reversed = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const src = buffer.getChannelData(ch);
            const dst = reversed.getChannelData(ch);
            for (let i = 0; i < buffer.length; i++) {
                dst[i] = src[buffer.length - 1 - i];
            }
        }
        return reversed;
    }

    /**
     * Normalize an AudioBuffer to peak amplitude.
     * @param {AudioBuffer} buffer
     * @param {number} [targetPeak=0.95] - Target peak level (0–1)
     * @returns {AudioBuffer}
     */
    static normalize(buffer, targetPeak = 0.95) {
        const ctx = AudioEngine.getInstance().ctx;
        const normalized = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);

        // Find peak across all channels
        let peak = 0;
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const data = buffer.getChannelData(ch);
            for (let i = 0; i < data.length; i++) {
                const abs = Math.abs(data[i]);
                if (abs > peak) peak = abs;
            }
        }

        if (peak === 0) return buffer;

        const gain = targetPeak / peak;
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const src = buffer.getChannelData(ch);
            const dst = normalized.getChannelData(ch);
            for (let i = 0; i < buffer.length; i++) {
                dst[i] = src[i] * gain;
            }
        }
        return normalized;
    }

    /**
     * Apply fade in to an AudioBuffer.
     * @param {AudioBuffer} buffer
     * @param {number} duration - Fade duration in seconds
     * @returns {AudioBuffer}
     */
    static fadeIn(buffer, duration = 0.05) {
        const ctx = AudioEngine.getInstance().ctx;
        const result = AudioUtils._cloneBuffer(buffer);
        const fadeSamples = Math.min(Math.floor(duration * buffer.sampleRate), buffer.length);

        for (let ch = 0; ch < result.numberOfChannels; ch++) {
            const data = result.getChannelData(ch);
            for (let i = 0; i < fadeSamples; i++) {
                data[i] *= i / fadeSamples;
            }
        }
        return result;
    }

    /**
     * Apply fade out to an AudioBuffer.
     * @param {AudioBuffer} buffer
     * @param {number} duration - Fade duration in seconds
     * @returns {AudioBuffer}
     */
    static fadeOut(buffer, duration = 0.05) {
        const ctx = AudioEngine.getInstance().ctx;
        const result = AudioUtils._cloneBuffer(buffer);
        const fadeSamples = Math.min(Math.floor(duration * buffer.sampleRate), buffer.length);
        const fadeStart = buffer.length - fadeSamples;

        for (let ch = 0; ch < result.numberOfChannels; ch++) {
            const data = result.getChannelData(ch);
            for (let i = 0; i < fadeSamples; i++) {
                data[fadeStart + i] *= (fadeSamples - i) / fadeSamples;
            }
        }
        return result;
    }

    /**
     * Change playback speed / pitch of a buffer by resampling.
     * @param {AudioBuffer} buffer
     * @param {number} rate - Speed multiplier (0.5 = half speed, 2 = double)
     * @returns {AudioBuffer}
     */
    static resample(buffer, rate) {
        const ctx = AudioEngine.getInstance().ctx;
        const newLength = Math.floor(buffer.length / rate);
        const result = ctx.createBuffer(buffer.numberOfChannels, newLength, buffer.sampleRate);

        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            const src = buffer.getChannelData(ch);
            const dst = result.getChannelData(ch);
            for (let i = 0; i < newLength; i++) {
                const srcIndex = i * rate;
                const idx = Math.floor(srcIndex);
                const frac = srcIndex - idx;
                // Linear interpolation
                const s0 = src[idx] || 0;
                const s1 = src[idx + 1] || 0;
                dst[i] = s0 + frac * (s1 - s0);
            }
        }
        return result;
    }

    /**
     * Convert AudioBuffer to WAV Blob for download.
     * @param {AudioBuffer} buffer
     * @returns {Blob}
     */
    static toWavBlob(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const bitsPerSample = 16;
        const bytesPerSample = bitsPerSample / 8;
        const blockAlign = numChannels * bytesPerSample;
        const dataLength = buffer.length * blockAlign;
        const headerLength = 44;
        const totalLength = headerLength + dataLength;

        const arrayBuffer = new ArrayBuffer(totalLength);
        const view = new DataView(arrayBuffer);

        // WAV header
        const writeString = (offset, str) => {
            for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
            }
        };

        writeString(0, 'RIFF');
        view.setUint32(4, totalLength - 8, true);
        writeString(8, 'WAVE');
        writeString(12, 'fmt ');
        view.setUint32(16, 16, true); // fmt chunk size
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        writeString(36, 'data');
        view.setUint32(40, dataLength, true);

        // Interleave channels and write PCM data
        let offset = 44;
        const channels = [];
        for (let ch = 0; ch < numChannels; ch++) {
            channels.push(buffer.getChannelData(ch));
        }

        for (let i = 0; i < buffer.length; i++) {
            for (let ch = 0; ch < numChannels; ch++) {
                const sample = Math.max(-1, Math.min(1, channels[ch][i]));
                const int16 = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                view.setInt16(offset, int16, true);
                offset += 2;
            }
        }

        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }

    /**
     * Generate a waveform summary for visualization (downsampled peaks).
     * @param {AudioBuffer} buffer
     * @param {number} [numBars=200] - Number of bars to return
     * @returns {Float32Array} - Peak values (0–1)
     */
    static getWaveformData(buffer, numBars = 200) {
        const data = buffer.getChannelData(0);
        const peaks = new Float32Array(numBars);
        const samplesPerBar = Math.floor(data.length / numBars);

        for (let i = 0; i < numBars; i++) {
            let peak = 0;
            const start = i * samplesPerBar;
            for (let j = 0; j < samplesPerBar; j++) {
                const abs = Math.abs(data[start + j] || 0);
                if (abs > peak) peak = abs;
            }
            peaks[i] = peak;
        }
        return peaks;
    }

    /**
     * Clone an AudioBuffer.
     * @private
     * @param {AudioBuffer} buffer
     * @returns {AudioBuffer}
     */
    static _cloneBuffer(buffer) {
        const ctx = AudioEngine.getInstance().ctx;
        const clone = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
        for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
            clone.getChannelData(ch).set(buffer.getChannelData(ch));
        }
        return clone;
    }

    /**
     * Download a blob as a file.
     * @param {Blob} blob
     * @param {string} filename
     */
    static downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    }
}
