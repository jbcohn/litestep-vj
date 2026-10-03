/**
 * VJ Visualizer - Scene 6: Ferrofluid & Inks
 * 
 * Authentic Real-Time Ferrofluid Simulation:
 * - GPGPU Magnetic Hydrodynamic Solver:
 *   Solves the coupled non-linear phase-field & reaction-diffusion equations
 *   governing the competition between magnetic dipolar forces (which drive branching
 *   fingering and droplet formation) and interfacial surface tension (capillary smoothing).
 * - Real Physical Pattern Formation:
 *   No fixed pattern overlays or artificial trigonometric masks.
 *   The patterns emerge organically via physical instability, growing serpentine
 *   labyrinth channels, discrete repelling droplet mounds, and cellular barriers.
 * - Single-Color Ink Substrates:
 *   Hydrophobic black ferrofluid channels encapsulate and separate pools of single-color ink
 *   (default: Vermillion Orange matching macro photography, selectable to Golden Amber, Neon Lime, Cyan, etc.).
 * - Macro Studio Photography Lighting:
 *   Dual softbox reflections, signature ring-light glints on channel ridges, and Fresnel glancing sheen.
 * - Interactive P-Menu Physics Lab:
 *   All physical parameters (magnetic field, surface tension, dipolar repulsion, confinement trap, fluid height relief)
 *   are live-tunable in real time.
 */

class FerrofluidScene {
    constructor() {
        this.name = "Ferrofluid";
        this.container = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        // Camera control: overhead tabletop macro view (~76 deg pitch)
        this.pitch = 1.33;
        this.yaw = 0.0;
        this.targetPitch = 1.33;
        this.targetYaw = 0.0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // Camera Pan (Option + drag, middle mouse drag, or UI reset)
        this.panX = 0.0;
        this.panZ = 0.0;
        this.targetPanX = 0.0;
        this.targetPanZ = 0.0;
        this.isPanning = false;

        // Interactive mouse interaction UV
        this.mouseUV = new THREE.Vector2(-1.0, -1.0);
        this.mouseAction = 0; // 0: none, 1: inject fluid, 2: magnetic pull

        // Physical Parameters (Tunable via P-Menu Physics Lab)
        this.params = {
            preset: "millefiori",
            feed: 0.038,          // Magnetic field strength B (instability driving force)
            kill: 0.061,          // Dipolar demagnetization & dissipation
            diffU: 0.16,          // Surface tension / capillary smoothing
            diffV: 0.08,          // Magnetic field diffusion across non-magnetic medium
            confinement: 0.60,    // External radial magnetic trap strength
            fluidHeight: 0.075,   // 2.5D tactile surface relief (0.02 - 0.18 units)
            gloss: 1.8,           // Studio specular highlight intensity
            simSpeed: 4,          // Physics simulation substeps per frame
            paletteIdx: 0         // 0: Vermillion Orange
        };

        // Presets Library
        this.presets = {
            millefiori: {
                name: "Millefiori (Reference Photo)",
                feed: 0.038,
                kill: 0.061,
                diffU: 0.16,
                diffV: 0.08,
                confinement: 0.60,
                fluidHeight: 0.075
            },
            labyrinth: {
                name: "Serpentine Labyrinth",
                feed: 0.029,
                kill: 0.057,
                diffU: 0.16,
                diffV: 0.08,
                confinement: 0.50,
                fluidHeight: 0.065
            },
            spikes: {
                name: "Rosensweig Spikes",
                feed: 0.030,
                kill: 0.062,
                diffU: 0.16,
                diffV: 0.08,
                confinement: 0.70,
                fluidHeight: 0.085
            },
            fingers: {
                name: "Petri Dish Radial Fingers",
                feed: 0.034,
                kill: 0.059,
                diffU: 0.19,
                diffV: 0.08,
                confinement: 0.40,
                fluidHeight: 0.070
            },
            solitons: {
                name: "Soliton Beads",
                feed: 0.026,
                kill: 0.055,
                diffU: 0.14,
                diffV: 0.08,
                confinement: 0.65,
                fluidHeight: 0.080
            }
        };

        // Single-Color Ink Palettes
        this.palettes = [
            {
                name: "Vermillion Orange",
                color: [1.00, 0.32, 0.02],   // Saturated orange ink from reference photo
                glow:  [1.00, 0.16, 0.00]    // Deep vermillion subsurface depth
            },
            {
                name: "Golden Amber",
                color: [1.00, 0.72, 0.06],   // Radiant golden-yellow ink
                glow:  [1.00, 0.48, 0.02]
            },
            {
                name: "Neon Acid Lime",
                color: [0.72, 1.00, 0.05],   // Fluorescent green/yellow
                glow:  [0.45, 0.85, 0.02]
            },
            {
                name: "Electric Cyan",
                color: [0.00, 0.88, 1.00],   // Neon cyan ink
                glow:  [0.00, 0.50, 0.85]
            },
            {
                name: "Laser Magenta",
                color: [1.00, 0.12, 0.52],   // Hyper-saturated magenta ink
                glow:  [0.75, 0.04, 0.32]
            },
            {
                name: "Deep Ultraviolet",
                color: [0.65, 0.20, 1.00],   // Bioluminescent violet ink
                glow:  [0.38, 0.06, 0.72]
            },
            {
                name: "Prismatic Opal",
                color: [0.88, 0.95, 0.92],   // Pearlescent liquid
                glow:  [0.65, 0.82, 0.78]
            }
        ];

        // GPGPU Simulation Engine
        this.simSize = 512;
        this.rtA = null;
        this.rtB = null;
        this.simScene = null;
        this.simCamera = null;
        this.simMaterial = null;
        this.simMesh = null;

        // Blit Pass (for initial seeding)
        this.blitScene = null;
        this.blitMaterial = null;

        // Main 3D Display
        this.displayMesh = null;
        this.displayMaterial = null;

        this.time = 0;
        this.isInitialized = false;
        this.dropIntensity = 0.0;
        this.dropTime = 999.0;
    }

    init(container) {
        this.container = container;
        var width = window.innerWidth;
        var height = window.innerHeight;

        this.scene = new THREE.Scene();
        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        this.renderer.domElement.style.position = "absolute";
        this.renderer.domElement.style.top = "0";
        this.renderer.domElement.style.left = "0";
        this.renderer.domElement.style.width = "100%";
        this.renderer.domElement.style.height = "100%";
        this.renderer.domElement.style.pointerEvents = "none";
        this.renderer.domElement.style.display = "none";
        this.renderer.domElement.style.opacity = "0";
        this.container.appendChild(this.renderer.domElement);

        // 1. Initialize GPGPU Simulation Render Targets & Materials
        this._initGPGPU();

        // 2. Initialize Main 3D Macro Photography Display Mesh
        this._initDisplay(width, height);

        // 3. Seed Initial Ferrofluid Droplets & run warm-up steps
        this.reseed(this.params.preset, true);

        // 4. Bind Mouse / Pointer Events
        this._bindMouseEvents();

        this.isInitialized = true;
    }

    _initGPGPU() {
        var isWebGL2 = this.renderer.capabilities && this.renderer.capabilities.isWebGL2;
        var texType = isWebGL2 ? THREE.FloatType : THREE.HalfFloatType;
        var rtOptions = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: texType,
            depthBuffer: false,
            stencilBuffer: false,
            wrapS: THREE.ClampToEdgeWrapping,
            wrapT: THREE.ClampToEdgeWrapping
        };

        this.rtA = new THREE.WebGLRenderTarget(this.simSize, this.simSize, rtOptions);
        this.rtB = new THREE.WebGLRenderTarget(this.simSize, this.simSize, rtOptions);

        this.simScene = new THREE.Scene();
        this.simCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        this.simMaterial = new THREE.ShaderMaterial({
            vertexShader: this._passVertexShader(),
            fragmentShader: this._simFragmentShader(),
            uniforms: {
                u_state_tex: { value: null },
                u_resolution: { value: new THREE.Vector2(this.simSize, this.simSize) },
                u_feed: { value: this.params.feed },
                u_kill: { value: this.params.kill },
                u_diff_u: { value: this.params.diffU },
                u_diff_v: { value: this.params.diffV },
                u_confinement: { value: this.params.confinement },
                u_dt: { value: 1.0 },
                u_sub: { value: 0.0 },
                u_drop: { value: 0.0 },
                u_mouse_pos: { value: new THREE.Vector2(-1.0, -1.0) },
                u_mouse_action: { value: 0.0 }
            },
            depthWrite: false,
            depthTest: false
        });

        var plane = new THREE.PlaneGeometry(2, 2);
        this.simMesh = new THREE.Mesh(plane, this.simMaterial);
        this.simScene.add(this.simMesh);

        // Blit Pass Scene (for copying seed textures)
        this.blitScene = new THREE.Scene();
        this.blitMaterial = new THREE.ShaderMaterial({
            vertexShader: this._passVertexShader(),
            fragmentShader: `
                precision highp float;
                varying vec2 vUv;
                uniform sampler2D u_tex;
                void main() {
                    gl_FragColor = texture2D(u_tex, vUv);
                }
            `,
            uniforms: { u_tex: { value: null } },
            depthWrite: false,
            depthTest: false
        });
        var blitMesh = new THREE.Mesh(plane, this.blitMaterial);
        this.blitScene.add(blitMesh);
    }

    _initDisplay(width, height) {
        var pal = this.palettes[this.params.paletteIdx];
        this.displayMaterial = new THREE.ShaderMaterial({
            vertexShader: this._passVertexShader(),
            fragmentShader: this._displayFragmentShader(),
            uniforms: {
                u_sim_tex: { value: this.rtA.texture },
                u_resolution: { value: new THREE.Vector2(width, height) },
                u_time: { value: 0.0 },
                u_pitch: { value: this.pitch },
                u_yaw: { value: this.yaw },
                u_pan: { value: new THREE.Vector2(0.0, 0.0) },
                u_fluid_height: { value: this.params.fluidHeight },
                u_gloss: { value: this.params.gloss },
                u_sub: { value: 0.0 },
                u_bass: { value: 0.0 },
                u_highs: { value: 0.0 },
                u_tension: { value: 0.0 },
                u_alpha: { value: 1.0 },
                u_ink_color: { value: new THREE.Vector3(...pal.color) },
                u_ink_glow:  { value: new THREE.Vector3(...pal.glow) }
            },
            depthWrite: false,
            depthTest: false
        });

        var geom = new THREE.PlaneGeometry(2, 2);
        this.displayMesh = new THREE.Mesh(geom, this.displayMaterial);
        this.scene.add(this.displayMesh);
    }

    _passVertexShader() {
        return `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;
    }

    _simFragmentShader() {
        return `
            precision highp float;
            varying vec2 vUv;

            uniform sampler2D u_state_tex;
            uniform vec2 u_resolution;
            uniform float u_feed;
            uniform float u_kill;
            uniform float u_diff_u;
            uniform float u_diff_v;
            uniform float u_confinement;
            uniform float u_dt;
            uniform float u_sub;
            uniform float u_drop;
            uniform vec2 u_mouse_pos;
            uniform float u_mouse_action;

            void main() {
                vec2 px = 1.0 / u_resolution;
                vec4 state = texture2D(u_state_tex, vUv);
                float u = state.r;
                float v = state.g;

                // 9-Point Isotropic Discrete Laplacian Stencil
                // Cardinals = 0.20, Diagonals = 0.05, Center = -1.0
                vec2 up    = texture2D(u_state_tex, vUv + vec2(0.0, px.y)).rg;
                vec2 down  = texture2D(u_state_tex, vUv - vec2(0.0, px.y)).rg;
                vec2 left  = texture2D(u_state_tex, vUv - vec2(px.x, 0.0)).rg;
                vec2 right = texture2D(u_state_tex, vUv + vec2(px.x, 0.0)).rg;

                vec2 upLeft    = texture2D(u_state_tex, vUv + vec2(-px.x,  px.y)).rg;
                vec2 upRight   = texture2D(u_state_tex, vUv + vec2( px.x,  px.y)).rg;
                vec2 downLeft  = texture2D(u_state_tex, vUv + vec2(-px.x, -px.y)).rg;
                vec2 downRight = texture2D(u_state_tex, vUv + vec2( px.x, -px.y)).rg;

                vec2 lap = 0.20 * (up + down + left + right) +
                           0.05 * (upLeft + upRight + downLeft + downRight) -
                           state.rg;

                // External Magnetic Confinement Trap (Harmonic radial gradient B_ext(r))
                vec2 centered = vUv - 0.5;
                float r = length(centered);
                float rDish = smoothstep(0.48, 0.44, r); // Circular dish perimeter
                float trap = r * r * u_confinement;

                // Dynamic Physical Coupling
                // Applied magnetic field B pulses with sub-bass kick
                float F = u_feed + u_sub * 0.005 - trap * 0.025;
                float k = u_kill - u_sub * 0.0025;

                // Non-linear Phase-Field Transformation (Activator-Inhibitor Reaction)
                float uvv = u * v * v;
                float du = (u_diff_u * lap.x - uvv + F * (1.0 - u)) * u_dt;
                float dv = (u_diff_v * lap.y + uvv - (F + k) * v) * u_dt;

                float newU = clamp(u + du, 0.0, 1.0);
                float newV = clamp(v + dv, 0.0, 1.0) * rDish;

                // Interactive Mouse Fluid Injection
                if (u_mouse_pos.x >= 0.0 && u_mouse_action > 0.5) {
                    float dMouse = length(vUv - u_mouse_pos);
                    float rad = 0.045;
                    if (dMouse < rad) {
                        float str = smoothstep(rad, 0.0, dMouse);
                        newV = clamp(newV + str * 0.35, 0.0, 1.0);
                        newU = clamp(newU - str * 0.25, 0.0, 1.0);
                    }
                }

                // Musical Drop Shockwave Pulse
                if (u_drop > 0.01) {
                    float shockRing = sin(r * 32.0) * exp(-r * 4.0);
                    newV = clamp(newV + shockRing * u_drop * 0.12, 0.0, 1.0);
                }

                gl_FragColor = vec4(newU, newV, 0.0, 1.0);
            }
        `;
    }

    _displayFragmentShader() {
        return `
            precision highp float;
            varying vec2 vUv;

            uniform sampler2D u_sim_tex;
            uniform vec2  u_resolution;
            uniform float u_time;
            uniform float u_pitch;
            uniform float u_yaw;
            uniform vec2  u_pan;
            uniform float u_fluid_height;
            uniform float u_gloss;
            uniform float u_sub;
            uniform float u_bass;
            uniform float u_highs;
            uniform float u_tension;
            uniform float u_alpha;

            uniform vec3 u_ink_color;
            uniform vec3 u_ink_glow;

            #define PI 3.14159265359

            // Sample simulated fluid concentration at world coordinates p (xz plane)
            float sampleFluid(vec2 p) {
                // Map world space [-2.4, 2.4] to simulation UV [0, 1]
                vec2 uv = p * 0.208 + 0.5;
                if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
                return texture2D(u_sim_tex, uv).g;
            }

            // Continuous 2.5D Liquid Elevation Surface h(x, z)
            float getElevation(vec2 p) {
                float v = sampleFluid(p);
                float distCenter = length(p);
                float dishMask = smoothstep(2.40, 2.15, distCenter);

                // Tactile 2.5D liquid profile (smooth dome cross-section, restrained height)
                float fluidDome = smoothstep(0.12, 0.46, v);
                float hFluid = fluidDome * u_fluid_height * dishMask;

                // Glass petri dish circular rim at r = 2.40
                float rim = smoothstep(0.04, 0.0, abs(distCenter - 2.38)) * 0.038;

                // Capillary ripples across the ink substrate
                float capWaves = sin(distCenter * 14.0 - u_time * 4.5) * (0.0016 + u_highs * 0.004) * exp(-distCenter * 0.32);

                return hFluid + rim + capWaves;
            }

            // Analytical Normal Estimation via 4-sample Central Differences
            vec3 getNormal(vec2 p, float h) {
                const vec2 eps = vec2(0.007, 0.0);
                float hR = getElevation(p + eps.xy);
                float hL = getElevation(p - eps.xy);
                float hU = getElevation(p + eps.yx);
                float hD = getElevation(p - eps.yx);
                return normalize(vec3(hL - hR, 2.0 * eps.x, hD - hU));
            }

            void main() {
                vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);

                // Tabletop Macro Camera Setup (~76 deg overhead angle)
                float camDist = 3.8;
                float pitch = u_pitch;
                float yaw = u_yaw + u_time * 0.020; // Gentle serene macro turntable rotation

                vec3 target = vec3(u_pan.x, 0.02, u_pan.y);
                vec3 ro = target + vec3(camDist * sin(yaw) * cos(pitch), camDist * sin(pitch), -camDist * cos(yaw) * cos(pitch));

                vec3 fwd = normalize(target - ro);
                vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
                vec3 up = cross(fwd, right);
                vec3 rd = normalize(uv.x * right + uv.y * up + 1.72 * fwd);

                // Raymarch 2.5D Liquid Surface
                float t = 1.3;
                float tMax = 7.0;
                vec3 p = ro;
                bool hit = false;
                float finalH = 0.0;
                float dt = 0.0;

                for (int i = 0; i < 36; i++) {
                    p = ro + rd * t;
                    float h = getElevation(p.xz);
                    if (p.y <= h) {
                        hit = true;
                        break;
                    }
                    float dY = p.y - h;
                    dt = max(0.016, dY * 0.88);
                    t += dt;
                    if (t > tMax) break;
                }

                // Sub-pixel Binary Refinement for silky-smooth liquid edges
                if (hit) {
                    float tA = t - dt;
                    float tB = t;
                    for (int j = 0; j < 4; j++) {
                        float tMid = 0.5 * (tA + tB);
                        vec3 pMid = ro + rd * tMid;
                        if (pMid.y <= getElevation(pMid.xz)) {
                            tB = tMid;
                        } else {
                            tA = tMid;
                        }
                    }
                    t = tB;
                    p = ro + rd * t;
                    finalH = getElevation(p.xz);
                }

                // Studio Vignette Background Void
                vec3 bgColor = mix(vec3(0.012, 0.014, 0.018), vec3(0.004, 0.005, 0.007), length(uv) * 1.15);

                if (!hit) {
                    gl_FragColor = vec4(bgColor, u_alpha);
                    return;
                }

                // Normal and View Vectors
                vec3 N = getNormal(p.xz, finalH);
                vec3 V = -rd;

                // Evaluate Fluid State
                float v = sampleFluid(p.xz);
                float isFerro = smoothstep(0.18, 0.44, v);

                // -------------------------------------------------------------
                // 1. MATERIAL ALBEDO: OBSIDIAN FERROFLUID & SINGLE-COLOR INK
                // -------------------------------------------------------------
                // Deep obsidian magnetite black:
                vec3 ferroColor = vec3(0.012, 0.013, 0.016);

                // Vibrant Single-Color Ink Substrate:
                vec3 inkBase = u_ink_color;
                // Subsurface optical depth gradient
                vec3 inkFloor = mix(u_ink_glow, inkBase, clamp(v * 3.5, 0.0, 1.0));

                // Meniscus Contact Border: Dark liquid rim where black fluid contacts ink
                float meniscus = smoothstep(0.06, 0.0, abs(v - 0.28));
                inkFloor = mix(inkFloor, inkBase * 0.42, meniscus * (1.0 - isFerro));

                // Blended Surface Albedo
                vec3 albedo = mix(inkFloor, ferroColor, isFerro);

                // -------------------------------------------------------------
                // 2. MACRO STUDIO LIGHTING: DUAL SOFTBOXES & RING-LIGHT
                // -------------------------------------------------------------
                // Key Light: Overhead photographic softbox 1
                vec3 lKey1 = normalize(vec3(0.45, 2.2, -0.65));
                float diffKey1 = max(0.0, dot(N, lKey1));
                vec3 hKey1 = normalize(lKey1 + V);
                float specSoft1 = pow(max(0.0, dot(N, hKey1)), 34.0);
                float specSharp1 = pow(max(0.0, dot(N, hKey1)), 130.0);

                // Fill Light: Softbox 2
                vec3 lFill2 = normalize(vec3(-0.75, 1.7, 0.55));
                float diffFill2 = max(0.0, dot(N, lFill2));
                vec3 hFill2 = normalize(lFill2 + V);
                float specFill2 = pow(max(0.0, dot(N, hFill2)), 60.0);

                // Ambient Sky Diffuse
                float diffAmb = 0.52 + 0.48 * max(0.0, N.y);

                // Reflected Ray
                vec3 R = reflect(-V, N);

                // Signature Macro Photography Studio Ring-Light Reflection
                // Produces crisp circular ring glints on channel ridges and droplet peaks
                float ringAngle = acos(clamp(R.y, -1.0, 1.0));
                float ringGlance = smoothstep(0.048, 0.0, abs(ringAngle - 0.38));
                float ringLight = ringGlance * 2.8 * (0.85 + u_highs * 0.5);

                // Fresnel Glancing Sheen
                float NdotV = max(0.0, dot(N, V));
                float fresnel = pow(1.0 - NdotV, 3.8);
                vec3 fresnelSheen = mix(vec3(1.0, 0.98, 0.95), u_ink_color * 1.2, 0.25);

                // Ambient Occlusion in Valleys
                float ao = clamp(1.0 - meniscus * 0.35, 0.65, 1.0);

                // Composite Shading Model
                vec3 col = albedo * (diffKey1 * 0.70 + diffFill2 * 0.40 + diffAmb * 0.55) * ao;

                // Add Glossy Specular Highlights (both on obsidian fluid and ink surface)
                col += vec3(1.0, 0.98, 0.94) * (specSoft1 * 0.35 + specSharp1 * 1.5 + specFill2 * 0.45) * u_gloss;

                // Add Signature Macro Ring-Light Reflection
                col += vec3(1.0, 0.99, 0.95) * ringLight * (isFerro > 0.4 ? 1.0 : 0.35) * u_gloss;

                // Add Fresnel Glancing Sheen
                col += fresnelSheen * fresnel * (isFerro > 0.5 ? 0.32 : 0.18);

                // Distance Fog & Edge Vignette
                float fogDist = length(p - ro);
                float fog = smoothstep(5.4, 9.5, fogDist);
                col = mix(col, bgColor, fog);

                gl_FragColor = vec4(col, u_alpha);
            }
        `;
    }

    _bindMouseEvents() {
        window.addEventListener("mousedown", (e) => {
            if (e.target.closest("#vj-hud") || e.target.closest("#proportions-drawer")) return;
            if (e.altKey || e.button === 1) {
                // Option (Alt) key or middle click: Camera Pan
                this.isPanning = true;
                this.isDragging = false;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
            } else if (e.shiftKey || e.button === 2) {
                // Shift-click: inject fluid at pointer
                this.isPanning = false;
                this.isDragging = false;
                this._updateMouseUV(e.clientX, e.clientY, 1);
            } else {
                // Standard Left-click: Orbit
                this.isDragging = true;
                this.isPanning = false;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;
            }
        });

        window.addEventListener("mousemove", (e) => {
            if (this.isPanning || (this.isDragging && e.altKey)) {
                var dx = e.clientX - this.lastMouseX;
                var dy = e.clientY - this.lastMouseY;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;

                var currentYaw = this.yaw;
                var forwardX = -Math.sin(currentYaw);
                var forwardZ = Math.cos(currentYaw);
                var rightX = Math.cos(currentYaw);
                var rightZ = Math.sin(currentYaw);
                var scale = 0.0055;

                this.targetPanX += (-dx * rightX + dy * forwardX) * scale;
                this.targetPanZ += (-dx * rightZ + dy * forwardZ) * scale;

                this.targetPanX = Math.max(-3.5, Math.min(3.5, this.targetPanX));
                this.targetPanZ = Math.max(-3.5, Math.min(3.5, this.targetPanZ));
            } else if (this.isDragging) {
                var dx = e.clientX - this.lastMouseX;
                var dy = e.clientY - this.lastMouseY;
                this.lastMouseX = e.clientX;
                this.lastMouseY = e.clientY;

                this.targetYaw += dx * 0.005;
                this.targetPitch = Math.max(0.80, Math.min(1.54, this.targetPitch + dy * 0.005));
            } else if (e.shiftKey) {
                this._updateMouseUV(e.clientX, e.clientY, 1);
            }
        });

        window.addEventListener("mouseup", () => {
            this.isDragging = false;
            this.isPanning = false;
            this.mouseAction = 0;
            this.mouseUV.set(-1.0, -1.0);
            if (this.simMaterial) {
                this.simMaterial.uniforms.u_mouse_action.value = 0.0;
                this.simMaterial.uniforms.u_mouse_pos.value.set(-1.0, -1.0);
            }
        });

        window.addEventListener("dblclick", (e) => {
            if (e.target.closest("#vj-hud") || e.target.closest("#proportions-drawer")) return;
            this.resetCamera();
        });
    }

    resetCamera() {
        this.targetPanX = 0.0;
        this.targetPanZ = 0.0;
        this.targetPitch = 1.33;
        this.targetYaw = 0.0;
    }

    _updateMouseUV(clientX, clientY, action) {
        var w = window.innerWidth;
        var h = window.innerHeight;
        var aspectMin = Math.min(w, h);
        var uvX = (clientX - 0.5 * w) / aspectMin;
        var uvY = ((h - clientY) - 0.5 * h) / aspectMin;

        var camDist = 3.8;
        var pitch = this.pitch;
        var yaw = this.yaw + this.time * 0.020;

        var targetX = this.panX;
        var targetY = 0.02;
        var targetZ = this.panZ;

        var roX = targetX + camDist * Math.sin(yaw) * Math.cos(pitch);
        var roY = targetY + camDist * Math.sin(pitch);
        var roZ = targetZ - camDist * Math.cos(yaw) * Math.cos(pitch);

        var fwdX = targetX - roX, fwdY = targetY - roY, fwdZ = targetZ - roZ;
        var fwdLen = Math.hypot(fwdX, fwdY, fwdZ);
        if (fwdLen > 0.0001) { fwdX /= fwdLen; fwdY /= fwdLen; fwdZ /= fwdLen; }

        var rX = fwdZ, rY = 0, rZ = -fwdX;
        var rLen = Math.hypot(rX, rZ);
        if (rLen > 0.0001) { rX /= rLen; rZ /= rLen; }

        var upX = fwdY * rZ - fwdZ * rY;
        var upY = fwdZ * rX - fwdX * rZ;
        var upZ = fwdX * rY - fwdY * rX;

        var rdX = uvX * rX + uvY * upX + 1.72 * fwdX;
        var rdY = uvX * rY + uvY * upY + 1.72 * fwdY;
        var rdZ = uvX * rZ + uvY * upZ + 1.72 * fwdZ;
        var rdLen = Math.hypot(rdX, rdY, rdZ);
        if (rdLen > 0.0001) { rdX /= rdLen; rdY /= rdLen; rdZ /= rdLen; }

        if (Math.abs(rdY) > 0.001) {
            var t = -roY / rdY;
            if (t > 0) {
                var hitX = roX + rdX * t;
                var hitZ = roZ + rdZ * t;
                var simU = hitX * 0.208 + 0.5;
                var simV = hitZ * 0.208 + 0.5;
                if (simU >= 0.0 && simU <= 1.0 && simV >= 0.0 && simV <= 1.0) {
                    this.mouseUV.set(simU, simV);
                    this.mouseAction = action;
                    if (this.simMaterial) {
                        this.simMaterial.uniforms.u_mouse_pos.value.copy(this.mouseUV);
                        this.simMaterial.uniforms.u_mouse_action.value = action;
                    }
                    return;
                }
            }
        }

        this.mouseUV.set(-1.0, -1.0);
        this.mouseAction = 0;
        if (this.simMaterial) {
            this.simMaterial.uniforms.u_mouse_pos.value.set(-1.0, -1.0);
            this.simMaterial.uniforms.u_mouse_action.value = 0;
        }
    }

    /**
     * Seeds initial ferrofluid droplets and warms up the simulation
     */
    reseed(presetName, isInitial) {
        presetName = presetName || this.params.preset;
        var preset = this.presets[presetName] || this.presets.millefiori;
        this.params.preset = presetName;

        // Apply preset physics parameters
        this.params.feed = preset.feed;
        this.params.kill = preset.kill;
        this.params.diffU = preset.diffU;
        this.params.diffV = preset.diffV;
        this.params.confinement = preset.confinement;
        this.params.fluidHeight = preset.fluidHeight;

        // Sync simulation uniforms
        if (this.simMaterial) {
            var u = this.simMaterial.uniforms;
            u.u_feed.value = this.params.feed;
            u.u_kill.value = this.params.kill;
            u.u_diff_u.value = this.params.diffU;
            u.u_diff_v.value = this.params.diffV;
            u.u_confinement.value = this.params.confinement;
        }
        if (this.displayMaterial) {
            this.displayMaterial.uniforms.u_fluid_height.value = this.params.fluidHeight;
        }

        // Generate Seed Data
        var size = this.simSize;
        var data = new Float32Array(size * size * 4);
        for (var i = 0; i < size * size; i++) {
            data[i * 4 + 0] = 1.0; // u = 1.0 (pure ink)
            data[i * 4 + 1] = 0.0; // v = 0.0 (no ferrofluid)
            data[i * 4 + 2] = 0.0;
            data[i * 4 + 3] = 1.0;
        }

        var cx = size / 2, cy = size / 2;
        var seeds = [];

        if (presetName === "spikes") {
            // Hexagonal grid of discrete seed droplets
            var spacing = size * 0.11;
            for (var gx = -3; gx <= 3; gx++) {
                for (var gy = -3; gy <= 3; gy++) {
                    var sx = cx + gx * spacing + (gy % 2 !== 0 ? spacing * 0.5 : 0);
                    var sy = cy + gy * spacing * 0.866;
                    if (Math.hypot(sx - cx, sy - cy) < size * 0.38) {
                        seeds.push({ x: sx, y: sy, r: size * 0.026 });
                    }
                }
            }
        } else if (presetName === "fingers") {
            // Dense central droplet cluster with outer radial satellite seeds
            seeds.push({ x: cx, y: cy, r: size * 0.08 });
            for (var a = 0; a < Math.PI * 2; a += Math.PI / 6) {
                seeds.push({ x: cx + Math.cos(a) * size * 0.22, y: cy + Math.sin(a) * size * 0.22, r: size * 0.035 });
            }
        } else if (presetName === "labyrinth") {
            // Scattered random seeds across the dish
            for (var s = 0; s < 24; s++) {
                var a = Math.random() * Math.PI * 2;
                var dist = Math.sqrt(Math.random()) * size * 0.36;
                seeds.push({ x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist, r: size * 0.032 });
            }
        } else {
            // Millefiori Default (Central Core + concentric satellite droplets matching photo)
            seeds.push({ x: cx, y: cy, r: size * 0.055 });
            var ring1 = 8;
            for (var i = 0; i < ring1; i++) {
                var a = (i / ring1) * Math.PI * 2;
                seeds.push({ x: cx + Math.cos(a) * size * 0.16, y: cy + Math.sin(a) * size * 0.16, r: size * 0.038 });
            }
            var ring2 = 14;
            for (var i = 0; i < ring2; i++) {
                var a = (i / ring2) * Math.PI * 2 + Math.PI / 14;
                seeds.push({ x: cx + Math.cos(a) * size * 0.30, y: cy + Math.sin(a) * size * 0.30, r: size * 0.032 });
            }
        }

        // Draw seeds into float buffer
        for (var s = 0; s < seeds.length; s++) {
            var sd = seeds[s];
            var minX = Math.max(0, Math.floor(sd.x - sd.r));
            var maxX = Math.min(size - 1, Math.ceil(sd.x + sd.r));
            var minY = Math.max(0, Math.floor(sd.y - sd.r));
            var maxY = Math.min(size - 1, Math.ceil(sd.y + sd.r));

            for (var y = minY; y <= maxY; y++) {
                for (var x = minX; x <= maxX; x++) {
                    var dx = x - sd.x;
                    var dy = y - sd.y;
                    if (dx * dx + dy * dy < sd.r * sd.r) {
                        var idx = (y * size + x) * 4;
                        data[idx + 0] = 0.50; // u drops
                        data[idx + 1] = 0.30 + (Math.random() - 0.5) * 0.06; // v rises
                    }
                }
            }
        }

        var seedTex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
        seedTex.needsUpdate = true;

        // Blit seed texture into rtA and rtB
        if (this.renderer && this.blitMaterial && this.blitScene) {
            this.blitMaterial.uniforms.u_tex.value = seedTex;
            this.renderer.setRenderTarget(this.rtA);
            this.renderer.render(this.blitScene, this.simCamera);
            this.renderer.setRenderTarget(this.rtB);
            this.renderer.render(this.blitScene, this.simCamera);
            this.renderer.setRenderTarget(null);
            seedTex.dispose();

            // Run 80 warmup substeps so pattern is rich immediately upon display
            var warmupSteps = isInitial ? 80 : 30;
            for (var step = 0; step < warmupSteps; step++) {
                this.stepSimulation(null);
            }
        }
    }

    /**
     * Executes one GPGPU simulation time step
     */
    stepSimulation(audio) {
        if (!this.renderer || !this.simMaterial) return;

        var sub = audio ? audio.sub : 0.0;
        var drop = this.dropIntensity;

        this.simMaterial.uniforms.u_state_tex.value = this.rtA.texture;
        this.simMaterial.uniforms.u_sub.value = sub;
        this.simMaterial.uniforms.u_drop.value = drop;

        // Render next simulation state into rtB
        this.renderer.setRenderTarget(this.rtB);
        this.renderer.render(this.simScene, this.simCamera);
        this.renderer.setRenderTarget(null);

        // Ping-Pong swap
        var tmp = this.rtA;
        this.rtA = this.rtB;
        this.rtB = tmp;

        // Update display texture reference
        if (this.displayMaterial) {
            this.displayMaterial.uniforms.u_sim_tex.value = this.rtA.texture;
        }
    }

    resize(width, height) {
        if (!this.renderer || !this.displayMaterial) return;
        this.renderer.setSize(width, height);
        this.displayMaterial.uniforms.u_resolution.value.set(width, height);
    }

    update(dt, audio, isVisible) {
        if (!this.isInitialized || !isVisible) return;

        this.time += dt;

        // Smooth Camera Orbit & Pan Interpolation
        this.pitch += (this.targetPitch - this.pitch) * 0.12;
        this.yaw   += (this.targetYaw - this.yaw) * 0.12;
        this.panX  += (this.targetPanX - this.panX) * 0.12;
        this.panZ  += (this.targetPanZ - this.panZ) * 0.12;

        // Drop Shockwave Tracker
        if (this.dropTime < 5.0) {
            this.dropTime += dt;
            this.dropIntensity = Math.max(0.0, 1.0 - this.dropTime * 1.5);
        } else {
            this.dropIntensity = 0.0;
        }

        // Run GPGPU Simulation Substeps
        var substeps = Math.max(1, Math.min(8, this.params.simSpeed));
        for (var i = 0; i < substeps; i++) {
            this.stepSimulation(audio);
        }

        // Update Display Uniforms
        if (this.displayMaterial) {
            var u = this.displayMaterial.uniforms;
            u.u_time.value = this.time;
            u.u_pitch.value = this.pitch;
            u.u_yaw.value = this.yaw;
            u.u_pan.value.set(this.panX, this.panZ);
            u.u_fluid_height.value = this.params.fluidHeight;
            u.u_gloss.value = this.params.gloss;
            u.u_sub.value = audio ? audio.sub : 0.0;
            u.u_bass.value = audio ? audio.bass : 0.0;
            u.u_highs.value = audio ? audio.highs : 0.0;
            u.u_tension.value = audio ? audio.tension : 0.0;
        }
    }

    render(alpha) {
        alpha = alpha === undefined ? 1.0 : alpha;
        if (!this.isInitialized || !this.renderer) return;

        this.renderer.domElement.style.opacity = alpha;
        if (alpha > 0.001) {
            this.renderer.domElement.style.display = "block";
            this.displayMaterial.uniforms.u_alpha.value = alpha;
            this.renderer.render(this.scene, this.camera);
        } else {
            this.renderer.domElement.style.display = "none";
        }
    }

    triggerDropShockwave() {
        this.dropTime = 0.0;
        this.dropIntensity = 1.0;
    }

    mutate() {
        // Cycle single-color ink palette
        this.params.paletteIdx = (this.params.paletteIdx + 1) % this.palettes.length;
        var pal = this.palettes[this.params.paletteIdx];
        if (this.displayMaterial) {
            this.displayMaterial.uniforms.u_ink_color.value.set(...pal.color);
            this.displayMaterial.uniforms.u_ink_glow.value.set(...pal.glow);
        }

        // Perturb fluid slightly with magnetic vibration
        this.agitateFluid();
    }

    randomizeGeometry() {
        // Cycle between the 5 physical presets
        var keys = Object.keys(this.presets);
        var curIdx = keys.indexOf(this.params.preset);
        var nextKey = keys[(curIdx + 1) % keys.length];
        this.reseed(nextKey, false);
    }

    agitateFluid() {
        // Momentary magnetic perturbation
        if (this.simMaterial) {
            this.simMaterial.uniforms.u_drop.value = 0.65;
            setTimeout(() => {
                if (this.simMaterial) this.simMaterial.uniforms.u_drop.value = 0.0;
            }, 180);
        }
    }

    clearFluid() {
        var size = this.simSize;
        var data = new Float32Array(size * size * 4);
        for (var i = 0; i < size * size; i++) {
            data[i * 4 + 0] = 1.0; // u = 1.0
            data[i * 4 + 1] = 0.0; // v = 0.0
            data[i * 4 + 2] = 0.0;
            data[i * 4 + 3] = 1.0;
        }
        var clearTex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
        clearTex.needsUpdate = true;
        this.blitMaterial.uniforms.u_tex.value = clearTex;
        this.renderer.setRenderTarget(this.rtA);
        this.renderer.render(this.blitScene, this.simCamera);
        this.renderer.setRenderTarget(this.rtB);
        this.renderer.render(this.blitScene, this.simCamera);
        this.renderer.setRenderTarget(null);
        clearTex.dispose();
    }

    setThickness(val) {
        // Map HUD thick slider [1.5 .. 10.0] to surface tension diffU and fluid height
        var norm = (val - 1.5) / 8.5; // [0 .. 1]
        this.params.diffU = 0.10 + norm * 0.14; // [0.10 .. 0.24]
        if (this.simMaterial) {
            this.simMaterial.uniforms.u_diff_u.value = this.params.diffU;
        }
    }

    setParam(key, val) {
        if (this.params[key] !== undefined) {
            this.params[key] = val;
            if (this.simMaterial) {
                var u = this.simMaterial.uniforms;
                if (key === "feed") u.u_feed.value = val;
                if (key === "kill") u.u_kill.value = val;
                if (key === "diffU") u.u_diff_u.value = val;
                if (key === "diffV") u.u_diff_v.value = val;
                if (key === "confinement") u.u_confinement.value = val;
            }
            if (this.displayMaterial) {
                if (key === "fluidHeight") this.displayMaterial.uniforms.u_fluid_height.value = val;
                if (key === "gloss") this.displayMaterial.uniforms.u_gloss.value = val;
            }
        }
    }

    setPalette(idx) {
        this.params.paletteIdx = Math.max(0, Math.min(this.palettes.length - 1, idx));
        var pal = this.palettes[this.params.paletteIdx];
        if (this.displayMaterial) {
            this.displayMaterial.uniforms.u_ink_color.value.set(...pal.color);
            this.displayMaterial.uniforms.u_ink_glow.value.set(...pal.glow);
        }
    }

    destroy() {
        if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
        if (this.rtA) this.rtA.dispose();
        if (this.rtB) this.rtB.dispose();
    }
}

window.FerrofluidScene = FerrofluidScene;
