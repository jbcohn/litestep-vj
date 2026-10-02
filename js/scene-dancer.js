/**
 * VJ Visualizer - Scene 5: 3D Kinetic Stick Figure Shuffle Dancer
 * High-clarity geometric 3D Stick Figure designed for rapid choreography iteration:
 *  - 21 articulated anatomical joints & 20 connecting 3D bone cylinders
 *  - Full clavicle connections from chest to shoulders (zero gaps)
 *  - Dynamic head & neck nodding and vertical bounce on every downbeat
 *  - Zero spring lag: direct, crisp, instant kinematic responsiveness
 *  - Fast Melbourne Shuffle / Cutting Shapes cadence (double-time footwork)
 *  - Adjustable speed multiplier (1.0x to 3.0x) with hotkeys ([-]/[+])
 *  - Reflective stage floor with concert lighting & beat sparkles
 */

// Pre-allocated scratch objects for bone alignment & zero-GC updates
var _v1 = new THREE.Vector3();
var _v2 = new THREE.Vector3();
var _v3 = new THREE.Vector3();
var _vScale = new THREE.Vector3();
var _yAxis = new THREE.Vector3(0, 1, 0);
var _zAxis = new THREE.Vector3(0, 0, 1);
var _quat = new THREE.Quaternion();
var _dummyQuat = new THREE.Quaternion();
var _matrix = new THREE.Matrix4();
var _tempColor = new THREE.Color();
var _tempColor2 = new THREE.Color();

var _vShin = new THREE.Vector3();
var _vToe = new THREE.Vector3();
var _vThigh = new THREE.Vector3();
var _vBodyFwd = new THREE.Vector3();
var _vRight = new THREE.Vector3();
var _vUp = new THREE.Vector3();
var _vFwd = new THREE.Vector3();
var _vGaze = new THREE.Vector3();
var _vTemp = new THREE.Vector3();
var _fwdL = new THREE.Vector3();
var _upL = new THREE.Vector3();
var _rightL = new THREE.Vector3();
var _fwdR = new THREE.Vector3();
var _upR = new THREE.Vector3();
var _rightR = new THREE.Vector3();
var _vFallbackRight = new THREE.Vector3();
var _vBodyRight = new THREE.Vector3();
var _vDown = new THREE.Vector3(0, -1, 0);

/**
 * Computes a robust orthonormal coordinate frame for an anatomical foot:
 * Forward points in the true direction of the foot/step, Up points upwards,
 * Right is orthogonal to the foot plane.
 */
function computeFootFrame(hip, knee, ankle, bodyFwd, outFwd, outUp, outRight) {
    // 1. Shin vector pointing down from knee to ankle
    _vShin.subVectors(ankle, knee);
    if (_vShin.lengthSq() > 0.001) _vShin.normalize();
    else _vShin.set(0, -1, 0);

    // 2. Thigh vector pointing down from hip to knee
    _vThigh.subVectors(knee, hip);
    if (_vThigh.lengthSq() > 0.001) _vThigh.normalize();
    else _vThigh.set(0, -1, 0);

    // 3. Knee hinge plane normal (Right vector)
    outRight.crossVectors(_vThigh, _vShin);
    var crossLen = outRight.length();

    // If knee is straight, thigh and shin are collinear (cross product near zero).
    // In that case, smoothly fallback to (bodyFwd x shin), which yields the anatomically correct rightward axis.
    if (crossLen < 0.15) {
        if (bodyFwd) {
            _vFallbackRight.crossVectors(bodyFwd, _vShin);
        } else {
            _vFallbackRight.set(1, 0, 0);
        }
        if (_vFallbackRight.lengthSq() > 0.001) {
            _vFallbackRight.normalize();
            if (crossLen > 0.001 && outRight.dot(_vFallbackRight) < 0) {
                outRight.negate();
            }
            var blend = crossLen / 0.15;
            outRight.multiplyScalar(blend).addScaledVector(_vFallbackRight, 1.0 - blend);
        } else {
            outRight.set(1, 0, 0);
        }
    } else {
        // Ensure knee hinge axis points towards dancer's lateral right side
        if (bodyFwd) {
            _vBodyRight.crossVectors(bodyFwd, _vDown);
            if (_vBodyRight.lengthSq() > 0.001) {
                _vBodyRight.normalize();
                if (outRight.dot(_vBodyRight) < 0) {
                    outRight.negate();
                }
            }
        }
    }
    outRight.normalize();

    // 4. Foot forward direction: orthogonal to Shin and pointing forward from the anterior shin
    outFwd.crossVectors(_vShin, outRight).normalize();

    // 5. Up vector: perpendicular to Forward and Right (pointing up out of sole/dorsum)
    outUp.crossVectors(outFwd, outRight).normalize();
}

// Helper to instantiate 22-joint anatomical rig
function makeRig() {
    return {
        pelvis:    { x: 0,   y: 14,  z: 0 },
        spine:     { x: 0,   y: 40,  z: 2 },
        chest:     { x: 0,   y: 68,  z: 4 },
        neck:      { x: 0,   y: 88,  z: 4 },
        head:      { x: 0,   y: 108, z: 4 },
        nose:      { x: 0,   y: 108, z: 18 },

        shoulderL: { x: -24, y: 80,  z: 2 },
        elbowL:    { x: -44, y: 58,  z: 0 },
        wristL:    { x: -62, y: 38,  z: 0 },
        handL:     { x: -72, y: 28,  z: 0 },

        shoulderR: { x: 24,  y: 80,  z: 2 },
        elbowR:    { x: 44,  y: 58,  z: 0 },
        wristR:    { x: 62,  y: 38,  z: 0 },
        handR:     { x: 72,  y: 28,  z: 0 },

        hipL:      { x: -15, y: 10,  z: 0 },
        kneeL:     { x: -18, y: -32, z: 0 },
        ankleL:    { x: -18, y: -76, z: 0 },
        footL:     { x: -18, y: -84, z: 8 },

        hipR:      { x: 15,  y: 10,  z: 0 },
        kneeR:     { x: 18,  y: -32, z: 0 },
        ankleR:    { x: 18,  y: -76, z: 0 },
        footR:     { x: 18,  y: -84, z: 8 }
    };
}

// Reference T-Pose for anatomy & proportions inspection
function makeTPose() {
    var rig = makeRig();
    rig.shoulderL = { x: -26, y: 80, z: 0 };
    rig.elbowL    = { x: -50, y: 80, z: 0 };
    rig.wristL    = { x: -74, y: 80, z: 0 };
    rig.handL     = { x: -86, y: 80, z: 0 };

    rig.shoulderR = { x: 26,  y: 80, z: 0 };
    rig.elbowR    = { x: 50,  y: 80, z: 0 };
    rig.wristR    = { x: 74,  y: 80, z: 0 };
    rig.handR     = { x: 86,  y: 80, z: 0 };

    rig.hipL      = { x: -16, y: 10,  z: 0 };
    rig.kneeL     = { x: -16, y: -34, z: 0 };
    rig.ankleL    = { x: -16, y: -78, z: 0 };
    rig.footL     = { x: -16, y: -84, z: 8 };

    rig.hipR      = { x: 16,  y: 10,  z: 0 };
    rig.kneeR     = { x: 16,  y: -34, z: 0 };
    rig.ankleR    = { x: 16,  y: -78, z: 0 };
    rig.footR     = { x: 16,  y: -84, z: 8 };
    return rig;
}

// Reference A-Pose for anatomical inspection
function makeAPose() {
    var rig = makeRig();
    rig.shoulderL = { x: -26, y: 80, z: 0 };
    rig.elbowL    = { x: -48, y: 56, z: 0 };
    rig.wristL    = { x: -68, y: 32, z: 0 };
    rig.handL     = { x: -78, y: 20, z: 0 };

    rig.shoulderR = { x: 26,  y: 80, z: 0 };
    rig.elbowR    = { x: 48,  y: 56, z: 0 };
    rig.wristR    = { x: 68,  y: 32, z: 0 };
    rig.handR     = { x: 78,  y: 20, z: 0 };

    rig.hipL      = { x: -16, y: 10,  z: 0 };
    rig.kneeL     = { x: -18, y: -34, z: 0 };
    rig.ankleL    = { x: -20, y: -78, z: 0 };
    rig.footL     = { x: -20, y: -84, z: 8 };

    rig.hipR      = { x: 16,  y: 10,  z: 0 };
    rig.kneeR     = { x: 18,  y: -34, z: 0 };
    rig.ankleR    = { x: 20,  y: -78, z: 0 };
    rig.footR     = { x: 20,  y: -84, z: 8 };
    return rig;
}

// 20 Anatomical Bones connecting the stick figure
var SKELETON_BONES = [
    // Spine & Torso
    { a: "pelvis", b: "spine" },
    { a: "spine", b: "chest" },
    { a: "chest", b: "neck" },
    { a: "neck", b: "head" },

    // Left Arm (with Clavicle connecting chest to shoulder)
    { a: "chest", b: "shoulderL" },
    { a: "shoulderL", b: "elbowL" },
    { a: "elbowL", b: "wristL" },
    { a: "wristL", b: "handL" },

    // Right Arm (with Clavicle connecting chest to shoulder)
    { a: "chest", b: "shoulderR" },
    { a: "shoulderR", b: "elbowR" },
    { a: "elbowR", b: "wristR" },
    { a: "wristR", b: "handR" },

    // Left Leg
    { a: "pelvis", b: "hipL" },
    { a: "hipL", b: "kneeL" },
    { a: "kneeL", b: "ankleL" },
    { a: "ankleL", b: "footL" },

    // Right Leg
    { a: "pelvis", b: "hipR" },
    { a: "hipR", b: "kneeR" },
    { a: "kneeR", b: "ankleR" },
    { a: "ankleR", b: "footR" },

    // Pelvic Girdle (horizontal bar connecting hips)
    { a: "hipL", b: "hipR" }
];

// =========================================================================
// FAST MOCAP SHUFFLE DANCE BANK (Liquid Style Omitted)
// Fast Cadence: Stomps hit crisply on beats & off-beats (high energy shuffle)
// =========================================================================
// =========================================================================
// AIST++ REAL HUMAN MOTION CAPTURE CLIP BANK
// =========================================================================
var DANCER_CLIPS = (typeof AIST_DANCER_CLIPS !== "undefined") ? AIST_DANCER_CLIPS : {
    // Fallback if data/aist_clips.js has not finished loading
    loose_leg_shuffle: {
        beats: 2.0,
        phraseBeats: 8,
        name: "Shuffle",
        keyframes: [
            { t: 0.0, joints: makeRig() },
            { t: 1.0, joints: makeRig() }
        ]
    }
};

/**
 * Phase-Locked Cubic Smoothstep Keyframe Evaluator with Binary Search
 */
function sampleClipPose(clip, phase, outPose) {
    if (!clip || !clip.keyframes || clip.keyframes.length === 0) return;
    if (isNaN(phase)) phase = 0.0;
    phase = ((phase % 1.0) + 1.0) % 1.0;
    var kfs = clip.keyframes;
    var lastIdx = Math.max(0, kfs.length - 2);
    var idx = 0;
    if (phase <= kfs[0].t) {
        idx = 0;
    } else if (phase >= kfs[lastIdx].t) {
        idx = lastIdx;
    } else {
        var low = 0, high = lastIdx;
        while (low <= high) {
            var mid = (low + high) >> 1;
            if (phase < kfs[mid].t) {
                high = mid - 1;
            } else if (phase > kfs[mid + 1].t) {
                low = mid + 1;
            } else {
                idx = mid;
                break;
            }
        }
    }
    var k0 = kfs[idx];
    var k1 = kfs[idx + 1] || k0;
    var span = k1.t - k0.t;
    var tau = span > 0.00001 ? (phase - k0.t) / span : 0;
    var w = Math.max(0.0, Math.min(1.0, tau));

    for (var j in k0.joints) {
        if (!outPose[j]) outPose[j] = { x: 0, y: 0, z: 0 };
        var j0 = k0.joints[j];
        var j1 = (k1.joints && k1.joints[j]) ? k1.joints[j] : j0;
        var vx = j0.x + (j1.x - j0.x) * w;
        var vy = j0.y + (j1.y - j0.y) * w;
        var vz = j0.z + (j1.z - j0.z) * w;
        if (!isNaN(vx)) outPose[j].x = vx;
        if (!isNaN(vy)) outPose[j].y = vy;
        if (!isNaN(vz)) outPose[j].z = vz;
    }
}

/**
 * Inertial Blend between two poses
 */
function blendRigPoses(poseA, poseB, weight, outPose) {
    if (isNaN(weight)) weight = 1.0;
    var w = Math.max(0.0, Math.min(1.0, weight));
    var smoothW = w * w * (3.0 - 2.0 * w); // Smooth cubic blend
    for (var jName in poseA) {
        var pA = poseA[jName];
        var pB = (poseB && poseB[jName]) ? poseB[jName] : pA;
        if (!outPose[jName]) outPose[jName] = { x: 0, y: 0, z: 0 };
        var bx = pA.x + (pB.x - pA.x) * smoothW;
        var by = pA.y + (pB.y - pA.y) * smoothW;
        var bz = pA.z + (pB.z - pA.z) * smoothW;
        if (!isNaN(bx)) outPose[jName].x = bx;
        if (!isNaN(by)) outPose[jName].y = by;
        if (!isNaN(bz)) outPose[jName].z = bz;
    }
}

var BILATERAL_MIRROR_PAIRS = [
    ["shoulderL", "shoulderR"],
    ["elbowL", "elbowR"],
    ["wristL", "wristR"],
    ["handL", "handR"],
    ["hipL", "hipR"],
    ["kneeL", "kneeR"],
    ["ankleL", "ankleR"],
    ["footL", "footR"]
];

var MIDLINE_MIRROR_JOINTS = ["pelvis", "spine", "chest", "neck", "head", "nose"];

var _tempMirrorPose = {};

/**
 * Mirror a skeleton pose across the sagittal (lateral) plane for symmetric duo choreographies:
 * - Negates X coordinate for all joints (x' = -x)
 * - Swaps bilateral left/right joint pairs (e.g. left arm becomes right arm)
 */
function mirrorPose(srcPose, dstPose) {
    if (!srcPose || !dstPose) return;

    // Buffer src into temp object so in-place mirroring (srcPose === dstPose) is safe
    for (var jK in srcPose) {
        if (!_tempMirrorPose[jK]) _tempMirrorPose[jK] = { x: 0, y: 0, z: 0 };
        _tempMirrorPose[jK].x = srcPose[jK].x;
        _tempMirrorPose[jK].y = srcPose[jK].y;
        _tempMirrorPose[jK].z = srcPose[jK].z;
    }

    // 1. Mirror midline joints
    for (var i = 0; i < MIDLINE_MIRROR_JOINTS.length; i++) {
        var k = MIDLINE_MIRROR_JOINTS[i];
        if (_tempMirrorPose[k]) {
            if (!dstPose[k]) dstPose[k] = { x: 0, y: 0, z: 0 };
            dstPose[k].x = -_tempMirrorPose[k].x;
            dstPose[k].y = _tempMirrorPose[k].y;
            dstPose[k].z = _tempMirrorPose[k].z;
        }
    }

    // 2. Mirror and swap bilateral pairs
    for (var i = 0; i < BILATERAL_MIRROR_PAIRS.length; i++) {
        var pair = BILATERAL_MIRROR_PAIRS[i];
        var leftK = pair[0];
        var rightK = pair[1];

        var leftSrc = _tempMirrorPose[leftK];
        var rightSrc = _tempMirrorPose[rightK];

        if (!dstPose[leftK]) dstPose[leftK] = { x: 0, y: 0, z: 0 };
        if (!dstPose[rightK]) dstPose[rightK] = { x: 0, y: 0, z: 0 };

        if (rightSrc) {
            dstPose[leftK].x = -rightSrc.x;
            dstPose[leftK].y = rightSrc.y;
            dstPose[leftK].z = rightSrc.z;
        }
        if (leftSrc) {
            dstPose[rightK].x = -leftSrc.x;
            dstPose[rightK].y = leftSrc.y;
            dstPose[rightK].z = leftSrc.z;
        }
    }
}

// Default Female Proportions Specification
var DEFAULT_FEMALE_PROPORTIONS = {
    head: 12.0,
    neck: 5.3,
    chest: 14.0,
    bust: 8.6,
    bustFwd: 10.0,
    bustUp: -3.8,
    bustWidth: 6.4,
    spine: 10.8,
    pelvis: 7.6,
    glutes: 11.6,
    glutesRear: 3.5,
    glutesUp: -1.8,
    glutesWidth: 6.6,
    clavicle: 9.9,
    shoulder: 7.5,
    shoulderWidth: 19.5,
    upperArmMid: 5.9,
    upperArmEnd: 5.3,
    elbow: 5.1,
    forearm: 4.0,
    hand: 5.6,
    hip: 7.0,
    hipWidth: 11.0,
    thighTop: 8.6,
    thighBot: 6.8,
    knee: 6.0,
    calfTop: 6.0,
    calfBot: 4.8,
    ankle: 4.6,
    shoeLength: 14.0,
    shoeHeelR: 5.6,
    shoeToeR: 4.1,
    traps: 6.8,
    trapsUp: 1.0,
    trapsRear: 1.8
};

// Diverse Wardrobe of 8 Vibrant Bilaterally Symmetric Neon & Cyber Outfits
var DANCER_PALETTES = [
    {
        name: "Cyber Carnival",
        shirt: "#a855f7",
        pants: "#3b82f6",
        shoes: "#10b981",
        skin: "#ffd000",
        accent: "#ffffff"
    },
    {
        name: "Tokyo Synthwave",
        shirt: "#d946ef",
        pants: "#818cf8",
        shoes: "#00f3ff",
        skin: "#ffbe98",
        accent: "#facc15"
    },
    {
        name: "Acid Emerald",
        shirt: "#06b6d4",
        pants: "#10b981",
        shoes: "#a3e635",
        skin: "#fde047",
        accent: "#38bdf8"
    },
    {
        name: "Infrared Blaze",
        shirt: "#ff9500",
        pants: "#ff3b30",
        shoes: "#ffcc00",
        skin: "#fed7aa",
        accent: "#00f3ff"
    },
    {
        name: "Ultraviolet Velvet",
        shirt: "#6366f1",
        pants: "#a855f7",
        shoes: "#e879f9",
        skin: "#fbcfe8",
        accent: "#22d3ee"
    },
    {
        name: "Gilded Chrome",
        shirt: "#d97706",
        pants: "#38bdf8",
        shoes: "#f3f4f6",
        skin: "#fef08a",
        accent: "#67e8f9"
    },
    {
        name: "Ice & Fire",
        shirt: "#1e293b",
        pants: "#38bdf8",
        shoes: "#ef4444",
        skin: "#ffffff",
        accent: "#facc15"
    },
    {
        name: "Obsidian Glow",
        shirt: "#18181b",
        pants: "#16a34a",
        shoes: "#4ade80",
        skin: "#86efac",
        accent: "#a3e635"
    }
];

/**
 * =============================================================================
 * INDIVIDUAL DANCER RIG INSTANCE
 * Handles its own meshes, bone filaments, sneaker capsules, and proportions
 * =============================================================================
 */
class DancerRig {
    constructor(id, palettes, defaultPaletteIdx, defaultProps) {
        this.id = id;
        this.palettes = palettes || DANCER_PALETTES;
        this.paletteIdx = (defaultPaletteIdx !== undefined) ? defaultPaletteIdx : 0;
        var curPal = this.palettes[this.paletteIdx] || this.palettes[0];

        this.proportions = Object.assign({}, DEFAULT_FEMALE_PROPORTIONS, defaultProps);
        this.customColors = {
            shirt: curPal.shirt || "#a855f7",
            pants: curPal.pants || "#3b82f6",
            shoes: curPal.shoes || "#10b981",
            skin: curPal.skin || "#ffd000",
            accent: curPal.accent || "#ffffff"
        };

        this.group = new THREE.Group();
        this.joints = {};
        this.boneMeshes = [];
        this.bubbleDefs = [];

        this.bubbleGeom = null;
        this.bubbleMat = null;
        this.bubbleMesh = null;
        this.boneMat = null;
        this.visorMat = null;
        this.eyeRing = null;
        this.midlineRing = null;
        this.capsuleFootGeom = null;
        this.capsuleFootLMat = null;
        this.capsuleFootRMat = null;
        this.capsuleFootL = null;
        this.capsuleFootR = null;

        this.isInitialized = false;
    }

    init(scene) {
        this.scene = scene;
        this.scene.add(this.group);

        var base = makeRig();
        for (var k in base) {
            this.joints[k] = {
                pos: new THREE.Vector3(base[k].x, base[k].y, base[k].z),
                worldPos: new THREE.Vector3(base[k].x, base[k].y, base[k].z)
            };
        }

        var curPal = this.palettes[this.paletteIdx];

        // 1. Instanced Bubble Body
        this.bubbleDefs = this.generateBubbleDefs();
        this.bubbleGeom = new THREE.SphereGeometry(1.0, 14, 10);
        this.bubbleMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            roughness: 0.14,
            metalness: 0.42,
            emissive: 0x181824,
            emissiveIntensity: 0.45,
            depthWrite: true,
            transparent: false
        });

        this.bubbleMesh = new THREE.InstancedMesh(this.bubbleGeom, this.bubbleMat, this.bubbleDefs.length);
        if (this.bubbleMesh.instanceMatrix.setUsage) {
            this.bubbleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage || 35048);
        }
        this.group.add(this.bubbleMesh);

        // 2. Bone Filaments
        var boneGeom = new THREE.CylinderGeometry(0.8, 0.8, 1.0, 6);
        this.boneMat = new THREE.MeshBasicMaterial({
            color: this.customColors.accent || curPal.accent || 0xffffff,
            transparent: true,
            opacity: 0.75
        });

        this.boneMeshes = [];
        for (var b = 0; b < SKELETON_BONES.length; b++) {
            var boneDef = SKELETON_BONES[b];
            var bMesh = new THREE.Mesh(boneGeom, this.boneMat);
            this.group.add(bMesh);
            this.boneMeshes.push({
                mesh: bMesh,
                jointA: boneDef.a,
                jointB: boneDef.b
            });
        }

        // 3. Head Torus Rings
        this.visorMat = new THREE.MeshBasicMaterial({
            color: this.customColors.accent || curPal.accent || 0xffffff,
            transparent: true,
            opacity: 0.95,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2.0,
            polygonOffsetUnits: -4.0
        });

        var eyeGeom = new THREE.TorusGeometry(13.6, 0.28, 6, 28, Math.PI);
        eyeGeom.rotateX(Math.PI / 2);
        this.eyeRing = new THREE.Mesh(eyeGeom, this.visorMat);
        this.eyeRing.renderOrder = 100;
        this.group.add(this.eyeRing);

        var midlineGeom = new THREE.TorusGeometry(13.6, 0.26, 6, 28, Math.PI);
        midlineGeom.rotateZ(-Math.PI / 2);
        midlineGeom.rotateY(-Math.PI / 2);
        this.midlineRing = new THREE.Mesh(midlineGeom, this.visorMat);
        this.midlineRing.renderOrder = 100;
        this.group.add(this.midlineRing);

        // 4. Sneaker Footwear Capsules
        this.buildFootCapsules(curPal);

        // Apply Colors to all components
        this.applyBubbleColors();

        this.isInitialized = true;
    }

    generateBubbleDefs() {
        var defs = [];
        var p = this.proportions;

        var jointDefs = [
            // Head & Neck -> skin
            { type: "joint", id: "head",      r: p.head,        propKey: "head",        group: "skin"  },
            { type: "joint", id: "neck",      r: p.neck,        propKey: "neck",        group: "skin"  },
            { type: "joint", id: "handL",     r: p.hand,        propKey: "hand",        group: "skin"  },
            { type: "joint", id: "handR",     r: p.hand,        propKey: "hand",        group: "skin"  },

            // Upper Torso & Arms -> shirt
            { type: "joint", id: "chest",     r: p.chest,       propKey: "chest",       group: "shirt" },
            { type: "bust",  side: "L",       r: p.bust || 8.6, propKey: "bust",        group: "shirt" },
            { type: "bust",  side: "R",       r: p.bust || 8.6, propKey: "bust",        group: "shirt" },
            { type: "traps", side: "L",       r: p.traps || 6.8, propKey: "traps",      group: "shirt" },
            { type: "traps", side: "R",       r: p.traps || 6.8, propKey: "traps",      group: "shirt" },
            { type: "joint", id: "spine",     r: p.spine,       propKey: "spine",       group: "shirt" },
            { type: "joint", id: "shoulderL", r: p.shoulder,    propKey: "shoulder",    group: "shirt" },
            { type: "joint", id: "shoulderR", r: p.shoulder,    propKey: "shoulder",    group: "shirt" },
            { type: "joint", id: "elbowL",    r: p.elbow,       propKey: "elbow",       group: "shirt" },
            { type: "joint", id: "elbowR",    r: p.elbow,       propKey: "elbow",       group: "shirt" },
            { type: "joint", id: "wristL",    r: p.forearm,     propKey: "forearm",     group: "shirt" },
            { type: "joint", id: "wristR",    r: p.forearm,     propKey: "forearm",     group: "shirt" },

            // Lower Torso, Hips & Legs -> pants
            { type: "joint",  id: "pelvis",   r: p.pelvis,      propKey: "pelvis",      group: "pants" },
            { type: "glutes", side: "L",      r: p.glutes || 11.6, propKey: "glutes",    group: "pants" },
            { type: "glutes", side: "R",      r: p.glutes || 11.6, propKey: "glutes",    group: "pants" },
            { type: "joint",  id: "hipL",     r: p.hip,         propKey: "hip",         group: "pants" },
            { type: "joint",  id: "hipR",     r: p.hip,         propKey: "hip",         group: "pants" },
            { type: "joint",  id: "kneeL",    r: p.knee,        propKey: "knee",        group: "pants" },
            { type: "joint",  id: "kneeR",    r: p.knee,        propKey: "knee",        group: "pants" },

            // Ankles -> shoes
            { type: "joint", id: "ankleL",    r: p.ankle,       propKey: "ankle",       group: "shoes" },
            { type: "joint", id: "ankleR",    r: p.ankle,       propKey: "ankle",       group: "shoes" }
        ];

        for (var i = 0; i < jointDefs.length; i++) {
            defs.push(jointDefs[i]);
        }

        // Interpolated Limb Bubbles along bones
        for (var b = 0; b < SKELETON_BONES.length; b++) {
            var bDef = SKELETON_BONES[b];

            // 1. Clavicle bridges between chest and shoulder -> shirt
            if (bDef.a === "chest" && (bDef.b === "shoulderL" || bDef.b === "shoulderR")) {
                defs.push({
                    type: "bone", a: bDef.a, b: bDef.b, frac: 0.35,
                    r: (p.chest * 0.4 + p.clavicle * 0.6), tag: "clavicle_inner", group: "shirt"
                });
                defs.push({
                    type: "bone", a: bDef.a, b: bDef.b, frac: 0.68,
                    r: p.clavicle, tag: "clavicle_mid", group: "shirt"
                });
                continue;
            }

            var isUpperArm = (bDef.a.indexOf("shoulder") !== -1 && bDef.b.indexOf("elbow") !== -1);
            if (isUpperArm) {
                var fracs = [0.20, 0.40, 0.60, 0.80];
                for (var f = 0; f < fracs.length; f++) {
                    var frac = fracs[f];
                    var armR = p.upperArmMid + (p.upperArmEnd - p.upperArmMid) * (f / (fracs.length - 1));
                    defs.push({
                        type: "bone", a: bDef.a, b: bDef.b, frac: frac,
                        r: armR, tag: "upper_arm", group: "shirt"
                    });
                }
                continue;
            }

            // 3. Forearm -> shirt
            var isForearm = (bDef.a.indexOf("elbow") !== -1 && bDef.b.indexOf("wrist") !== -1);
            if (isForearm) {
                var fracs = [0.20, 0.40, 0.60, 0.80];
                for (var f = 0; f < fracs.length; f++) {
                    var frac = fracs[f];
                    defs.push({
                        type: "bone", a: bDef.a, b: bDef.b, frac: frac,
                        r: p.forearm * (1.15 - frac * 0.25), tag: "forearm", group: "shirt"
                    });
                }
                continue;
            }

            // 4. Neck bridge -> skin
            if (bDef.a === "neck" && bDef.b === "head") {
                defs.push({
                    type: "bone", a: bDef.a, b: bDef.b, frac: 0.33,
                    r: p.neck * 1.05, tag: "neck_bridge", group: "skin"
                });
                defs.push({
                    type: "bone", a: bDef.a, b: bDef.b, frac: 0.66,
                    r: p.neck * 0.95, tag: "neck_bridge", group: "skin"
                });
                continue;
            }

            // 5. Spine to chest bridge -> shirt
            if (bDef.a === "spine" && bDef.b === "chest") {
                defs.push({
                    type: "bone", a: bDef.a, b: bDef.b, frac: 0.50,
                    r: (p.spine * 0.45 + p.chest * 0.55), tag: "chest_bridge", group: "shirt"
                });
                continue;
            }

            // 6. Pelvis to spine bridge -> pants
            if (bDef.a === "pelvis" && bDef.b === "spine") {
                defs.push({
                    type: "bone", a: bDef.a, b: bDef.b, frac: 0.48,
                    r: (p.pelvis * 0.55 + p.spine * 0.45), tag: "waist_bridge", group: "pants"
                });
                continue;
            }

            // 7. Pelvis to hips -> pants
            if (bDef.a === "pelvis" && (bDef.b === "hipL" || bDef.b === "hipR")) {
                defs.push({
                    type: "bone", a: bDef.a, b: bDef.b, frac: 0.50,
                    r: (p.pelvis * 0.45 + p.hip * 0.55), tag: "hip_bridge", group: "pants"
                });
                continue;
            }

            // 8. Pelvic girdle cross-bar -> pants
            if (bDef.a === "hipL" && bDef.b === "hipR") {
                defs.push({
                    type: "bone", a: bDef.a, b: bDef.b, frac: 0.50,
                    r: p.pelvis * 0.82, tag: "crotch", group: "pants"
                });
                continue;
            }

            // 9. Upper Leg (Thigh) -> pants
            var isUpperLeg = (bDef.a.indexOf("hip") !== -1 && bDef.b.indexOf("knee") !== -1);
            if (isUpperLeg) {
                var fracs = [0.20, 0.40, 0.60, 0.80];
                for (var f = 0; f < fracs.length; f++) {
                    var frac = fracs[f];
                    defs.push({
                        type: "bone", a: bDef.a, b: bDef.b, frac: frac,
                        r: p.thighTop - frac * (p.thighTop - p.thighBot),
                        tag: "thigh", group: "pants"
                    });
                }
                continue;
            }

            // 10. Lower Leg (Calf) -> pants
            var isLowerLeg = (bDef.a.indexOf("knee") !== -1 && bDef.b.indexOf("ankle") !== -1);
            if (isLowerLeg) {
                var fracs = [0.17, 0.34, 0.51, 0.68, 0.85];
                for (var f = 0; f < fracs.length; f++) {
                    var frac = fracs[f];
                    defs.push({
                        type: "bone", a: bDef.a, b: bDef.b, frac: frac,
                        r: p.calfTop - frac * (p.calfTop - p.calfBot),
                        tag: "calf", group: "pants"
                    });
                }
                continue;
            }
        }
        return defs;
    }

    buildFootCapsules(curPal) {
        curPal = curPal || this.palettes[this.paletteIdx] || {};
        var p = this.proportions;
        var points = [];
        var capSegs = 6;
        var rHeel = p.shoeHeelR || 4.8;
        var rToe = p.shoeToeR || 4.0;
        var length = p.shoeLength || 10.0;

        for (var i = capSegs; i >= 0; i--) {
            var a = (i / capSegs) * (Math.PI / 2);
            points.push(new THREE.Vector2(Math.cos(a) * rHeel, -length * 0.5 - Math.sin(a) * rHeel));
        }
        points.push(new THREE.Vector2(rHeel, -length * 0.5));
        points.push(new THREE.Vector2(rToe, length * 0.5));
        for (var i = 0; i <= capSegs; i++) {
            var a = (i / capSegs) * (Math.PI / 2);
            points.push(new THREE.Vector2(Math.cos(a) * rToe, length * 0.5 + Math.sin(a) * rToe));
        }

        var oldGeom = this.capsuleFootGeom;
        this.capsuleFootGeom = new THREE.LatheGeometry(points, 14);
        this.capsuleFootGeom.rotateX(Math.PI / 2);

        if (oldGeom) {
            oldGeom.dispose();
        }

        if (this.capsuleFootL && this.capsuleFootR) {
            this.capsuleFootL.geometry = this.capsuleFootGeom;
            this.capsuleFootR.geometry = this.capsuleFootGeom;
            return;
        }

        var shoeColorHex = (this.customColors && this.customColors.shoes) || curPal.shoes || "#10b981";

        // Left Sneaker Capsule
        this.capsuleFootLMat = new THREE.MeshStandardMaterial({
            color: shoeColorHex,
            roughness: 0.14,
            metalness: 0.42,
            emissive: 0x181824,
            emissiveIntensity: 0.45
        });
        this.capsuleFootL = new THREE.Mesh(this.capsuleFootGeom, this.capsuleFootLMat);
        this.group.add(this.capsuleFootL);

        // Right Sneaker Capsule
        this.capsuleFootRMat = new THREE.MeshStandardMaterial({
            color: shoeColorHex,
            roughness: 0.14,
            metalness: 0.42,
            emissive: 0x181824,
            emissiveIntensity: 0.45
        });
        this.capsuleFootR = new THREE.Mesh(this.capsuleFootGeom, this.capsuleFootRMat);
        this.group.add(this.capsuleFootR);
    }

    applyBubbleColors() {
        if (!this.bubbleMesh || !this.bubbleDefs) return;
        var colors = this.customColors;
        for (var i = 0; i < this.bubbleDefs.length; i++) {
            var grp = this.bubbleDefs[i].group || "shirt";
            var hexVal = colors[grp] || colors.shirt || "#a855f7";
            _tempColor.set(hexVal);
            this.bubbleMesh.setColorAt(i, _tempColor);
        }
        if (this.bubbleMesh.instanceColor) {
            this.bubbleMesh.instanceColor.needsUpdate = true;
        }

        // Apply to sneaker footwear capsules
        if (this.capsuleFootLMat) {
            this.capsuleFootLMat.color.set(colors.shoes || "#10b981");
        }
        if (this.capsuleFootRMat) {
            this.capsuleFootRMat.color.set(colors.shoes || "#10b981");
        }
        if (this.boneMat) {
            this.boneMat.color.set(colors.accent || "#ffffff");
        }
        if (this.visorMat) {
            this.visorMat.color.set(colors.accent || "#ffffff");
        }
    }

    recomputeBubbleRadii() {
        if (!this.bubbleMesh) return;
        this.bubbleDefs = this.generateBubbleDefs();
        this.applyBubbleColors();
    }

    setProportion(prop, val) {
        if (this.proportions[prop] === undefined) return;
        this.proportions[prop] = parseFloat(val);
        if (prop.indexOf("shoe") !== -1) {
            this.buildFootCapsules(this.palettes[this.paletteIdx]);
        } else {
            this.recomputeBubbleRadii();
        }
    }

    applyProportions(newProps) {
        for (var k in newProps) {
            if (this.proportions[k] !== undefined) {
                this.proportions[k] = parseFloat(newProps[k]);
            }
        }
        this.buildFootCapsules(this.palettes[this.paletteIdx]);
        this.recomputeBubbleRadii();
    }

    setCustomColor(garmentKey, hex) {
        if (!this.customColors || this.customColors[garmentKey] === undefined) return;
        this.customColors[garmentKey] = hex;
        this.applyBubbleColors();
    }

    setOutfit(idx) {
        if (idx < 0 || idx >= this.palettes.length) return;
        this.paletteIdx = idx;
        var curPal = this.palettes[this.paletteIdx];

        this.customColors.shirt  = curPal.shirt;
        this.customColors.pants  = curPal.pants;
        this.customColors.shoes  = curPal.shoes;
        this.customColors.skin   = curPal.skin;
        this.customColors.accent = curPal.accent;

        this.applyBubbleColors();
    }

    update(pose, dt, hitIntensity, popIntensity, poseMode) {
        if (!this.isInitialized || !this.group.visible) return;

        // 1. POSE APPLICATION
        if (poseMode === "tpose") {
            var tPose = makeTPose();
            for (var jK in tPose) {
                if (this.joints[jK]) {
                    this.joints[jK].worldPos.set(tPose[jK].x, tPose[jK].y, tPose[jK].z);
                }
            }
        } else if (poseMode === "apose") {
            var aPose = makeAPose();
            for (var jK in aPose) {
                if (this.joints[jK]) {
                    this.joints[jK].worldPos.set(aPose[jK].x, aPose[jK].y, aPose[jK].z);
                }
            }
        } else {
            // Apply pose for "dance" and "pause"
            for (var jName in this.joints) {
                var targetJ = pose[jName];
                if (targetJ) {
                    this.joints[jName].worldPos.set(targetJ.x, targetJ.y, targetJ.z);
                }
            }
        }

        // Real-Time Hip Width adjustment (applies dynamically to ALL pose modes)
        if (this.proportions.hipWidth !== undefined && this.joints.hipL && this.joints.hipR) {
            var targetHipHalfWidth = this.proportions.hipWidth;
            _vRight.subVectors(this.joints.hipR.worldPos, this.joints.hipL.worldPos);
            var currentHipDist = _vRight.length();
            if (currentHipDist > 0.001) {
                var curHipHalfWidth = currentHipDist * 0.5;
                _vRight.normalize();
                var deltaWidth = targetHipHalfWidth - curHipHalfWidth;
                if (Math.abs(deltaWidth) > 0.01) {
                    _vTemp.copy(_vRight).multiplyScalar(-deltaWidth);
                    this.joints.hipL.worldPos.add(_vTemp);
                    if (this.joints.kneeL) this.joints.kneeL.worldPos.add(_vTemp);
                    if (this.joints.ankleL) this.joints.ankleL.worldPos.add(_vTemp);
                    if (this.joints.footL) this.joints.footL.worldPos.add(_vTemp);

                    _vTemp.copy(_vRight).multiplyScalar(deltaWidth);
                    this.joints.hipR.worldPos.add(_vTemp);
                    if (this.joints.kneeR) this.joints.kneeR.worldPos.add(_vTemp);
                    if (this.joints.ankleR) this.joints.ankleR.worldPos.add(_vTemp);
                    if (this.joints.footR) this.joints.footR.worldPos.add(_vTemp);
                }
            }
        }

        // Real-Time Shoulder Width adjustment (applies dynamically to ALL pose modes)
        if (this.proportions.shoulderWidth !== undefined && this.joints.shoulderL && this.joints.shoulderR) {
            var targetShoulderHalfWidth = this.proportions.shoulderWidth;
            _vRight.subVectors(this.joints.shoulderR.worldPos, this.joints.shoulderL.worldPos);
            var currentShDist = _vRight.length();
            if (currentShDist > 0.001) {
                var curShHalfWidth = currentShDist * 0.5;
                _vRight.normalize();
                var deltaShWidth = targetShoulderHalfWidth - curShHalfWidth;
                if (Math.abs(deltaShWidth) > 0.01) {
                    _vTemp.copy(_vRight).multiplyScalar(-deltaShWidth);
                    this.joints.shoulderL.worldPos.add(_vTemp);
                    if (this.joints.elbowL) this.joints.elbowL.worldPos.add(_vTemp);
                    if (this.joints.wristL) this.joints.wristL.worldPos.add(_vTemp);
                    if (this.joints.handL) this.joints.handL.worldPos.add(_vTemp);

                    _vTemp.copy(_vRight).multiplyScalar(deltaShWidth);
                    this.joints.shoulderR.worldPos.add(_vTemp);
                    if (this.joints.elbowR) this.joints.elbowR.worldPos.add(_vTemp);
                    if (this.joints.wristR) this.joints.wristR.worldPos.add(_vTemp);
                    if (this.joints.handR) this.joints.handR.worldPos.add(_vTemp);
                }
            }
        }

        // 2. COMPUTE ANATOMICAL FORWARD FOOT VECTORS
        if (this.joints.nose && this.joints.head) {
            _vBodyFwd.subVectors(this.joints.nose.worldPos, this.joints.head.worldPos);
            _vBodyFwd.y = 0;
            if (_vBodyFwd.lengthSq() < 0.001) {
                _vBodyFwd.set(0, 0, 1);
            } else {
                _vBodyFwd.normalize();
            }
        } else {
            _vBodyFwd.set(0, 0, 1);
        }

        var kneeL = this.joints.kneeL.worldPos;
        var ankleL = this.joints.ankleL.worldPos;
        computeFootFrame(this.joints.hipL.worldPos, kneeL, ankleL, _vBodyFwd, _fwdL, _upL, _rightL);

        var kneeR = this.joints.kneeR.worldPos;
        var ankleR = this.joints.ankleR.worldPos;
        computeFootFrame(this.joints.hipR.worldPos, kneeR, ankleR, _vBodyFwd, _fwdR, _upR, _rightR);

        this.joints.footL.worldPos.copy(ankleL).addScaledVector(_fwdL, 14.5).addScaledVector(_upL, -2.4);
        if (this.joints.footL.worldPos.y < -84.0) this.joints.footL.worldPos.y = -84.0;

        this.joints.footR.worldPos.copy(ankleR).addScaledVector(_fwdR, 14.0).addScaledVector(_upR, -2.4);
        if (this.joints.footR.worldPos.y < -84.0) this.joints.footR.worldPos.y = -84.0;

        if (ankleL.y < -82.0) ankleL.y = -82.0;
        if (ankleR.y < -82.0) ankleR.y = -82.0;

        // 3. UPDATE INSTANCED BUBBLES
        if (this.bubbleMesh && this.bubbleDefs) {
            for (var bi = 0; bi < this.bubbleDefs.length; bi++) {
                var bDef = this.bubbleDefs[bi];
                if (bDef.type === "joint") {
                    var jPos = this.joints[bDef.id].worldPos;
                    _v1.copy(jPos);
                } else if (bDef.type === "bust") {
                    var chestPos = this.joints.chest.worldPos;
                    var shL = this.joints.shoulderL.worldPos;
                    var shR = this.joints.shoulderR.worldPos;
                    var spPos = this.joints.spine.worldPos;

                    _vUp.subVectors(this.joints.neck.worldPos, spPos);
                    if (_vUp.lengthSq() > 0.0001) _vUp.normalize(); else _vUp.set(0, 1, 0);
                    _vRight.subVectors(shR, shL);
                    if (_vRight.lengthSq() > 0.0001) _vRight.normalize(); else _vRight.set(1, 0, 0);
                    _vFwd.crossVectors(_vRight, _vUp);
                    if (_vFwd.lengthSq() > 0.0001) _vFwd.normalize(); else _vFwd.set(0, 0, 1);
                    if (_vFwd.dot(_vBodyFwd) < 0) {
                        _vFwd.negate();
                        _vRight.negate();
                    }
                    _vRight.crossVectors(_vUp, _vFwd);
                    if (_vRight.lengthSq() > 0.0001) _vRight.normalize(); else _vRight.set(1, 0, 0);

                    var p = this.proportions;
                    var latDist = (p.bustWidth !== undefined) ? p.bustWidth : (p.chest * 0.42 + 0.6);
                    var lateral = (bDef.side === "L") ? -latDist : latDist;
                    var fwdDist = (p.bustFwd !== undefined) ? p.bustFwd : (p.chest * 0.58 + 2.8);
                    var vertDist = (p.bustUp !== undefined) ? p.bustUp : -2.4;

                    _v1.copy(chestPos)
                        .addScaledVector(_vRight, lateral)
                        .addScaledVector(_vUp, vertDist)
                        .addScaledVector(_vFwd, fwdDist);
                } else if (bDef.type === "traps") {
                    var neckPos = this.joints.neck.worldPos;
                    var shL = this.joints.shoulderL.worldPos;
                    var shR = this.joints.shoulderR.worldPos;
                    var spPos = this.joints.spine.worldPos;
                    var shTarget = (bDef.side === "L") ? shL : shR;

                    _vUp.subVectors(neckPos, spPos);
                    if (_vUp.lengthSq() > 0.0001) _vUp.normalize(); else _vUp.set(0, 1, 0);
                    _vRight.subVectors(shR, shL);
                    if (_vRight.lengthSq() > 0.0001) _vRight.normalize(); else _vRight.set(1, 0, 0);
                    _vFwd.crossVectors(_vRight, _vUp);
                    if (_vFwd.lengthSq() > 0.0001) _vFwd.normalize(); else _vFwd.set(0, 0, 1);
                    if (_vFwd.dot(_vBodyFwd) < 0) {
                        _vFwd.negate();
                        _vRight.negate();
                    }
                    _vRight.crossVectors(_vUp, _vFwd);
                    if (_vRight.lengthSq() > 0.0001) _vRight.normalize(); else _vRight.set(1, 0, 0);

                    var p = this.proportions;
                    // Trapezius sits along the neck-to-shoulder slope
                    var trapBase = _vTemp.copy(neckPos).lerp(shTarget, 0.44);
                    var rearDist = (p.trapsRear !== undefined) ? p.trapsRear : 1.8;
                    var vertDist = (p.trapsUp !== undefined) ? p.trapsUp : 1.0;

                    _v1.copy(trapBase)
                        .addScaledVector(_vUp, vertDist)
                        .addScaledVector(_vFwd, -rearDist);
                } else if (bDef.type === "glutes") {
                    var pelPos = this.joints.pelvis.worldPos;
                    var hL = this.joints.hipL.worldPos;
                    var hR = this.joints.hipR.worldPos;
                    var spPos = this.joints.spine.worldPos;

                    _vUp.subVectors(spPos, pelPos);
                    if (_vUp.lengthSq() > 0.0001) _vUp.normalize(); else _vUp.set(0, 1, 0);
                    _vRight.subVectors(hR, hL);
                    if (_vRight.lengthSq() > 0.0001) _vRight.normalize(); else _vRight.set(1, 0, 0);
                    _vFwd.crossVectors(_vRight, _vUp);
                    if (_vFwd.lengthSq() > 0.0001) _vFwd.normalize(); else _vFwd.set(0, 0, 1);
                    if (_vFwd.dot(_vBodyFwd) < 0) {
                        _vFwd.negate();
                        _vRight.negate();
                    }
                    _vRight.crossVectors(_vUp, _vFwd);
                    if (_vRight.lengthSq() > 0.0001) _vRight.normalize(); else _vRight.set(1, 0, 0);

                    var p = this.proportions;
                    var latDist = (p.glutesWidth !== undefined) ? p.glutesWidth : (p.pelvis * 0.52 + 1.0);
                    var lateral = (bDef.side === "L") ? -latDist : latDist;
                    var rearDist = (p.glutesRear !== undefined) ? p.glutesRear : (p.pelvis * 0.65 + 2.2);
                    var vertDist = (p.glutesUp !== undefined) ? p.glutesUp : -1.8;

                    _v1.copy(pelPos)
                        .addScaledVector(_vRight, lateral)
                        .addScaledVector(_vUp, vertDist)
                        .addScaledVector(_vFwd, -rearDist);
                } else if (bDef.type === "foot_bubble") {
                    var isL = (bDef.side === "L");
                    var ank = isL ? ankleL : ankleR;
                    var fwd = isL ? _fwdL : _fwdR;
                    var up = isL ? _upL : _upR;
                    if (bDef.tag === "heel") {
                        _v1.copy(ank).addScaledVector(fwd, -3.8).addScaledVector(up, -1.6);
                    } else if (bDef.tag === "arch") {
                        _v1.copy(ank).addScaledVector(fwd, 6.5).addScaledVector(up, -2.0);
                    }
                    if (_v1.y < -84.0 + bDef.r * 0.2) _v1.y = -84.0 + bDef.r * 0.2;
                } else {
                    var posA = this.joints[bDef.a].worldPos;
                    var posB = this.joints[bDef.b].worldPos;
                    _v1.set(
                        posA.x + (posB.x - posA.x) * bDef.frac,
                        posA.y + (posB.y - posA.y) * bDef.frac,
                        posA.z + (posB.z - posA.z) * bDef.frac
                    );
                }
                var r = (bDef.r && bDef.r > 0.05) ? bDef.r : 0.0001;
                _vScale.set(r, r, r);
                _matrix.compose(_v1, _dummyQuat, _vScale);
                this.bubbleMesh.setMatrixAt(bi, _matrix);
            }
            this.bubbleMesh.instanceMatrix.needsUpdate = true;
        }

        // 4. UPDATE BONE CYLINDERS
        for (var bi = 0; bi < this.boneMeshes.length; bi++) {
            var bObj = this.boneMeshes[bi];
            var posA = this.joints[bObj.jointA].worldPos;
            var posB = this.joints[bObj.jointB].worldPos;

            bObj.mesh.position.set(
                (posA.x + posB.x) * 0.5,
                (posA.y + posB.y) * 0.5,
                (posA.z + posB.z) * 0.5
            );

            _v1.subVectors(posB, posA);
            var boneLen = _v1.length();
            bObj.mesh.scale.set(1.0, Math.max(0.1, boneLen), 1.0);

            if (boneLen > 0.001) {
                _v1.divideScalar(boneLen);
                _quat.setFromUnitVectors(_yAxis, _v1);
                bObj.mesh.quaternion.copy(_quat);
            }
        }

        // 5. UPDATE HEAD RINGS
        var hPos = this.joints.head.worldPos;
        this.eyeRing.position.copy(hPos);
        this.midlineRing.position.copy(hPos);

        var currentHeadRadius = (this.proportions.head || 12.0) * 1.03;
        var ringScale = currentHeadRadius / 13.6;
        this.eyeRing.scale.set(ringScale, ringScale, ringScale);
        this.midlineRing.scale.set(ringScale, ringScale, ringScale);

        if (this.joints.nose && this.joints.neck) {
            _v1.subVectors(this.joints.nose.worldPos, hPos).normalize();
            _v3.subVectors(hPos, this.joints.neck.worldPos).normalize();
            _v3.addScaledVector(_v1, -_v3.dot(_v1)).normalize();
            _v2.crossVectors(_v3, _v1).normalize();

            _matrix.makeBasis(_v2, _v3, _v1);
            _quat.setFromRotationMatrix(_matrix);

            this.eyeRing.quaternion.copy(_quat);
            this.midlineRing.quaternion.copy(_quat);
        }

        // 6. UPDATE SNEAKER CAPSULES
        if (this.capsuleFootL && this.joints.ankleL) {
            var ankL = this.joints.ankleL.worldPos;
            _v1.copy(ankL).addScaledVector(_fwdL, 5.2).addScaledVector(_upL, -2.0);
            if (_v1.y < -84.0 + 4.2) _v1.y = -84.0 + 4.2;
            this.capsuleFootL.position.copy(_v1);

            _matrix.makeBasis(_rightL, _upL, _fwdL);
            _quat.setFromRotationMatrix(_matrix);
            this.capsuleFootL.quaternion.copy(_quat);
            this.capsuleFootL.scale.set(1.0, 1.0, 1.0);
        }

        if (this.capsuleFootR && this.joints.ankleR) {
            var ankR = this.joints.ankleR.worldPos;
            _v1.copy(ankR).addScaledVector(_fwdR, 5.2).addScaledVector(_upR, -2.0);
            if (_v1.y < -84.0 + 4.2) _v1.y = -84.0 + 4.2;
            this.capsuleFootR.position.copy(_v1);

            _matrix.makeBasis(_rightR, _upR, _fwdR);
            _quat.setFromRotationMatrix(_matrix);
            this.capsuleFootR.quaternion.copy(_quat);
            this.capsuleFootR.scale.set(1.0, 1.0, 1.0);
        }
    }

    destroy() {
        if (this.bubbleGeom) this.bubbleGeom.dispose();
        if (this.bubbleMat) this.bubbleMat.dispose();
        if (this.boneMat) this.boneMat.dispose();
        if (this.visorMat) this.visorMat.dispose();
        if (this.eyeRing && this.eyeRing.geometry) this.eyeRing.geometry.dispose();
        if (this.midlineRing && this.midlineRing.geometry) this.midlineRing.geometry.dispose();
        if (this.capsuleFootGeom) this.capsuleFootGeom.dispose();
        if (this.capsuleFootLMat) this.capsuleFootLMat.dispose();
        if (this.capsuleFootRMat) this.capsuleFootRMat.dispose();

        if (this.group && this.group.parent) {
            this.group.parent.remove(this.group);
        }
    }
}

/**
 * =============================================================================
 * DANCER SCENE CONTROLLER (Scene 5)
 * Coordinates the full Troupe, Lighting, Camera, Audio Synchronization & Stage
 * =============================================================================
 */
class DancerScene {
    get name() {
        var clips = (typeof AIST_DANCER_CLIPS !== "undefined") ? AIST_DANCER_CLIPS : DANCER_CLIPS;
        var clip = clips[this.currentClipName];
        var clipTitle = clip ? clip.name : "Shuffle";
        var formLabel = this.formation === "3" ? "Trio" : (this.formation === "2_face" ? "Duo Face" : (this.formation === "2_fwd" ? "Duo" : "Solo"));
        var spd = this.speedScale ? this.speedScale.toFixed(1) : "1.0";
        return "Dancer (" + clipTitle + " • " + formLabel + " [" + spd + "x])";
    }

    constructor() {
        this.container = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.time = 0;

        // Troupe Collection
        this.palettes = DANCER_PALETTES;
        this.dancers = [];
        this.formation = "1"; // "1", "2_fwd", "2_face", "3"
        this.phaseOffset = 0.0; // 0.00s to 0.20s timing delay between dancers
        this.activeDancerIdx = "0"; // "0", "1", "2", or "all"
        this.cameraBaseDist = 430;

        this.isVisible = false;

        // Motion State Machine
        this.dancePhase = 0;
        this.bpm = 126;
        this.speedScale = 1.0;
        this.hitIntensity = 0;
        // AIST++ Mocap Playlist & Selection
        var clips = (typeof AIST_DANCER_CLIPS !== "undefined") ? AIST_DANCER_CLIPS : DANCER_CLIPS;
        this.allClips = clips;
        this.allClipKeys = Object.keys(clips);
        this.enabledDances = new Set(this.allClipKeys);
        this.playlist = [...this.allClipKeys];
        this.playlistIdx = 0;
        this.currentClipName = this.playlist[0] || "house_basic_bounce";
        this.nextClipName = null;
        this.danceLocked = false; // When true, stays on current dance indefinitely (does not auto-cycle)
        this.blendProgress = 1.0;
        this.blendDuration = 0.25;
        this.phraseCount = 0;

        // Cached pose evaluations per dancer
        this.poseCurrent = {};
        this.poseNext = {};
        this.blendedPoses = [{}, {}, {}];

        this.isInitialized = false;

        this.poseMode = "dance"; // "dance", "pause", "tpose", "apose"
        this.cameraAnglePreset = "orbit"; // "orbit", "orbit_paused", "front", "three_quarter", "side", "top"
        this.orbitAngle = 0.0;
        this.paletteIdx = 0;
        this.danceCadenceMultiplier = 1;

        // Hotkeys for live speed scaling
        this.onKeyDown = (e) => {
            if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "SELECT")) return;
            if (e.key === "]" || e.key === "+" || e.key === "=") {
                this.speedScale = Math.min(3.0, this.speedScale + 0.5);
                this.flashSpeedHUD();
            } else if (e.key === "[" || e.key === "-" || e.key === "_") {
                this.speedScale = Math.max(0.5, this.speedScale - 0.5);
                this.flashSpeedHUD();
            }
        };
        window.addEventListener("keydown", this.onKeyDown);
    }

    flashSpeedHUD() {
        var el = document.getElementById("current-scene-name");
        if (el) el.textContent = this.name;
    }

    // Helper to get active dancer instance (or Dancer 0 if 'all')
    getActiveDancer() {
        if (this.activeDancerIdx === "all") {
            return this.dancers[0];
        }
        var idx = parseInt(this.activeDancerIdx, 10);
        return this.dancers[idx] || this.dancers[0];
    }

    getActiveProportions() {
        var d = this.getActiveDancer();
        return d ? d.proportions : DEFAULT_FEMALE_PROPORTIONS;
    }

    getActiveColors() {
        var d = this.getActiveDancer();
        return d ? d.customColors : {};
    }

    getActiveOutfit() {
        var d = this.getActiveDancer();
        return d ? d.paletteIdx : this.paletteIdx;
    }

    cycleDanceCadence() {
        if (this.danceCadenceMultiplier === 1) this.danceCadenceMultiplier = 2;
        else if (this.danceCadenceMultiplier === 2) this.danceCadenceMultiplier = 4;
        else this.danceCadenceMultiplier = 1;
        if (window.vjController) {
            window.vjController.updateHUD();
            window.vjController.broadcastRemoteState();
        }
        return this.danceCadenceMultiplier;
    }

    setProportion(prop, val) {
        if (this.activeDancerIdx === "all") {
            for (var i = 0; i < this.dancers.length; i++) {
                this.dancers[i].setProportion(prop, val);
            }
        } else {
            var d = this.getActiveDancer();
            if (d) d.setProportion(prop, val);
        }
    }

    applyProportions(newProps) {
        if (this.activeDancerIdx === "all") {
            for (var i = 0; i < this.dancers.length; i++) {
                this.dancers[i].applyProportions(newProps);
            }
        } else {
            var d = this.getActiveDancer();
            if (d) d.applyProportions(newProps);
        }
    }

    setCustomColor(garmentKey, hex) {
        if (this.activeDancerIdx === "all") {
            for (var i = 0; i < this.dancers.length; i++) {
                this.dancers[i].setCustomColor(garmentKey, hex);
            }
        } else {
            var d = this.getActiveDancer();
            if (d) d.setCustomColor(garmentKey, hex);
        }
        if (window.vjController) {
            window.vjController.updateHUD();
            window.vjController.syncProportionsUI();
        }
    }

    setOutfit(idx) {
        this.paletteIdx = idx;
        if (this.activeDancerIdx === "all") {
            for (var i = 0; i < this.dancers.length; i++) {
                this.dancers[i].setOutfit(idx);
            }
        } else {
            var d = this.getActiveDancer();
            if (d) d.setOutfit(idx);
        }
        this.hitIntensity = 0.6;
        if (window.vjController) {
            window.vjController.updateHUD();
            window.vjController.syncProportionsUI();
            window.vjController.broadcastRemoteState();
        }
    }

    cycleOutfit() {
        var d = this.getActiveDancer();
        var cur = (d && d.paletteIdx !== undefined) ? d.paletteIdx : this.paletteIdx;
        var nextIdx = (cur + 1) % this.palettes.length;
        this.setOutfit(nextIdx);
    }

    mutate() {
        this.cycleOutfit();
        if (!this.danceLocked && this.playlist.length > 0) {
            this.playlistIdx = (this.playlistIdx + 1) % this.playlist.length;
            this.triggerClipTransition(this.playlist[this.playlistIdx]);
        }
        this.hitIntensity = 1.0;
        this.popIntensity = 1.0;
    }

    toggleDance(clipId, isEnabled) {
        if (!this.allClips[clipId]) return;
        if (isEnabled) {
            this.enabledDances.add(clipId);
        } else {
            if (this.enabledDances.size > 1) {
                this.enabledDances.delete(clipId);
            }
        }
        this.playlist = this.allClipKeys.filter((k) => this.enabledDances.has(k));
        if (this.playlist.length === 0) {
            this.playlist = [clipId];
            this.enabledDances.add(clipId);
        }
        if (!this.enabledDances.has(this.currentClipName)) {
            this.playlistIdx = 0;
            this.triggerClipTransition(this.playlist[0]);
        }
        if (window.vjController && window.vjController.syncDanceChecklistUI) {
            window.vjController.syncDanceChecklistUI();
        }
    }

    selectAllDances(selectAll) {
        if (selectAll) {
            this.enabledDances = new Set(this.allClipKeys);
        } else {
            // Keep at least the active dance
            this.enabledDances = new Set([this.currentClipName]);
        }
        this.playlist = this.allClipKeys.filter((k) => this.enabledDances.has(k));
        if (window.vjController && window.vjController.syncDanceChecklistUI) {
            window.vjController.syncDanceChecklistUI();
        }
    }

    playDanceNow(clipId) {
        if (!this.allClips[clipId]) return;
        this.enabledDances.add(clipId);
        this.playlist = this.allClipKeys.filter((k) => this.enabledDances.has(k));
        var pIdx = this.playlist.indexOf(clipId);
        if (pIdx !== -1) this.playlistIdx = pIdx;
        this.triggerClipTransition(clipId);
        if (window.vjController) {
            if (window.vjController.syncDanceChecklistUI) window.vjController.syncDanceChecklistUI();
            if (window.vjController.updateHUD) window.vjController.updateHUD();
        }
    }

    toggleDanceLock(forceState) {
        if (forceState !== undefined) this.danceLocked = forceState;
        else this.danceLocked = !this.danceLocked;
        if (window.vjController) {
            if (window.vjController.syncDanceChecklistUI) window.vjController.syncDanceChecklistUI();
            if (window.vjController.updateHUD) window.vjController.updateHUD();
            if (window.vjController.broadcastRemoteState) window.vjController.broadcastRemoteState();
        }
        return this.danceLocked;
    }

    setFormation(form) {
        this.formation = form;
        this.applyFormationLayout();
        if (window.vjController) {
            window.vjController.updateHUD();
        }
    }

    applyFormationLayout() {
        if (!this.dancers || this.dancers.length < 3) return;

        var d0 = this.dancers[0];
        var d1 = this.dancers[1];
        var d2 = this.dancers[2];

        if (this.formation === "1") {
            // Solo: 1 Lead Center
            d0.group.visible = true;
            d0.group.position.set(0, 0, 0);
            d0.group.rotation.set(0, 0, 0);

            d1.group.visible = false;
            d2.group.visible = false;
            this.cameraBaseDist = 430;
        } else if (this.formation === "2_fwd") {
            // Duo Forward: 2 dancers side-by-side facing forward
            d0.group.visible = true;
            d0.group.position.set(-68, 0, 0);
            d0.group.rotation.set(0, 0, 0);

            d1.group.visible = true;
            d1.group.position.set(68, 0, 0);
            d1.group.rotation.set(0, 0, 0);

            d2.group.visible = false;
            this.cameraBaseDist = 490;
        } else if (this.formation === "2_face") {
            // Duo Facing: 2 dancers angled toward each other in dance-off stance
            d0.group.visible = true;
            d0.group.position.set(-68, 0, 0);
            d0.group.rotation.set(0, Math.PI * 0.35, 0); // ~63 deg facing inward

            d1.group.visible = true;
            d1.group.position.set(68, 0, 0);
            d1.group.rotation.set(0, -Math.PI * 0.35, 0);

            d2.group.visible = false;
            this.cameraBaseDist = 490;
        } else if (this.formation === "3") {
            // Trio Wings: 1 Center Lead + 2 Flanking Wings
            d0.group.visible = true;
            d0.group.position.set(0, 0, 25);
            d0.group.rotation.set(0, 0, 0);

            d1.group.visible = true;
            d1.group.position.set(-90, 0, -48);
            d1.group.rotation.set(0, 0.22, 0); // slight inward angle

            d2.group.visible = true;
            d2.group.position.set(90, 0, -48);
            d2.group.rotation.set(0, -0.22, 0);

            this.cameraBaseDist = 540;
        }
    }

    setPhaseOffset(val) {
        this.phaseOffset = Math.max(0.0, Math.min(0.20, parseFloat(val) || 0.0));
    }

    setActiveDancer(idx) {
        this.activeDancerIdx = String(idx);
    }

    setPoseMode(mode) {
        this.poseMode = mode;
    }

    setCameraAngle(anglePreset) {
        if (anglePreset === "orbit") {
            if (this.cameraAnglePreset === "orbit") {
                this.cameraAnglePreset = "orbit_paused";
            } else {
                this.cameraAnglePreset = "orbit";
            }
        } else {
            this.cameraAnglePreset = anglePreset;
        }

        var camDist = this.cameraBaseDist || 430;
        if (this.cameraAnglePreset === "front") {
            this.camera.position.set(0, 18, camDist);
            this.camera.lookAt(0, -12, 0);
        } else if (this.cameraAnglePreset === "three_quarter") {
            this.camera.position.set(camDist * 0.65, 35, camDist * 0.75);
            this.camera.lookAt(0, -12, 0);
        } else if (this.cameraAnglePreset === "side") {
            this.camera.position.set(camDist, 20, 0);
            this.camera.lookAt(0, -12, 0);
        } else if (this.cameraAnglePreset === "top") {
            this.camera.position.set(0, camDist * 0.95, camDist * 0.35);
            this.camera.lookAt(0, -15, 0);
        }
    }

    init(container) {
        this.container = container;
        var width = container.clientWidth || window.innerWidth;
        var height = container.clientHeight || window.innerHeight;

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x02040a);
        this.scene.fog = new THREE.FogExp2(0x02040a, 0.00075);

        // Perspective Camera
        this.camera = new THREE.PerspectiveCamera(45, width / height, 1, 4000);
        this.camera.position.set(0, 22, this.cameraBaseDist);
        this.camera.lookAt(0, -12, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.20;

        this.renderer.domElement.style.position = "absolute";
        this.renderer.domElement.style.top = "0";
        this.renderer.domElement.style.left = "0";
        this.renderer.domElement.style.width = "100%";
        this.renderer.domElement.style.height = "100%";
        this.renderer.domElement.style.pointerEvents = "none";
        this.container.appendChild(this.renderer.domElement);

        // Stage Lighting
        this.ambientLight = new THREE.AmbientLight(0x28183c, 0.85);
        this.scene.add(this.ambientLight);

        this.keyLight = new THREE.DirectionalLight(0xffe2b8, 1.45);
        this.keyLight.position.set(350, 550, 320);
        this.scene.add(this.keyLight);

        this.rimLight = new THREE.DirectionalLight(0x6366f1, 1.20);
        this.rimLight.position.set(-350, 420, -280);
        this.scene.add(this.rimLight);

        this.accentLight = new THREE.PointLight(0xf43f5e, 1.8, 1400);
        this.accentLight.position.set(0, 60, 200);
        this.scene.add(this.accentLight);

        // Stage Floor
        this.buildStageFloor();

        // Instantiate 3 Dancers for the Troupe (Center Lead, Left Wing, Right Wing)
        this.dancers = [
            new DancerRig(0, this.palettes, 0, DEFAULT_FEMALE_PROPORTIONS), // Cyber Carnival
            new DancerRig(1, this.palettes, 1, DEFAULT_FEMALE_PROPORTIONS), // Tokyo Synthwave
            new DancerRig(2, this.palettes, 2, DEFAULT_FEMALE_PROPORTIONS)  // Acid Emerald
        ];

        for (var d = 0; d < this.dancers.length; d++) {
            this.dancers[d].init(this.scene);
        }

        this.applyFormationLayout();

        this.isInitialized = true;
    }

    buildStageFloor() {
        var floorGeom = new THREE.PlaneGeometry(1800, 1800, 1, 1);
        floorGeom.rotateX(-Math.PI / 2);

        var floorMat = new THREE.MeshStandardMaterial({
            color: 0x050814,
            roughness: 0.22,
            metalness: 0.65,
            side: THREE.DoubleSide
        });

        this.floorMesh = new THREE.Mesh(floorGeom, floorMat);
        this.floorMesh.position.y = -85;
        this.scene.add(this.floorMesh);

        var ringGeom = new THREE.RingGeometry(220, 224, 32);
        ringGeom.rotateX(-Math.PI / 2);
        var ringMat = new THREE.MeshBasicMaterial({
            color: 0x6366f1,
            transparent: true,
            opacity: 0.35,
            side: THREE.DoubleSide
        });
        this.stageRing = new THREE.Mesh(ringGeom, ringMat);
        this.stageRing.position.y = -84.6;
        this.scene.add(this.stageRing);
    }

    triggerClipTransition(nextClip) {
        var clipDef = this.allClips[nextClip];
        var clipTitle = (clipDef && clipDef.name) ? clipDef.name : nextClip;
        if (window.vjController && window.vjController.showDanceTitle) {
            window.vjController.showDanceTitle(clipTitle);
        }
        if (nextClip === this.currentClipName) return;
        this.nextClipName = nextClip;
        this.blendProgress = 0.0;
        if (window.vjController && window.vjController.updateHUD) window.vjController.updateHUD();
    }

    resize(width, height) {
        if (!this.renderer || !this.camera) return;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    update(dt, audio, isVisible) {
        if (!this.isInitialized) return;
        if (isVisible !== undefined) this.isVisible = isVisible;

        if (audio && audio.bpm && audio.bpm >= 60 && audio.bpm <= 180) {
            this.bpm = audio.bpm;
        }

        if (this.poseMode !== "pause") {
            var danceSpeed = (this.bpm / 60) * Math.PI * 2 * this.speedScale;
            var beatIncrement = (danceSpeed * dt) / (Math.PI * 2);
            this.phraseBeatAccumulator = (this.phraseBeatAccumulator || 0) + beatIncrement;
            // Bounded phase wrap at 128 beats prevents float precision degradation
            this.dancePhase = ((this.dancePhase + danceSpeed * dt) % (128 * Math.PI * 2));
        }
        this.time = (this.time + dt) % 10000;

        if (!this.isVisible) return;

        // Beat detection
        if (audio && audio.isBeat) {
            this.hitIntensity = 1.0;
            this.popIntensity = 1.0;
        }

        this.hitIntensity = Math.max(0, this.hitIntensity - dt * 3.5);
        this.popIntensity = Math.max(0, this.popIntensity - dt * 5.5);

        // Advance move sequence
        var clips = (typeof AIST_DANCER_CLIPS !== "undefined") ? AIST_DANCER_CLIPS : DANCER_CLIPS;
        var curClipDef = clips[this.currentClipName] || clips[this.playlist[0]];
        var phraseBeats = curClipDef.phraseBeats || 8;
        var minClipPhrases = 2;
        var targetPhraseBeats = phraseBeats * minClipPhrases * (this.danceCadenceMultiplier || 1);

        if (!this.danceLocked && this.phraseBeatAccumulator >= targetPhraseBeats) {
            this.phraseBeatAccumulator %= targetPhraseBeats;
            if (this.playlist && this.playlist.length > 0) {
                this.playlistIdx = (this.playlistIdx + 1) % this.playlist.length;
                this.triggerClipTransition(this.playlist[this.playlistIdx]);
            }
        }

        // Inertial Crossfade Transition state
        var isBlending = false;
        var fromClipName = this.currentClipName;
        var toClipName = this.nextClipName;
        var blendWeight = 1.0;

        if (this.nextClipName && this.blendProgress < 1.0) {
            this.blendProgress += dt / this.blendDuration;
            if (this.blendProgress >= 1.0) {
                this.currentClipName = this.nextClipName;
                this.nextClipName = null;
                this.blendProgress = 1.0;
                fromClipName = this.currentClipName;
                isBlending = false;
                if (window.vjController) window.vjController.updateHUD();
            } else {
                isBlending = true;
                blendWeight = this.blendProgress;
            }
        }

        var activeCurrentClip = clips[fromClipName] || clips[this.playlist[0]];
        var activeClipBeats = activeCurrentClip.beats || 2.0;
        var activeNextClip = isBlending ? (clips[toClipName] || null) : null;
        var activeNextClipBeats = activeNextClip ? (activeNextClip.beats || 2.0) : 2.0;

        // Evaluate poses and update each dancer in the troupe
        var baseBeatCycle = this.dancePhase / (Math.PI * 2);
        var phaseDelayBeats = (this.phaseOffset * (this.bpm / 60)) * this.speedScale;
        var hasPhaseOffset = Math.abs(phaseDelayBeats) > 0.0001;

        for (var di = 0; di < this.dancers.length; di++) {
            var dancer = this.dancers[di];
            if (!dancer.group.visible) continue;

            if (di > 0 && !hasPhaseOffset) {
                // Re-use lead dancer's blended pose in synchronized unison
                var srcPose = this.blendedPoses[0];
                var dstPose = this.blendedPoses[di];
                if (this.formation === "2_face" && di === 1) {
                    mirrorPose(srcPose, dstPose);
                } else {
                    for (var jK in srcPose) {
                        if (!dstPose[jK]) dstPose[jK] = { x: 0, y: 0, z: 0 };
                        dstPose[jK].x = srcPose[jK].x;
                        dstPose[jK].y = srcPose[jK].y;
                        dstPose[jK].z = srcPose[jK].z;
                    }
                }
            } else {
                var dBeatCycle = baseBeatCycle - di * phaseDelayBeats;
                var clipPhase = (dBeatCycle % activeClipBeats) / activeClipBeats;
                sampleClipPose(activeCurrentClip, clipPhase, this.poseCurrent);

                if (isBlending && activeNextClip) {
                    var nextClipPhase = (dBeatCycle % activeNextClipBeats) / activeNextClipBeats;
                    sampleClipPose(activeNextClip, nextClipPhase, this.poseNext);
                    blendRigPoses(this.poseCurrent, this.poseNext, blendWeight, this.blendedPoses[di]);
                } else {
                    for (var jK in this.poseCurrent) {
                        if (!this.blendedPoses[di][jK]) this.blendedPoses[di][jK] = { x: 0, y: 0, z: 0 };
                        this.blendedPoses[di][jK].x = this.poseCurrent[jK].x;
                        this.blendedPoses[di][jK].y = this.poseCurrent[jK].y;
                        this.blendedPoses[di][jK].z = this.poseCurrent[jK].z;
                    }
                }

                if (this.formation === "2_face" && di === 1) {
                    mirrorPose(this.blendedPoses[di], this.blendedPoses[di]);
                }
            }

            dancer.update(this.blendedPoses[di], dt, this.hitIntensity, this.popIntensity, this.poseMode);
        }

        // Dynamic Camera Positioning / Orbiting
        var camDist = this.cameraBaseDist || 430;
        if (this.cameraAnglePreset === "orbit") {
            this.orbitAngle = (this.orbitAngle + dt * 0.15) % (Math.PI * 2);
            this.camera.position.x = Math.sin(this.orbitAngle) * camDist;
            this.camera.position.z = Math.cos(this.orbitAngle) * camDist;
            this.camera.position.y = 22 + Math.sin(this.orbitAngle * 2.0) * 14;
            this.camera.lookAt(0, -12, 0);
        } else if (this.cameraAnglePreset === "orbit_paused") {
            this.camera.position.x = Math.sin(this.orbitAngle) * camDist;
            this.camera.position.z = Math.cos(this.orbitAngle) * camDist;
            this.camera.position.y = 22 + Math.sin(this.orbitAngle * 2.0) * 14;
            this.camera.lookAt(0, -12, 0);
        } else if (this.cameraAnglePreset === "front") {
            this.camera.position.set(0, 18, camDist);
            this.camera.lookAt(0, -12, 0);
        } else if (this.cameraAnglePreset === "three_quarter") {
            this.camera.position.set(camDist * 0.65, 35, camDist * 0.75);
            this.camera.lookAt(0, -12, 0);
        } else if (this.cameraAnglePreset === "side") {
            this.camera.position.set(camDist, 20, 0);
            this.camera.lookAt(0, -12, 0);
        } else if (this.cameraAnglePreset === "top") {
            this.camera.position.set(0, camDist * 0.95, camDist * 0.35);
            this.camera.lookAt(0, -15, 0);
        } else {
            this.camera.lookAt(0, -12, 0);
        }

        // Concert Lighting Pulsing
        this.keyLight.intensity = 1.30 + (audio ? audio.mids : 0.2) * 0.45;
        this.rimLight.intensity = 1.10 + (audio ? audio.sub : 0.2) * 0.50;

        this.accentLight.position.x = Math.sin(this.time * 1.2) * 220;
        this.accentLight.position.z = Math.cos(this.time * 1.2) * 220;
        this.accentLight.position.y = 50 + Math.sin(this.time * 0.6) * 40;
        this.accentLight.intensity = 1.4 + (audio ? audio.bass : 0.2) * 2.2;
    }

    render(alpha) {
        alpha = alpha === undefined ? 1.0 : alpha;
        if (!this.isInitialized || !this.renderer) return;
        this.isVisible = (alpha > 0.001);
        this.renderer.domElement.style.opacity = alpha;
        if (this.isVisible) {
            if (this.renderer.domElement.style.display !== "block") {
                this.renderer.domElement.style.display = "block";
            }
            this.renderer.render(this.scene, this.camera);
        } else {
            if (this.renderer.domElement.style.display !== "none") {
                this.renderer.domElement.style.display = "none";
            }
        }
    }

    destroy() {
        if (this.onKeyDown) {
            window.removeEventListener("keydown", this.onKeyDown);
        }
        for (var d = 0; d < this.dancers.length; d++) {
            this.dancers[d].destroy();
        }
        if (this.floorMesh) {
            if (this.floorMesh.geometry) this.floorMesh.geometry.dispose();
            if (this.floorMesh.material) this.floorMesh.material.dispose();
        }
        if (this.stageRing) {
            if (this.stageRing.geometry) this.stageRing.geometry.dispose();
            if (this.stageRing.material) this.stageRing.material.dispose();
        }

        if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
    }
}

window.DancerScene = DancerScene;
