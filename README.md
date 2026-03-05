# ⚡ Botonera

**Web Sample Trigger Pad & Looper Station**

A browser-based sample trigger, audio recorder, FX processor, and looper station. Built with vanilla HTML/JS/CSS and the Web Audio API for ultra-low latency performance. No frameworks, no build step — just open and play.

> 🎵 [**Live Demo →**](https://vlasvlasvlas.github.io/botonera/)

---

## ✨ Features

### 🎛️ Pad Grid Engine
- Dynamic pad grid rendered from YAML/JSON pack configuration
- Ultra-low latency triggering (~5ms) via Web Audio API
- Keyboard shortcuts for every pad (Q-V mapped)
- Multiple source groups with color coding (Drums, Synth, FX, etc.)
- Synthetic sample generation (kick, snare, hihat, bass, leads, FX)
- Master volume control with real-time VU meter
- Responsive design — works on desktop and mobile
- "Stop All" panic button (Spacebar)

### 🎚️ Per-Sample FX Chain
Each pad has its own independent FX chain with 5 studio-quality effects:

| Effect | Parameters | Color |
|--------|-----------|-------|
| **Delay** | Time, Feedback, Mix | 🔵 Cyan |
| **Reverb** | Decay, Mix (convolver-based) | 🟣 Purple |
| **Distortion** | Drive, Mix (waveshaper) | 🩷 Pink |
| **Filter** | Type (LP/HP/BP/Notch), Freq, Q | 🟠 Orange |
| **Compressor** | Threshold, Knee, Ratio, Atk, Rel | 🟢 Green |

- Slide-up FX panel with labeled sliders and toggle switches
- Auto-activation when Mix > 0
- Reset all FX with one button
- Signal chain: Filter → Distortion → Delay → Reverb → Compressor → Master

### 🎙️ Recording & Audio Editor
- Record from microphone via `getUserMedia` + `MediaRecorder`
- Real-time input level meter with clip detection
- Full waveform editor with:
  - **Visual waveform** — color-coded amplitude bars
  - **Region selection** — click & drag to select portions
  - **Trim** — cut to selection
  - **Reverse** — flip audio backwards
  - **Normalize** — peak normalize to 95%
  - **Fade In / Fade Out** — smooth volume ramps
  - **Undo** — 20-level undo stack
  - **Preview playback** — play selected region with animated position
- Export as WAV file
- "Add to Pad" — saves recording as a new triggerable pad
- Delete any pad with the 🗑 button (appears on hover)

### 📦 Pack Configuration
Define sample packs in YAML or JSON:

```yaml
name: "My Pack"
bpm: 120
sources:
  - name: "Drums"
    type: "audio"
    color: "#ff6b35"
    samples:
      - id: kick
        label: "Kick"
        key: "q"
        file: "samples/kick.wav"
        mode: "oneshot"
        fx:
          delay: { time: 0.3, feedback: 0.2, mix: 0.1 }
```

Multiple source types supported: `audio` (WAV/MP3), `synthetic` (generated), `youtube` (coming soon), `midi` (coming soon).

---

## 🚀 Quick Start

```bash
# Clone the repo
git clone https://github.com/vlasvlasvlas/botonera.git
cd botonera

# Serve locally (required for ES modules)
npx serve .
# or
python3 -m http.server 8000
```

Open `http://localhost:3000` (or `:8000`) and **click anywhere** to unlock the audio engine.

---

## ⌨️ Keyboard Shortcuts

| Key | Sample | Group |
|-----|--------|-------|
| `Q` | Kick | Drums |
| `W` | Snare | Drums |
| `E` | Hi-Hat | Drums |
| `R` | Open HH | Drums |
| `A` | Bass C | Synth |
| `S` | Bass E | Synth |
| `D` | Bass G | Synth |
| `F` | Lead C | Synth |
| `Z` | Rise | FX |
| `X` | Noise | FX |
| `C` | Beep | FX |
| `V` | Sub | FX |
| `Space` | Stop All | — |

---

## 🏗️ Architecture

```
botonera/
├── index.html              # App shell
├── css/
│   ├── main.css            # Design system (dark theme, tokens)
│   ├── pads.css            # Pad grid styles & states
│   ├── fx.css              # FX panel styles (color-coded)
│   └── editor.css          # Recording modal & waveform
├── js/
│   ├── app.js              # Main orchestrator
│   ├── audio/
│   │   ├── engine.js       # AudioContext singleton + synth generation
│   │   ├── sample-player.js # Multi-mode sample player + FX routing
│   │   ├── fx-chain.js     # DSP graph (delay/reverb/dist/filter/comp)
│   │   └── recorder.js     # Mic recording via MediaRecorder
│   ├── config/
│   │   └── loader.js       # YAML/JSON pack parser + validator
│   ├── ui/
│   │   ├── pad-grid.js     # Dynamic grid renderer + add/delete
│   │   ├── keyboard.js     # Keyboard shortcut handler
│   │   ├── fx-panel.js     # Slide-up FX controls panel
│   │   └── editor-ui.js    # Recording modal + waveform editor
│   └── utils/
│       └── audio-utils.js  # Trim, reverse, normalize, fade, WAV export
└── packs/
    └── demo-pack.yaml      # Demo pack configuration
```

### Audio Signal Flow

```
Sample Buffer
    │
    ▼
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Filter  │───▶│Distortion│───▶│  Delay   │───▶│  Reverb  │───▶│Compressor│
│(Biquad)  │    │(Waveshpr)│    │(Feedback)│    │(Convolve)│    │(Dynamics)│
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                                      │
                                                                      ▼
                                                               ┌────────────┐
                                                               │ Master Gain│
                                                               │  + VU Meter│
                                                               └────────────┘
                                                                      │
                                                                      ▼
                                                                 🔊 Output
```

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Audio** | Web Audio API (AudioContext, BufferSource, Analyser, BiquadFilter, Convolver, WaveShaper, DynamicsCompressor) |
| **Recording** | `getUserMedia` + `MediaRecorder` API |
| **UI** | Vanilla JS (ES Modules), HTML5, CSS3 |
| **Styling** | CSS Custom Properties, Grid, Flexbox, `backdrop-filter` |
| **Fonts** | Inter + JetBrains Mono (Google Fonts) |
| **Config** | YAML via js-yaml CDN |
| **Deploy** | GitHub Pages via GitHub Actions |

---

## 🗺️ Roadmap

| Fase | Feature | Status |
|------|---------|--------|
| 1 | Core engine + pad grid | ✅ Done |
| 2 | Per-sample FX chain | ✅ Done |
| 3 | Mic recording + waveform editor | ✅ Done |
| 4 | Multi-track looper with BPM sync | 🔜 Next |
| 5 | YouTube embeds, MIDI, PWA offline | 🔜 Planned |

---

## 📄 License

MIT

---

**Built with ❤️ and the Web Audio API**
