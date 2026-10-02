/**
 * VJ Visualizer - Scene 6: Ferrofluid & Inks
 * 
 * Inspired by:
 * 1. Hele-Shaw thin-film ferrofluid labyrinthine instability:
 *    - Deep obsidian black ferrofluid forming serpentine networks of lines,
 *      branching nodes, and dispersed droplets suspended over a single vibrant ink substrate.
 * 2. 3D magnetic Rosensweig fluid peaks & smooth concentric capillary waves:
 *    - Liquid mirror reflections with sharp GGX specular glints, continuous normals,
 *      and iridescent horizon rings.
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

        // Camera control: pitch & yaw (high tabletop Petri dish view)
        this.pitch = 1.30; // ~74.5 deg high overhead perspective
        this.yaw = 0.0;
        this.targetPitch = 1.30;
        this.targetYaw = 0.0;
        this.isDragging = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // Palette & Mode
        this.paletteIdx = 0;
        this.magneticMode = 0; // 0 = Classic Labyrinth, 1 = Dense Cellular Maze, 2 = Concentric Corona, 3 = Twin Vortex
        this.spikeGirth = 4.0; // Line thickness slider

        // Drop shockwave state
        this.dropIntensity = 0.0;
        this.dropTime = 999.0;

        // Single-Color Ink Palettes (Vibrant single ink background contrasting with obsidian black ferrofluid)
        this.palettes = [
            {
                name: "Amber Orange",
                color: [1.00, 0.42, 0.02],   // Classic ferrofluid carrier fluid
                glow:  [1.00, 0.65, 0.15]
            },
            {
                name: "Electric Cyan",
                color: [0.00, 0.88, 1.00],   // Neon cyan ink
                glow:  [0.35, 0.96, 1.00]
            },
            {
                name: "Acid Lime",
                color: [0.30, 0.95, 0.15],   // Radioactive emerald ink
                glow:  [0.55, 1.00, 0.35]
            },
            {
                name: "Hot Magenta",
                color: [1.00, 0.14, 0.52],   // Laser magenta ink
                glow:  [1.00, 0.45, 0.72]
            },
            {
                name: "Deep Ultraviolet",
                color: [0.65, 0.18, 1.00],   // Bioluminescent purple ink
                glow:  [0.82, 0.45, 1.00]
            },
            {
                name: "Prismatic Opal",
                color: [0.82, 0.96, 0.84],   // Pearlescent green/gold liquid
                glow:  [0.95, 0.98, 0.90]
            }
        ];
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
                u_magnetic_mode: { value: 0 },
                u_girth: { value: 1.0 },
                u_alpha: { value: 1.0 },
                u_ink_color: { value: new THREE.Vector3(...this.palettes[0].color) },
                u_ink_glow:  { value: new THREE.Vector3(...this.palettes[0].glow) }
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
            this.targetPitch = Math.max(0.35, Math.min(1.48, this.targetPitch + dy * 0.005));
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
            uniform int   u_magnetic_mode;
            uniform float u_girth;
            uniform float u_alpha;

            uniform vec3 u_ink_color;
            uniform vec3 u_ink_glow;

            #define PI 3.14159265359

            // 2D Hash function
            float hash21(vec2 p) {
                p = fract(p * vec2(234.34, 435.345));
                p += dot(p, p + 34.23);
                return fract(p.x * p.y);
            }

            // Continuous Ferrofluid Labyrinth & Droplet Network
            // Returns: x = ferrofluid density [0..1], y = gradient magnitude (meniscus edge)
            vec2 getFerrofluidField(vec2 p) {
                // Subtle fluid breathing flow
                float flowRate = 0.08 + u_mids * 0.12;
                vec2 flow = vec2(
                    sin(p.y * 1.1 + u_time * flowRate),
                    cos(p.x * 1.1 + u_time * flowRate)
                ) * 0.22;

                // Scale grid: higher tension tightens the labyrinth channels
                float scale = 3.6 + u_tension * 1.2;
                vec2 q = p * scale + flow;

                // Mode Variations
                float field = 0.0;
                if (u_magnetic_mode == 0) {
                    // Classic Hele-Shaw Labyrinthine Instability (Winding Serpentine Channels & Loops)
                    float a1 = q.x;
                    float a2 = q.x * 0.5 + q.y * 0.866025;
                    float a3 = -q.x * 0.5 + q.y * 0.866025;
                    
                    float w1 = sin(a1 + sin(a2 * 1.2) * 0.65);
                    float w2 = sin(a2 + sin(a3 * 1.2) * 0.65);
                    float w3 = sin(a3 + sin(a1 * 1.2) * 0.65);
                    field = (w1 + w2 + w3) / 3.0;

                    // Varicose beading along ribbons (pinch-off nodes)
                    field += sin(q.x * 3.8 + q.y * 2.6) * 0.14;

                } else if (u_magnetic_mode == 1) {
                    // Dense Cellular Droplets & Branching Mesh
                    float w1 = sin(q.x + cos(q.y * 1.4));
                    float w2 = sin(q.y + cos(q.x * 1.4));
                    field = (w1 * w2) * 0.85;

                } else if (u_magnetic_mode == 2) {
                    // Concentric Corona Ripple Rings
                    float r = length(p) * (5.0 + u_tension * 2.0);
                    field = sin(r + sin(atan(p.y, p.x) * 6.0) * 0.6 - u_time * 0.5);

                } else {
                    // Twin Vortex Dipole Swirl
                    vec2 p1 = p - vec2(-0.8, 0.0);
                    vec2 p2 = p - vec2(0.8, 0.0);
                    float r1 = length(p1) * 4.5 - atan(p1.y, p1.x) * 2.0;
                    float r2 = length(p2) * 4.5 + atan(p2.y, p2.x) * 2.0;
                    field = sin(r1) * 0.5 + sin(r2) * 0.5;
                }

                // Line width modulation tied to Thickness slider + Bass pulsation
                float baseWidth = 0.28 * u_girth * (1.0 + u_bass * 0.22);
                float ribbonDist = abs(field);
                float ribbon = smoothstep(baseWidth, baseWidth - 0.09, ribbonDist);

                // Circular interstitial droplets in the negative gaps (Rayleigh-Plateau pinch-off)
                vec2 cell = floor(q * 0.75);
                vec2 f = fract(q * 0.75) - 0.5;
                float h = hash21(cell);
                float dotRadius = (0.10 + 0.16 * h) * u_girth;
                float dotShape = smoothstep(dotRadius, dotRadius - 0.06, length(f));
                float droplets = dotShape * step(0.38, h) * (1.0 - ribbon);

                // Unified ferrofluid coverage density F
                float F = clamp(ribbon + droplets, 0.0, 1.0);

                // Meniscus edge detection (steep transition boundary)
                float edge = smoothstep(0.05, 0.45, F) * smoothstep(0.95, 0.55, F);

                return vec2(F, edge);
            }

            // Continuous Surface Elevation h(x, z)
            float getElevation(vec2 pos) {
                float distCenter = length(pos);
                vec2 ferro = getFerrofluidField(pos);
                float F = ferro.x;

                // 1. Viscous black ferrofluid standing ridge above the ink floor
                // Elegant 2.5D embossed liquid relief (0.04 - 0.10 units)
                float ridgeProfile = F * F * (3.0 - 2.0 * F);
                float hRidge = ridgeProfile * (0.045 + u_sub * 0.065 + u_tension * 0.025);

                // 2. Rosensweig liquid beading along crests under bass
                // Gentle liquid nodes rather than tall towers
                float crestFactor = max(0.0, F - 0.65) / 0.35;
                float needleSpike = pow(crestFactor, 2.5) * (0.02 + u_sub * 0.08);

                // 3. Smooth Concentric Capillary Waves spreading across the liquid floor
                float capWave = sin(distCenter * 14.0 - u_time * 5.0) * (0.003 + u_highs * 0.008) * exp(-distCenter * 0.25);

                // 4. Musical Drop Shockwave Ring
                float shockwave = 0.0;
                if (u_drop_time >= 0.0 && u_drop_time < 3.0) {
                    float waveFront = u_drop_time * 3.6;
                    float delta = distCenter - waveFront;
                    shockwave = sin(delta * 12.0) * exp(-delta * delta * 2.5) * exp(-u_drop_time * 1.5) * (u_drop * 0.035);
                }

                return hRidge + needleSpike + capWave + shockwave;
            }

            // Normal Estimation via Central Differences
            vec3 getNormal(vec2 p, float h) {
                const vec2 eps = vec2(0.008, 0.0);
                float hR = getElevation(p + eps.xy);
                float hL = getElevation(p - eps.xy);
                float hU = getElevation(p + eps.yx);
                float hD = getElevation(p - eps.yx);
                return normalize(vec3(hL - hR, 2.0 * eps.x, hD - hU));
            }

            void main() {
                vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);

                // Camera Setup: High Tabletop / Hele-Shaw View
                float camDist = 4.0;
                float pitch = u_pitch;
                float yaw = u_yaw + u_time * 0.03; // Gentle serene turntable drift

                vec3 ro = vec3(camDist * sin(yaw) * cos(pitch), camDist * sin(pitch), -camDist * cos(yaw) * cos(pitch));
                vec3 target = vec3(0.0, 0.05, 0.0);

                vec3 fwd = normalize(target - ro);
                vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
                vec3 up = cross(fwd, right);
                vec3 rd = normalize(uv.x * right + uv.y * up + 1.65 * fwd);

                // Raymarch Heightfield Surface with Binary Refinement
                float t = 1.2;
                float tMax = 7.5;
                vec3 p = ro;
                bool hit = false;
                float finalH = 0.0;
                float dt = 0.0;

                for (int i = 0; i < 48; i++) {
                    p = ro + rd * t;
                    float h = getElevation(p.xz);
                    if (p.y <= h) {
                        hit = true;
                        break;
                    }
                    float dY = p.y - h;
                    dt = max(0.025, dY * 0.85);
                    t += dt;
                    if (t > tMax) break;
                }

                // Sub-pixel Binary Refinement for silky-smooth, anti-aliased surface normals
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

                // Background Void: Deep studio vignette
                vec3 bgColor = mix(vec3(0.015, 0.02, 0.03), vec3(0.005, 0.008, 0.012), length(uv));

                if (!hit) {
                    gl_FragColor = vec4(bgColor, u_alpha);
                    return;
                }

                // Normal & View Vector
                vec3 N = getNormal(p.xz, finalH);
                vec3 V = -rd;

                // Evaluate Ferrofluid & Ink Distribution at hit location
                vec2 ferro = getFerrofluidField(p.xz);
                float F = ferro.x;
                float edge = ferro.y;

                // -------------------------------------------------------------
                // 1. MATERIAL DIFFERENTIATION (Black Ferrofluid vs. Single Ink)
                // -------------------------------------------------------------
                // Jet-black obsidian ferrofluid albedo:
                vec3 ferroColor = vec3(0.012, 0.014, 0.018);

                // Saturated single-color ink substrate (Amber Orange as in photo):
                vec3 inkBase = u_ink_color;
                // Subsurface translucency in the ink floor
                vec3 inkLit  = mix(inkBase * 0.85, u_ink_glow, max(0.0, N.y) * 0.65);

                // Meniscus Contact Shadow: Subtle dark border where black fluid meets ink
                inkLit *= mix(0.55, 1.0, 1.0 - edge * 0.75);

                // Blend Albedo based on ferrofluid coverage F
                float isFerro = smoothstep(0.35, 0.65, F);
                vec3 albedo = mix(inkLit, ferroColor, isFerro);

                // -------------------------------------------------------------
                // 2. LIGHTING RIG & GGX LIQUID SPECULAR
                // -------------------------------------------------------------
                // Key Light: Overhead photographic softbox
                vec3 lKey = normalize(vec3(0.5, 2.2, -0.6));
                float diffKey = max(0.0, dot(N, lKey));
                vec3 hKey = normalize(lKey + V);
                float NdotH = max(0.0, dot(N, hKey));
                // High exponent for razor-sharp liquid mirror sheen
                float specKey = pow(NdotH, 96.0);

                // Rim Light: Backlight grazing edges to silhouette spikes and fluid ridges
                vec3 lRim = normalize(vec3(-0.7, 1.4, 1.1));
                float diffRim = max(0.0, dot(N, lRim));
                vec3 hRim = normalize(lRim + V);
                float specRim = pow(max(0.0, dot(N, hRim)), 48.0);

                // Ambient Sky Diffuse
                float diffAmb = 0.45 + 0.55 * max(0.0, N.y);

                // Fresnel Glancing Angle Reflection
                float NdotV = max(0.0, dot(N, V));
                float fresnel = pow(1.0 - NdotV, 4.0);

                // Horizon Capillary Wave Reflections (Referencing Image 1)
                float distCenter = length(p.xz);
                vec3 horizonGlow = u_ink_glow * (0.3 + 0.7 * sin(distCenter * 14.0 - u_time * 4.0)) * smoothstep(2.0, 4.5, distCenter);

                // Thin-film iridescent sheen for glancing edges
                vec3 iridescence = 0.5 + 0.5 * cos(fresnel * 6.28318 * vec3(1.0, 1.25, 1.5) + vec3(0.0, 1.1, 2.2));
                vec3 specColor = mix(vec3(1.0, 0.98, 0.95), iridescence, 0.45);

                // Ambient Occlusion
                float ao = clamp(1.0 - edge * 0.40, 0.60, 1.0);

                // Composite Shading
                vec3 col = albedo * (diffKey * 0.75 + diffAmb * 0.55 + diffRim * 0.3) * ao;
                // Gleaming liquid specular highlights
                col += specColor * (specKey * 1.8 + specRim * 1.2) * (0.9 + u_highs * 0.7);
                // Fresnel rim reflection
                col += iridescence * fresnel * (isFerro > 0.5 ? 0.40 : 0.20);
                // Distant wave horizon sheen
                col += horizonGlow * fresnel * 0.5;

                // Drop Shockwave Flash Luminescence
                if (u_drop_time >= 0.0 && u_drop_time < 0.65) {
                    col += vec3(1.0, 0.96, 0.90) * exp(-u_drop_time * 5.0) * (u_drop * 0.55);
                }

                // Vignette & Distance Fog
                float fogDist = length(p - ro);
                float fog = smoothstep(5.5, 11.0, fogDist);
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

    update(dt, audio, isVisible) {
        if (!this.isInitialized || !isVisible) return;

        this.time += dt;

        // Smooth Camera Orbit Interpolation
        this.pitch += (this.targetPitch - this.pitch) * 0.12;
        this.yaw   += (this.targetYaw - this.yaw) * 0.12;

        // Drop Shockwave Tracker
        if (this.dropTime < 5.0) {
            this.dropTime += dt;
        }

        // Smooth Uniform Updates
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
        u.u_magnetic_mode.value = this.magneticMode;
        u.u_girth.value = this.spikeGirth / 4.0;
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
    }

    mutate() {
        // Cycle single-color ink palette and magnetic formation pattern
        this.paletteIdx = (this.paletteIdx + 1) % this.palettes.length;
        this.magneticMode = (this.magneticMode + 1) % 4;

        var pal = this.palettes[this.paletteIdx];
        if (this.material && this.material.uniforms) {
            this.material.uniforms.u_ink_color.value.set(...pal.color);
            this.material.uniforms.u_ink_glow.value.set(...pal.glow);
        }
    }

    randomizeGeometry() {
        this.magneticMode = Math.floor(Math.random() * 4);
        this.mutate();
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
