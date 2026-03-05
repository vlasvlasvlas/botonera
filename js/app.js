/**
 * BOTONERA — Main App Entry Point
 * Orchestrates initialization, pack loading, and UI setup.
 */

import { AudioEngine } from './audio/engine.js';
import { ConfigLoader } from './config/loader.js';
import { PadGrid } from './ui/pad-grid.js';
import { KeyboardHandler } from './ui/keyboard.js';
import { FXPanel } from './ui/fx-panel.js';
import { EditorUI } from './ui/editor-ui.js';

class BotoneraApp {
    constructor() {
        /** @type {AudioEngine} */
        this.engine = AudioEngine.getInstance();

        /** @type {PadGrid|null} */
        this.padGrid = null;

        /** @type {KeyboardHandler|null} */
        this.keyboard = null;

        /** @type {FXPanel|null} */
        this.fxPanel = null;

        /** @type {EditorUI|null} */
        this.editor = null;

        /** @type {string|null} - Active source group for recording */
        this._activeSourceName = null;

        /** @type {import('./config/loader.js').PackConfig|null} */
        this.currentPack = null;

        /** @type {boolean} */
        this.audioUnlocked = false;

        // DOM references
        this.dom = {
            loading: document.getElementById('loading-overlay'),
            sourcesContainer: document.getElementById('sources-container'),
            packSelect: document.getElementById('pack-select'),
            packName: document.getElementById('pack-name'),
            masterVolume: document.getElementById('master-volume'),
            stopAllBtn: document.getElementById('stop-all-btn'),
            toastContainer: document.getElementById('toast-container'),
            masterVuFill: document.getElementById('master-vu-fill'),
        };
    }

    /**
     * Initialize the app.
     */
    async init() {
        console.log('[Botonera] Initializing...');

        // Listen for first user interaction to unlock audio
        this._setupAudioUnlock();

        // Setup UI event listeners
        this._setupUI();

        // Setup toast listener
        this._setupToast();

        // Create FX panel
        this.fxPanel = new FXPanel();

        // Create Editor
        this.editor = new EditorUI({
            onSave: (name, buffer) => {
                if (this.padGrid && this._activeSourceName) {
                    this.padGrid.addRecordedSample(this._activeSourceName, name, buffer);
                    this._showToast(`"${name}" recorded and added!`, 'success');
                }
            },
        });

        // Load demo pack by default
        await this._loadPack('demo');

        // Start VU meter animation
        this._startVuMeter();

        console.log('[Botonera] Ready!');
    }

    /**
     * Audio context must be resumed after a user gesture.
     * @private
     */
    _setupAudioUnlock() {
        const unlock = async () => {
            if (this.audioUnlocked) return;

            try {
                await this.engine.init();
                await this.engine.resume();
                this.audioUnlocked = true;
                this._hideLoading();
                this._showToast('Audio engine initialized ✓', 'success');
                console.log('[Botonera] Audio unlocked');
            } catch (err) {
                console.error('[Botonera] Audio unlock failed:', err);
                this._showToast('Audio init failed: ' + err.message, 'error');
            }
        };

        // Listen for any user gesture
        const events = ['click', 'touchstart', 'keydown'];
        const handler = () => {
            unlock();
            events.forEach(e => document.removeEventListener(e, handler));
        };
        events.forEach(e => document.addEventListener(e, handler, { once: false }));
    }

    /**
     * Setup UI event listeners.
     * @private
     */
    _setupUI() {
        // Pack selector
        if (this.dom.packSelect) {
            this.dom.packSelect.addEventListener('change', async (e) => {
                const packId = e.target.value;
                await this._loadPack(packId);
            });
        }

        // Master volume
        if (this.dom.masterVolume) {
            this.dom.masterVolume.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.engine.setMasterVolume(val);
            });
        }

        // Stop all button
        if (this.dom.stopAllBtn) {
            this.dom.stopAllBtn.addEventListener('click', () => {
                this.engine.stopAll();
                this._showToast('All sounds stopped', 'info');
            });
        }
    }

    /**
     * Load a pack and render it.
     * @private
     * @param {string} packId
     */
    async _loadPack(packId) {
        // Cleanup previous
        if (this.padGrid) {
            this.padGrid.destroy();
        }
        if (this.keyboard) {
            this.keyboard.detach();
        }

        let config;

        if (packId === 'demo') {
            config = ConfigLoader.generateDemoPack();
        } else {
            try {
                config = await ConfigLoader.loadFromUrl(`packs/${packId}`);
            } catch (err) {
                this._showToast(`Failed to load pack: ${err.message}`, 'error');
                return;
            }
        }

        this.currentPack = config;

        // Update pack name display
        if (this.dom.packName) {
            this.dom.packName.textContent = config.name;
        }

        // Wait for audio to be unlocked before creating players
        if (!this.audioUnlocked) {
            await this.engine.init();
            this.audioUnlocked = true;
        }

        // Create and init pad grid
        this.padGrid = new PadGrid(this.dom.sourcesContainer, config);

        // Wire up FX button callback
        this.padGrid.onFxClick = (sampleId, player) => {
            if (player && player.fxChain && this.fxPanel) {
                this.fxPanel.toggle(sampleId, player.config.label, player.fxChain);
            }
        };

        // Wire up Add button callback
        this.padGrid.onAddClick = (sourceName, source) => {
            this._activeSourceName = sourceName;
            if (this.editor) {
                this.editor.open();
            }
        };

        await this.padGrid.init();

        // Attach keyboard
        this.keyboard = new KeyboardHandler(this.padGrid);
        this.keyboard.attach();

        // Update keyboard legend
        this._updateKeyboardLegend();

        this._hideLoading();
        console.log(`[Botonera] Pack loaded: "${config.name}" (${config.sources.length} sources)`);
    }

    /**
     * Populate the keyboard shortcut legend.
     * @private
     */
    _updateKeyboardLegend() {
        const legendKeys = document.getElementById('legend-keys');
        if (!legendKeys || !this.padGrid) return;

        legendKeys.innerHTML = '';
        const keyMap = this.padGrid.getKeyMap();

        for (const [key, sampleId] of keyMap) {
            const player = this.padGrid.players.get(sampleId);
            if (!player) continue;

            const item = document.createElement('span');
            item.className = 'legend-key';
            item.innerHTML = `<kbd>${key.toUpperCase()}</kbd><span>${player.config.label}</span>`;
            legendKeys.appendChild(item);
        }
    }

    /**
     * Hide the loading overlay.
     * @private
     */
    _hideLoading() {
        if (this.dom.loading) {
            this.dom.loading.classList.add('hidden');
            setTimeout(() => {
                this.dom.loading.style.display = 'none';
            }, 500);
        }
    }

    /**
     * Setup toast notification system.
     * @private
     */
    _setupToast() {
        document.addEventListener('botonera:toast', (e) => {
            this._showToast(e.detail.message, e.detail.type);
        });
    }

    /**
     * Show a toast notification.
     * @private
     * @param {string} message
     * @param {'success'|'error'|'info'} type
     */
    _showToast(message, type = 'info') {
        if (!this.dom.toastContainer) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;
        this.dom.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s ease-out';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * VU meter animation loop.
     * @private
     */
    _startVuMeter() {
        const animate = () => {
            if (this.engine.initialized && this.dom.masterVuFill) {
                const data = this.engine.getAnalyserData();
                // Compute average level
                let sum = 0;
                for (let i = 0; i < data.length; i++) sum += data[i];
                const avg = sum / data.length / 255;
                this.dom.masterVuFill.style.width = `${avg * 100}%`;

                // Color transition based on level
                if (avg > 0.8) {
                    this.dom.masterVuFill.style.background = 'var(--accent-danger)';
                } else if (avg > 0.5) {
                    this.dom.masterVuFill.style.background = 'var(--accent-warning)';
                } else {
                    this.dom.masterVuFill.style.background = 'var(--accent-primary)';
                }
            }
            requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
    }
}

// ── Bootstrap ──
document.addEventListener('DOMContentLoaded', () => {
    window.botoneraApp = new BotoneraApp();
    window.botoneraApp.init();
});
