/**
 * VJ Visualizer - Scene 6: Ferrofluid & Inks
 * 
 * Aesthetic Concept:
 * - Ferrofluid: Magnetized nano-colloid fluid forming sharp Rosensweig cone spikes
 *   arranged in hexagonal magnetic lattice patterns. Liquid mirror finish with
 *   glossy obsidian reflections, GGX specular micro-glints, and thin-film Fresnel
 *   iridescent oil-sheen at glancing angles.
 * - Colored Inks: Organic fluid dispersion ribbons swirling in curl-noise advection
 *   between the spikes (Electric Cyan, Hot Magenta, Royal Gold, Deep Amethyst).
 * 
 * Audio Reactivity:
 * - Sub-Bass: Drives magnetic field strength, spike height, and needle apex sharpness.
 * - Bass: Radial magnetic expansion and spike cluster oscillation.
 * - Mids: Fluid turbulence, ink swirl rate, and fractal plume dispersion.
 * - Highs: Capillary micro-ripples and crystalline surface specular highlights.
 * - Musical Tension: Tightens magnetic lattice spacing and amplifies field density.
 * - Musical Drop: Triggers an expanding shockwave ripple and explosive ink plume burst.
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
        this.turntableAngle = 0;
        this.isInitialized = false;

        this.paletteIdx = 0;
        this.magneticMode = 0; // 0 = Rosensweig Hex Lattice, 1 = Twin Vortex Dipoles, 2 = Concentric Corona, 3 = Chaotic Multi-Pole
        this.spikeGirth = 4.0; // Controlled by line thickness slider

        // Drop shockwave state
        this.dropIntensity = 0.0;
        this.dropTime = 999.0;

        // Ink Palettes: 4 colors per palette (vec3 in 0..1 range)
        this.palettes = [
            {
                name: "Electric Cyberpunk",
                c1: [0.00, 0.96, 0.83], // Cyan
                c2: [0.97, 0.15, 0.52], // Magenta
                c3: [1.00, 0.89, 0.25], // Gold
                c4: [0.45, 0.04, 0.72]  // Violet
            },
            {
                name: "Royal Alchemy",
                c1: [0.98, 0.80, 0.08], // Imperial Gold
                c2: [0.06, 0.73, 0.51], // Emerald
                c3: [0.55, 0.36, 0.96], // Amethyst
                c4: [0.98, 0.44, 0.52]  // Rose Quartz
            },
            {
                name: "Bioluminescent Abyss",
                c1: [0.02, 0.71, 0.83], // Electric Teal
                c2: [0.29, 0.87, 0.50], // Phosphor Green
                c3: [0.98, 0.44, 0.52], // Coral Glow
                c4: [0.12, 0.11, 0.29]  // Abyssal Indigo
            },
            {
                name: "Solar Flare",
                c1: [0.98, 0.75, 0.14], // Molten Gold
                c2: [0.98, 0.45, 0.09], // Burning Orange
                c3: [0.86, 0.15, 0.15], // Crimson
                c4: [1.00, 0.98, 0.90]  // Supernova White
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
                u_rot: { value: 0.0 },
                u_magnetic_mode: { value: 0 },
                u_girth: { value: 1.0 },
                u_alpha: { value: 1.0 },
                u_ink_c1: { value: new THREE.Vector3(...this.palettes[0].c1) },
                u_ink_c2: { value: new THREE.Vector3(...this.palettes[0].c2) },
                u_ink_c3: { value: new THREE.Vector3(...this.palettes[0].c3) },
                u_ink_c4: { value: new THREE.Vector3(...this.palettes[0].c4) }
            },
            depthWrite: false,
            depthTest: false
        });

        var geom = new THREE.PlaneGeometry(2, 2);
        this.mesh = new THREE.Mesh(geom, this.material);
        this.scene.add(this.mesh);

        this.isInitialized = true;
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
            uniform float u_rot;
            uniform int   u_magnetic_mode;
            uniform float u_girth;
            uniform float u_alpha;

            uniform vec3 u_ink_c1;
            uniform vec3 u_ink_c2;
            uniform vec3 u_ink_c3;
            uniform vec3 u_ink_c4;

            #define PI 3.14159265359

            // 2D Hash & Noise
            float hash21(vec2 p) {
                p = fract(p * vec2(234.34, 435.345));
                p += dot(p, p + 34.23);
                return fract(p.x * p.y);
            }

            vec2 hash22(vec2 p) {
                float n = sin(dot(p, vec2(41.0, 289.0)));
                return fract(vec2(262144.0, 32768.0) * n);
            }

            float noise(vec2 p) {
                vec2 i = floor(p);
                vec2 f = fract(p);
                f = f * f * (3.0 - 2.0 * f);
                float a = hash21(i);
                float b = hash21(i + vec2(1.0, 0.0));
                float c = hash21(i + vec2(0.0, 1.0));
                float d = hash21(i + vec2(1.0, 1.0));
                return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
            }

            // Fractional Brownian Motion (fBm)
            float fbm(vec2 p) {
                float v = 0.0;
                float a = 0.5;
                mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
                for (int i = 0; i < 4; i++) {
                    v += a * noise(p);
                    p = rot * p * 2.05 + vec2(100.0);
                    a *= 0.5;
                }
                return v;
            }

            // 2D Curl Noise for organic fluid advection
            vec2 curlNoise(vec2 p) {
                const float eps = 0.02;
                float n1 = fbm(p + vec2(0.0, eps));
                float n2 = fbm(p - vec2(0.0, eps));
                float n3 = fbm(p + vec2(eps, 0.0));
                float n4 = fbm(p - vec2(eps, 0.0));
                float dx = (n1 - n2) / (2.0 * eps);
                float dy = (n3 - n4) / (2.0 * eps);
                return vec2(dx, -dy);
            }

            // Hexagonal Tiling Helper for Rosensweig Magnetic Spike Array
            // Returns: xy = cell center offset, z = cell id
            vec4 hexCoords(vec2 uv) {
                const vec2 s = vec2(1.0, 1.7320508);
                vec4 hC = floor(vec4(uv, uv - vec2(0.5, 1.0)) / vec4(s, s)) + 0.5;
                vec4 h = vec4(uv - hC.xy * s, uv - (hC.zw + 0.5) * s);
                return dot(h.xy, h.xy) < dot(h.zw, h.zw) ? 
                       vec4(h.xy, hC.xy) : 
                       vec4(h.zw, hC.zw + 9.73);
            }

            // Rosensweig Spike Heightfield Elevation h(x, z)
            float getElevation(vec2 pos) {
                float distCenter = length(pos);

                // Magnetic Field Envelope B(r) based on mode:
                float B = 0.0;
                if (u_magnetic_mode == 0) {
                    // Central Crown Rosensweig Lattice
                    B = exp(-pow(distCenter * 0.42, 2.0));
                } else if (u_magnetic_mode == 1) {
                    // Twin Vortex Dipole Poles
                    vec2 pole1 = vec2(-1.4, 0.0);
                    vec2 pole2 = vec2(1.4, 0.0);
                    B = 0.65 * exp(-pow(length(pos - pole1) * 0.55, 2.0)) +
                        0.65 * exp(-pow(length(pos - pole2) * 0.55, 2.0));
                } else if (u_magnetic_mode == 2) {
                    // Concentric Corona Ring
                    float ringD = abs(distCenter - 1.6);
                    B = exp(-pow(distCenter * 0.5, 2.0)) * 0.7 + exp(-pow(ringD * 1.8, 2.0)) * 0.6;
                } else {
                    // Chaotic Multi-Pole Cluster
                    float t = u_time * 0.4;
                    vec2 pA = vec2(sin(t), cos(t)) * 1.3;
                    vec2 pB = vec2(sin(t + 2.1), cos(t + 2.1)) * 1.5;
                    vec2 pC = vec2(sin(t + 4.2), cos(t + 4.2)) * 1.2;
                    B = 0.5 * exp(-pow(length(pos - pA) * 0.65, 2.0)) +
                        0.5 * exp(-pow(length(pos - pB) * 0.65, 2.0)) +
                        0.5 * exp(-pow(length(pos - pC) * 0.65, 2.0));
                }

                // Tighten lattice spacing as musical tension rises
                float latticeScale = 2.4 + u_tension * 0.8;
                vec4 hex = hexCoords(pos * latticeScale);
                vec2 localPos = hex.xy;
                float rCell = length(localPos);

                // Sharp conical Rosensweig spike profile: steep exponent for needle tip
                float spikeRadius = (0.42 + u_bass * 0.15) * u_girth;
                float cone = max(0.0, 1.0 - rCell / spikeRadius);
                float needle = pow(cone, 2.6); // Characteristic steep apex

                // Total spike height driven by sub-bass + accumulated tension
                float baseHeight = 0.45;
                float dynamicSpike = needle * (baseHeight + u_sub * 2.2 + u_tension * 0.85) * B;

                // High-frequency capillary ripples on fluid surface
                float capWaves = sin(distCenter * 18.0 - u_time * 8.0) * (0.015 + u_highs * 0.04) * exp(-distCenter * 0.25);

                // Musical Drop Shockwave Ring: Expanding ripple wave
                float shockwave = 0.0;
                if (u_drop_time >= 0.0 && u_drop_time < 3.0) {
                    float waveFront = u_drop_time * 3.8;
                    float distFromFront = distCenter - waveFront;
                    shockwave = sin(distFromFront * 14.0) * exp(-distFromFront * distFromFront * 2.5) * exp(-u_drop_time * 1.2) * (u_drop * 0.45);
                }

                return dynamicSpike + capWaves + shockwave;
            }

            // Normal Estimation via Central Differences
            vec3 getNormal(vec2 p, float h) {
                const vec2 eps = vec2(0.015, 0.0);
                float hR = getElevation(p + eps.xy);
                float hL = getElevation(p - eps.xy);
                float hU = getElevation(p + eps.yx);
                float hD = getElevation(p - eps.yx);
                return normalize(vec3(hL - hR, 2.0 * eps.x, hD - hU));
            }

            void main() {
                vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution.xy) / min(u_resolution.x, u_resolution.y);

                // Camera Setup: 3D Turntable Perspective looking at the liquid pool
                float camDist = 4.4;
                float pitch = 0.72; // ~41 deg pitch down
                float yaw = u_rot;
                vec3 ro = vec3(camDist * sin(yaw) * cos(pitch), camDist * sin(pitch), -camDist * cos(yaw) * cos(pitch));
                vec3 target = vec3(0.0, 0.15, 0.0);

                vec3 fwd = normalize(target - ro);
                vec3 right = normalize(cross(vec3(0.0, 1.0, 0.0), fwd));
                vec3 up = cross(fwd, right);
                vec3 rd = normalize(uv.x * right + uv.y * up + 1.65 * fwd);

                // Raymarch Heightfield Surface
                float t = 1.0;
                float tMax = 12.0;
                vec3 p = ro;
                bool hit = false;
                float finalH = 0.0;

                for (int i = 0; i < 70; i++) {
                    p = ro + rd * t;
                    float h = getElevation(p.xz);
                    if (p.y <= h) {
                        // Refine intersection
                        hit = true;
                        finalH = h;
                        break;
                    }
                    float dY = p.y - h;
                    t += max(0.02, dY * 0.65);
                    if (t > tMax) break;
                }

                // Background Void: Deep indigo abyss with subtle radial glow
                vec3 bgColor = mix(vec3(0.01, 0.015, 0.03), vec3(0.04, 0.02, 0.08), length(uv));

                if (!hit) {
                    gl_FragColor = vec4(bgColor, u_alpha);
                    return;
                }

                // Surface Normal & View Vector
                vec3 N = getNormal(p.xz, finalH);
                vec3 V = -rd;

                // -------------------------------------------------------------
                // 1. ORGANIC INK DISPERSION FIELD (Curl Noise Advection)
                // -------------------------------------------------------------
                vec2 inkCoords = p.xz * 0.7;
                vec2 flow = curlNoise(inkCoords * 1.5 + vec2(u_time * 0.15, u_time * 0.08));
                vec2 advectedP = inkCoords + flow * (0.35 + u_mids * 0.6);
                
                float f1 = fbm(advectedP * 2.2 + vec2(u_time * 0.06));
                float f2 = fbm(advectedP * 4.5 - flow * 0.5);
                float inkDensity = smoothstep(0.2, 0.85, f1 * 0.7 + f2 * 0.4);

                // Color Ramps: Translucent colored inks blooming through fluid
                vec3 inkBloom = mix(u_ink_c1, u_ink_c2, smoothstep(0.1, 0.5, f1));
                inkBloom = mix(inkBloom, u_ink_c3, smoothstep(0.4, 0.8, f2));
                inkBloom = mix(inkBloom, u_ink_c4, smoothstep(0.65, 0.95, f1 * f2));

                // -------------------------------------------------------------
                // 2. FERROFLUID MATERIAL PROPERTIES (Obsidian Liquid Mirror)
                // -------------------------------------------------------------
                // Pure ferrofluid is jet black obsidian magnetite:
                vec3 ferrofluidAlbedo = vec3(0.015, 0.018, 0.025);

                // Ink pools in fluid valleys, while spike tips remain pure metallic obsidian
                float spikeTipFactor = smoothstep(0.15, 0.85, finalH / (0.6 + u_sub * 2.0));
                vec3 surfaceAlbedo = mix(inkBloom * 0.85, ferrofluidAlbedo, spikeTipFactor);

                // -------------------------------------------------------------
                // 3. LIGHTING RIG & SPECULAR HIGHLIGHTS
                // -------------------------------------------------------------
                // Key Light: Overhead warm silver
                vec3 lKey = normalize(vec3(0.5, 1.4, -0.6));
                float diffKey = max(0.0, dot(N, lKey));
                vec3 hKey = normalize(lKey + V);
                float specKey = pow(max(0.0, dot(N, hKey)), 64.0); // Sharp GGX-like glint

                // Rim Light: Backlight grazing edges to silhouette spike needles
                vec3 lRim = normalize(vec3(-0.6, 0.8, 1.2));
                float diffRim = max(0.0, dot(N, lRim));
                vec3 hRim = normalize(lRim + V);
                float specRim = pow(max(0.0, dot(N, hRim)), 32.0);

                // Ambient Sky / Fill
                float diffAmb = 0.35 + 0.65 * max(0.0, N.y);

                // Fresnel Iridescent Oil-Slick Sheen at Glancing Angles
                float NdotV = max(0.0, dot(N, V));
                float fresnel = pow(1.0 - NdotV, 4.0);
                
                // Thin-film interference color shift across rainbow spectrum:
                vec3 iridescence = 0.5 + 0.5 * cos(fresnel * 6.28318 * vec3(1.0, 1.2, 1.4) + vec3(0.0, 1.2, 2.4) + u_time * 0.5);
                vec3 specularColor = mix(vec3(1.0, 0.98, 0.95), iridescence, 0.75);

                // Crevasse Ambient Occlusion: Valleys between spikes are naturally occluded
                float ao = clamp(finalH * 1.5 + 0.25, 0.2, 1.0);

                // Composite Shading Model
                vec3 finalColor = surfaceAlbedo * (diffKey * 0.6 + diffAmb * 0.4 + diffRim * 0.3) * ao;
                finalColor += specularColor * (specKey * 1.6 + specRim * 1.2) * (1.0 + u_highs * 0.8);
                finalColor += iridescence * fresnel * 0.55;

                // Ink Bioluminescent Self-Illumination in Valleys (Translucent Backscatter)
                finalColor += inkBloom * (1.0 - spikeTipFactor) * (0.15 + u_energy * 0.35) * ao;

                // Drop Flash / Shockwave Luminescence
                if (u_drop_time >= 0.0 && u_drop_time < 0.6) {
                    finalColor += vec3(0.9, 0.95, 1.0) * exp(-u_drop_time * 6.0) * (u_drop * 0.5);
                }

                // Vignette & Distance Fog
                float fogDist = length(p - ro);
                float fogFactor = smoothstep(6.0, 11.5, fogDist);
                finalColor = mix(finalColor, bgColor, fogFactor);

                gl_FragColor = vec4(finalColor, u_alpha);
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
        this.turntableAngle += dt * 0.18; // Slow serene turntable orbit

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
        u.u_rot.value = this.turntableAngle;
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
        // Cycle ink palette and magnetic pole configuration
        this.paletteIdx = (this.paletteIdx + 1) % this.palettes.length;
        this.magneticMode = (this.magneticMode + 1) % 4;

        var pal = this.palettes[this.paletteIdx];
        if (this.material && this.material.uniforms) {
            this.material.uniforms.u_ink_c1.value.set(...pal.c1);
            this.material.uniforms.u_ink_c2.value.set(...pal.c2);
            this.material.uniforms.u_ink_c3.value.set(...pal.c3);
            this.material.uniforms.u_ink_c4.value.set(...pal.c4);
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
