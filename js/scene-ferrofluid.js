/**
 * VJ Visualizer - Scene 6: Ferrofluid & Inks
 *
 * Physically grounded real-time ferrofluid simulation (all GPGPU, WebGL):
 *
 * 1. PHASE FIELD (384²) — conserved Allen-Cahn with long-range dipolar repulsion
 *      dφ/dt = ε²∇²φ + φ − φ³ + g(φ)·[ −B·H(x)²·(K∗ρ) + λ + A·H(x)² ]
 *    φ = +1 ferrofluid, −1 ink. ρ = (φ+1)/2 is the magnetized density.
 *    K∗ρ is a Gaussian-kernel convolution (range ~ film thickness) evaluated on a
 *    1/3-res grid: magnetized regions repel each other over long distances, which
 *    competes with surface tension (ε²∇²φ) and produces labyrinths, fingering and
 *    droplet lattices. λ is a GPU PI-controller (Lagrange multiplier) that conserves
 *    ferrofluid volume. A·H² is the Kelvin force pulling fluid toward the magnet.
 *    g(φ) = 1−φ² localizes the driving to interfaces (no spontaneous nucleation).
 *
 * 2. ROSENSWEIG SPIKES (128²) — Swift-Hohenberg amplitude equation
 *      dw/dt = r·w − (k0² + ∇²)²w + g·w² − w³
 *    r grows with (H − Hc): above the critical field a hexagonal spike lattice
 *    erupts on the ferrofluid, and relaxes when the field drops below Hc.
 *
 * 3. MAGNET — a virtual magnet under the dish (fixed, orbiting, or ⌘-drag).
 *
 * 4. INK FLOW (128²) — interface motion drives a velocity field which is projected
 *    to be incompressible (Jacobi pressure solve). Up to 3 dyes (256²) are advected
 *    semi-Lagrangian and mixed subtractively (Beer-Lambert absorption).
 *
 * 5. RENDERING — ray-marched height field. Ferrofluid is shaded as a black dielectric
 *    mirror reflecting a procedural macro studio (softboxes, lens ring-light, ink
 *    horizon). Ink is translucent with refraction, depth-dependent absorption and a
 *    meniscus. Post pass: autofocus depth of field, chromatic aberration, ACES.
 *
 * 6. AUDIO — musical state drives the physical field: buildup ramps H, pre-drop cuts
 *    it, drop slams it past Hc so spikes erupt; kicks pulse the field.
 */

class FerrofluidScene {
    constructor() {
        this.name = "Ferrofluid";
        this.container = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        // Camera: overhead tabletop macro view (~76 deg pitch)
        this.pitch = 1.33;
        this.yaw = 0.0;
        this.targetPitch = 1.33;
        this.targetYaw = 0.0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        this.panX = 0.0;
        this.panZ = 0.0;
        this.targetPanX = 0.0;
        this.targetPanZ = 0.0;
        this.isPanning = false;

        this.zoom = 3.8;
        this.targetZoom = 3.8;

        this._lastTapTime = 0;
        this._lastTapX = 0;
        this._lastTapY = 0;
        this._lastTouchTapTime = 0;

        this.mouseUV = new THREE.Vector2(-1.0, -1.0);
        this.mouseAction = 0;

        // Physical parameters (P-menu Physics Lab)
        this.params = {
            preset: "labyrinth",
            field: 1.00,          // Applied magnetic field H (normalized)
            tension: 1.20,        // Surface tension ε² (interface stiffness)
            thickness: 3.0,       // Film thickness → dipolar interaction range (low-res texels)
            volume: 0.25,         // Ferrofluid volume fraction of the dish
            spikeThreshold: 1.60, // Rosensweig critical field Hc
            magnetPull: 0.25,     // Kelvin force toward the magnet
            focus: 0.55,          // How localized the magnet's field is (0 = uniform)
            magnetMode: "orbit",  // "center" | "orbit" | "manual"
            flow: 1.0,            // Ink flow coupling
            density: 1.2,         // Ink dye absorption density
            fluidHeight: 0.075,   // Relief height (world units)
            gloss: 1.0,           // Studio light intensity
            dof: 0.6,             // Depth of field strength
            simSpeed: 6,          // Phase-field substeps per frame
            audioReact: 1.0,      // Audio → field coupling
            paletteIdx: 0
        };

        this.presets = {
            labyrinth: {
                name: "Labyrinth (Hele-Shaw)", seed: "blob",
                field: 1.00, tension: 1.20, thickness: 3.0, volume: 0.25,
                spikeThreshold: 1.60, magnetPull: 0.25, fluidHeight: 0.075, ramp: 3.0
            },
            millefiori: {
                name: "Millefiori Network", seed: "mille",
                field: 1.00, tension: 1.20, thickness: 2.0, volume: 0.30,
                spikeThreshold: 1.60, magnetPull: 0.20, fluidHeight: 0.070, ramp: 2.0
            },
            spikes: {
                name: "Rosensweig Spikes", seed: "blob",
                field: 1.00, tension: 1.40, thickness: 3.4, volume: 0.36,
                spikeThreshold: 0.85, magnetPull: 0.45, fluidHeight: 0.085, ramp: 2.5
            },
            fingers: {
                name: "Drop & Bloom (Fingering)", seed: "drop",
                field: 0.90, tension: 1.00, thickness: 3.6, volume: 0.18,
                spikeThreshold: 1.70, magnetPull: 0.20, fluidHeight: 0.075, ramp: 7.0
            },
            solitons: {
                name: "Droplet Lattice", seed: "blob",
                field: 1.25, tension: 1.20, thickness: 2.0, volume: 0.22,
                spikeThreshold: 1.80, magnetPull: 0.25, fluidHeight: 0.080, ramp: 3.0
            }
        };

        this.palettes = [
            { name: "Vermillion Orange", color: [1.00, 0.32, 0.02] },
            { name: "Golden Amber",      color: [1.00, 0.72, 0.06] },
            { name: "Neon Acid Lime",    color: [0.72, 1.00, 0.05] },
            { name: "Electric Cyan",     color: [0.00, 0.88, 1.00] },
            { name: "Laser Magenta",     color: [1.00, 0.12, 0.52] },
            { name: "Deep Ultraviolet",  color: [0.65, 0.20, 1.00] },
            { name: "Prismatic Opal",    color: [0.88, 0.95, 0.92] }
        ];

        this.numInks = 1;
        this.inkSlots = [0, 3, 4];
        this.customInkColors = [null, null, null];

        // Grid sizes
        this.N = 384;      // phase field
        this.NL = 128;     // low-res (dipolar kernel, spikes, flow)
        this.ND = 256;     // dye

        this.rt = {};
        this.mat = {};

        // Dynamic physical drivers
        this.time = 0;
        this.isInitialized = false;
        this.volumeTarget = this.params.volume;
        this.fieldSmooth = 1.0;
        this.fieldEff = 1.0;
        this.ramp = 1.0;
        this.rampDuration = 3.0;
        this.agitation = 0.0;
        this.dropBurst = 0.0;
        this.kickPulse = 0.0;
        this.magnetPos = new THREE.Vector2(0.5, 0.5);
        this.magnetTarget = new THREE.Vector2(0.5, 0.5);
        this.magnetVel = new THREE.Vector2(0, 0);
        this.magnetJitter = new THREE.Vector2(0, 0);
        this.isMagnetDrag = false;
        this.spikeSeed = 0;
        this._ctrlReset = true;
    }

    // ------------------------------------------------------------------
    // Ink colors
    // ------------------------------------------------------------------
    getInkData(slotIdx) {
        slotIdx = Math.max(0, Math.min(2, slotIdx));
        var color;
        if (this.customInkColors[slotIdx]) {
            var hex = this.customInkColors[slotIdx].replace("#", "");
            color = [
                parseInt(hex.substring(0, 2), 16) / 255.0,
                parseInt(hex.substring(2, 4), 16) / 255.0,
                parseInt(hex.substring(4, 6), 16) / 255.0
            ];
        } else {
            var palIdx = this.inkSlots[slotIdx] !== undefined ? this.inkSlots[slotIdx] : 0;
            color = (this.palettes[palIdx] || this.palettes[0]).color;
        }
        var toHex = function (v) { var s = Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16); return s.length < 2 ? "0" + s : s; };
        return {
            color: color,
            glow: [color[0] * 0.7, color[1] * 0.7, color[2] * 0.7],
            hex: "#" + toHex(color[0]) + toHex(color[1]) + toHex(color[2])
        };
    }

    setNumInks(count) {
        this.numInks = Math.max(1, Math.min(3, parseInt(count) || 1));
        this._seedDye();
        this.syncInkUniforms();
    }

    setCustomInkColor(slotIdx, hex) {
        this.customInkColors[slotIdx] = hex;
        this.syncInkUniforms();
    }

    setInkSlot(slotIdx, palIdx) {
        this.inkSlots[slotIdx] = palIdx;
        this.customInkColors[slotIdx] = null;
        this.syncInkUniforms();
    }

    syncInkUniforms() {
        if (!this.mat.display) return;
        var u = this.mat.display.uniforms;
        var lin = function (c) { return [Math.pow(c[0], 2.2), Math.pow(c[1], 2.2), Math.pow(c[2], 2.2)]; };
        var c1 = lin(this.getInkData(0).color);
        var c2 = lin(this.getInkData(1).color);
        var c3 = lin(this.getInkData(2).color);
        u.u_ink1.value.set(c1[0], c1[1], c1[2]);
        u.u_ink2.value.set(c2[0], c2[1], c2[2]);
        u.u_ink3.value.set(c3[0], c3[1], c3[2]);
        var n = this.numInks;
        var avg = [0, 0, 0];
        var all = [c1, c2, c3];
        for (var i = 0; i < n; i++) { avg[0] += all[i][0] / n; avg[1] += all[i][1] / n; avg[2] += all[i][2] / n; }
        u.u_ink_avg.value.set(avg[0] * 0.6, avg[1] * 0.6, avg[2] * 0.6);
    }

    // ------------------------------------------------------------------
    // Init
    // ------------------------------------------------------------------
    init(container) {
        this.container = container;
        var width = window.innerWidth;
        var height = window.innerHeight;

        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this.passScene = new THREE.Scene();
        this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null);
        this.quad.frustumCulled = false;
        this.passScene.add(this.quad);

        this.renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: "high-performance" });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        this.renderer.setSize(width, height);
        this.renderer.autoClear = true;

        var el = this.renderer.domElement;
        el.style.position = "absolute";
        el.style.top = "0";
        el.style.left = "0";
        el.style.width = "100%";
        el.style.height = "100%";
        el.style.pointerEvents = "none";
        el.style.display = "none";
        el.style.opacity = "0";
        this.container.appendChild(el);

        this._initTargets();
        this._initMaterials();
        this._resizeColorTarget();

        this.reseed(this.params.preset, true);
        this._bindMouseEvents();

        this.isInitialized = true;
    }

    _makeRT(w, h, type, filter) {
        return new THREE.WebGLRenderTarget(w, h, {
            minFilter: filter || THREE.LinearFilter,
            magFilter: filter || THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: type,
            depthBuffer: false,
            stencilBuffer: false,
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping
        });
    }

    _initTargets() {
        var isWebGL2 = this.renderer.capabilities && this.renderer.capabilities.isWebGL2;
        this.floatType = isWebGL2 ? THREE.FloatType : THREE.HalfFloatType;
        var F = this.floatType, N = this.N, NL = this.NL, ND = this.ND;

        this.rt.phaseA = this._makeRT(N, N, F);
        this.rt.phaseB = this._makeRT(N, N, F);
        this.rt.low = this._makeRT(NL, NL, F);
        this.rt.blurTmp = this._makeRT(NL, NL, F);
        this.rt.K = this._makeRT(NL, NL, F);
        this.rt.red16 = this._makeRT(16, 16, F);
        this.rt.red1 = this._makeRT(1, 1, F, THREE.NearestFilter);
        this.rt.ctrlA = this._makeRT(1, 1, F, THREE.NearestFilter);
        this.rt.ctrlB = this._makeRT(1, 1, F, THREE.NearestFilter);
        this.rt.spikeA = this._makeRT(NL, NL, F);
        this.rt.spikeB = this._makeRT(NL, NL, F);
        this.rt.vel = this._makeRT(NL, NL, F);
        this.rt.velP = this._makeRT(NL, NL, F);
        this.rt.div = this._makeRT(NL, NL, F);
        this.rt.pA = this._makeRT(NL, NL, F);
        this.rt.pB = this._makeRT(NL, NL, F);
        this.rt.dyeA = this._makeRT(ND, ND, F);
        this.rt.dyeB = this._makeRT(ND, ND, F);
        this.rt.hblur = this._makeRT(N, N, F);
        this.rt.height = this._makeRT(N, N, F);
        this.rt.color = null; // created in _resizeColorTarget
    }

    _resizeColorTarget() {
        var size = new THREE.Vector2();
        this.renderer.getDrawingBufferSize(size);
        if (this.rt.color) this.rt.color.dispose();
        this.rt.color = this._makeRT(Math.max(1, size.x), Math.max(1, size.y), THREE.HalfFloatType);
        if (this.mat.display) this.mat.display.uniforms.u_resolution.value.set(size.x, size.y);
        if (this.mat.post) this.mat.post.uniforms.u_res.value.set(size.x, size.y);
    }

    _shader(fs, uniforms) {
        return new THREE.ShaderMaterial({
            vertexShader: FerrofluidScene.VS,
            fragmentShader: fs,
            uniforms: uniforms,
            depthWrite: false,
            depthTest: false
        });
    }

    _initMaterials() {
        var N = this.N, NL = this.NL;
        var V2 = function (x, y) { return new THREE.Vector2(x, y); };
        var V3 = function (x, y, z) { return new THREE.Vector3(x, y, z); };

        this.mat.blit = this._shader(FerrofluidScene.FS_BLIT, { u_tex: { value: null } });

        this.mat.phase = this._shader(FerrofluidScene.FS_PHASE, {
            u_state: { value: null }, u_K: { value: null }, u_ctrl: { value: null },
            u_px: { value: V2(1 / N, 1 / N) },
            u_eps2: { value: 1.2 }, u_brep: { value: 2.0 }, u_pull: { value: 0.25 },
            u_local: { value: 0.55 }, u_magR: { value: 0.30 }, u_magpos: { value: V2(0.5, 0.5) },
            u_dt: { value: 0.2 }, u_agitate: { value: 0 }, u_time: { value: 0 },
            u_mouse_pos: { value: V2(-1, -1) }, u_mouse_action: { value: 0 }
        });

        this.mat.down = this._shader(FerrofluidScene.FS_DOWN, {
            u_state: { value: null }, u_srcPx: { value: V2(1 / N, 1 / N) }
        });

        this.mat.blur = this._shader(FerrofluidScene.FS_BLUR, {
            u_src: { value: null }, u_dir: { value: V2(1 / NL, 0) }, u_sigma: { value: 3.0 }
        });

        this.mat.reduce = this._shader(FerrofluidScene.FS_REDUCE, {
            u_src: { value: null }, u_srcSize: { value: NL }, u_block: { value: 8 }
        });

        this.mat.ctrl = this._shader(FerrofluidScene.FS_CTRL, {
            u_prev: { value: null }, u_mean: { value: null }, u_V0: { value: 0.25 },
            u_kp: { value: 4.0 }, u_ki: { value: 0.02 }, u_reset: { value: 1.0 }, u_init: { value: 0.5 }
        });

        this.mat.spike = this._shader(FerrofluidScene.FS_SPIKE, {
            u_spike: { value: null }, u_rho: { value: null }, u_px: { value: V2(1 / NL, 1 / NL) },
            u_r: { value: -0.3 }, u_k0: { value: 2.0 * Math.PI / 6.5 }, u_dt: { value: 0.03 }, u_seed: { value: 0 }
        });

        this.mat.velraw = this._shader(FerrofluidScene.FS_VELRAW, {
            u_state: { value: null }, u_srcPx: { value: V2(1 / N, 1 / N) }, u_gain: { value: 0 },
            u_magvel: { value: V2(0, 0) }, u_magpos: { value: V2(0.5, 0.5) }, u_magR: { value: 0.30 },
            u_agitate: { value: 0 }, u_time: { value: 0 }
        });

        this.mat.div = this._shader(FerrofluidScene.FS_DIV, { u_vel: { value: null }, u_px: { value: V2(1 / NL, 1 / NL) } });
        this.mat.jacobi = this._shader(FerrofluidScene.FS_JACOBI, { u_p: { value: null }, u_div: { value: null }, u_px: { value: V2(1 / NL, 1 / NL) } });
        this.mat.project = this._shader(FerrofluidScene.FS_PROJECT, { u_vel: { value: null }, u_p: { value: null }, u_px: { value: V2(1 / NL, 1 / NL) } });

        this.mat.dye = this._shader(FerrofluidScene.FS_DYE, {
            u_dye: { value: null }, u_vel: { value: null }, u_sharp: { value: 0.004 }
        });

        this.mat.hblur = this._shader(FerrofluidScene.FS_HBLUR, {
            u_state: { value: null }, u_px: { value: V2(1 / N, 1 / N) }
        });

        this.mat.hcomp = this._shader(FerrofluidScene.FS_HCOMP, {
            u_hb: { value: null }, u_state: { value: null }, u_spike: { value: null },
            u_px: { value: V2(1 / N, 1 / N) },
            u_H: { value: 0.075 }, u_spikeAmp: { value: 0.16 }, u_inkLevel: { value: 0.32 }
        });

        this.mat.display = this._shader(FerrofluidScene.FS_DISPLAY, {
            u_height: { value: null }, u_dye: { value: null },
            u_resolution: { value: V2(window.innerWidth, window.innerHeight) },
            u_time: { value: 0 }, u_pitch: { value: this.pitch }, u_yaw: { value: this.yaw },
            u_pan: { value: V2(0, 0) }, u_cam_dist: { value: this.zoom },
            u_H: { value: 0.075 }, u_gloss: { value: 1.0 }, u_highs: { value: 0 }, u_density: { value: 1.2 },
            u_ink1: { value: V3(1, 0.1, 0) }, u_ink2: { value: V3(0, 0.7, 1) }, u_ink3: { value: V3(1, 0, 0.3) },
            u_ink_avg: { value: V3(0.5, 0.1, 0.0) }
        });

        this.mat.post = this._shader(FerrofluidScene.FS_POST, {
            u_color: { value: null }, u_res: { value: V2(window.innerWidth, window.innerHeight) },
            u_dof: { value: 0.6 }, u_time: { value: 0 }, u_focusDist: { value: 3.8 }
        });

        this.syncInkUniforms();
    }

    _pass(material, target) {
        this.quad.material = material;
        this.renderer.setRenderTarget(target);
        this.renderer.render(this.passScene, this.camera);
    }

    _blitData(data, w, h, targets) {
        var tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.FloatType);
        tex.needsUpdate = true;
        this.mat.blit.uniforms.u_tex.value = tex;
        for (var i = 0; i < targets.length; i++) this._pass(this.mat.blit, targets[i]);
        this.renderer.setRenderTarget(null);
        tex.dispose();
    }

    // ------------------------------------------------------------------
    // Seeding
    // ------------------------------------------------------------------
    reseed(presetName, isInitial) {
        presetName = presetName || this.params.preset;
        var preset = this.presets[presetName] || this.presets.labyrinth;
        if (!this.presets[presetName]) presetName = "labyrinth";
        this.params.preset = presetName;

        var keys = ["field", "tension", "thickness", "volume", "spikeThreshold", "magnetPull", "fluidHeight"];
        for (var k = 0; k < keys.length; k++) this.params[keys[k]] = preset[keys[k]];
        this.volumeTarget = this.params.volume;
        this.rampDuration = preset.ramp || 3.0;
        this.ramp = 0.0;
        this.fieldSmooth = this.params.field;

        // Phase seed: discs whose total area matches the target volume
        var N = this.N;
        var dishR = 0.46;
        var discs = [];
        if (preset.seed === "mille") {
            discs.push([0, 0, 0.07]);
            for (var i = 0; i < 8; i++) { var a = i / 8 * Math.PI * 2; discs.push([0.16 * Math.cos(a), 0.16 * Math.sin(a), 0.045]); }
            for (var j = 0; j < 14; j++) { var b = j / 14 * Math.PI * 2 + Math.PI / 14; discs.push([0.30 * Math.cos(b), 0.30 * Math.sin(b), 0.04]); }
        } else if (preset.seed === "drop") {
            discs.push([0, 0, 0.1]);
        } else {
            discs.push([0, 0, 0.1]);
        }
        var area = 0;
        for (var d = 0; d < discs.length; d++) area += Math.PI * discs[d][2] * discs[d][2];
        var scale = Math.sqrt((this.volumeTarget * Math.PI * dishR * dishR) / area);
        for (var d2 = 0; d2 < discs.length; d2++) discs[d2][2] *= scale;

        var data = new Float32Array(N * N * 4);
        for (var y = 0; y < N; y++) {
            var v = (y + 0.5) / N - 0.5;
            for (var x = 0; x < N; x++) {
                var u = (x + 0.5) / N - 0.5;
                var phi = -1.0;
                for (var s = 0; s < discs.length; s++) {
                    var dx = u - discs[s][0], dy = v - discs[s][1];
                    if (dx * dx + dy * dy < discs[s][2] * discs[s][2]) { phi = 1.0; break; }
                }
                if (Math.sqrt(u * u + v * v) < dishR) phi += (Math.random() - 0.5) * 0.1;
                var idx = (y * N + x) * 4;
                data[idx] = Math.max(-1, Math.min(1, phi));
                data[idx + 1] = 0;
                data[idx + 2] = 0;
                data[idx + 3] = 1;
            }
        }
        this._blitData(data, N, N, [this.rt.phaseA, this.rt.phaseB]);

        // Spike field: small noise
        var NL = this.NL;
        var sd = new Float32Array(NL * NL * 4);
        for (var p = 0; p < NL * NL; p++) { sd[p * 4] = (Math.random() - 0.5) * 0.04; sd[p * 4 + 3] = 1; }
        this._blitData(sd, NL, NL, [this.rt.spikeA, this.rt.spikeB]);

        // Pressure zero
        var zd = new Float32Array(NL * NL * 4);
        this._blitData(zd, NL, NL, [this.rt.pA, this.rt.pB, this.rt.vel, this.rt.velP]);

        this._seedDye();
        this._ctrlReset = true;
    }

    _seedDye() {
        if (!this.rt.dyeA) return;
        var ND = this.ND;
        var data = new Float32Array(ND * ND * 4);
        var n = this.numInks;
        for (var y = 0; y < ND; y++) {
            var v = (y + 0.5) / ND - 0.5;
            for (var x = 0; x < ND; x++) {
                var u = (x + 0.5) / ND - 0.5;
                var w1 = 1, w2 = 0, w3 = 0;
                if (n === 2) {
                    var sep = u * 0.9 + Math.sin(v * 9.0 + 0.6) * 0.06;
                    var bl = Math.min(1, Math.max(0, (sep + 0.015) / 0.03));
                    w1 = 1 - bl; w2 = bl;
                } else if (n === 3) {
                    var r = Math.sqrt(u * u + v * v);
                    var ang = Math.atan2(v, u) + Math.sin(r * 14.0) * 0.5;
                    var t = ((ang / (Math.PI * 2)) % 1 + 1) % 1;
                    var sector = Math.floor(t * 3);
                    w1 = sector === 0 ? 1 : 0; w2 = sector === 1 ? 1 : 0; w3 = sector === 2 ? 1 : 0;
                }
                var idx = (y * ND + x) * 4;
                data[idx] = w1; data[idx + 1] = w2; data[idx + 2] = w3; data[idx + 3] = 1;
            }
        }
        this._blitData(data, ND, ND, [this.rt.dyeA, this.rt.dyeB]);
    }

    // ------------------------------------------------------------------
    // Simulation
    // ------------------------------------------------------------------
    _updateDrivers(dt, audio) {
        var P = this.params;
        var react = P.audioReact;

        // Field switch-on ramp after reseed (electromagnet energizing)
        this.ramp = Math.min(1.0, this.ramp + dt / Math.max(0.1, this.rampDuration));
        var rampS = this.ramp * this.ramp * (3 - 2 * this.ramp);

        // Musical state → field target multiplier
        var mult = 1.0, rate = 2.0;
        if (audio && react > 0) {
            var st = audio.musicalState;
            var ten = audio.tension || 0;
            if (st === "breakdown") mult = 0.80;
            else if (st === "buildup") mult = 1.0 + 0.45 * ten;
            else if (st === "pre_drop") { mult = 0.45; rate = 5.0; }
            else if (st === "drop") { mult = 1.30; rate = 10.0; }
            mult = 1.0 + (mult - 1.0) * Math.min(1.0, react);
        }
        var target = P.field * mult;
        this.fieldSmooth += (target - this.fieldSmooth) * (1 - Math.exp(-dt * rate));

        // Kick pulse
        var sub = audio ? (audio.sub || 0) : 0;
        if (audio && audio.isBeat) this.kickPulse = Math.max(this.kickPulse, 0.5 + 0.5 * sub);
        this.kickPulse *= Math.exp(-dt * 7.0);

        this.agitation *= Math.exp(-dt * 1.4);
        this.dropBurst *= Math.exp(-dt * 0.9);
        if (audio && audio.musicalState === "drop" && react > 0) this.dropBurst = Math.max(this.dropBurst, 0.35);

        this.fieldEff = this.fieldSmooth * rampS * (1 + 0.18 * this.kickPulse * react) + 0.25 * this.agitation;
        this.brep = Math.min(4.0, 2.0 * this.fieldEff * this.fieldEff);

        // Spike drive (Swift-Hohenberg r): proportional to H - Hc
        var over = (this.fieldEff - P.spikeThreshold) / 0.4;
        this.spikeR = 0.55 * Math.max(-0.6, Math.min(1.0, over)) + 0.9 * this.dropBurst * Math.min(1.0, react + 0.3);
        if (rampS < 0.5) this.spikeR = Math.min(this.spikeR, -0.2);

        // Magnet motion
        var prevX = this.magnetPos.x, prevY = this.magnetPos.y;
        if (P.magnetMode === "center") {
            this.magnetTarget.set(0.5, 0.5);
        } else if (P.magnetMode === "orbit") {
            var a = this.time * (2 * Math.PI / 45.0);
            this.magnetTarget.set(0.5 + 0.085 * Math.cos(a), 0.5 + 0.085 * Math.sin(a * 0.8));
        }
        if (audio && audio.isBeat && react > 0) {
            var ja = Math.random() * Math.PI * 2;
            var jm = 0.006 * (0.4 + sub) * react;
            this.magnetJitter.x += Math.cos(ja) * jm;
            this.magnetJitter.y += Math.sin(ja) * jm;
        }
        if (this.agitation > 0.05) {
            this.magnetJitter.x += (Math.random() - 0.5) * 0.02 * this.agitation;
            this.magnetJitter.y += (Math.random() - 0.5) * 0.02 * this.agitation;
        }
        this.magnetJitter.multiplyScalar(Math.exp(-dt * 4.0));
        var follow = 1 - Math.exp(-dt * (this.isMagnetDrag ? 10.0 : 3.0));
        this.magnetPos.x += (this.magnetTarget.x - this.magnetPos.x) * follow;
        this.magnetPos.y += (this.magnetTarget.y - this.magnetPos.y) * follow;
        var mx = this.magnetPos.x + this.magnetJitter.x;
        var my = this.magnetPos.y + this.magnetJitter.y;
        this.magnetEff = this.magnetEff || new THREE.Vector2();
        var lastEff = this.magnetEff.clone();
        this.magnetEff.set(mx, my);
        this.magnetVel.set(this.magnetEff.x - (lastEff.x || mx), this.magnetEff.y - (lastEff.y || my));

        // Shift-drag injection adds fluid volume
        if (this.mouseAction > 0) this.volumeTarget = Math.min(0.6, this.volumeTarget + dt * 0.03);
    }

    _simulate() {
        var r = this.renderer, R = this.rt, M = this.mat, P = this.params;
        var NL = this.NL;

        // 1. Downsample magnetized density ρ to the low-res grid
        M.down.uniforms.u_state.value = R.phaseA.texture;
        this._pass(M.down, R.low);

        // 2. Long-range dipolar kernel K∗ρ (separable Gaussian, range = film thickness)
        M.blur.uniforms.u_sigma.value = P.thickness;
        M.blur.uniforms.u_src.value = R.low.texture;
        M.blur.uniforms.u_dir.value.set(1 / NL, 0);
        this._pass(M.blur, R.blurTmp);
        M.blur.uniforms.u_src.value = R.blurTmp.texture;
        M.blur.uniforms.u_dir.value.set(0, 1 / NL);
        this._pass(M.blur, R.K);

        // 3. Volume reduction 128 → 16 → 1
        M.reduce.uniforms.u_src.value = R.low.texture;
        M.reduce.uniforms.u_srcSize.value = NL;
        M.reduce.uniforms.u_block.value = 8;
        this._pass(M.reduce, R.red16);
        M.reduce.uniforms.u_src.value = R.red16.texture;
        M.reduce.uniforms.u_srcSize.value = 16;
        M.reduce.uniforms.u_block.value = 16;
        this._pass(M.reduce, R.red1);

        // 4. Volume-conserving Lagrange multiplier λ (PI controller on GPU)
        M.ctrl.uniforms.u_prev.value = R.ctrlA.texture;
        M.ctrl.uniforms.u_mean.value = R.red1.texture;
        M.ctrl.uniforms.u_V0.value = this.volumeTarget;
        M.ctrl.uniforms.u_reset.value = this._ctrlReset ? 1.0 : 0.0;
        M.ctrl.uniforms.u_init.value = 0.25 + 0.2 * this.brep;
        this._pass(M.ctrl, R.ctrlB);
        var t = R.ctrlA; R.ctrlA = R.ctrlB; R.ctrlB = t;
        this._ctrlReset = false;

        // 5. Phase-field substeps
        var pu = M.phase.uniforms;
        pu.u_K.value = R.K.texture;
        pu.u_ctrl.value = R.ctrlA.texture;
        pu.u_eps2.value = P.tension;
        pu.u_brep.value = this.brep;
        pu.u_pull.value = P.magnetPull * (0.4 + 0.6 * Math.min(1.5, this.fieldEff));
        pu.u_local.value = P.focus;
        pu.u_magpos.value.copy(this.magnetEff);
        pu.u_agitate.value = this.agitation;
        pu.u_time.value = this.time;
        pu.u_mouse_pos.value.copy(this.mouseUV);
        pu.u_mouse_action.value = this.mouseAction;
        var S = Math.max(1, Math.min(12, Math.round(P.simSpeed)));
        for (var i = 0; i < S; i++) {
            pu.u_state.value = R.phaseA.texture;
            this._pass(M.phase, R.phaseB);
            t = R.phaseA; R.phaseA = R.phaseB; R.phaseB = t;
        }

        // 6. Rosensweig spikes (Swift-Hohenberg)
        var su = M.spike.uniforms;
        su.u_rho.value = R.low.texture;
        su.u_r.value = this.spikeR;
        for (var k = 0; k < 24; k++) {
            su.u_spike.value = R.spikeA.texture;
            su.u_seed.value = (this.spikeSeed = (this.spikeSeed + 1) % 997);
            this._pass(M.spike, R.spikeB);
            t = R.spikeA; R.spikeA = R.spikeB; R.spikeB = t;
        }

        // 7. Incompressible ink flow driven by interface motion
        if (P.flow > 0.001) {
            var vu = M.velraw.uniforms;
            vu.u_state.value = R.phaseA.texture;
            vu.u_gain.value = P.flow * 3.0 * 0.2 * S / this.N;
            vu.u_magvel.value.copy(this.magnetVel);
            vu.u_magpos.value.copy(this.magnetEff);
            vu.u_agitate.value = this.agitation + this.dropBurst * 0.5;
            vu.u_time.value = this.time;
            this._pass(M.velraw, R.vel);

            M.div.uniforms.u_vel.value = R.vel.texture;
            this._pass(M.div, R.div);
            M.jacobi.uniforms.u_div.value = R.div.texture;
            for (var j = 0; j < 16; j++) {
                M.jacobi.uniforms.u_p.value = R.pA.texture;
                this._pass(M.jacobi, R.pB);
                t = R.pA; R.pA = R.pB; R.pB = t;
            }
            M.project.uniforms.u_vel.value = R.vel.texture;
            M.project.uniforms.u_p.value = R.pA.texture;
            this._pass(M.project, R.velP);

            M.dye.uniforms.u_dye.value = R.dyeA.texture;
            M.dye.uniforms.u_vel.value = R.velP.texture;
            this._pass(M.dye, R.dyeB);
            t = R.dyeA; R.dyeA = R.dyeB; R.dyeB = t;
        }

        // 8. Surface height field (ferrofluid dome + spikes + ink meniscus)
        M.hblur.uniforms.u_state.value = R.phaseA.texture;
        this._pass(M.hblur, R.hblur);
        var hu = M.hcomp.uniforms;
        hu.u_hb.value = R.hblur.texture;
        hu.u_state.value = R.phaseA.texture;
        hu.u_spike.value = R.spikeA.texture;
        hu.u_H.value = P.fluidHeight;
        hu.u_spikeAmp.value = P.fluidHeight * 2.2;
        this._pass(M.hcomp, R.height);

        r.setRenderTarget(null);
    }

    update(dt, audio, isVisible) {
        if (!this.isInitialized || !isVisible) return;
        dt = Math.min(dt, 0.05);
        this.time += dt;

        this.pitch += (this.targetPitch - this.pitch) * 0.15;
        this.yaw += (this.targetYaw - this.yaw) * 0.15;
        this.panX += (this.targetPanX - this.panX) * 0.15;
        this.panZ += (this.targetPanZ - this.panZ) * 0.15;
        this.zoom += (this.targetZoom - this.zoom) * 0.15;

        this._updateDrivers(dt, audio);
        this._simulate();

        var u = this.mat.display.uniforms;
        u.u_time.value = this.time;
        u.u_pitch.value = this.pitch;
        u.u_yaw.value = this.yaw;
        u.u_pan.value.set(this.panX, this.panZ);
        u.u_cam_dist.value = this.zoom;
        u.u_H.value = this.params.fluidHeight;
        u.u_gloss.value = this.params.gloss;
        u.u_highs.value = audio ? (audio.highs || 0) : 0;
        u.u_density.value = this.params.density;
        this.mat.post.uniforms.u_dof.value = this.params.dof;
        this.mat.post.uniforms.u_time.value = this.time;
        this.mat.post.uniforms.u_focusDist.value = this.zoom;
    }

    resize(width, height) {
        if (!this.renderer) return;
        this.renderer.setSize(width, height);
        this._resizeColorTarget();
    }

    render(alpha) {
        alpha = alpha === undefined ? 1.0 : alpha;
        if (!this.isInitialized || !this.renderer) return;
        var el = this.renderer.domElement;
        el.style.opacity = alpha;
        if (alpha > 0.001) {
            el.style.display = "block";
            this.mat.display.uniforms.u_height.value = this.rt.height.texture;
            this.mat.display.uniforms.u_dye.value = this.rt.dyeA.texture;
            this._pass(this.mat.display, this.rt.color);
            this.mat.post.uniforms.u_color.value = this.rt.color.texture;
            this._pass(this.mat.post, null);
        } else {
            el.style.display = "none";
        }
    }

    // ------------------------------------------------------------------
    // Actions & parameters
    // ------------------------------------------------------------------
    triggerDropShockwave() {
        this.dropBurst = 1.0;
        this.agitation = Math.max(this.agitation, 0.5);
    }

    agitateFluid() {
        this.agitation = 1.0;
    }

    mutate() {
        var hasCustom = this.customInkColors.some(function (c) { return !!c; });
        if (!hasCustom) {
            this.params.paletteIdx = (this.params.paletteIdx + 1) % this.palettes.length;
            this.inkSlots[0] = this.params.paletteIdx;
            this.inkSlots[1] = (this.params.paletteIdx + 3) % this.palettes.length;
            this.inkSlots[2] = (this.params.paletteIdx + 4) % this.palettes.length;
            this.syncInkUniforms();
        }
        this.agitateFluid();
    }

    clearFluid() {
        var N = this.N;
        var data = new Float32Array(N * N * 4);
        for (var i = 0; i < N * N; i++) { data[i * 4] = -1.0; data[i * 4 + 3] = 1.0; }
        this._blitData(data, N, N, [this.rt.phaseA, this.rt.phaseB]);
        this.volumeTarget = 0.0;
        this._ctrlReset = true;
    }

    setThickness(val) {
        // HUD thickness slider [1.5 .. 10] → film thickness (dipolar range) [1.5 .. 4.5]
        this.params.thickness = 1.5 + Math.max(0, Math.min(1, (val - 1.5) / 8.5)) * 3.0;
    }

    setParam(key, val) {
        if (this.params[key] === undefined) return;
        this.params[key] = val;
        if (key === "volume") this.volumeTarget = val;
    }

    setMagnetMode(mode) {
        if (mode === "center" || mode === "orbit" || mode === "manual") this.params.magnetMode = mode;
    }

    setPalette(idx) {
        this.params.paletteIdx = Math.max(0, Math.min(this.palettes.length - 1, idx));
        this.setInkSlot(0, this.params.paletteIdx);
    }

    // ------------------------------------------------------------------
    // Camera & interaction
    // ------------------------------------------------------------------
    _isActive() {
        return this.renderer && this.renderer.domElement.style.display !== "none";
    }

    _isUI(target) {
        return !!(target && target.closest && (target.closest("#vj-hud") || target.closest("#proportions-drawer")));
    }

    _bindMouseEvents() {
        window.addEventListener("mousedown", (e) => {
            if (!this._isActive() || this._isUI(e.target)) return;

            var now = performance.now();
            if (now - this._lastTapTime < 320 && Math.hypot(e.clientX - this._lastTapX, e.clientY - this._lastTapY) < 35) {
                this.resetCamera();
                this._lastTapTime = 0;
                this.isDragging = false;
                this.isPanning = false;
                return;
            }
            this._lastTapTime = now;
            this._lastTapX = e.clientX;
            this._lastTapY = e.clientY;

            if (e.metaKey || e.ctrlKey) {
                // ⌘ / Ctrl drag: move the magnet under the dish
                var uv = this._screenToSimUV(e.clientX, e.clientY);
                if (uv) {
                    this.isMagnetDrag = true;
                    this.params.magnetMode = "manual";
                    this.magnetTarget.set(uv.x, uv.y);
                    var sel = document.getElementById("ferro-magnet-mode");
                    if (sel) sel.value = "manual";
                }
            } else if (e.altKey || e.button === 1) {
                this.isPanning = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
            } else if (e.shiftKey || e.button === 2) {
                this._updateMouseUV(e.clientX, e.clientY, 1);
            } else {
                this.isDragging = true;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
            }
        });

        window.addEventListener("mousemove", (e) => {
            if (!this._isActive()) return;
            if (this.isMagnetDrag) {
                var uv = this._screenToSimUV(e.clientX, e.clientY);
                if (uv) {
                    var dx0 = uv.x - 0.5, dy0 = uv.y - 0.5;
                    var rr = Math.hypot(dx0, dy0);
                    if (rr > 0.42) { dx0 *= 0.42 / rr; dy0 *= 0.42 / rr; }
                    this.magnetTarget.set(0.5 + dx0, 0.5 + dy0);
                }
            } else if (this.isPanning || (this.isDragging && e.altKey)) {
                var dx = e.clientX - this.lastMouseX;
                var dy = e.clientY - this.lastMouseY;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                var yaw = this.yaw;
                var scale = 0.0055 * (this.zoom / 3.8);
                this.targetPanX += (-dx * Math.cos(yaw) + dy * -Math.sin(yaw)) * scale;
                this.targetPanZ += (-dx * Math.sin(yaw) + dy * Math.cos(yaw)) * scale;
                this.targetPanX = Math.max(-4.0, Math.min(4.0, this.targetPanX));
                this.targetPanZ = Math.max(-4.0, Math.min(4.0, this.targetPanZ));
            } else if (this.isDragging) {
                var ddx = e.clientX - this.lastMouseX;
                var ddy = e.clientY - this.lastMouseY;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
                this.targetYaw += ddx * 0.005;
                this.targetPitch = Math.max(0.80, Math.min(1.54, this.targetPitch + ddy * 0.005));
            } else if (e.shiftKey && this.mouseAction > 0) {
                this._updateMouseUV(e.clientX, e.clientY, 1);
            }
        });

        window.addEventListener("mouseup", () => {
            this.isDragging = false;
            this.isPanning = false;
            this.isMagnetDrag = false;
            this.mouseAction = 0;
            this.mouseUV.set(-1.0, -1.0);
        });

        window.addEventListener("wheel", (e) => {
            if (!this._isActive() || this._isUI(e.target)) return;
            e.preventDefault();
            this.targetZoom = Math.max(1.5, Math.min(8.0, this.targetZoom + e.deltaY * 0.0035));
            this._syncZoomUI();
        }, { passive: false });

        var lastPinchDist = null;
        window.addEventListener("touchmove", (e) => {
            if (!this._isActive() || this._isUI(e.target)) return;
            if (e.touches && e.touches.length === 2) {
                var dx = e.touches[0].clientX - e.touches[1].clientX;
                var dy = e.touches[0].clientY - e.touches[1].clientY;
                var dist = Math.hypot(dx, dy);
                if (lastPinchDist !== null) {
                    this.targetZoom = Math.max(1.5, Math.min(8.0, this.targetZoom + (lastPinchDist - dist) * 0.012));
                    this._syncZoomUI();
                }
                lastPinchDist = dist;
            }
        }, { passive: true });

        window.addEventListener("touchend", (e) => {
            lastPinchDist = null;
            if (!this._isActive() || this._isUI(e.target)) return;
            if (e.changedTouches && e.changedTouches.length === 1) {
                var now = performance.now();
                if (now - this._lastTouchTapTime < 320) {
                    this.resetCamera();
                    this._lastTouchTapTime = 0;
                } else {
                    this._lastTouchTapTime = now;
                }
            }
        });
    }

    _syncZoomUI() {
        var slider = document.getElementById("slider-ferro-zoom");
        var valEl = document.getElementById("val-ferro-zoom");
        if (slider) slider.value = this.targetZoom;
        if (valEl) valEl.textContent = this.targetZoom.toFixed(1) + "x";
    }

    setZoom(val) {
        this.targetZoom = Math.max(1.5, Math.min(8.0, val));
        this._syncZoomUI();
    }

    zoomBy(delta) {
        this.targetZoom = Math.max(1.5, Math.min(8.0, this.targetZoom + delta));
        this._syncZoomUI();
    }

    resetCamera(immediate) {
        this.targetPanX = 0.0;
        this.targetPanZ = 0.0;
        this.targetZoom = 3.8;
        this.targetPitch = 1.33;
        this.targetYaw = 0.0;
        if (immediate) {
            this.panX = 0.0; this.panZ = 0.0; this.zoom = 3.8; this.pitch = 1.33; this.yaw = 0.0;
        }
        this._syncZoomUI();
    }

    /** Ray-cast a screen point onto the dish plane (y = 0) and return simulation UV, or null. */
    _screenToSimUV(clientX, clientY) {
        var w = window.innerWidth, h = window.innerHeight;
        var m = Math.min(w, h);
        var sx = (clientX - 0.5 * w) / m;
        var sy = ((h - clientY) - 0.5 * h) / m;

        var camDist = this.zoom, pitch = this.pitch;
        var yaw = this.yaw + this.time * FerrofluidScene.TURNTABLE;
        var tx = this.panX, ty = 0.02, tz = this.panZ;
        var rox = tx + camDist * Math.sin(yaw) * Math.cos(pitch);
        var roy = ty + camDist * Math.sin(pitch);
        var roz = tz - camDist * Math.cos(yaw) * Math.cos(pitch);

        var fx = tx - rox, fy = ty - roy, fz = tz - roz;
        var fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
        // right = normalize(cross(up, fwd)) = (fz, 0, -fx)
        var rx = fz, rz = -fx;
        var rl = Math.hypot(rx, rz); rx /= rl; rz /= rl;
        // up = cross(fwd, right) with right.y = 0
        var ux = fy * rz, uy = fz * rx - fx * rz, uz = -fy * rx;

        var dx = sx * rx + sy * ux + 1.72 * fx;
        var dy = sy * uy + 1.72 * fy;
        var dz = sx * rz + sy * uz + 1.72 * fz;
        if (Math.abs(dy) < 1e-4) return null;
        var t = -roy / dy;
        if (t <= 0) return null;
        var hx = rox + dx * t, hz = roz + dz * t;
        var su = hx * FerrofluidScene.WS + 0.5;
        var sv = hz * FerrofluidScene.WS + 0.5;
        if (su < 0 || su > 1 || sv < 0 || sv > 1) return null;
        return { x: su, y: sv };
    }

    _updateMouseUV(clientX, clientY, action) {
        var uv = this._screenToSimUV(clientX, clientY);
        if (uv) {
            this.mouseUV.set(uv.x, uv.y);
            this.mouseAction = action;
        } else {
            this.mouseUV.set(-1, -1);
            this.mouseAction = 0;
        }
    }

    destroy() {
        if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
        for (var k in this.rt) if (this.rt[k]) this.rt[k].dispose();
    }
}

// World ↔ simulation UV scale (world span ±2.404 maps to UV [0,1])
FerrofluidScene.WS = 0.208;
FerrofluidScene.TURNTABLE = 0.012;

// ======================================================================
// Shaders
// ======================================================================
FerrofluidScene.VS = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

FerrofluidScene.FS_BLIT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D u_tex;
void main() { gl_FragColor = texture2D(u_tex, vUv); }
`;

// Conserved Allen-Cahn with long-range dipolar repulsion
FerrofluidScene.FS_PHASE = `
precision highp float;
varying vec2 vUv;
uniform sampler2D u_state;
uniform sampler2D u_K;
uniform sampler2D u_ctrl;
uniform vec2 u_px;
uniform float u_eps2, u_brep, u_pull, u_local, u_magR, u_dt, u_agitate, u_time, u_mouse_action;
uniform vec2 u_magpos, u_mouse_pos;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
    float r = length(vUv - 0.5);
    if (r > 0.46) { gl_FragColor = vec4(-1.0, 0.0, 0.0, 1.0); return; }

    float c  = texture2D(u_state, vUv).r;
    float n  = texture2D(u_state, vUv + vec2(0.0, u_px.y)).r;
    float s  = texture2D(u_state, vUv - vec2(0.0, u_px.y)).r;
    float e  = texture2D(u_state, vUv + vec2(u_px.x, 0.0)).r;
    float w  = texture2D(u_state, vUv - vec2(u_px.x, 0.0)).r;
    float ne = texture2D(u_state, vUv + u_px).r;
    float sw = texture2D(u_state, vUv - u_px).r;
    float nw = texture2D(u_state, vUv + vec2(-u_px.x, u_px.y)).r;
    float se = texture2D(u_state, vUv + vec2(u_px.x, -u_px.y)).r;
    float lap = (0.2 * (n + s + e + w) + 0.05 * (ne + nw + se + sw) - c) * 4.0;

    float K = texture2D(u_K, vUv).r;
    float lam = texture2D(u_ctrl, vec2(0.5)).r;

    vec2 dm = vUv - u_magpos;
    float P = exp(-dot(dm, dm) / (u_magR * u_magR));
    float fieldLocal = mix(1.0, P, u_local);

    float g = clamp(1.0 - c * c, 0.0, 1.0) + 0.02;
    float drive = -u_brep * fieldLocal * K + lam + u_pull * P;
    if (u_agitate > 0.001) {
        drive += u_agitate * (vnoise(vUv * 38.0 + vec2(u_time * 3.1, -u_time * 2.3)) - 0.5) * 2.4;
    }

    float rhs = u_eps2 * lap + c - c * c * c + g * drive;
    float nc = clamp(c + u_dt * rhs, -1.0, 1.0);

    if (u_mouse_action > 0.5) {
        float dM = length(vUv - u_mouse_pos);
        nc = mix(nc, 1.0, smoothstep(0.035, 0.0, dM) * 0.25);
    }

    nc = mix(nc, -1.0, smoothstep(0.445, 0.46, r));
    gl_FragColor = vec4(nc, rhs, 0.0, 1.0);
}
`;

// Downsample ρ = (φ+1)/2 to low-res grid
FerrofluidScene.FS_DOWN = `
precision highp float;
varying vec2 vUv;
uniform sampler2D u_state;
uniform vec2 u_srcPx;
void main() {
    float s = texture2D(u_state, vUv + vec2( 0.75,  0.75) * u_srcPx).r
            + texture2D(u_state, vUv + vec2(-0.75,  0.75) * u_srcPx).r
            + texture2D(u_state, vUv + vec2( 0.75, -0.75) * u_srcPx).r
            + texture2D(u_state, vUv + vec2(-0.75, -0.75) * u_srcPx).r;
    float rho = clamp((s * 0.25 + 1.0) * 0.5, 0.0, 1.0);
    gl_FragColor = vec4(rho, 0.0, 0.0, 1.0);
}
`;

// Separable Gaussian blur (17 taps, variable sigma)
FerrofluidScene.FS_BLUR = `
precision highp float;
varying vec2 vUv;
uniform sampler2D u_src;
uniform vec2 u_dir;
uniform float u_sigma;
void main() {
    float stepL = max(0.5, u_sigma * 3.0 / 8.0);
    float sum = 0.0, wsum = 0.0;
    for (int i = -8; i <= 8; i++) {
        float x = float(i) * stepL;
        float w = exp(-x * x / (2.0 * u_sigma * u_sigma));
        sum += w * texture2D(u_src, vUv + u_dir * x).r;
        wsum += w;
    }
    gl_FragColor = vec4(sum / wsum, 0.0, 0.0, 1.0);
}
`;

// Block-average reduction (8x8 samples per output texel)
FerrofluidScene.FS_REDUCE = `
precision highp float;
uniform sampler2D u_src;
uniform float u_srcSize;
uniform float u_block;
void main() {
    vec2 base = floor(gl_FragCoord.xy) * u_block;
    float spacing = u_block / 8.0;
    float s = 0.0;
    for (int j = 0; j < 8; j++) {
        for (int i = 0; i < 8; i++) {
            vec2 sp = base + (vec2(float(i), float(j)) + 0.5) * spacing;
            s += texture2D(u_src, sp / u_srcSize).r;
        }
    }
    gl_FragColor = vec4(s / 64.0, 0.0, 0.0, 1.0);
}
`;

// Volume-conservation PI controller → Lagrange multiplier λ
FerrofluidScene.FS_CTRL = `
precision highp float;
uniform sampler2D u_prev;
uniform sampler2D u_mean;
uniform float u_V0, u_kp, u_ki, u_reset, u_init;
void main() {
    float V = texture2D(u_mean, vec2(0.5)).r / 0.66476;
    vec4 c = texture2D(u_prev, vec2(0.5));
    float integ = (u_reset > 0.5) ? u_init : c.g;
    float err = u_V0 - V;
    integ = clamp(integ + err * u_ki, -1.5, 3.0);
    float lam = clamp(u_kp * err + integ, -2.0, 4.0);
    gl_FragColor = vec4(lam, integ, V, 1.0);
}
`;

// Swift-Hohenberg Rosensweig spike field
FerrofluidScene.FS_SPIKE = `
precision highp float;
varying vec2 vUv;
uniform sampler2D u_spike;
uniform sampler2D u_rho;
uniform vec2 u_px;
uniform float u_r, u_k0, u_dt, u_seed;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
    float c  = texture2D(u_spike, vUv).r;
    float n  = texture2D(u_spike, vUv + vec2(0.0, u_px.y)).r;
    float s  = texture2D(u_spike, vUv - vec2(0.0, u_px.y)).r;
    float e  = texture2D(u_spike, vUv + vec2(u_px.x, 0.0)).r;
    float w  = texture2D(u_spike, vUv - vec2(u_px.x, 0.0)).r;
    float ne = texture2D(u_spike, vUv + u_px).r;
    float sw = texture2D(u_spike, vUv - u_px).r;
    float nw = texture2D(u_spike, vUv + vec2(-u_px.x, u_px.y)).r;
    float se = texture2D(u_spike, vUv + vec2(u_px.x, -u_px.y)).r;
    float nn = texture2D(u_spike, vUv + vec2(0.0, 2.0 * u_px.y)).r;
    float ss = texture2D(u_spike, vUv - vec2(0.0, 2.0 * u_px.y)).r;
    float ee = texture2D(u_spike, vUv + vec2(2.0 * u_px.x, 0.0)).r;
    float ww = texture2D(u_spike, vUv - vec2(2.0 * u_px.x, 0.0)).r;

    float lap = (n + s + e + w) - 4.0 * c;
    float bih = 20.0 * c - 8.0 * (n + s + e + w) + 2.0 * (ne + nw + se + sw) + (nn + ss + ee + ww);
    float k2 = u_k0 * u_k0;
    float L = k2 * k2 * c + 2.0 * k2 * lap + bih;

    float rho = texture2D(u_rho, vUv).r;
    float fm = smoothstep(0.35, 0.75, rho);
    float rr = u_r * fm - 0.6 * (1.0 - fm);

    float nc = c + u_dt * (rr * c - L + 0.9 * c * c - c * c * c);
    nc += (hash(vUv * 512.0 + u_seed) - 0.5) * 0.0015 * fm;
    gl_FragColor = vec4(clamp(nc, -2.0, 2.0), 0.0, 0.0, 1.0);
}
`;

// Raw velocity from interface motion v = -φt ∇φ / |∇φ|², plus magnet drag and agitation
FerrofluidScene.FS_VELRAW = `
precision highp float;
varying vec2 vUv;
uniform sampler2D u_state;
uniform vec2 u_srcPx;
uniform float u_gain, u_magR, u_agitate, u_time;
uniform vec2 u_magvel, u_magpos;
void main() {
    float r = length(vUv - 0.5);
    if (r > 0.455) { gl_FragColor = vec4(0.0); return; }
    float pt = texture2D(u_state, vUv).g;
    float pR = texture2D(u_state, vUv + vec2(1.5 * u_srcPx.x, 0.0)).r;
    float pL = texture2D(u_state, vUv - vec2(1.5 * u_srcPx.x, 0.0)).r;
    float pT = texture2D(u_state, vUv + vec2(0.0, 1.5 * u_srcPx.y)).r;
    float pB = texture2D(u_state, vUv - vec2(0.0, 1.5 * u_srcPx.y)).r;
    vec2 grad = vec2(pR - pL, pT - pB) / 3.0;
    vec2 v = -pt * grad / (dot(grad, grad) + 0.004) * u_gain;

    vec2 dm = vUv - u_magpos;
    float P = exp(-dot(dm, dm) / (u_magR * u_magR));
    v += u_magvel * P * 0.6;

    vec2 cc = vUv - 0.5;
    v += u_agitate * 0.003 * vec2(-cc.y, cc.x) * sin(u_time * 7.0 + length(cc) * 30.0) * 8.0;

    float Lv = length(v);
    if (Lv > 0.01) v *= 0.01 / Lv;
    v *= smoothstep(0.455, 0.43, r);
    gl_FragColor = vec4(v, 0.0, 1.0);
}
`;

FerrofluidScene.FS_DIV = `
precision highp float;
varying vec2 vUv;
uniform sampler2D u_vel;
uniform vec2 u_px;
void main() {
    float vr = texture2D(u_vel, vUv + vec2(u_px.x, 0.0)).x;
    float vl = texture2D(u_vel, vUv - vec2(u_px.x, 0.0)).x;
    float vt = texture2D(u_vel, vUv + vec2(0.0, u_px.y)).y;
    float vb = texture2D(u_vel, vUv - vec2(0.0, u_px.y)).y;
    gl_FragColor = vec4(0.5 * (vr - vl + vt - vb), 0.0, 0.0, 1.0);
}
`;

FerrofluidScene.FS_JACOBI = `
precision highp float;
varying vec2 vUv;
uniform sampler2D u_p;
uniform sampler2D u_div;
uniform vec2 u_px;
void main() {
    float pl = texture2D(u_p, vUv - vec2(u_px.x, 0.0)).r;
    float pr = texture2D(u_p, vUv + vec2(u_px.x, 0.0)).r;
    float pb = texture2D(u_p, vUv - vec2(0.0, u_px.y)).r;
    float pt = texture2D(u_p, vUv + vec2(0.0, u_px.y)).r;
    float d = texture2D(u_div, vUv).r;
    gl_FragColor = vec4((pl + pr + pb + pt - d) * 0.25, 0.0, 0.0, 1.0);
}
`;

FerrofluidScene.FS_PROJECT = `
precision highp float;
varying vec2 vUv;
uniform sampler2D u_vel;
uniform sampler2D u_p;
uniform vec2 u_px;
void main() {
    float pl = texture2D(u_p, vUv - vec2(u_px.x, 0.0)).r;
    float pr = texture2D(u_p, vUv + vec2(u_px.x, 0.0)).r;
    float pb = texture2D(u_p, vUv - vec2(0.0, u_px.y)).r;
    float pt = texture2D(u_p, vUv + vec2(0.0, u_px.y)).r;
    vec2 v = texture2D(u_vel, vUv).xy - 0.5 * vec2(pr - pl, pt - pb);
    v *= smoothstep(0.46, 0.43, length(vUv - 0.5));
    gl_FragColor = vec4(v, 0.0, 1.0);
}
`;

// Semi-Lagrangian dye advection with mild re-segregation (counteracts numerical diffusion)
FerrofluidScene.FS_DYE = `
precision highp float;
varying vec2 vUv;
uniform sampler2D u_dye;
uniform sampler2D u_vel;
uniform float u_sharp;
void main() {
    vec2 v = texture2D(u_vel, vUv).xy;
    vec3 c = texture2D(u_dye, vUv - v).rgb;
    vec3 k = pow(max(c, vec3(0.0)), vec3(1.0 + u_sharp));
    k /= max(k.r + k.g + k.b, 1e-4);
    gl_FragColor = vec4(k, 1.0);
}
`;

// Height: horizontal blurs of ρ (R: narrow σ≈1.6 px, G: wide σ≈4 px)
FerrofluidScene.FS_HBLUR = `
precision highp float;
varying vec2 vUv;
uniform sampler2D u_state;
uniform vec2 u_px;
void main() {
    float a = 0.0, wa = 0.0, b = 0.0, wb = 0.0;
    for (int i = -6; i <= 6; i++) {
        float x = float(i) * 1.5;
        float rho = clamp((texture2D(u_state, vUv + vec2(x * u_px.x, 0.0)).r + 1.0) * 0.5, 0.0, 1.0);
        float w1 = exp(-x * x / (2.0 * 1.6 * 1.6));
        float w2 = exp(-x * x / (2.0 * 4.0 * 4.0));
        a += rho * w1; wa += w1;
        b += rho * w2; wb += w2;
    }
    gl_FragColor = vec4(a / wa, b / wb, 0.0, 1.0);
}
`;

// Height composition: ferrofluid dome + Rosensweig spikes + ink layer with meniscus
FerrofluidScene.FS_HCOMP = `
precision highp float;
varying vec2 vUv;
uniform sampler2D u_hb;
uniform sampler2D u_state;
uniform sampler2D u_spike;
uniform vec2 u_px;
uniform float u_H, u_spikeAmp, u_inkLevel;
void main() {
    float a = 0.0, wa = 0.0, b = 0.0, wb = 0.0;
    for (int i = -6; i <= 6; i++) {
        float x = float(i) * 1.5;
        vec2 hb = texture2D(u_hb, vUv + vec2(0.0, x * u_px.y)).rg;
        float w1 = exp(-x * x / (2.0 * 1.6 * 1.6));
        float w2 = exp(-x * x / (2.0 * 4.0 * 4.0));
        a += hb.r * w1; wa += w1;
        b += hb.g * w2; wb += w2;
    }
    float rs = a / wa;
    float rw = b / wb;
    float rho0 = clamp((texture2D(u_state, vUv).r + 1.0) * 0.5, 0.0, 1.0);

    float hF = u_H * pow(smoothstep(0.08, 1.0, rs), 0.6);
    float sw = texture2D(u_spike, vUv).r;
    float fm = smoothstep(0.45, 0.85, rs);
    float hS = u_spikeAmp * pow(max(sw, 0.0) / 1.3, 1.6) * fm;
    float hFerro = hF + hS;

    float hInk = u_H * (u_inkLevel + 0.45 * smoothstep(0.0, 0.7, rw));

    float k = 0.12 * u_H;
    float h = max(hFerro, hInk) + pow(max(k - abs(hFerro - hInk), 0.0), 2.0) / (4.0 * k);

    float rr = length(vUv - 0.5);
    if (rr > 0.462) { h = -0.01; hInk = 0.0; hFerro = -0.01; rho0 = 0.0; }
    gl_FragColor = vec4(h, rho0, hInk, hFerro);
}
`;

// Ray-marched macro studio render (linear HDR color, alpha = hit distance)
FerrofluidScene.FS_DISPLAY = `
precision highp float;
varying vec2 vUv;
uniform sampler2D u_height;
uniform sampler2D u_dye;
uniform vec2 u_resolution;
uniform float u_time, u_pitch, u_yaw, u_cam_dist, u_H, u_gloss, u_highs, u_density;
uniform vec2 u_pan;
uniform vec3 u_ink1, u_ink2, u_ink3, u_ink_avg;

const float WS = 0.208;
const float TURNTABLE = 0.012;
vec2 toUV(vec2 p) { return p * WS + 0.5; }

float rimH(float d) { float x = (d - 2.255) / 0.032; return 0.055 * exp(-x * x); }

float heightAt(vec2 p) {
    float d = length(p);
    float h = (d < 2.30) ? texture2D(u_height, toUV(p)).r : -0.01;
    return h + rimH(d);
}

vec3 normalAt(vec2 p) {
    float e = 0.0125;
    float hR = heightAt(p + vec2(e, 0.0));
    float hL = heightAt(p - vec2(e, 0.0));
    float hU = heightAt(p + vec2(0.0, e));
    float hD = heightAt(p - vec2(0.0, e));
    return normalize(vec3(hL - hR, 2.0 * e, hD - hU));
}

float softbox(vec3 R, vec3 L, vec2 size) {
    float dl = dot(R, L);
    if (dl <= 0.0) return 0.0;
    vec3 T1 = normalize(cross(L, vec3(0.0, 0.0, 1.0)));
    vec3 T2 = cross(L, T1);
    vec2 q = vec2(dot(R, T1), dot(R, T2)) / dl;
    vec2 e = smoothstep(size, size - vec2(0.05), abs(q));
    return e.x * e.y;
}

// Procedural macro photography studio environment
vec3 env(vec3 R, vec3 C) {
    vec3 col = mix(vec3(0.008, 0.009, 0.011), vec3(0.03, 0.031, 0.036), clamp(R.y, 0.0, 1.0));
    col += u_ink_avg * 0.16 * smoothstep(0.30, 0.0, R.y);              // surrounding ink seen at grazing angles
    col += softbox(R, normalize(vec3(0.55, 1.0, -0.45)), vec2(0.42, 0.26)) * vec3(1.0, 0.96, 0.90) * 6.0 * u_gloss;
    col += softbox(R, normalize(vec3(-0.75, 0.8, 0.55)), vec2(0.30, 0.16)) * vec3(0.85, 0.92, 1.0) * 2.5 * u_gloss;
    float ca = acos(clamp(dot(R, C), -1.0, 1.0));
    col += smoothstep(0.022, 0.0, abs(ca - 0.17)) * 4.0 * u_gloss * (0.8 + u_highs * 0.6);   // lens ring-light
    return col;
}

void main() {
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);

    float camDist = u_cam_dist;
    float yaw = u_yaw + u_time * TURNTABLE;
    vec3 target = vec3(u_pan.x, 0.02, u_pan.y);
    vec3 ro = target + vec3(camDist * sin(yaw) * cos(u_pitch), camDist * sin(u_pitch), -camDist * cos(yaw) * cos(u_pitch));
    vec3 fwd = normalize(target - ro);
    vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
    vec3 up = cross(fwd, right);
    vec3 rd = normalize(uv.x * right + uv.y * up + 1.72 * fwd);
    vec3 C = normalize(ro - target);

    vec3 bg = mix(vec3(0.010, 0.011, 0.014), vec3(0.003, 0.003, 0.004), length(uv) * 1.1);
    if (rd.y > -0.01) { gl_FragColor = vec4(bg, 60.0); return; }

    // March from the top of the relief volume
    float hTop = u_H * 3.6 + 0.07;
    float t = max(0.0, (ro.y - hTop) / -rd.y);
    float tPrev = t;
    bool hit = false;
    for (int i = 0; i < 72; i++) {
        vec3 p = ro + rd * t;
        float dy = p.y - heightAt(p.xz);
        if (dy < 0.0) { hit = true; break; }
        tPrev = t;
        t += clamp(dy * 0.6, 0.0015, 0.05);
        if (p.y < -0.05) break;
    }
    if (!hit) { gl_FragColor = vec4(bg, 60.0); return; }
    float ta = tPrev, tb = t;
    for (int j = 0; j < 6; j++) {
        float tm = 0.5 * (ta + tb);
        vec3 pm = ro + rd * tm;
        if (pm.y < heightAt(pm.xz)) tb = tm; else ta = tm;
    }
    t = tb;
    vec3 p = ro + rd * t;

    float d = length(p.xz);
    vec3 N = normalAt(p.xz);
    vec3 V = -rd;
    vec3 R = reflect(rd, N);
    float NdV = max(dot(N, V), 0.0);
    float fres5 = pow(1.0 - NdV, 5.0);
    vec3 col;

    if (d > 2.29) {
        // Dark table outside the dish
        col = vec3(0.010) + env(R, C) * (0.03 + 0.97 * fres5) * 0.35;
    } else if (d > 2.215) {
        // Glass dish rim
        col = vec3(0.012) + env(R, C) * (0.04 + 0.96 * fres5) + u_ink_avg * 0.08;
    } else {
        vec4 Hs = texture2D(u_height, toUV(p.xz));
        float ferroMask = smoothstep(-0.0025, 0.0025, Hs.a - Hs.b);

        // Ferrofluid: black dielectric mirror (oil carrier, magnetite absorbs all transmitted light)
        float Ff = 0.045 + 0.955 * fres5;
        vec3 colF = env(R, C) * Ff + vec3(0.004);

        // Ink: translucent dyed water with refraction and Beer-Lambert absorption
        float Fi = 0.02 + 0.98 * fres5;
        vec3 rt = refract(rd, N, 1.0 / 1.33);
        float depth = max(Hs.b, 0.002);
        float cosT = max(-rt.y, 0.25);
        vec2 pb = p.xz + rt.xz / cosT * depth;
        vec2 uvb = toUV(pb);
        vec3 dye = texture2D(u_dye, uvb).rgb;
        vec3 logA = dye.r * log(max(u_ink1, vec3(0.003))) + dye.g * log(max(u_ink2, vec3(0.003))) + dye.b * log(max(u_ink3, vec3(0.003)));
        float path = depth * (1.0 / cosT + 1.0);
        vec3 trans = exp(logA * u_density * path / (2.0 * 0.32 * u_H));
        float ferroUnder = texture2D(u_height, uvb).g;
        float floorLight = 0.95 * (1.0 - 0.85 * ferroUnder);
        vec3 colI = vec3(floorLight) * trans * (1.0 - Fi) + env(R, C) * Fi;

        col = mix(colI, colF, ferroMask);
    }

    gl_FragColor = vec4(col, t);
}
`;

// Post: autofocus depth of field, chromatic aberration, vignette, ACES, grain
FerrofluidScene.FS_POST = `
precision highp float;
varying vec2 vUv;
uniform sampler2D u_color;
uniform vec2 u_res;
uniform float u_dof, u_time, u_focusDist;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float cocOf(float depth, float focus) {
    return clamp(abs(depth - focus) / max(depth, 0.01) * u_dof * 70.0, 0.0, 14.0);
}
void main() {
    vec4 c0 = texture2D(u_color, vUv);
    float focus = texture2D(u_color, vec2(0.5)).a;
    if (focus > 40.0) focus = u_focusDist;
    float coc = cocOf(c0.a, focus);
    vec3 acc = c0.rgb;
    float wsum = 1.0;
    if (coc > 0.6) {
        for (int i = 0; i < 28; i++) {
            float fi = float(i) + 0.5;
            float rr = sqrt(fi / 28.0) * coc;
            float a = fi * 2.39996323;
            vec2 off = vec2(cos(a), sin(a)) * rr / u_res;
            vec4 s = texture2D(u_color, vUv + off);
            float sc = cocOf(s.a, focus);
            float w = (s.a < c0.a) ? clamp(sc - rr + 1.0, 0.0, 1.0) : 1.0;
            acc += s.rgb * w;
            wsum += w;
        }
    }
    vec3 col = acc / wsum;

    // Lateral chromatic aberration toward the frame edge
    vec2 dc = vUv - 0.5;
    float ca = dot(dc, dc) * 0.006;
    col.r = mix(col.r, texture2D(u_color, vUv + dc * ca * 4.0).r, 0.5);
    col.b = mix(col.b, texture2D(u_color, vUv - dc * ca * 4.0).b, 0.5);

    float aspect = u_res.x / u_res.y;
    col *= mix(1.0, 0.55, smoothstep(0.35, 1.05, length(dc * vec2(aspect, 1.0))));

    col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
    col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
    col += (hash(vUv * u_res + fract(u_time) * 100.0) - 0.5) * 0.012;
    gl_FragColor = vec4(col, 1.0);
}
`;

window.FerrofluidScene = FerrofluidScene;
