# LiteStep VJ — Live DJ Backdrop & Stage Visualizer

An audio-reactive, high-performance web-based VJ visualizer designed as an immersive live backdrop for electronic music performances, clubs, and stage screens.

Built entirely with pure client-side **HTML5 Canvas**, **Web Audio API**, and **Three.js WebGL**. Zero dependencies, zero build steps, and runs in any modern browser.

🌐 **Live Web App**: [https://jbcohn.github.io/litestep-vj/](https://jbcohn.github.io/litestep-vj/)

---

## 🚀 Quick Start

### Run in Browser
Open `index.html` directly in Google Chrome, Brave, Edge, or Safari, or start a local HTTP server:

```bash
python3 -m http.server 8000
```
Then navigate to `http://localhost:8000`.

1. **Activate Audio**: Click **"Audio: Sim Beat"** in the bottom HUD to switch to **"Live Audio: ON"** (grant microphone / line-in permissions when prompted).
2. **Projector Fullscreen**: Press **`F`** to toggle clean fullscreen mode (hides all HUD controls).
3. **Rear Projection**: Press **`X`** to instantly flip the display horizontally for rear-projection screens.

---

## 🎨 Visual Scenes

The visualizer features 5 modular, audio-reactive scenes with autonomous crossfading:

| Scene | Name | Engine | Description |
| :---: | :--- | :---: | :--- |
| **`1`** | **Form Constants & Mandalas** | 2D Canvas | Mathematical psychedelic sacred geometry based on Heinrich Klüver's form constants (Spirals, Cobwebs, Tunnels, Lattices, and Phyllotaxis). Sub/Bass kick pulses breathing scale; mids modulate vibrant cyberpunk and bioluminescent palettes. |
| **`2`** | **3D Topographic Ridgelines** | Three.js WebGL | Wireframe mountain elevation contours derived from USGS DEM data (Mt. Shasta, Mt. Diablo, Mt. Tamalpais, Mt. Whitney). Rolling bass waves ripple upward through elevation profiles as the camera glides across the range. |
| **`3`** | **Michel-Lévy Iridescent Bubbles** | 2D Canvas | Fluid organic bubble cluster simulation with Plateau border contact films. Bass pulses internal pressure, while thin-film iridescent interference highlights shift with mid frequencies. Heavy transients trigger acoustic dispersion. |
| **`4`** | **3D Cloud-Swept Mountains** | Three.js WebGL | 3D wireframe terrain featuring authentic elevation profiles: **Mt. Nebo (UT)**, **Mt. Diablo**, **Mt. Shasta**, **Mt. Whitney**, **Mt. Tamalpais**, **Mt. Vaca**, **Mt. Monroe**, and **Maui (Haleakalā)**. Features undulating cloud blankets and peak watermarks. |
| **`5`** | **Liquid Mocap Bubble Dancers** | Three.js WebGL | 3D liquid bubble dancer executing authentic AIST++ mocap choreography (17 dance styles including House Bounce, C-Walk, Running Man, Roger Rabbit, LA Pop). Features musical power-of-2 speed scaling (0.5x, 1x, 2x, 4x), camera angle presets, and custom anatomy styling. |

---

## 🎹 Keyboard Shortcuts

| Key | Action | Description |
| :--- | :--- | :--- |
| **`F`** / **`H`** | **Clean Fullscreen** | Toggle projector fullscreen mode and hide all HUD controls. |
| **`Space`** / **`R`** | **Drop Flash** | Instant whiteout burst timed to beat drops and build-ups. |
| **`B`** | **Blackout** | Instant blackout for track pauses, breakdowns, and transitions. |
| **`X`** | **Rear Projection Mirror** | Horizontally flips visual output (`scaleX(-1)`) while keeping controls readable. |
| **`1` – `5`** | **Select Scene** | Direct cut to scenes 1 through 5. |
| **`L`** | **Hold Scene / Auto** | Toggle autonomous director timer vs. locking on current scene. |
| **`M`** | **Cycle Mountain / Outfit** | Cycle mountain peak (Scenes 2 & 4) or dancer garment palette (Scene 5). |
| **`N`** | **Mountain Cadence** | Cycle beat cadence for mountain transitions (32B, 16B, 8B, 4B, Manual). |
| **`P`** | **Proportions Studio** | Open the WYSIWYG Character & Anatomy Tuner drawer. |
| **`T`** | **Tap Tempo** | Tap to synchronize visual tempo and rhythmic pulses to live BPM. |
| **`↑` / `↓`** | **Sensitivity** | Increase or decrease audio responsiveness gain on the fly. |
| **`[` / `]`** | **Dancer Speed** | Step dancer speed through power-of-2 divisions (0.5x, 1.0x, 2.0x, 4.0x). |

---

## 🪞 Rear Projection Mirror Mode

When projecting from behind a translucent screen facing an audience, standard projection displays text and choreography backward.

Pressing **`X`** (or clicking **`🪞 Mirror: Off` / `🪞 Mirror: ON`** in the HUD) applies a hardware-accelerated GPU horizontal flip (`transform: scaleX(-1)`) across all render canvases and title badges. The VJ cockpit HUD (`#vj-hud`) and Proportions Studio Drawer (`#proportions-drawer`) remain unmirrored so controls stay legible to the operator.

---

## 📐 Proportions & Anatomy Studio (`P`)

Press **`P`** to slide out the real-time anatomy tuner:
* **Pose Modes**: Switch between `Dance`, `Pause`, `T-Pose`, and `A-Pose` to inspect proportions from any angle.
* **Camera Presets**: Orbit, Orbit Paused, Front, 3/4 Perspective, Side Profile, and Top View.
* **Sliders**: Real-time control of head, neck, chest, bust (volume, forward, upward, width), spine, pelvis, glutes, clavicle, shoulders, shoulder width, arms, hands, hips, thighs, calves, ankles, shoes, and trapezius.
* **Presets**: Built-in proportion presets including *Default Female*, *Skinny Chic*, *Athletic*, and *Curvy*.
* **📋 Copy Code**: Export customized proportion objects directly to clipboard as JSON.

---

## 🎧 Audio Engine Pipeline

* **Web Audio API**: 1024-bin FFT spectrum from microphone, USB audio interface, or DJ mixer booth output.
* **4-Band Separation**: Sub (20–80Hz), Bass (80–250Hz), Mids (250–2500Hz), Highs (2.5k–10kHz).
* **Transient Detection**: Dynamic variance tracker detects kick drum spikes.
* **Fallback Synthesizer**: Internal 124 BPM 4-on-the-floor beat simulator keeps visuals alive if no microphone input is active.
* **Autonomous Director**: Crossfades between scenes every 60 seconds or executes cuts on detected beat drops.

---

## 📄 License

MIT License. Free for live performance, streaming, and creative use.
