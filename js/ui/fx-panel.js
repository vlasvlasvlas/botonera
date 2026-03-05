/**
 * BOTONERA — FX Panel UI
 * Renders and manages the FX controls panel for individual samples.
 */

import { FXChain, FX_DEFAULTS } from '../audio/fx-chain.js';

export class FXPanel {
    constructor() {
        /** @type {HTMLElement|null} */
        this.panelEl = null;

        /** @type {FXChain|null} */
        this.currentFXChain = null;

        /** @type {string|null} */
        this.currentSampleId = null;

        /** @type {string|null} */
        this.currentSampleLabel = null;

        /** @type {boolean} */
        this.isOpen = false;

        this._build();
    }

    /**
     * Build the FX panel DOM.
     * @private
     */
    _build() {
        this.panelEl = document.createElement('div');
        this.panelEl.className = 'fx-panel';
        this.panelEl.id = 'fx-panel';

        this.panelEl.innerHTML = `
      <div class="fx-panel-header">
        <div class="fx-panel-title">
          <h3>🎚️ FX Chain</h3>
          <span class="fx-target-name" id="fx-target-name">—</span>
        </div>
        <div class="fx-panel-actions">
          <button class="icon-btn" id="fx-reset-btn" title="Reset all FX">↺</button>
          <button class="icon-btn" id="fx-close-btn" title="Close FX panel">✕</button>
        </div>
      </div>
      <div class="fx-sections">
        ${this._buildSection('delay', '🔁 Delay', [
            { param: 'time', label: 'Time', min: 0.01, max: 2, step: 0.01, unit: 's' },
            { param: 'feedback', label: 'Fdbk', min: 0, max: 0.95, step: 0.01, unit: '' },
            { param: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, unit: '' },
        ])}
        ${this._buildSection('reverb', '🏛️ Reverb', [
            { param: 'decay', label: 'Decay', min: 0.1, max: 10, step: 0.1, unit: 's' },
            { param: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, unit: '' },
        ])}
        ${this._buildSection('distortion', '🔥 Distortion', [
            { param: 'amount', label: 'Drive', min: 0, max: 100, step: 1, unit: '' },
            { param: 'mix', label: 'Mix', min: 0, max: 1, step: 0.01, unit: '' },
        ])}
        ${this._buildFilterSection()}
        ${this._buildSection('compressor', '🗜️ Compressor', [
            { param: 'threshold', label: 'Thresh', min: -100, max: 0, step: 1, unit: 'dB' },
            { param: 'knee', label: 'Knee', min: 0, max: 40, step: 1, unit: 'dB' },
            { param: 'ratio', label: 'Ratio', min: 1, max: 20, step: 0.5, unit: ':1' },
            { param: 'attack', label: 'Atk', min: 0, max: 1, step: 0.001, unit: 's' },
            { param: 'release', label: 'Rel', min: 0.01, max: 1, step: 0.01, unit: 's' },
        ])}
      </div>
    `;

        // Attach event listeners
        this.panelEl.querySelector('#fx-close-btn').addEventListener('click', () => this.close());
        this.panelEl.querySelector('#fx-reset-btn').addEventListener('click', () => this._resetAll());

        // Toggle buttons
        this.panelEl.querySelectorAll('.fx-toggle').forEach(toggle => {
            toggle.addEventListener('click', () => {
                const fx = toggle.dataset.fx;
                const section = toggle.closest('.fx-section');
                const isActive = toggle.classList.toggle('active');
                section.classList.toggle('disabled', !isActive);

                if (this.currentFXChain) {
                    if (!isActive) {
                        // Set mix to 0 to disable
                        const mixSlider = section.querySelector(`[data-param="mix"]`);
                        if (mixSlider) {
                            mixSlider.value = 0;
                            this._handleSliderChange(fx, 'mix', 0);
                        }
                    }
                }
            });
        });

        // Slider inputs
        this.panelEl.querySelectorAll('.fx-slider').forEach(slider => {
            slider.addEventListener('input', (e) => {
                const fx = e.target.dataset.fx;
                const param = e.target.dataset.param;
                const value = parseFloat(e.target.value);
                this._handleSliderChange(fx, param, value);

                // Update value display
                const valueEl = e.target.parentElement.querySelector('.fx-control-value');
                if (valueEl) {
                    valueEl.textContent = this._formatValue(value, e.target.dataset.unit);
                }

                // Auto-activate toggle if mix > 0
                if (param === 'mix' && value > 0) {
                    const toggle = this.panelEl.querySelector(`.fx-toggle[data-fx="${fx}"]`);
                    const section = toggle?.closest('.fx-section');
                    if (toggle && !toggle.classList.contains('active')) {
                        toggle.classList.add('active');
                        section?.classList.remove('disabled');
                    }
                }
            });
        });

        // Filter type select
        const filterSelect = this.panelEl.querySelector('#fx-filter-type');
        if (filterSelect) {
            filterSelect.addEventListener('change', (e) => {
                if (this.currentFXChain) {
                    this.currentFXChain.setFilter({ type: e.target.value });
                }
            });
        }

        document.body.appendChild(this.panelEl);
    }

    /**
     * Build a standard FX section.
     * @private
     */
    _buildSection(fxName, title, controls) {
        const defaults = FX_DEFAULTS[fxName];
        const hasMix = controls.some(c => c.param === 'mix');
        const isActive = hasMix ? defaults.mix > 0 : true;

        return `
      <div class="fx-section ${isActive ? '' : 'disabled'}" data-fx="${fxName}">
        <div class="fx-section-header">
          <span class="fx-section-title"><span class="fx-icon">${title.split(' ')[0]}</span> ${title.split(' ').slice(1).join(' ')}</span>
          <div class="fx-toggle ${isActive ? 'active' : ''}" data-fx="${fxName}" role="switch" aria-label="Toggle ${fxName}"></div>
        </div>
        <div class="fx-controls">
          ${controls.map(c => `
            <div class="fx-control">
              <label class="fx-control-label">${c.label}</label>
              <input
                type="range"
                class="fx-slider"
                data-fx="${fxName}"
                data-param="${c.param}"
                data-unit="${c.unit || ''}"
                min="${c.min}"
                max="${c.max}"
                step="${c.step}"
                value="${defaults[c.param]}"
              >
              <span class="fx-control-value">${this._formatValue(defaults[c.param], c.unit)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
    }

    /**
     * Build the filter section with type selector.
     * @private
     */
    _buildFilterSection() {
        const defaults = FX_DEFAULTS.filter;
        return `
      <div class="fx-section disabled" data-fx="filter">
        <div class="fx-section-header">
          <span class="fx-section-title"><span class="fx-icon">🎛️</span> Filter</span>
          <div class="fx-toggle" data-fx="filter" role="switch" aria-label="Toggle filter"></div>
        </div>
        <div class="fx-controls">
          <div class="fx-control">
            <label class="fx-control-label">Type</label>
            <select class="fx-select" id="fx-filter-type" data-fx="filter" data-param="type">
              <option value="lowpass" ${defaults.type === 'lowpass' ? 'selected' : ''}>Low Pass</option>
              <option value="highpass" ${defaults.type === 'highpass' ? 'selected' : ''}>High Pass</option>
              <option value="bandpass" ${defaults.type === 'bandpass' ? 'selected' : ''}>Band Pass</option>
              <option value="notch" ${defaults.type === 'notch' ? 'selected' : ''}>Notch</option>
            </select>
          </div>
          <div class="fx-control">
            <label class="fx-control-label">Freq</label>
            <input type="range" class="fx-slider" data-fx="filter" data-param="frequency" data-unit="Hz" min="20" max="20000" step="1" value="${defaults.frequency}">
            <span class="fx-control-value">${this._formatValue(defaults.frequency, 'Hz')}</span>
          </div>
          <div class="fx-control">
            <label class="fx-control-label">Q</label>
            <input type="range" class="fx-slider" data-fx="filter" data-param="Q" data-unit="" min="0.1" max="30" step="0.1" value="${defaults.Q}">
            <span class="fx-control-value">${this._formatValue(defaults.Q, '')}</span>
          </div>
        </div>
      </div>
    `;
    }

    /**
     * Open the FX panel for a specific sample.
     * @param {string} sampleId
     * @param {string} label
     * @param {FXChain} fxChain
     */
    open(sampleId, label, fxChain) {
        this.currentSampleId = sampleId;
        this.currentSampleLabel = label;
        this.currentFXChain = fxChain;

        // Update target name
        this.panelEl.querySelector('#fx-target-name').textContent = label;

        // Sync sliders with current FX state
        this._syncSliders(fxChain);

        // Open panel
        this.panelEl.classList.add('open');
        this.isOpen = true;
    }

    /**
     * Close the FX panel.
     */
    close() {
        this.panelEl.classList.remove('open');
        this.isOpen = false;
        this.currentFXChain = null;
        this.currentSampleId = null;
    }

    /**
     * Toggle the FX panel.
     * @param {string} sampleId
     * @param {string} label
     * @param {FXChain} fxChain
     */
    toggle(sampleId, label, fxChain) {
        if (this.isOpen && this.currentSampleId === sampleId) {
            this.close();
        } else {
            this.open(sampleId, label, fxChain);
        }
    }

    /**
     * Sync slider values with an FX chain's current config.
     * @private
     * @param {FXChain} fxChain
     */
    _syncSliders(fxChain) {
        const config = fxChain.getConfig();

        for (const [fxName, fxConfig] of Object.entries(config)) {
            for (const [param, value] of Object.entries(fxConfig)) {
                const slider = this.panelEl.querySelector(
                    `.fx-slider[data-fx="${fxName}"][data-param="${param}"]`
                );
                if (slider) {
                    slider.value = value;
                    const valueEl = slider.parentElement.querySelector('.fx-control-value');
                    if (valueEl) {
                        valueEl.textContent = this._formatValue(value, slider.dataset.unit);
                    }
                }

                // Special: filter type select
                if (fxName === 'filter' && param === 'type') {
                    const select = this.panelEl.querySelector('#fx-filter-type');
                    if (select) select.value = value;
                }
            }

            // Sync toggle state
            const toggle = this.panelEl.querySelector(`.fx-toggle[data-fx="${fxName}"]`);
            const section = this.panelEl.querySelector(`.fx-section[data-fx="${fxName}"]`);
            if (toggle && section) {
                const isActive = fxChain.activeEffects[fxName];
                toggle.classList.toggle('active', isActive);
                section.classList.toggle('disabled', !isActive);
            }
        }
    }

    /**
     * Handle slider value changes.
     * @private
     */
    _handleSliderChange(fxName, param, value) {
        if (!this.currentFXChain) return;

        const setter = {
            delay: 'setDelay',
            reverb: 'setReverb',
            distortion: 'setDistortion',
            filter: 'setFilter',
            compressor: 'setCompressor',
        }[fxName];

        if (setter) {
            this.currentFXChain[setter]({ [param]: value });
        }
    }

    /**
     * Reset all FX to defaults.
     * @private
     */
    _resetAll() {
        if (this.currentFXChain) {
            this.currentFXChain.reset();
            this._syncSliders(this.currentFXChain);
        }
    }

    /**
     * Format a value for display.
     * @private
     */
    _formatValue(value, unit) {
        if (unit === 'Hz') {
            if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
            return `${Math.round(value)}`;
        }
        if (unit === 'dB') return `${Math.round(value)}`;
        if (unit === ':1') return `${value.toFixed(1)}`;
        if (unit === 's') return `${value.toFixed(2)}`;
        if (value >= 1) return `${Math.round(value)}`;
        return `${(value * 100).toFixed(0)}%`;
    }
}
