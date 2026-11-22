/**
 * VJ Visualizer - Scene 7: Real-Time Stem Waveforms
 * Serato / Rekordbox Style Scrolling Master Waveform + Real-Time DSP Stem Separation:
 *  - Starts with a unified scrolling waveform (Serato RGB, Rekordbox 3-Band, or Neon Scope)
 *  - Dynamically unzips/separates into 3, 4, or 5 color-coded stem staves (Drums, Bass, Vocals, Synths, Air)
 *  - Re-merges cleanly over a selectable number of bars (4 / 8 / 16 / 32 / 64 bars) or Musical State Sync
 *  - Includes partially transparent bar-loop Forecast future waveform ahead of the playhead
 *  - Supports 2D DJ-Deck view and interactive 3D Perspective Tilt view (drag to orbit tilt, dblclick to reset)
 *  - High-performance rendering (zero shadowBlur overhead)
 */

class StemWaveformScene {
    constructor() {
        this.name = "Stem Waveforms";
        this.canvas = null;
        this.ctx = null;
        this.time = 0;
        this.bpm = 124;
        this._isActive = false;
        this._lastAudio = null;
        this.lineThickness = 1.0;
        this.dropFlash = 0.0;

        this.defaults = {
            stemCount: 4,             // 3, 4, 5
            cycleBars: 16,            // 4, 8, 16, 32, 64
            cycleMode: "auto",        // "auto" | "musical" | "hold_merged" | "hold_split"
            waveStyle: "serato",      // "serato" | "rekordbox" | "neon"
            transitionStyle: "prism", // "prism" | "peel" | "snap"
            playheadMode: "forecast", // "forecast" | "right" | "center_mirror"
            view3D: false,
            tiltAngle: 32,            // degrees (0..55)
            forecastOpacity: 0.35,    // 0.0..0.70
            scrollSpeed: 1.0,         // 0.5..2.5
            gain: 1.2,                // 0.5..2.5
            glow: 1.0,                // 0.0..2.0
            showGrid: true,
            showLabels: true,
            paletteIdx: 0
        };
        this.params = Object.assign({}, this.defaults);

        this.palettes = [
            { name: "Serato Pro",       colors: ["#ff3355", "#ff9500", "#00e676", "#00d4ff", "#c084fc"] },
            { name: "Rekordbox Studio", colors: ["#ff5e3a", "#2979ff", "#ffd600", "#00e5ff", "#f8fafc"] },
            { name: "Cyberpunk Neon",   colors: ["#ff007f", "#ff5500", "#39ff14", "#00f0ff", "#9d4edd"] },
            { name: "Prism Spectrum",   colors: ["#fb7185", "#fbbf24", "#34d399", "#60a5fa", "#e879f9"] }
        ];
        this.palettes.forEach((p) => {
            p.rgb = p.colors.map((hex) => this._hexToRgb(hex));
        });

        // High-resolution time-series ring buffer (120 slices/sec, ~25.6s history)
        this.SAMPLE_RATE = 120;
        this.MAX_HISTORY = 3072;
        this.bufDrums   = new Float32Array(this.MAX_HISTORY);
        this.bufBass    = new Float32Array(this.MAX_HISTORY);
        this.bufVocals  = new Float32Array(this.MAX_HISTORY);
        this.bufSynths  = new Float32Array(this.MAX_HISTORY);
        this.bufHats    = new Float32Array(this.MAX_HISTORY);
        this.bufLow     = new Float32Array(this.MAX_HISTORY);
        this.bufMid     = new Float32Array(this.MAX_HISTORY);
        this.bufHigh    = new Float32Array(this.MAX_HISTORY);
        this.bufComp    = new Float32Array(this.MAX_HISTORY);
        this.bufDetail  = new Float32Array(this.MAX_HISTORY);
        this.bufBeat    = new Float32Array(this.MAX_HISTORY);
        this.bufBeatHit = new Float32Array(this.MAX_HISTORY);

        this._bufByKey = {
            drums: this.bufDrums,
            bass: this.bufBass,
            vocals: this.bufVocals,
            synths: this.bufSynths,
            hats: this.bufHats,
            air: this.bufHats,
            low: this.bufLow,
            mid: this.bufMid,
            high: this.bufHigh,
            composite: this.bufComp,
            detail: this.bufDetail
        };

        this.writeIdx = 0;
        this.filledSlices = 0;
        this.totalSlicesWritten = 0;
        this._sampleAccum = 0;
        this._prevBeatCount = 0;
        this._pendingBeatHit = 0;
        this._prevStems = {
            drums: 0, bass: 0, vocals: 0, synths: 0, hats: 0,
            low: 0, mid: 0, high: 0, composite: 0, detail: 0
        };

        // Bar-synced transition state
        this.cycleStartBeat = 0;
        this.splitAmount = 0.0;
        this.targetSplit = 0.0;
        this.transDir = 1;
        this.phaseName = "UNIFIED";
        this.barInCycle = 1;
        this.cycleProgress = 0.0;

        // 3D Perspective Tilt & interaction state
        this.tiltAmount = 0.0;
        this.dragPitch = 0.0;
        this.dragYaw = 0.0;
        this._interactionBound = false;

        // Reusable column buffers to minimize per-frame GC
        this._maxCols = 900;
        this._colX = new Float32Array(this._maxCols);
        this._colAge = new Float32Array(this._maxCols);
        this._colAbsId = new Float64Array(this._maxCols);
        this._colSplit = new Float32Array(this._maxCols);
        this._colIsFuture = new Uint8Array(this._maxCols);
        this._colFade = new Float32Array(this._maxCols);
        this._colLow = new Float32Array(this._maxCols);
        this._colMid = new Float32Array(this._maxCols);
        this._colHigh = new Float32Array(this._maxCols);
        this._colComp = new Float32Array(this._maxCols);
        this._colDetail = new Float32Array(this._maxCols);
        this._colStems = [
            new Float32Array(this._maxCols),
            new Float32Array(this._maxCols),
            new Float32Array(this._maxCols),
            new Float32Array(this._maxCols),
            new Float32Array(this._maxCols)
        ];
    }

    _hexToRgb(hex) {
        var clean = String(hex || "#ffffff").replace("#", "");
        if (clean.length === 3) {
            clean = clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
        }
        var n = parseInt(clean, 16);
        if (isNaN(n)) return [255, 255, 255];
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    _clamp(v, lo, hi) {
        return v < lo ? lo : (v > hi ? hi : v);
    }

    _smoothstep(t) {
        var c = this._clamp(t, 0, 1);
        return c * c * (3 - 2 * c);
    }

    _getStemDefinitions(count) {
        if (count === 3) {
            return [
                { key: "low",  label: "BASS",            colorIdx: 1 },
                { key: "mid",  label: "VOCALS / SYNTHS", colorIdx: 2 },
                { key: "high", label: "DRUMS / HATS",    colorIdx: 0 }
            ];
        }
        var is5 = (count >= 5);
        var list = [
            { key: "drums",  label: "DRUMS",  colorIdx: 0, mixHats: !is5 },
            { key: "bass",   label: "BASS",   colorIdx: 1 },
            { key: "vocals", label: "VOCALS", colorIdx: 2 },
            { key: "synths", label: "SYNTHS", colorIdx: 3 }
        ];
        if (is5) {
            list.push({ key: "hats", label: "HI-HATS", colorIdx: 4 });
        }
        return list;
    }

    init(canvas, ctx) {
        this.canvas = canvas;
        this.ctx = ctx;
        this._setupInteraction();
    }

    _setupInteraction() {
        if (this._interactionBound || typeof window === "undefined") return;
        this._interactionBound = true;
        var self = this;
        var isDragging = false;
        var lastX = 0, lastY = 0;

        window.addEventListener("mousedown", function (e) {
            if (!self._isActive) return;
            if (e.target && e.target.closest && e.target.closest("#vj-hud, #proportions-drawer")) return;
            isDragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
        });

        window.addEventListener("mousemove", function (e) {
            if (!isDragging || !self._isActive || !self.params.view3D) return;
            var dx = e.clientX - lastX;
            var dy = e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
            self.dragYaw = self._clamp(self.dragYaw + dx * 0.0045, -0.55, 0.55);
            self.dragPitch = self._clamp(self.dragPitch + dy * 0.0045, -0.45, 0.45);
        }, { passive: true });

        window.addEventListener("mouseup", function () {
            isDragging = false;
        });

        window.addEventListener("dblclick", function (e) {
            if (!self._isActive) return;
            if (e.target && e.target.closest && e.target.closest("#vj-hud, #proportions-drawer")) return;
            self.resetCamera();
        });
    }

    resetCamera() {
        this.dragPitch = 0.0;
        this.dragYaw = 0.0;
    }

    resetDefaults() {
        Object.assign(this.params, this.defaults);
        this.dragPitch = 0.0;
        this.dragYaw = 0.0;
        this.resyncDownbeat();
    }

    setThickness(val) {
        var num = parseFloat(val);
        if (!isNaN(num)) {
            this.lineThickness = this._clamp(num / 4.0, 0.4, 2.5);
        }
    }

    setPalette(idx) {
        var n = parseInt(idx, 10);
        if (!isNaN(n)) {
            this.params.paletteIdx = ((n % this.palettes.length) + this.palettes.length) % this.palettes.length;
        }
    }

    cyclePalette() {
        this.setPalette(this.params.paletteIdx + 1);
    }

    setParam(key, val) {
        if (!(key in this.params)) return;
        if (key === "stemCount") {
            var sc = parseInt(val, 10);
            this.params.stemCount = (sc === 3 || sc === 5) ? sc : 4;
        } else if (key === "cycleBars") {
            var cb = parseInt(val, 10);
            this.params.cycleBars = [4, 8, 16, 32, 64].indexOf(cb) >= 0 ? cb : 16;
        } else if (key === "paletteIdx") {
            this.setPalette(val);
        } else if (key === "view3D" || key === "showGrid" || key === "showLabels") {
            this.params[key] = !!val;
        } else if (key === "cycleMode" || key === "waveStyle" || key === "transitionStyle" || key === "playheadMode") {
            this.params[key] = String(val);
        } else {
            var num = parseFloat(val);
            if (!isNaN(num)) {
                if (key === "tiltAngle") this.params.tiltAngle = this._clamp(num, 0, 55);
                else if (key === "forecastOpacity") this.params.forecastOpacity = this._clamp(num, 0, 0.7);
                else if (key === "scrollSpeed") this.params.scrollSpeed = this._clamp(num, 0.5, 2.5);
                else if (key === "gain") this.params.gain = this._clamp(num, 0.5, 2.5);
                else if (key === "glow") this.params.glow = this._clamp(num, 0.0, 2.0);
                else this.params[key] = num;
            }
        }
    }

    toggleSplitNow() {
        var audio = this._lastAudio || (typeof window !== "undefined" ? window.audioEngine : null);
        var tb = (audio && typeof audio.totalBeats === "number") ? audio.totalBeats : (this.time * (this.bpm / 60));
        var mode = this.params.cycleMode;
        if (mode === "hold_merged") {
            this.params.cycleMode = "hold_split";
        } else if (mode === "hold_split") {
            this.params.cycleMode = "hold_merged";
        } else if (mode === "musical") {
            this.params.cycleMode = (this.splitAmount < 0.5) ? "hold_split" : "hold_merged";
        } else {
            var cycleBeats = Math.max(4, this.params.cycleBars || 16) * 4;
            if (this.splitAmount < 0.5) {
                this.cycleStartBeat = tb - cycleBeats * 0.25;
            } else {
                this.cycleStartBeat = tb - cycleBeats * 0.875;
            }
        }
    }

    resyncDownbeat() {
        var ae = (typeof window !== "undefined" && window.audioEngine) ? window.audioEngine : null;
        if (ae && ae.resetBarPhase) ae.resetBarPhase();
        if (this._lastAudio && this._lastAudio !== ae && this._lastAudio.resetBarPhase) {
            this._lastAudio.resetBarPhase();
        }
        var refAudio = this._lastAudio || ae;
        var tb = (refAudio && typeof refAudio.totalBeats === "number") ? refAudio.totalBeats : (this.time * (this.bpm / 60));
        this.cycleStartBeat = tb;
    }

    triggerDropPulse() {
        this.dropFlash = 1.0;
    }

    _pushSlice(s, beatVal, hitVal) {
        var idx = this.writeIdx;
        this.bufDrums[idx]   = s.drums;
        this.bufBass[idx]    = s.bass;
        this.bufVocals[idx]  = s.vocals;
        this.bufSynths[idx]  = s.synths;
        this.bufHats[idx]    = s.hats;
        this.bufLow[idx]     = s.low;
        this.bufMid[idx]     = s.mid;
        this.bufHigh[idx]    = s.high;
        this.bufComp[idx]    = s.composite;
        this.bufDetail[idx]  = s.detail;
        this.bufBeat[idx]    = beatVal;
        this.bufBeatHit[idx] = hitVal;
        this.writeIdx = (idx + 1) % this.MAX_HISTORY;
        if (this.filledSlices < this.MAX_HISTORY) this.filledSlices++;
        this.totalSlicesWritten++;
    }

    update(dt, audio, isVisible) {
        this.time += dt;
        this._isActive = !!isVisible;
        if (audio) {
            this.bpm = audio.bpm || 124;
            this._lastAudio = audio;
            if (audio.isBeat) {
                this._pendingBeatHit = Math.max(this._pendingBeatHit, audio.beatConfidence || 0.9);
            }
        }

        // Smoothly interpolate 3D tilt transition
        var targetTilt = this.params.view3D ? 1.0 : 0.0;
        this.tiltAmount += (targetTilt - this.tiltAmount) * Math.min(1.0, dt * 6.5);
        if (Math.abs(targetTilt - this.tiltAmount) < 0.0005) this.tiltAmount = targetTilt;

        this.dropFlash *= Math.exp(-5.0 * dt);

        // Continuous ring-buffer recording even while hidden so switching to Scene 7 has full waveform & forecast ready
        var st = (audio && audio.stems) ? audio.stems : null;
        var currStems = st ? {
            drums: st.drums || 0,
            bass: st.bass || 0,
            vocals: st.vocals || 0,
            synths: st.synths || 0,
            hats: (st.hats !== undefined ? st.hats : (st.air || 0)),
            low: st.low || 0,
            mid: st.mid || 0,
            high: st.high || 0,
            composite: st.composite || 0,
            detail: st.detail || 0
        } : this._prevStems;

        var totalBeats = (audio && typeof audio.totalBeats === "number")
            ? audio.totalBeats
            : (this.time * (this.bpm / 60));

        var stepDt = 1.0 / this.SAMPLE_RATE;
        this._sampleAccum = Math.min(this._sampleAccum + dt, 0.25);
        var steps = Math.floor(this._sampleAccum / stepDt);
        if (steps > 0) {
            this._sampleAccum -= steps * stepDt;
            var prev = this._prevStems;
            var b0 = this._prevBeatCount;
            var b1 = totalBeats;
            // Handle rewind / resetBarPhase gracefully without bogus negative jumps
            if (b1 < b0 - 0.5) b0 = b1;

            for (var k = 1; k <= steps; k++) {
                var u = k / steps;
                var interp = {
                    drums:     prev.drums     + (currStems.drums     - prev.drums)     * u,
                    bass:      prev.bass      + (currStems.bass      - prev.bass)      * u,
                    vocals:    prev.vocals    + (currStems.vocals    - prev.vocals)    * u,
                    synths:    prev.synths    + (currStems.synths    - prev.synths)    * u,
                    hats:      prev.hats      + (currStems.hats      - prev.hats)      * u,
                    low:       prev.low       + (currStems.low       - prev.low)       * u,
                    mid:       prev.mid       + (currStems.mid       - prev.mid)       * u,
                    high:      prev.high      + (currStems.high      - prev.high)      * u,
                    composite: prev.composite + (currStems.composite - prev.composite) * u,
                    detail:    prev.detail    + (currStems.detail    - prev.detail)    * u
                };
                var beatVal = b0 + (b1 - b0) * u;
                var hitVal = (k === 1) ? this._pendingBeatHit : 0.0;
                this._pushSlice(interp, beatVal, hitVal);
            }
            this._pendingBeatHit = 0;
            this._prevStems = currStems;
            this._prevBeatCount = b1;
        }

        // Bar-Synced Split -> Staves -> Merge Choreography
        var mode = this.params.cycleMode;
        var cycleBars = Math.max(4, this.params.cycleBars || 16);
        var cycleBeats = cycleBars * 4;

        if (mode === "auto") {
            var beatsInto = ((totalBeats - this.cycleStartBeat) % cycleBeats + cycleBeats) % cycleBeats;
            var p = beatsInto / cycleBeats;
            this.cycleProgress = p;
            this.barInCycle = Math.floor(beatsInto / 4) + 1;

            if (p < 0.25) {
                this.phaseName = "UNIFIED";
                this.targetSplit = 0.0;
                if (this.splitAmount < 0.01) this.transDir = 1;
            } else if (p < 0.375) {
                this.phaseName = "SEPARATING";
                this.targetSplit = (p - 0.25) / 0.125;
                this.transDir = 1;
            } else if (p < 0.875) {
                this.phaseName = "STEMS";
                this.targetSplit = 1.0;
                if (this.splitAmount > 0.99) this.transDir = -1;
            } else {
                this.phaseName = "MERGING";
                this.targetSplit = 1.0 - (p - 0.875) / 0.125;
                this.transDir = -1;
            }
        } else if (mode === "musical") {
            var mState = audio ? audio.musicalState : "groove";
            if (mState === "breakdown" || mState === "buildup") {
                this.targetSplit = 1.0;
            } else if (mState === "pre_drop") {
                this.targetSplit = 0.5;
            } else {
                this.targetSplit = 0.0;
            }
            this.transDir = (this.targetSplit >= this.splitAmount) ? 1 : -1;
            this.phaseName = mState.toUpperCase().replace("_", "-") + " SYNC";
            this.barInCycle = ((Math.floor(totalBeats / 4) % cycleBars) + cycleBars) % cycleBars + 1;
            this.cycleProgress = (totalBeats % cycleBeats + cycleBeats) % cycleBeats / cycleBeats;
        } else if (mode === "hold_split") {
            this.targetSplit = 1.0;
            this.transDir = 1;
            this.phaseName = "HOLD SPLIT";
            this.barInCycle = ((Math.floor(totalBeats / 4) % cycleBars) + cycleBars) % cycleBars + 1;
            this.cycleProgress = 0.625;
        } else {
            this.targetSplit = 0.0;
            this.transDir = -1;
            this.phaseName = "HOLD MERGED";
            this.barInCycle = ((Math.floor(totalBeats / 4) % cycleBars) + cycleBars) % cycleBars + 1;
            this.cycleProgress = 0.125;
        }

        var followRate = (mode === "auto") ? Math.min(1.0, dt * 14.0) : Math.min(1.0, dt * 4.5);
        this.splitAmount += (this.targetSplit - this.splitAmount) * followRate;
        if (Math.abs(this.targetSplit - this.splitAmount) < 0.0005) {
            this.splitAmount = this.targetSplit;
        }
    }

    _localSplit(normDistFromPlayhead) {
        var sa = this.splitAmount;
        if (sa <= 0.001) return 0.0;
        if (sa >= 0.999) return 1.0;

        var style = this.params.transitionStyle;
        if (style === "prism") {
            var raw;
            if (this.transDir >= 0) {
                raw = (sa * 1.45) - normDistFromPlayhead * 0.45;
            } else {
                raw = (sa * 1.45) - (1.0 - normDistFromPlayhead) * 0.45;
            }
            return this._smoothstep(raw);
        } else if (style === "snap") {
            var c1 = 1.70158;
            var c3 = c1 + 1;
            if (this.transDir >= 0) {
                var u = sa - 1;
                return this._clamp(1 + c3 * u * u * u + c1 * u * u, 0, 1.08);
            } else {
                var t = 1 - sa;
                var eased = 1 + c3 * (t - 1) * (t - 1) * (t - 1) + c1 * (t - 1) * (t - 1);
                return this._clamp(1 - eased, -0.05, 1.0);
            }
        }
        // "peel"
        return this._smoothstep(sa);
    }

    _readRingLinear(buf, age) {
        var filled = this.filledSlices;
        if (filled <= 1 || age < 0 || age >= filled - 1) return 0.0;
        var a0 = Math.floor(age);
        var a1 = Math.min(filled - 1, a0 + 1);
        var f = age - a0;
        var write = this.writeIdx;
        var maxH = this.MAX_HISTORY;
        var idx0 = (write - 1 - a0 + maxH * 2) % maxH;
        var idx1 = (write - 1 - a1 + maxH * 2) % maxH;
        return buf[idx0] * (1.0 - f) + buf[idx1] * f;
    }

    _readRingAtContinuousAbs(buf, absPos) {
        var maxId = this.totalSlicesWritten - 1;
        var minId = Math.max(0, this.totalSlicesWritten - this.filledSlices);
        if (this.filledSlices <= 1 || absPos < minId || absPos > maxId) return 0.0;
        var i0 = Math.floor(absPos);
        var i1 = Math.min(maxId, i0 + 1);
        var f = absPos - i0;
        var maxH = this.MAX_HISTORY;
        return buf[i0 % maxH] * (1.0 - f) + buf[i1 % maxH] * f;
    }

    _sampleAbsFixed(buf, absPos, span) {
        var maxId = this.totalSlicesWritten - 1;
        var minId = Math.max(0, this.totalSlicesWritten - this.filledSlices);
        if (this.filledSlices <= 1 || absPos < minId || absPos > maxId) return 0.0;
        var sp = Math.max(1, span || 1);
        var pL = Math.max(minId, absPos - sp);
        var pR = Math.min(maxId, absPos + sp);
        var vL = this._readRingAtContinuousAbs(buf, pL);
        var vC = this._readRingAtContinuousAbs(buf, absPos);
        var vR = this._readRingAtContinuousAbs(buf, pR);
        return 0.25 * vL + 0.50 * vC + 0.25 * vR;
    }

    _sampleRingLinear3(buf, centerAge, halfSpan) {
        var filled = this.filledSlices;
        if (filled <= 1 || centerAge < 0 || centerAge >= filled - 1) return 0.0;
        var span = Math.max(0.4, halfSpan);
        var vL = this._readRingLinear(buf, Math.max(0.0, centerAge - span * 0.65));
        var vC = this._readRingLinear(buf, centerAge);
        var vR = this._readRingLinear(buf, Math.min(filled - 1.001, centerAge + span * 0.65));
        return 0.25 * vL + 0.50 * vC + 0.25 * vR;
    }

    _sampleForecastAbs(buf, futureAbsId, slicesPerBar, span) {
        var sp = Math.max(1, span || 1);
        var filled = this.filledSlices;
        var maxValid = this.totalSlicesWritten - 1 - sp;
        if (filled < 4 || maxValid < 2) return 0.0;
        var minValid = Math.max(0, this.totalSlicesWritten - filled) + sp;
        var s1Bar = Math.max(24, slicesPerBar);

        var k1 = Math.max(1, Math.ceil((futureAbsId - maxValid) / s1Bar));
        var p1 = futureAbsId - k1 * s1Bar;
        if (p1 < minValid || p1 > maxValid) return 0.0;
        var v1 = this._sampleAbsFixed(buf, p1, sp);

        var s4Bar = s1Bar * 4;
        var k4 = Math.max(1, Math.ceil((futureAbsId - maxValid) / s4Bar));
        var p4 = futureAbsId - k4 * s4Bar;
        if (filled > s4Bar + 4 + sp && p4 >= minValid && p4 <= maxValid) {
            var s2Bar = s1Bar * 2;
            var k2 = Math.max(1, Math.ceil((futureAbsId - maxValid) / s2Bar));
            var p2 = futureAbsId - k2 * s2Bar;
            if (p2 >= minValid && p2 <= maxValid) {
                var v2 = this._sampleAbsFixed(buf, p2, sp);
                var v4 = this._sampleAbsFixed(buf, p4, sp);
                return 0.55 * v1 + 0.30 * v2 + 0.15 * v4;
            }
        }
        var s2BarB = s1Bar * 2;
        var k2B = Math.max(1, Math.ceil((futureAbsId - maxValid) / s2BarB));
        var p2B = futureAbsId - k2B * s2BarB;
        if (filled > s2BarB + 4 + sp && p2B >= minValid && p2B <= maxValid) {
            var v2B = this._sampleAbsFixed(buf, p2B, sp);
            return 0.68 * v1 + 0.32 * v2B;
        }
        return v1;
    }

    _sampleBeatExact(age) {
        var filled = this.filledSlices;
        if (filled <= 1 || age < 0 || age >= filled - 1) return 0.0;
        var a0 = Math.floor(age);
        var a1 = Math.min(filled - 1, a0 + 1);
        var f = age - a0;
        var idx0 = (this.writeIdx - 1 - a0 + this.MAX_HISTORY * 2) % this.MAX_HISTORY;
        var idx1 = (this.writeIdx - 1 - a1 + this.MAX_HISTORY * 2) % this.MAX_HISTORY;
        return this.bufBeat[idx0] * (1 - f) + this.bufBeat[idx1] * f;
    }

    _setupProjection(w, h) {
        var ta = this.tiltAmount;
        var pitchRad = ((this.params.tiltAngle * Math.PI) / 180 + this.dragPitch) * ta;
        var yawRad = (Math.sin(this.time * 0.25) * 0.07 + this.dragYaw) * ta;
        this._proj = {
            cx: w * 0.5,
            cy: h * 0.48,
            scaleRef: h * 0.5,
            cosX: Math.cos(pitchRad),
            sinX: Math.sin(pitchRad),
            cosY: Math.cos(yawRad),
            sinY: Math.sin(yawRad),
            fov: 2.65,
            ta: ta,
            shrink: 1.0 - 0.16 * ta
        };
    }

    _project(x, y, zNorm, out) {
        var P = this._proj;
        if (P.ta < 0.002) {
            out.x = x;
            out.y = y;
            out.s = 1.0;
            return out;
        }
        var nx = ((x - P.cx) / P.scaleRef) * P.shrink;
        var ny = ((y - P.cy) / P.scaleRef) * P.shrink;
        var nz = zNorm * 0.55 * P.ta;

        var x1 = nx * P.cosY + nz * P.sinY;
        var z1 = -nx * P.sinY + nz * P.cosY;
        var y2 = ny * P.cosX - z1 * P.sinX;
        var z2 = ny * P.sinX + z1 * P.cosX;

        var persp = P.fov / Math.max(0.65, P.fov - z2);
        out.x = P.cx + x1 * persp * P.scaleRef;
        out.y = P.cy + y2 * persp * P.scaleRef;
        out.s = persp;
        return out;
    }

    draw(ctx, width, height, alpha, audio) {
        alpha = (alpha === undefined) ? 1.0 : alpha;
        if (alpha <= 0.001 || width <= 0 || height <= 0) return;

        ctx.save();
        ctx.globalAlpha = alpha;

        var aud = audio || this._lastAudio || {};
        var subEnergy = aud.sub || 0;
        var pal = this.palettes[this.params.paletteIdx % this.palettes.length];
        var stemDefs = this._getStemDefinitions(this.params.stemCount);
        var stemCount = stemDefs.length;

        this._setupProjection(width, height);

        // 1. Deep Obsidian Stage Backdrop
        var bgGrad = ctx.createRadialGradient(
            width * 0.5, height * 0.48, 0,
            width * 0.5, height * 0.48, Math.max(width, height) * 0.75
        );
        var bgPulse = 0.07 + subEnergy * 0.09 + this.dropFlash * 0.12;
        bgGrad.addColorStop(0.0, "rgba(18, 38, 72, " + (bgPulse * 1.4).toFixed(3) + ")");
        bgGrad.addColorStop(0.5, "rgba(6, 12, 28, 0.96)");
        bgGrad.addColorStop(1.0, "#02050e");
        ctx.fillStyle = "#02050e";
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, width, height);

        // Geometry layout constants (keep staves safely above bottom HUD)
        var topY = height * 0.145;
        var botY = height * 0.815;
        var usableH = botY - topY;
        var centerY = (topY + botY) * 0.5;
        var unifiedMaxH = Math.min(height * 0.24, usableH * 0.44);
        var stemSlotH = usableH / stemCount;
        var stemMaxH = Math.min(height * 0.115, stemSlotH * 0.44);
        var gainScale = 0.4 + 0.6 * this.params.gain;

        // Playhead X position
        var phMode = this.params.playheadMode;
        var playheadX = (phMode === "right") ? width * 0.84 : width * 0.50;

        // Timeline kinematics
        var pxPerSec = Math.max(110, width * 0.135) * this.params.scrollSpeed;
        var pxPerSlice = pxPerSec / this.SAMPLE_RATE;
        var subSliceAge = this._sampleAccum * this.SAMPLE_RATE;
        var slicesPerBar = Math.max(24, (4 * 60 / Math.max(40, this.bpm)) * this.SAMPLE_RATE);
        var slicesPerBeat = slicesPerBar * 0.25;
        var forecastReady = this._clamp((this.filledSlices - slicesPerBar * 0.85) / (slicesPerBar * 0.65), 0, 1);

        var totalBeats = (aud && typeof aud.totalBeats === "number")
            ? aud.totalBeats
            : (this.time * (this.bpm / 60));

        // 2. Subtle 3D Floor Reference Grid when tilted
        if (this.tiltAmount > 0.04) {
            this._draw3DFloorGrid(ctx, width, height, topY, botY);
        }

        // 3. Beatgrid & Bar Markers (behind waveforms)
        if (this.params.showGrid) {
            this._drawBeatgrid(
                ctx, width, height, topY, botY, centerY, playheadX,
                pxPerSlice, subSliceAge, slicesPerBeat, totalBeats, phMode, forecastReady
            );
        }

        // 4. Sample audio-locked slice columns once (immutable absId lattice eliminates scrolling shimmer)
        var minStrideForCap = Math.ceil(width / (Math.max(0.1, pxPerSlice) * (this._maxCols - 12)));
        var stride = Math.max(1, minStrideForCap, Math.round(2.8 / Math.max(0.25, pxPerSlice)));
        var tapSpan = Math.max(1, Math.floor(stride * 0.5));
        var halfWinSlices = Math.max(0.6, stride * 0.55);
        var maxDist = Math.max(playheadX, width - playheadX, 1);
        var rightSpan = Math.max(1, width - playheadX);
        var lastAbsId = this.totalSlicesWritten - 1;
        var maxLiveAbs = lastAbsId - tapSpan;
        var minValidId = Math.max(0, this.totalSlicesWritten - this.filledSlices);
        var livePlayheadAbs = lastAbsId + subSliceAge;

        var nCols = 0;
        var emitZeroCol = (xPos, isFuture) => {
            if (nCols >= this._maxCols) return;
            var c = nCols++;
            this._colX[c] = xPos;
            this._colAbsId[c] = -1;
            this._colIsFuture[c] = isFuture;
            this._colAge[c] = 0;
            this._colSplit[c] = this._localSplit(Math.abs(xPos - playheadX) / maxDist);
            this._colFade[c] = 0;
            this._colLow[c] = this._colMid[c] = this._colHigh[c] = this._colComp[c] = this._colDetail[c] = 0;
            for (var sIdx = 0; sIdx < stemCount; sIdx++) this._colStems[sIdx][c] = 0;
        };

        if (this.filledSlices < 4 || maxLiveAbs < minValidId + 1) {
            emitZeroCol(0, 0);
            emitZeroCol(playheadX, 0);
            if (playheadX + 0.5 < width) {
                emitZeroCol(playheadX + 0.5, 1);
                emitZeroCol(width, 1);
            }
        } else {
            var leftContAbs = livePlayheadAbs - playheadX / pxPerSlice;
            var kStartLive = Math.ceil(Math.max(minValidId + tapSpan, leftContAbs - stride) / stride) * stride;
            var kEndLive = Math.floor(maxLiveAbs / stride) * stride;

            // Leftmost screen anchor when live history doesn't yet cover left edge
            var firstGridX = (kStartLive <= kEndLive) ? (playheadX - (livePlayheadAbs - kStartLive) * pxPerSlice) : playheadX;
            if (firstGridX > 0.5) {
                emitZeroCol(0, 0);
            }

            // Live interior lattice (fixed absId % stride === 0)
            for (var idL = kStartLive; idL <= kEndLive && nCols < this._maxCols - 4; idL += stride) {
                var xL = playheadX - (livePlayheadAbs - idL) * pxPerSlice;
                if (xL < -stride * pxPerSlice - 1.0) continue;
                if (xL >= playheadX - 0.1) break;
                var cL = nCols++;
                this._colX[cL] = xL;
                this._colAbsId[cL] = idL;
                this._colIsFuture[cL] = 0;
                this._colAge[cL] = livePlayheadAbs - idL;
                this._colSplit[cL] = this._localSplit(Math.abs(xL - playheadX) / maxDist);
                this._colFade[cL] = 1.0;
                this._colLow[cL]    = this._sampleAbsFixed(this.bufLow, idL, tapSpan);
                this._colMid[cL]    = this._sampleAbsFixed(this.bufMid, idL, tapSpan);
                this._colHigh[cL]   = this._sampleAbsFixed(this.bufHigh, idL, tapSpan);
                this._colComp[cL]   = this._sampleAbsFixed(this.bufComp, idL, tapSpan);
                this._colDetail[cL] = this._sampleAbsFixed(this.bufDetail, idL, tapSpan);
                for (var sIdxL = 0; sIdxL < stemCount; sIdxL++) {
                    var sDefL = stemDefs[sIdxL];
                    var sValL = this._sampleAbsFixed(this._bufByKey[sDefL.key], idL, tapSpan);
                    if (sDefL.mixHats) {
                        sValL = Math.min(1.0, sValL + 0.28 * this._sampleAbsFixed(this.bufHats, idL, tapSpan));
                    }
                    this._colStems[sIdxL][cL] = sValL;
                }
            }

            // Exact playhead seam vertex (live boundary x = playheadX)
            if (nCols < this._maxCols - 3) {
                var cPh = nCols++;
                this._colX[cPh] = playheadX;
                this._colAbsId[cPh] = -1;
                this._colIsFuture[cPh] = 0;
                this._colAge[cPh] = subSliceAge;
                this._colSplit[cPh] = this._localSplit(0);
                this._colFade[cPh] = 1.0;
                this._colLow[cPh]    = this._sampleRingLinear3(this.bufLow, subSliceAge, halfWinSlices);
                this._colMid[cPh]    = this._sampleRingLinear3(this.bufMid, subSliceAge, halfWinSlices);
                this._colHigh[cPh]   = this._sampleRingLinear3(this.bufHigh, subSliceAge, halfWinSlices);
                this._colComp[cPh]   = this._sampleRingLinear3(this.bufComp, subSliceAge, halfWinSlices);
                this._colDetail[cPh] = this._sampleRingLinear3(this.bufDetail, subSliceAge, halfWinSlices);
                for (var sIdxPh = 0; sIdxPh < stemCount; sIdxPh++) {
                    var sDefPh = stemDefs[sIdxPh];
                    var sValPh = this._sampleRingLinear3(this._bufByKey[sDefPh.key], subSliceAge, halfWinSlices);
                    if (sDefPh.mixHats) {
                        sValPh = Math.min(1.0, sValPh + 0.28 * this._sampleRingLinear3(this.bufHats, subSliceAge, halfWinSlices));
                    }
                    this._colStems[sIdxPh][cPh] = sValPh;
                }
            }

            // Right side (Forecast or Center-Mirror) when playhead < width
            if (playheadX + 0.5 < width && nCols < this._maxCols - 2) {
                var seamDx = 0.5;
                var seamDistFrac = this._clamp(seamDx / rightSpan, 0, 1);

                if (phMode === "center_mirror") {
                    var seamMirrorAge = (seamDx / pxPerSlice) + subSliceAge;
                    var seamMirrorFade = this.params.forecastOpacity * 0.72 * Math.pow(1.0 - seamDistFrac, 0.7);
                    var cMs = nCols++;
                    this._colX[cMs] = playheadX + seamDx;
                    this._colAbsId[cMs] = -1;
                    this._colIsFuture[cMs] = 1;
                    this._colAge[cMs] = seamDx / pxPerSlice;
                    this._colSplit[cMs] = this._localSplit(seamDx / maxDist);
                    this._colFade[cMs] = (seamMirrorAge < this.filledSlices - 1) ? seamMirrorFade : 0.0;
                    this._colLow[cMs]    = this._sampleRingLinear3(this.bufLow, seamMirrorAge, halfWinSlices);
                    this._colMid[cMs]    = this._sampleRingLinear3(this.bufMid, seamMirrorAge, halfWinSlices);
                    this._colHigh[cMs]   = this._sampleRingLinear3(this.bufHigh, seamMirrorAge, halfWinSlices);
                    this._colComp[cMs]   = this._sampleRingLinear3(this.bufComp, seamMirrorAge, halfWinSlices);
                    this._colDetail[cMs] = this._sampleRingLinear3(this.bufDetail, seamMirrorAge, halfWinSlices);
                    for (var sIdxMs = 0; sIdxMs < stemCount; sIdxMs++) {
                        var sDefMs = stemDefs[sIdxMs];
                        var sValMs = this._sampleRingLinear3(this._bufByKey[sDefMs.key], seamMirrorAge, halfWinSlices);
                        if (sDefMs.mixHats) {
                            sValMs = Math.min(1.0, sValMs + 0.28 * this._sampleRingLinear3(this.bufHats, seamMirrorAge, halfWinSlices));
                        }
                        this._colStems[sIdxMs][cMs] = sValMs;
                    }

                    // Mirror lattice stepping downward through committed past slices (moving rightward)
                    var rightMirrorMinAbs = livePlayheadAbs - (rightSpan + stride * pxPerSlice) / pxPerSlice;
                    var kMinMirror = Math.ceil(Math.max(minValidId + tapSpan, rightMirrorMinAbs) / stride) * stride;
                    var kMaxMirror = Math.floor(maxLiveAbs / stride) * stride;
                    for (var idM = kMaxMirror; idM >= kMinMirror && nCols < this._maxCols - 2; idM -= stride) {
                        var dxM = (livePlayheadAbs - idM) * pxPerSlice;
                        if (dxM <= 0.6) continue;
                        if (dxM > rightSpan + stride * pxPerSlice) break;
                        var dfM = this._clamp(dxM / rightSpan, 0, 1);
                        var mFade = this.params.forecastOpacity * 0.72 * Math.pow(1.0 - dfM, 0.7);
                        var cM = nCols++;
                        this._colX[cM] = playheadX + dxM;
                        this._colAbsId[cM] = idM;
                        this._colIsFuture[cM] = 1;
                        this._colAge[cM] = dxM / pxPerSlice;
                        this._colSplit[cM] = this._localSplit(dxM / maxDist);
                        this._colFade[cM] = mFade;
                        this._colLow[cM]    = this._sampleAbsFixed(this.bufLow, idM, tapSpan);
                        this._colMid[cM]    = this._sampleAbsFixed(this.bufMid, idM, tapSpan);
                        this._colHigh[cM]   = this._sampleAbsFixed(this.bufHigh, idM, tapSpan);
                        this._colComp[cM]   = this._sampleAbsFixed(this.bufComp, idM, tapSpan);
                        this._colDetail[cM] = this._sampleAbsFixed(this.bufDetail, idM, tapSpan);
                        for (var sIdxM = 0; sIdxM < stemCount; sIdxM++) {
                            var sDefM = stemDefs[sIdxM];
                            var sValM = this._sampleAbsFixed(this._bufByKey[sDefM.key], idM, tapSpan);
                            if (sDefM.mixHats) {
                                sValM = Math.min(1.0, sValM + 0.28 * this._sampleAbsFixed(this.bufHats, idM, tapSpan));
                            }
                            this._colStems[sIdxM][cM] = sValM;
                        }
                    }
                } else {
                    // Forecast right seam at playheadX + 0.5
                    var seamFutFade = forecastReady * this.params.forecastOpacity * Math.pow(1.0 - seamDistFrac, 0.75);
                    var fAbsSeam = livePlayheadAbs + seamDx / pxPerSlice;
                    var cFs = nCols++;
                    this._colX[cFs] = playheadX + seamDx;
                    this._colAbsId[cFs] = -1;
                    this._colIsFuture[cFs] = 1;
                    this._colAge[cFs] = seamDx / pxPerSlice;
                    this._colSplit[cFs] = this._localSplit(seamDx / maxDist);
                    this._colFade[cFs] = seamFutFade;
                    if (seamFutFade > 0.01) {
                        this._colLow[cFs]    = this._sampleForecastAbs(this.bufLow, fAbsSeam, slicesPerBar, tapSpan);
                        this._colMid[cFs]    = this._sampleForecastAbs(this.bufMid, fAbsSeam, slicesPerBar, tapSpan);
                        this._colHigh[cFs]   = this._sampleForecastAbs(this.bufHigh, fAbsSeam, slicesPerBar, tapSpan);
                        this._colComp[cFs]   = this._sampleForecastAbs(this.bufComp, fAbsSeam, slicesPerBar, tapSpan);
                        this._colDetail[cFs] = this._sampleForecastAbs(this.bufDetail, fAbsSeam, slicesPerBar, tapSpan);
                        for (var sIdxFs = 0; sIdxFs < stemCount; sIdxFs++) {
                            var sDefFs = stemDefs[sIdxFs];
                            var sValFs = this._sampleForecastAbs(this._bufByKey[sDefFs.key], fAbsSeam, slicesPerBar, tapSpan);
                            if (sDefFs.mixHats) {
                                sValFs = Math.min(1.0, sValFs + 0.28 * this._sampleForecastAbs(this.bufHats, fAbsSeam, slicesPerBar, tapSpan));
                            }
                            this._colStems[sIdxFs][cFs] = sValFs;
                        }
                    } else {
                        this._colLow[cFs] = this._colMid[cFs] = this._colHigh[cFs] = this._colComp[cFs] = this._colDetail[cFs] = 0;
                        for (var sIdxFz = 0; sIdxFz < stemCount; sIdxFz++) this._colStems[sIdxFz][cFs] = 0;
                    }

                    // Sample-locked future forecast lattice (futureId % stride === 0)
                    var kStartFut = Math.ceil((livePlayheadAbs + 0.6 / pxPerSlice) / stride) * stride;
                    var futMaxAbs = livePlayheadAbs + (rightSpan + stride * pxPerSlice) / pxPerSlice;
                    for (var idF = kStartFut; idF <= futMaxAbs && nCols < this._maxCols - 2; idF += stride) {
                        var dxF = (idF - livePlayheadAbs) * pxPerSlice;
                        if (dxF <= 0.55) continue;
                        var dfF = this._clamp(dxF / rightSpan, 0, 1);
                        var fFade = forecastReady * this.params.forecastOpacity * Math.pow(1.0 - dfF, 0.75);
                        var cF = nCols++;
                        this._colX[cF] = playheadX + dxF;
                        this._colAbsId[cF] = idF;
                        this._colIsFuture[cF] = 1;
                        this._colAge[cF] = dxF / pxPerSlice;
                        this._colSplit[cF] = this._localSplit(dxF / maxDist);
                        this._colFade[cF] = fFade;
                        if (fFade > 0.01) {
                            this._colLow[cF]    = this._sampleForecastAbs(this.bufLow, idF, slicesPerBar, tapSpan);
                            this._colMid[cF]    = this._sampleForecastAbs(this.bufMid, idF, slicesPerBar, tapSpan);
                            this._colHigh[cF]   = this._sampleForecastAbs(this.bufHigh, idF, slicesPerBar, tapSpan);
                            this._colComp[cF]   = this._sampleForecastAbs(this.bufComp, idF, slicesPerBar, tapSpan);
                            this._colDetail[cF] = this._sampleForecastAbs(this.bufDetail, idF, slicesPerBar, tapSpan);
                            for (var sIdxF = 0; sIdxF < stemCount; sIdxF++) {
                                var sDefF = stemDefs[sIdxF];
                                var sValF = this._sampleForecastAbs(this._bufByKey[sDefF.key], idF, slicesPerBar, tapSpan);
                                if (sDefF.mixHats) {
                                    sValF = Math.min(1.0, sValF + 0.28 * this._sampleForecastAbs(this.bufHats, idF, slicesPerBar, tapSpan));
                                }
                                this._colStems[sIdxF][cF] = sValF;
                            }
                        } else {
                            this._colLow[cF] = this._colMid[cF] = this._colHigh[cF] = this._colComp[cF] = this._colDetail[cF] = 0;
                            for (var sIdxZ = 0; sIdxZ < stemCount; sIdxZ++) this._colStems[sIdxZ][cF] = 0;
                        }
                    }
                }

                // Right screen edge endpoint if grid ended before canvas right edge
                if (this._colX[nCols - 1] < width - 0.5 && nCols < this._maxCols) {
                    emitZeroCol(width, 1);
                }
            }
        }

        this._lastNCols = nCols;

        // Determine visibility bounds for unified vs split layers
        var maxSplit = 0, minSplit = 1;
        for (var c2 = 0; c2 < nCols; c2++) {
            var sp = this._colSplit[c2];
            if (sp > maxSplit) maxSplit = sp;
            if (sp < minSplit) minSplit = sp;
        }

        // 5. Center Baseline Axis for Unified Waveform
        if (minSplit < 0.96) {
            this._drawCenterAxis(ctx, width, centerY, minSplit);
        }

        // 6. Unified Waveform Layer
        if (minSplit < 0.98) {
            this._drawUnifiedLayer(
                ctx, nCols, stride, centerY, unifiedMaxH, gainScale, pal
            );
        }

        // 7. Prismatic Dispersion Filaments during active transition
        if (maxSplit > 0.06 && minSplit < 0.94) {
            this._drawDispersionFilaments(
                ctx, nCols, topY, usableH, centerY, stemDefs, pal
            );
        }

        // 8. Separated Stem Staves (drawn back-to-front top -> bottom)
        if (maxSplit > 0.02) {
            this._drawStemStaves(
                ctx, width, height, nCols, stride, topY, usableH, centerY,
                stemMaxH, gainScale, stemDefs, pal, aud
            );
        }

        // 9. Vertical Playhead Laser & Intersection Nodes
        this._drawPlayhead(
            ctx, width, height, topY, botY, usableH, centerY, playheadX, stemDefs, pal, aud
        );

        // 10. Top Bar-Cycle Status Pill & Forecast Hint
        if (this.params.showLabels) {
            this._drawCycleStatusHUD(ctx, width, playheadX, phMode, forecastReady, aud);
        }

        ctx.restore();
    }

    _draw3DFloorGrid(ctx, width, height, topY, botY) {
        var pt0 = { x: 0, y: 0, s: 1 };
        var pt1 = { x: 0, y: 0, s: 1 };
        ctx.save();
        ctx.strokeStyle = "rgba(56, 189, 248, " + (0.09 * this.tiltAmount).toFixed(3) + ")";
        ctx.lineWidth = 1;

        var rows = 6;
        for (var r = 0; r <= rows; r++) {
            var y = topY + (botY - topY) * (r / rows);
            this._project(0, y, -0.55, pt0);
            this._project(width, y, -0.55, pt1);
            ctx.beginPath();
            ctx.moveTo(pt0.x, pt0.y);
            ctx.lineTo(pt1.x, pt1.y);
            ctx.stroke();
        }
        var cols = 12;
        for (var c = 0; c <= cols; c++) {
            var x = width * (c / cols);
            this._project(x, topY, -0.55, pt0);
            this._project(x, botY, -0.55, pt1);
            ctx.beginPath();
            ctx.moveTo(pt0.x, pt0.y);
            ctx.lineTo(pt1.x, pt1.y);
            ctx.stroke();
        }
        ctx.restore();
    }

    _drawBeatgrid(ctx, width, height, topY, botY, centerY, playheadX, pxPerSlice, subSliceAge, slicesPerBeat, totalBeats, phMode, forecastReady) {
        var ptTop = { x: 0, y: 0, s: 1 };
        var ptBot = { x: 0, y: 0, s: 1 };
        var ptHead = { x: 0, y: 0, s: 1 };
        var zRange = 0.42 * this.splitAmount;

        // Live history beat crossings (scanning ring buffer slices)
        var maxLiveAge = Math.min(this.filledSlices - 2, Math.ceil(playheadX / pxPerSlice) + 2);
        var prevBeatNum = Math.floor(this._sampleBeatExact(Math.max(0, Math.floor(subSliceAge))));

        ctx.save();
        ctx.font = "600 10px 'SF Mono', ui-monospace, monospace";
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";

        for (var a = Math.max(1, Math.ceil(subSliceAge)); a <= maxLiveAge; a++) {
            var bCurr = this._sampleBeatExact(a);
            var bFloor = Math.floor(bCurr);
            if (bFloor < prevBeatNum) {
                var crossingBeat = prevBeatNum;
                var bPrev = this._sampleBeatExact(a - 1);
                var frac = (bPrev !== bCurr) ? this._clamp((bPrev - crossingBeat) / (bPrev - bCurr), 0, 1) : 0;
                var exactAge = (a - 1) + frac;
                var xPos = playheadX - (exactAge - subSliceAge) * pxPerSlice;
                if (xPos >= 0 && xPos <= playheadX) {
                    var isBarStart = (((crossingBeat % 4) + 4) % 4) === 0;
                    var gridTop = centerY + (topY - centerY) * Math.max(0.45, this.splitAmount);
                    var gridBot = centerY + (botY - centerY) * Math.max(0.45, this.splitAmount);

                    this._project(xPos, gridTop, -zRange, ptTop);
                    this._project(xPos, gridBot, zRange, ptBot);

                    ctx.strokeStyle = isBarStart
                        ? "rgba(148, 163, 184, 0.34)"
                        : "rgba(148, 163, 184, 0.11)";
                    ctx.lineWidth = (isBarStart ? 1.3 : 0.8) * this.lineThickness;
                    ctx.beginPath();
                    ctx.moveTo(ptTop.x, ptTop.y);
                    ctx.lineTo(ptBot.x, ptBot.y);
                    ctx.stroke();

                    if (isBarStart) {
                        var barNum = Math.floor(crossingBeat / 4) + 1;
                        this._project(xPos + 4, gridTop - 4, -zRange, ptHead);
                        ctx.fillStyle = "rgba(148, 163, 184, 0.65)";
                        ctx.fillText("BAR " + barNum, ptHead.x, ptHead.y);
                    }
                }
            }
            prevBeatNum = bFloor;
        }

        // Future forecast beatgrid ahead of playhead
        var rightSpan = width - playheadX;
        if (rightSpan > 12) {
            var maxFutureBeats = (rightSpan / pxPerSlice) / Math.max(1, slicesPerBeat);
            var firstFutureBeat = Math.ceil(totalBeats);
            var lastFutureBeat = Math.floor(totalBeats + maxFutureBeats);
            var futOpacityScale = (phMode === "center_mirror")
                ? Math.max(0.25, this.params.forecastOpacity * 1.4)
                : Math.max(0.18, forecastReady * Math.max(0.3, this.params.forecastOpacity * 1.35));

            for (var fb = firstFutureBeat; fb <= lastFutureBeat; fb++) {
                var beatsAhead = fb - totalBeats;
                var fx = playheadX + beatsAhead * slicesPerBeat * pxPerSlice;
                if (fx > width) break;
                var isBarFut = (((fb % 4) + 4) % 4) === 0;
                var fTop = centerY + (topY - centerY) * Math.max(0.45, this.splitAmount);
                var fBot = centerY + (botY - centerY) * Math.max(0.45, this.splitAmount);

                this._project(fx, fTop, -zRange, ptTop);
                this._project(fx, fBot, zRange, ptBot);

                ctx.strokeStyle = isBarFut
                    ? "rgba(148, 163, 184, " + (0.28 * futOpacityScale).toFixed(3) + ")"
                    : "rgba(148, 163, 184, " + (0.10 * futOpacityScale).toFixed(3) + ")";
                ctx.lineWidth = isBarFut ? 1.1 : 0.7;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(ptTop.x, ptTop.y);
                ctx.lineTo(ptBot.x, ptBot.y);
                ctx.stroke();

                if (isBarFut) {
                    var futBarNum = Math.floor(fb / 4) + 1;
                    this._project(fx + 4, fTop - 4, -zRange, ptHead);
                    ctx.fillStyle = "rgba(148, 163, 184, " + (0.48 * futOpacityScale).toFixed(3) + ")";
                    ctx.fillText("BAR " + futBarNum, ptHead.x, ptHead.y);
                }
            }
            ctx.setLineDash([]);
        }
        ctx.restore();
    }

    _drawCenterAxis(ctx, width, centerY, minSplit) {
        var fade = this._clamp(1.0 - minSplit * 1.2, 0, 1);
        if (fade <= 0.01) return;
        var p0 = this._project(0, centerY, 0, { x: 0, y: 0, s: 1 });
        var p1 = this._project(width, centerY, 0, { x: 0, y: 0, s: 1 });
        ctx.save();
        ctx.strokeStyle = "rgba(148, 163, 184, " + (0.28 * fade).toFixed(3) + ")";
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        ctx.restore();
    }

    _drawUnifiedLayer(ctx, nCols, stride, centerY, maxH, gainScale, pal) {
        var style = this.params.waveStyle;
        var glowAmt = this.params.glow;
        var ptTop = { x: 0, y: 0, s: 1 };
        var ptBot = { x: 0, y: 0, s: 1 };
        var ptMid = { x: 0, y: 0, s: 1 };

        if (style === "serato") {
            ctx.save();
            for (var pass = 0; pass < 2; pass++) {
                var wantFuture = (pass === 1);
                var startC = -1, endC = -1;
                for (var c = 0; c < nCols; c++) {
                    if ((this._colIsFuture[c] === 1) !== wantFuture) continue;
                    if (this._colFade[c] <= 0.015) continue;
                    if (startC < 0) startC = c;
                    endC = c;
                }
                if (endC - startC >= 1) {
                    this._drawSeratoUnifiedPass(ctx, startC, endC, wantFuture, centerY, maxH, gainScale, glowAmt, stride);
                }
            }

            // Thin ghost contour along forecast region so future wave reads clearly
            if (this.params.forecastOpacity > 0.03) {
                this._strokeUnifiedForecastOutline(ctx, nCols, centerY, maxH, gainScale, "rgba(203, 213, 225, 0.38)");
            }
            ctx.restore();
            return;
        }

        if (style === "rekordbox") {
            // 3 layered translucent mirrored polygons: Blue Lows -> Amber Mids -> Ice-White Highs
            var bands = [
                { arr: this._colLow,  scale: 1.00, color: "30, 107, 255",  alphaMul: 0.72 },
                { arr: this._colMid,  scale: 0.82, color: "255, 140, 26",  alphaMul: 0.76 },
                { arr: this._colHigh, scale: 0.58, color: "226, 244, 255", alphaMul: 0.88 }
            ];
            for (var bi = 0; bi < bands.length; bi++) {
                this._drawUnifiedRibbonBand(
                    ctx, nCols, centerY, maxH * bands[bi].scale, gainScale,
                    bands[bi].arr, bands[bi].color, bands[bi].alphaMul, false
                );
            }
            // Faint additive edge contour on top
            if (glowAmt > 0.05) {
                this._drawUnifiedRibbonBand(
                    ctx, nCols, centerY, maxH, gainScale,
                    this._colComp, "165, 225, 255", 0.30 * glowAmt, true
                );
            }
            return;
        }

        // "neon" oscilloscope style
        var pRgb0 = pal.rgb[3];
        var pRgb1 = pal.rgb[0];
        var neonColor = Math.round((pRgb0[0] + pRgb1[0]) * 0.5) + "," +
                        Math.round((pRgb0[1] + pRgb1[1]) * 0.5) + "," +
                        Math.round((pRgb0[2] + pRgb1[2]) * 0.5);
        this._drawUnifiedRibbonBand(ctx, nCols, centerY, maxH, gainScale, this._colComp, neonColor, 0.24, false);
        this._drawUnifiedNeonContour(ctx, nCols, centerY, maxH, gainScale, "0, 240, 255", "255, 51, 145", glowAmt);
    }

    _drawSeratoUnifiedPass(ctx, startC, endC, wantFuture, centerY, maxH, gainScale, glowAmt, stride) {
        var pt = { x: 0, y: 0, s: 1 };
        this._project(this._colX[startC], centerY, 0, pt);
        var gx0 = pt.x;
        this._project(this._colX[endC], centerY, 0, pt);
        var gx1 = pt.x;
        var spanX = gx1 - gx0;
        if (Math.abs(spanX) < 1.0) return;

        var mainGrad = ctx.createLinearGradient(gx0, 0, gx1, 0);
        var coreGrad = ctx.createLinearGradient(gx0, 0, gx1, 0);
        var haloGrad = (!wantFuture && glowAmt > 0.05) ? ctx.createLinearGradient(gx0, 0, gx1, 0) : null;

        var colorStepCols = wantFuture ? 4 : 3;
        var colorMod = Math.max(1, stride || 1) * colorStepCols;
        var lastT = 0.0;
        for (var colIdx = startC; colIdx <= endC; colIdx++) {
            var cid = this._colAbsId[colIdx];
            var isEndpoint = (colIdx === startC || colIdx === endC);
            if (!isEndpoint && !(cid >= 0 && (Math.round(cid) % colorMod === 0))) {
                continue;
            }
            var cA = Math.max(startC, colIdx - 1);
            var cB = Math.min(endC, colIdx + 1);
            var low = 0, mid = 0, high = 0, fade = 0, ampAcc = 0, cnt = 0;
            for (var k = cA; k <= cB; k++) {
                low += this._colLow[k];
                mid += this._colMid[k];
                high += this._colHigh[k];
                fade += this._colFade[k];
                ampAcc += this._colComp[k];
                cnt++;
            }
            low /= cnt; mid /= cnt; high /= cnt; fade /= cnt; ampAcc /= cnt;
            var ampEst = Math.tanh(Math.max(ampAcc, low * 0.56 + mid * 0.44 + high * 0.34) * gainScale * 0.88 * 1.15);

            var baseFloor = Math.min(low, mid, high) * 0.45;
            var rF = Math.pow(Math.max(0.01, low - baseFloor), 1.45);
            var gF = Math.pow(Math.max(0.01, mid - baseFloor * 0.9), 1.45);
            var bF = Math.pow(Math.max(0.01, high * 1.12 - baseFloor * 0.85), 1.45);
            var maxC = Math.max(rF, gF, bF, 0.001);
            var boost = 255 / maxC;
            var lumLift = ampEst * 14;
            var r = Math.min(255, Math.round(rF * boost * 0.94 + lumLift));
            var g = Math.min(255, Math.round(gF * boost * 0.94 + lumLift));
            var b = Math.min(255, Math.round(bF * boost * 0.94 + lumLift));

            this._project(this._colX[colIdx], centerY, 0, pt);
            var stopT = this._clamp((pt.x - gx0) / spanX, lastT, 1.0);
            lastT = stopT;

            var stopAlpha = wantFuture ? this._clamp(fade, 0.0, 0.80) : 0.94;
            mainGrad.addColorStop(stopT, "rgba(" + r + "," + g + "," + b + "," + stopAlpha.toFixed(3) + ")");

            var cr = Math.min(255, r + 105), cg = Math.min(255, g + 105), cb = Math.min(255, b + 105);
            coreGrad.addColorStop(stopT, "rgba(" + cr + "," + cg + "," + cb + "," + (stopAlpha * 0.65).toFixed(3) + ")");
            if (haloGrad) {
                haloGrad.addColorStop(stopT, "rgba(" + r + "," + g + "," + b + "," + (0.18 * glowAmt).toFixed(3) + ")");
            }
        }

        var fillBand = (heightMul, grad, isAdditive) => {
            ctx.save();
            if (isAdditive) ctx.globalCompositeOperation = "lighter";
            ctx.beginPath();
            for (var i = startC; i <= endC; i++) {
                var uW = Math.pow(this._clamp(1.0 - this._colSplit[i], 0, 1), 1.15);
                var rawAmp = Math.max(this._colComp[i], this._colLow[i] * 0.56 + this._colMid[i] * 0.44 + this._colHigh[i] * 0.34) * gainScale * 0.88;
                var amp = Math.tanh(rawAmp * 1.15);
                var hPx = (uW <= 0.005) ? 0.0 : Math.max(0.8, amp * maxH * uW * heightMul);
                this._project(this._colX[i], centerY - hPx, 0, pt);
                if (i === startC) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            }
            for (var j = endC; j >= startC; j--) {
                var uWb = Math.pow(this._clamp(1.0 - this._colSplit[j], 0, 1), 1.15);
                var rawAmpB = Math.max(this._colComp[j], this._colLow[j] * 0.56 + this._colMid[j] * 0.44 + this._colHigh[j] * 0.34) * gainScale * 0.88;
                var ampB = Math.tanh(rawAmpB * 1.15);
                var hPxB = (uWb <= 0.005) ? 0.0 : Math.max(0.8, ampB * maxH * uWb * heightMul);
                this._project(this._colX[j], centerY + hPxB, 0, pt);
                ctx.lineTo(pt.x, pt.y);
            }
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.restore();
        };

        if (haloGrad) fillBand(1.06, haloGrad, true);
        fillBand(1.0, mainGrad, false);
        fillBand(0.28, coreGrad, !wantFuture);
    }

    _strokeUnifiedForecastOutline(ctx, nCols, centerY, maxH, gainScale, strokeStyle) {
        var started = false;
        var pt = { x: 0, y: 0, s: 1 };
        ctx.save();
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = 1.0;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        for (var c = 0; c < nCols; c++) {
            if (!this._colIsFuture[c] || this._colFade[c] <= 0.02) continue;
            var uW = Math.pow(this._clamp(1 - this._colSplit[c], 0, 1), 1.15);
            if (uW <= 0.05) continue;
            var amp = this._clamp(this._colComp[c] * gainScale, 0, 1.05);
            this._project(this._colX[c], centerY - Math.max(1.5, amp * maxH * uW), 0, pt);
            if (!started) { ctx.moveTo(pt.x, pt.y); started = true; }
            else ctx.lineTo(pt.x, pt.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    }

    _drawUnifiedRibbonBand(ctx, nCols, centerY, maxH, gainScale, arr, rgbStr, baseAlpha, strokeOnly) {
        // Render live pass and forecast pass separately to maintain clean alpha
        for (var pass = 0; pass < 2; pass++) {
            var wantFuture = (pass === 1);
            var startC = -1, endC = -1;
            var avgFade = 0, cnt = 0;
            for (var c = 0; c < nCols; c++) {
                if ((this._colIsFuture[c] === 1) !== wantFuture) continue;
                if (this._colFade[c] <= 0.015) continue;
                if (startC < 0) startC = c;
                endC = c;
                avgFade += this._colFade[c];
                cnt++;
            }
            if (cnt < 2) continue;
            avgFade = wantFuture ? this._clamp(avgFade / cnt, 0, 0.75) : 1.0;

            var pt = { x: 0, y: 0, s: 1 };
            ctx.save();
            if (strokeOnly) ctx.globalCompositeOperation = "lighter";
            ctx.beginPath();
            for (var i = startC; i <= endC; i++) {
                var uW = Math.pow(this._clamp(1 - this._colSplit[i], 0, 1), 1.15);
                var amp = this._clamp(arr[i] * gainScale, 0, 1.08);
                var hPx = Math.max(0.8, amp * maxH * uW);
                this._project(this._colX[i], centerY - hPx, 0, pt);
                if (i === startC) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            }
            if (!strokeOnly) {
                for (var j = endC; j >= startC; j--) {
                    var uWb = Math.pow(this._clamp(1 - this._colSplit[j], 0, 1), 1.15);
                    var ampB = this._clamp(arr[j] * gainScale, 0, 1.08);
                    var hPxB = Math.max(0.8, ampB * maxH * uWb);
                    this._project(this._colX[j], centerY + hPxB, 0, pt);
                    ctx.lineTo(pt.x, pt.y);
                }
                ctx.closePath();
                ctx.fillStyle = "rgba(" + rgbStr + "," + (baseAlpha * avgFade).toFixed(3) + ")";
                ctx.fill();
            } else {
                ctx.strokeStyle = "rgba(" + rgbStr + "," + (baseAlpha * avgFade).toFixed(3) + ")";
                ctx.lineWidth = 1.4 * this.lineThickness;
                ctx.stroke();
            }
            ctx.restore();
        }
    }

    _drawUnifiedNeonContour(ctx, nCols, centerY, maxH, gainScale, rgbTop, rgbBot, glowAmt) {
        var pt = { x: 0, y: 0, s: 1 };
        for (var pass = 0; pass < 2; pass++) {
            var wantFuture = (pass === 1);
            var startC = -1, endC = -1, fadeSum = 0, cnt = 0;
            for (var c = 0; c < nCols; c++) {
                if ((this._colIsFuture[c] === 1) !== wantFuture) continue;
                if (this._colFade[c] <= 0.015) continue;
                if (startC < 0) startC = c;
                endC = c;
                fadeSum += this._colFade[c];
                cnt++;
            }
            if (cnt < 2) continue;
            var avgF = wantFuture ? this._clamp(fadeSum / cnt, 0, 0.75) : 1.0;

            for (var dir = -1; dir <= 1; dir += 2) {
                var rgb = (dir < 0) ? rgbTop : rgbBot;
                ctx.save();
                ctx.globalCompositeOperation = "lighter";
                if (wantFuture) ctx.setLineDash([5, 4]);
                ctx.beginPath();
                for (var i = startC; i <= endC; i++) {
                    var uW = Math.pow(this._clamp(1 - this._colSplit[i], 0, 1), 1.15);
                    var amp = this._clamp(this._colComp[i] * gainScale, 0, 1.08);
                    var hPx = Math.max(1.0, amp * maxH * uW);
                    this._project(this._colX[i], centerY + dir * hPx, 0, pt);
                    if (i === startC) ctx.moveTo(pt.x, pt.y);
                    else ctx.lineTo(pt.x, pt.y);
                }
                if (glowAmt > 0.05) {
                    ctx.strokeStyle = "rgba(" + rgb + "," + (0.28 * glowAmt * avgF).toFixed(3) + ")";
                    ctx.lineWidth = 4.2 * this.lineThickness;
                    ctx.stroke();
                }
                ctx.strokeStyle = "rgba(" + rgb + "," + (0.95 * avgF).toFixed(3) + ")";
                ctx.lineWidth = 1.6 * this.lineThickness;
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }
        }
    }

    _drawDispersionFilaments(ctx, nCols, topY, usableH, centerY, stemDefs, pal) {
        var count = stemDefs.length;
        var ptCenter = { x: 0, y: 0, s: 1 };
        var ptStem = { x: 0, y: 0, s: 1 };
        var step = Math.max(2, Math.floor(nCols / 56));
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.lineWidth = 1.1;

        for (var k = 0; k < count; k++) {
            var frac = (count === 1) ? 0.5 : k / (count - 1);
            var targetY = topY + usableH * frac;
            var targetZ = (frac - 0.5) * 0.85;
            var rgb = pal.rgb[stemDefs[k].colorIdx % pal.rgb.length];
            var colArr = this._colStems[k];

            for (var c = 0; c < nCols; c += step) {
                var sp = this._colSplit[c];
                if (sp <= 0.06 || sp >= 0.94 || this._colFade[c] <= 0.02) continue;
                var env = Math.sin(this._clamp(sp, 0, 1) * Math.PI);
                var energy = 0.25 + 0.75 * colArr[c];
                var alpha = env * 0.22 * this._colFade[c] * energy * (0.4 + 0.6 * this.params.glow);
                if (alpha <= 0.008) continue;

                var curY = centerY + (targetY - centerY) * sp;
                var curZ = targetZ * sp;
                this._project(this._colX[c], centerY, 0, ptCenter);
                this._project(this._colX[c], curY, curZ, ptStem);

                ctx.strokeStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + alpha.toFixed(3) + ")";
                ctx.beginPath();
                ctx.moveTo(ptCenter.x, ptCenter.y);
                ctx.lineTo(ptStem.x, ptStem.y);
                ctx.stroke();
            }
        }
        ctx.restore();
    }

    _drawStemStaves(ctx, width, height, nCols, colStep, topY, usableH, centerY, stemMaxH, gainScale, stemDefs, pal, aud) {
        var count = stemDefs.length;
        var style = this.params.waveStyle;
        var glowAmt = this.params.glow;
        var stObj = (aud && aud.stems) ? aud.stems : this._prevStems;
        var pt0 = { x: 0, y: 0, s: 1 };
        var pt1 = { x: 0, y: 0, s: 1 };

        // Draw back-to-front top (k=0) to bottom (k=count-1)
        for (var k = 0; k < count; k++) {
            var def = stemDefs[k];
            var frac = (count === 1) ? 0.5 : k / (count - 1);
            var targetY = topY + usableH * frac;
            var targetZ = (frac - 0.5) * 0.85;
            var rgb = pal.rgb[def.colorIdx % pal.rgb.length];
            var rgbStr = rgb[0] + "," + rgb[1] + "," + rgb[2];
            var brightStr = Math.min(255, rgb[0] + 95) + "," + Math.min(255, rgb[1] + 95) + "," + Math.min(255, rgb[2] + 95);
            var colArr = this._colStems[k];
            var liveVal = stObj[def.key] || 0;

            // Optional 3D translucent glass rail backing
            if (this.tiltAmount > 0.05) {
                var railAlpha = 0.055 * this.splitAmount * this.tiltAmount;
                var railHalf = stemMaxH * 0.92;
                ctx.save();
                ctx.beginPath();
                var pA = this._project(0, centerY + (targetY - railHalf - centerY) * this.splitAmount, targetZ * this.splitAmount, { x: 0, y: 0, s: 1 });
                var pB = this._project(width, centerY + (targetY - railHalf - centerY) * this.splitAmount, targetZ * this.splitAmount, { x: 0, y: 0, s: 1 });
                var pC = this._project(width, centerY + (targetY + railHalf - centerY) * this.splitAmount, targetZ * this.splitAmount, { x: 0, y: 0, s: 1 });
                var pD = this._project(0, centerY + (targetY + railHalf - centerY) * this.splitAmount, targetZ * this.splitAmount, { x: 0, y: 0, s: 1 });
                ctx.moveTo(pA.x, pA.y);
                ctx.lineTo(pB.x, pB.y);
                ctx.lineTo(pC.x, pC.y);
                ctx.lineTo(pD.x, pD.y);
                ctx.closePath();
                ctx.fillStyle = "rgba(" + rgbStr + "," + railAlpha.toFixed(3) + ")";
                ctx.fill();
                ctx.strokeStyle = "rgba(" + rgbStr + "," + (railAlpha * 2.4).toFixed(3) + ")";
                ctx.lineWidth = 0.8;
                ctx.stroke();
                ctx.restore();
            }

            // Staff horizontal baseline axis
            ctx.save();
            ctx.beginPath();
            for (var c = 0; c < nCols; c += 8) {
                var sp = this._colSplit[c];
                var ay = centerY + (targetY - centerY) * sp;
                var az = targetZ * sp;
                this._project(this._colX[c], ay, az, pt0);
                if (c === 0) ctx.moveTo(pt0.x, pt0.y);
                else ctx.lineTo(pt0.x, pt0.y);
            }
            var endSp = this._colSplit[nCols - 1];
            this._project(width, centerY + (targetY - centerY) * endSp, targetZ * endSp, pt1);
            ctx.lineTo(pt1.x, pt1.y);
            var axisAlpha = this._clamp(this.splitAmount * (0.28 + liveVal * 0.25), 0, 0.7);
            ctx.strokeStyle = "rgba(" + rgbStr + "," + axisAlpha.toFixed(3) + ")";
            ctx.lineWidth = 1.0;
            ctx.stroke();
            ctx.restore();

            // Waveform rendering on Live side (pass 0) and Forecast side (pass 1)
            for (var pass = 0; pass < 2; pass++) {
                var wantFuture = (pass === 1);
                var startC = -1, endC = -1, fadeSum = 0, cnt = 0;
                for (var c2 = 0; c2 < nCols; c2++) {
                    if ((this._colIsFuture[c2] === 1) !== wantFuture) continue;
                    if (this._colFade[c2] <= 0.015 || this._colSplit[c2] <= 0.02) continue;
                    if (startC < 0) startC = c2;
                    endC = c2;
                    fadeSum += this._colFade[c2];
                    cnt++;
                }
                if (cnt < 2) continue;
                var avgFade = wantFuture ? this._clamp(fadeSum / cnt, 0, 0.72) : 1.0;

                if (style === "serato") {
                    ctx.save();
                    if (glowAmt > 0.05 && !wantFuture) {
                        this._fillStemPolygon(
                            ctx, startC, endC, targetY, targetZ, centerY, stemMaxH * 1.12, gainScale, colArr,
                            "rgba(" + rgbStr + "," + (0.16 * glowAmt * this.splitAmount).toFixed(3) + ")", true
                        );
                    }
                    this._fillStemPolygon(
                        ctx, startC, endC, targetY, targetZ, centerY, stemMaxH, gainScale, colArr,
                        this._stemFillStyle(ctx, startC, endC, targetY, targetZ, centerY, rgbStr, 0.90 * this.splitAmount, wantFuture), false
                    );
                    this._fillStemPolygon(
                        ctx, startC, endC, targetY, targetZ, centerY, stemMaxH * 0.34, gainScale, colArr,
                        this._stemFillStyle(ctx, startC, endC, targetY, targetZ, centerY, brightStr, 0.78 * this.splitAmount, wantFuture), !wantFuture
                    );
                    this._strokeStemOutline(
                        ctx, startC, endC, targetY, targetZ, centerY, stemMaxH, gainScale, colArr,
                        "rgba(" + brightStr + "," + (wantFuture ? (0.48 * avgFade) : (0.45 * this.splitAmount)).toFixed(3) + ")",
                        wantFuture, 1.0 * this.lineThickness
                    );
                    ctx.restore();
                } else if (style === "rekordbox") {
                    ctx.save();
                    this._fillStemPolygon(
                        ctx, startC, endC, targetY, targetZ, centerY, stemMaxH, gainScale, colArr,
                        this._stemFillStyle(ctx, startC, endC, targetY, targetZ, centerY, rgbStr, 0.82 * this.splitAmount, wantFuture), false
                    );
                    this._fillStemPolygon(
                        ctx, startC, endC, targetY, targetZ, centerY, stemMaxH * 0.42, gainScale, colArr,
                        this._stemFillStyle(ctx, startC, endC, targetY, targetZ, centerY, brightStr, 0.68 * this.splitAmount, wantFuture), true
                    );
                    if (wantFuture) {
                        this._strokeStemOutline(ctx, startC, endC, targetY, targetZ, centerY, stemMaxH, gainScale, colArr, "rgba(" + brightStr + "," + (0.50 * avgFade).toFixed(3) + ")", true);
                    }
                    ctx.restore();
                } else {
                    // "neon" oscilloscope style
                    ctx.save();
                    this._fillStemPolygon(
                        ctx, startC, endC, targetY, targetZ, centerY, stemMaxH, gainScale, colArr,
                        this._stemFillStyle(ctx, startC, endC, targetY, targetZ, centerY, rgbStr, 0.22 * this.splitAmount, wantFuture), false
                    );
                    if (glowAmt > 0.05) {
                        ctx.globalCompositeOperation = "lighter";
                        this._strokeStemOutline(
                            ctx, startC, endC, targetY, targetZ, centerY, stemMaxH, gainScale, colArr,
                            "rgba(" + rgbStr + "," + (0.26 * glowAmt * avgFade).toFixed(3) + ")", wantFuture, 4.0 * this.lineThickness
                        );
                    }
                    this._strokeStemOutline(
                        ctx, startC, endC, targetY, targetZ, centerY, stemMaxH, gainScale, colArr,
                        "rgba(" + brightStr + "," + (0.95 * avgFade).toFixed(3) + ")", wantFuture, 1.5 * this.lineThickness
                    );
                    ctx.restore();
                }
            }

            // Left-side Stem Badge + live VU meter pill
            if (this.params.showLabels && this.splitAmount > 0.12) {
                this._drawStemBadge(ctx, topY, usableH, centerY, targetY, targetZ, def.label, pal.colors[def.colorIdx % pal.colors.length], rgbStr, liveVal);
            }
        }
    }

    _stemFillStyle(ctx, startC, endC, targetY, targetZ, centerY, rgbStr, alphaMax, isFuture) {
        if (!isFuture) {
            return "rgba(" + rgbStr + "," + alphaMax.toFixed(3) + ")";
        }
        var pt0 = { x: 0, y: 0, s: 1 }, pt1 = { x: 0, y: 0, s: 1 };
        var sp0 = this._colSplit[startC], sp1 = this._colSplit[endC];
        this._project(this._colX[startC], centerY + (targetY - centerY) * sp0, targetZ * sp0, pt0);
        this._project(this._colX[endC], centerY + (targetY - centerY) * sp1, targetZ * sp1, pt1);
        if (Math.abs(pt1.x - pt0.x) < 1.0) {
            return "rgba(" + rgbStr + "," + (alphaMax * this._colFade[startC]).toFixed(3) + ")";
        }
        var g = ctx.createLinearGradient(pt0.x, 0, pt1.x, 0);
        var stops = 5;
        for (var s = 0; s < stops; s++) {
            var u = s / (stops - 1);
            var cIdx = Math.round(startC + u * (endC - startC));
            var a = this._clamp(alphaMax * this._colFade[cIdx], 0, 1);
            g.addColorStop(u, "rgba(" + rgbStr + "," + a.toFixed(3) + ")");
        }
        return g;
    }

    _fillStemPolygon(ctx, startC, endC, targetY, targetZ, centerY, stemMaxH, gainScale, colArr, fillStyle, additive) {
        var pt = { x: 0, y: 0, s: 1 };
        ctx.save();
        if (additive) ctx.globalCompositeOperation = "lighter";
        ctx.beginPath();
        for (var i = startC; i <= endC; i++) {
            var sp = this._colSplit[i];
            var amp = Math.tanh(colArr[i] * gainScale * 1.15);
            var hPx = Math.max(0.8, amp * stemMaxH * sp);
            var ay = centerY + (targetY - centerY) * sp;
            this._project(this._colX[i], ay - hPx, targetZ * sp, pt);
            if (i === startC) ctx.moveTo(pt.x, pt.y);
            else ctx.lineTo(pt.x, pt.y);
        }
        for (var j = endC; j >= startC; j--) {
            var spB = this._colSplit[j];
            var ampB = Math.tanh(colArr[j] * gainScale * 1.15);
            var hPxB = Math.max(0.8, ampB * stemMaxH * spB);
            var ayB = centerY + (targetY - centerY) * spB;
            this._project(this._colX[j], ayB + hPxB, targetZ * spB, pt);
            ctx.lineTo(pt.x, pt.y);
        }
        ctx.closePath();
        ctx.fillStyle = fillStyle;
        ctx.fill();
        ctx.restore();
    }

    _strokeStemOutline(ctx, startC, endC, targetY, targetZ, centerY, stemMaxH, gainScale, colArr, strokeStyle, dashed, lw) {
        var pt = { x: 0, y: 0, s: 1 };
        ctx.save();
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lw || 1.1;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        if (dashed) ctx.setLineDash([4, 3]);
        for (var dir = -1; dir <= 1; dir += 2) {
            ctx.beginPath();
            for (var i = startC; i <= endC; i++) {
                var sp = this._colSplit[i];
                var amp = Math.tanh(colArr[i] * gainScale * 1.15);
                var hPx = Math.max(0.8, amp * stemMaxH * sp);
                var ay = centerY + (targetY - centerY) * sp;
                this._project(this._colX[i], ay + dir * hPx, targetZ * sp, pt);
                if (i === startC) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
            }
            ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
    }

    _drawStemBadge(ctx, topY, usableH, centerY, targetY, targetZ, label, hexColor, rgbStr, liveVal) {
        var sp = this._localSplit(0.95);
        var ay = centerY + (targetY - centerY) * sp;
        var pt = this._project(0, ay, targetZ * sp, { x: 0, y: 0, s: 1 });
        var badgeAlpha = this._smoothstep((this.splitAmount - 0.12) / 0.35);
        if (badgeAlpha <= 0.01) return;

        ctx.save();
        ctx.globalAlpha *= badgeAlpha;
        var bw = 114, bh = 22;
        var bx = Math.max(16, pt.x + 14);
        var by = pt.y - bh * 0.5;

        ctx.fillStyle = "rgba(6, 11, 25, 0.84)";
        ctx.strokeStyle = "rgba(" + rgbStr + ", 0.55)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, by, bw, bh, 5);
        else ctx.rect(bx, by, bw, bh);
        ctx.fill();
        ctx.stroke();

        // Color dot + Stem label
        ctx.fillStyle = hexColor;
        ctx.beginPath();
        ctx.arc(bx + 10, pt.y, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#f1f5f9";
        ctx.font = "700 10px 'Outfit', sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(label, bx + 18, pt.y - 2.5);

        // Mini live VU bar beneath label
        var vuTrackX = bx + 18, vuTrackY = pt.y + 5, vuTrackW = bw - 26, vuTrackH = 2.5;
        ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
        ctx.fillRect(vuTrackX, vuTrackY, vuTrackW, vuTrackH);
        ctx.fillStyle = hexColor;
        ctx.fillRect(vuTrackX, vuTrackY, vuTrackW * this._clamp(liveVal, 0, 1), vuTrackH);

        ctx.restore();
    }

    _drawPlayhead(ctx, width, height, topY, botY, usableH, centerY, playheadX, stemDefs, pal, aud) {
        var phSplit = this._localSplit(0.0);
        var zSpan = 0.52 * phSplit;
        var lineTopY = topY - 12;
        var lineBotY = botY + 12;
        var pTop = this._project(playheadX, lineTopY, -zSpan, { x: 0, y: 0, s: 1 });
        var pBot = this._project(playheadX, lineBotY, zSpan, { x: 0, y: 0, s: 1 });
        var stObj = (aud && aud.stems) ? aud.stems : this._prevStems;
        var compEnergy = stObj.composite || 0;
        var beatFlash = (aud && aud.isBeat) ? 0.35 : 0;
        var glowMul = 0.4 + 0.6 * this.params.glow;

        ctx.save();
        ctx.globalCompositeOperation = "lighter";

        // Soft laser bloom beam
        ctx.strokeStyle = "rgba(224, 242, 254, " + (0.20 * glowMul + this.dropFlash * 0.25).toFixed(3) + ")";
        ctx.lineWidth = (7.0 + beatFlash * 6.0) * this.lineThickness;
        ctx.beginPath();
        ctx.moveTo(pTop.x, pTop.y);
        ctx.lineTo(pBot.x, pBot.y);
        ctx.stroke();

        // Crisp core beam
        ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(pTop.x, pTop.y);
        ctx.lineTo(pBot.x, pBot.y);
        ctx.stroke();

        // Playhead intersection nodes
        if (phSplit < 0.95) {
            var cFade = 1.0 - phSplit;
            var pMid = this._project(playheadX, centerY, 0, { x: 0, y: 0, s: 1 });
            var rad = (4.5 + compEnergy * 5.0 + this.dropFlash * 5.0) * cFade * pMid.s;
            ctx.fillStyle = "rgba(255, 255, 255, " + (0.9 * cFade).toFixed(3) + ")";
            ctx.beginPath();
            ctx.arc(pMid.x, pMid.y, rad, 0, Math.PI * 2);
            ctx.fill();
        }

        if (phSplit > 0.05) {
            var count = stemDefs.length;
            var ptNode = { x: 0, y: 0, s: 1 };
            for (var k = 0; k < count; k++) {
                var frac = (count === 1) ? 0.5 : k / (count - 1);
                var targetY = topY + usableH * frac;
                var targetZ = (frac - 0.5) * 0.85;
                var ny = centerY + (targetY - centerY) * phSplit;
                var nz = targetZ * phSplit;
                this._project(playheadX, ny, nz, ptNode);
                var val = stObj[stemDefs[k].key] || 0;
                var rgb = pal.rgb[stemDefs[k].colorIdx % pal.rgb.length];
                var rNode = (3.5 + val * 4.5 + this.dropFlash * 3.0) * phSplit * ptNode.s;

                ctx.fillStyle = "rgba(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + "," + (0.55 * phSplit).toFixed(3) + ")";
                ctx.beginPath();
                ctx.arc(ptNode.x, ptNode.y, rNode * 1.9, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = "rgba(255, 255, 255, " + (0.92 * phSplit).toFixed(3) + ")";
                ctx.beginPath();
                ctx.arc(ptNode.x, ptNode.y, rNode * 0.85, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    _drawCycleStatusHUD(ctx, width, playheadX, phMode, forecastReady, aud) {
        var cycleBars = Math.max(4, this.params.cycleBars || 16);
        var barStr = (this.barInCycle < 10 ? "0" : "") + this.barInCycle;
        var totStr = (cycleBars < 10 ? "0" : "") + cycleBars;
        var mode = this.params.cycleMode;

        var srcState = (aud && aud.audioSourceState) ? aud.audioSourceState : "sim_no_mic";
        var dotColor = "#38bdf8", srcLabel = "DETECTING";
        if (srcState === "live_music") {
            dotColor = "#10b981";
            srcLabel = "LIVE";
        } else if (srcState === "sim_no_signal") {
            dotColor = "#f59e0b";
            srcLabel = "SIM (NO MUSIC)";
        } else if (srcState === "sim_no_mic") {
            dotColor = "#f97316";
            srcLabel = "SIM (NO MIC)";
        }

        var cyclePart = (mode === "auto")
            ? ("BAR " + barStr + " / " + totStr + "  •  " + this.phaseName + "  •  " + Math.round(this.bpm) + " BPM")
            : (this.phaseName + "  •  BAR " + barStr + "  •  " + Math.round(this.bpm) + " BPM");
        var label = srcLabel + "  •  " + cyclePart;

        ctx.save();
        var pillW = 448, pillH = 26;
        var px = width * 0.5 - pillW * 0.5;
        var py = 18;

        ctx.fillStyle = "rgba(6, 11, 25, 0.80)";
        ctx.strokeStyle = (srcState === "live_music") ? "rgba(16, 185, 129, 0.45)" : "rgba(56, 189, 248, 0.30)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(px, py, pillW, pillH, 13);
        else ctx.rect(px, py, pillW, pillH);
        ctx.fill();
        ctx.stroke();

        // Audio source LED dot
        ctx.fillStyle = dotColor;
        ctx.beginPath();
        ctx.arc(px + 15, py + 11, 3.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#e2e8f0";
        ctx.font = "600 11px 'SF Mono', ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, width * 0.5 + 6, py + 11);

        // 4-phase progress bar at bottom of status pill (UNIFIED | SPLIT | STEMS | MERGE)
        var trackX = px + 24, trackY = py + pillH - 5, trackW = pillW - 48, trackH = 2.5;
        ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
        ctx.fillRect(trackX, trackY, trackW, trackH);

        // Phase ticks at 25%, 37.5%, 87.5%
        var fillW = trackW * this._clamp(this.cycleProgress, 0, 1);
        ctx.fillStyle = this.splitAmount > 0.5 ? "#38bdf8" : "#f472b6";
        ctx.fillRect(trackX, trackY, fillW, trackH);

        // Forecast subtle indicator on right half when visible
        if (this.params.forecastOpacity > 0.03 && width - playheadX > 95) {
            ctx.textAlign = "right";
            ctx.font = "600 9px 'SF Mono', ui-monospace, monospace";
            if (phMode === "center_mirror") {
                ctx.fillStyle = "rgba(148, 163, 184, 0.45)";
                ctx.fillText("MIRROR ▸", width - 20, py + 13);
            } else {
                var txt = forecastReady > 0.35 ? "BAR-LOOP FORECAST ▸" : "BUFFERING FORECAST…";
                ctx.fillStyle = "rgba(148, 163, 184, " + (0.28 + 0.32 * forecastReady).toFixed(2) + ")";
                ctx.fillText(txt, width - 20, py + 13);
            }
        }
        ctx.restore();
    }
}

window.StemWaveformScene = StemWaveformScene;
