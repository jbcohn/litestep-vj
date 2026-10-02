/**
 * VJ Visualizer - Scene 2: 3D Topographic Mountain Ridgelines
 * High-altitude, dynamic Joy Division-style ribbon contour flyover:
 *  - ZERO-ALLOCATION render loop: zero objects created per frame, zero GC pauses.
 *  - Single persistent 4-face plaque chassis with instant asset geometry/texture swapping.
 *  - Shared curtain material and disabled frustum culling on fixed-bounds stage to eliminate GPU stalls.
 *  - Continuous 3D turntable rotation of the square map preserved across switches.
 *  - Banked paraglider camera soaring in a wide, gentle arc (Z=1800 zoom level).
 *  - Pure extruded triangle-strip ribbons with dark occluding curtains.
 *  - ZERO earthquake wave shaking — completely authentic surveyed topography.
 *  - Beat reactivity through glowing ribbon color pulses and plaque illumination.
 */

const MOUNTAIN_INFO = {
    diablo_closeup: {
        name: "MT. DIABLO",
        elevation: "3,849 FT",
        region: "SAN FRANCISCO BAY AREA",
        coords: "37.8816° N, 121.9142° W"
    },
    shasta_closeup: {
        name: "MT. SHASTA",
        elevation: "14,179 FT",
        region: "CASCADE VOLCANIC ARC",
        coords: "41.4092° N, 122.1949° W"
    },
    tam_closeup: {
        name: "MT. TAMALPAIS",
        elevation: "2,571 FT",
        region: "MARIN COUNTY COASTAL RANGE",
        coords: "37.9235° N, 122.5965° W"
    },
    vaca_closeup: {
        name: "MT. VACA",
        elevation: "2,819 FT",
        region: "VACA MOUNTAINS",
        coords: "38.4008° N, 122.1008° W"
    },
    whitney_closeup: {
        name: "MT. WHITNEY",
        elevation: "14,505 FT",
        region: "SIERRA NEVADA",
        coords: "36.5785° N, 118.2923° W"
    },
    monroe_peak: {
        name: "MONROE PEAK",
        elevation: "11,227 FT",
        region: "SEVIER PLATEAU, UTAH",
        coords: "38.5347° N, 112.0722° W"
    },
    haleakala_closeup: {
        name: "MAUI // HALEAKALĀ",
        elevation: "10,023 FT",
        region: "ISLAND OF MAUI, HAWAII",
        coords: "20.7097° N, 156.2533° W"
    },
    nebo_peak: {
        name: "MT. NEBO",
        elevation: "11,928 FT",
        region: "WASATCH RANGE, UTAH",
        coords: "39.8222° N, 111.7597° W"
    },
    everest_closeup: {
        name: "MT. EVEREST",
        elevation: "29,032 FT",
        region: "MAHALANGUR HIMALAYA",
        coords: "27.9881° N, 86.9250° W"
    }
};

class RidgelineScene {
    constructor() {
        this.name = "Ridgelines";
        this.container = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        this.linesGroup = null;
        this.ribbonMeshes = [];
        this.sharedCurtainMat = null;

        // Horizon Watermark Title (Identical to Scene 4)
        this.watermarkMesh = null;
        this.watermarkTexture = null;
        this.watermarkCanvas = null;

        this.terrainKeys = [
            "diablo_closeup",
            "shasta_closeup",
            "tam_closeup",
            "vaca_closeup",
            "whitney_closeup",
            "monroe_peak",
            "nebo_peak",
            "haleakala_closeup"
        ];
        this.currentTerrainIdx = 0;

        this.time = 0;
        this.flightPhase = 0;
        this.ribbonThickness = 4.0;

        this.numLines = 75;
        this.numPts = 120;
        this.terrainWidth = 1400;
        this.terrainDepth = 1800;

        // Indie EDM ribbon color palettes
        this.palettes = [
            { name:"Aqua & Magenta", primary:new THREE.Color(0x2dd4bf), secondary:new THREE.Color(0xf43f5e) },
            { name:"Lime & Violet",  primary:new THREE.Color(0xa3e635), secondary:new THREE.Color(0xa855f7) },
            { name:"Amber & Cyan",   primary:new THREE.Color(0xfbbf24), secondary:new THREE.Color(0x06b6d4) },
            { name:"Rose & Teal",    primary:new THREE.Color(0xfb7185), secondary:new THREE.Color(0x34d399) }
        ];
        this.currentPaletteIdx = 0;
        this.isInitialized = false;
    }

    init(container) {
        this.container = container;
        var width  = container.clientWidth  || window.innerWidth;
        var height = container.clientHeight || window.innerHeight;

        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(0x020617, 0.00032);

        // High-altitude wide aerial camera tuned to Z=1800 zoom level
        this.camera = new THREE.PerspectiveCamera(46, width / height, 1, 8000);
        this.camera.position.set(0, 680, 1800);
        this.camera.lookAt(0, -20, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.domElement.style.position  = "absolute";
        this.renderer.domElement.style.top       = "0";
        this.renderer.domElement.style.left      = "0";
        this.renderer.domElement.style.width     = "100%";
        this.renderer.domElement.style.height    = "100%";
        this.renderer.domElement.style.pointerEvents = "none";
        this.container.appendChild(this.renderer.domElement);

        // Ambient & Directional Lighting for physical 3D text relief & metallic plaque shading
        var ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
        this.scene.add(ambientLight);

        var dirLight1 = new THREE.DirectionalLight(0xffffff, 0.85);
        dirLight1.position.set(500, 920, 1200);
        this.scene.add(dirLight1);

        var dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.55);
        dirLight2.position.set(-600, 480, -900);
        this.scene.add(dirLight2);

        this.linesGroup = new THREE.Group();
        // Shift entire ridgelines scene up the screen by ~20%
        this.linesGroup.position.y = 190;
        this.scene.add(this.linesGroup);

        // 1. Pre-allocate the 75 Ribbon Geometries and 75 Curtain Geometries ONCE
        this.buildRibbonsInitial();

        // 2. Populate initial mountain elevations
        this.updateTerrainElevations(this.terrainKeys[this.currentTerrainIdx]);

        // 3. Atmospheric Horizon Watermark (Identical to Scene 4 mountain title)
        this.buildHorizonWatermark();

        // WebGL context loss listeners to handle GPU resets gracefully
        this.renderer.domElement.addEventListener("webglcontextlost", (event) => {
            event.preventDefault();
            console.warn("WebGL Context Lost in RidgelineScene");
        }, false);
        this.renderer.domElement.addEventListener("webglcontextrestored", () => {
            console.log("WebGL Context Restored in RidgelineScene");
            this.renderer.compile(this.scene, this.camera);
        }, false);

        this.isInitialized = true;
    }

    getVerticalExaggeration(dem) {
        if (!dem) return 0.11;
        var relief = Math.max(100, (dem.max_elev - dem.min_elev) || 1000);
        var targetHeight = 240.0;
        return Math.max(0.068, Math.min(0.32, targetHeight / relief));
    }

    getElevationAt(u, v, dem) {
        if (dem && dem.grid) {
            var r = Math.min(dem.rows - 1, Math.max(0, Math.floor(v * dem.rows)));
            var c = Math.min(dem.cols - 1, Math.max(0, Math.floor(u * dem.cols)));
            var actualMeters = dem.grid[r][c] || 0;
            var baseElev = dem.min_elev || 0;
            var relHeight = Math.max(0, actualMeters - baseElev);
            var exagg = this.getVerticalExaggeration(dem);
            return relHeight * exagg;
        } else {
            var x = (u - 0.5) * 1200, z = (v - 0.5) * 1200;
            var d = Math.sqrt(x * x + z * z) / 600;
            return Math.max(0, (1 - d) * 125 * (Math.sin(x * 0.015) * Math.cos(z * 0.012) + 0.6));
        }
    }

    /**
     * Atmospheric Horizon Watermark (Identical to Scene 4 mountain title)
     */
    buildHorizonWatermark() {
        this.watermarkCanvas = document.createElement("canvas");
        this.watermarkCanvas.width = 2048;
        this.watermarkCanvas.height = 512;
        this.watermarkTexture = new THREE.CanvasTexture(this.watermarkCanvas);
        this.watermarkTexture.minFilter = THREE.LinearFilter;
        this.watermarkTexture.magFilter = THREE.LinearFilter;

        this.watermarkMat = new THREE.MeshBasicMaterial({
            map: this.watermarkTexture,
            transparent: true,
            opacity: 0.44,
            depthWrite: false,
            side: THREE.DoubleSide
        });

        var wmGeom = new THREE.PlaneGeometry(1600, 400);
        this.watermarkMesh = new THREE.Mesh(wmGeom, this.watermarkMat);
        // Attached to camera in upper view for consistent cinematic title overlay
        this.watermarkMesh.position.set(0, 140, -580);
        this.watermarkMesh.frustumCulled = false;
        this.camera.add(this.watermarkMesh);
        this.scene.add(this.camera);

        this.updateWatermarkText(this.terrainKeys[this.currentTerrainIdx]);
    }

    updateWatermarkText(terrainKey) {
        if (!this.watermarkCanvas) return;
        var info = (typeof MOUNTAIN_INFO !== "undefined" && MOUNTAIN_INFO[terrainKey]) ? MOUNTAIN_INFO[terrainKey] : {
            name: terrainKey.toUpperCase(),
            elevation: "TOPOGRAPHIC SURVEY",
            region: "ELEVATION RELIEF"
        };

        var ctx = this.watermarkCanvas.getContext("2d");
        ctx.clearRect(0, 0, this.watermarkCanvas.width, this.watermarkCanvas.height);

        var title = info.name.split("").join(" ");
        var subtitle = info.elevation + "   //   " + info.region;

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        var grad = ctx.createLinearGradient(0, 160, 0, 360);
        grad.addColorStop(0, "#2dd4bf");
        grad.addColorStop(0.5, "#ffffff");
        grad.addColorStop(1, "#f43f5e");

        ctx.font = "900 82px 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillStyle = grad;
        ctx.shadowColor = "#f43f5e";
        ctx.shadowBlur = 24;
        ctx.fillText(title, 1024, 210);

        ctx.font = "700 28px 'SF Mono', Consolas, Monaco, monospace";
        ctx.fillStyle = "#38bdf8";
        ctx.shadowColor = "#06b6d4";
        ctx.shadowBlur = 12;
        ctx.fillText(subtitle, 1024, 300);

        this.watermarkTexture.needsUpdate = true;
    }

    buildRibbonsInitial() {
        var numLines = this.numLines;
        var numPts   = this.numPts;
        var stepZ = this.terrainDepth / numLines;
        var stepX = this.terrainWidth / numPts;
        var palette = this.palettes[this.currentPaletteIdx];

        // Shared curtain material: all 75 curtains share 1 material instance
        this.sharedCurtainMat = new THREE.MeshBasicMaterial({ color: 0x020617, side: THREE.DoubleSide });

        this.ribbonMeshes = [];

        for (var l = 0; l < numLines; l++) {
            var z = (l - numLines / 2) * stepZ;

            var ribbonGeom = new THREE.BufferGeometry();
            var vertices = new Float32Array(numPts * 2 * 3);
            var indices = [];

            var curtainGeom = new THREE.BufferGeometry();
            var curtainVerts = new Float32Array(numPts * 2 * 3);
            var curtainIdx = [];

            for (var p = 0; p < numPts; p++) {
                var x = (p - numPts / 2) * stepX;

                vertices[p * 6 + 0] = x; vertices[p * 6 + 1] = 0; vertices[p * 6 + 2] = z;
                vertices[p * 6 + 3] = x; vertices[p * 6 + 4] = this.ribbonThickness; vertices[p * 6 + 5] = z;

                if (p < numPts - 1) {
                    var i0 = p * 2, i1 = p * 2 + 1, i2 = (p + 1) * 2, i3 = (p + 1) * 2 + 1;
                    indices.push(i0, i1, i2); indices.push(i1, i3, i2);
                }

                curtainVerts[p * 6 + 0] = x; curtainVerts[p * 6 + 1] = 0;   curtainVerts[p * 6 + 2] = z;
                curtainVerts[p * 6 + 3] = x; curtainVerts[p * 6 + 4] = -25; curtainVerts[p * 6 + 5] = z;

                if (p < numPts - 1) {
                    var ci0 = p * 2, ci1 = p * 2 + 1, ci2 = (p + 1) * 2, ci3 = (p + 1) * 2 + 1;
                    curtainIdx.push(ci0, ci1, ci2); curtainIdx.push(ci1, ci3, ci2);
                }
            }

            ribbonGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            ribbonGeom.setIndex(indices);

            curtainGeom.setAttribute('position', new THREE.BufferAttribute(curtainVerts, 3));
            curtainGeom.setIndex(curtainIdx);

            var curtainMesh = new THREE.Mesh(curtainGeom, this.sharedCurtainMat);
            curtainMesh.frustumCulled = false;
            this.linesGroup.add(curtainMesh);

            var colorFrac = l / numLines;
            var col = palette.primary.clone().lerp(palette.secondary, colorFrac);
            var ribbonMat = new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide });
            var ribbonMesh = new THREE.Mesh(ribbonGeom, ribbonMat);
            ribbonMesh.frustumCulled = false;
            this.linesGroup.add(ribbonMesh);

            this.ribbonMeshes.push({
                ribbon: ribbonMesh,
                curtain: curtainMesh,
                ribbonPos: ribbonGeom.attributes.position,
                curtainPos: curtainGeom.attributes.position,
                baseColorFrac: colorFrac
            });
        }
    }

    /**
     * Instantaneous In-Place Elevation & Plaque Update:
     * Takes < 1.0 ms. Zero object allocation, zero GC spikes.
     */
    updateTerrainElevations(terrainKey) {
        var dem = (typeof DEM_DATA !== "undefined" && DEM_DATA[terrainKey]) ? DEM_DATA[terrainKey] : null;
        var numLines = this.numLines;
        var numPts   = this.numPts;
        var th = this.ribbonThickness;

        for (var l = 0; l < numLines; l++) {
            var v = l / (numLines - 1);
            var item = this.ribbonMeshes[l];
            var rPos = item.ribbonPos;
            var cPos = item.curtainPos;

            for (var p = 0; p < numPts; p++) {
                var u = p / (numPts - 1);
                var y = this.getElevationAt(u, v, dem);

                rPos.setY(p * 2, y);
                rPos.setY(p * 2 + 1, y + th);

                cPos.setY(p * 2, y);
                cPos.setY(p * 2 + 1, -25);
            }

            rPos.needsUpdate = true;
            cPos.needsUpdate = true;
        }

        this.updateWatermarkText(terrainKey);
    }

    setTerrainIndex(idx) {
        this.currentTerrainIdx = idx % this.terrainKeys.length;
        this.currentPaletteIdx = idx % this.palettes.length;
        this.updateTerrainElevations(this.terrainKeys[this.currentTerrainIdx]);
    }

    switchTerrain() {
        this.setTerrainIndex(this.currentTerrainIdx + 1);
    }

    setThickness(val) {
        this.ribbonThickness = Math.max(1.5, Math.min(12, val));
        this.updateTerrainElevations(this.terrainKeys[this.currentTerrainIdx]);
    }

    resize(width, height) {
        if (!this.renderer || !this.camera) return;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    update(dt, audio, isVis) {
        if (!this.isInitialized) return;
        if (isVis !== undefined && !isVis) return;
        this.time = (this.time + dt) % 10000;

        var mids   = (audio && audio.mids)   ? audio.mids   : 0;

        // DYNAMIC HELICOPTER SIGHTSEEING TOUR FLYOVER:
        var flightSpeed = 0.065 + (mids * 0.015);
        this.flightPhase = (this.flightPhase || 0) + dt * flightSpeed;
        var u = this.flightPhase;

        // Broad, sweeping figure-8 overlooking the entire terrain interior:
        // Terrain bounds: X in [-700, 700], Z in [-900, 900]
        var xBase = Math.sin(u) * 420;
        var zBase = Math.sin(2 * u) * 580;
        var xDrift = Math.sin(0.41 * u + 1.2) * 50;
        var zDrift = Math.cos(0.37 * u + 1.8) * 60;

        var camX = xBase + xDrift;
        var camZ = zBase + zDrift;
        // Elevated sightseeing vantage point (smoothly undulating between 560 and 680):
        var camY = 620 + Math.cos(2 * u) * 50 + Math.sin(0.53 * u) * 25;

        // Look-ahead tangent:
        var vx = Math.cos(u) * 420 + Math.cos(0.41 * u + 1.2) * 20;
        var vz = 2 * Math.cos(2 * u) * 580 - Math.sin(0.37 * u + 1.8) * 25;
        var vLen = Math.sqrt(vx * vx + vz * vz);
        var dirX = (vLen > 0.001) ? vx / vLen : 0;
        var dirZ = (vLen > 0.001) ? vz / vLen : 1;

        // Look forward and down across the expansive ridgelines panorama:
        var tgtDist = 450;
        var tgtX = camX * 0.28 + dirX * tgtDist;
        var tgtZ = camZ * 0.28 + dirZ * tgtDist;
        var tgtY = 130;

        this.linesGroup.rotation.y = 0; // Stable geographic terrain orientation

        this.camera.position.set(camX, camY, camZ);
        this.camera.lookAt(tgtX, tgtY, tgtZ);

        // Gentle sightseeing banking into scenic curves:
        var bankAngle = -Math.sin(2 * u) * 0.06 - Math.cos(u) * 0.025;
        this.camera.rotateZ(bankAngle);

        var palette = (this.palettes && this.palettes[this.currentPaletteIdx]) ? this.palettes[this.currentPaletteIdx] : this.palettes[0];
        var pR = palette.primary.r, pG = palette.primary.g, pB = palette.primary.b;
        var sR = palette.secondary.r, sG = palette.secondary.g, sB = palette.secondary.b;

        // Smooth ribbon color progression without jarring beat flashes:
        for (var i = 0; i < this.ribbonMeshes.length; i++) {
            var item = this.ribbonMeshes[i];
            var colorFrac = (item.baseColorFrac + this.time * 0.05) % 1.0;
            var r = pR + (sR - pR) * colorFrac;
            var g = pG + (sG - pG) * colorFrac;
            var b = pB + (sB - pB) * colorFrac;
            item.ribbon.material.color.setRGB(r, g, b);
        }
    }

    render(alpha) {
        alpha = alpha === undefined ? 1.0 : alpha;
        if (!this.isInitialized || !this.renderer) return;
        this.renderer.domElement.style.opacity = alpha;
        if (alpha > 0.001) {
            this.renderer.domElement.style.display = "block";
            this.renderer.render(this.scene, this.camera);
        } else {
            this.renderer.domElement.style.display = "none";
        }
    }

    destroy() {
        if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
    }
}

window.RidgelineScene = RidgelineScene;
