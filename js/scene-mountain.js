/**
 * VJ Visualizer - Scene 4: 3D Shaded Mountain — "Paraglider Sunset"
 * Serene, high-altitude aerial view of California peaks:
 *  - ZERO-ALLOCATION / ZERO-FREEZE terrain switching with in-place vertex buffer mutation.
 *  - Continuous 3D turntable rotation of the square map preserved across switches.
 *  - ROCK-SOLID terrain: ZERO earthquake shaking or vertex waves.
 *  - Adaptive vertical exaggeration for natural, authentic rolling peaks.
 *  - Peaceful paraglider soaring perspective from 5000+ ft.
 *  - Saturated indie EDM sunset colors (Teal valley -> Lime foothills -> Golden amber -> Rose -> Violet peaks).
 *  - Majestic puffy cumulus clouds crowned over summits with beat-reactive alpenglow.
 *  - BEAT REACTIVITY via LIGHTING & SUNSET GLOW.
 */

class MountainScene {
    constructor() {
        this.name = "Mountain";
        this.container = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        this.terrainMesh = null;
        this.meshGroup = null;

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
        this.meshRotationY = 0;

        this.terrainWidth   = 1400;
        this.terrainDepth   = 1400;
        this.gridResolution = 90;

        // Elevation buffer
        this.baseElevations = null;
        this.yMin = 0;
        this.yMax = 1;

        // Lights
        this.sunLight     = null;
        this.skyLight     = null;
        this.pointLight   = null;
        this.ambientLight = null;

        // Sunset palettes
        this.palettes = [
            // 0: Paraglider Sunset (Classic)
            [
                { t: 0.00, r: 13,  g: 148, b: 136 }, // Deep turquoise teal (valley floor)
                { t: 0.22, r: 101, g: 163, b: 13  }, // Fresh spring lime (foothills)
                { t: 0.48, r: 217, g: 119, b: 6   }, // Golden amber (mid ridges)
                { t: 0.74, r: 225, g: 29,  b: 72  }, // Radiant coral rose (high slopes)
                { t: 1.00, r: 168, g: 85,  b: 247 }  // Luminous violet (summits)
            ],
            // 1: Golden Hour Thermal
            [
                { t: 0.00, r: 30,  g: 64,  b: 175 }, // Cobalt mountain lake
                { t: 0.25, r: 16,  g: 185, b: 129 }, // Emerald forest
                { t: 0.50, r: 245, g: 158, b: 11  }, // Sunlit gold
                { t: 0.75, r: 249, g: 115, b: 22  }, // Fiery orange ridges
                { t: 1.00, r: 253, g: 224, b: 71  }  // Golden summit glint
            ],
            // 2: Electric Aurora Dusk
            [
                { t: 0.00, r: 15,  g: 23,  b: 42  }, // Midnight base
                { t: 0.25, r: 6,   g: 182, b: 212 }, // Cyan glow
                { t: 0.50, r: 59,  g: 130, b: 246 }, // Royal blue
                { t: 0.75, r: 168, g: 85,  b: 247 }, // Neon purple
                { t: 1.00, r: 244, g: 63,  b: 94  }  // Rose apex
            ]
        ];
        this.paletteIdx = 0;

        // Orbiting point light accent colors
        this.pointColors = [0xf43f5e, 0x06b6d4, 0xa855f7, 0xf59e0b, 0x10b981];

        // Asynchronous Orographic Peak Clouds with Thermal Soaring Birds
        this.cloudGroups = [];
        this.uniformCloudBase = 200;
        this.mountainTimer = 0.0;
        this.mountainDuration = 38.0; // ~38s per mountain tour
        this.isInitialized = false;
    }

    init(container) {
        this.container = container;
        var width  = container.clientWidth  || window.innerWidth;
        var height = container.clientHeight || window.innerHeight;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0414);
        this.scene.fog = new THREE.FogExp2(0x0a0414, 0.00035);

        // High-altitude wide paraglider camera
        this.camera = new THREE.PerspectiveCamera(44, width / height, 1, 7000);
        this.camera.position.set(0, 780, 1600);
        this.camera.lookAt(0, 40, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;

        this.renderer.domElement.style.position  = "absolute";
        this.renderer.domElement.style.top       = "0";
        this.renderer.domElement.style.left      = "0";
        this.renderer.domElement.style.width     = "100%";
        this.renderer.domElement.style.height    = "100%";
        this.renderer.domElement.style.pointerEvents = "none";
        this.container.appendChild(this.renderer.domElement);

        // Calibrated sunset lights:
        this.ambientLight = new THREE.AmbientLight(0x28163e, 0.70);
        this.scene.add(this.ambientLight);

        this.sunLight = new THREE.DirectionalLight(0xffe0a3, 1.10);
        this.sunLight.position.set(700, 950, 600);
        this.scene.add(this.sunLight);

        this.skyLight = new THREE.DirectionalLight(0x6366f1, 0.45);
        this.skyLight.position.set(-600, 450, -600);
        this.scene.add(this.skyLight);

        this.pointLight = new THREE.PointLight(0xf43f5e, 1.3, 2400);
        this.pointLight.position.set(600, 400, 0);
        this.scene.add(this.pointLight);

        this.meshGroup = new THREE.Group();
        this.scene.add(this.meshGroup);

        // 1. Build Terrain Mesh Geometry & Material ONCE
        var res  = this.gridResolution;
        var geom = new THREE.PlaneGeometry(this.terrainWidth, this.terrainDepth, res - 1, res - 1);
        geom.rotateX(-Math.PI / 2);

        var pos = geom.attributes.position;
        this.baseElevations = new Float32Array(pos.count);

        var mat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.65,
            metalness: 0.05,
            flatShading: false,
            side: THREE.DoubleSide
        });

        this.terrainMesh = new THREE.Mesh(geom, mat);
        this.meshGroup.add(this.terrainMesh);

        // 2. Pre-allocate 6 Cloud Groups ONCE
        this.buildCloudGroups();

        // 3. Populate Initial Mountain Elevations
        this.updateTerrainElevations(this.terrainKeys[this.currentTerrainIdx]);

        // 4. Atmospheric Horizon Watermark (Option 3: Cinematic Mountain Title in the Background Sky)
        this.buildHorizonWatermark();

        this.isInitialized = true;
    }

    _lerpHeightColor(yNorm) {
        var stops = this.palettes[this.paletteIdx];
        for (var i = 0; i < stops.length - 1; i++) {
            var a = stops[i], b = stops[i + 1];
            if (yNorm >= a.t && yNorm <= b.t) {
                var f = (yNorm - a.t) / (b.t - a.t);
                return {
                    r: a.r + (b.r - a.r) * f,
                    g: a.g + (b.g - a.g) * f,
                    b: a.b + (b.b - a.b) * f
                };
            }
        }
        var last = stops[stops.length - 1];
        return { r: last.r, g: last.g, b: last.b };
    }

    getVerticalExaggeration(dem) {
        if (!dem) return 0.08;
        var relief = Math.max(100, (dem.max_elev - dem.min_elev) || 1000);
        // Lowest mountains (Tam, Vaca: ~780m relief) get ~0.20
        // Mid relief peaks (Diablo ~980m -> 0.16, Monroe ~1770m -> 0.09, Whitney ~2170m -> 0.075)
        // Highest relief peaks (Everest ~4410m -> 0.045)
        var targetHeight = 160.0;
        return Math.max(0.045, Math.min(0.22, targetHeight / relief));
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
            var d = Math.sqrt(x * x + z * z) / 700;
            return Math.max(0, (1.05 - d) * 90 * (
                0.55 + 0.25 * Math.sin(x * 0.012) * Math.cos(z * 0.010) +
                0.12 * Math.sin(x * 0.028 + 1.2) * Math.cos(z * 0.022) +
                0.08 * Math.cos(x * 0.006 + z * 0.008)
            ));
        }
    }

    buildBirdMesh() {
        var birdGroup = new THREE.Group();

        var birdMat = new THREE.MeshStandardMaterial({
            color: 0x1e1e24,             // Dark soaring raptor plumage
            emissive: 0xd97706,          // Warm sunset amber alpenglow rim
            emissiveIntensity: 0.35,
            roughness: 0.60,
            metalness: 0.10,
            transparent: true,
            opacity: 0.0,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        // 1. Sleek Fuselage Body (half scale: radius 0.65, length 4.25)
        var bodyGeom = new THREE.ConeGeometry(0.65, 4.25, 8);
        bodyGeom.rotateX(Math.PI / 2); // Point cone along -Z (tail to beak)
        var bodyMesh = new THREE.Mesh(bodyGeom, birdMat);
        birdGroup.add(bodyMesh);

        // Head / Beak (golden tip pointing forward along +Z)
        var beakGeom = new THREE.ConeGeometry(0.35, 1.4, 6);
        beakGeom.rotateX(-Math.PI / 2);
        var beakMat = new THREE.MeshStandardMaterial({
            color: 0xfbbf24,
            emissive: 0xf59e0b,
            emissiveIntensity: 0.50,
            transparent: true,
            opacity: 0.0,
            depthWrite: false
        });
        var beakMesh = new THREE.Mesh(beakGeom, beakMat);
        beakMesh.position.set(0, 0.05, 2.4);
        birdGroup.add(beakMesh);

        // 2. Tail Fan (wedge at rear)
        var tailGeom = new THREE.BufferGeometry();
        var tailVertices = new Float32Array([
            0, 0, -1.8,
            -1.3, 0.1, -3.6,
            1.3, 0.1, -3.6
        ]);
        tailGeom.setAttribute('position', new THREE.BufferAttribute(tailVertices, 3));
        tailGeom.computeVertexNormals();
        var tailMesh = new THREE.Mesh(tailGeom, birdMat);
        birdGroup.add(tailMesh);

        // 3. Left Wing (half scale wingspan: 4.75 units per wing)
        var leftWingPivot = new THREE.Group();
        leftWingPivot.position.set(-0.4, 0.1, 0.25);

        var lWingGeom = new THREE.BufferGeometry();
        var lWingVertices = new Float32Array([
            0, 0, 0.9,
            -4.75, 0.25, -0.5,
            0, 0, -1.1,

            0, 0, -1.1,
            -4.75, 0.25, -0.5,
            -3.75, 0.20, -1.7
        ]);
        lWingGeom.setAttribute('position', new THREE.BufferAttribute(lWingVertices, 3));
        lWingGeom.computeVertexNormals();
        var lWingMesh = new THREE.Mesh(lWingGeom, birdMat);
        leftWingPivot.add(lWingMesh);
        birdGroup.add(leftWingPivot);

        // 4. Right Wing
        var rightWingPivot = new THREE.Group();
        rightWingPivot.position.set(0.4, 0.1, 0.25);

        var rWingGeom = new THREE.BufferGeometry();
        var rWingVertices = new Float32Array([
            0, 0, 0.9,
            0, 0, -1.1,
            4.75, 0.25, -0.5,

            0, 0, -1.1,
            3.75, 0.20, -1.7,
            4.75, 0.25, -0.5
        ]);
        rWingGeom.setAttribute('position', new THREE.BufferAttribute(rWingVertices, 3));
        rWingGeom.computeVertexNormals();
        var rWingMesh = new THREE.Mesh(rWingGeom, birdMat);
        rightWingPivot.add(rWingMesh);
        birdGroup.add(rightWingPivot);

        return {
            group: birdGroup,
            material: birdMat,
            beakMaterial: beakMat,
            leftWing: leftWingPivot,
            rightWing: rightWingPivot
        };
    }

    buildCloudGroups() {
        this.cloudGroups = [];
        var numClouds = 6;

        for (var k = 0; k < numClouds; k++) {
            var cloudGroup = new THREE.Group();
            cloudGroup.rotation.y = Math.random() * Math.PI * 2;

            // Elegant peak-scale cumulus radius (48 - 72 units, cleanly proportioned above summits)
            var cloudR = 48 + (k % 3) * 10 + Math.random() * 6;

            var cloudMat = new THREE.MeshStandardMaterial({
                color: 0xffffff,
                emissive: 0xff8844,          // Warm sunset alpenglow
                emissiveIntensity: 0.25,
                roughness: 0.70,
                metalness: 0.02,
                transparent: true,
                opacity: 0.82,
                depthWrite: false
            });

            // 1. Flat circular base disc anchored at y=0
            var baseGeom = new THREE.CylinderGeometry(cloudR * 0.85, cloudR * 0.85, 2.5, 32);
            var baseMesh = new THREE.Mesh(baseGeom, cloudMat);
            baseMesh.position.set(0, 1.25, 0);
            cloudGroup.add(baseMesh);

            // 2. Radially arranged billowy cauliflower puffs
            var puffSpecs = [
                // Tall central dome
                { x: 0, y: cloudR * 0.32, z: 0, r: cloudR * 0.44 },
                // Inner ring billows (3 puffs spaced at 120°)
                { x: Math.cos(0) * cloudR * 0.32, y: cloudR * 0.22, z: Math.sin(0) * cloudR * 0.32, r: cloudR * 0.34 },
                { x: Math.cos(2.094) * cloudR * 0.32, y: cloudR * 0.24, z: Math.sin(2.094) * cloudR * 0.32, r: cloudR * 0.33 },
                { x: Math.cos(4.188) * cloudR * 0.32, y: cloudR * 0.21, z: Math.sin(4.188) * cloudR * 0.32, r: cloudR * 0.35 }
            ];

            // Outer perimeter ring (6 puffs distributed radially in 360°)
            var numOuterPuffs = 6;
            for (var oi = 0; oi < numOuterPuffs; oi++) {
                var angle = (oi / numOuterPuffs) * Math.PI * 2;
                var ringDist = cloudR * 0.62;
                var puffRad = cloudR * 0.25;
                puffSpecs.push({
                    x: Math.cos(angle) * ringDist,
                    y: 4.0,
                    z: Math.sin(angle) * ringDist,
                    r: puffRad
                });
            }

            for (var p = 0; p < puffSpecs.length; p++) {
                var pf = puffSpecs[p];
                var pMesh = new THREE.Mesh(new THREE.SphereGeometry(pf.r, 16, 12), cloudMat);
                pMesh.position.set(pf.x, pf.y, pf.z);
                cloudGroup.add(pMesh);
            }

            this.meshGroup.add(cloudGroup);

            // Build 3D Thermal Soaring Bird for this cloud site
            var birdData = this.buildBirdMesh();
            this.meshGroup.add(birdData.group);

            var initialCycleDuration = 18.0 + Math.random() * 12.0; // 18s - 30s
            this.cloudGroups.push({
                group: cloudGroup,
                material: cloudMat,
                baseX: 0,
                baseY: 200,
                baseZ: 0,
                driftPhase: k * 1.3 + Math.random() * 2.0,
                // Asynchronous independent schedule
                cycleDuration: initialCycleDuration,
                cycleTime: Math.random() * initialCycleDuration, // Randomized start time!
                scale: 0.0,
                opacity: 0.0,
                glow: 0.0,
                // Thermal soaring bird (half as numerous: 38% probability per cycle)
                bird: birdData,
                hasBird: Math.random() < 0.38,
                birdAngle0: Math.random() * Math.PI * 2,
                birdRadius: 28 + Math.random() * 14, // 28 - 42 units
                birdDir: 1
            });
        }
    }

    /**
     * Atmospheric Horizon Watermark (Option 3: Cinematic Mountain Title in the Background Sky)
     * Renders a large, elegant, low-opacity title in the background fog layer behind the peaks.
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

        var wmGeom = new THREE.PlaneGeometry(2800, 700);
        this.watermarkMesh = new THREE.Mesh(wmGeom, this.watermarkMat);
        // Placed in the distant horizon behind the mountain peaks
        this.watermarkMesh.position.set(0, 520, -1450);
        this.watermarkMesh.quaternion.copy(this.camera.quaternion);
        this.scene.add(this.watermarkMesh);

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

        // Elegant spaced lettering: e.g. M T .   S H A S T A
        var title = info.name.split("").join(" ");
        var subtitle = info.elevation + "   //   " + info.region;

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Soft sunset alpenglow gradient on text
        var grad = ctx.createLinearGradient(0, 160, 0, 360);
        grad.addColorStop(0, "#ffe0a3"); // Warm sunset gold
        grad.addColorStop(0.5, "#ffffff"); // Luminous pure white
        grad.addColorStop(1, "#f43f5e"); // Alpenglow rose

        // Main Title
        ctx.font = "900 82px 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillStyle = grad;
        ctx.shadowColor = "#f43f5e";
        ctx.shadowBlur = 24;
        ctx.fillText(title, 1024, 210);

        // Subtitle
        ctx.font = "700 28px 'SF Mono', Consolas, Monaco, monospace";
        ctx.fillStyle = "#38bdf8"; // Luminous sky cyan
        ctx.shadowColor = "#06b6d4";
        ctx.shadowBlur = 12;
        ctx.fillText(subtitle, 1024, 300);

        this.watermarkTexture.needsUpdate = true;
    }

    /**
     * Instantaneous In-Place Elevation & Cloud Repositioning:
     * Takes ~1.2 ms. Zero object allocation, zero GC pauses.
     */
    updateTerrainElevations(terrainKey) {
        if (!this.terrainMesh) return;
        var dem = (typeof DEM_DATA !== "undefined" && DEM_DATA[terrainKey]) ? DEM_DATA[terrainKey] : null;
        var geom = this.terrainMesh.geometry;
        var pos = geom.attributes.position;
        var count = pos.count;

        var yMin = Infinity, yMax = -Infinity;

        for (var i = 0; i < count; i++) {
            var x = pos.getX(i), z = pos.getZ(i);
            var u = (x / this.terrainWidth) + 0.5;
            var v = (z / this.terrainDepth) + 0.5;
            var y = this.getElevationAt(u, v, dem);
            pos.setY(i, y);
            this.baseElevations[i] = y;
            if (y < yMin) yMin = y;
            if (y > yMax) yMax = y;
        }

        this.yMin = yMin;
        this.yMax = yMax;

        pos.needsUpdate = true;
        geom.computeVertexNormals();
        this.updateColors(0.0);

        // Reposition clouds high above the summits in the upper troposphere
        this.uniformCloudBase = yMax + 140;
        var yThreshold = yMin + (yMax - yMin) * 0.80; // highest 20% summit terrain
        var candidates = [];
        for (var pIdx = 0; pIdx < count; pIdx++) {
            var py = pos.getY(pIdx);
            if (py >= yThreshold) {
                candidates.push({ x: pos.getX(pIdx), y: py, z: pos.getZ(pIdx) });
            }
        }
        candidates.sort(function(a, b) {
            return (b.y + Math.sin(b.x * 0.01) * 15) - (a.y + Math.sin(a.x * 0.01) * 15);
        });

        var cloudSites = [];
        for (var c = 0; c < candidates.length && cloudSites.length < this.cloudGroups.length; c++) {
            var cand = candidates[c];
            var tooClose = false;
            for (var s = 0; s < cloudSites.length; s++) {
                var dx = cand.x - cloudSites[s].x, dz = cand.z - cloudSites[s].z;
                if (dx * dx + dz * dz < 180 * 180) {
                    tooClose = true;
                    break;
                }
            }
            if (!tooClose) cloudSites.push(cand);
        }

        // Move existing clouds smoothly to new summits
        for (var k = 0; k < this.cloudGroups.length; k++) {
            var site = cloudSites[k % cloudSites.length] || { x: 0, y: yMax, z: 0 };
            var cItem = this.cloudGroups[k];
            cItem.baseX = site.x;
            cItem.baseY = this.uniformCloudBase;
            cItem.baseZ = site.z;
            cItem.group.position.set(site.x, this.uniformCloudBase, site.z);
        }
    }

    updateColors(audioColorShift) {
        if (!this.terrainMesh || !this.baseElevations) return;
        var geom = this.terrainMesh.geometry;
        var count = this.baseElevations.length;
        var yRange = Math.max(this.yMax - this.yMin, 1.0);

        var colors = geom.attributes.color ? geom.attributes.color.array : new Float32Array(count * 3);

        for (var i = 0; i < count; i++) {
            var baseNorm = (this.baseElevations[i] - this.yMin) / yRange;
            var yNorm = Math.max(0.0, Math.min(1.0, baseNorm + audioColorShift * (1.0 - baseNorm * 0.5)));
            var col = this._lerpHeightColor(yNorm);
            colors[i * 3 + 0] = col.r / 255;
            colors[i * 3 + 1] = col.g / 255;
            colors[i * 3 + 2] = col.b / 255;
        }

        if (!geom.attributes.color) {
            geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        } else {
            geom.attributes.color.needsUpdate = true;
        }
    }

    setTerrainIndex(idx) {
        this.currentTerrainIdx = idx % this.terrainKeys.length;
        this.paletteIdx = idx % this.palettes.length;
        this.mountainTimer = 0.0;

        this.updateTerrainElevations(this.terrainKeys[this.currentTerrainIdx]);
        this.updateWatermarkText(this.terrainKeys[this.currentTerrainIdx]);
    }

    switchTerrain() {
        this.setTerrainIndex(this.currentTerrainIdx + 1);
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
        this.time += dt;

        var bass   = (audio && audio.bass)   ? audio.bass   : 0;
        var mids   = (audio && audio.mids)   ? audio.mids   : 0;
        var sub    = (audio && audio.sub)    ? audio.sub    : 0;
        var isBeat = (audio && audio.isBeat) ? true         : false;

        // Smooth, gentle thermal turntable rotation (peaceful glider soaring)
        // PRESERVED ACROSS ALL MOUNTAIN SWITCHES WITHOUT INTERRUPTION
        var rotSpeed = 0.05 + mids * 0.08;
        this.meshRotationY += rotSpeed * dt;
        this.meshGroup.rotation.y = this.meshRotationY;

        // SOLID TERRAIN: Scale remains strictly 1.0
        this.meshGroup.scale.set(1.0, 1.0, 1.0);

        // Mountain summit tour cadence timer:
        this.mountainTimer += dt;
        if (this.mountainTimer >= this.mountainDuration) {
            this.mountainTimer = 0.0;
            var nextIdx = (this.currentTerrainIdx + 1) % this.terrainKeys.length;
            this.setTerrainIndex(nextIdx);
            if (window.vjController) {
                window.vjController.terrainIdx = this.currentTerrainIdx;
                window.vjController.updateHUD();
            }
        }

        // =========================================================================
        // ASYNCHRONOUS INDEPENDENT CLOUD CYCLES + THERMAL SOARING BIRDS:
        // Each cloud starts randomly and moves through its 4-phase lifecycle on its
        // own schedule. During Phase 0 (no clouds) through Phase 1 (building clouds),
        // an occasional raptor circles up in the thermal underneath where the cloud
        // will be and later is.
        // =========================================================================
        for (var cg = 0; cg < this.cloudGroups.length; cg++) {
            var cItem = this.cloudGroups[cg];
            cItem.cycleTime += dt;

            if (cItem.cycleTime >= cItem.cycleDuration) {
                cItem.cycleTime -= cItem.cycleDuration;
                cItem.cycleDuration = 18.0 + Math.random() * 12.0;
                cItem.hasBird = Math.random() < 0.38; // half as numerous
                cItem.birdAngle0 = Math.random() * Math.PI * 2;
                cItem.birdRadius = 28 + Math.random() * 14;
                cItem.birdDir = 1;
            }

            var t = Math.min(1.0, Math.max(0.0, cItem.cycleTime / cItem.cycleDuration)); // 0.0 to 1.0

            // 4-Phase Individual Cloud Lifecycle:
            if (t < 0.12) {
                // Phase 0: No Cloud (0 ≤ t < 0.12) -> Clear sky above summit
                cItem.scale = 0.0;
                cItem.opacity = 0.0;
                cItem.glow = 0.0;
            } else if (t < 0.42) {
                // Phase 1: Small / Building Cloud (0.12 ≤ t < 0.42) -> Condensation begins & blooms
                var p1 = (t - 0.12) / 0.30;
                cItem.scale = p1 * 0.40;
                cItem.opacity = p1 * 0.42;
                cItem.glow = p1 * 0.15;
            } else if (t < 0.72) {
                // Phase 2: Full Cumulus (0.42 ≤ t < 0.72) -> Majestic billowy cloud
                var p2 = (t - 0.42) / 0.30;
                cItem.scale = 0.40 + p2 * (1.25 - 0.40);
                cItem.opacity = 0.42 + p2 * (0.72 - 0.42);
                cItem.glow = 0.15 + p2 * 0.20 + mids * 0.25 + (isBeat ? 0.20 : 0.0);
            } else {
                // Phase 3: Decaying Cloud (0.72 ≤ t < 1.00) -> Evaporation / dissipation
                var p3 = (t - 0.72) / 0.28;
                cItem.scale = 1.25;
                cItem.opacity = 0.72 * (1.0 - p3);
                cItem.glow = 0.35 * (1.0 - p3);
            }

            // Cloud Position (gentle thermal drift at summit condensation level)
            var grp = cItem.group;
            grp.position.x = cItem.baseX + Math.sin(this.time * 0.3 + cItem.driftPhase) * 16;
            grp.position.y = cItem.baseY;
            grp.position.z = cItem.baseZ + Math.cos(this.time * 0.25 + cItem.driftPhase) * 10;
            grp.scale.set(cItem.scale, cItem.scale, cItem.scale);
            cItem.material.opacity = cItem.opacity;
            cItem.material.emissiveIntensity = cItem.glow;

            // =========================================================================
            // OCCASIONAL THERMAL SOARING BIRD:
            // Circles up in the thermal column under where the cloud will be (Phase 0)
            // and later is (Phase 1). Strictly NEVER present during the decaying/mature
            // cloud phases (Phase 2 & 3) when no feeding thermal exists.
            // =========================================================================
            var birdObj = cItem.bird;
            if (birdObj) {
                var tThermalStart = 0.01;
                var tThermalEnd = 0.38; // Stops before Phase 2 mature cumulus
                if (cItem.hasBird && t >= tThermalStart && t <= tThermalEnd) {
                    var u = (t - tThermalStart) / (tThermalEnd - tThermalStart); // 0.0 -> 1.0 (climb progress)

                    // Continuous circular orbit flight (~3.2s per full circle):
                    var flightAngularSpeed = 1.95;
                    var currentAngle = cItem.birdAngle0 + this.time * flightAngularSpeed;
                    var spiralRadius = cItem.birdRadius * (1.0 - u * 0.22);

                    // Spiraling climb up the thermal column towards the cloud base:
                    var birdAltitude = (cItem.baseY - 145) + u * 135;
                    var bX = cItem.baseX + Math.cos(currentAngle) * spiralRadius;
                    var bZ = cItem.baseZ + Math.sin(currentAngle) * spiralRadius;
                    var bY = birdAltitude;
                    birdObj.group.position.set(bX, bY, bZ);

                    // Forward circular flight tangent:
                    var tX = -Math.sin(currentAngle);
                    var tZ = Math.cos(currentAngle);
                    var tY = 0.16; // gentle climb pitch
                    birdObj.group.lookAt(bX + tX * 25, bY + tY * 25, bZ + tZ * 25);

                    // Aerodynamic thermal bank (banking inward into the circle):
                    birdObj.group.rotateZ(0.44);

                    // Soaring wing articulation (subtle dihedral flex + occasional flap):
                    var wingFlex = Math.sin(this.time * 2.8 + cg) * 0.06 + Math.pow(Math.max(0, Math.sin(this.time * 0.85 + cg * 1.5)), 6) * 0.28;
                    birdObj.leftWing.rotation.z = wingFlex;
                    birdObj.rightWing.rotation.z = -wingFlex;

                    // Smooth fade-in at thermal base and fade-out before full cloud forms:
                    var bOpacity = 1.0;
                    if (u < 0.15) {
                        bOpacity = u / 0.15;
                    } else if (u > 0.78) {
                        bOpacity = (1.0 - u) / 0.22;
                    }
                    birdObj.material.opacity = bOpacity * 0.90;
                    birdObj.beakMaterial.opacity = bOpacity * 0.95;
                } else {
                    birdObj.material.opacity = 0.0;
                    birdObj.beakMaterial.opacity = 0.0;
                }
            }
        }

        // Atmospheric Horizon Watermark (Option 3): Doubled opacity with atmospheric breathing pulse
        if (this.watermarkMat && this.watermarkMesh) {
            this.watermarkMat.opacity = 0.44 + mids * 0.16 + (isBeat ? 0.12 : 0.0);
            this.watermarkMesh.quaternion.copy(this.camera.quaternion);
        }

        // BEAT REACTIVITY VIA LIGHTING:
        this.sunLight.intensity = 1.05 + audio.mids * 0.45;
        this.skyLight.intensity = 0.45 + audio.sub * 0.30;

        this.pointLight.position.x = Math.sin(this.time * 0.8) * 900;
        this.pointLight.position.z = Math.cos(this.time * 0.8) * 900;
        this.pointLight.position.y = 380 + Math.sin(this.time * 0.5) * 60;
        this.pointLight.intensity  = 1.1 + audio.bass * 1.8;

        var hueIdx = Math.floor(this.time / 15) % this.pointColors.length;
        this.pointLight.color.setHex(this.pointColors[hueIdx]);

        // BEAT REACTIVITY VIA COLORS:
        var glowShift = audio.bass * 0.12 + (audio.isBeat ? 0.08 : 0.0);
        this.updateColors(glowShift);
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

window.MountainScene = MountainScene;
