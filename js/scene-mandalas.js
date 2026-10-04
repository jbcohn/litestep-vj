/**
 * VJ Visualizer - Scene 1: Psychedelic Form Constants & Sacred Geometry Mandalas
 * High-Performance 60FPS Procedural Sacred Geometry & Dynamic Kaleidoscopes:
 *  - Procedural generation: deeply randomized layer composition (2-3 crisp complementary layers)
 *  - 3D Conformal Log-Hexagonal Spiral Lattice (infinite vortex scaling into depth)
 *  - 3D Wireframe Perspective Lattice Tunnel (spokes + rings + diagonal cross-ribs)
 *  - 3D Log-Conformal Spiral Lattice (orthogonal log-spirals forming a curved depth grid)
 *  - 3D Spherical / Hyperbolic Bulge Perspective Lattice (curved dome perspective)
 *  - 3D Polygonal Tunnels with converging depth spokes & warp-tunnel Z-flight
 *  - Dynamic Kaleidoscope Engine with multi-fold mirror symmetry wedges
 *  - High-speed GPU additive radiance bloom (ZERO CPU shadowBlur rasterization overhead)
 *  - Kick & Bass Kinetic Shockwaves with rotational snap
 *  - Interactive mouse/touch drag (spin, pan, zoom, reset)
 */

class MandalaScene {
    constructor() {
        this.name = "Form Constants";
        this.canvas = null;
        this.ctx = null;
        this.time = 0;
        this.paletteIdx = 0;
        this.colorShift = 0.0;
        this.baseRotation = 0;
        this.breathePhase = 0.0;

        // Visual & Performance Tuning Parameters
        this.lineThickness = 1.0;   // Master thickness multiplier (linked to HUD slider)
        this.laserBloom = 1.0;      // Additive center radiance glow (0.0 - 2.5)
        this.symmetry = 0;          // Kaleidoscope symmetry (0=Off, 4, 6, 8, 12, 16, 24)
        this.tunnelSpeed = 1.0;     // Warp tunnel Z-flight speed (-3.0 to 3.0)
        this.tunnelDepth = 0.0;     // Continuous tunnel progression
        this.spinSpeed = 1.0;       // Rotation spin speed (0.0 to 4.0)
        this.audioScale = 1.0;      // Bass kick & reactivity scale (0.0 to 2.5)

        // Kinetic Audio Shockwaves
        this.kickScale = 0.0;
        this.kickTwist = 0.0;

        // Interactive View Controls
        this.panX = 0;
        this.panY = 0;
        this.zoom = 1.0;

        // Offscreen Canvas for Kaleidoscope Engine
        this._offscreenCanvas = null;
        this._offscreenCtx = null;

        this.paletteNames = [
            "Cosmic Aurora", "Neon Cyberpunk", "Rainbow Prism",
            "Pastel Dream", "Lava Flame", "Ocean Breeze", "Gold & Onyx", "Forest Sage"
        ];

        // Clean, High-Performance 2-Layer Archetype Presets
        this.layerPresets = [
            // Preset 0: "Infinite Vortex" (3D LogHex Vortex + Golden-Ratio Sunflower)
            [
                { type:"Lattices", colorOffset:0.0,  params:{grid_type:3, cell_scale:0.065, rotation:0,  thickness:1.8, radius:0.92, double_grid:1, fill_scale:0.78, depth_stroke:1} },
                { type:"Phyllo",   colorOffset:0.35, params:{count:130, div_angle:137.508, radius:0.86, size:0.024, decay:0.46, shape_type:3} }
            ],
            // Preset 1: "Cosmic Wireframe" (3D Wireframe Perspective Tunnel + Harmonic Spirals)
            [
                { type:"Tunnels",  colorOffset:0.0,  params:{rings:12, sides:6, perspective:2.4, twist:1.2, wobble:0.03, radius:0.88, depth_stroke:1} },
                { type:"Spirals",  colorOffset:0.5,  params:{arms:6, tightness:1.02, turns:3.2, wave_amp:0.04, wave_freq:6.0, radius:0.88, depth_stroke:0} }
            ]
        ];
        this.currentPreset = 0;
        this.layers = this._clonePreset(0);
    }

    _clonePreset(idx) {
        return this.layerPresets[idx % this.layerPresets.length].map(l => ({
            type: l.type, active: true, colorOffset: l.colorOffset, params: Object.assign({}, l.params)
        }));
    }

    init(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this._setupInteraction();
    }

    _setupInteraction() {
        if (!this.canvas) return;
        var self = this;
        var isDown = false;
        var startX = 0, startY = 0;

        this.canvas.addEventListener("mousedown", function(e) {
            isDown = true;
            startX = e.clientX;
            startY = e.clientY;
        });

        window.addEventListener("mousemove", function(e) {
            if (!isDown) return;
            var dx = e.clientX - startX;
            var dy = e.clientY - startY;
            startX = e.clientX;
            startY = e.clientY;

            if (e.shiftKey || e.altKey || e.metaKey) {
                self.panX += dx;
                self.panY += dy;
            } else {
                self.baseRotation += dx * 0.007;
            }
        });

        window.addEventListener("mouseup", function() {
            isDown = false;
        });

        this.canvas.addEventListener("wheel", function(e) {
            e.preventDefault();
            var factor = e.deltaY < 0 ? 1.08 : 0.92;
            self.zoom = Math.max(0.3, Math.min(4.5, self.zoom * factor));
        }, { passive: false });

        this.canvas.addEventListener("dblclick", function() {
            self.resetView();
        });

        // Touch support for tablets and mobile devices
        var lastTouchX = 0, lastTouchY = 0, lastTouchDist = 0;
        this.canvas.addEventListener("touchstart", function(e) {
            if (e.touches.length === 1) {
                lastTouchX = e.touches[0].clientX;
                lastTouchY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                var dx = e.touches[0].clientX - e.touches[1].clientX;
                var dy = e.touches[0].clientY - e.touches[1].clientY;
                lastTouchDist = Math.sqrt(dx * dx + dy * dy);
            }
        }, { passive: true });

        this.canvas.addEventListener("touchmove", function(e) {
            if (e.touches.length === 1) {
                var dx = e.touches[0].clientX - lastTouchX;
                var dy = e.touches[0].clientY - lastTouchY;
                lastTouchX = e.touches[0].clientX;
                lastTouchY = e.touches[0].clientY;
                self.baseRotation += dx * 0.008;
            } else if (e.touches.length === 2) {
                var dx = e.touches[0].clientX - e.touches[1].clientX;
                var dy = e.touches[0].clientY - e.touches[1].clientY;
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (lastTouchDist > 0) {
                    var factor = dist / lastTouchDist;
                    self.zoom = Math.max(0.3, Math.min(4.5, self.zoom * factor));
                }
                lastTouchDist = dist;
            }
        }, { passive: true });
    }

    setThickness(val) {
        this.lineThickness = Math.max(0.2, Math.min(8.0, val / 4.0));
    }

    setLaserBloom(val) {
        this.laserBloom = Math.max(0.0, Math.min(3.0, parseFloat(val) || 0.0));
    }

    setSymmetry(val) {
        this.symmetry = parseInt(val, 10) || 0;
    }

    setTunnelSpeed(val) {
        this.tunnelSpeed = parseFloat(val) || 0.0;
    }

    setSpinSpeed(val) {
        this.spinSpeed = Math.max(0.0, Math.min(4.0, parseFloat(val) || 0.0));
    }

    setAudioScale(val) {
        this.audioScale = Math.max(0.0, Math.min(3.0, parseFloat(val) || 1.0));
    }

    setZoom(val) {
        this.zoom = Math.max(0.3, Math.min(4.5, parseFloat(val) || 1.0));
    }

    resetView() {
        this.panX = 0;
        this.panY = 0;
        this.zoom = 1.0;
    }

    setPreset(idx) {
        this.currentPreset = Math.abs(idx) % this.layerPresets.length;
        this.layers = this._clonePreset(this.currentPreset);
    }

    cyclePreset() {
        this.setPreset(this.currentPreset + 1);
    }

    setPalette(idx) {
        this.paletteIdx = Math.abs(idx) % this.paletteNames.length;
    }

    cyclePalette() {
        this.setPalette(this.paletteIdx + 1);
    }

    setParam(key, val) {
        if (key === "thickness") this.setThickness(val);
        else if (key === "bloom") this.setLaserBloom(val);
        else if (key === "symmetry") this.setSymmetry(val);
        else if (key === "speed") this.setTunnelSpeed(val);
        else if (key === "spin") this.setSpinSpeed(val);
        else if (key === "audio") this.setAudioScale(val);
        else if (key === "zoom") this.setZoom(val);
        else if (key === "preset") this.setPreset(val);
        else if (key === "palette") this.setPalette(val);
    }

    getColor(t, palIdx, offset) {
        offset = offset || 0;
        var v = ((t + offset + this.colorShift) % 1.0 + 1.0) % 1.0;
        var name = this.paletteNames[palIdx % this.paletteNames.length];
        var h, s, l;
        if (name === "Gold & Onyx")        { h=0.07+v*0.08; s=0.85; l=0.25+v*0.45; }
        else if (name === "Neon Cyberpunk"){ h=0.82+v*0.35; s=1.0;  l=0.52; }
        else if (name === "Cosmic Aurora") { h=0.48+v*0.35; s=0.95; l=0.45+0.12*Math.sin(v*Math.PI); }
        else if (name === "Forest Sage")   { h=0.22+v*0.16; s=0.60; l=0.35+v*0.25; }
        else if (name === "Lava Flame")    { h=v*0.16;       s=1.0;  l=0.42+v*0.25; }
        else if (name === "Ocean Breeze")  { h=0.65-v*0.2;   s=0.90; l=0.38+v*0.25; }
        else if (name === "Rainbow Prism") { h=v;            s=0.95; l=0.55; }
        else                               { h=0.9+v*0.4;   s=0.75; l=0.72; }
        return 'hsl(' + ((h%1.0)*360).toFixed(1) + ',' + (s*100).toFixed(1) + '%,' + (l*100).toFixed(1) + '%)';
    }

    /**
     * Fully Procedural Mandala Randomizer:
     * Generates a unique, high-performance 2-to-3 layer sacred geometry configuration.
     */
    randomizeGeometry() {
        this.paletteIdx = Math.floor(Math.random() * this.paletteNames.length);

        // Randomize 2 or 3 distinct layer archetypes (65% chance 2 layers, 35% chance 3)
        var pool = ["Lattices", "Tunnels", "Phyllo", "Spirals", "Cobwebs"];
        // Shuffle pool
        for (var i = pool.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var temp = pool[i]; pool[i] = pool[j]; pool[j] = temp;
        }

        var numLayers = Math.random() < 0.65 ? 2 : 3;
        var chosenTypes = pool.slice(0, numLayers);

        this.layers = chosenTypes.map((type) => {
            var colorOffset = Math.random();
            var params = {};

            if (type === "Lattices") {
                // Focus on 3D perspective grids (types 3, 4, 5, 6)
                var gridType = [3, 4, 5, 6][Math.floor(Math.random() * 4)];
                params = {
                    grid_type: gridType,
                    rotation: Math.floor(Math.random() * 60),
                    depth_stroke: 1,
                    double_grid: Math.random() < 0.7 ? 1 : 0,
                    radius: 0.88 + Math.random() * 0.06,
                    thickness: 1.4 + Math.random() * 0.6
                };
                if (gridType === 3) {
                    params.cell_scale = 0.052 + Math.random() * 0.025;
                    params.fill_scale = 0.72 + Math.random() * 0.10;
                } else if (gridType === 4) {
                    params.rings = Math.floor(Math.random() * 6) + 8; // 8 - 14 rings (fast!)
                    params.sides = [4, 6, 8, 10][Math.floor(Math.random() * 4)];
                    params.perspective = 1.8 + Math.random() * 1.2;
                    params.twist = Math.random() * 3.0 - 1.5;
                } else if (gridType === 5) {
                    params.arms = [6, 8, 12, 16][Math.floor(Math.random() * 4)];
                    params.tightness = 0.90 + Math.random() * 0.15;
                    params.turns = 2.5 + Math.random() * 2.0;
                } else if (gridType === 6) {
                    params.cell_scale = 0.065 + Math.random() * 0.025;
                }
            } else if (type === "Tunnels") {
                params = {
                    rings: Math.floor(Math.random() * 6) + 8, // 8 - 14 rings (fast!)
                    sides: [0, 3, 4, 5, 6, 8][Math.floor(Math.random() * 6)],
                    perspective: 1.8 + Math.random() * 1.4,
                    twist: Math.random() * 3.0 - 1.5,
                    wobble: 0.02 + Math.random() * 0.03,
                    radius: 0.85 + Math.random() * 0.05,
                    depth_stroke: 1
                };
            } else if (type === "Phyllo") {
                params = {
                    count: Math.floor(Math.random() * 60) + 90, // 90 - 150 points (fast!)
                    div_angle: [137.508, 137.3, 99.5, 137.5][Math.floor(Math.random() * 4)],
                    radius: 0.82 + Math.random() * 0.06,
                    size: 0.018 + Math.random() * 0.012,
                    decay: 0.42 + Math.random() * 0.10,
                    shape_type: Math.floor(Math.random() * 5)
                };
            } else if (type === "Spirals") {
                params = {
                    arms: [3, 4, 5, 6, 8, 12][Math.floor(Math.random() * 6)],
                    tightness: 0.90 + Math.random() * 0.20,
                    turns: 2.0 + Math.random() * 2.5,
                    wave_amp: Math.random() < 0.6 ? 0.03 + Math.random() * 0.03 : 0.0,
                    wave_freq: Math.floor(Math.random() * 6) + 4,
                    radius: 0.86 + Math.random() * 0.06
                };
            } else if (type === "Cobwebs") {
                params = {
                    count: Math.floor(Math.random() * 6) + 6,  // 6 - 12 spokes
                    rings: Math.floor(Math.random() * 4) + 5,  // 5 - 9 rings
                    spacing: 0.9 + Math.random() * 0.3,
                    sag: Math.random() * 0.30 - 0.08,
                    radius: 0.85 + Math.random() * 0.05,
                    thickness: 1.3 + Math.random() * 0.5
                };
            }

            return { type: type, active: true, colorOffset: colorOffset, params: params };
        });

        // 75% natural geometry, 25% chance of kaleidoscopic mirror reflection
        this.symmetry = Math.random() < 0.25 ? [4, 6, 8, 12][Math.floor(Math.random() * 4)] : 0;
        this.tunnelSpeed = (Math.random() < 0.2 ? -1 : 1) * (0.6 + Math.random() * 1.2);
        this.spinSpeed = 0.6 + Math.random() * 1.0;
    }

    update(dt, audio) {
        this.time += dt;
        var bpm = (audio && audio.bpm) ? audio.bpm : 124;
        var breatheFreq = (bpm / 60.0) / 4.0;
        this.breathePhase = (this.breathePhase + dt * breatheFreq * Math.PI * 2) % (Math.PI * 2);

        this.baseRotation += (0.08 + (audio.mids || 0) * 0.18) * dt * this.spinSpeed;
        this.colorShift = (this.colorShift + dt * 0.04 + (audio.mids || 0) * dt * 0.06) % 1.0;

        // Continuous Warp-Tunnel Z-flight depth progression
        var flightSpeed = (0.28 + (audio.energy || 0.3) * 0.45) * this.tunnelSpeed;
        this.tunnelDepth = (this.tunnelDepth + dt * flightSpeed) % 1.0;
        if (this.tunnelDepth < 0) this.tunnelDepth += 1.0;

        // Kick & Bass Kinetic Shockwaves
        if (audio && audio.isBeat) {
            this.kickScale = Math.min(1.2, this.kickScale + 0.38 * this.audioScale);
            this.kickTwist += (Math.random() > 0.5 ? 1 : -1) * (0.05 + (audio.bass || 0) * 0.08) * this.audioScale;
        }
        this.kickScale *= Math.exp(-6.5 * dt);
        this.kickTwist *= Math.exp(-6.0 * dt);
    }

    draw(ctx, width, height, alpha, audio) {
        alpha = alpha === undefined ? 1.0 : alpha;
        if (alpha <= 0.001) return;
        ctx.save();
        ctx.globalAlpha = alpha;

        var cx = width / 2, cy = height / 2;
        var R = Math.min(width, height) / 2;

        var breathe = Math.sin(this.breathePhase);
        var breathe01 = 0.5 + breathe * 0.5;

        // Audio-reactive radial background gradient
        var bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.75);
        var hueCenter = ((this.colorShift + 0.5) % 1.0) * 360;
        var glowStr = 0.14 + breathe01 * 0.10 + (audio.sub || 0) * 0.08 + this.kickScale * 0.08;
        bgGrad.addColorStop(0,   'hsla(' + hueCenter + ',80%,12%,' + glowStr + ')');
        bgGrad.addColorStop(0.5, 'hsla(' + ((hueCenter + 40) % 360) + ',60%,6%,0.95)');
        bgGrad.addColorStop(1,   '#020410');
        ctx.fillStyle = '#020410';
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        var breathePulse = 1.0 + breathe * 0.048;
        var masterRadius = R * 0.93 * breathePulse * this.zoom * (1.0 + this.kickScale * 0.16);
        var baseScale = masterRadius;
        var pal = this.paletteIdx;

        // Dynamic Kaleidoscope Engine
        if (this.symmetry > 1) {
            if (!this._offscreenCanvas) {
                this._offscreenCanvas = document.createElement("canvas");
                this._offscreenCtx = this._offscreenCanvas.getContext("2d");
            }
            if (this._offscreenCanvas.width !== width || this._offscreenCanvas.height !== height) {
                this._offscreenCanvas.width = width;
                this._offscreenCanvas.height = height;
            }
            var offCtx = this._offscreenCtx;
            offCtx.clearRect(0, 0, width, height);
            offCtx.save();
            offCtx.translate(cx + this.panX, cy + this.panY);
            offCtx.rotate(this.baseRotation + this.kickTwist);
            this.drawLayers(offCtx, baseScale, pal, audio, breathe, masterRadius);
            offCtx.restore();

            var N = this.symmetry;
            var wedgeAngle = (Math.PI * 2) / N;
            var halfWedge = wedgeAngle / 2;
            var wedgeR = Math.max(width, height) * 1.5;

            ctx.save();
            ctx.translate(cx + this.panX, cy + this.panY);
            for (var k = 0; k < N; k++) {
                ctx.save();
                ctx.rotate(k * wedgeAngle);
                if (k % 2 === 1) {
                    ctx.scale(1, -1);
                }
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, wedgeR, -halfWedge - 0.012, halfWedge + 0.012);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(this._offscreenCanvas, -(cx + this.panX), -(cy + this.panY));
                ctx.restore();
            }
            ctx.restore();
        } else {
            // Direct rendering at 60 FPS
            ctx.save();
            ctx.translate(cx + this.panX, cy + this.panY);
            ctx.rotate(this.baseRotation + this.kickTwist);
            this.drawLayers(ctx, baseScale, pal, audio, breathe, masterRadius);
            ctx.restore();
        }

        // Outer glow ring
        ctx.save();
        ctx.translate(cx + this.panX, cy + this.panY);
        ctx.beginPath();
        ctx.arc(0, 0, masterRadius * 0.975, 0, Math.PI * 2);
        ctx.strokeStyle = this.getColor(0.5, pal, 0.2);
        ctx.lineWidth = (1.6 + breathe01 * 1.6 + (audio.sub || 0) * 1.0 + this.kickScale * 1.5) * this.lineThickness;
        ctx.globalAlpha = alpha * (0.22 + breathe01 * 0.24 + (audio.sub || 0) * 0.15 + this.kickScale * 0.2);
        ctx.stroke();
        ctx.restore();

        ctx.restore();
    }

    drawLayers(targetCtx, baseScale, pal, audio, breathe, masterRadius) {
        var self = this;

        // Draw active layers (fast path execution without CPU shadowBlur)
        this.layers.forEach(function(layer) {
            if (!layer.active) return;
            targetCtx.save();
            var p = layer.params, colOff = layer.colorOffset;
            if      (layer.type === "Lattices") self.drawLattices(targetCtx, baseScale, p, pal, colOff, audio, breathe);
            else if (layer.type === "Phyllo")   self.drawPhyllotaxis(targetCtx, baseScale, p, pal, colOff, audio, breathe);
            else if (layer.type === "Spirals")  self.drawSpirals(targetCtx, baseScale, p, pal, colOff, audio, breathe);
            else if (layer.type === "Cobwebs")  self.drawCobwebs(targetCtx, baseScale, p, pal, colOff, audio, breathe);
            else if (layer.type === "Tunnels")  self.drawTunnels(targetCtx, baseScale, p, pal, colOff, audio, breathe);
            targetCtx.restore();
        });

        // Fast GPU Additive Center Radiance Bloom Pass
        if (this.laserBloom > 0.3) {
            targetCtx.save();
            targetCtx.globalCompositeOperation = "lighter";
            var bloomGrad = targetCtx.createRadialGradient(0, 0, 0, 0, 0, masterRadius * 0.88);
            var bloomAlpha = Math.min(0.38, (this.laserBloom - 0.3) * 0.16 + (audio.energy || 0) * 0.10);
            var coreHue = ((this.colorShift * 360) % 360).toFixed(1);
            bloomGrad.addColorStop(0,   'hsla(' + coreHue + ',100%,70%,' + bloomAlpha + ')');
            bloomGrad.addColorStop(0.5, 'hsla(' + ((Number(coreHue) + 50) % 360) + ',90%,55%,' + (bloomAlpha * 0.40) + ')');
            bloomGrad.addColorStop(1,   'rgba(0,0,0,0)');
            targetCtx.fillStyle = bloomGrad;
            targetCtx.beginPath();
            targetCtx.arc(0, 0, masterRadius * 0.88, 0, Math.PI * 2);
            targetCtx.fill();
            targetCtx.restore();
        }
    }

    /* =========================================================================
       3D PERSPECTIVE LATTICES
       Modes:
         3: Conformal Log-Hexagonal Spiral Lattice (Infinite 3D Hex Vortex)
         4: 3D Wireframe Perspective Lattice Tunnel (Spokes + Rings + Diagonal Ribs)
         5: Log-Conformal Orthogonal Spiral Lattice (Vortex Checkerboard)
         6: 3D Spherical Bulge Perspective Lattice (Curved 3D Dome)
       ========================================================================= */
    drawLattices(ctx, baseScale, p, palIdx, colOff, audio, breathe) {
        breathe = breathe !== undefined ? breathe : 0;
        var breathe01  = 0.5 + breathe * 0.5;
        var gridType   = p.grid_type !== undefined ? p.grid_type : 3;
        var cellScale  = (p.cell_scale || 0.065) * (1.0 + breathe01 * 0.04 + (audio.highs || 0) * 0.04);
        var doubleGrid = p.double_grid !== undefined ? p.double_grid : 1;
        var depthStroke= p.depth_stroke !== undefined ? p.depth_stroke : 1;
        var fillScale  = p.fill_scale !== undefined ? p.fill_scale : 0.78;
        var maxR       = (p.radius || 0.90) * baseScale;
        var baseThick  = ((p.thickness || 1.6) + breathe01 * 0.35 + (audio.bass || 0) * 0.25) * this.lineThickness;
        var rotation   = (p.rotation || 0) * Math.PI / 180;
        var self = this;

        ctx.save();
        ctx.rotate(rotation);
        ctx.beginPath();
        ctx.arc(0, 0, maxR, 0, Math.PI * 2);
        ctx.clip();

        // Mode 3: Conformal Log-Hexagonal Perspective Lattice (Infinite Hex Vortex)
        if (gridType === 3) {
            var nSectors = Math.max(6, Math.min(24, Math.round(Math.PI / cellScale)));
            var d_v = (2.0 * Math.PI) / nSectors;
            var d_u = d_v * (Math.sqrt(3.0) / 2.0);
            var rHexLog = d_v / Math.sqrt(3.0);
            var uMax = Math.log(maxR);
            var nRings = Math.ceil(uMax / d_u) + 2;

            for (var r = 0; r <= nRings; r++) {
                var effR = r + this.tunnelDepth;
                var uc = uMax - effR * d_u;
                var rCenter = Math.exp(uc);
                if (rCenter < 1.2) break;

                var rNorm = rCenter / maxR;
                var thick = depthStroke === 1 ? baseThick * Math.max(0.2, rNorm) : baseThick;
                var color = this.getColor(1.0 - rNorm, palIdx, colOff);

                ctx.strokeStyle = color;
                ctx.lineWidth = thick;

                for (var s = 0; s < nSectors; s++) {
                    var vc = s * d_v + (r % 2) * 0.5 * d_v + this.time * 0.08;
                    var hexPts = [];
                    for (var k = 0; k < 6; k++) {
                        var phi = k * (2.0 * Math.PI / 6.0);
                        var uk = uc + rHexLog * fillScale * Math.cos(phi);
                        var vk = vc + rHexLog * fillScale * Math.sin(phi);
                        var rk = Math.exp(uk);
                        hexPts.push({ x: rk * Math.cos(vk), y: rk * Math.sin(vk) });
                    }

                    ctx.beginPath();
                    hexPts.forEach(function(pt, idx) {
                        if (idx === 0) ctx.moveTo(pt.x, pt.y);
                        else ctx.lineTo(pt.x, pt.y);
                    });
                    ctx.closePath();
                    ctx.stroke();

                    if (doubleGrid === 1 && rNorm > 0.08) {
                        ctx.beginPath();
                        hexPts.forEach(function(pt, idx) {
                            if (idx === 0) ctx.moveTo(pt.x * 0.68, pt.y * 0.68);
                            else ctx.lineTo(pt.x * 0.68, pt.y * 0.68);
                        });
                        ctx.closePath();
                        ctx.stroke();
                    }
                }
            }
        }
        // Mode 4: 3D Wireframe Perspective Lattice Tunnel
        else if (gridType === 4) {
            var rings = Math.min(14, p.rings || 12);
            var sides = Math.min(10, p.sides || 8);
            var perspective = p.perspective || 2.4;
            var twistRate = (p.twist || 1.2) * 0.06;

            var ringPoints = [];

            for (var k = 0; k <= rings; k++) {
                var effK = k + this.tunnelDepth;
                var tDepth = perspective / (effK + perspective);
                var ringR = tDepth * maxR;
                var ringRot = (rings - k) * twistRate + this.time * 0.18;
                var pts = [];

                for (var s = 0; s < sides; s++) {
                    var ang = ringRot + s * (2.0 * Math.PI / sides);
                    pts.push({
                        x: ringR * Math.cos(ang),
                        y: ringR * Math.sin(ang),
                        tDepth: tDepth
                    });
                }
                ringPoints.push(pts);
            }

            // 1. Transverse Rings
            for (var k = 0; k <= rings; k++) {
                var pts = ringPoints[k];
                var tD = pts[0].tDepth;
                ctx.beginPath();
                for (var s = 0; s <= sides; s++) {
                    var pt = pts[s % sides];
                    if (s === 0) ctx.moveTo(pt.x, pt.y);
                    else ctx.lineTo(pt.x, pt.y);
                }
                ctx.strokeStyle = this.getColor(tD, palIdx, colOff);
                ctx.lineWidth = depthStroke === 1 ? baseThick * Math.max(0.2, tD) : baseThick;
                ctx.stroke();
            }

            // 2. Converging Perspective Spokes
            for (var s = 0; s < sides; s++) {
                ctx.beginPath();
                for (var k = 0; k <= rings; k++) {
                    var pt = ringPoints[k][s];
                    if (k === 0) ctx.moveTo(pt.x, pt.y);
                    else {
                        ctx.strokeStyle = this.getColor(pt.tDepth, palIdx, colOff + 0.15);
                        ctx.lineWidth = depthStroke === 1 ? baseThick * 0.7 * Math.max(0.2, pt.tDepth) : baseThick * 0.7;
                        ctx.lineTo(pt.x, pt.y);
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(pt.x, pt.y);
                    }
                }
            }

            // 3. Diagonal Lattice Ribs
            for (var k = 0; k < rings; k++) {
                var tD = ringPoints[k][0].tDepth;
                ctx.strokeStyle = this.getColor(tD, palIdx, colOff + 0.35);
                ctx.lineWidth = depthStroke === 1 ? baseThick * 0.5 * Math.max(0.15, tD) : baseThick * 0.5;

                for (var s = 0; s < sides; s++) {
                    var pCurrent = ringPoints[k][s];
                    var pNextRight = ringPoints[k + 1][(s + 1) % sides];
                    var pNextLeft  = ringPoints[k + 1][(s - 1 + sides) % sides];

                    ctx.beginPath();
                    ctx.moveTo(pCurrent.x, pCurrent.y);
                    ctx.lineTo(pNextRight.x, pNextRight.y);
                    ctx.stroke();

                    ctx.beginPath();
                    ctx.moveTo(pCurrent.x, pCurrent.y);
                    ctx.lineTo(pNextLeft.x, pNextLeft.y);
                    ctx.stroke();
                }
            }
        }
        // Mode 5: Log-Conformal Orthogonal Spiral Lattice
        else if (gridType === 5) {
            var arms = Math.min(12, p.arms || 8);
            var tightness = p.tightness || 0.95;
            var turns = (p.turns || 3.5) + (audio.highs || 0) * 0.3;
            var steps = 70;

            for (var dir = -1; dir <= 1; dir += 2) {
                for (var i = 0; i < arms; i++) {
                    var baseAngle = (i * 2 * Math.PI) / arms;
                    ctx.beginPath();

                    for (var s = 0; s <= steps; s++) {
                        var frac = s / steps;
                        var r = Math.pow(frac, tightness) * maxR;
                        var theta = baseAngle + dir * (frac * turns * 2 * Math.PI + this.time * 0.15 + this.tunnelDepth * 2.0);
                        var px = r * Math.cos(theta);
                        var py = r * Math.sin(theta);
                        if (s === 0) ctx.moveTo(px, py);
                        else ctx.lineTo(px, py);
                    }

                    ctx.strokeStyle = this.getColor(i / arms, palIdx, colOff + (dir === 1 ? 0 : 0.4));
                    ctx.lineWidth = depthStroke === 1 ? baseThick * (0.6 + 0.6 * (1.0 - (i / arms))) : baseThick;
                    ctx.stroke();
                }
            }
        }
        // Mode 6: 3D Spherical Bulge Perspective Lattice
        else if (gridType === 6) {
            var gridSpacing = cellScale * baseScale;
            var limit = Math.ceil(maxR / gridSpacing) + 1;

            function projectSphere(x, y) {
                var d = Math.sqrt(x * x + y * y);
                if (d < 1e-5) return { x: x, y: y, tDist: 0 };
                var normD = Math.min(0.99, d / maxR);
                var curveFactor = Math.sin(normD * (Math.PI / 2)) / normD;
                return {
                    x: x * curveFactor,
                    y: y * curveFactor,
                    tDist: normD
                };
            }

            for (var dir = 0; dir < 3; dir++) {
                var baseAng = dir * (Math.PI / 3);
                var cosB = Math.cos(baseAng), sinB = Math.sin(baseAng);

                for (var i = -limit; i <= limit; i++) {
                    var offset = i * gridSpacing;
                    if (Math.abs(offset) >= maxR) continue;

                    var halfSpan = Math.sqrt(maxR * maxR - offset * offset);
                    var segs = 20;
                    var tDist = Math.abs(offset) / maxR;

                    ctx.strokeStyle = this.getColor(tDist, palIdx, colOff + dir * 0.25);
                    ctx.lineWidth = depthStroke === 1 ? baseThick * Math.max(0.2, 1.0 - tDist * 0.65) : baseThick;
                    ctx.beginPath();

                    for (var s = 0; s <= segs; s++) {
                        var span = -halfSpan + (s / segs) * (2 * halfSpan);
                        var rawX = offset * cosB - span * sinB;
                        var rawY = offset * sinB + span * cosB;
                        var p3d = projectSphere(rawX, rawY);
                        if (s === 0) ctx.moveTo(p3d.x, p3d.y);
                        else ctx.lineTo(p3d.x, p3d.y);
                    }
                    ctx.stroke();
                }
            }
        }

        ctx.restore();
    }

    /* =========================================================================
       PHYLLOTAXIS (Golden-ratio sunflower stars & petals)
       ========================================================================= */
    drawPhyllotaxis(ctx, baseScale, p, palIdx, colOff, audio, breathe) {
        breathe = breathe !== undefined ? breathe : 0;
        var breathe01  = 0.5 + breathe * 0.5;
        var count = Math.min(150, p.count || 120);
        var divAngle = ((p.div_angle || 137.508) * Math.PI) / 180.0;
        var baseR = (p.radius || 0.85) * baseScale;
        var baseSize = (p.size || 0.022) * baseScale * Math.sqrt(this.lineThickness);
        var decay = p.decay || 0.46;
        var shapeType = p.shape_type !== undefined ? p.shape_type : 3;

        for (var n = 1; n <= count; n++) {
            var rNorm = Math.sqrt(n / count), r = rNorm * baseR;
            var theta = n * divAngle + this.time * 0.11 + (audio.highs || 0) * 0.04;
            var sx = r * Math.cos(theta), sy = r * Math.sin(theta);
            var size = baseSize * Math.pow(rNorm, decay) * (1.0 + breathe01 * 0.14 + (audio.bass || 0) * 0.10);
            if (size < 0.6) continue;
            var color = this.getColor(rNorm, palIdx, colOff);

            ctx.fillStyle = color;
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(0.5, 1.0 * this.lineThickness);

            if (shapeType === 0) {
                ctx.beginPath(); ctx.arc(sx, sy, Math.max(0.5, size), 0, Math.PI * 2); ctx.fill();
            } else if (shapeType === 1) {
                ctx.beginPath();
                for (var k2 = 0; k2 < 3; k2++) {
                    var a2 = theta + k2 * (2 * Math.PI / 3);
                    if (k2 === 0) ctx.moveTo(sx + size * Math.cos(a2), sy + size * Math.sin(a2));
                    else ctx.lineTo(sx + size * Math.cos(a2), sy + size * Math.sin(a2));
                }
                ctx.closePath(); ctx.fill();
            } else if (shapeType === 2) {
                ctx.beginPath();
                for (var k3 = 0; k3 < 4; k3++) {
                    var a3 = theta + Math.PI / 4 + k3 * (Math.PI / 2);
                    if (k3 === 0) ctx.moveTo(sx + size * Math.cos(a3), sy + size * Math.sin(a3));
                    else ctx.lineTo(sx + size * Math.cos(a3), sy + size * Math.sin(a3));
                }
                ctx.closePath(); ctx.fill();
            } else if (shapeType === 3) {
                // Sacred 5-Pointed Star
                var rOut = size, rIn = size * 0.42;
                ctx.beginPath();
                for (var k4 = 0; k4 < 10; k4++) {
                    var a4 = theta + k4 * (Math.PI / 5);
                    var rC = (k4 % 2 === 0) ? rOut : rIn;
                    if (k4 === 0) ctx.moveTo(sx + rC * Math.cos(a4), sy + rC * Math.sin(a4));
                    else ctx.lineTo(sx + rC * Math.cos(a4), sy + rC * Math.sin(a4));
                }
                ctx.closePath(); ctx.fill();
            } else {
                ctx.beginPath();
                for (var k5 = 0; k5 < 4; k5++) {
                    var a5 = theta + k5 * (Math.PI / 2);
                    var ddx = size * Math.cos(a5), ddy = size * Math.sin(a5) * 0.55;
                    var cosT = Math.cos(theta), sinT = Math.sin(theta);
                    if (k5 === 0) ctx.moveTo(sx + ddx * cosT - ddy * sinT, sy + ddx * sinT + ddy * cosT);
                    else ctx.lineTo(sx + ddx * cosT - ddy * sinT, sy + ddx * sinT + ddy * cosT);
                }
                ctx.closePath(); ctx.fill();
            }
        }
    }

    /* =========================================================================
       SPIRALS (Harmonic Archimedean / Logarithmic curves)
       ========================================================================= */
    drawSpirals(ctx, baseScale, p, palIdx, colOff, audio, breathe) {
        breathe = breathe !== undefined ? breathe : 0;
        var breathe01  = 0.5 + breathe * 0.5;
        var arms = Math.min(12, p.arms || 6);
        var tightness = p.tightness || 1.0;
        var turns = (p.turns || 3.0) + breathe01 * 0.18 + (audio.highs || 0) * 0.15;
        var waveAmp = (p.wave_amp + breathe01 * 0.015 + (audio.bass || 0) * 0.010) * baseScale;
        var waveFreq = p.wave_freq || 6.0;
        var maxR = (p.radius || 0.88) * baseScale;
        var steps = 80; // 80 steps (fast & smooth!)
        var self = this;

        for (var i = 0; i < arms; i++) {
            var baseAngle = (i * 2 * Math.PI) / arms;
            ctx.beginPath();
            for (var s = 0; s <= steps; s++) {
                var frac = s / steps;
                var rBase = Math.pow(frac, tightness) * maxR;
                var theta2 = baseAngle + frac * turns * 2 * Math.PI;
                var wave = Math.sin(frac * waveFreq * Math.PI * 2 + self.time * 2.0) * waveAmp * frac;
                var r2 = rBase + wave;
                if (s === 0) ctx.moveTo(r2 * Math.cos(theta2), r2 * Math.sin(theta2));
                else ctx.lineTo(r2 * Math.cos(theta2), r2 * Math.sin(theta2));
            }
            ctx.strokeStyle = this.getColor(i / arms, palIdx, colOff);
            ctx.lineWidth = (1.5 + breathe01 * 0.6 + (audio.bass || 0) * 0.35) * this.lineThickness;
            ctx.stroke();
        }
    }

    /* =========================================================================
       COBWEBS (Drooping spiderweb radial polygons)
       ========================================================================= */
    drawCobwebs(ctx, baseScale, p, palIdx, colOff, audio, breathe) {
        breathe = breathe !== undefined ? breathe : 0;
        var breathe01  = 0.5 + breathe * 0.5;
        var spokes = Math.min(12, p.count || 8);
        var rings = Math.min(8, p.rings || 6);
        var sag = (p.sag || 0.12) + Math.sin(this.time * 1.5) * 0.04;
        var maxR = (p.radius || 0.85) * baseScale;
        var thick = ((p.thickness || 1.4) + breathe01 * 0.35 + (audio.bass || 0) * 0.25) * this.lineThickness;

        for (var i = 0; i < spokes; i++) {
            var theta = (i * 2 * Math.PI) / spokes;
            ctx.beginPath();
            ctx.strokeStyle = this.getColor(i / spokes, palIdx, colOff);
            ctx.lineWidth = thick;
            ctx.moveTo(0, 0); ctx.lineTo(maxR * Math.cos(theta), maxR * Math.sin(theta)); ctx.stroke();
        }
        for (var r = 1; r <= rings; r++) {
            var frac = Math.pow(r / rings, p.spacing || 1.0), ringR = frac * maxR;
            ctx.beginPath();
            ctx.strokeStyle = this.getColor(frac, palIdx, colOff + 0.3);
            ctx.lineWidth = thick;
            for (var i2 = 0; i2 <= spokes; i2++) {
                var t1 = (i2 * 2 * Math.PI) / spokes, t2 = ((i2 + 1) * 2 * Math.PI) / spokes, midT = (t1 + t2) / 2;
                var droopR = ringR * (1.0 - sag);
                var x1 = ringR * Math.cos(t1), y1 = ringR * Math.sin(t1);
                var x2 = ringR * Math.cos(t2), y2 = ringR * Math.sin(t2);
                var cx2 = droopR * Math.cos(midT), cy2 = droopR * Math.sin(midT);
                if (i2 === 0) ctx.moveTo(x1, y1);
                ctx.quadraticCurveTo(cx2, cy2, x2, y2);
            }
            ctx.stroke();
        }
    }

    /* =========================================================================
       TUNNELS (Infinite depth perspective with converging depth spokes & Z-flight)
       ========================================================================= */
    drawTunnels(ctx, baseScale, p, palIdx, colOff, audio, breathe) {
        breathe = breathe !== undefined ? breathe : 0;
        var breathe01  = 0.5 + breathe * 0.5;
        var rings = Math.min(14, p.rings || 10);
        var sides = p.sides !== undefined ? p.sides : 6;
        var twistRate = ((p.twist || 1.0) + breathe01 * 0.3 + (audio.mids || 0) * 0.3) * 0.08;
        var wobble = (p.wobble || 0.03) * baseScale;
        var maxR = (p.radius || 0.85) * baseScale;
        var perspective = p.perspective || 2.4;
        var depthStroke = p.depth_stroke !== undefined ? p.depth_stroke : 1;
        var baseThick = (1.4 + breathe01 * 0.35 + (audio.bass || 0) * 0.25) * this.lineThickness;

        if (sides === 0) {
            for (var i = rings; i >= 1; i--) {
                var effRing = i - this.tunnelDepth;
                var tDepth = perspective / (effRing + perspective), ringR = tDepth * maxR;
                var thick = depthStroke === 1 ? baseThick * Math.max(0.15, tDepth) : baseThick;
                var wobX = wobble * Math.sin(i * 0.5) * tDepth, wobY = wobble * Math.cos(i * 0.5) * tDepth;
                ctx.beginPath(); ctx.arc(wobX, wobY, ringR, 0, Math.PI * 2);
                ctx.strokeStyle = this.getColor(tDepth, palIdx, colOff);
                ctx.lineWidth = thick; ctx.stroke();
            }
        } else {
            // Converging perspective spokes
            for (var s = 0; s < sides; s++) {
                ctx.beginPath();
                for (var k = 0; k <= rings; k++) {
                    var effK = k - this.tunnelDepth;
                    var tD = perspective / (effK + perspective), rC = tD * maxR;
                    var wobX2 = wobble * Math.sin(k * 0.5) * tD, wobY2 = wobble * Math.cos(k * 0.5) * tD;
                    var ringRot = (rings - k) * twistRate + this.time * 0.2;
                    var ang = ringRot + s * (2 * Math.PI / sides);
                    var px = wobX2 + rC * Math.cos(ang), py = wobY2 + rC * Math.sin(ang);
                    var thick2 = depthStroke === 1 ? (baseThick * 0.6) * Math.max(0.15, tD) : baseThick * 0.6;
                    if (k === 0) { ctx.moveTo(px, py); }
                    else {
                        ctx.strokeStyle = this.getColor(tD, palIdx, colOff);
                        ctx.lineWidth = thick2; ctx.lineTo(px, py); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(px, py);
                    }
                }
            }
            // Transverse polygon ring slices
            for (var i2 = rings; i2 >= 1; i2--) {
                var effI = i2 - this.tunnelDepth;
                var tD2 = perspective / (effI + perspective), ringR2 = tD2 * maxR;
                var rot2 = (rings - i2) * twistRate + this.time * 0.2;
                var wobX3 = wobble * Math.sin(i2 * 0.5) * tD2, wobY3 = wobble * Math.cos(i2 * 0.5) * tD2;
                var thick3 = depthStroke === 1 ? baseThick * Math.max(0.15, tD2) : baseThick;
                ctx.beginPath();
                for (var s2 = 0; s2 <= sides; s2++) {
                    var ang2 = rot2 + s2 * (2 * Math.PI / sides);
                    var px2 = wobX3 + ringR2 * Math.cos(ang2), py2 = wobY3 + ringR2 * Math.sin(ang2);
                    if (s2 === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
                }
                ctx.strokeStyle = this.getColor(tD2, palIdx, colOff);
                ctx.lineWidth = thick3; ctx.stroke();
            }
        }
    }
}

window.MandalaScene = MandalaScene;
