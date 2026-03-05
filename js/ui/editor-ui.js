/**
 * BOTONERA — Editor UI
 * Full-featured audio editor modal: record from mic, view waveform,
 * select regions, apply edits (trim, reverse, normalize, fade), and
 * save as a new sample pad.
 */

import { Recorder } from '../audio/recorder.js';
import { AudioEngine } from '../audio/engine.js';
import { AudioUtils } from '../utils/audio-utils.js';

export class EditorUI {
    /**
     * @param {object} options
     * @param {Function} options.onSave - (sampleName, audioBuffer) => void
     */
    constructor(options = {}) {
        this.onSave = options.onSave || (() => { });
        this.recorder = new Recorder();

        /** @type {AudioBuffer|null} */
        this.buffer = null;

        /** @type {AudioBuffer[]} */
        this.undoStack = [];

        /** @type {number} selection start (0–1 ratio) */
        this.selStart = 0;

        /** @type {number} selection end (0–1 ratio) */
        this.selEnd = 1;

        /** @type {boolean} */
        this.isSelecting = false;

        /** @type {boolean} */
        this.isOpen = false;

        /** @type {object|null} active preview playback */
        this._previewPlayback = null;

        /** @type {number|null} */
        this._meterRAF = null;

        /** @type {number|null} */
        this._timerInterval = null;

        // Build DOM
        this._build();
    }

    /**
     * Build the editor modal DOM.
     * @private
     */
    _build() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'editor-overlay';
        this.overlay.id = 'editor-overlay';

        this.overlay.innerHTML = `
      <div class="editor-container">
        <div class="editor-header">
          <h2>🎙️ Record & Edit</h2>
          <button class="editor-close-btn" id="editor-close">✕</button>
        </div>

        <!-- Recording Section -->
        <div class="editor-record-section" id="editor-record-section">
          <button class="record-btn" id="editor-record-btn" title="Record from microphone"></button>
          <div class="input-meter" id="editor-input-meter">
            <div class="input-meter-fill" id="editor-meter-fill"></div>
          </div>
          <div class="record-status" id="editor-record-status">Click to record</div>
        </div>

        <!-- Waveform Section (hidden until audio captured) -->
        <div class="editor-waveform-section" id="editor-waveform-section" style="display:none;">
          <div class="waveform-container" id="editor-waveform-container">
            <canvas class="waveform-canvas" id="editor-waveform-canvas"></canvas>
            <div class="waveform-selection" id="editor-waveform-selection" style="display:none;"></div>
            <div class="waveform-position" id="editor-waveform-position" style="display:none;"></div>
          </div>
          <div class="waveform-time-labels">
            <span id="editor-time-start">0.00s</span>
            <span id="editor-time-sel"></span>
            <span id="editor-time-end">0.00s</span>
          </div>
        </div>

        <!-- Info -->
        <div class="editor-info" id="editor-info" style="display:none;">
          <span id="editor-info-duration">—</span>
          <span id="editor-info-samplerate">—</span>
          <span id="editor-info-channels">—</span>
        </div>

        <!-- Edit Controls (hidden until audio captured) -->
        <div class="editor-controls" id="editor-controls" style="display:none;">
          <button class="editor-btn" id="editor-btn-play" title="Play / Preview">▶ Play</button>
          <button class="editor-btn" id="editor-btn-stop" title="Stop preview">⬛ Stop</button>
          <span style="width:1px;height:20px;background:rgba(255,255,255,0.08);margin:0 4px;"></span>
          <button class="editor-btn" id="editor-btn-trim" title="Trim to selection">✂️ Trim</button>
          <button class="editor-btn" id="editor-btn-reverse" title="Reverse audio">🔄 Reverse</button>
          <button class="editor-btn" id="editor-btn-normalize" title="Normalize volume">📊 Normalize</button>
          <button class="editor-btn" id="editor-btn-fadein" title="Fade in">⬈ Fade In</button>
          <button class="editor-btn" id="editor-btn-fadeout" title="Fade out">⬊ Fade Out</button>
          <span style="width:1px;height:20px;background:rgba(255,255,255,0.08);margin:0 4px;"></span>
          <button class="editor-btn" id="editor-btn-undo" title="Undo last edit" disabled>↩ Undo</button>
          <button class="editor-btn destructive" id="editor-btn-rerecord" title="Discard and record again">🔴 Re-Record</button>
        </div>

        <!-- Name + Save -->
        <div class="editor-name-section" id="editor-name-section" style="display:none;">
          <input type="text" class="editor-name-input" id="editor-sample-name" placeholder="Sample name..." value="Recording-1">
          <button class="editor-btn" id="editor-btn-download" title="Download as WAV">💾 WAV</button>
        </div>

        <div class="editor-footer" id="editor-footer" style="display:none;">
          <button class="editor-btn" id="editor-btn-cancel">Cancel</button>
          <button class="editor-btn primary" id="editor-btn-save">✓ Add to Pad</button>
        </div>
      </div>
    `;

        // Attach event handlers
        this._attachEvents();
        document.body.appendChild(this.overlay);
    }

    /**
     * Attach all event listeners.
     * @private
     */
    _attachEvents() {
        const $ = (id) => this.overlay.querySelector(`#${id}`);

        // Close
        $('editor-close').addEventListener('click', () => this.close());
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.close();
        });

        // Record button
        $('editor-record-btn').addEventListener('click', () => this._toggleRecord());

        // Playback
        $('editor-btn-play').addEventListener('click', () => this._playPreview());
        $('editor-btn-stop').addEventListener('click', () => this._stopPreview());

        // Edit actions
        $('editor-btn-trim').addEventListener('click', () => this._applyTrim());
        $('editor-btn-reverse').addEventListener('click', () => this._applyReverse());
        $('editor-btn-normalize').addEventListener('click', () => this._applyNormalize());
        $('editor-btn-fadein').addEventListener('click', () => this._applyFadeIn());
        $('editor-btn-fadeout').addEventListener('click', () => this._applyFadeOut());
        $('editor-btn-undo').addEventListener('click', () => this._undo());
        $('editor-btn-rerecord').addEventListener('click', () => this._reRecord());

        // Download WAV
        $('editor-btn-download').addEventListener('click', () => this._downloadWav());

        // Save
        $('editor-btn-save').addEventListener('click', () => this._save());
        $('editor-btn-cancel').addEventListener('click', () => this.close());

        // Waveform selection (mouse)
        const waveformContainer = $('editor-waveform-container');
        waveformContainer.addEventListener('mousedown', (e) => this._onWaveformMouseDown(e));
        waveformContainer.addEventListener('mousemove', (e) => this._onWaveformMouseMove(e));
        window.addEventListener('mouseup', () => this._onWaveformMouseUp());

        // Waveform selection (touch)
        waveformContainer.addEventListener('touchstart', (e) => {
            const touch = e.touches[0];
            this._onWaveformMouseDown(touch);
        });
        waveformContainer.addEventListener('touchmove', (e) => {
            const touch = e.touches[0];
            this._onWaveformMouseMove(touch);
        });
        waveformContainer.addEventListener('touchend', () => this._onWaveformMouseUp());
    }

    /**
     * Open the editor.
     * @param {AudioBuffer} [existingBuffer] - Edit existing buffer instead of recording
     */
    open(existingBuffer = null) {
        this.isOpen = true;
        this.overlay.classList.add('open');
        this.selStart = 0;
        this.selEnd = 1;
        this.undoStack = [];

        if (existingBuffer) {
            this.buffer = existingBuffer;
            this._showEditView();
        } else {
            this._showRecordView();
        }
    }

    /**
     * Close the editor.
     */
    close() {
        this._stopPreview();
        this._stopMeter();
        this._stopTimer();
        this.isOpen = false;
        this.overlay.classList.remove('open');

        if (this.recorder.state === 'recording') {
            this.recorder.stop();
        }
    }

    // ─── Recording ───

    async _toggleRecord() {
        const btn = this.overlay.querySelector('#editor-record-btn');
        const status = this.overlay.querySelector('#editor-record-status');

        if (this.recorder.state === 'recording') {
            // Stop recording
            btn.classList.remove('recording');
            status.textContent = 'Processing...';
            status.classList.remove('active');
            this._stopTimer();

            const audioBuffer = await this.recorder.stop();
            if (audioBuffer) {
                this.buffer = audioBuffer;
                this._showEditView();
            }
        } else {
            // Start recording
            try {
                await this.recorder.start();
                btn.classList.add('recording');
                status.classList.add('active');
                this._startMeter();
                this._startTimer();
            } catch (err) {
                status.textContent = 'Mic error: ' + err.message;
            }
        }
    }

    _startMeter() {
        const fill = this.overlay.querySelector('#editor-meter-fill');
        const animate = () => {
            const level = this.recorder.getInputLevel();
            fill.style.width = `${level * 100}%`;
            fill.className = 'input-meter-fill' +
                (level > 0.9 ? ' clip' : level > 0.6 ? ' hot' : '');
            this._meterRAF = requestAnimationFrame(animate);
        };
        this._meterRAF = requestAnimationFrame(animate);
    }

    _stopMeter() {
        if (this._meterRAF) {
            cancelAnimationFrame(this._meterRAF);
            this._meterRAF = null;
        }
    }

    _startTimer() {
        const status = this.overlay.querySelector('#editor-record-status');
        this._timerInterval = setInterval(() => {
            const elapsed = this.recorder.getElapsedTime();
            status.textContent = `🔴 Recording ${elapsed.toFixed(1)}s`;
        }, 100);
    }

    _stopTimer() {
        if (this._timerInterval) {
            clearInterval(this._timerInterval);
            this._timerInterval = null;
        }
    }

    // ─── View Management ───

    _showRecordView() {
        this.overlay.querySelector('#editor-record-section').style.display = '';
        this.overlay.querySelector('#editor-waveform-section').style.display = 'none';
        this.overlay.querySelector('#editor-controls').style.display = 'none';
        this.overlay.querySelector('#editor-name-section').style.display = 'none';
        this.overlay.querySelector('#editor-footer').style.display = 'none';
        this.overlay.querySelector('#editor-info').style.display = 'none';

        const status = this.overlay.querySelector('#editor-record-status');
        status.textContent = 'Click to record';
        status.classList.remove('active');
    }

    _showEditView() {
        this._stopMeter();
        this._stopTimer();

        this.overlay.querySelector('#editor-record-section').style.display = 'none';
        this.overlay.querySelector('#editor-waveform-section').style.display = '';
        this.overlay.querySelector('#editor-controls').style.display = '';
        this.overlay.querySelector('#editor-name-section').style.display = '';
        this.overlay.querySelector('#editor-footer').style.display = '';
        this.overlay.querySelector('#editor-info').style.display = '';

        this._drawWaveform();
        this._updateInfo();
        this._updateSelection();
        this._updateUndoBtn();
    }

    // ─── Waveform Drawing ───

    _drawWaveform() {
        if (!this.buffer) return;

        const canvas = this.overlay.querySelector('#editor-waveform-canvas');
        const container = this.overlay.querySelector('#editor-waveform-container');
        const rect = container.getBoundingClientRect();

        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        canvas.style.width = `${rect.width}px`;
        canvas.style.height = `${rect.height}px`;

        const ctx = canvas.getContext('2d');
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        const w = rect.width;
        const h = rect.height;
        const mid = h / 2;

        // Background
        ctx.fillStyle = 'transparent';
        ctx.clearRect(0, 0, w, h);

        // Draw waveform bars
        const peaks = AudioUtils.getWaveformData(this.buffer, Math.floor(w / 2));
        const barWidth = w / peaks.length;

        for (let i = 0; i < peaks.length; i++) {
            const x = i * barWidth;
            const barHeight = peaks[i] * mid * 0.9;

            // Gradient color based on amplitude
            const intensity = peaks[i];
            const r = Math.floor(100 + intensity * 155);
            const g = Math.floor(255 - intensity * 60);
            const b = Math.floor(218 - intensity * 100);
            ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.7)`;

            // Draw mirrored bar
            ctx.fillRect(x, mid - barHeight, barWidth - 1, barHeight);
            ctx.fillRect(x, mid, barWidth - 1, barHeight);
        }

        // Center line
        ctx.strokeStyle = 'rgba(255,255,255,0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, mid);
        ctx.lineTo(w, mid);
        ctx.stroke();

        // Update time labels
        this.overlay.querySelector('#editor-time-end').textContent =
            `${this.buffer.duration.toFixed(2)}s`;
    }

    // ─── Waveform Selection ───

    _getWaveformX(event) {
        const container = this.overlay.querySelector('#editor-waveform-container');
        const rect = container.getBoundingClientRect();
        return Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    }

    _onWaveformMouseDown(e) {
        this.isSelecting = true;
        const x = this._getWaveformX(e);
        this.selStart = x;
        this.selEnd = x;
        this._updateSelection();
    }

    _onWaveformMouseMove(e) {
        if (!this.isSelecting) return;
        const x = this._getWaveformX(e);
        this.selEnd = x;
        this._updateSelection();
    }

    _onWaveformMouseUp() {
        if (!this.isSelecting) return;
        this.isSelecting = false;

        // Ensure start < end
        if (this.selStart > this.selEnd) {
            [this.selStart, this.selEnd] = [this.selEnd, this.selStart];
        }

        // Minimum selection width
        if (this.selEnd - this.selStart < 0.01) {
            this.selStart = 0;
            this.selEnd = 1;
        }
        this._updateSelection();
    }

    _updateSelection() {
        const selEl = this.overlay.querySelector('#editor-waveform-selection');
        const timeSel = this.overlay.querySelector('#editor-time-sel');

        if (!this.buffer) return;

        const start = Math.min(this.selStart, this.selEnd);
        const end = Math.max(this.selStart, this.selEnd);

        if (end - start < 0.01 || (start === 0 && end === 1)) {
            selEl.style.display = 'none';
            timeSel.textContent = '';
            return;
        }

        selEl.style.display = '';
        selEl.style.left = `${start * 100}%`;
        selEl.style.width = `${(end - start) * 100}%`;

        const startTime = start * this.buffer.duration;
        const endTime = end * this.buffer.duration;
        timeSel.textContent = `${startTime.toFixed(2)}s – ${endTime.toFixed(2)}s`;
    }

    // ─── Preview Playback ───

    _playPreview() {
        this._stopPreview();
        if (!this.buffer) return;

        const engine = AudioEngine.getInstance();
        const start = Math.min(this.selStart, this.selEnd);
        const end = Math.max(this.selStart, this.selEnd);

        const startTime = start * this.buffer.duration;
        const duration = (end - start) * this.buffer.duration;

        this._previewPlayback = engine.playBuffer(this.buffer, { volume: 1 });
        // Note: to play from offset we need to stop and recreate with offset
        this._previewPlayback.source.stop();

        const src = engine.ctx.createBufferSource();
        src.buffer = this.buffer;
        const gain = engine.ctx.createGain();
        gain.gain.value = 1;
        src.connect(gain);
        gain.connect(engine.masterGain);
        src.start(0, startTime, duration > 0 && end < 1 ? duration : undefined);

        this._previewPlayback = { source: src, gain, stop: () => { try { src.stop(); } catch (e) { } } };

        // Animate position
        const posEl = this.overlay.querySelector('#editor-waveform-position');
        posEl.style.display = '';
        const startPos = start * 100;
        const endPos = end * 100;
        const durationMs = duration * 1000;
        const startT = performance.now();

        const animatePos = () => {
            const elapsed = performance.now() - startT;
            const progress = Math.min(1, elapsed / durationMs);
            const pos = startPos + progress * (endPos - startPos);
            posEl.style.left = `${pos}%`;

            if (progress < 1) {
                this._posRAF = requestAnimationFrame(animatePos);
            } else {
                posEl.style.display = 'none';
            }
        };
        this._posRAF = requestAnimationFrame(animatePos);

        src.onended = () => {
            posEl.style.display = 'none';
            if (this._posRAF) cancelAnimationFrame(this._posRAF);
        };
    }

    _stopPreview() {
        if (this._previewPlayback) {
            this._previewPlayback.stop();
            this._previewPlayback = null;
        }
        if (this._posRAF) {
            cancelAnimationFrame(this._posRAF);
            this._posRAF = null;
        }
        const posEl = this.overlay.querySelector('#editor-waveform-position');
        if (posEl) posEl.style.display = 'none';
    }

    // ─── Edit Operations ───

    _pushUndo() {
        this.undoStack.push(this.buffer);
        if (this.undoStack.length > 20) this.undoStack.shift();
        this._updateUndoBtn();
    }

    _undo() {
        if (this.undoStack.length === 0) return;
        this.buffer = this.undoStack.pop();
        this._drawWaveform();
        this._updateInfo();
        this.selStart = 0;
        this.selEnd = 1;
        this._updateSelection();
        this._updateUndoBtn();
    }

    _updateUndoBtn() {
        const btn = this.overlay.querySelector('#editor-btn-undo');
        btn.disabled = this.undoStack.length === 0;
    }

    _applyTrim() {
        if (!this.buffer) return;
        const start = Math.min(this.selStart, this.selEnd);
        const end = Math.max(this.selStart, this.selEnd);
        if (end - start < 0.01) return; // no selection

        this._pushUndo();
        const startTime = start * this.buffer.duration;
        const endTime = end * this.buffer.duration;
        this.buffer = AudioUtils.trim(this.buffer, startTime, endTime);
        this.selStart = 0;
        this.selEnd = 1;
        this._drawWaveform();
        this._updateInfo();
        this._updateSelection();
    }

    _applyReverse() {
        if (!this.buffer) return;
        this._pushUndo();
        this.buffer = AudioUtils.reverse(this.buffer);
        this._drawWaveform();
    }

    _applyNormalize() {
        if (!this.buffer) return;
        this._pushUndo();
        this.buffer = AudioUtils.normalize(this.buffer);
        this._drawWaveform();
    }

    _applyFadeIn() {
        if (!this.buffer) return;
        this._pushUndo();
        const duration = Math.min(0.5, this.buffer.duration * 0.2);
        this.buffer = AudioUtils.fadeIn(this.buffer, duration);
        this._drawWaveform();
    }

    _applyFadeOut() {
        if (!this.buffer) return;
        this._pushUndo();
        const duration = Math.min(0.5, this.buffer.duration * 0.2);
        this.buffer = AudioUtils.fadeOut(this.buffer, duration);
        this._drawWaveform();
    }

    _reRecord() {
        this._stopPreview();
        this.buffer = null;
        this.undoStack = [];
        this._showRecordView();
    }

    // ─── Utility ───

    _updateInfo() {
        if (!this.buffer) return;
        this.overlay.querySelector('#editor-info-duration').textContent =
            `Duration: ${this.buffer.duration.toFixed(3)}s`;
        this.overlay.querySelector('#editor-info-samplerate').textContent =
            `${this.buffer.sampleRate} Hz`;
        this.overlay.querySelector('#editor-info-channels').textContent =
            `${this.buffer.numberOfChannels}ch`;
    }

    _downloadWav() {
        if (!this.buffer) return;
        const name = this.overlay.querySelector('#editor-sample-name').value || 'recording';
        const blob = AudioUtils.toWavBlob(this.buffer);
        AudioUtils.downloadBlob(blob, `${name}.wav`);
    }

    _save() {
        if (!this.buffer) return;
        const name = this.overlay.querySelector('#editor-sample-name').value || 'Recording';
        this.onSave(name, this.buffer);
        this.close();
    }

    /**
     * Destroy the editor.
     */
    destroy() {
        this.close();
        this.recorder.destroy();
        this.overlay.remove();
    }
}
