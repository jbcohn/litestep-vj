# VJ Visualizer - Live DJ Backdrop & Stage Visuals

A dedicated, high-performance web-based VJ visualizer designed as an immersive live backdrop for DJ performances.

Built with pure client-side HTML5 Canvas, Web Audio API, and Three.js WebGL.

---

## 🚀 Quick Start

1. Open `index.html` directly in Google Chrome, Brave, or Safari, or start a local server:
   ```bash
   cd "/Users/joshcohn/Developer/T-Shirt Designs/vj-visualizer"
   python3 -m http.server 8080
   ```
2. Navigate to `http://localhost:8080`
3. Click **"Audio: Sim Beat"** to switch to **"Live Audio: ON"** (grant microphone / audio interface permissions when prompted).
4. Press **`F`** to enter Clean Projector Fullscreen mode.

---

## 🎨 Visual Scenes

The visualizer includes three modular, audio-reactive scenes:

1. **`1` - Form Constants & Mandalas**:
   * Mathematical psychedelic geometry (Klüver form constants: Spirals, Cobwebs, Tunnels, Lattices, and Phyllotaxis).
   * Sub/Bass kick pulses the master scale and breathing radius.
   * Mids cycle vibrant cyberpunk, thermal, and bioluminescent palettes.
   * Highs/transients modulate spiral twists and tunnel perspectives.

2. **`2` - 3D Topographic Ridgelines**:
   * Wireframe mountain elevation contours based on California peaks (Mt. Shasta, Mt. Diablo, Mt. Tamalpais, Mt. Whitney).
   * Rolling bass waves ripple upward through the mountain elevation profiles.
   * Camera glides forward across the terrain, with flight speed accelerating during energetic track sections.

3. **`3` - Minimal Bubble Surfaces & Soap Films**:
   * Fluid organic bubble cluster simulation with Plateau border contact films.
   * Bass pulses the internal pressure, expanding and compressing bubbles.
   * Thin-film iridescent interference highlights shift with mid frequencies.
   * Heavy kicks trigger acoustic agitation, dispersing the bubble cluster outward.

---

## 🎹 Live VJ Performance Hotkeys

| Key | Action | Description |
| :--- | :--- | :--- |
| **`F`** or **`H`** | **Clean Fullscreen** | Toggles projector mode and hides all HUD controls. |
| **`Space`** | **Drop Flash** | Instant whiteout burst timed to beat drops and build-ups. |
| **`B`** | **Blackout** | Instant blackout for track pauses, breakdowns, and transitions. |
| **`1`** | **Scene 1** | Cut directly to Form Constants / Mandalas. |
| **`2`** | **Scene 2** | Cut directly to 3D Topographic Mountain Ridgelines. |
| **`3`** | **Scene 3** | Cut directly to Minimal Bubble Surfaces. |
| **`T`** | **Tap Tempo** | Tap to track BPM for synced rotation and rhythmic pulses. |
| **`↑` / `↓`** | **Gain / Sensitivity** | Increase or decrease audio responsiveness on the fly. |

---

## 🎧 Audio Reactivity Pipeline

* **Web Audio API**: Captures 1024-bin FFT spectrum from laptop microphone, audio interface, or DJ mixer booth output.
* **4-Band Separation**: Sub (20–80Hz), Bass (80–250Hz), Mids (250–2500Hz), Highs (2.5k–10kHz).
* **Transient Detection**: Dynamic variance tracker detects kick drum spikes.
* **Autonomous Director**: Smoothly crossfades between scenes every 60 seconds (or automatically cuts on detected drops).
* **Fallback Simulator**: Plays an internal 124 BPM 4-on-the-floor beat if no microphone is connected so visuals never stall.
