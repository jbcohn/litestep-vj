/**
 * VJ Visualizer - Scene 6: Ferrofluid & Inks
 * 
 * Macro Photography Ferrofluid Simulation:
 * - Physics-Based Magnetic Dipole Attraction & Repulsion:
 *   Mutual 1/r^4 dipole-dipole repulsion and harmonic magnetic confinement,
 *   spontaneously organizing magnetized droplets into an authentic hexagonal Wigner lattice.
 * - Single-Color Ink Substrate & Equipotential Contour Streamlines:
 *   Captures authentic ferrofluid macro photography (orange/black, golden amber, or neon lime)
 *   where nested equipotential lines wrap around each droplet mound and merge into
 *   serpentine channels across the interstitial liquid floor.
 * - Tactile 2.5D Liquid Surface:
 *   Restrained vertical dimension (0.00 - 0.11 units) to eliminate messy vertical geometry,
 *   producing smooth, glossy liquid domes and continuous fluid ridges.
 * - Macro Studio Lighting:
 *   Dual softbox specular reflections, signature ring-light glints, and Fresnel edge sheen.
 */

class FerrofluidScene {
    constructor() {
        this.name = "Ferrofluid";
        this.container = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.mesh = null;
        this.material = null;

        this.time = 0;
        this.isInitialized = false;

        // Camera control: overhead tabletop macro view (~76 deg pitch)
        this.pitch = 1.33;
        this.yaw = 0.0;
        this.targetPitch = 1.33;
        this.targetYaw = 0.0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // Magnetic Mode:
        // 0 = Dipole Mounds & Equipotential Labyrinth (orange/black network)
        // 1 = Central Magnetic Core & Rosensweig Honeycomb Web (golden amber)
        // 2 = Circular Petri Dish & Radial Finger Tendrils (neon fluorescent lime)
        this.magneticMode = 0;
        this.spikeGirth = 4.0;

        // Drop shockwave state
        this.dropIntensity = 0.0;
        this.dropTime = 999.0;

        // -------------------------------------------------------------
        // Magnetic Dipole Physics Particle System (44 Dipoles)
        // -------------------------------------------------------------
        this.numSpikes = 44;
        this.spikes = [];
        this._initDipoles();

        // Single-Color Ink Palettes (Default: Vermillion Orange matching macro photo)
        this.paletteIdx = 0;
        this.palettes = [
            {
                name: "Vermillion Orange",
                color: [1.00, 0.32, 0.02],   // Saturated orange ink from reference photo
                glow:  [1.00, 0.16, 0.00]    // Deep vermillion depth
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
    }

    _initDipoles() {
        this.spikes = [];
        // Mode 0 initial layout: 4 concentric hexagonal shells
        var shells = [
            { count: 6,  radius: 0.62, offset: 0.0 },
            { count: 12, radius: 1.22, offset: Math.PI / 12 },
            { count: 16, radius: 1.82, offset: 0.0 },
            { count: 10, radius: 2.40, offset: Math.PI / 10 }
        ];

        shells.forEach((shell) => {
            var step = (Math.PI * 2) / shell.count;
            for (var i = 0; i < shell.count; i++) {
                var angle = i * step + shell.offset;
                var x = Math.cos(angle) * shell.radius;
                var y = Math.sin(angle) * shell.radius;
                this.spikes.push({
                    x: x,
                    y: y,
                    vx: 0.0,
                    vy: 0.0,
                    fx: 0.0,
                    fy: 0.0,
                    targetR: shell.radius,
                    baseAngle: angle
                });
            }
        });
    }

    _reconfigureDipolesForMode() {
        var shells;
        if (this.magneticMode === 0) {
            // Mode 0: Distributed hexagonal lattice for equipotential labyrinth
            shells = [
                { count: 6,  radius: 0.62 },
                { count: 12, radius: 1.22 },
                { count: 16, radius: 1.82 },
                { count: 10, radius: 2.40 }
            ];
        } else if (this.magneticMode === 1) {
            // Mode 1: Central Core & Honeycomb Ring (core is at center, dipoles surround it)
            shells = [
                { count: 8,  radius: 0.88 },
                { count: 14, radius: 1.50 },
                { count: 22, radius: 2.25 }
            ];
        } else {
            // Mode 2: Petri Dish Radial Tendrils (dense central cluster + outer satellites)
            shells = [
                { count: 14, radius: 0.45 },
                { count: 14, radius: 1.25 },
                { count: 16, radius: 2.10 }
            ];
        }

        var idx = 0;
        shells.forEach((shell) => {
            var step = (Math.PI * 2) / shell.count;
            for (var i = 0; i < shell.count && idx < this.numSpikes; i++, idx++) {
                this.spikes[idx].targetR = shell.radius;
                this.spikes[idx].baseAngle = i * step;
                // Add gentle nudge to guide migration
                this.spikes[idx].vx += (Math.random() - 0.5) * 1.5;
                this.spikes[idx].vy += (Math.random() - 0.5) * 1.5;
            }
        });
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

        // Pre-allocate spike uniform array
        var spikeVectors = [];
        for (var i = 0; i < this.numSpikes; i++) {
            spikeVectors.push(new THREE.Vector2(this.spikes[i].x, this.spikes[i].y));
        }

        this.material = new THREE.ShaderMaterial({
            vertexShader: this._vertexShader(),
            fragmentShader: this._fragmentShader(),
            uniforms: {
                u_time: { value: 0.0 },
                u_resolution: { value: new THREE.Vector2(width, height) },
                u_sub: { value: 0.0 },
                u_bass: { value: 0.0 },
                u_mids: { value: 0.0 },
                u_highs: { value: 0.0 },
                u_energy: { value: 0.0 },
                u_tension: { value: 0.0 },
                u_drop: { value: 0.0 },
                u_drop_time: { value: 999.0 },
                u_pitch: { value: this.pitch },
                u_yaw: { value: this.yaw },
                u_girth: { value: 1.0 },
                u_mode: { value: 0.0 },
                u_alpha: { value: 1.0 },
                u_ink_color: { value: new THREE.Vector3(...this.palettes[0].color) },
                u_ink_glow:  { value: new THREE.Vector3(...this.palettes[0].glow) },
                u_spikes: { value: spikeVectors }
            },
            depthWrite: false,
            depthTest: false
        });

        var geom = new THREE.PlaneGeometry(2, 2);
        this.mesh = new THREE.Mesh(geom, this.material);
        this.scene.add(this.mesh);

        this._bindMouseEvents();
        this.isInitialized = true;
    }

    _bindMouseEvents() {
        window.addEventListener("mousedown", (e) => {
            if (e.target.closest("#vj-hud") || e.target.closest("#proportions-drawer")) return;
            this.isDragging = true;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;
        });

        window.addEventListener("mousemove", (e) => {
            if (!this.isDragging) return;
            var dx = e.clientX - this.lastMouseX;
            var dy = e.clientY - this.lastMouseY;
            this.lastMouseX = e.clientX;
            this.lastMouseY = e.clientY;

            this.targetYaw += dx * 0.005;
            this.targetPitch = Math.max(0.80, Math.min(1.54, this.targetPitch + dy * 0.005));
        });

        window.addEventListener("mouseup", () => {
            this.isDragging = false;
        });
    }

    _vertexShader() {
        return `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = vec4(position, 1.0);
            }
        `;
    }

    _fragmentShader() {
        return `
            precision highp float;
            varying vec2 vUv;

            uniform float u_time;
            uniform vec2  u_resolution;
            uniform float u_sub;
            uniform float u_bass;
            uniform float u_mids;
            uniform float u_highs;
            uniform float u_energy;
            uniform float u_tension;
            uniform float u_drop;
            uniform float u_drop_time;
            uniform float u_pitch;
            uniform float u_yaw;
            uniform float u_girth;
            uniform float u_mode;
            uniform float u_alpha;

            uniform vec3 u_ink_color;
            uniform vec3 u_ink_glow;

            const int NUM_SPIKES = 44;
            uniform vec2 u_spikes[44];

            #define PI 3.14159265359

            // Mode 1: Central Core Inner Labyrinth Maze
            float innerLabyrinth(vec2 p) {
                vec2 q = p * 14.0;
                float l1 = sin(q.x + sin(q.y * 1.4));
                float l2 = sin(q.y + cos(q.x * 1.4));
                return smoothstep(0.32, 0.0, abs(l1 * l2));
            }

            // Continuous Surface Evaluation
            // Returns: x = ferrofluid mask [0..1], y = surface elevation [0..0.12], z = edge distance [0..1]
            vec4 getFerrofluidSurface(vec2 p) {
                float distCenter = length(p);

                // Mode 1: Central circular magnetic core
                if (u_mode > 0.5 && u_mode < 1.5) {
                    float R_core = 0.44;
                    if (distCenter < R_core + 0.06) {
                        float rim = smoothstep(0.04, 0.0, abs(distCenter - R_core));
                        float inCore = step(distCenter, R_core);
                        float innerMaze = innerLabyrinth(p) * inCore;
                        float coreMask = clamp(rim * 1.2 + innerMaze, 0.0, 1.0);
                        float coreH = rim * (0.06 + u_sub * 0.03) + innerMaze * 0.035;
                        return vec4(coreMask, coreH, rim, 1.0);
                    }
                }

                // -------------------------------------------------------------
                // 1. MAGNETIC POTENTIAL & DIPOLE DISTANCE ACCUMULATION
                // -------------------------------------------------------------
                float psi = 0.0;
                float d1 = 999.0;
                float d2 = 999.0;
                vec2 p1 = vec2(0.0);
                vec2 p2 = vec2(0.0);

                for (int i = 0; i < NUM_SPIKES; i++) {
                    vec2 s = u_spikes[i];
                    vec2 diff = p - s;
                    float dSqr = dot(diff, diff);
                    // Magnetic potential Psi ~ sum 1/(r^2 + r0^2)^0.75
                    psi += 1.0 / pow(dSqr + 0.038, 0.75);

                    float d = sqrt(dSqr);
                    if (d < d1) {
                        d2 = d1;
                        p2 = p1;
                        d1 = d;
                        p1 = s;
                    } else if (d < d2) {
                        d2 = d;
                        p2 = s;
                    }
                }

                // -------------------------------------------------------------
                // 2. BULBOUS BLACK FERROFLUID DROPLET MOUNDS
                // -------------------------------------------------------------
                float R_mound = 0.165 * u_girth;
                float domeDist = d1 / R_mound;
                float moundShape = max(0.0, 1.0 - domeDist * domeDist);
                // Restrained dome elevation (0.07 - 0.10 units)
                float hMound = pow(moundShape, 1.5) * (0.072 + u_sub * 0.035 + u_tension * 0.02);
                float moundMask = smoothstep(R_mound, R_mound - 0.025, d1);

                // -------------------------------------------------------------
                // 3. NETWORK OF LINES: EQUIPOTENTIAL CONTOUR STREAMLINES
                // -------------------------------------------------------------
                // Natural log of potential creates uniform concentric spacing around dipoles
                // that naturally merge into saddle-point serpentine channels between mounds.
                float ringFreq = 3.65;
                float theta = ringFreq * log(max(0.001, psi));
                float ringWave = sin(theta);

                // Line thickness controlled by slider and bass
                float lineThresh = 0.62 - 0.20 * clamp(u_girth - 1.0, -0.6, 0.8);
                float lineMask = smoothstep(lineThresh - 0.12, lineThresh + 0.04, ringWave);

                // Fade lines gracefully near outer boundary
                float boundaryFade = smoothstep(2.7, 2.2, distCenter);
                lineMask *= boundaryFade;

                // Tactile fluid ridge elevation for contour lines
                float hLine = lineMask * (0.018 + u_bass * 0.009);

                // -------------------------------------------------------------
                // 4. MODE 2: PETRI DISH RADIAL TENDRILS
                // -------------------------------------------------------------
                float hTendril = 0.0;
                float tendrilMask = 0.0;
                if (u_mode > 1.5) {
                    float angle = atan(p.y, p.x);
                    float fingerNoise = sin(angle * 12.0 + sin(distCenter * 7.5 - u_time * 0.4) * 1.6);
                    float fingers = smoothstep(0.18, 0.88, fingerNoise) * smoothstep(0.4, 1.1, distCenter) * smoothstep(2.5, 1.8, distCenter);
                    tendrilMask = fingers;
                    hTendril = fingers * 0.022;

                    // Glass petri dish rim
                    float dishRim = smoothstep(0.04, 0.0, abs(distCenter - 2.45));
                    hTendril += dishRim * 0.04;
                    tendrilMask = max(tendrilMask, dishRim);
                }

                // -------------------------------------------------------------
                // 5. COMBINE FLUID MASK & ELEVATION
                // -------------------------------------------------------------
                float ferroMask = clamp(moundMask + lineMask + tendrilMask, 0.0, 1.0);
                float totalH = hMound + hLine + hTendril;

                // Contact edge distance for meniscus shading
                float edgeD = min(abs(d1 - R_mound), abs(ringWave - lineThresh));

                return vec4(ferroMask, totalH, edgeD, 0.0);
            }

            // Continuous Elevation Function with Capillary Waves & Drop Shockwave
            float getElevation(vec2 pos) {
                float distCenter = length(pos);
                vec4 f = getFerrofluidSurface(pos);
                float baseH = f.y;

                // Subtle capillary ripples on liquid substrate
                float capWave = sin(distCenter * 15.0 - u_time * 4.8) * (0.002 + u_highs * 0.006) * exp(-distCenter * 0.28);

                // Musical Drop Shockwave Ring
                float shockwave = 0.0;
                if (u_drop_time >= 0.0 && u_drop_time < 3.2) {
                    float waveFront = u_drop_time * 3.5;
                    float delta = distCenter - waveFront;
                    shockwave = sin(delta * 12.0) * exp(-delta * delta * 2.8) * exp(-u_drop_time * 1.4) * (u_drop * 0.028);
                }

                return baseH + capWave + shockwave;
            }

            // Analytical / Central-Differences Normal
            vec3 getNormal(vec2 p, float h) {
                const vec2 eps = vec2(0.006, 0.0);
                float hR = getElevation(p + eps.xy);
                float hL = getElevation(p - eps.xy);
                float hU = getElevation(p + eps.yx);
                float hD = getElevation(p - eps.yx);
                return normalize(vec3(hL - hR, 2.0 * eps.x, hD - hU));
            }

            void main() {
                vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);

                // Tabletop Macro Camera Setup (~76 deg overhead angle)
                float camDist = 3.9;
                float pitch = u_pitch;
                float yaw = u_yaw + u_time * 0.022; // Gentle macro turntable drift

                vec3 ro = vec3(camDist * sin(yaw) * cos(pitch), camDist * sin(pitch), -camDist * cos(yaw) * cos(pitch));
                vec3 target = vec3(0.0, 0.03, 0.0);

                vec3 fwd = normalize(target - ro);
                vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
                vec3 up = cross(fwd, right);
                vec3 rd = normalize(uv.x * right + uv.y * up + 1.70 * fwd);

                // Raymarch Heightfield Surface with Binary Refinement
                float t = 1.3;
                float tMax = 7.0;
                vec3 p = ro;
                bool hit = false;
                float finalH = 0.0;
                float dt = 0.0;

                for (int i = 0; i < 38; i++) {
                    p = ro + rd * t;
                    float h = getElevation(p.xz);
                    if (p.y <= h) {
                        hit = true;
                        break;
                    }
                    float dY = p.y - h;
                    dt = max(0.018, dY * 0.88);
                    t += dt;
                    if (t > tMax) break;
                }

                // Sub-pixel Binary Refinement
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

                // Deep Dark Studio Macro Vignette
                vec3 bgColor = mix(vec3(0.014, 0.016, 0.020), vec3(0.005, 0.006, 0.008), length(uv) * 1.1);

                if (!hit) {
                    gl_FragColor = vec4(bgColor, u_alpha);
                    return;
                }

                // Surface Normal & View Vector
                vec3 N = getNormal(p.xz, finalH);
                vec3 V = -rd;

                // Evaluate Ferrofluid Mask & Edge Meniscus
                vec4 fData = getFerrofluidSurface(p.xz);
                float isFerro = fData.x;
                float edgeD = fData.z;

                // -------------------------------------------------------------
                // 1. MATERIAL ALBEDO: OBSIDIAN FERROFLUID & SINGLE-COLOR INK
                // -------------------------------------------------------------
                // Deep obsidian magnetite black
                vec3 ferroColor = vec3(0.012, 0.013, 0.016);

                // Vibrant Single-Color Ink Substrate
                vec3 inkBase = u_ink_color;
                // Subsurface optical depth gradient
                float rDist = length(p.xz);
                vec3 inkFloor = mix(u_ink_glow, inkBase, clamp(edgeD * 5.0, 0.0, 1.0));

                // Meniscus Contact Border: Dark liquid rim where black fluid touches ink
                float meniscus = smoothstep(0.05, 0.008, edgeD);
                inkFloor = mix(inkFloor, inkBase * 0.45, meniscus * (1.0 - isFerro));

                // Blended Surface Albedo
                vec3 albedo = mix(inkFloor, ferroColor, isFerro);

                // -------------------------------------------------------------
                // 2. MACRO STUDIO LIGHTING: DUAL SOFTBOXES & RING-LIGHT
                // -------------------------------------------------------------
                // Key Light: Overhead photographic softbox 1
                vec3 lKey1 = normalize(vec3(0.5, 2.2, -0.6));
                float diffKey1 = max(0.0, dot(N, lKey1));
                vec3 hKey1 = normalize(lKey1 + V);
                float specSoft1 = pow(max(0.0, dot(N, hKey1)), 36.0);
                float specSharp1 = pow(max(0.0, dot(N, hKey1)), 128.0);

                // Fill Light: Softbox 2
                vec3 lFill2 = normalize(vec3(-0.7, 1.8, 0.5));
                float diffFill2 = max(0.0, dot(N, lFill2));
                vec3 hFill2 = normalize(lFill2 + V);
                float specFill2 = pow(max(0.0, dot(N, hFill2)), 64.0);

                // Ambient Sky Diffuse
                float diffAmb = 0.52 + 0.48 * max(0.0, N.y);

                // Reflected Ray
                vec3 R = reflect(-V, N);

                // Signature Macro Photography Studio Ring-Light Reflection
                // Produces crisp circular ring glints on droplet crests and contour ridges
                float ringAngle = acos(clamp(R.y, -1.0, 1.0));
                float ringGlance = smoothstep(0.050, 0.0, abs(ringAngle - 0.38));
                float ringLight = ringGlance * 2.6 * (0.85 + u_highs * 0.5);

                // Fresnel Glancing Sheen
                float NdotV = max(0.0, dot(N, V));
                float fresnel = pow(1.0 - NdotV, 3.8);
                vec3 fresnelSheen = mix(vec3(1.0, 0.98, 0.95), u_ink_color * 1.2, 0.25);

                // Ambient Occlusion in Valleys
                float ao = clamp(1.0 - meniscus * 0.35, 0.65, 1.0);

                // Composite Shading Model
                vec3 col = albedo * (diffKey1 * 0.70 + diffFill2 * 0.40 + diffAmb * 0.55) * ao;

                // Add Glossy Specular Highlights (both on obsidian fluid and ink surface)
                col += vec3(1.0, 0.98, 0.94) * (specSoft1 * 0.35 + specSharp1 * 1.5 + specFill2 * 0.45);

                // Add Signature Macro Ring-Light Reflection
                col += vec3(1.0, 0.99, 0.95) * ringLight * (isFerro > 0.4 ? 1.0 : 0.35);

                // Add Fresnel Glancing Sheen
                col += fresnelSheen * fresnel * (isFerro > 0.5 ? 0.32 : 0.18);

                // Musical Drop Shockwave Luminescence
                if (u_drop_time >= 0.0 && u_drop_time < 0.60) {
                    col += vec3(1.0, 0.96, 0.90) * exp(-u_drop_time * 5.0) * (u_drop * 0.50);
                }

                // Vignette & Distance Fog
                float fogDist = length(p - ro);
                float fog = smoothstep(5.4, 9.5, fogDist);
                col = mix(col, bgColor, fog);

                gl_FragColor = vec4(col, u_alpha);
            }
        `;
    }

    resize(width, height) {
        if (!this.renderer || !this.material) return;
        this.renderer.setSize(width, height);
        this.material.uniforms.u_resolution.value.set(width, height);
    }

    updatePhysics(dt, audio) {
        var sub = audio ? audio.sub : 0.0;
        var bass = audio ? audio.bass : 0.0;
        var tension = audio ? audio.tension : 0.0;
        var isBeat = audio ? audio.isBeat : false;

        // Radial magnetic confinement pulls dipoles to concentric equilibrium shells
        var kCenter = 4.2 + sub * 3.8 + tension * 2.8;
        // Mutual 1/r^4 dipole-dipole repulsion
        var kRep = 0.52 + bass * 0.28;

        for (var i = 0; i < this.numSpikes; i++) {
            var pA = this.spikes[i];

            // 1. Magnetic Confinement Force (Harmonic radial trap to target shell)
            var curR = Math.hypot(pA.x, pA.y);
            var radialForce = -kCenter * (curR - pA.targetR);
            var ang = Math.atan2(pA.y, pA.x);
            pA.fx = Math.cos(ang) * radialForce;
            pA.fy = Math.sin(ang) * radialForce;

            // Angular restorative spring maintaining ordered hexagonal crystal
            var dAng = (pA.baseAngle - ang + Math.PI) % (Math.PI * 2) - Math.PI;
            pA.fx += -Math.sin(ang) * dAng * 2.2 * curR;
            pA.fy += Math.cos(ang) * dAng * 2.2 * curR;

            // 2. Dipole-Dipole Repulsion between every pair (F ~ 1 / r^4)
            for (var j = i + 1; j < this.numSpikes; j++) {
                var pB = this.spikes[j];
                var dx = pA.x - pB.x;
                var dy = pA.y - pB.y;
                var d2 = dx * dx + dy * dy + 0.08;
                var d = Math.sqrt(d2);
                var fRep = kRep / (d2 * d2);
                var nx = dx / d, ny = dy / d;
                pA.fx += nx * fRep;
                pA.fy += ny * fRep;
                pB.fx -= nx * fRep;
                pB.fy -= ny * fRep;
            }

            // Beat perturbation / Brownian fluid agitation
            if (isBeat) {
                pA.fx += (Math.random() - 0.5) * 8.0 * (0.3 + sub);
                pA.fy += (Math.random() - 0.5) * 8.0 * (0.3 + sub);
            }
        }

        // Numerical integration with viscous fluid damping
        var substeps = 2;
        var subDt = Math.min(dt, 0.033) / substeps;
        for (var step = 0; step < substeps; step++) {
            for (var i = 0; i < this.numSpikes; i++) {
                var p = this.spikes[i];
                p.vx = (p.vx + p.fx * subDt) * 0.88; // Viscous liquid damping
                p.vy = (p.vy + p.fy * subDt) * 0.88;
                p.x += p.vx * subDt;
                p.y += p.vy * subDt;
            }
        }

        // Update Shader Uniforms
        if (this.material && this.material.uniforms && this.material.uniforms.u_spikes) {
            var vecList = this.material.uniforms.u_spikes.value;
            for (var i = 0; i < this.numSpikes; i++) {
                vecList[i].set(this.spikes[i].x, this.spikes[i].y);
            }
        }
    }

    update(dt, audio, isVisible) {
        if (!this.isInitialized || !isVisible) return;

        this.time += dt;

        // Smooth Camera Orbit Interpolation
        this.pitch += (this.targetPitch - this.pitch) * 0.12;
        this.yaw   += (this.targetYaw - this.yaw) * 0.12;

        // Update Dipole Attraction & Repulsion Physics
        this.updatePhysics(dt, audio);

        // Drop Shockwave Tracker
        if (this.dropTime < 5.0) {
            this.dropTime += dt;
        }

        // Uniform Updates
        var u = this.material.uniforms;
        u.u_time.value = this.time;
        u.u_sub.value = audio ? audio.sub : 0.0;
        u.u_bass.value = audio ? audio.bass : 0.0;
        u.u_mids.value = audio ? audio.mids : 0.0;
        u.u_highs.value = audio ? audio.highs : 0.0;
        u.u_energy.value = audio ? audio.energy : 0.0;
        u.u_tension.value = audio ? audio.tension : 0.0;
        u.u_drop.value = audio ? audio.dropIntensity : 0.0;
        u.u_drop_time.value = this.dropTime;
        u.u_pitch.value = this.pitch;
        u.u_yaw.value = this.yaw;
        u.u_girth.value = this.spikeGirth / 4.0;
        u.u_mode.value = this.magneticMode;
    }

    render(alpha) {
        alpha = alpha === undefined ? 1.0 : alpha;
        if (!this.isInitialized || !this.renderer) return;

        this.renderer.domElement.style.opacity = alpha;
        if (alpha > 0.001) {
            this.renderer.domElement.style.display = "block";
            this.material.uniforms.u_alpha.value = alpha;
            this.renderer.render(this.scene, this.camera);
        } else {
            this.renderer.domElement.style.display = "none";
        }
    }

    triggerDropShockwave() {
        this.dropTime = 0.0;
        this.dropIntensity = 1.0;

        // Radial blast impulse flinging dipoles outward on drop
        for (var i = 0; i < this.numSpikes; i++) {
            var p = this.spikes[i];
            var ang = Math.atan2(p.y, p.x);
            p.vx += Math.cos(ang) * 5.5;
            p.vy += Math.sin(ang) * 5.5;
        }
    }

    mutate() {
        // Cycle single-color ink palette
        this.paletteIdx = (this.paletteIdx + 1) % this.palettes.length;
        var pal = this.palettes[this.paletteIdx];
        if (this.material && this.material.uniforms) {
            this.material.uniforms.u_ink_color.value.set(...pal.color);
            this.material.uniforms.u_ink_glow.value.set(...pal.glow);
        }

        // Agitate particles gently
        for (var i = 0; i < this.numSpikes; i++) {
            this.spikes[i].vx += (Math.random() - 0.5) * 3.5;
            this.spikes[i].vy += (Math.random() - 0.5) * 3.5;
        }
    }

    randomizeGeometry() {
        // Cycle magnetic mode (0: Labyrinth & Contours, 1: Core & Honeycomb, 2: Petri Dish Tendrils)
        this.magneticMode = (this.magneticMode + 1) % 3;
        if (this.material && this.material.uniforms) {
            this.material.uniforms.u_mode.value = this.magneticMode;
        }
        this._reconfigureDipolesForMode();
    }

    setThickness(val) {
        this.spikeGirth = Math.max(1.0, Math.min(10.0, val));
        if (this.material && this.material.uniforms) {
            this.material.uniforms.u_girth.value = this.spikeGirth / 4.0;
        }
    }

    destroy() {
        if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
    }
}

window.FerrofluidScene = FerrofluidScene;
