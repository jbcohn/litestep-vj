/**
 * VJ Visualizer - Scene 3: Iridescent Soap Bubble Foam Cluster
 * Faithful implementation of the Bubble Surface Studio simulation & Michel-Lévy optics:
 *  - Real physical thin-film interference optics (Michel-Lévy color sequence Delta = 2 n d cos theta)
 *  - Cohesive capillary foam clustering (Plateau's laws, touching bubbles with contact chords)
 *  - Multi-tier distribution matching user reference: macro chambers, medium bubbles, interstitial pearls
 *  - Soft dual Gaussian specular highlights (upper-left light reflection)
 *  - Total Internal Reflection (TIR) bright inner fringe
 *  - Dynamic beat reactivity:
 *      * Mids drive silky rainbow interference phase shimmer
 *      * Bass causes organic capillary breathing of the foam raft
 *      * Sharp drops spawn glistening iridescent droplet particles
 */

// =============================================================================
// 1. MICHEL-LÉVY THIN-FILM OPTICAL INTERFERENCE TABLE
// =============================================================================

const MICHEL_LEVY_STOPS = [
    [0.00, [225, 235, 245]], // Pearlescent silver
    [0.12, [245, 230, 180]], // Straw-gold
    [0.25, [250, 185, 140]], // Peach-coral
    [0.38, [235, 130, 185]], // Rose-magenta
    [0.50, [150, 145, 235]], // Violet-cobalt
    [0.63, [100, 205, 240]], // Sky-cyan
    [0.75, [130, 235, 195]], // Seafoam-emerald
    [0.88, [230, 215, 140]], // Lime-gold
    [1.00, [245, 155, 175]]  // Second-order magenta
];

function interpolateMichelLevyColor(t, saturation) {
    t = ((t % 1.0) + 1.0) % 1.0;
    let idx = 0;
    for (let k = 0; k < MICHEL_LEVY_STOPS.length - 1; k++) {
        if (t >= MICHEL_LEVY_STOPS[k][0] && t <= MICHEL_LEVY_STOPS[k + 1][0]) {
            idx = k;
            break;
        }
    }
    const t0 = MICHEL_LEVY_STOPS[idx][0], t1 = MICHEL_LEVY_STOPS[idx + 1][0];
    const f = (t - t0) / (t1 - t0);
    const c0 = MICHEL_LEVY_STOPS[idx][1], c1 = MICHEL_LEVY_STOPS[idx + 1][1];

    let r = c0[0] + (c1[0] - c0[0]) * f;
    let g = c0[1] + (c1[1] - c0[1]) * f;
    let b = c0[2] + (c1[2] - c0[2]) * f;

    if (saturation < 1.0) {
        const pR = 235, pG = 240, pB = 248;
        r = pR + (r - pR) * saturation;
        g = pG + (g - pG) * saturation;
        b = pB + (b - pB) * saturation;
    }
    return [Math.round(r), Math.round(g), Math.round(b)];
}

// Bounded texture cache for high-performance 60fps rendering
const BUBBLE_TEX_CACHE = new Map();
const MAX_CACHE_SIZE = 400;

function getSoapFilmTexture(radiusPx, seed, phaseOffset, saturation) {
    const rInt = Math.max(3, Math.round(radiusPx));
    const variant = seed % 10;
    const phaseQ = Math.round(((phaseOffset % 1.0) + 1.0) % 1.0 * 12);
    const key = `${rInt}_${variant}_${phaseQ}`;

    if (BUBBLE_TEX_CACHE.has(key)) return BUBBLE_TEX_CACHE.get(key);

    const size = rInt * 2;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    const cx = rInt, cy = rInt, rFloat = rInt;
    const centerAlpha = 35.0;
    const rimAlpha = 230.0;

    for (let y = 0; y < size; y++) {
        const dy = y - cy;
        for (let x = 0; x < size; x++) {
            const dx = x - cx;
            const distSq = dx * dx + dy * dy;
            if (distSq > rFloat * rFloat) continue;

            const dist = Math.sqrt(distSq);
            const normDist = dist / rFloat; // 0 center -> 1 rim

            // Spherical dome viewing angle cos(theta)
            const cosTheta = Math.sqrt(Math.max(0.0, 1.0 - normDist * normDist));
            const nx = dx / rFloat, ny = dy / rFloat;

            // Natural lighting bias towards upper-left
            const lightBias = (-nx * 0.16 - ny * 0.16) * (1.0 - normDist);
            const deltaPhase = 1.35 * Math.max(0.0, 1.0 - cosTheta + lightBias) + (variant / 10.0) * 0.12 + phaseOffset;

            const [rgbR, rgbG, rgbB] = interpolateMichelLevyColor(deltaPhase, saturation);

            // Fresnel rim reflection
            const fresnelRefl = Math.pow(normDist, 2.4);
            const alphaVal = Math.min(255, Math.max(0, centerAlpha + (rimAlpha - centerAlpha) * fresnelRefl));

            const pIdx = (y * size + x) * 4;
            data[pIdx]     = rgbR;
            data[pIdx + 1] = rgbG;
            data[pIdx + 2] = rgbB;
            data[pIdx + 3] = Math.round(alphaVal);
        }
    }

    ctx.putImageData(imgData, 0, 0);

    if (BUBBLE_TEX_CACHE.size >= MAX_CACHE_SIZE) {
        const firstKey = BUBBLE_TEX_CACHE.keys().next().value;
        BUBBLE_TEX_CACHE.delete(firstKey);
    }
    BUBBLE_TEX_CACHE.set(key, canvas);
    return canvas;
}

// =============================================================================
// 2. SCENE BUBBLES CONTROLLER & PHYSICS
// =============================================================================

class BubbleScene {
    constructor() {
        this.name = "Bubbles";
        this.canvas = null;
        this.ctx = null;
        this.time = 0;

        this.numBubbles = 46;
        this.bubbles = [];
        this.contactPairs = [];
        this.particles = [];

        // Center cluster position & gentle drift
        this.clusterCenter = { x: 0, y: 0 };
        this.driftAngle = 0;

        // Looping Vertical Stream & Foam Dynamics
        this.flowDirection = 1;       // 1: Top to Bottom (down), -1: Bottom to Top (up)
        this.flowSpeed = 1.0;         // Multiplier 0.2x to 3.0x
        this.shimmerSpeed = 1.0;      // Film interference shimmer speed

        // 0 to 3 Interactive Deflection Obstacles
        this.numObstacles = 2;        // Default: 2 staggered slalom pegs
        this.obstacles = [];

        // Liquid Beat Hit & Pop state
        this.beatHit = 0.0;
        this.dancePhase = 0.0;
        this.swayPhase = 0.0;
        this.ripples = [];

        // Thin-film interference phase driven by audio
        this.filmPhase = 0.0;

        // Palettes
        this.palettes = [
            {
                name: "Iridescent Soap Film",
                bg: "#000000",
                rimColor: "rgba(220, 238, 255, 0.72)",
                tirColor: "rgba(255, 255, 255, 0.42)",
                chordColor: "rgba(220, 238, 255, 0.65)",
                highlightColor: [255, 255, 255, 0.50],
                isIridescent: true,
                saturation: 0.95
            },
            {
                name: "Neon Bioluminescent",
                bg: "#030712",
                rimColor: "rgba(56, 189, 248, 0.85)",
                tirColor: "rgba(244, 114, 182, 0.65)",
                chordColor: "rgba(56, 189, 248, 0.80)",
                highlightColor: [224, 242, 254, 0.60],
                isIridescent: true,
                saturation: 1.0
            },
            {
                name: "Minimal Platinum Rings",
                bg: "#000000",
                rimColor: "rgba(241, 245, 249, 0.85)",
                tirColor: "rgba(255, 255, 255, 0.50)",
                chordColor: "rgba(241, 245, 249, 0.80)",
                highlightColor: [255, 255, 255, 0.65],
                isIridescent: false,
                saturation: 0.3
            }
        ];
        this.paletteIdx = 0;
        this.isInitialized = false;
    }

    init(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this.buildCluster();
        this.isInitialized = true;
    }

    resize(width, height) {
        this._updateObstaclesLayout(width, height);
    }

    _updateObstaclesLayout(w, h) {
        w = w || (this.canvas ? this.canvas.width : window.innerWidth);
        h = h || (this.canvas ? this.canvas.height : window.innerHeight);

        var prevPulses = (this.obstacles || []).map(o => o.pulse || 0);

        if (this.numObstacles === 0) {
            this.obstacles = [];
        } else if (this.numObstacles === 1) {
            this.obstacles = [
                {
                    x: w * 0.5,
                    y: h * 0.5,
                    r: Math.max(38, Math.min(w, h) * 0.08 + 25),
                    pulse: prevPulses[0] || 0
                }
            ];
        } else if (this.numObstacles === 2) {
            var rPeg = Math.max(32, Math.min(w, h) * 0.065 + 20);
            this.obstacles = [
                {
                    x: w * 0.36,
                    y: h * 0.38,
                    r: rPeg,
                    pulse: prevPulses[0] || 0
                },
                {
                    x: w * 0.64,
                    y: h * 0.62,
                    r: rPeg,
                    pulse: prevPulses[1] || 0
                }
            ];
        } else {
            var rTri = Math.max(28, Math.min(w, h) * 0.055 + 18);
            this.obstacles = [
                {
                    x: w * 0.50,
                    y: h * 0.30,
                    r: rTri,
                    pulse: prevPulses[0] || 0
                },
                {
                    x: w * 0.30,
                    y: h * 0.68,
                    r: rTri,
                    pulse: prevPulses[1] || 0
                },
                {
                    x: w * 0.70,
                    y: h * 0.68,
                    r: rTri,
                    pulse: prevPulses[2] || 0
                }
            ];
        }
    }

    buildCluster() {
        var w = this.canvas ? this.canvas.width : window.innerWidth;
        var h = this.canvas ? this.canvas.height : window.innerHeight;
        this.clusterCenter = { x: w / 2, y: h / 2 };
        this._updateObstaclesLayout(w, h);

        this.bubbles = [];
        var specs = [
            { count: 4,  minR: 65, maxR: 105 },
            { count: 16, minR: 26, maxR: 54  },
            { count: 26, minR: 7,  maxR: 20  }
        ];

        var idx = 0;
        var baseVy = this.flowDirection * 65.0 * this.flowSpeed;

        for (var s = 0; s < specs.length; s++) {
            for (var c = 0; c < specs[s].count; c++) {
                var r = specs[s].minR + Math.random() * (specs[s].maxR - specs[s].minR);
                var x = 30 + Math.random() * (w - 60);
                var y = Math.random() * h;
                this.bubbles.push({
                    id: idx++,
                    x: x,
                    y: y,
                    vx: (Math.random() - 0.5) * 8,
                    vy: baseVy * (0.8 + Math.random() * 0.4),
                    r: r,
                    baseR: r,
                    renderR: r,
                    flex: 0.0,
                    flexVel: 0.0,
                    mass: 14.0 + r,
                    angle: Math.random() * Math.PI * 2,
                    rotSpeed: (Math.random() - 0.5) * 0.3
                });
            }
        }
    }

    agitateCluster() {
        this.paletteIdx = (this.paletteIdx + 1) % this.palettes.length;
        this.flowDirection *= -1; // Reverse liquid dance flow
        this.beatHit = 1.0;

        var cx = this.clusterCenter.x, cy = this.clusterCenter.y;
        // Big propagating ripple wave
        this.ripples.push({
            x: cx,
            y: cy,
            radius: 5,
            speed: 420,
            maxRadius: 420,
            strength: 45.0,
            life: 1.0
        });

        this.bubbles.forEach(b => {
            b.flexVel += (Math.random() * 0.4 + 0.35);
            var dx = b.x - cx, dy = b.y - cy;
            var d = Math.sqrt(dx * dx + dy * dy) + 1;
            var tx = -dy / d, ty = dx / d;
            b.vx += tx * 22 * this.flowDirection;
            b.vy += ty * 22 * this.flowDirection;
            b.rotSpeed += (Math.random() - 0.5) * 2.5;
        });

        var randomBubble = this.bubbles[Math.floor(Math.random() * this.bubbles.length)];
        if (randomBubble) this.spawnDroplets(randomBubble.x, randomBubble.y, 16);
    }

    stir(x, y, vx, vy) {
        var radius = 180;
        var rSq = radius * radius;
        var vMag = Math.sqrt(vx * vx + vy * vy);
        if (vMag < 0.5) return;

        for (var i = 0; i < this.bubbles.length; i++) {
            var b = this.bubbles[i];
            var dx = b.x - x, dy = b.y - y;
            var dSq = dx * dx + dy * dy;
            if (dSq < rSq) {
                var d = Math.sqrt(dSq);
                var factor = 1.0 - d / radius;
                var curlX = -dy / (d + 1);
                var curlY =  dx / (d + 1);
                b.vx += (vx * 0.35 + curlX * vMag * 0.45) * factor;
                b.vy += (vy * 0.35 + curlY * vMag * 0.45) * factor;
                b.flexVel += factor * 0.25;
                b.rotSpeed += ((Math.random() - 0.5) * 3.0 + (vx * curlY - vy * curlX) * 0.04) * factor;
            }
        }
        if (vMag > 28 && Math.random() < 0.22) {
            this.spawnDroplets(x, y, 6);
        }
    }

    spawnDroplets(x, y, count) {
        for (var i = 0; i < count; i++) {
            var ang = Math.random() * Math.PI * 2;
            var spd = 40 + Math.random() * 120;
            this.particles.push({
                x: x, y: y,
                vx: Math.cos(ang) * spd,
                vy: Math.sin(ang) * spd,
                r: 1.5 + Math.random() * 2.5,
                alpha: 1.0,
                decay: 0.8 + Math.random() * 1.2
            });
        }
    }

    update(dt, audio) {
        if (!this.isInitialized) return;
        this.time += dt;

        // Film phase driven by shimmer speed and audio
        this.filmPhase += (0.04 + (audio.mids || 0) * 0.18) * this.shimmerSpeed * dt;

        var w = this.canvas ? this.canvas.width : window.innerWidth;
        var h = this.canvas ? this.canvas.height : window.innerHeight;

        // Reset contact pair list each frame
        this.contactPairs = [];

        // Continuous rhythmic fluid sway & dance phases
        this.dancePhase = (this.dancePhase || 0) + (0.20 + (audio.mids || 0) * 0.15) * dt;
        this.swayPhase  = (this.swayPhase || 0)  + (0.85 + (audio.bass || 0) * 0.35) * dt;

        if (audio.isBeat) {
            this.beatHit = 1.0;
        }
        this.beatHit = Math.max(0, this.beatHit - dt * 2.2);

        // Update obstacle pulses
        if (this.obstacles && this.obstacles.length > 0) {
            for (var o = 0; o < this.obstacles.length; o++) {
                this.obstacles[o].pulse = Math.max(0, (this.obstacles[o].pulse || 0) - dt * 2.5);
            }
        }

        // Target looping vertical speed (continuous waterfall or rising effervescence)
        var targetVy = this.flowDirection * 75.0 * this.flowSpeed;

        for (var i = 0; i < this.bubbles.length; i++) {
            var b1 = this.bubbles[i];

            // Bubble breathing — harmonic spring
            var springK = 20.0, dampK = 9.0;
            b1.flexVel += (-b1.flex * springK - b1.flexVel * dampK) * dt;
            b1.flex    += b1.flexVel * dt;
            b1.flex     = Math.max(-0.14, Math.min(0.26, b1.flex));
            b1.renderR  = Math.max(2.0, b1.r * (1.0 + b1.flex));

            // 1. Continuous vertical flow acceleration
            b1.vy += (targetVy - b1.vy) * 2.2 * dt;

            // 2. Harmonic lateral fluid sway current
            var fluidSway = Math.sin(this.swayPhase + b1.y * 0.0035 + (b1.id % 5) * 0.4) * (24.0 + (audio.bass || 0) * 18.0);
            b1.vx += fluidSway * dt;

            // Beat flex pulse
            if (audio.isBeat) {
                b1.flexVel += 0.14 + (audio.bass || 0) * 0.12;
            }

            // 3. Obstacle Collision & Streamline Deflection Physics
            if (this.obstacles && this.obstacles.length > 0) {
                for (var oi = 0; oi < this.obstacles.length; oi++) {
                    var obs = this.obstacles[oi];
                    var dxObs = b1.x - obs.x;
                    var dyObs = b1.y - obs.y;
                    var dSqObs = dxObs * dxObs + dyObs * dyObs;
                    var rSum = b1.renderR + obs.r;
                    var rDef = rSum * 1.65;

                    if (dSqObs < rDef * rDef && dSqObs > 0.01) {
                        var dObs = Math.sqrt(dSqObs);
                        var nx = dxObs / dObs, ny = dyObs / dObs;

                        // Tangential streamline force (diverts bubbles gracefully around flanks)
                        var side = (dxObs >= 0) ? 1.0 : -1.0;
                        var tx = -ny * side, ty = nx * side;
                        var cushion = (rDef - dObs) / (rDef - rSum);
                        var defForce = Math.min(1.0, cushion) * 92.0 * this.flowSpeed;
                        b1.vx += tx * defForce * dt;
                        b1.vy += ty * defForce * dt * 0.45;

                        // Hard elastic contact
                        if (dObs < rSum) {
                            var overlap = rSum - dObs;
                            var bounce = (130.0 + overlap * 20.0);
                            b1.vx += (nx * bounce) / b1.mass;
                            b1.vy += (ny * bounce) / b1.mass;
                            b1.flexVel += 0.28 * (overlap / b1.r + 0.15);
                            obs.pulse = Math.min(1.0, (obs.pulse || 0) + 0.35);

                            if (Math.random() < 0.25 && (audio.isBeat || overlap > 4.0)) {
                                this.spawnDroplets(obs.x + nx * obs.r, obs.y + ny * obs.r, 4);
                            }
                        }
                    }
                }
            }

            // 4. Inter-Bubble Outer Ring Repulsion & Plateau Chords
            for (var j = i + 1; j < this.bubbles.length; j++) {
                var b2 = this.bubbles[j];
                var dx = b2.x - b1.x, dy = b2.y - b1.y;
                var distSq = dx * dx + dy * dy;

                var r1 = b1.renderR;
                var r2 = b2.renderR;
                var maxR = Math.max(r1, r2);
                var physicalRadius = (r1 + r2) * 0.95;

                var bigSizeRatio = Math.max(0, (maxR - 22) / 40);
                var ringMultiplier = 1.85 + bigSizeRatio * 0.40;
                var outerRingRadius = physicalRadius * ringMultiplier;
                var forceMult = 1.0 + bigSizeRatio * 1.4;

                if (distSq < outerRingRadius * outerRingRadius && distSq > 0.01) {
                    var dist = Math.sqrt(distSq);
                    var nx2 = dx / dist, ny2 = dy / dist;

                    if (dist >= physicalRadius) {
                        var cushion2 = (outerRingRadius - dist) / (outerRingRadius - physicalRadius);
                        var ringPush = cushion2 * cushion2 * 44.0 * forceMult;
                        b1.vx -= (nx2 * ringPush) / b1.mass;
                        b1.vy -= (ny2 * ringPush) / b1.mass;
                        b2.vx += (nx2 * ringPush) / b2.mass;
                        b2.vy += (ny2 * ringPush) / b2.mass;
                    } else {
                        var overlap2 = physicalRadius - dist;
                        var firmPush = (44.0 + overlap2 * 5.0) * forceMult;
                        b1.vx -= (nx2 * firmPush) / b1.mass;
                        b1.vy -= (ny2 * firmPush) / b1.mass;
                        b2.vx += (nx2 * firmPush) / b2.mass;
                        b2.vy += (ny2 * firmPush) / b2.mass;

                        this.contactPairs.push({
                            i: i, j: j,
                            p1: { x: b1.x, y: b1.y, r: r1 },
                            p2: { x: b2.x, y: b2.y, r: r2 },
                            dist: dist
                        });
                    }
                }
            }

            // Marangoni surface film rotation
            b1.angle    += b1.rotSpeed * dt;
            b1.rotSpeed *= 0.98;

            // Fluid motion integration
            b1.x  += b1.vx * dt * 26;
            b1.y  += b1.vy * dt * 26;
            b1.vx *= 0.935;
            b1.vy *= 0.935;

            // Seamless Looping Boundary Wrapping across vertical flow direction
            var br = b1.renderR || b1.r;
            if (this.flowDirection > 0) {
                // Flowing DOWN: wrap from bottom to top
                if (b1.y - br > h + 15) {
                    b1.y = -br - Math.random() * 45;
                    b1.x = 30 + Math.random() * (w - 60);
                    b1.vy = targetVy * (0.8 + Math.random() * 0.4);
                    b1.vx = (Math.random() - 0.5) * 12;
                }
            } else {
                // Flowing UP: wrap from top to bottom
                if (b1.y + br < -15) {
                    b1.y = h + br + Math.random() * 45;
                    b1.x = 30 + Math.random() * (w - 60);
                    b1.vy = targetVy * (0.8 + Math.random() * 0.4);
                    b1.vx = (Math.random() - 0.5) * 12;
                }
            }

            // Horizontal wrapping
            if (b1.x < -br) {
                b1.x = w + br;
            } else if (b1.x > w + br) {
                b1.x = -br;
            }
        }

        // Popping Droplet Particles
        if (audio.isBeat && audio.beatConfidence > 0.80 && Math.random() < 0.25) {
            var anyBubble = this.bubbles[Math.floor(Math.random() * this.bubbles.length)];
            if (anyBubble) this.spawnDroplets(anyBubble.x, anyBubble.y, 4);
        }
        for (var p = this.particles.length - 1; p >= 0; p--) {
            var pt = this.particles[p];
            pt.x    += pt.vx * dt;
            pt.y    += pt.vy * dt;
            pt.alpha -= pt.decay * dt;
            if (pt.alpha <= 0) this.particles.splice(p, 1);
        }
    }

    draw(ctx, width, height, alpha, audio) {
        alpha = alpha === undefined ? 1.0 : alpha;
        if (alpha <= 0.001) return;

        var pal = this.palettes[this.paletteIdx];

        ctx.save();
        ctx.globalAlpha = alpha;

        // Pure pitch-black background
        ctx.fillStyle = pal.bg;
        ctx.fillRect(0, 0, width, height);

        // 0. Render Deflection Obstacles (Sleek Obsidian/Quartz Luminous Glass Spheres)
        if (this.obstacles && this.obstacles.length > 0) {
            for (var o = 0; o < this.obstacles.length; o++) {
                var obs = this.obstacles[o];
                var pulse = obs.pulse || 0;
                var or = obs.r;

                // Outer caustic rim glow reacting to bubble impacts and beat
                var glowR = or * (1.18 + pulse * 0.22);
                var glowGrad = ctx.createRadialGradient(obs.x, obs.y, or * 0.8, obs.x, obs.y, glowR);
                var rimAlpha = 0.25 + pulse * 0.55 + ((audio && audio.bass) ? audio.bass : 0) * 0.2;
                glowGrad.addColorStop(0.0, "rgba(220, 238, 255, 0.0)");
                glowGrad.addColorStop(0.6, `rgba(180, 225, 255, ${rimAlpha * 0.4})`);
                glowGrad.addColorStop(0.85, `rgba(140, 200, 255, ${rimAlpha * 0.7})`);
                glowGrad.addColorStop(1.0, "rgba(200, 235, 255, 0.0)");
                ctx.fillStyle = glowGrad;
                ctx.beginPath();
                ctx.arc(obs.x, obs.y, glowR, 0, Math.PI * 2);
                ctx.fill();

                // Dark obsidian sphere body
                var bodyGrad = ctx.createRadialGradient(
                    obs.x - or * 0.35, obs.y - or * 0.35, or * 0.1,
                    obs.x, obs.y, or
                );
                bodyGrad.addColorStop(0.0, "#1e293b");
                bodyGrad.addColorStop(0.5, "#0f172a");
                bodyGrad.addColorStop(0.9, "#050811");
                bodyGrad.addColorStop(1.0, "#020408");
                ctx.fillStyle = bodyGrad;
                ctx.beginPath();
                ctx.arc(obs.x, obs.y, or, 0, Math.PI * 2);
                ctx.fill();

                // Refractive inner ring
                ctx.strokeStyle = `rgba(220, 240, 255, ${0.45 + pulse * 0.35})`;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(obs.x, obs.y, Math.max(1, or - 2.5), 0, Math.PI * 2);
                ctx.stroke();

                // Upper-left high-gloss specular highlight
                var specGrad = ctx.createRadialGradient(
                    obs.x - or * 0.38, obs.y - or * 0.38, 0,
                    obs.x - or * 0.38, obs.y - or * 0.38, or * 0.28
                );
                specGrad.addColorStop(0.0, "rgba(255, 255, 255, 0.85)");
                specGrad.addColorStop(0.4, "rgba(230, 245, 255, 0.55)");
                specGrad.addColorStop(1.0, "rgba(200, 230, 255, 0.0)");
                ctx.fillStyle = specGrad;
                ctx.beginPath();
                ctx.arc(obs.x - or * 0.38, obs.y - or * 0.38, or * 0.28, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // Sort bubbles largest first so smaller interstitial pearls layer crisply on top
        var sorted = this.bubbles.slice().sort((a, b) => (b.renderR || b.r) - (a.renderR || a.r));

        // 1. Draw Iridescent Soap Film Domes (Rotating with Marangoni film angle)
        for (var i = 0; i < sorted.length; i++) {
            var b = sorted[i];
            var br = b.renderR || b.r;
            if (br < 1.0) continue;

            if (pal.isIridescent) {
                if (br >= 3.0) {
                    var tex = getSoapFilmTexture(br, b.id, this.filmPhase, pal.saturation);
                    ctx.save();
                    ctx.translate(b.x, b.y);
                    ctx.rotate(b.angle);
                    ctx.drawImage(tex, -br, -br, br * 2, br * 2);
                    ctx.restore();
                } else {
                    ctx.fillStyle = "rgba(220, 238, 255, 0.4)";
                    ctx.beginPath();
                    ctx.arc(b.x, b.y, br, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // 2. Crisp Outer Rim Membrane
            ctx.strokeStyle = pal.rimColor;
            ctx.lineWidth = Math.max(1.0, br > 40 ? 1.8 : 1.2);
            ctx.beginPath();
            ctx.arc(b.x, b.y, br, 0, Math.PI * 2);
            ctx.stroke();

            // 3. TIR (Total Internal Reflection) bright inner ring fringe
            if (br >= 12.0) {
                ctx.strokeStyle = pal.tirColor;
                ctx.lineWidth = 1.0;
                ctx.beginPath();
                ctx.arc(b.x, b.y, Math.max(1, br - 2.5), 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        // 4. Contact Chords (Plateau Borders) between touching bubbles
        if (this.contactPairs.length > 0) {
            ctx.strokeStyle = pal.chordColor;
            ctx.lineWidth = 1.6;
            ctx.lineCap = "round";
            ctx.beginPath();

            for (var c = 0; c < this.contactPairs.length; c++) {
                var cp = this.contactPairs[c];
                var dx = cp.p2.x - cp.p1.x, dy = cp.p2.y - cp.p1.y;
                var d = cp.dist;
                var r1 = cp.p1.r, r2 = cp.p2.r;
                var a = (d * d - r2 * r2 + r1 * r1) / (2.0 * d);
                var hSq = r1 * r1 - a * a;
                if (hSq <= 0) continue;

                var h = Math.sqrt(hSq);
                var ux = dx / d, uy = dy / d;
                var cx = cp.p1.x + ux * a, cy = cp.p1.y + uy * a;
                var px = -uy, py = ux; // Perpendicular

                ctx.moveTo(cx - px * h, cy - py * h);
                ctx.lineTo(cx + px * h, cy + py * h);
            }
            ctx.stroke();
        }

        // 5. Specular Highlights / Light Glints (Soft Gaussian gleam at upper-left)
        var [hlR, hlG, hlB, hlA] = pal.highlightColor;
        for (var s2 = 0; s2 < sorted.length; s2++) {
            var b2 = sorted[s2];
            var br2 = b2.renderR || b2.r;
            if (br2 < 5.0) continue;

            var hlDx = -br2 * 0.36;
            var hlDy = -br2 * 0.36;
            var hlRVal = Math.max(1.8, br2 * 0.26);

            // Primary Gaussian glint
            var grad = ctx.createRadialGradient(
                b2.x + hlDx, b2.y + hlDy, 0,
                b2.x + hlDx, b2.y + hlDy, hlRVal
            );
            grad.addColorStop(0.0, `rgba(${hlR}, ${hlG}, ${hlB}, ${hlA})`);
            grad.addColorStop(0.4, `rgba(${hlR}, ${hlG}, ${hlB}, ${hlA * 0.7})`);
            grad.addColorStop(0.8, `rgba(${hlR}, ${hlG}, ${hlB}, ${hlA * 0.15})`);
            grad.addColorStop(1.0, `rgba(${hlR}, ${hlG}, ${hlB}, 0.0)`);

            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(b2.x + hlDx, b2.y + hlDy, hlRVal, 0, Math.PI * 2);
            ctx.fill();

            // Secondary subtle glint (opposite corner reflection)
            if (br2 > 24.0) {
                var secDx = br2 * 0.40, secDy = br2 * 0.40;
                var secR = Math.max(1.0, br2 * 0.11);
                var gradSec = ctx.createRadialGradient(
                    b2.x + secDx, b2.y + secDy, 0,
                    b2.x + secDx, b2.y + secDy, secR
                );
                gradSec.addColorStop(0.0, `rgba(${hlR}, ${hlG}, ${hlB}, ${hlA * 0.28})`);
                gradSec.addColorStop(1.0, `rgba(${hlR}, ${hlG}, ${hlB}, 0.0)`);

                ctx.fillStyle = gradSec;
                ctx.beginPath();
                ctx.arc(b2.x + secDx, b2.y + secDy, secR, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        // 6. Glistening Iridescent Droplet Particles
        if (this.particles.length > 0) {
            for (var p2 = 0; p2 < this.particles.length; p2++) {
                var pt2 = this.particles[p2];
                ctx.fillStyle = `rgba(220, 238, 255, ${pt2.alpha})`;
                ctx.beginPath();
                ctx.arc(pt2.x, pt2.y, pt2.r, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }

    setNumObstacles(val) {
        this.numObstacles = Math.max(0, Math.min(3, parseInt(val, 10) || 0));
        this._updateObstaclesLayout();
    }

    setFlowDirection(dir) {
        this.flowDirection = (parseInt(dir, 10) >= 0) ? 1 : -1;
    }

    invertFlow() {
        this.flowDirection *= -1;
    }

    setFlowSpeed(val) {
        this.flowSpeed = Math.max(0.1, Math.min(3.0, parseFloat(val) || 1.0));
    }

    setShimmerSpeed(val) {
        this.shimmerSpeed = Math.max(0.1, Math.min(3.0, parseFloat(val) || 1.0));
    }

    cyclePalette() {
        this.paletteIdx = (this.paletteIdx + 1) % this.palettes.length;
    }
}

window.BubbleScene = BubbleScene;
