/**
 * VJ Visualizer - Master Controller & Stage Director
 * Coordinates audio reactivity, 4-scene cycling, crossfades,
 * live VJ performance hotkeys, and projector presentation HUD.
 * Scenes:
 *   0 = MandalaScene   (2D canvas - Sacred Geometry & 3D Perspective Lattices)
 *   1 = RidgelineScene (WebGL - THREE.js Joy Division Ribbons)
 *   2 = BubbleScene    (2D canvas - Authentic Iridescent Michel-Lévy Foam)
 *   3 = MountainScene  (WebGL - THREE.js Paraglider Sunset Rolling Terrain)
 */

class VJController {
    constructor() {
        this.canvas2D = null;
        this.ctx2D = null;
        this.threeContainer = null;

        this.scenes = [];
        this.activeSceneIdx = 4; // Start with Scene 5: Mocap Dancer
        this.previousSceneIdx = -1;
        this.crossfadeAlpha = 1.0;
        this.isCrossfading = false;
        this.crossfadeDuration = 2.4;

        // Two-Counter Director:
        // Counter 1: On every odd step, Dancer (Scene 5 / idx 4) is shown.
        //            On every even step, Counter 2 is consulted and advanced.
        // Counter 2: Cycles sequentially through ambient scenes (0=Mandalas, 1=Ridgelines, 2=Bubbles, 3=Mountain).
        this.counter1 = 1; // Start on odd (Dancer)
        this.counter2 = 0; // Next ambient scene will be Scene 1 (Mandalas / idx 0)

        this.autoCycleEnabled = true;
        this.timeInCurrentScene = 0;
        this.sceneDuration = 60;

        this.flashIntensity = 0.0;
        this.blackout = false;

        this.hudVisible = true;
        this.hudTimeout = null;
        this.lastTime = performance.now();

        this.terrainNames = ["Diablo", "Shasta", "Tam", "Vaca", "Whitney", "Monroe", "Nebo", "Maui"];
        this.terrainIdx = 0;
        this.timeInCurrentTerrain = 0;
        this.mountainBeatCadence = 32; // 32 beats per mountain (doubled cadence for full 20s 4-phase lifecycle)
        this.mountainBeatCounter = 0;

        // On-screen Dance Title Overlay state
        this.danceTitleEnabled = true;
        this.danceTitleStyle = "lower_third"; // "minimal", "lower_third", "center_pop", "neon_glow", "marquee"
        this.danceTitleTimeout = null;

        // Rear Projection Mirror Display state
        this.isMirrored = false;
        this._toastTimer = null;
    }

    init() {
        this.canvas2D = document.getElementById("canvas-2d");
        this.ctx2D = this.canvas2D.getContext("2d");
        this.threeContainer = document.getElementById("canvas-three-container");

        this.handleResize();
        window.addEventListener("resize", () => this.handleResize());

        // Scene 0: Form Constants / Mandalas (2D canvas)
        var mandalaScene = new MandalaScene();
        mandalaScene.init(this.canvas2D, this.ctx2D);

        // Scene 1: Joy Division Ridgelines (WebGL)
        var ridgelineScene = new RidgelineScene();
        ridgelineScene.init(this.threeContainer);

        // Scene 2: Bubble Surfaces (2D canvas - Authentic Michel-Lévy Foam)
        var bubbleScene = new BubbleScene();
        bubbleScene.init(this.canvas2D, this.ctx2D);

        // Scene 3: Paraglider Sunset Mountain (WebGL)
        var mountainScene = new MountainScene();
        mountainScene.init(this.threeContainer);

        // Scene 4: Liquid Mocap Bubble Dancer (WebGL)
        var dancerScene = new DancerScene();
        dancerScene.init(this.threeContainer);

        this.scenes = [mandalaScene, ridgelineScene, bubbleScene, mountainScene, dancerScene];

        this.bindEvents();
        this.bindHotkeys();
        this.bindProportionsStudio();
        this.updateHUD();

        // DEFAULT TO LIVE AUDIO:
        this.activateLiveAudio();

        window.audioEngine.onDrop(() => {
            this.triggerDropFlash();
            if (this.autoCycleEnabled && Math.random() < 0.5) this.nextScene();
        });

        requestAnimationFrame((t) => this.renderLoop(t));
    }

    _isWebGL(idx) { return idx === 1 || idx === 3 || idx === 4; }

    /**
     * Start live audio immediately and attach first-gesture auto-resume
     */
    activateLiveAudio() {
        var btnMic = document.getElementById("btn-audio-toggle");
        if (btnMic) {
            btnMic.textContent = "Audio: Connecting...";
            btnMic.classList.add("active");
        }

        var tryStart = async () => {
            var ok = await window.audioEngine.startAudioInput();
            if (btnMic) {
                btnMic.textContent = ok ? "Live Audio: ON" : "Audio: Sim Beat";
                btnMic.classList.toggle("active", ok);
            }
            return ok;
        };

        // 1. Immediate attempt on page load
        tryStart().catch(() => {});

        // 2. Fallback on first user gesture anywhere on screen
        var onFirstGesture = () => {
            if (!window.audioEngine.isListening) {
                tryStart();
            }
            window.removeEventListener("click", onFirstGesture);
            window.removeEventListener("keydown", onFirstGesture);
            window.removeEventListener("touchstart", onFirstGesture);
        };
        window.addEventListener("click", onFirstGesture);
        window.addEventListener("keydown", onFirstGesture);
        window.addEventListener("touchstart", onFirstGesture);
    }

    handleResize() {
        var width = window.innerWidth, height = window.innerHeight;
        this.canvas2D.width  = width;
        this.canvas2D.height = height;
        if (this.scenes) {
            if (this.scenes[1] && this.scenes[1].resize) this.scenes[1].resize(width, height);
            if (this.scenes[3] && this.scenes[3].resize) this.scenes[3].resize(width, height);
            if (this.scenes[4] && this.scenes[4].resize) this.scenes[4].resize(width, height);
        }
    }

    setScene(idx) {
        if (idx === this.activeSceneIdx || idx < 0 || idx >= this.scenes.length) return;
        this.previousSceneIdx = this.activeSceneIdx;
        this.activeSceneIdx   = idx;
        this.crossfadeAlpha   = 0.0;
        this.isCrossfading    = true;
        this.timeInCurrentScene = 0;

        // Keep two counters synchronized with manual scene selections:
        if (idx === 4) {
            // Dancer selected manually: set counter1 to odd (1)
            this.counter1 = 1;
        } else {
            // Ambient scene (0..3) selected manually: set counter1 to even (0),
            // and prepare counter2 for the subsequent ambient scene (idx + 1)
            this.counter1 = 0;
            this.counter2 = (idx + 1) % 4;
        }

        var s = this.scenes[idx];
        if (s.randomizeGeometry) s.randomizeGeometry();
        if (s.switchTerrain)     s.switchTerrain();
        if (s.agitateCluster)    s.agitateCluster();
        if (s.mutate)            s.mutate();

        this.updateHUD();
    }

    nextScene() {
        this.counter1++;
        var nextIdx;
        if (this.counter1 % 2 === 1) {
            // Odd step: Dancer (Scene 5 / idx 4)
            nextIdx = 4;
        } else {
            // Even step: Consult counter 2 (0..3), then advance it
            nextIdx = this.counter2;
            this.counter2 = (this.counter2 + 1) % 4;
        }
        this.setScene(nextIdx);
    }

    /**
     * Trigger drop flash & instantly mutate active scene look (NO popups!)
     */
    triggerDropFlash() {
        this.flashIntensity = 0.85;

        // Button pulse feedback
        var btnMutate = document.getElementById("btn-mutate");
        if (btnMutate) {
            btnMutate.classList.add("pulse");
            setTimeout(() => btnMutate.classList.remove("pulse"), 250);
        }

        // Instantly mutate active scene look
        var current = this.scenes[this.activeSceneIdx];
        if (current) {
            if (this.activeSceneIdx === 1 || this.activeSceneIdx === 3) {
                this.cycleTerrain();
            } else {
                if (current.randomizeGeometry) current.randomizeGeometry();
                if (current.switchTerrain)     current.switchTerrain();
                if (current.agitateCluster)    current.agitateCluster();
                if (current.mutate)            current.mutate();
            }
        }
        this.updateHUD();
    }

    toggleBlackout() { this.blackout = !this.blackout; this.updateHUD(); }

    toggleMirrorDisplay(forceState) {
        this.isMirrored = (forceState !== undefined) ? !!forceState : !this.isMirrored;
        var stage = document.getElementById("stage-container");
        if (stage) {
            stage.classList.toggle("mirrored", this.isMirrored);
        }
        var btn = document.getElementById("btn-mirror-display");
        if (btn) {
            btn.innerHTML = this.isMirrored ? "🪞 Mirror: ON" : "🪞 Mirror: OFF";
            btn.classList.toggle("active", this.isMirrored);
        }
        this.showToast(this.isMirrored ? "🪞 Rear Projection: Mirrored (Flipped)" : "🪞 Rear Projection: Standard");
        this.broadcastRemoteState();
    }

    showToast(msg) {
        var toast = document.getElementById("vj-toast");
        if (!toast) return;
        toast.textContent = msg;
        toast.classList.add("toast-visible");
        if (this._toastTimer) clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
            toast.classList.remove("toast-visible");
        }, 2200);
    }

    toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(err => console.warn("Fullscreen:", err));
            this.hideHUD();
        } else {
            document.exitFullscreen();
            this.showHUD();
        }
    }

    showHUD() { var h=document.getElementById("vj-hud"); if(h)h.classList.remove("hud-hidden"); this.hudVisible=true; this.resetHUDTimer(); }
    hideHUD() { var h=document.getElementById("vj-hud"); if(h)h.classList.add("hud-hidden"); this.hudVisible=false; }
    toggleHUD() { this.hudVisible ? this.hideHUD() : this.showHUD(); }

    resetHUDTimer() {
        if (this.hudTimeout) clearTimeout(this.hudTimeout);
        this.hudTimeout = setTimeout(() => { if (this.hudVisible) this.hideHUD(); }, 4500);
    }

    updateHUD() {
        document.querySelectorAll(".scene-btn").forEach((btn, idx) => {
            btn.classList.toggle("active", idx === this.activeSceneIdx);
        });
        var nameEl = document.getElementById("current-scene-name");
        if (nameEl) nameEl.textContent = this.scenes[this.activeSceneIdx].name;
        var blackBtn = document.getElementById("btn-blackout");
        if (blackBtn) blackBtn.classList.toggle("active", this.blackout);

        var btnTerrain = document.getElementById("btn-terrain");
        if (btnTerrain) {
            var activeScene = this.scenes[this.activeSceneIdx];
            if (this.activeSceneIdx === 4 && activeScene && activeScene.palettes) {
                var curPal = activeScene.palettes[activeScene.paletteIdx];
                btnTerrain.textContent = "Outfit: " + (curPal ? curPal.name : "Custom") + " (M)";
            } else {
                if (activeScene && activeScene.currentTerrainIdx !== undefined) {
                    this.terrainIdx = activeScene.currentTerrainIdx;
                }
                var cadStr = this.mountainBeatCadence > 0 ? (this.mountainBeatCadence + "B") : "Man";
                btnTerrain.textContent = "Terrain: " + this.terrainNames[this.terrainIdx] + " (" + cadStr + ")";
            }
        }

        this.broadcastRemoteState();
    }

    broadcastRemoteState() {}

    cycleTerrain() {
        this.terrainIdx = (this.terrainIdx + 1) % this.terrainNames.length;
        if (this.scenes[1] && this.scenes[1].setTerrainIndex) this.scenes[1].setTerrainIndex(this.terrainIdx);
        else if (this.scenes[1] && this.scenes[1].switchTerrain) this.scenes[1].switchTerrain();

        if (this.scenes[3] && this.scenes[3].setTerrainIndex) this.scenes[3].setTerrainIndex(this.terrainIdx);
        else if (this.scenes[3] && this.scenes[3].switchTerrain) this.scenes[3].switchTerrain();

        this.mountainBeatCounter = 0;
        this.timeInCurrentTerrain = 0;
        var btnTerrain = document.getElementById("btn-terrain");
        if (btnTerrain) {
            var cadStr = this.mountainBeatCadence > 0 ? (this.mountainBeatCadence + "B") : "Man";
            btnTerrain.textContent = "Terrain: " + this.terrainNames[this.terrainIdx] + " (" + cadStr + ")";
        }
        this.updateHUD();
        this.broadcastRemoteState();
    }

    cycleMountainCadence() {
        // Cadence sequence: 32 beats (doubled 4-phase cloud lifecycle) -> 16 beats -> 8 beats -> 4 beats -> Off (manual / 30s) -> 32 beats
        if (this.mountainBeatCadence === 32) this.mountainBeatCadence = 16;
        else if (this.mountainBeatCadence === 16) this.mountainBeatCadence = 8;
        else if (this.mountainBeatCadence === 8) this.mountainBeatCadence = 4;
        else if (this.mountainBeatCadence === 4) this.mountainBeatCadence = 0;
        else this.mountainBeatCadence = 32;
        this.mountainBeatCounter = 0;

        var btnTerrain = document.getElementById("btn-terrain");
        if (btnTerrain) {
            var cadStr = this.mountainBeatCadence > 0 ? (this.mountainBeatCadence + "B") : "Man";
            btnTerrain.textContent = "Terrain: " + this.terrainNames[this.terrainIdx] + " (" + cadStr + ")";
            btnTerrain.classList.add("pulse");
            setTimeout(() => btnTerrain.classList.remove("pulse"), 250);
        }
        this.updateHUD();
        this.broadcastRemoteState();
    }

    bindEvents() {
        // Scene buttons
        document.querySelectorAll(".scene-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                this.setScene(parseInt(e.currentTarget.getAttribute("data-scene")));
            });
        });

        // Mutate button
        var btnMutate = document.getElementById("btn-mutate");
        if (btnMutate) {
            btnMutate.addEventListener("click", (e) => {
                e.stopPropagation();
                this.triggerDropFlash();
            });
        }

        // Audio toggle
        var btnMic = document.getElementById("btn-audio-toggle");
        if (btnMic) {
            btnMic.addEventListener("click", async (e) => {
                e.stopPropagation();
                if (!window.audioEngine.isListening) {
                    var ok = await window.audioEngine.startAudioInput();
                    btnMic.textContent = ok ? "Live Audio: ON" : "Audio: Sim Beat";
                    btnMic.classList.toggle("active", ok);
                } else {
                    window.audioEngine.stopAudioInput();
                    window.audioEngine.useSimulation = true;
                    btnMic.textContent = "Audio: Sim Beat";
                    btnMic.classList.remove("active");
                }
            });
        }

        // Terrain / Outfit cycle button (click = next mountain or outfit, shift-click = cycle beat cadence)
        var btnTerrain = document.getElementById("btn-terrain");
        if (btnTerrain) {
            btnTerrain.addEventListener("click", (e) => {
                e.stopPropagation();
                if (this.activeSceneIdx === 4 && this.scenes[4] && this.scenes[4].cycleOutfit) {
                    this.scenes[4].cycleOutfit();
                } else {
                    if (e.shiftKey) {
                        this.cycleMountainCadence();
                    } else {
                        this.cycleTerrain();
                    }
                }
            });
        }

        // Ribbon thickness slider
        var sliderThick = document.getElementById("slider-line-thick");
        if (sliderThick) {
            sliderThick.addEventListener("input", (e) => {
                var val = parseFloat(e.target.value);
                document.getElementById("val-line-thick").textContent = val.toFixed(1) + "px";
                if (this.scenes[1] && this.scenes[1].setThickness) this.scenes[1].setThickness(val);
            });
        }

        // Sensitivity slider
        var sensSlider = document.getElementById("slider-sensitivity");
        if (sensSlider) {
            sensSlider.addEventListener("input", (e) => {
                window.audioEngine.sensitivity = parseFloat(e.target.value);
                document.getElementById("val-sensitivity").textContent = parseFloat(e.target.value).toFixed(1) + "x";
            });
        }

        // Tap tempo
        var btnTap = document.getElementById("btn-tap-tempo");
        if (btnTap) {
            btnTap.addEventListener("click", (e) => {
                e.stopPropagation();
                var bpm = window.audioEngine.recordTapTempo();
                document.getElementById("val-bpm").textContent = bpm + " BPM";
                btnTap.classList.add("pulse");
                setTimeout(() => btnTap.classList.remove("pulse"), 100);
            });
        }

        // Mirror Display (Rear Projection)
        var btnMirror = document.getElementById("btn-mirror-display");
        if (btnMirror) {
            btnMirror.addEventListener("click", (e) => {
                e.stopPropagation();
                this.toggleMirrorDisplay();
            });
        }

        // Fullscreen
        var btnFull = document.getElementById("btn-fullscreen");
        if (btnFull) btnFull.addEventListener("click", (e) => { e.stopPropagation(); this.toggleFullscreen(); });

        // Blackout
        var btnBlack = document.getElementById("btn-blackout");
        if (btnBlack) btnBlack.addEventListener("click", (e) => { e.stopPropagation(); this.toggleBlackout(); });

        // Scene hold / lock toggle
        var btnLock = document.getElementById("btn-scene-lock");
        if (btnLock) {
            btnLock.addEventListener("click", (e) => {
                e.stopPropagation();
                this.toggleSceneLock();
            });
        }

        // Mouse & Touchpad wakes HUD & stirs fluid in Scene 3
        var lastPointerX = null, lastPointerY = null;
        var onPointerMove = (x, y) => {
            if (lastPointerX !== null) {
                var vx = x - lastPointerX;
                var vy = y - lastPointerY;
                if (this.activeSceneIdx === 2 && this.scenes[2] && this.scenes[2].stir) {
                    this.scenes[2].stir(x, y, vx, vy);
                }
            }
            lastPointerX = x;
            lastPointerY = y;
        };

        var lastHudCheckTime = 0;
        var wakeHUDThrottled = () => {
            var now = performance.now();
            if (now - lastHudCheckTime > 150) {
                lastHudCheckTime = now;
                if (!this.hudVisible) this.showHUD();
                else this.resetHUDTimer();
            }
        };

        window.addEventListener("mousemove", (e) => {
            onPointerMove(e.clientX, e.clientY);
            wakeHUDThrottled();
        }, { passive: true });

        window.addEventListener("touchmove", (e) => {
            if (e.touches && e.touches.length > 0) {
                onPointerMove(e.touches[0].clientX, e.touches[0].clientY);
                wakeHUDThrottled();
            }
        }, { passive: true });

        window.addEventListener("touchstart", (e) => {
            if (e.touches && e.touches.length > 0) {
                lastPointerX = e.touches[0].clientX;
                lastPointerY = e.touches[0].clientY;
                wakeHUDThrottled();
            }
        }, { passive: true });

        this.resetHUDTimer();
    }

    bindHotkeys() {
        window.addEventListener("keydown", (e) => {
            if (e.code === "Space")  { e.preventDefault(); this.triggerDropFlash(); }
            else if (e.code === "KeyR") { e.preventDefault(); this.triggerDropFlash(); }
            else if (e.code === "KeyF" || e.code === "KeyH") { e.preventDefault(); this.toggleFullscreen(); }
            else if (e.code === "KeyB") { e.preventDefault(); this.toggleBlackout(); }
            else if (e.code === "Digit1") this.setScene(0);
            else if (e.code === "Digit2") this.setScene(1);
            else if (e.code === "Digit3") this.setScene(2);
            else if (e.code === "Digit4") this.setScene(3);
            else if (e.code === "Digit5") this.setScene(4);
            else if (e.code === "KeyL") { e.preventDefault(); this.toggleSceneLock(); }
            else if (e.code === "KeyX") { e.preventDefault(); this.toggleMirrorDisplay(); }
            else if (e.code === "KeyT") {
                var bpm = window.audioEngine.recordTapTempo();
                document.getElementById("val-bpm").textContent = bpm + " BPM";
            }
            else if (e.code === "KeyM") {
                e.preventDefault();
                if (this.activeSceneIdx === 4 && this.scenes[4] && this.scenes[4].cycleOutfit) {
                    this.scenes[4].cycleOutfit();
                } else {
                    this.cycleTerrain();
                }
            }
            else if (e.code === "KeyP") {
                e.preventDefault();
                this.toggleProportionsStudio();
            }
            else if (e.code === "KeyN") {
                e.preventDefault();
                this.cycleMountainCadence();
            }
            else if (e.code === "ArrowUp") {
                window.audioEngine.sensitivity = Math.min(3.0, window.audioEngine.sensitivity + 0.15);
                this.updateSensitivityUI();
            }
            else if (e.code === "ArrowDown") {
                window.audioEngine.sensitivity = Math.max(0.2, window.audioEngine.sensitivity - 0.15);
                this.updateSensitivityUI();
            }
        });
    }

    toggleProportionsStudio(forceState) {
        var drawer = document.getElementById("proportions-drawer");
        if (!drawer) return;
        var isClosed = drawer.classList.contains("closed");
        var willOpen = (forceState !== undefined) ? forceState : isClosed;

        if (willOpen) {
            drawer.classList.remove("closed");
            // If not currently in Scene 5 (Dancer), switch to Scene 5
            if (this.activeSceneIdx !== 4) {
                this.setScene(4);
            }
            this.toggleSceneLock(true); // Lock on dancer while tuning
            this.syncProportionsUI();
        } else {
            drawer.classList.add("closed");
        }
    }

    syncProportionsUI() {
        var dancerScene = this.scenes[4];
        if (!dancerScene) return;

        var targetDancer = (dancerScene.getActiveDancer) ? dancerScene.getActiveDancer() : dancerScene;
        var props = (targetDancer && targetDancer.proportions) || {};
        var colors = (targetDancer && targetDancer.customColors) || {};

        // Sync all proportional bone sliders & value readouts
        document.querySelectorAll(".prop-slider").forEach((slider) => {
            var propKey = slider.getAttribute("data-prop");
            if (propKey && props[propKey] !== undefined) {
                slider.value = props[propKey];
                var valEl = document.getElementById("val-prop-" + propKey);
                if (valEl) valEl.textContent = parseFloat(props[propKey]).toFixed(1);
            }
        });

        // Sync active outfit dropdown state
        if (targetDancer && targetDancer.paletteIdx !== undefined) {
            var outfitSelect = document.getElementById("outfit-select");
            if (outfitSelect) {
                outfitSelect.value = String(targetDancer.paletteIdx);
            }
        }

        // Sync interactive garment color pickers & hex badges
        if (colors) {
            for (var gKey in colors) {
                var hexVal = colors[gKey];
                var picker = document.querySelector('.garment-color-picker[data-garment="' + gKey + '"]');
                if (picker) picker.value = hexVal;
                var badge = document.getElementById("val-color-" + gKey);
                if (badge) badge.textContent = hexVal.toUpperCase();
            }
        }

        // Sync Troupe Formation buttons
        if (dancerScene.formation) {
            document.querySelectorAll("#troupe-formation-control .seg-btn").forEach((btn) => {
                if (btn.getAttribute("data-formation") === dancerScene.formation) {
                    btn.classList.add("active");
                } else {
                    btn.classList.remove("active");
                }
            });
            this.updateDancerTargetDropdown(dancerScene.formation);
        }

        // Sync Phase Offset slider
        if (dancerScene.phaseOffset !== undefined) {
            var phaseSlider = document.getElementById("troupe-phase-slider");
            var phaseVal = document.getElementById("val-troupe-phase");
            if (phaseSlider) phaseSlider.value = dancerScene.phaseOffset;
            if (phaseVal) phaseVal.textContent = Number(dancerScene.phaseOffset).toFixed(2) + "s";
        }

        // Sync Editing Dancer dropdown value
        var targetSelect = document.getElementById("dancer-target-select");
        if (targetSelect && dancerScene.activeDancerIdx !== undefined) {
            targetSelect.value = dancerScene.activeDancerIdx;
        }

        // Sync Dance Move Rotation checklist
        this.syncDanceChecklistUI();
    }

    updateDancerTargetDropdown(formation) {
        var targetSelect = document.getElementById("dancer-target-select");
        if (!targetSelect) return;

        var opt0 = targetSelect.querySelector('option[value="0"]');
        var opt1 = targetSelect.querySelector('option[value="1"]');
        var opt2 = targetSelect.querySelector('option[value="2"]');
        var optAll = targetSelect.querySelector('option[value="all"]');

        if (formation === "1") {
            if (opt0) { opt0.textContent = "Dancer 1 (Solo / Center)"; opt0.disabled = false; }
            if (opt1) { opt1.disabled = true; }
            if (opt2) { opt2.disabled = true; }
            if (optAll) { optAll.disabled = false; }
            if (targetSelect.value === "1" || targetSelect.value === "2") {
                targetSelect.value = "0";
                var dancer = this.scenes[4];
                if (dancer && dancer.setActiveDancer) dancer.setActiveDancer("0");
            }
        } else if (formation === "2_fwd" || formation === "2_face") {
            if (opt0) { opt0.textContent = "Dancer 1 (Left)"; opt0.disabled = false; }
            if (opt1) { opt1.textContent = "Dancer 2 (Right)"; opt1.disabled = false; }
            if (opt2) { opt2.disabled = true; }
            if (optAll) { optAll.disabled = false; }
            if (targetSelect.value === "2") {
                targetSelect.value = "0";
                var dancer = this.scenes[4];
                if (dancer && dancer.setActiveDancer) dancer.setActiveDancer("0");
            }
        } else if (formation === "3") {
            if (opt0) { opt0.textContent = "Dancer 1 (Lead / Center)"; opt0.disabled = false; }
            if (opt1) { opt1.textContent = "Dancer 2 (Left Wing)"; opt1.disabled = false; }
            if (opt2) { opt2.textContent = "Dancer 3 (Right Wing)"; opt2.disabled = false; }
            if (optAll) { optAll.disabled = false; }
        }
    }

    bindProportionsStudio() {
        var btnOpen = document.getElementById("btn-proportions");
        if (btnOpen) {
            btnOpen.addEventListener("click", (e) => {
                e.stopPropagation();
                this.toggleProportionsStudio();
            });
        }

        var btnClose = document.getElementById("btn-prop-close");
        if (btnClose) {
            btnClose.addEventListener("click", (e) => {
                e.stopPropagation();
                this.toggleProportionsStudio(false);
            });
        }

        // Troupe Formation segmented control
        document.querySelectorAll("#troupe-formation-control .seg-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                var form = e.currentTarget.getAttribute("data-formation");
                var dancer = this.scenes[4];
                if (dancer && dancer.setFormation) {
                    dancer.setFormation(form);
                }
                document.querySelectorAll("#troupe-formation-control .seg-btn").forEach((b) => b.classList.remove("active"));
                e.currentTarget.classList.add("active");
                this.updateDancerTargetDropdown(form);
                this.syncProportionsUI();
            });
        });

        // Troupe Phase Offset Slider
        var phaseSlider = document.getElementById("troupe-phase-slider");
        if (phaseSlider) {
            phaseSlider.addEventListener("input", (e) => {
                var val = parseFloat(e.target.value);
                var valEl = document.getElementById("val-troupe-phase");
                if (valEl) valEl.textContent = val.toFixed(2) + "s";
                var dancer = this.scenes[4];
                if (dancer && dancer.setPhaseOffset) {
                    dancer.setPhaseOffset(val);
                }
            });
        }

        // Editing Dancer Target Selector
        var targetSelect = document.getElementById("dancer-target-select");
        if (targetSelect) {
            targetSelect.addEventListener("change", (e) => {
                var targetIdx = e.target.value;
                var dancer = this.scenes[4];
                if (dancer && dancer.setActiveDancer) {
                    dancer.setActiveDancer(targetIdx);
                }
                this.syncProportionsUI();
            });
        }

        // Interactive Garment Color Pickers (Bilaterally symmetric)
        document.querySelectorAll(".garment-color-picker").forEach((picker) => {
            picker.addEventListener("input", (e) => {
                var gKey = e.target.getAttribute("data-garment");
                var hexVal = e.target.value;
                var badge = document.getElementById("val-color-" + gKey);
                if (badge) badge.textContent = hexVal.toUpperCase();

                var dancer = this.scenes[4];
                if (dancer && dancer.setCustomColor) {
                    dancer.setCustomColor(gKey, hexVal);
                }
            });
        });

        // Outfit Palette Dropdown
        var outfitSelect = document.getElementById("outfit-select");
        if (outfitSelect) {
            outfitSelect.addEventListener("change", (e) => {
                var outfitIdx = parseInt(e.target.value);
                var dancer = this.scenes[4];
                if (dancer && dancer.setOutfit) {
                    dancer.setOutfit(outfitIdx);
                }
            });
        }

        // Sliders live input
        document.querySelectorAll(".prop-slider").forEach((slider) => {
            slider.addEventListener("input", (e) => {
                var propKey = e.target.getAttribute("data-prop");
                if (!propKey) return;
                var val = parseFloat(e.target.value);
                var valEl = document.getElementById("val-prop-" + propKey);
                if (valEl) valEl.textContent = val.toFixed(1);

                var dancer = this.scenes[4];
                if (dancer && dancer.setProportion) {
                    dancer.setProportion(propKey, val);
                }
            });
        });

        // Presets configuration
        var presets = {
            female: {
                head: 12.0, neck: 5.3, chest: 14.0, bust: 8.6, bustFwd: 10.0, bustUp: -3.8, bustWidth: 6.4,
                spine: 10.8, pelvis: 7.6, glutes: 11.6, glutesRear: 3.5, glutesUp: -1.8, glutesWidth: 6.6,
                clavicle: 9.9, shoulder: 7.5, shoulderWidth: 19.5, upperArmMid: 5.9, upperArmEnd: 5.3, elbow: 5.1, forearm: 4.0, hand: 5.6,
                hip: 7.0, hipWidth: 11.0, thighTop: 8.6, thighBot: 6.8, knee: 6.0, calfTop: 6.0, calfBot: 4.8, ankle: 4.6,
                shoeLength: 14.0, shoeHeelR: 5.6, shoeToeR: 4.1,
                traps: 6.8, trapsUp: 1.0, trapsRear: 1.8
            },
            default: {
                head: 12.0, neck: 5.3, chest: 14.0, bust: 8.6, bustFwd: 10.0, bustUp: -3.8, bustWidth: 6.4,
                spine: 10.8, pelvis: 7.6, glutes: 11.6, glutesRear: 3.5, glutesUp: -1.8, glutesWidth: 6.6,
                clavicle: 9.9, shoulder: 7.5, shoulderWidth: 19.5, upperArmMid: 5.9, upperArmEnd: 5.3, elbow: 5.1, forearm: 4.0, hand: 5.6,
                hip: 7.0, hipWidth: 11.0, thighTop: 8.6, thighBot: 6.8, knee: 6.0, calfTop: 6.0, calfBot: 4.8, ankle: 4.6,
                shoeLength: 14.0, shoeHeelR: 5.6, shoeToeR: 4.1,
                traps: 6.8, trapsUp: 1.0, trapsRear: 1.8
            },
            athletic: {
                head: 12.0, neck: 6.8, chest: 21.0, bust: 6.0, bustFwd: 13.5, bustUp: -2.0, bustWidth: 8.5,
                spine: 11.5, pelvis: 11.0, glutes: 8.0, glutesRear: 9.0, glutesUp: -1.5, glutesWidth: 7.0,
                clavicle: 7.8, shoulder: 9.0, shoulderWidth: 26.0, upperArmMid: 7.2, upperArmEnd: 6.0, elbow: 6.2, forearm: 5.5, hand: 5.2,
                hip: 9.0, hipWidth: 17.5, thighTop: 9.5, thighBot: 7.0, knee: 6.5, calfTop: 6.8, calfBot: 5.2, ankle: 5.0,
                shoeLength: 11.0, shoeHeelR: 5.0, shoeToeR: 4.2,
                traps: 8.5, trapsUp: 1.8, trapsRear: 2.2
            },
            slender: {
                head: 10.6, neck: 4.9, chest: 12.0, bust: 6.8, bustFwd: 7.5, bustUp: -2.2, bustWidth: 5.2,
                spine: 7.8, pelvis: 7.8, glutes: 8.6, glutesRear: 2.0, glutesUp: 1.0, glutesWidth: 4.8,
                clavicle: 7.3, shoulder: 6.0, shoulderWidth: 17.0, upperArmMid: 4.8, upperArmEnd: 4.2, elbow: 4.8, forearm: 4.2, hand: 4.2,
                hip: 7.2, hipWidth: 9.0, thighTop: 6.5, thighBot: 5.0, knee: 4.8, calfTop: 4.8, calfBot: 4.0, ankle: 4.0,
                shoeLength: 15.0, shoeHeelR: 4.2, shoeToeR: 3.5,
                traps: 3.8, trapsUp: 0.8, trapsRear: 1.5
            },
            skinny_chic: {
                head: 10.6, neck: 4.9, chest: 12.0, bust: 6.8, bustFwd: 7.5, bustUp: -2.2, bustWidth: 5.2,
                spine: 7.8, pelvis: 7.8, glutes: 8.6, glutesRear: 2.0, glutesUp: 1.0, glutesWidth: 4.8,
                clavicle: 7.3, shoulder: 6.0, shoulderWidth: 17.0, upperArmMid: 4.8, upperArmEnd: 4.2, elbow: 4.8, forearm: 4.2, hand: 4.2,
                hip: 7.2, hipWidth: 9.0, thighTop: 6.5, thighBot: 5.0, knee: 4.8, calfTop: 4.8, calfBot: 4.0, ankle: 4.0,
                shoeLength: 15.0, shoeHeelR: 4.2, shoeToeR: 3.5,
                traps: 3.8, trapsUp: 0.8, trapsRear: 1.5
            },
            cyber_mech: {
                head: 14.5, neck: 7.5, chest: 24.0, bust: 8.5, bustFwd: 15.0, bustUp: -2.5, bustWidth: 9.5,
                spine: 14.0, pelvis: 14.0, glutes: 9.5, glutesRear: 11.0, glutesUp: -2.0, glutesWidth: 8.2,
                clavicle: 9.0, shoulder: 11.0, shoulderWidth: 30.0, upperArmMid: 9.0, upperArmEnd: 7.5, elbow: 7.5, forearm: 6.5, hand: 6.0,
                hip: 11.0, hipWidth: 20.0, thighTop: 11.0, thighBot: 8.5, knee: 7.5, calfTop: 7.5, calfBot: 6.0, ankle: 6.0,
                shoeLength: 13.0, shoeHeelR: 5.8, shoeToeR: 4.8,
                traps: 9.8, trapsUp: 2.2, trapsRear: 2.8
            }
        };

        // Body Shape Presets Dropdown
        var presetSelect = document.getElementById("preset-select");
        if (presetSelect) {
            presetSelect.addEventListener("change", (e) => {
                var presetKey = e.target.value;
                var config = presets[presetKey];
                if (config) {
                    var dancer = this.scenes[4];
                    if (dancer && dancer.applyProportions) {
                        dancer.applyProportions(config);
                    }
                    this.syncProportionsUI();
                }
            });
        }

        // Pose mode segmented control
        document.querySelectorAll("#pose-mode-control .seg-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                var pose = e.currentTarget.getAttribute("data-pose");
                var dancer = this.scenes[4];
                if (dancer && dancer.setPoseMode) {
                    dancer.setPoseMode(pose);
                }
                document.querySelectorAll("#pose-mode-control .seg-btn").forEach((b) => b.classList.remove("active"));
                e.currentTarget.classList.add("active");
            });
        });

        // Camera angle segmented control
        document.querySelectorAll("#camera-angle-control .seg-btn").forEach((btn) => {
            btn.addEventListener("click", (e) => {
                var cam = e.currentTarget.getAttribute("data-cam");
                var dancer = this.scenes[4];
                var mode = cam;
                if (dancer && dancer.setCameraAngle) {
                    mode = dancer.setCameraAngle(cam);
                }
                if (cam === "orbit") {
                    if (mode === "orbit_paused") {
                        e.currentTarget.textContent = "Orbit ⏸";
                    } else {
                        e.currentTarget.textContent = "Orbit 360°";
                    }
                    document.querySelectorAll("#camera-angle-control .seg-btn").forEach((b) => b.classList.remove("active"));
                    e.currentTarget.classList.add("active");
                } else {
                    var orbitBtn = document.querySelector('#camera-angle-control .seg-btn[data-cam="orbit"]');
                    if (orbitBtn) orbitBtn.textContent = "Orbit 360°";
                    document.querySelectorAll("#camera-angle-control .seg-btn").forEach((b) => b.classList.remove("active"));
                    e.currentTarget.classList.add("active");
                }
            });
        });

        // Copy code button
        var btnCopy = document.getElementById("btn-prop-copy");
        if (btnCopy) {
            btnCopy.addEventListener("click", () => {
                var dancerScene = this.scenes[4];
                if (!dancerScene) return;
                var targetDancer = dancerScene.getActiveDancer ? dancerScene.getActiveDancer() : dancerScene;
                if (!targetDancer || !targetDancer.proportions) return;
                var jsonStr = JSON.stringify(targetDancer.proportions, null, 4);
                var codeStr = "// Dancer Proportions Configuration:\nthis.proportions = " + jsonStr + ";";
                navigator.clipboard.writeText(codeStr).then(() => {
                    var toast = document.getElementById("prop-toast");
                    if (toast) {
                        toast.classList.remove("hidden");
                        setTimeout(() => toast.classList.add("hidden"), 2200);
                    }
                }).catch(() => {});
            });
        }

        // Reset button
        var btnReset = document.getElementById("btn-prop-reset");
        if (btnReset) {
            btnReset.addEventListener("click", () => {
                var config = presets["default"];
                var dancer = this.scenes[4];
                if (dancer && dancer.applyProportions) {
                    dancer.applyProportions(config);
                }
                if (presetSelect) presetSelect.value = "female";
                this.syncProportionsUI();
            });
        }

        // Dance Move Rotation Select All / None Buttons
        var btnSelectAllDances = document.getElementById("btn-select-all-dances");
        if (btnSelectAllDances) {
            btnSelectAllDances.addEventListener("click", () => {
                var dancer = this.scenes[4];
                if (dancer && dancer.selectAllDances) {
                    dancer.selectAllDances(true);
                }
            });
        }

        var btnClearAllDances = document.getElementById("btn-clear-all-dances");
        if (btnClearAllDances) {
            btnClearAllDances.addEventListener("click", () => {
                var dancer = this.scenes[4];
                if (dancer && dancer.selectAllDances) {
                    dancer.selectAllDances(false);
                }
            });
        }

        // Toggle Dance Lock / Hold Button (teach mode)
        var btnToggleDanceLock = document.getElementById("btn-toggle-dance-lock");
        if (btnToggleDanceLock) {
            btnToggleDanceLock.addEventListener("click", () => {
                var dancer = this.scenes[4];
                if (dancer && dancer.toggleDanceLock) {
                    dancer.toggleDanceLock();
                }
            });
        }

        // Dance Title Overlay Controls
        var cbDanceTitle = document.getElementById("cb-dance-title-enable");
        if (cbDanceTitle) {
            cbDanceTitle.checked = this.danceTitleEnabled;
            cbDanceTitle.addEventListener("change", (e) => {
                this.danceTitleEnabled = e.target.checked;
                if (!this.danceTitleEnabled) {
                    var el = document.getElementById("dance-title-overlay");
                    if (el) el.classList.add("hidden");
                } else if (this.activeSceneIdx === 4 && this.scenes[4]) {
                    var clip = this.scenes[4].allClips ? this.scenes[4].allClips[this.scenes[4].currentClipName] : null;
                    this.showDanceTitle(clip ? clip.name : "Dance");
                }
            });
        }

        var selDanceTitleStyle = document.getElementById("sel-dance-title-style");
        if (selDanceTitleStyle) {
            selDanceTitleStyle.value = this.danceTitleStyle;
            selDanceTitleStyle.addEventListener("change", (e) => {
                this.danceTitleStyle = e.target.value;
                if (this.activeSceneIdx === 4 && this.scenes[4]) {
                    var clip = this.scenes[4].allClips ? this.scenes[4].allClips[this.scenes[4].currentClipName] : null;
                    this.showDanceTitle(clip ? clip.name : "Dance", true);
                }
            });
        }

        var btnPreviewDanceTitle = document.getElementById("btn-preview-dance-title");
        if (btnPreviewDanceTitle) {
            btnPreviewDanceTitle.addEventListener("click", () => {
                var clip = (this.scenes[4] && this.scenes[4].allClips) ? this.scenes[4].allClips[this.scenes[4].currentClipName] : null;
                var name = clip ? clip.name : "House Basic Bounce";
                this.showDanceTitle(name, true);
            });
        }

        // Initialize dance checklist items
        this.populateDanceChecklist();
    }

    showDanceTitle(danceName, isPreview) {
        if (!this.danceTitleEnabled && !isPreview) return;
        var container = document.getElementById("dance-title-overlay");
        var titleEl = document.getElementById("dance-title-text");
        var subEl = document.getElementById("dance-title-sub");
        if (!container || !titleEl) return;

        titleEl.textContent = danceName;

        var dancer = this.scenes[4];
        var formLabel = dancer ? (dancer.formation === "3" ? "TRIO" : (dancer.formation === "2_face" ? "DUO FACING" : (dancer.formation === "2_fwd" ? "DUO" : "SOLO"))) : "SOLO";
        var bpm = window.audioEngine ? Math.round(window.audioEngine.bpm) : 126;
        if (subEl) {
            subEl.textContent = formLabel + " FORMATION • " + bpm + " BPM";
        }

        // Apply visual style
        var styles = ["minimal", "lower_third", "center_pop", "neon_glow", "marquee"];
        styles.forEach((s) => container.classList.remove(s));
        container.classList.add(this.danceTitleStyle || "lower_third");

        // Reveal
        container.classList.remove("hidden");

        if (this.danceTitleTimeout) clearTimeout(this.danceTitleTimeout);
        var holdDuration = this.danceTitleStyle === "center_pop" ? 2800 : (this.danceTitleStyle === "minimal" ? 3800 : 5000);
        this.danceTitleTimeout = setTimeout(() => {
            container.classList.add("hidden");
        }, holdDuration);
    }

    populateDanceChecklist() {
        var container = document.getElementById("dance-checklist-container");
        if (!container) return;
        var dancerScene = this.scenes[4];
        if (!dancerScene || !dancerScene.allClips) return;

        container.innerHTML = "";

        dancerScene.allClipKeys.forEach((clipKey) => {
            var clip = dancerScene.allClips[clipKey];
            var item = document.createElement("div");
            item.className = "dance-item";
            item.setAttribute("data-clip", clipKey);

            var leftDiv = document.createElement("div");
            leftDiv.className = "dance-item-left";

            var cb = document.createElement("input");
            cb.type = "checkbox";
            cb.className = "dance-checkbox";
            cb.setAttribute("data-clip", clipKey);
            cb.checked = dancerScene.enabledDances ? dancerScene.enabledDances.has(clipKey) : true;
            cb.addEventListener("change", (e) => {
                dancerScene.toggleDance(clipKey, e.target.checked);
            });

            var label = document.createElement("span");
            label.className = "dance-label";
            label.textContent = (clip && clip.title) ? clip.title : clipKey;

            leftDiv.appendChild(cb);
            leftDiv.appendChild(label);

            var rightDiv = document.createElement("div");
            rightDiv.className = "dance-item-right";

            var badge = document.createElement("span");
            badge.className = "dance-now-badge";
            badge.id = "badge-dance-" + clipKey;
            badge.textContent = "NOW";
            badge.style.display = (dancerScene.currentClipName === clipKey) ? "inline-block" : "none";

            var playBtn = document.createElement("button");
            playBtn.className = "dance-play-btn";
            playBtn.setAttribute("data-clip", clipKey);
            playBtn.title = "Play '" + ((clip && clip.title) || clipKey) + "' now";
            playBtn.textContent = "▶";
            playBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                dancerScene.playDanceNow(clipKey);
            });

            rightDiv.appendChild(badge);
            rightDiv.appendChild(playBtn);

            item.appendChild(leftDiv);
            item.appendChild(rightDiv);

            // Clicking on row plays dance
            item.addEventListener("click", (e) => {
                if (e.target === cb || e.target === playBtn) return;
                dancerScene.playDanceNow(clipKey);
            });

            container.appendChild(item);
        });

        this.syncDanceChecklistUI();
    }

    syncDanceChecklistUI() {
        var container = document.getElementById("dance-checklist-container");
        if (!container) return;
        var dancerScene = this.scenes[4];
        if (!dancerScene) return;

        var currentClip = dancerScene.currentClipName;

        // If list is empty (e.g. was opened before clips loaded), populate it
        if (container.children.length === 0 && dancerScene.allClipKeys && dancerScene.allClipKeys.length > 0) {
            this.populateDanceChecklist();
            return;
        }

        document.querySelectorAll(".dance-checkbox").forEach((cb) => {
            var clip = cb.getAttribute("data-clip");
            if (clip && dancerScene.enabledDances) {
                cb.checked = dancerScene.enabledDances.has(clip);
            }
        });

        document.querySelectorAll(".dance-item").forEach((item) => {
            var clip = item.getAttribute("data-clip");
            var isCurrent = (clip === currentClip);
            item.classList.toggle("active-now", isCurrent);
            var badge = item.querySelector(".dance-now-badge");
            if (badge) {
                badge.style.display = isCurrent ? "inline-block" : "none";
            }
        });

        var btnToggleDanceLock = document.getElementById("btn-toggle-dance-lock");
        if (btnToggleDanceLock) {
            var isLocked = dancerScene.danceLocked ? true : false;
            btnToggleDanceLock.textContent = isLocked ? "🔒 Holding" : "Hold Move";
            btnToggleDanceLock.style.background = isLocked ? "#b91c1c" : "";
            btnToggleDanceLock.style.color = isLocked ? "#ffffff" : "";
        }
    }

    toggleSceneLock(forceState) {
        if (forceState !== undefined) {
            this.autoCycleEnabled = !forceState;
        } else {
            this.autoCycleEnabled = !this.autoCycleEnabled;
        }
        var isLocked = !this.autoCycleEnabled;
        var btn = document.getElementById("btn-scene-lock");
        var icon = document.getElementById("lock-icon");
        var label = document.getElementById("lock-label");
        if (btn) {
            if (isLocked) {
                btn.classList.add("locked");
                if (icon) icon.textContent = "🔒";
                if (label) label.textContent = "Hold";
                btn.title = "Scene is LOCKED (staying on this scene). Press L to auto-cycle";
            } else {
                btn.classList.remove("locked");
                if (icon) icon.textContent = "🔄";
                if (label) label.textContent = "Auto";
                btn.title = "Auto-Cycle is ON (switches every 60s or on drops). Press L to hold";
            }
        }
    }

    updateSensitivityUI() {
        var slider = document.getElementById("slider-sensitivity");
        if (slider) slider.value = window.audioEngine.sensitivity;
        var val = document.getElementById("val-sensitivity");
        if (val) val.textContent = window.audioEngine.sensitivity.toFixed(1) + "x";
    }

    renderLoop(now) {
        try {
            var dt = Math.min((now - this.lastTime) / 1000, 0.1);
            this.lastTime = now;

            // 1. Update audio
            window.audioEngine.update(dt);
            var audio = window.audioEngine;

            // Dynamic BPM display update in HUD (throttled to ~5 Hz to keep DOM smooth)
            if (!this.lastBpmUiUpdate || now - this.lastBpmUiUpdate > 200) {
                this.lastBpmUiUpdate = now;
                var bpmElem = document.getElementById("val-bpm");
                if (bpmElem) {
                    var displayBpm = Math.round(audio.bpm);
                    var text = displayBpm + " BPM";
                    if (bpmElem.textContent !== text) {
                        bpmElem.textContent = text;
                    }
                }
            }

            // 2. Autonomous director
            if (this.autoCycleEnabled && !this.isCrossfading) {
                this.timeInCurrentScene += dt;
                if (this.timeInCurrentScene >= this.sceneDuration) this.nextScene();
            }

            // Autonomous mountain cycling:
            // Scene 2 (Ridgelines) cycles by beat cadence / timer.
            // Scene 4 (Mountain) cycles exclusively upon full cloud cycle completion synchronized with BPM.
            if (this.activeSceneIdx === 1 && !this.isCrossfading) {
                this.timeInCurrentTerrain += dt;
                var shouldCycle = false;

                if (this.mountainBeatCadence > 0) {
                    if (audio && audio.isBeat) {
                        this.mountainBeatCounter++;
                        if (this.mountainBeatCounter >= this.mountainBeatCadence) {
                            shouldCycle = true;
                        }
                    }
                    // Watchdog: If music has quiet lull or no beats detected, force cycle after 22s max
                    if (this.timeInCurrentTerrain >= 22.0) {
                        shouldCycle = true;
                    }
                } else if (this.timeInCurrentTerrain >= 30.0) {
                    shouldCycle = true;
                }

                if (shouldCycle) {
                    this.mountainBeatCounter = 0;
                    this.cycleTerrain();
                }
            }

            // 3. Crossfade progress
            if (this.isCrossfading) {
                this.crossfadeAlpha += dt / this.crossfadeDuration;
                if (this.crossfadeAlpha >= 1.0) {
                    this.crossfadeAlpha = 1.0;
                    this.isCrossfading  = false;
                    this.previousSceneIdx = -1;
                }
            }

            // 4. Update all scenes with visibility flag
            this.scenes.forEach((scene, idx) => {
                var isVis = !this.blackout && (
                    (idx === this.activeSceneIdx) ||
                    (this.isCrossfading && idx === this.previousSceneIdx)
                );
                if (scene.update) scene.update(dt, audio, isVis);
            });

            // 5. Render
            var w = this.canvas2D.width, h = this.canvas2D.height;
            this.ctx2D.clearRect(0, 0, w, h);

            if (!this.blackout) {
                var active = this.activeSceneIdx;
                var prev   = this.previousSceneIdx;
                var curAlpha = this.isCrossfading ? this.crossfadeAlpha : 1.0;
                var prevAlpha = (this.isCrossfading && prev >= 0) ? (1.0 - this.crossfadeAlpha) : 0.0;

                // Render WebGL scenes: only active and crossfading previous; hide others without reflow thrashing
                [1, 3, 4].forEach((idx) => {
                    var s = this.scenes[idx];
                    if (!s || !s.render) return;
                    if (idx === active) {
                        s.render(curAlpha);
                    } else if (this.isCrossfading && idx === prev) {
                        s.render(prevAlpha);
                    } else {
                        s.render(0.0);
                    }
                });

                // Draw 2D Canvas scenes (scenes 0 and 2)
                if (this.isCrossfading && prev >= 0 && !this._isWebGL(prev)) {
                    this.scenes[prev].draw(this.ctx2D, w, h, prevAlpha, audio);
                }
                if (!this._isWebGL(active)) {
                    this.scenes[active].draw(this.ctx2D, w, h, curAlpha, audio);
                }
            } else {
                // Blackout: clear 2D, hide all WebGL
                this.ctx2D.fillStyle = "#000000";
                this.ctx2D.fillRect(0, 0, w, h);
                [1, 3, 4].forEach((idx) => {
                    var s = this.scenes[idx];
                    if (s && s.render) s.render(0.0);
                });
            }

            // 6. Drop Flash overlay
            if (this.flashIntensity > 0.01) {
                this.ctx2D.save();
                this.ctx2D.fillStyle = "rgba(255,255,255," + this.flashIntensity + ")";
                this.ctx2D.fillRect(0, 0, w, h);
                this.ctx2D.restore();
                this.flashIntensity = Math.max(0, this.flashIntensity - dt * 2.8);
            }

            // 7. HUD meters
            this.renderHUDMeters(audio);
        } catch (err) {
            console.error("renderLoop error:", err);
        } finally {
            requestAnimationFrame((t) => this.renderLoop(t));
        }
    }

    renderHUDMeters(audio) {
        if (!this._meterCache) {
            this._meterCache = {
                sub: document.getElementById("meter-sub"),
                bass: document.getElementById("meter-bass"),
                mids: document.getElementById("meter-mids"),
                highs: document.getElementById("meter-highs"),
                beatDot: document.getElementById("beat-indicator"),
                sceneName: document.getElementById("current-scene-name")
            };
        }
        var mc = this._meterCache;
        if (mc.sub) mc.sub.style.height = Math.min(100, Math.round(audio.sub * 100)) + "%";
        if (mc.bass) mc.bass.style.height = Math.min(100, Math.round(audio.bass * 100)) + "%";
        if (mc.mids) mc.mids.style.height = Math.min(100, Math.round(audio.mids * 100)) + "%";
        if (mc.highs) mc.highs.style.height = Math.min(100, Math.round(audio.highs * 100)) + "%";

        if (mc.beatDot) mc.beatDot.classList.toggle("active", audio.isBeat);

        if (this.activeSceneIdx === 4 && this.scenes && this.scenes[4] && mc.sceneName) {
            var curName = this.scenes[4].name;
            if (mc.sceneName.textContent !== curName) {
                mc.sceneName.textContent = curName;
            }
        }
    }
}

window.vjController = new VJController();
window.addEventListener("DOMContentLoaded", () => { window.vjController.init(); });
