/**
 * VJ Visualizer - Scene 1: Psychedelic Form Constants & Sacred Geometry Mandalas
 * Full 3D Perspective Lattices & Dynamic Sacred Geometry:
 *  - 3D Conformal Log-Hexagonal Spiral Lattice (infinite vortex scaling into depth)
 *  - 3D Wireframe Perspective Lattice Tunnel (spokes + rings + diagonal cross-ribs)
 *  - 3D Log-Conformal Spiral Lattice (orthogonal log-spirals forming a curved depth grid)
 *  - 3D Spherical / Hyperbolic Bulge Perspective Lattice (curved dome perspective)
 *  - 3D Polygonal Tunnels with converging depth spokes & warp-tunnel Z-flight
 *  - Dynamic Kaleidoscope Engine with multi-fold mirror symmetry wedges
 *  - Laser Bloom & Additive Radiance glow with neon line haloing
 *  - Kick & Bass Kinetic Shockwaves with rotational snap
 *  - Interactive mouse/touch drag (spin, pan, zoom, reset)
 *  - Live parameter tuner and full HUD line thickness reactivity
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
        this.breathePhase = 0.0; // 4-beat gentle breathing phase

        // Spice-Up Parameters
        this.lineThickness = 1.0;   // Master thickness multiplier (linked to HUD slider)
        this.laserBloom = 1.2;      // Neon halo & additive bloom intensity (0.0 - 2.5)
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

        // 3D Perspective Presets (Every preset features TRUE 3D perspective depth!)
        this.layerPresets = [
            // Preset 0: "Conformal LogHex Infinite Vortex" (T-shirt design favorite)
            [
                { type:"Lattices", colorOffset:0.0,  params:{grid_type:3, cell_scale:0.058, rotation:0,  thickness:1.8, radius:0.92, double_grid:1, fill_scale:0.78, depth_stroke:1} },
                { type:"Tunnels",  colorOffset:0.50, params:{rings:20, sides:6, perspective:2.8, twist:1.2, wobble:0.03, radius:0.85, depth_stroke:1} },
                { type:"Phyllo",   colorOffset:0.25, params:{count:320, div_angle:137.508, radius:0.84, size:0.022, decay:0.44, shape_type:3} },
                { type:"Spirals",  colorOffset:0.75, params:{arms:6, tightness:1.05, turns:3.2, wave_amp:0.04, wave_freq:6.0, radius:0.85, depth_stroke:0} }
            ],
            // Preset 1: "3D Wireframe Wormhole Lattice Corridor" (True 3D grid cage)
            [
                { type:"Lattices", colorOffset:0.0,  params:{grid_type:4, rings:24, sides:12, perspective:2.4, twist:1.5, thickness:1.6, radius:0.90, depth_stroke:1} },
                { type:"Tunnels",  colorOffset:0.45, params:{rings:16, sides:0, perspective:2.2, twist:0.8, wobble:0.05, radius:0.82, depth_stroke:1} },
                { type:"Phyllo",   colorOffset:0.70, params:{count:260, div_angle:137.508, radius:0.80, size:0.028, decay:0.50, shape_type:4} },
                { type:"Spirals",  colorOffset:0.20, params:{arms:4, tightness:0.95, turns:4.0, wave_amp:0.05, wave_freq:5.0, radius:0.88, depth_stroke:0} }
            ],
            // Preset 2: "Log-Conformal Spiral Vortex Lattice"
            [
                { type:"Lattices", colorOffset:0.1,  params:{grid_type:5, arms:16, tightness:0.92, turns:4.5, thickness:1.5, radius:0.90, depth_stroke:1} },
                { type:"Tunnels",  colorOffset:0.55, params:{rings:18, sides:3, perspective:3.0, twist:1.8, wobble:0.04, radius:0.82, depth_stroke:1} },
                { type:"Phyllo",   colorOffset:0.35, params:{count:300, div_angle:137.508, radius:0.84, size:0.020, decay:0.46, shape_type:1} },
                { type:"Cobwebs",  colorOffset:0.80, params:{count:9, rings:8, spacing:1.0, sag:0.12, radius:0.85, thickness:1.4} }
            ],
            // Preset 3: "Nested 3D Hypercube Perspective Corridor" (Prism vanishing box)
            [
                { type:"Lattices", colorOffset:0.0,  params:{grid_type:3, cell_scale:0.065, rotation:15, thickness:1.7, radius:0.90, double_grid:1, fill_scale:0.76, depth_stroke:1} },
                { type:"Tunnels",  colorOffset:0.40, params:{rings:14, sides:4, perspective:2.0, twist:-1.2, wobble:0.04, radius:0.88, depth_stroke:1} },
                { type:"Phyllo",   colorOffset:0.65, params:{count:280, div_angle:137.508, radius:0.82, size:0.026, decay:0.48, shape_type:3} },
                { type:"Spirals",  colorOffset:0.85, params:{arms:8, tightness:1.1, turns:3.5, wave_amp:0.06, wave_freq:8.0, radius:0.86, depth_stroke:0} }
            ],
            // Preset 4: "3D Spherical Bulge Perspective Lattice"
            [
                { type:"Lattices", colorOffset:0.05, params:{grid_type:6, cell_scale:0.075, rotation:30, thickness:1.6, radius:0.90, double_grid:1, depth_stroke:1} },
                { type:"Tunnels",  colorOffset:0.50, params:{rings:16, sides:8, perspective:2.6, twist:1.4, wobble:0.04, radius:0.80, depth_stroke:1} },
                { type:"Phyllo",   colorOffset:0.30, params:{count:290, div_angle:137.508, radius:0.83, size:0.024, decay:0.45, shape_type:2} },
                { type:"Cobwebs",  colorOffset:0.75, params:{count:12, rings:10, spacing:1.1, sag:0.15, radius:0.86, thickness:1.5} }
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
                // Pan camera view
                self.panX += dx;
                self.panY += dy;
            } else {
                // Interactive spin
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
        // Linked to HUD slider (4.0px = 1.0 baseline)
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

    randomizeGeometry() {
        this.currentPreset = (this.currentPreset + 1) % this.layerPresets.length;
        this.paletteIdx = (this.paletteIdx + 1) % this.paletteNames.length;
        this.layers = this._clonePreset(this.currentPreset);

        this.layers.forEach(function(l) {
            l.colorOffset = Math.random();
            if (l.type === "Lattices") {
                l.params.rotation = Math.floor(Math.random() * 60);
                l.params.depth_stroke = 1;
                l.params.double_grid = 1;
                if (l.params.grid_type === 3) {
                    l.params.cell_scale = 0.050 + Math.random() * 0.025;
                    l.params.fill_scale = 0.74 + Math.random() * 0.08;
                } else if (l.params.grid_type === 4) {
                    l.params.twist = (Math.random() * 3.0 - 1.5);
                    l.params.perspective = 1.8 + Math.random() * 1.5;
                } else if (l.params.grid_type === 5) {
                    l.params.turns = 3.0 + Math.random() * 2.5;
                }
            } else if (l.type === "Phyllo") {
                l.params.count = Math.floor(Math.random() * 240) + 180;
                l.params.size = 0.018 + Math.random() * 0.014;
                l.params.shape_type = Math.floor(Math.random() * 5);
            } else if (l.type === "Spirals") {
                l.params.arms = [4, 6, 8, 10][Math.floor(Math.random() * 4)];
                l.params.turns = 2.0 + Math.random() * 3.0;
                l.params.wave_amp = Math.random() < 0.7 ? Math.random() * 0.06 : 0.0;
            } else if (l.type === "Tunnels") {
                l.params.rings = Math.floor(Math.random() * 14) + 10;
                l.params.sides = [0, 3, 4, 5, 6, 8][Math.floor(Math.random() * 6)];
                l.params.perspective = 1.8 + Math.random() * 2.5;
                l.params.twist = Math.random() * 3.0 - 1.5;
                l.params.depth_stroke = 1;
            } else if (l.type === "Cobwebs") {
                l.params.count = Math.floor(Math.random() * 10) + 6;
                l.params.rings = Math.floor(Math.random() * 8) + 6;
                l.params.sag = Math.random() * 0.35 - 0.05;
            }
        });
    }

    update(dt, audio) {
        this.time += dt;
        var bpm = (audio && audio.bpm) ? audio.bpm : 124;
        // Gentle 4-beat breathing in and out: 1 full expansion/contraction cycle across 4 beats
        var breatheFreq = (bpm / 60.0) / 4.0;
        this.breathePhase = (this.breathePhase + dt * breatheFreq * Math.PI * 2) % (Math.PI * 2);

        // Rotation spin speed driven by user param & mids
        this.baseRotation += (0.08 + (audio.mids || 0) * 0.18) * dt * this.spinSpeed;
        this.colorShift = (this.colorShift + dt * 0.04 + (audio.mids || 0) * dt * 0.06) % 1.0;

        // Continuous Warp-Tunnel Z-flight depth progression
        var flightSpeed = (0.28 + (audio.energy || 0.3) * 0.45) * this.tunnelSpeed;
        this.tunnelDepth = (this.tunnelDepth + dt * flightSpeed) % 1.0;
        if (this.tunnelDepth < 0) this.tunnelDepth += 1.0;

        // Kick & Bass Kinetic Shockwaves with rotational snap
        if (audio && audio.isBeat) {
            this.kickScale = Math.min(1.2, this.kickScale + 0.40 * this.audioScale);
            this.kickTwist += (Math.random() > 0.5 ? 1 : -1) * (0.05 + (audio.bass || 0) * 0.09) * this.audioScale;
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

        // Gentle breathing in and out over 4 musical beats
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

        // Master radius expands smoothly in and out over 4 beats, scaled by zoom and kick shockwaves
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

            // Blit kaleidoscope wedges around center
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
                // Subpixel seam overlap (+0.012 rad) eliminates hairline rendering gaps
                ctx.arc(0, 0, wedgeR, -halfWedge - 0.012, halfWedge + 0.012);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(this._offscreenCanvas, -(cx + this.panX), -(cy + this.panY));
                ctx.restore();
            }
            ctx.restore();
        } else {
            // Direct rendering without offscreen overhead
            ctx.save();
            ctx.translate(cx + this.panX, cy + this.panY);
            ctx.rotate(this.baseRotation + this.kickTwist);
            this.drawLayers(ctx, baseScale, pal, audio, breathe, masterRadius);
            ctx.restore();
        }

        // Outer glow ring with gentle breathing pulse & kick shockwave
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

        // Configure Laser Bloom Neon Halo
        if (this.laserBloom > 0.1) {
            targetCtx.shadowBlur = Math.min(22, 6.5 * this.laserBloom * Math.sqrt(this.lineThickness));
        } else {
            targetCtx.shadowBlur = 0;
        }

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

        // Additive Center Laser Bloom Radiance Pass
        if (this.laserBloom > 0.4) {
            targetCtx.save();
            targetCtx.globalCompositeOperation = "lighter";
            var bloomGrad = targetCtx.createRadialGradient(0, 0, 0, 0, 0, masterRadius * 0.88);
            var bloomAlpha = Math.min(0.38, (this.laserBloom - 0.4) * 0.18 + (audio.energy || 0) * 0.10);
            var coreHue = ((this.colorShift * 360) % 360).toFixed(1);
            bloomGrad.addColorStop(0,   'hsla(' + coreHue + ',100%,70%,' + bloomAlpha + ')');
            bloomGrad.addColorStop(0.5, 'hsla(' + ((Number(coreHue) + 50) % 360) + ',90%,55%,' + (bloomAlpha * 0.42) + ')');
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
         0-2: Classic grids with radial 3D perspective depth modulation
       ========================================================================= */
    drawLattices(ctx, baseScale, p, palIdx, colOff, audio, breathe) {
        breathe = breathe !== undefined ? breathe : 0;
        var breathe01  = 0.5 + breathe * 0.5;
        var gridType   = p.grid_type !== undefined ? p.grid_type : 3;
        var cellScale  = (p.cell_scale || 0.06) * (1.0 + breathe01 * 0.04 + (audio.highs || 0) * 0.04);
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

        // ---------------------------------------------------------------------
        // Mode 3: Conformal Log-Hexagonal Perspective Lattice (Infinite Hex Vortex)
        // ---------------------------------------------------------------------
        if (gridType === 3) {
            var nSectors = Math.max(6, Math.round(Math.PI / cellScale));
            var d_v = (2.0 * Math.PI) / nSectors;
            var d_u = d_v * (Math.sqrt(3.0) / 2.0);
            var rHexLog = d_v / Math.sqrt(3.0);
            var uMax = Math.log(maxR);
            var nRings = Math.ceil(uMax / d_u) + 6;

            for (var r = 0; r <= nRings; r++) {
                // Continuous warp-tunnel Z-flight offset
                var effR = r + this.tunnelDepth;
                var uc = uMax - effR * d_u;
                var rCenter = Math.exp(uc);
                if (rCenter < 0.6) break;

                var rNorm = rCenter / maxR;
                var thick = depthStroke === 1 ? baseThick * Math.max(0.18, rNorm) : baseThick;
                var color = this.getColor(1.0 - rNorm, palIdx, colOff);

                ctx.strokeStyle = color;
                if (this.laserBloom > 0.1) ctx.shadowColor = color;
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

                    // Inner concentric hexagon for 3D double-walled border
                    if (doubleGrid === 1 && rNorm > 0.05) {
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
        // ---------------------------------------------------------------------
        // Mode 4: 3D Wireframe Perspective Lattice Tunnel (Spokes + Rings + Cross-Ribs)
        // ---------------------------------------------------------------------
        else if (gridType === 4) {
            var rings = p.rings || 22;
            var sides = p.sides || 12;
            var perspective = p.perspective || 2.4;
            var twistRate = (p.twist || 1.2) * 0.06;

            var ringPoints = []; // [ring][side] = {x, y, tDepth}

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

            // 1. Draw Transverse Rings
            for (var k = 0; k <= rings; k++) {
                var pts = ringPoints[k];
                var tD = pts[0].tDepth;
                var rCol = this.getColor(tD, palIdx, colOff);
                ctx.beginPath();
                for (var s = 0; s <= sides; s++) {
                    var pt = pts[s % sides];
                    if (s === 0) ctx.moveTo(pt.x, pt.y);
                    else ctx.lineTo(pt.x, pt.y);
                }
                ctx.strokeStyle = rCol;
                if (this.laserBloom > 0.1) ctx.shadowColor = rCol;
                ctx.lineWidth = depthStroke === 1 ? baseThick * Math.max(0.2, tD) : baseThick;
                ctx.stroke();
            }

            // 2. Draw Longitudinal Perspective Spokes (Converging to center)
            for (var s = 0; s < sides; s++) {
                ctx.beginPath();
                for (var k = 0; k <= rings; k++) {
                    var pt = ringPoints[k][s];
                    if (k === 0) ctx.moveTo(pt.x, pt.y);
                    else {
                        var spkCol = this.getColor(pt.tDepth, palIdx, colOff + 0.15);
                        ctx.strokeStyle = spkCol;
                        if (this.laserBloom > 0.1) ctx.shadowColor = spkCol;
                        ctx.lineWidth = depthStroke === 1 ? baseThick * 0.7 * Math.max(0.2, pt.tDepth) : baseThick * 0.7;
                        ctx.lineTo(pt.x, pt.y);
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(pt.x, pt.y);
                    }
                }
            }

            // 3. DIAGONAL LATTICE RIBS
            for (var k = 0; k < rings; k++) {
                var tD = ringPoints[k][0].tDepth;
                var ribCol = this.getColor(tD, palIdx, colOff + 0.35);
                ctx.strokeStyle = ribCol;
                if (this.laserBloom > 0.1) ctx.shadowColor = ribCol;
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
        // ---------------------------------------------------------------------
        // Mode 5: Log-Conformal Orthogonal Spiral Lattice (Vortex Checkerboard)
        // ---------------------------------------------------------------------
        else if (gridType === 5) {
            var arms = p.arms || 16;
            var tightness = p.tightness || 0.95;
            var turns = (p.turns || 4.0) + (audio.highs || 0) * 0.4;
            var steps = 140;

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

                    var spCol = this.getColor(i / arms, palIdx, colOff + (dir === 1 ? 0 : 0.4));
                    ctx.strokeStyle = spCol;
                    if (this.laserBloom > 0.1) ctx.shadowColor = spCol;
                    ctx.lineWidth = depthStroke === 1 ? baseThick * (0.6 + 0.6 * (1.0 - (i / arms))) : baseThick;
                    ctx.stroke();
                }
            }
        }
        // ---------------------------------------------------------------------
        // Mode 6: 3D Spherical Bulge Perspective Lattice (Curved Dome Horizon)
        // ---------------------------------------------------------------------
        else if (gridType === 6) {
            var gridSpacing = cellScale * baseScale;
            var limit = Math.ceil(maxR / gridSpacing) + 2;

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
                    var segs = 36;
                    var tDist = Math.abs(offset) / maxR;
                    var domCol = this.getColor(tDist, palIdx, colOff + dir * 0.25);

                    ctx.strokeStyle = domCol;
                    if (this.laserBloom > 0.1) ctx.shadowColor = domCol;
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
        // ---------------------------------------------------------------------
        // Mode 0, 1, 2: Fallback parallel-line grids with radial depth modulation
        // ---------------------------------------------------------------------
        else {
            var gridSpacing = cellScale * baseScale;
            var limit = Math.ceil(maxR / gridSpacing) + 2;

            function drawRadialLines(angle) {
                var cosA = Math.cos(angle), sinA = Math.sin(angle);
                for (var i = -limit; i <= limit; i++) {
                    var offsets = doubleGrid === 1
                        ? [i * gridSpacing - gridSpacing * 0.12, i * gridSpacing + gridSpacing * 0.12]
                        : [i * gridSpacing];

                    offsets.forEach(function(offset) {
                        if (Math.abs(offset) >= maxR) return;
                        var L = Math.sqrt(maxR * maxR - offset * offset);
                        var p1x = offset * cosA - (-L) * sinA, p1y = offset * sinA + (-L) * cosA;
                        var p2x = offset * cosA - L * sinA,    p2y = offset * sinA + L * cosA;
                        var tDist = Math.abs(offset) / (baseScale * 0.9);
                        var thick = depthStroke === 1 ? baseThick * Math.max(0.15, 1.0 - tDist * 0.7) : baseThick;
                        var col = self.getColor(tDist, palIdx, colOff);

                        ctx.beginPath();
                        ctx.moveTo(p1x, p1y);
                        ctx.lineTo(p2x, p2y);
                        ctx.strokeStyle = col;
                        if (self.laserBloom > 0.1) ctx.shadowColor = col;
                        ctx.lineWidth = thick;
                        ctx.stroke();
                    });
                }
            }

            if (gridType === 0) { drawRadialLines(0); drawRadialLines(Math.PI / 2); }
            else if (gridType === 1) { drawRadialLines(0); drawRadialLines(Math.PI / 3); drawRadialLines(2 * Math.PI / 3); }
            else {
                var hRadius = gridSpacing / Math.sqrt(3.0);
                var rowLimit = Math.ceil(maxR / (gridSpacing * 1.5)) + 2;
                var colLimit = Math.ceil(maxR / gridSpacing) + 2;
                for (var row = -rowLimit; row <= rowLimit; row++) {
                    for (var col = -colLimit; col <= colLimit; col++) {
                        var hx = col * Math.sqrt(3.0) * gridSpacing + (Math.abs(row) % 2) * (Math.sqrt(3.0) / 2.0) * gridSpacing;
                        var hy = row * 1.5 * gridSpacing;
                        var dist = Math.sqrt(hx * hx + hy * hy);
                        if (dist >= maxR) continue;

                        var tDist = dist / (baseScale * 0.9);
                        var hCol = this.getColor(tDist, palIdx, colOff);
                        ctx.strokeStyle = hCol;
                        if (this.laserBloom > 0.1) ctx.shadowColor = hCol;
                        ctx.lineWidth = depthStroke === 1 ? baseThick * Math.max(0.18, 1.0 - tDist * 0.65) : baseThick;
                        ctx.beginPath();
                        for (var ss = 0; ss < 6; ss++) {
                            var ang = ss * (2.0 * Math.PI / 6.0);
                            var px = hx + hRadius * Math.cos(ang), py = hy + hRadius * Math.sin(ang);
                            if (ss === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                        }
                        ctx.closePath();
                        ctx.stroke();
                    }
                }
            }
        }

        ctx.restore();
    }

    /* =========================================================================
       PHYLLOTAXIS (Sunflower spirals with glowing neon halos)
       ========================================================================= */
    drawPhyllotaxis(ctx, baseScale, p, palIdx, colOff, audio, breathe) {
        breathe = breathe !== undefined ? breathe : 0;
        var breathe01  = 0.5 + breathe * 0.5;
        var count = p.count, divAngle = (p.div_angle * Math.PI) / 180.0;
        var baseR = p.radius * baseScale, baseSize = p.size * baseScale * Math.sqrt(this.lineThickness);
        var decay = p.decay, shapeType = p.shape_type !== undefined ? p.shape_type : 3;

        for (var n = 1; n <= count; n++) {
            var rNorm = Math.sqrt(n / count), r = rNorm * baseR;
            var theta = n * divAngle + this.time * 0.11 + (audio.highs || 0) * 0.04;
            var sx = r * Math.cos(theta), sy = r * Math.sin(theta);
            var size = baseSize * Math.pow(rNorm, decay) * (1.0 + breathe01 * 0.14 + (audio.bass || 0) * 0.10);
            if (size < 0.4) continue;
            var color = this.getColor(rNorm, palIdx, colOff);

            // Neon bloom halo
            if (size > 2.5 && this.laserBloom > 0.1) {
                var glowGrad = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 2.2 * this.laserBloom);
                var hslMatch = color.match(/hsl\(([^)]+)\)/);
                var glowAlpha = Math.min(0.65, 0.32 * this.laserBloom);
                var glowCol = hslMatch ? 'hsla(' + hslMatch[1] + ',' + glowAlpha + ')' : 'rgba(255,255,255,0.15)';
                glowGrad.addColorStop(0, glowCol);
                glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = glowGrad;
                ctx.beginPath();
                ctx.arc(sx, sy, size * 2.2 * this.laserBloom, 0, Math.PI * 2);
                ctx.fill();
            }

            ctx.fillStyle = color;
            ctx.strokeStyle = color;
            if (this.laserBloom > 0.1) ctx.shadowColor = color;
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
                // Lotus Petal / Scale
                ctx.beginPath();
                for (var k5 = 0; k5 < 4; k5++) {
                    var a5 = theta + k5 * (Math.PI / 2);
                    var scY = 0.55;
                    var ddx = size * Math.cos(a5), ddy = size * Math.sin(a5) * scY;
                    var cosT = Math.cos(theta), sinT = Math.sin(theta);
                    if (k5 === 0) ctx.moveTo(sx + ddx * cosT - ddy * sinT, sy + ddx * sinT + ddy * cosT);
                    else ctx.lineTo(sx + ddx * cosT - ddy * sinT, sy + ddx * sinT + ddy * cosT);
                }
                ctx.closePath(); ctx.fill();
            }
        }
    }

    /* =========================================================================
       SPIRALS (Archimedean / Logarithmic with gentle breathing waves)
       ========================================================================= */
    drawSpirals(ctx, baseScale, p, palIdx, colOff, audio, breathe) {
        breathe = breathe !== undefined ? breathe : 0;
        var breathe01  = 0.5 + breathe * 0.5;
        var arms = p.arms, tightness = p.tightness;
        var turns = p.turns + breathe01 * 0.18 + (audio.highs || 0) * 0.15;
        var waveAmp = (p.wave_amp + breathe01 * 0.015 + (audio.bass || 0) * 0.010) * baseScale;
        var waveFreq = p.wave_freq, maxR = p.radius * baseScale, steps = 180;
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
            var sCol = this.getColor(i / arms, palIdx, colOff);
            ctx.strokeStyle = sCol;
            if (this.laserBloom > 0.1) ctx.shadowColor = sCol;
            ctx.lineWidth = (1.5 + breathe01 * 0.6 + (audio.bass || 0) * 0.35) * this.lineThickness;
            ctx.stroke();
        }
    }

    /* =========================================================================
       COBWEBS (Concentric drooping spiderweb arcs)
       ========================================================================= */
    drawCobwebs(ctx, baseScale, p, palIdx, colOff, audio, breathe) {
        breathe = breathe !== undefined ? breathe : 0;
        var breathe01  = 0.5 + breathe * 0.5;
        var spokes = p.count, rings = p.rings;
        var sag = p.sag + Math.sin(this.time * 1.5) * 0.04;
        var maxR = p.radius * baseScale;
        var thick = ((p.thickness || 1.4) + breathe01 * 0.35 + (audio.bass || 0) * 0.25) * this.lineThickness;

        for (var i = 0; i < spokes; i++) {
            var theta = (i * 2 * Math.PI) / spokes;
            ctx.beginPath();
            var spCol = this.getColor(i / spokes, palIdx, colOff);
            ctx.strokeStyle = spCol;
            if (this.laserBloom > 0.1) ctx.shadowColor = spCol;
            ctx.lineWidth = thick;
            ctx.moveTo(0, 0); ctx.lineTo(maxR * Math.cos(theta), maxR * Math.sin(theta)); ctx.stroke();
        }
        for (var r = 1; r <= rings; r++) {
            var frac = Math.pow(r / rings, p.spacing), ringR = frac * maxR;
            ctx.beginPath();
            var cwCol = this.getColor(frac, palIdx, colOff + 0.3);
            ctx.strokeStyle = cwCol;
            if (this.laserBloom > 0.1) ctx.shadowColor = cwCol;
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
        var rings = p.rings, sides = p.sides;
        var twistRate = (p.twist + breathe01 * 0.3 + (audio.mids || 0) * 0.3) * 0.08;
        var wobble = p.wobble * baseScale, maxR = p.radius * baseScale;
        var perspective = p.perspective;
        var depthStroke = p.depth_stroke !== undefined ? p.depth_stroke : 1;
        var baseThick = (1.4 + breathe01 * 0.35 + (audio.bass || 0) * 0.25) * this.lineThickness;

        if (sides === 0) {
            for (var i = rings; i >= 1; i--) {
                var effRing = i - this.tunnelDepth;
                var tDepth = perspective / (effRing + perspective), ringR = tDepth * maxR;
                var thick = depthStroke === 1 ? baseThick * Math.max(0.15, tDepth) : baseThick;
                var wobX = wobble * Math.sin(i * 0.5) * tDepth, wobY = wobble * Math.cos(i * 0.5) * tDepth;
                ctx.beginPath(); ctx.arc(wobX, wobY, ringR, 0, Math.PI * 2);
                var col = this.getColor(tDepth, palIdx, colOff);
                ctx.strokeStyle = col;
                if (this.laserBloom > 0.1) ctx.shadowColor = col;
                ctx.lineWidth = thick; ctx.stroke();
            }
        } else {
            // Draw converging perspective spokes
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
                        var c = this.getColor(tD, palIdx, colOff);
                        ctx.strokeStyle = c;
                        if (this.laserBloom > 0.1) ctx.shadowColor = c;
                        ctx.lineWidth = thick2; ctx.lineTo(px, py); ctx.stroke();
                        ctx.beginPath(); ctx.moveTo(px, py);
                    }
                }
            }
            // Draw transverse polygon ring slices
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
                var c2 = this.getColor(tD2, palIdx, colOff);
                ctx.strokeStyle = c2;
                if (this.laserBloom > 0.1) ctx.shadowColor = c2;
                ctx.lineWidth = thick3; ctx.stroke();
            }
        }
    }
}

window.MandalaScene = MandalaScene;
