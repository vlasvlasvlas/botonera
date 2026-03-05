/**
 * BOTONERA — Pad Grid UI
 * Dynamically renders the pad grid based on pack configuration.
 */

import { SamplePlayer } from '../audio/sample-player.js';

export class PadGrid {
    /**
     * @param {HTMLElement} container - Container element for the sources grid
     * @param {import('../config/loader.js').PackConfig} packConfig
     */
    constructor(container, packConfig) {
        this.container = container;
        this.packConfig = packConfig;

        /** @type {Map<string, SamplePlayer>} */
        this.players = new Map();

        /** @type {Map<string, HTMLElement>} */
        this.padElements = new Map();

        /** @type {Map<string, string>} - key → sampleId */
        this.keyMap = new Map();

        /** @type {Function|null} - Callback when FX button is clicked: (sampleId, player) => void */
        this.onFxClick = null;

        /** @type {Function|null} - Callback when Add button is clicked: (sourceName) => void */
        this.onAddClick = null;
    }

    /**
     * Initialize: create players, render UI, load all samples.
     * @returns {Promise<void>}
     */
    async init() {
        this._createPlayers();
        this._render();
        await this._loadAll();
    }

    /**
     * Create SamplePlayer instances for all samples in the pack.
     * @private
     */
    _createPlayers() {
        for (const source of this.packConfig.sources) {
            for (const sampleDef of source.samples) {
                const player = new SamplePlayer(sampleDef, source.type);
                this.players.set(sampleDef.id, player);

                if (sampleDef.key) {
                    this.keyMap.set(sampleDef.key.toLowerCase(), sampleDef.id);
                }

                // Listen for state changes
                player.on((event, p) => this._updatePadState(p.config.id, event));
            }
        }
    }

    /**
     * Render the complete pad grid.
     * @private
     */
    _render() {
        this.container.innerHTML = '';

        const numSources = this.packConfig.sources.length;

        // Determine grid columns based on number of sources
        if (numSources <= 2) {
            this.container.style.gridTemplateColumns = `repeat(${numSources}, 1fr)`;
        } else if (numSources <= 4) {
            this.container.style.gridTemplateColumns = `repeat(${Math.min(numSources, 3)}, 1fr)`;
        } else {
            this.container.style.gridTemplateColumns = `repeat(auto-fit, minmax(280px, 1fr))`;
        }

        for (const source of this.packConfig.sources) {
            const groupEl = this._createSourceGroup(source);
            this.container.appendChild(groupEl);
        }
    }

    /**
     * Create a source group element.
     * @private
     * @param {import('../config/loader.js').SourceDef} source
     * @returns {HTMLElement}
     */
    _createSourceGroup(source) {
        const group = document.createElement('div');
        group.className = 'source-group';
        group.dataset.sourceType = source.type;

        // Header
        const header = document.createElement('div');
        header.className = 'source-group-header';
        header.innerHTML = `
      <div class="source-group-title">
        <span class="source-color-dot" style="background: ${source.color}"></span>
        <span>${source.name}</span>
      </div>
      <span class="source-type-badge">${source.type}</span>
    `;
        group.appendChild(header);

        // Pad grid
        const padsContainer = document.createElement('div');
        padsContainer.className = 'source-pads';

        const grid = document.createElement('div');
        grid.className = 'pad-grid';

        for (const sampleDef of source.samples) {
            const padEl = this._createPad(sampleDef, source.color);
            grid.appendChild(padEl);
            this.padElements.set(sampleDef.id, padEl);
        }

        // Add "+" button to add new samples
        const addPad = document.createElement('button');
        addPad.className = 'pad add-pad';
        addPad.innerHTML = '<span style="font-size:1.5rem;">+</span><span class="pad-label">Add</span>';
        addPad.title = 'Record or import a new sample';
        addPad.addEventListener('click', () => {
            if (this.onAddClick) {
                this.onAddClick(source.name, source);
            }
        });
        grid.appendChild(addPad);

        padsContainer.appendChild(grid);
        group.appendChild(padsContainer);

        return group;
    }

    /**
     * Create an individual pad element.
     * @private
     * @param {import('../config/loader.js').SampleDef} sampleDef
     * @param {string} color
     * @returns {HTMLElement}
     */
    _createPad(sampleDef, color) {
        const pad = document.createElement('button');
        pad.className = 'pad loading';
        pad.id = `pad-${sampleDef.id}`;
        pad.dataset.sampleId = sampleDef.id;

        // Compute a slightly darkened version for the pad background
        pad.style.setProperty('--pad-color', this._adjustColor(color, -30));
        pad.style.setProperty('--pad-glow', color);

        pad.innerHTML = `
      <span class="pad-label">${sampleDef.label}</span>
      ${sampleDef.key ? `<span class="pad-key">${sampleDef.key.toUpperCase()}</span>` : ''}
      <div class="pad-progress" style="width: 0%"></div>
      <button class="pad-fx-btn" data-sample-id="${sampleDef.id}" title="FX">🎚</button>
      <button class="pad-delete-btn" data-sample-id="${sampleDef.id}" title="Delete sample">🗑</button>
    `;

        // Click/touch handler
        pad.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            this.triggerSample(sampleDef.id);
        });

        pad.addEventListener('pointerup', (e) => {
            e.preventDefault();
            const player = this.players.get(sampleDef.id);
            if (player) player.release();
        });

        // Prevent context menu on long press (mobile)
        pad.addEventListener('contextmenu', (e) => e.preventDefault());

        // FX button handler (stop propagation so pad doesn't trigger)
        const fxBtn = pad.querySelector('.pad-fx-btn');
        if (fxBtn) {
            fxBtn.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                e.preventDefault();
            });
            fxBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (this.onFxClick) {
                    const player = this.players.get(sampleDef.id);
                    this.onFxClick(sampleDef.id, player);
                }
            });
        }

        // Delete button handler
        const deleteBtn = pad.querySelector('.pad-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('pointerdown', (e) => {
                e.stopPropagation();
                e.preventDefault();
            });
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.removeSample(sampleDef.id);
            });
        }

        return pad;
    }

    /**
     * Trigger a sample by ID.
     * @param {string} sampleId
     */
    triggerSample(sampleId) {
        const player = this.players.get(sampleId);
        if (player) {
            player.trigger();
        }
    }

    /**
     * Handle keyboard events.
     * @param {string} key - lowercase key
     * @param {'down'|'up'} action
     */
    handleKey(key, action) {
        const sampleId = this.keyMap.get(key);
        if (!sampleId) return;

        const player = this.players.get(sampleId);
        if (!player) return;

        if (action === 'down') {
            player.trigger();
        } else if (action === 'up') {
            player.release();
        }
    }

    /**
     * Update pad visual state.
     * @private
     * @param {string} sampleId
     * @param {string} event
     */
    _updatePadState(sampleId, event) {
        const padEl = this.padElements.get(sampleId);
        if (!padEl) return;

        padEl.classList.remove('loading', 'playing', 'error');

        switch (event) {
            case 'loading':
                padEl.classList.add('loading');
                break;
            case 'loaded':
                // Ready state — no extra class
                break;
            case 'playing':
                padEl.classList.add('playing');
                break;
            case 'stopped':
                // Clean state
                break;
            case 'error':
                padEl.classList.add('error');
                break;
        }
    }

    /**
     * Load all sample buffers.
     * @private
     * @returns {Promise<void>}
     */
    async _loadAll() {
        const promises = [];
        for (const player of this.players.values()) {
            promises.push(player.load());
        }
        await Promise.allSettled(promises);
        console.log(`[PadGrid] All samples loaded (${this.players.size} total)`);
    }

    /**
     * Adjust a hex color brightness.
     * @private
     * @param {string} hex
     * @param {number} amount
     * @returns {string}
     */
    _adjustColor(hex, amount) {
        const num = parseInt(hex.replace('#', ''), 16);
        const r = Math.min(255, Math.max(0, ((num >> 16) & 0xFF) + amount));
        const g = Math.min(255, Math.max(0, ((num >> 8) & 0xFF) + amount));
        const b = Math.min(255, Math.max(0, (num & 0xFF) + amount));
        return `rgb(${r}, ${g}, ${b})`;
    }

    /**
     * Show a toast notification.
     * @private
     * @param {string} message
     * @param {'success'|'error'|'info'} type
     */
    _showToast(message, type = 'info') {
        const event = new CustomEvent('botonera:toast', { detail: { message, type } });
        document.dispatchEvent(event);
    }

    /**
     * Remove a sample from the grid.
     * @param {string} sampleId
     */
    removeSample(sampleId) {
        const player = this.players.get(sampleId);
        if (!player) return;

        const label = player.config.label;

        // Stop if playing
        player.stop();

        // Destroy FX chain
        if (player.fxChain) {
            player.fxChain.destroy();
        }

        // Remove from maps
        this.players.delete(sampleId);

        // Remove key mapping
        for (const [key, id] of this.keyMap) {
            if (id === sampleId) {
                this.keyMap.delete(key);
                break;
            }
        }

        // Remove from pack config
        for (const source of this.packConfig.sources) {
            const idx = source.samples.findIndex(s => s.id === sampleId);
            if (idx !== -1) {
                source.samples.splice(idx, 1);
                break;
            }
        }

        // Animate and remove pad element
        const padEl = this.padElements.get(sampleId);
        if (padEl) {
            padEl.style.transition = 'all 0.25s ease-out';
            padEl.style.opacity = '0';
            padEl.style.transform = 'scale(0.8)';
            setTimeout(() => padEl.remove(), 250);
            this.padElements.delete(sampleId);
        }

        this._showToast(`"${label}" removed`, 'info');
    }

    /**
     * Get all keyboard mappings.
     * @returns {Map<string, string>}
     */
    getKeyMap() {
        return new Map(this.keyMap);
    }

    /**
     * Add a recorded sample to a source group dynamically.
     * @param {string} sourceName - Name of the source group to add to
     * @param {string} sampleName - Label for the new sample
     * @param {AudioBuffer} audioBuffer - The recorded audio buffer
     */
    addRecordedSample(sourceName, sampleName, audioBuffer) {
        // Find the source config
        const source = this.packConfig.sources.find(s => s.name === sourceName);
        if (!source) {
            this._showToast(`Source "${sourceName}" not found`, 'error');
            return;
        }

        // Generate unique ID
        const id = `rec-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

        const sampleDef = {
            id,
            label: sampleName,
            mode: 'oneshot',
        };

        // Add to config
        source.samples.push(sampleDef);

        // Create player
        const player = new SamplePlayer(sampleDef, 'recorded');
        this.players.set(id, player);

        // Listen for state changes BEFORE setting buffer
        // (setBuffer fires 'loaded' immediately)
        player.on((event, p) => this._updatePadState(p.config.id, event));

        // Create pad element BEFORE setting buffer so padElements map is ready
        const padEl = this._createPad(sampleDef, source.color);
        this.padElements.set(id, padEl);

        // NOW set the buffer — this triggers 'loaded' event which removes 'loading' class
        player.setBuffer(audioBuffer);

        // Create FX chain synchronously
        import('../audio/fx-chain.js').then(({ FXChain }) => {
            player.fxChain = new FXChain(id, {});
        });

        // Safety: ensure pad is visually ready (remove loading class)
        padEl.classList.remove('loading');

        // Insert pad before the "Add" button in the correct source group
        const groups = this.container.querySelectorAll('.source-group');
        for (const group of groups) {
            const title = group.querySelector('.source-group-title span:last-child');
            if (title && title.textContent === sourceName) {
                const addBtn = group.querySelector('.add-pad');
                if (addBtn) {
                    addBtn.parentElement.insertBefore(padEl, addBtn);
                }
                break;
            }
        }

        this._showToast(`"${sampleName}" added to ${sourceName}`, 'success');
    }

    /**
     * Destroy and clean up.
     */
    destroy() {
        for (const player of this.players.values()) {
            player.stop();
        }
        this.players.clear();
        this.padElements.clear();
        this.keyMap.clear();
        this.container.innerHTML = '';
    }
}
