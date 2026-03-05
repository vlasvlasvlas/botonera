/**
 * BOTONERA — Keyboard Handler
 * Maps physical keyboard keys to pad triggers with minimal latency.
 */

export class KeyboardHandler {
    /**
     * @param {import('./pad-grid.js').PadGrid} padGrid
     */
    constructor(padGrid) {
        this.padGrid = padGrid;

        /** @type {Set<string>} - Currently held keys (prevent repeat) */
        this._heldKeys = new Set();

        /** @type {boolean} */
        this.enabled = true;

        this._onKeyDown = this._onKeyDown.bind(this);
        this._onKeyUp = this._onKeyUp.bind(this);
    }

    /**
     * Start listening for keyboard events.
     */
    attach() {
        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);
        console.log('[Keyboard] Attached — mappings:', Object.fromEntries(this.padGrid.getKeyMap()));
    }

    /**
     * Stop listening for keyboard events.
     */
    detach() {
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('keyup', this._onKeyUp);
        this._heldKeys.clear();
    }

    /**
     * @private
     * @param {KeyboardEvent} e
     */
    _onKeyDown(e) {
        if (!this.enabled) return;

        // Don't capture if typing in an input field
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
            return;
        }

        const key = e.key.toLowerCase();

        // Skip modifier keys and already held keys
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        if (this._heldKeys.has(key)) return;

        // Check if this key is mapped
        if (this.padGrid.getKeyMap().has(key)) {
            e.preventDefault();
            this._heldKeys.add(key);
            this.padGrid.handleKey(key, 'down');
        }

        // Special: Space to stop all
        if (key === ' ') {
            e.preventDefault();
        }
    }

    /**
     * @private
     * @param {KeyboardEvent} e
     */
    _onKeyUp(e) {
        if (!this.enabled) return;

        const key = e.key.toLowerCase();
        this._heldKeys.delete(key);

        if (this.padGrid.getKeyMap().has(key)) {
            e.preventDefault();
            this.padGrid.handleKey(key, 'up');
        }
    }

    /**
     * Enable/disable keyboard handling.
     * @param {boolean} state
     */
    setEnabled(state) {
        this.enabled = state;
        if (!state) {
            this._heldKeys.clear();
        }
    }
}
