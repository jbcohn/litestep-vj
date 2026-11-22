/**
 * VJ Visualizer - Web Audio Reactivity Engine
 * Handles microphone / line-in capture, spectral FFT analysis,
 * multi-band frequency separation (Sub, Bass, Mid, Treble),
 * transient beat detection, and fallback simulation.
 */

class AudioEngine {
    constructor() {
        this.audioCtx = null;
        this.analyser = null;
        this.source = null;
        this.mediaStream = null;
        this.fftSize = 1024;
        this.frequencyData = null;
        this.timeDomainData = null;

        // Configuration & Always-On Auto-Detection State
        this.sensitivity = 1.2;
        this.smoothing = 0.82;
        this.isListening = false;
        this.useSimulation = true;
        this.audioSourceState = 'connecting'; // 'connecting' | 'live_music' | 'sim_no_signal' | 'sim_no_mic'
        this.audioStatusReason = 'Connecting to audio input...';
        this.micPermissionError = null;       // null | 'denied' | 'no_device' | 'gesture_needed' | 'unsupported' | 'error'
        this.liveSignalLevel = 0;             // 0..1 instantaneous mic signal meter
        this._signalDetectTimer = 0;
        this._silenceTimer = 0;
        this.audioSourceCallbacks = [];

        // Extracted Band Energy (0.0 to 1.0 smoothed)
        this.sub = 0;      // 20 - 80 Hz
        this.bass = 0;     // 80 - 250 Hz
        this.mids = 0;     // 250 - 2500 Hz
        this.highs = 0;    // 2500 - 10000 Hz
        this.energy = 0;   // Overall loudness

        // Raw instantaneous values (for transient detection)
        this.rawBass = 0;
        this.rawSub = 0;
        this.rawHighs = 0;

        // Beat Tracking & Transients
        this.beatThreshold = 1.25;
        this.bassHistory = [];
        this.historySize = 45; // ~0.75 seconds at 60fps
        this.isBeat = false;
        this.beatConfidence = 0;
        this.timeSinceLastBeat = 0;
        this.dropDetected = false;

        // Tap Tempo / Manual BPM & Live Detection
        this.tapHistory = [];
        this.detectedIntervals = [];
        this.bpm = 124;
        this.beatPhase = 0; // 0.0 to 1.0 cycle

        // Listeners
        this.beatCallbacks = [];
        this.dropCallbacks = [];
        this.stateCallbacks = [];

        // Musical Structure & Dance Tension Analysis
        this.musicalState = 'groove'; // 'groove' | 'breakdown' | 'buildup' | 'pre_drop' | 'drop'
        this.previousMusicalState = 'groove';
        this.tension = 0.0;            // 0.0 to 1.0 (accumulated musical suspense)
        this.buildupProgress = 0.0;    // 0.0 to 1.0
        this.dropIntensity = 0.0;      // 0.0 to 1.0 (peaks on drop, decays organically)
        this.spectralCentroid = 0.0;   // 0.0 to 1.0 (timbre brightness / filter cutoff)
        this.spectralFlux = 0.0;       // Rate of spectral change
        this.onsetDensity = 0.0;       // Transients per second (snare rolls, etc.)
        this.energySlope = 0.0;        // Trend in loudness over ~1.5s
        this.lowRatio = 0.5;           // Proportion of energy in Sub + Bass

        this.energyHistory = [];       // Sliding energy history for trend analysis
        this.energyHistoryMax = 90;
        this.onsetHistory = [];        // Timestamps of recent transient onsets
        this.prevSpectrum = null;      // Previous frame spectrum for flux calculation
        this.stateTimer = 0;           // Seconds spent in current musical state
        this.breakdownWatchTimer = 0;

        // Simulation State
        this.simTime = 0;
        this.simBeatCounter = 0;
        this.totalBeats = 0;
        this._simBarOffset = 0;

        // High-Resolution Real-Time Stem Separation (DSP Hybrid: HPSS + Mid/Side + Bands)
        this.stemFftSize = 2048;
        this.stemAnalyser = null;
        this.stemFreqData = null;
        this.stemTimeData = null;
        this.splitter = null;
        this.midGainL = null;
        this.midGainR = null;
        this.sideGainL = null;
        this.sideGainR = null;
        this.analyserMid = null;
        this.analyserSide = null;
        this.midFreqData = null;
        this.sideFreqData = null;
        this.hasStereo = false;
        this.stereoConfidence = 0;
        this._inputChannelCount = 2;

        this._hpssBands = 64;
        this._hpssFrames = 24;
        this._hpssHistory = new Float32Array(this._hpssBands * this._hpssFrames);
        this._hpssWriteIdx = 0;
        this._hpssFilled = 0;
        this._hpssBandRanges = null;
        this._hpssCurrent = new Float32Array(this._hpssBands);
        this._hpssPrev = new Float32Array(this._hpssBands);
        this._hpssFlux = new Float32Array(this._hpssBands);
        this._hpssTemporal = new Float32Array(this._hpssBands);
        this._hpssHarm = new Float32Array(this._hpssBands);
        this._hpssPerc = new Float32Array(this._hpssBands);
        this._harmHistory = new Float32Array(this._hpssBands * this._hpssFrames);
        this._hpssMod = new Float32Array(this._hpssBands);
        this._bandMidDom = new Float32Array(this._hpssBands);
        this._hpssSortTmp = new Float32Array(this._hpssFrames);
        this._vocalGateSmooth = 0;
        this._prevTdRms = 0;
        this._prevTdPeak = 0;

        this.stems = {
            drums: 0,
            bass: 0,
            vocals: 0,
            synths: 0,
            hats: 0,
            air: 0,
            low: 0,
            mid: 0,
            high: 0,
            composite: 0,
            detail: 0
        };

        // Real-time Stem Diagnostics Telemetry & Log Recorder
        this.lastStemDiag = null;
        this._diagRec = {
            active: false,
            startedAtPerf: 0,
            startedAtIso: '',
            maxSec: 30,
            maxFrames: 3600,
            frames: [],
            markers: [],
            onFinish: null
        };
    }

    _buildHpssBands(sampleRate) {
        const nyquist = (sampleRate || 44100) / 2;
        const binCount = this.stemFreqData ? this.stemFreqData.length : (this.stemFftSize / 2);
        const binHz = nyquist / binCount;
        const msBinCount = this.midFreqData ? this.midFreqData.length : 256;
        const msBinHz = nyquist / msBinCount;
        const fMin = 30;
        const fMax = Math.min(16000, nyquist * 0.96);
        const ranges = new Array(this._hpssBands);
        for (let b = 0; b < this._hpssBands; b++) {
            const f0 = fMin * Math.pow(fMax / fMin, b / this._hpssBands);
            const f1 = fMin * Math.pow(fMax / fMin, (b + 1) / this._hpssBands);
            const sBin = Math.max(1, Math.floor(f0 / binHz));
            const eBin = Math.min(binCount - 1, Math.max(sBin, Math.ceil(f1 / binHz)));
            const msSBin = Math.max(1, Math.floor(f0 / msBinHz));
            const msEBin = Math.min(msBinCount - 1, Math.max(msSBin, Math.ceil(f1 / msBinHz)));
            ranges[b] = { sBin, eBin, msSBin, msEBin, fc: Math.sqrt(f0 * f1) };
        }
        this._hpssBandRanges = ranges;
    }

    async init() {
        try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContextClass();
            this.analyser = this.audioCtx.createAnalyser();
            this.analyser.fftSize = this.fftSize;
            this.analyser.smoothingTimeConstant = this.smoothing;
            this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
            this.timeDomainData = new Uint8Array(this.analyser.fftSize);

            // Dedicated fast-response analyser + Mid/Side splitter for real-time stem separation
            this.stemAnalyser = this.audioCtx.createAnalyser();
            this.stemAnalyser.fftSize = this.stemFftSize;
            this.stemAnalyser.smoothingTimeConstant = 0.06;
            this.stemFreqData = new Uint8Array(this.stemAnalyser.frequencyBinCount);
            this.stemTimeData = new Uint8Array(this.stemAnalyser.fftSize);

            this.splitter = this.audioCtx.createChannelSplitter(2);
            this.midGainL = this.audioCtx.createGain();
            this.midGainR = this.audioCtx.createGain();
            this.sideGainL = this.audioCtx.createGain();
            this.sideGainR = this.audioCtx.createGain();
            this.midGainL.gain.value = 0.5;
            this.midGainR.gain.value = 0.5;
            this.sideGainL.gain.value = 0.5;
            this.sideGainR.gain.value = -0.5;

            this.analyserMid = this.audioCtx.createAnalyser();
            this.analyserMid.fftSize = 512;
            this.analyserMid.smoothingTimeConstant = 0.25;
            this.analyserSide = this.audioCtx.createAnalyser();
            this.analyserSide.fftSize = 512;
            this.analyserSide.smoothingTimeConstant = 0.25;
            this.midFreqData = new Uint8Array(this.analyserMid.frequencyBinCount);
            this.sideFreqData = new Uint8Array(this.analyserSide.frequencyBinCount);

            this.splitter.connect(this.midGainL, 0);
            this.splitter.connect(this.midGainR, 1);
            this.midGainL.connect(this.analyserMid);
            this.midGainR.connect(this.analyserMid);

            this.splitter.connect(this.sideGainL, 0);
            this.splitter.connect(this.sideGainR, 1);
            this.sideGainL.connect(this.analyserSide);
            this.sideGainR.connect(this.analyserSide);

            this._buildHpssBands(this.audioCtx.sampleRate);
            return true;
        } catch (e) {
            console.warn("Web Audio API not supported:", e);
            this.useSimulation = true;
            return false;
        }
    }

    onAudioSourceChange(callback) {
        this.audioSourceCallbacks.push(callback);
    }

    _setAudioSourceState(newState, reason) {
        if (reason) this.audioStatusReason = reason;
        if (this.audioSourceState === newState) return;
        const prev = this.audioSourceState;
        this.audioSourceState = newState;
        this.useSimulation = (newState !== 'live_music');
        if (this._diagRec && this._diagRec.active) {
            this.markStemDiag('source:' + newState);
        }
        this.audioSourceCallbacks.forEach(cb => {
            try { cb(newState, prev, this.audioStatusReason); } catch (e) { console.error("AudioSource callback error:", e); }
        });
    }

    async startAudioInput(deviceId = null) {
        if (this.audioSourceState !== 'live_music') {
            this._setAudioSourceState('connecting', 'Connecting to audio input...');
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            this.isListening = false;
            this.micPermissionError = 'unsupported';
            this._setAudioSourceState('sim_no_mic', 'Microphone API unavailable — using Sim Beat');
            return false;
        }

        if (!this.audioCtx) await this.init();
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            try {
                await this.audioCtx.resume();
            } catch (_) {}
        }

        try {
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => track.stop());
            }

            const rawAudioOpts = {
                echoCancellation: false,
                noiseSuppression: false,
                autoGainControl: false
            };
            if (deviceId) rawAudioOpts.deviceId = { exact: deviceId };

            try {
                this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: rawAudioOpts });
            } catch (rawErr) {
                const fallbackConstraints = {
                    audio: deviceId ? { deviceId: { exact: deviceId } } : true
                };
                this.mediaStream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
            }

            if (this.source) {
                this.source.disconnect();
            }

            this.source = this.audioCtx.createMediaStreamSource(this.mediaStream);
            this.source.connect(this.analyser);
            if (this.stemAnalyser) this.source.connect(this.stemAnalyser);
            if (this.splitter) this.source.connect(this.splitter);

            const tracks = this.mediaStream.getAudioTracks();
            const chCount = (tracks[0] && tracks[0].getSettings && tracks[0].getSettings().channelCount) || 2;
            this._inputChannelCount = chCount;
            this.hasStereo = chCount >= 2;
            this.stereoConfidence = 0;

            this._signalDetectTimer = 0;
            this._silenceTimer = 0;
            this.micPermissionError = null;
            this.isListening = true;

            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.micPermissionError = 'gesture_needed';
                this._setAudioSourceState('sim_no_mic', 'Click anywhere to enable live mic (Sim Beat)');
                return false;
            }

            this._setAudioSourceState('sim_no_signal', 'Listening — no music detected (Sim Beat)');
            console.log("Audio input connected — monitoring for live music.");
            return true;
        } catch (err) {
            const errName = (err && err.name) ? err.name : '';
            let reason = 'Audio input unavailable — using Sim Beat';
            if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
                this.micPermissionError = 'denied';
                reason = 'Mic permission blocked — using Sim Beat';
            } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
                this.micPermissionError = 'no_device';
                reason = 'No microphone found — using Sim Beat';
            } else {
                this.micPermissionError = 'error';
            }
            console.warn("Unable to capture audio input, falling back to simulated beat:", err);
            this.isListening = false;
            this._setAudioSourceState('sim_no_mic', reason);
            return false;
        }
    }

    stopAudioInput() {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }
        this.isListening = false;
        this.hasStereo = false;
        this.stereoConfidence = 0;
        this.liveSignalLevel = 0;
        this._setAudioSourceState('sim_no_mic', 'Audio input stopped — using Sim Beat');
    }

    async getAudioInputDevices() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.filter(d => d.kind === 'audioinput');
        } catch (e) {
            return [];
        }
    }

    onBeat(callback) {
        this.beatCallbacks.push(callback);
    }

    onDrop(callback) {
        this.dropCallbacks.push(callback);
    }

    onStateChange(callback) {
        this.stateCallbacks.push(callback);
    }

    setMusicalState(newState) {
        if (this.musicalState === newState) return;
        this.previousMusicalState = this.musicalState;
        this.musicalState = newState;
        this.stateTimer = 0;
        this.stateCallbacks.forEach(cb => {
            try { cb(newState, this.previousMusicalState); } catch (e) { console.error("State callback error:", e); }
        });
    }

    triggerDrop() {
        this.setMusicalState('drop');
        this.dropDetected = true;
        this.dropIntensity = 1.0;
        this.dropCallbacks.forEach(cb => {
            try { cb(); } catch (e) { console.error("Drop callback error:", e); }
        });
    }

    recordTapTempo() {
        const now = performance.now();
        this.tapHistory.push(now);
        if (this.tapHistory.length > 5) this.tapHistory.shift();

        if (this.tapHistory.length >= 2) {
            const intervals = [];
            for (let i = 1; i < this.tapHistory.length; i++) {
                intervals.push(this.tapHistory[i] - this.tapHistory[i - 1]);
            }
            const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            if (avgMs > 250 && avgMs < 2000) {
                this.bpm = Math.round(60000 / avgMs);
                this.detectedIntervals = []; // Reset live detector on explicit user tap
            }
        }
        return this.bpm;
    }

    resetBarPhase() {
        if (this.useSimulation) {
            const beatFreq = Math.max(40, this.bpm) / 60;
            const rawBeats = this.simTime * beatFreq;
            const snapped = Math.round((rawBeats + this._simBarOffset) / 4) * 4;
            this._simBarOffset = snapped - rawBeats;
            this.totalBeats = snapped;
        } else {
            this.totalBeats = Math.round(this.totalBeats / 4) * 4;
        }
        this.beatPhase = 0;
    }

    _smoothStem(prev, target, attack, decay) {
        return target > prev ? prev + (target - prev) * attack : prev + (target - prev) * decay;
    }

    _updateLiveStems(dt) {
        if (!this.stemAnalyser || !this.stemFreqData || !this.stemTimeData) return;

        this.stemAnalyser.getByteFrequencyData(this.stemFreqData);
        this.stemAnalyser.getByteTimeDomainData(this.stemTimeData);

        const sampleRate = this.audioCtx.sampleRate || 44100;
        if (!this._hpssBandRanges) {
            this._buildHpssBands(sampleRate);
        }

        // Time-domain RMS, peak & high-frequency detail
        const td = this.stemTimeData;
        let sumSq = 0, peak = 0, fluxTD = 0;
        let prevV = (td[0] - 128) / 128;
        for (let i = 0; i < td.length; i++) {
            const v = (td[i] - 128) / 128;
            sumSq += v * v;
            const av = v < 0 ? -v : v;
            if (av > peak) peak = av;
            fluxTD += Math.abs(v - prevV);
            prevV = v;
        }
        const rms = Math.sqrt(sumSq / td.length);
        const tdRmsJump = Math.max(0, rms - this._prevTdRms);
        const tdPeakJump = Math.max(0, peak - this._prevTdPeak);
        this._prevTdRms = this._prevTdRms * 0.65 + rms * 0.35;
        this._prevTdPeak = this._prevTdPeak * 0.60 + peak * 0.40;
        const tdTransient = Math.min(1.0, (tdRmsJump * 4.5 + tdPeakJump * 1.8) * this.sensitivity);
        const rawComposite = Math.min(1.0, (rms * 1.65 + peak * 0.45) * this.sensitivity);
        const rawDetail = Math.min(1.0, (fluxTD / td.length) * 2.4 * this.sensitivity);

        // Crisp 3-band instantaneous extraction for Serato/Rekordbox unified waveform
        const freq = this.stemFreqData;
        const binHz = (sampleRate * 0.5) / freq.length;
        const getCrispBand = (fMin, fMax) => {
            const sBin = Math.max(0, Math.floor(fMin / binHz));
            const eBin = Math.min(freq.length - 1, Math.ceil(fMax / binHz));
            let bSq = 0, bPeak = 0;
            const count = Math.max(1, eBin - sBin + 1);
            for (let i = sBin; i <= eBin; i++) {
                const v = freq[i] / 255;
                bSq += v * v;
                if (v > bPeak) bPeak = v;
            }
            const bRms = Math.sqrt(bSq / count);
            return Math.min(1.0, (bRms * 0.72 + bPeak * 0.28) * this.sensitivity);
        };

        const rawLow = getCrispBand(20, 250);
        const rawMid = getCrispBand(250, 2500);
        const rawHigh = getCrispBand(2500, Math.min(14000, sampleRate * 0.45));

        // Populate 64 log-spaced HPSS bands + 1-frame positive spectral onset flux
        const nBands = this._hpssBands;
        const ranges = this._hpssBandRanges;
        let risingBands = 0, midWideBandCount = 0;
        for (let b = 0; b < nBands; b++) {
            const r = ranges[b];
            let bSq = 0, bPeak = 0;
            const count = Math.max(1, r.eBin - r.sBin + 1);
            for (let i = r.sBin; i <= r.eBin; i++) {
                const v = freq[i] / 255;
                bSq += v * v;
                if (v > bPeak) bPeak = v;
            }
            const bVal = Math.min(1.25, (Math.sqrt(bSq / count) * 0.7 + bPeak * 0.3) * this.sensitivity);
            this._hpssCurrent[b] = bVal;
            const flx = Math.max(0, bVal - this._hpssPrev[b]);
            this._hpssFlux[b] = flx;
            if (r.fc >= 60 && r.fc <= 8000) {
                midWideBandCount++;
                if (flx > 0.05 && bVal > 0.08) risingBands++;
            }
        }
        const broadbandSpread = midWideBandCount ? (risingBands / midWideBandCount) : 0;

        // Write current frame into 24-frame HPSS ring buffer
        const nFrames = this._hpssFrames;
        const writeOffset = this._hpssWriteIdx * nBands;
        this._hpssHistory.set(this._hpssCurrent, writeOffset);
        const justWrittenIdx = this._hpssWriteIdx;
        this._hpssWriteIdx = (this._hpssWriteIdx + 1) % nFrames;
        if (this._hpssFilled < nFrames) this._hpssFilled++;

        // Causal temporal median, HPSS decomposition & transient-clamped harmonic history for modulation
        const filled = this._hpssFilled;
        const tmp = this._hpssSortTmp;
        const medIdx = Math.floor((filled - 1) * 0.45);
        const modHalf = Math.min(5, Math.max(1, Math.floor(filled / 2)));

        for (let b = 0; b < nBands; b++) {
            for (let f = 0; f < filled; f++) {
                const val = this._hpssHistory[f * nBands + b];
                let j = f - 1;
                while (j >= 0 && tmp[j] > val) {
                    tmp[j + 1] = tmp[j];
                    j--;
                }
                tmp[j + 1] = val;
            }
            const Tb = tmp[medIdx];
            this._hpssTemporal[b] = Tb;

            const j0 = Math.max(0, b - 3);
            const j1 = Math.min(nBands - 1, b + 3);
            let sSum = 0;
            for (let j = j0; j <= j1; j++) sSum += this._hpssCurrent[j];
            const Sb = sSum / (j1 - j0 + 1);

            const Eb = this._hpssCurrent[b];
            const s2 = Sb * Sb;
            const t2 = Tb * Tb;
            const mPerc = s2 / (s2 + t2 + 1e-5);
            const mHarm = 1.0 - mPerc;

            this._hpssPerc[b] = Math.max(0, Eb - 0.82 * Tb) * (0.45 + 0.55 * mPerc) + 0.2 * Eb * mPerc;
            this._hpssHarm[b] = Math.min(Eb, Tb * 1.15) * (0.35 + 0.65 * mHarm) + 0.2 * Eb * mHarm;

            // 2-frame morphological erosion suppresses 1-frame transient spikes in harmonic history
            const prevEb = this._hpssPrev[b];
            const harm2 = Math.min(Eb, prevEb);
            this._harmHistory[justWrittenIdx * nBands + b] = harm2;

            let modAmp = 0;
            if (filled >= 4) {
                let sumNew = 0, sumOld = 0;
                for (let f = 0; f < modHalf; f++) {
                    const iNew = (justWrittenIdx - f + nFrames * 2) % nFrames;
                    const iOld = (justWrittenIdx - modHalf - f + nFrames * 2) % nFrames;
                    sumNew += this._harmHistory[iNew * nBands + b];
                    sumOld += this._harmHistory[iOld * nBands + b];
                }
                const avgNew = sumNew / modHalf;
                const avgOld = sumOld / modHalf;
                modAmp = Math.abs(avgNew - avgOld) / (0.5 * (avgNew + avgOld) + 0.03);
            }
            this._hpssMod[b] = Math.min(1.5, modAmp);
        }

        // Per-band & global stereo Mid/Side confidence weighting
        this._bandMidDom.fill(0.5);
        let midTotal = 0, sideTotal = 0, diffRatio = 0, sideRatio = 0;
        if (this.analyserMid && this.analyserSide && this.midFreqData && this.sideFreqData && this._inputChannelCount >= 2) {
            this.analyserMid.getByteFrequencyData(this.midFreqData);
            this.analyserSide.getByteFrequencyData(this.sideFreqData);

            const msBinHz = (sampleRate * 0.5) / this.midFreqData.length;
            const bStart = Math.max(1, Math.floor(200 / msBinHz));
            const bEnd = Math.min(this.midFreqData.length - 1, Math.ceil(5500 / msBinHz));
            for (let i = bStart; i <= bEnd; i++) {
                midTotal += this.midFreqData[i] / 255;
                sideTotal += this.sideFreqData[i] / 255;
            }
            diffRatio = Math.abs(midTotal - sideTotal) / (midTotal + sideTotal + 1e-4);
            sideRatio = sideTotal / (midTotal + 1e-4);
            const isStereoFrame = (diffRatio > 0.06 && sideRatio > 0.04 && sideRatio < 2.2);
            this.stereoConfidence += ((isStereoFrame ? 1.0 : 0.0) - this.stereoConfidence) * Math.min(1.0, dt * 3.0);
            this.hasStereo = this.stereoConfidence > 0.35;

            for (let b = 0; b < nBands; b++) {
                const r = ranges[b];
                let mE = 0, sE = 0;
                for (let k = r.msSBin; k <= r.msEBin; k++) {
                    mE += this.midFreqData[k];
                    sE += this.sideFreqData[k];
                }
                this._bandMidDom[b] = (mE + sE > 1) ? (mE / (mE + sE + 1e-4)) : 0.5;
            }
        } else {
            this.stereoConfidence *= Math.exp(-dt * 4.0);
            this.hasStereo = false;
        }

        // Competitive Exclusive Partitioning across 5 stems:
        // Drums (transient onset flux + HPSS perc) | Bass | Vocals (pure harmonic formants, perc-suppressed) | Synths | Hi-Hats
        let kickSum = 0, kickMax = 0, kickCnt = 0;
        let snareSum = 0, snareMax = 0, snareCnt = 0;
        let bassAcc = 0, bassCnt = 0;
        let vocalAcc = 0, vocalMidBandCnt = 0;
        let synthAcc = 0, synthBandCnt = 0;
        let hatAcc = 0, hatCnt = 0;

        let maxProm = 0, sumProm = 0, maxMod = 0, sumMod = 0;
        let maxPVocal = 0, maxBandRatio = 0;
        let sumMidDomVoc = 0, sumSustFrac = 0, sumVocBandE = 0, sumLocalFloor = 0;

        const stereoConf = this.stereoConfidence;
        for (let b = 0; b < nBands; b++) {
            const fc = ranges[b].fc;
            const Eb = this._hpssCurrent[b];
            const Tb = this._hpssTemporal[b];
            const Pb = this._hpssPerc[b];
            const Hb = this._hpssHarm[b];
            const Modb = this._hpssMod[b];
            const Fluxb = this._hpssFlux[b];
            const midDom = this._bandMidDom[b];

            if (fc >= 35 && fc <= 170) {
                const kVal = Math.max(0, Eb - 0.78 * Tb) * 0.85 + Fluxb * 1.75 + Pb * 0.55;
                kickSum += kVal;
                if (kVal > kickMax) kickMax = kVal;
                kickCnt++;
            }
            if (fc >= 180 && fc <= 2800) {
                const sVal = Pb * 0.85 + Fluxb * 1.90;
                snareSum += sVal;
                if (sVal > snareMax) snareMax = sVal;
                snareCnt++;
            }

            if (fc >= 25 && fc <= 220) {
                bassAcc += 0.68 * Hb + 0.32 * Eb;
                bassCnt++;
            }

            if (fc >= 180 && fc <= 6000) {
                synthBandCnt++;
                let pVocal = 0;
                if (fc >= 260 && fc <= 3500) {
                    vocalMidBandCnt++;
                    const cUp = Math.min(1.0, Math.max(0.0, (fc - 260) / 190));
                    const cDn = Math.min(1.0, Math.max(0.0, (3500 - fc) / 1100));
                    const formantBell = cUp * cDn;

                    // 2-frame morphological harmonic envelope + temporal sustain suppresses drum hits without hurting vibrato vocals
                    const prevEb = this._hpssPrev[b];
                    const sustFrac = Math.min(1.0, Math.max(0.0, (Tb / (Eb + 0.02) - 0.12) * 1.65));
                    const vocalBandE = Math.min(Hb, Math.min(Eb, prevEb) * 1.15) * (0.25 + 0.75 * sustFrac);

                    const f0 = Math.max(0, b - 5);
                    const f1 = Math.min(nBands - 1, b + 5);
                    let localSum = 0;
                    for (let j = f0; j <= f1; j++) localSum += this._hpssHarm[j];
                    const localFloor = localSum / (f1 - f0 + 1);

                    const bandRatio = vocalBandE / (localFloor + 0.015);
                    const promScore = Math.min(1.0, Math.max(0.0, (bandRatio - 1.18) * 1.90));
                    const modScore = Math.min(1.0, Math.max(0.0, (Modb - 0.04) * 5.2));
                    const formantGate = 0.15 + 0.85 * promScore;
                    const sMono = formantBell * (0.62 * promScore + 0.38 * modScore) * formantGate;

                    const stereoCue = Math.min(1.0, Math.max(0.0, (midDom - 0.52) * 4.5));
                    const stereoPen = (midDom < 0.50) ? 0.20 : ((midDom < 0.56) ? (0.20 + 0.80 * (midDom - 0.50) / 0.06) : 1.0);
                    const sStereo = formantBell * (0.44 * promScore + 0.24 * modScore + 0.32 * stereoCue) * stereoPen * formantGate;

                    const rawProb = sMono * (1.0 - stereoConf) + sStereo * stereoConf;
                    const t = Math.min(1.0, Math.max(0.0, (rawProb - 0.14) / (0.46 - 0.14)));
                    pVocal = t * t * (3.0 - 2.0 * t);
                    vocalAcc += vocalBandE * pVocal;

                    if (promScore > maxProm) maxProm = promScore;
                    sumProm += promScore;
                    if (modScore > maxMod) maxMod = modScore;
                    sumMod += modScore;
                    if (pVocal > maxPVocal) maxPVocal = pVocal;
                    if (bandRatio > maxBandRatio) maxBandRatio = bandRatio;
                    sumMidDomVoc += midDom;
                    sumSustFrac += sustFrac;
                    sumVocBandE += vocalBandE;
                    sumLocalFloor += localFloor;
                }
                const stereoSideBoost = 1.0 + stereoConf * Math.max(0.0, 0.65 - midDom) * 1.4;
                synthAcc += Hb * (1.0 - pVocal) * stereoSideBoost;
            }

            if (fc >= 4200 && fc <= 16000) {
                hatAcc += 0.50 * Eb + 0.50 * Pb;
                hatCnt++;
            }
        }

        const kickScore = (kickCnt ? kickSum / kickCnt : 0) * 0.55 + kickMax * 0.65;
        const snareBroadGate = Math.min(1.0, Math.max(0.06, (broadbandSpread - 0.12) * 2.6));
        const snareScore = ((snareCnt ? snareSum / snareCnt : 0) * 0.55 + snareMax * 0.65) * snareBroadGate;

        const vocalNorm = vocalMidBandCnt ? (vocalAcc / Math.max(4.0, vocalMidBandCnt * 0.28)) : 0;
        const synthNorm = synthBandCnt ? (synthAcc / synthBandCnt) : 0;

        // Frame-level Vocal Gate & broadband drum ducking
        const vocalRatio = vocalNorm / (vocalNorm + synthNorm + 0.05);
        const vocalGateTarget = Math.min(1.0, Math.max(0.0, (vocalRatio - 0.12) * 3.0));
        this._vocalGateSmooth += (vocalGateTarget - this._vocalGateSmooth) * Math.min(1.0, dt * 10.0);

        const broadbandDrumDuck = 1.0 - 0.75 * Math.min(1.0, Math.max(0.0, (broadbandSpread - 0.28) * 2.5) * Math.min(1.0, snareScore * 1.4));
        const tdGate = Math.min(1.0, Math.max(0.18, broadbandSpread * 2.5 + kickScore));

        const rawDrums = Math.min(1.0, kickScore * 1.25 + snareScore * 1.20 + tdTransient * 0.55 * tdGate);
        const rawBass = Math.min(1.0, (bassCnt ? bassAcc / bassCnt : 0) * 1.18);
        const rawVocals = Math.min(1.0, vocalNorm * 1.55 * this._vocalGateSmooth * broadbandDrumDuck);
        const rawSynths = Math.min(1.0, synthNorm * 1.35);
        const rawHats = Math.min(1.0, (hatCnt ? hatAcc / hatCnt : 0) * 1.45);

        const s = this.stems;
        s.drums = this._smoothStem(s.drums, rawDrums, 0.96, 0.40);
        s.bass = this._smoothStem(s.bass, rawBass, 0.72, 0.22);
        s.vocals = this._smoothStem(s.vocals, rawVocals, 0.45, 0.22);
        s.synths = this._smoothStem(s.synths, rawSynths, 0.62, 0.20);
        s.hats = this._smoothStem(s.hats, rawHats, 0.85, 0.34);
        s.air = s.hats;

        s.low = this._smoothStem(s.low, rawLow, 0.78, 0.26);
        s.mid = this._smoothStem(s.mid, rawMid, 0.74, 0.24);
        s.high = this._smoothStem(s.high, rawHigh, 0.78, 0.26);
        s.composite = this._smoothStem(s.composite, rawComposite, 0.82, 0.28);
        s.detail = this._smoothStem(s.detail, rawDetail, 0.75, 0.25);

        const vCnt = Math.max(1, vocalMidBandCnt);
        this.lastStemDiag = {
            dt,
            rms,
            peak,
            fluxTDNorm: fluxTD / td.length,
            tdTransient,
            tdGate,
            stereoConf,
            midTotal,
            sideTotal,
            diffRatio,
            sideRatio,
            kickScore,
            snareScore,
            snareBroadGate,
            broadbandSpread,
            broadbandDrumDuck,
            vocalNorm,
            synthNorm,
            vocalRatio,
            vocalGateSmooth: this._vocalGateSmooth,
            maxProm,
            meanProm: sumProm / vCnt,
            maxMod,
            meanMod: sumMod / vCnt,
            maxPVocal,
            maxBandRatio,
            meanMidDomVoc: sumMidDomVoc / vCnt,
            meanSustFrac: sumSustFrac / vCnt,
            meanVocBandE: sumVocBandE / vCnt,
            meanLocalFloor: sumLocalFloor / vCnt,
            rawDrums,
            rawBass,
            rawVocals,
            rawSynths,
            rawHats
        };

        this._hpssPrev.set(this._hpssCurrent);
    }

    _updateSimStems(dt, beatPos, beatSubPhase, beatFreq) {
        const t = this.simTime;
        const beatIdx = Math.floor(beatPos);
        const sixteenth = (beatPos * 4) % 1.0;
        const step16 = Math.floor(beatPos * 4) % 16;
        const barIdx = Math.floor(beatPos / 4);
        const beatInBar = beatPos % 4;
        const offHat = Math.pow(Math.max(0, 1 - ((beatSubPhase + 0.5) % 1.0)), 4.5);

        // Bassline 16th groove table & vocal phrase contour
        const bassPattern = [0.22, 0.40, 0.88, 0.58, 0.26, 0.48, 0.92, 0.68, 0.22, 0.45, 0.96, 0.62, 0.30, 0.76, 0.86, 0.46];
        const synthArpPattern = [0.78, 0.18, 0.52, 0.90, 0.25, 0.72, 0.38, 0.85, 0.65, 0.22, 0.80, 0.42, 0.30, 0.88, 0.55, 0.35];

        let rawDrums = 0, rawBass = 0, rawVocals = 0, rawSynths = 0, rawAir = 0;

        if (beatPos < 32) {
            // GROOVE
            const kick = Math.pow(Math.max(0, 1 - beatSubPhase), 4.0);
            const snare = (beatIdx % 2 === 1) ? Math.pow(Math.max(0, 1 - beatSubPhase), 3.0) * 0.82 : 0;
            rawDrums = Math.min(1.0, kick * 0.72 + snare * 0.55 + offHat * 0.32);

            const bassGate = Math.pow(Math.max(0, 1 - sixteenth), 1.35);
            rawBass = Math.min(1.0, bassPattern[step16] * (0.45 + 0.55 * bassGate) * 0.90 + kick * 0.25);

            // Phrased vocals: sing bars 0, 1 and 3 of each 4-bar group, breathe in bar 2
            const barMod = barIdx % 4;
            const phraseActive = (barMod !== 2);
            const wordEnv = 0.5 + 0.5 * Math.sin(beatInBar * Math.PI * 1.5);
            const vibrato = 0.85 + 0.15 * Math.sin(t * 28.0);
            rawVocals = phraseActive ? Math.min(1.0, (0.35 + 0.52 * wordEnv) * vibrato * Math.sin(Math.min(1, beatInBar / 3.8) * Math.PI)) : 0.08;

            const arpGate = Math.pow(Math.max(0, 1 - sixteenth), 1.8);
            rawSynths = synthArpPattern[step16] * (0.35 + 0.65 * arpGate) * 0.78;

            const downCrash = (barIdx % 4 === 0 && beatInBar < 2.5) ? Math.exp(-beatInBar * 1.6) * 0.55 : 0;
            rawAir = Math.min(1.0, offHat * 0.72 + downCrash + 0.08);
        } else if (beatPos < 48) {
            // BREAKDOWN: drums & bass drop out; soaring vocals, lush synths & atmospheric air shimmer
            const prog = (beatPos - 32) / 16;
            rawDrums = 0.04;
            rawBass = 0.06;
            const swell = 0.55 + 0.38 * Math.sin(beatPos * Math.PI * 0.5);
            const vibrato = 0.86 + 0.14 * Math.sin(t * 26.0);
            rawVocals = Math.min(1.0, swell * vibrato * (0.65 + 0.35 * Math.sin(t * 1.4)));
            rawSynths = Math.min(1.0, (0.48 + 0.34 * Math.sin(t * 1.8) + 0.18 * synthArpPattern[step16]) * (0.75 + 0.25 * prog));
            rawAir = Math.min(1.0, 0.22 + 0.28 * Math.sin(beatPos * Math.PI * 0.25) + prog * 0.25);
        } else if (beatPos < 63) {
            // BUILDUP: accelerating snare roll, rising synth chord + sweep riser
            const prog = (beatPos - 48) / 15;
            let rollRate = 1.0;
            if (beatPos >= 52 && beatPos < 56) rollRate = 2.0;
            else if (beatPos >= 56 && beatPos < 60) rollRate = 4.0;
            else if (beatPos >= 60) rollRate = 8.0;
            const snareEnv = Math.pow(Math.max(0, 1 - ((t * beatFreq * rollRate) % 1.0)), 2.6);

            rawDrums = Math.min(1.0, snareEnv * (0.55 + 0.45 * prog));
            rawBass = 0.08 + 0.12 * prog;
            rawVocals = Math.max(0.12, (1.0 - prog * 0.55) * (0.45 + 0.4 * Math.sin(t * 3.1)));
            rawSynths = Math.min(1.0, 0.35 + prog * 0.58 + snareEnv * 0.15);
            rawAir = Math.min(1.0, 0.20 + Math.pow(prog, 1.4) * 0.80);
        } else if (beatPos < 64) {
            // PRE-DROP VACUUM
            rawDrums = 0.02;
            rawBass = 0.02;
            rawVocals = 0.14;
            rawSynths = 0.06;
            rawAir = 0.12;
        } else {
            // DROP: massive kick/sub + heavy bassline + drop synths + crash
            const dropBeat = beatPos - 64;
            const kick = Math.pow(Math.max(0, 1 - beatSubPhase), 2.8);
            const snare = (beatIdx % 2 === 1) ? Math.pow(Math.max(0, 1 - beatSubPhase), 2.5) * 0.95 : 0;
            rawDrums = Math.min(1.0, kick * 0.85 + snare * 0.65 + offHat * 0.42);

            const bassGate = Math.pow(Math.max(0, 1 - sixteenth), 1.2);
            rawBass = Math.min(1.0, kick * 0.45 + bassPattern[step16] * (0.55 + 0.45 * bassGate) * 0.95);

            const barMod = Math.floor(dropBeat / 4) % 2;
            rawVocals = (barMod === 1) ? Math.min(1.0, 0.42 + 0.40 * Math.abs(Math.sin(beatInBar * Math.PI * 0.75))) : 0.18;

            const stab = (step16 % 3 === 0) ? 0.95 : synthArpPattern[step16];
            rawSynths = Math.min(1.0, stab * (0.55 + 0.45 * Math.pow(1 - sixteenth, 1.5)));

            const crash = Math.exp(-dropBeat * 0.45) * 0.85;
            rawAir = Math.min(1.0, offHat * 0.80 + crash + 0.15);
        }

        const scale = Math.min(1.8, Math.max(0.2, this.sensitivity));
        rawDrums = Math.min(1.0, rawDrums * scale);
        rawBass = Math.min(1.0, rawBass * scale);
        rawVocals = Math.min(1.0, rawVocals * scale);
        rawSynths = Math.min(1.0, rawSynths * scale);
        rawAir = Math.min(1.0, rawAir * scale);

        const s = this.stems;
        s.drums = this._smoothStem(s.drums, rawDrums, 0.85, 0.34);
        s.bass = this._smoothStem(s.bass, rawBass, 0.82, 0.30);
        s.vocals = this._smoothStem(s.vocals, rawVocals, 0.75, 0.28);
        s.synths = this._smoothStem(s.synths, rawSynths, 0.78, 0.30);
        s.hats = this._smoothStem(s.hats, rawAir, 0.84, 0.34);
        s.air = s.hats;

        const rawLow = Math.min(1.0, s.bass * 0.72 + s.drums * 0.42);
        const rawMid = Math.min(1.0, Math.max(s.vocals, s.synths) * 0.65 + (s.vocals + s.synths) * 0.28 + s.drums * 0.22);
        const rawHigh = Math.min(1.0, s.hats * 0.78 + s.drums * 0.28 + s.synths * 0.18);
        const rawComp = Math.min(1.0, rawLow * 0.42 + rawMid * 0.38 + rawHigh * 0.28);
        const rawDet = Math.min(1.0, s.hats * 0.65 + s.drums * 0.35);

        s.low = rawLow;
        s.mid = rawMid;
        s.high = rawHigh;
        s.composite = rawComp;
        s.detail = rawDet;
    }

    update(dt = 0.016) {
        this.timeSinceLastBeat += dt;
        this.isBeat = false;
        this.dropDetected = false;

        // Track continuous beat count & beat phase from BPM
        const beatInterval = 60 / Math.max(40, this.bpm);

        // Always-On Live Signal Monitoring + Hysteresis Fallback to Sim Beat
        if (this.isListening && this.analyser) {
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.liveSignalLevel *= Math.exp(-dt * 4.0);
                this.micPermissionError = 'gesture_needed';
                this._setAudioSourceState('sim_no_mic', 'Click anywhere to enable live mic (Sim Beat)');
            } else {
                this.analyser.getByteTimeDomainData(this.timeDomainData);
                let sumSqMic = 0, peakMic = 0;
                for (let i = 0; i < this.timeDomainData.length; i++) {
                    const v = (this.timeDomainData[i] - 128) / 128;
                    sumSqMic += v * v;
                    const av = v < 0 ? -v : v;
                    if (av > peakMic) peakMic = av;
                }
                const rawMicRms = Math.sqrt(sumSqMic / this.timeDomainData.length);
                this.liveSignalLevel = this.liveSignalLevel * 0.8 + Math.min(1.0, rawMicRms * 6.5) * 0.2;

                const hasSignal = (rawMicRms > 0.011 || peakMic > 0.045);
                const isSilent = (rawMicRms < 0.0055 && peakMic < 0.022);

                if (hasSignal) {
                    this._silenceTimer = 0;
                    this._signalDetectTimer += dt;
                    if (this.audioSourceState !== 'live_music' && this._signalDetectTimer >= 0.16) {
                        const msg = this.hasStereo ? 'Live music detected (Stereo)' : 'Live music detected';
                        this._setAudioSourceState('live_music', msg);
                    }
                } else if (isSilent) {
                    this._signalDetectTimer = 0;
                    this._silenceTimer += dt;
                    if (this.audioSourceState === 'live_music' && this._silenceTimer >= 4.2) {
                        this._setAudioSourceState('sim_no_signal', 'No music detected — using Sim Beat');
                    } else if (this.audioSourceState === 'connecting' && this._silenceTimer >= 0.6) {
                        this._setAudioSourceState('sim_no_signal', 'Listening — no music detected (Sim Beat)');
                    }
                }
            }
        } else {
            this.liveSignalLevel *= Math.exp(-dt * 4.0);
        }

        if (this.isListening && this.analyser && this.audioSourceState === 'live_music') {
            this.totalBeats += dt / beatInterval;
            this.beatPhase = this.totalBeats % 1.0;

            this.analyser.getByteFrequencyData(this.frequencyData);
            // timeDomainData already populated cleanly above for this frame

            const sampleRate = this.audioCtx.sampleRate;
            const binSize = (sampleRate / 2) / this.frequencyData.length;

            const getBandAverage = (minFreq, maxFreq) => {
                const startBin = Math.max(0, Math.floor(minFreq / binSize));
                const endBin = Math.min(this.frequencyData.length - 1, Math.ceil(maxFreq / binSize));
                if (startBin >= endBin) return this.frequencyData[startBin] / 255;
                let sum = 0;
                for (let i = startBin; i <= endBin; i++) {
                    sum += this.frequencyData[i];
                }
                return (sum / (endBin - startBin + 1)) / 255;
            };

            const rawSub = Math.min(1.0, getBandAverage(20, 80) * this.sensitivity);
            const rawBass = Math.min(1.0, getBandAverage(80, 250) * this.sensitivity);
            const rawMids = Math.min(1.0, getBandAverage(250, 2500) * this.sensitivity);
            const rawHighs = Math.min(1.0, getBandAverage(2500, 10000) * this.sensitivity);
            const rawEnergy = (rawSub * 0.35 + rawBass * 0.35 + rawMids * 0.2 + rawHighs * 0.1);

            this.rawSub = rawSub;
            this.rawBass = rawBass;
            this.rawHighs = rawHighs;

            // Attack/Decay Envelope Smoothing (fast attack, organic smooth release)
            const smooth = (prev, target, attack = 0.7, decay = 0.15) => {
                return target > prev ? prev + (target - prev) * attack : prev + (target - prev) * decay;
            };

            this.sub = smooth(this.sub, rawSub, 0.7, 0.15);
            this.bass = smooth(this.bass, rawBass, 0.65, 0.12);
            this.mids = smooth(this.mids, rawMids, 0.45, 0.1);
            this.highs = smooth(this.highs, rawHighs, 0.55, 0.18);
            this.energy = smooth(this.energy, rawEnergy, 0.5, 0.1);

            // 1. Feature Extraction: Spectral Centroid (Timbre Brightness / Filter Sweeps)
            let weightedSum = 0;
            let totalMag = 0;
            for (let i = 0; i < this.frequencyData.length; i++) {
                const mag = this.frequencyData[i];
                weightedSum += i * mag;
                totalMag += mag;
            }
            const rawCentroid = totalMag > 0 ? (weightedSum / (totalMag * this.frequencyData.length)) : 0;
            this.spectralCentroid = this.spectralCentroid * 0.88 + rawCentroid * 0.12;

            // 2. Feature Extraction: Spectral Flux (Detection of fast rolls & sweeping filters)
            if (this.prevSpectrum) {
                let fluxSum = 0;
                for (let i = 0; i < this.frequencyData.length; i++) {
                    const diff = (this.frequencyData[i] - this.prevSpectrum[i]) / 255;
                    if (diff > 0) fluxSum += diff;
                }
                const rawFlux = fluxSum / (this.frequencyData.length * 0.2);
                this.spectralFlux = this.spectralFlux * 0.75 + Math.min(1.0, rawFlux) * 0.25;
            } else {
                this.prevSpectrum = new Uint8Array(this.frequencyData.length);
            }
            this.prevSpectrum.set(this.frequencyData);

            // 3. Feature Extraction: Energy History & Energy Slope (Loudness Trend)
            this.energyHistory.push(this.energy);
            if (this.energyHistory.length > this.energyHistoryMax) this.energyHistory.shift();

            if (this.energyHistory.length >= 30) {
                const half = Math.floor(this.energyHistory.length / 2);
                let oldSum = 0, newSum = 0;
                for (let i = 0; i < half; i++) oldSum += this.energyHistory[i];
                for (let i = half; i < this.energyHistory.length; i++) newSum += this.energyHistory[i];
                this.energySlope = (newSum / (this.energyHistory.length - half)) - (oldSum / half);
            }

            // 4. Feature Extraction: Low Frequency Energy Ratio
            const lowEnergy = this.sub * 0.6 + this.bass * 0.4;
            this.lowRatio = this.energy > 0.04 ? Math.min(1.0, lowEnergy / Math.max(0.01, this.energy)) : 0.5;

            // 5. Transient Beat Detection on Sub + Bass
            const instantBassEnergy = rawSub * 0.6 + rawBass * 0.4;
            this.bassHistory.push(instantBassEnergy);
            if (this.bassHistory.length > this.historySize) this.bassHistory.shift();

            const avgBass = this.bassHistory.reduce((a, b) => a + b, 0) / this.bassHistory.length;
            const variance = this.bassHistory.reduce((a, b) => a + Math.pow(b - avgBass, 2), 0) / this.bassHistory.length;
            const dynamicThreshold = (-15 * variance) + 1.35; // Adaptive sensitivity

            const nowTs = performance.now();
            if (instantBassEnergy > avgBass * Math.max(1.15, dynamicThreshold) && instantBassEnergy > 0.18 && this.timeSinceLastBeat > 0.22) {
                this.isBeat = true;
                const interval = this.timeSinceLastBeat;
                this.timeSinceLastBeat = 0;
                this.beatConfidence = Math.min(1.0, (instantBassEnergy - avgBass) * 2.5);

                this.onsetHistory.push(nowTs);

                // Auto-estimate BPM from live inter-beat intervals
                if (interval >= 0.28 && interval <= 2.2) {
                    let normInterval = interval;
                    while (normInterval < 0.35) normInterval *= 2;
                    while (normInterval > 0.86) normInterval /= 2;

                    this.detectedIntervals.push(normInterval);
                    if (this.detectedIntervals.length > 8) this.detectedIntervals.shift();

                    if (this.detectedIntervals.length >= 4) {
                        const sorted = this.detectedIntervals.slice().sort((a, b) => a - b);
                        const medianInterval = sorted[Math.floor(sorted.length / 2)];
                        const rawBpm = Math.round(60 / medianInterval);
                        if (rawBpm >= 65 && rawBpm <= 180) {
                            this.bpm = Math.round(this.bpm * 0.82 + rawBpm * 0.18);
                        }
                    }
                }

                this.beatCallbacks.forEach(cb => cb(this.beatConfidence));
            }

            // Clean old onsets (> 2000ms) and calculate onset density
            this.onsetHistory = this.onsetHistory.filter(t => nowTs - t < 2000);
            this.onsetDensity = this.onsetHistory.length / 2.0;

            // 6. Real-Time Musical Structure State Machine & Stem Extraction
            this.updateMusicalState(dt);
            this._updateLiveStems(dt);

        } else if (this.useSimulation) {
            // Simulated 80-beat EDM cycle:
            // 32 beats Groove -> 16 beats Breakdown -> 15 beats Buildup -> 1 beat Pre-Drop -> 16 beats Drop
            this.simTime += dt;
            const beatFreq = this.bpm / 60; // beats per sec
            const totalBeatsInCycle = 80;
            this.totalBeats = this.simTime * beatFreq + this._simBarOffset;
            this.beatPhase = ((this.totalBeats % 1.0) + 1.0) % 1.0;

            const beatPos = (this.simTime * beatFreq) % totalBeatsInCycle;
            const beatSubPhase = (this.simTime * beatFreq) % 1.0;

            const kickBase = Math.pow(Math.max(0, 1 - beatSubPhase), 3.5);
            const hatBase  = Math.pow(Math.max(0, 1 - ((this.simTime * beatFreq + 0.5) % 1.0)), 4.0);

            if (beatPos < 32) {
                // Phase 1: GROOVE (Beats 0..31)
                this.setMusicalState('groove');
                this.tension = Math.max(0.05, this.tension - dt * 0.15);
                this.buildupProgress = 0.0;
                this.dropIntensity = Math.max(0.0, this.dropIntensity - dt * 0.4);

                const bassLine = 0.35 + 0.3 * Math.sin(this.simTime * beatFreq * Math.PI * 4);
                this.sub = kickBase * 0.92 * this.sensitivity;
                this.bass = (kickBase * 0.7 + bassLine * 0.3) * this.sensitivity;
                this.mids = bassLine * 0.6 * this.sensitivity;
                this.highs = hatBase * 0.65 * this.sensitivity;
                this.energy = (this.sub * 0.4 + this.bass * 0.3 + this.mids * 0.2 + this.highs * 0.1);
                this.spectralCentroid = 0.25 + 0.05 * Math.sin(this.simTime * 0.8);

                if (kickBase > 0.88 && this.timeSinceLastBeat > 0.35) {
                    this.isBeat = true;
                    this.timeSinceLastBeat = 0;
                    this.beatConfidence = 0.9;
                    this.beatCallbacks.forEach(cb => cb(0.9));
                }

            } else if (beatPos < 48) {
                // Phase 2: BREAKDOWN (Beats 32..47)
                this.setMusicalState('breakdown');
                const prog = (beatPos - 32) / 16;
                this.tension = 0.15 + prog * 0.35;
                this.buildupProgress = 0.0;
                this.dropIntensity = 0.0;

                // Kick and heavy bass vanish; ethereal ambient pads and arpeggios
                const pad = 0.4 + 0.3 * Math.sin(this.simTime * 1.8);
                const arp = 0.35 + 0.25 * Math.sin(this.simTime * beatFreq * Math.PI * 2);
                this.sub = 0.03 * this.sensitivity;
                this.bass = 0.05 * this.sensitivity;
                this.mids = pad * this.sensitivity;
                this.highs = (arp * 0.6 + 0.2) * this.sensitivity;
                this.energy = (this.sub * 0.4 + this.bass * 0.3 + this.mids * 0.2 + this.highs * 0.1);
                this.spectralCentroid = 0.35 + prog * 0.15;

            } else if (beatPos < 63) {
                // Phase 3: BUILDUP (Beats 48..62)
                this.setMusicalState('buildup');
                const prog = (beatPos - 48) / 15;
                this.tension = 0.50 + prog * 0.48;
                this.buildupProgress = prog;

                // Accelerating snare / clap roll
                let rollRate = 1.0; // quarter notes
                if (beatPos >= 52 && beatPos < 56) rollRate = 2.0;       // 8ths
                else if (beatPos >= 56 && beatPos < 60) rollRate = 4.0;  // 16ths
                else if (beatPos >= 60) rollRate = 8.0;                  // 32nds

                const snareEnv = Math.pow(Math.max(0, 1 - (this.simTime * beatFreq * rollRate % 1.0)), 2.8);
                const riser = prog; // High-pass sweep upward

                this.sub = 0.05 * this.sensitivity;
                this.bass = (snareEnv * 0.35 * prog) * this.sensitivity;
                this.mids = (snareEnv * 0.75 + riser * 0.6) * this.sensitivity;
                this.highs = (snareEnv * 0.55 + riser * 0.8) * this.sensitivity;
                this.energy = (this.sub * 0.2 + this.bass * 0.2 + this.mids * 0.35 + this.highs * 0.25);
                this.spectralCentroid = 0.35 + riser * 0.55; // Audible rising cutoff
                this.onsetDensity = rollRate * (this.bpm / 60);

                if (snareEnv > 0.85 && this.timeSinceLastBeat > (0.8 / (beatFreq * rollRate))) {
                    this.isBeat = true;
                    this.timeSinceLastBeat = 0;
                    this.beatConfidence = 0.6 + prog * 0.35;
                    this.beatCallbacks.forEach(cb => cb(this.beatConfidence));
                }

            } else if (beatPos < 64) {
                // Phase 4: PRE-DROP GAP (Beats 63..64)
                this.setMusicalState('pre_drop');
                this.tension = 1.0;
                this.buildupProgress = 1.0;
                // Sudden vacuum / tape stop silence
                this.sub = 0.0;
                this.bass = 0.0;
                this.mids = 0.06;
                this.highs = 0.04;
                this.energy = 0.03;
                this.spectralCentroid = 0.1;

            } else {
                // Phase 5: DROP (Beats 64..79)
                if (this.musicalState !== 'drop') {
                    this.triggerDrop();
                }
                const dropProg = (beatPos - 64) / 16;
                this.tension = Math.max(0.0, 1.0 - dropProg * 1.2);
                this.buildupProgress = 0.0;
                this.dropIntensity = Math.max(0.0, this.dropIntensity - dt * 0.3);

                // Huge sub slam + punchy kick + massive synths
                const kickSlam = Math.pow(Math.max(0, 1 - beatSubPhase), 2.5);
                const subSlam  = Math.pow(Math.max(0, 1 - beatSubPhase), 1.8) * 0.95;
                const synDrop  = 0.5 + 0.45 * Math.sin(this.simTime * beatFreq * Math.PI * 4);

                this.sub = (subSlam * 0.98 + (1 - dropProg) * 0.2) * this.sensitivity;
                this.bass = (kickSlam * 0.9 + synDrop * 0.4) * this.sensitivity;
                this.mids = synDrop * 0.85 * this.sensitivity;
                this.highs = (hatBase * 0.8 + 0.3) * this.sensitivity;
                this.energy = (this.sub * 0.45 + this.bass * 0.3 + this.mids * 0.15 + this.highs * 0.1);
                this.spectralCentroid = 0.45 + 0.15 * Math.sin(this.simTime * 2.0);

                if (kickSlam > 0.85 && this.timeSinceLastBeat > 0.32) {
                    this.isBeat = true;
                    this.timeSinceLastBeat = 0;
                    this.beatConfidence = 1.0;
                    this.beatCallbacks.forEach(cb => cb(1.0));
                }
            }

            this._updateSimStems(dt, beatPos, beatSubPhase, beatFreq);
        }

        if (this._diagRec && this._diagRec.active) {
            this._captureStemDiagFrame(dt);
        }
    }

    updateMusicalState(dt) {
        this.stateTimer += dt;
        this.dropIntensity = Math.max(0.0, this.dropIntensity - dt * 0.35);

        switch (this.musicalState) {
            case 'groove':
                this.tension = Math.max(0.05, this.tension - dt * 0.12);
                this.buildupProgress = 0.0;
                // Breakdown detector: Sub/bass vanishes while vocal/synth mids or highs remain
                if (this.lowRatio < 0.24 && this.energy < 0.48 && (this.mids + this.highs) > 0.15) {
                    this.breakdownWatchTimer += dt;
                    if (this.breakdownWatchTimer > 1.2) {
                        this.setMusicalState('breakdown');
                        this.breakdownWatchTimer = 0;
                    }
                } else {
                    this.breakdownWatchTimer = Math.max(0, this.breakdownWatchTimer - dt * 0.5);
                }

                // Buildup detector: Accelerating onsets or positive energy gradient + rising spectral centroid
                if (this.energySlope > 0.08 && (this.spectralCentroid > 0.18 || this.onsetDensity > 2.8) && this.stateTimer > 3.0) {
                    this.setMusicalState('buildup');
                }
                break;

            case 'breakdown':
                this.tension = Math.min(0.65, this.tension + dt * 0.07);
                // Transition to buildup if riser or rolls begin
                if (this.energySlope > 0.06 || this.onsetDensity > 2.5 || this.spectralCentroid > 0.25) {
                    this.setMusicalState('buildup');
                }
                // Transition back to groove if kick returns normally without drop
                if (this.lowRatio > 0.55 && this.sub > 0.45 && this.stateTimer > 2.0) {
                    this.setMusicalState('groove');
                }
                break;

            case 'buildup':
                this.tension = Math.min(1.0, this.tension + dt * 0.14);
                this.buildupProgress = this.tension;
                // Pre-drop gap detection: sudden cut of sub/bass and energy drop after high tension
                if (this.tension > 0.65 && this.energy < 0.22 && this.lowRatio < 0.20) {
                    this.setMusicalState('pre_drop');
                }
                // Direct drop detection: massive sub slam following buildup
                else if (this.tension > 0.50 && this.rawSub > 0.72 && this.energy > 0.62) {
                    this.triggerDrop();
                }
                // Timeout safety (25s buildup without drop decays back to groove)
                else if (this.stateTimer > 25.0) {
                    this.setMusicalState('groove');
                }
                break;

            case 'pre_drop':
                this.tension = 1.0;
                // Drop hit: sudden sub bass explosion
                if (this.rawSub > 0.65 || (this.energy > 0.58 && this.stateTimer > 0.1)) {
                    this.triggerDrop();
                }
                // If silence lingers too long, fall back to breakdown
                else if (this.stateTimer > 2.5) {
                    this.setMusicalState('breakdown');
                }
                break;

            case 'drop':
                this.tension = Math.max(0.0, this.tension - dt * 0.35);
                // After drop shockwave, settle into heavy groove
                if (this.stateTimer > 5.0) {
                    this.setMusicalState('groove');
                }
                break;
        }
    }

    startStemDiagLog(maxSec = 30, onFinish = null) {
        const rec = this._diagRec;
        rec.frames = [];
        rec.markers = [];
        rec.maxSec = Math.max(5, Math.min(60, Number(maxSec) || 30));
        rec.maxFrames = Math.min(4000, Math.round(rec.maxSec * 70));
        rec.startedAtPerf = performance.now();
        rec.startedAtIso = new Date().toISOString();
        rec.onFinish = (typeof onFinish === 'function') ? onFinish : null;
        rec.active = true;
        rec.markers.push({ t: 0, frame: 0, tag: 'source:' + this.audioSourceState });
        return true;
    }

    markStemDiag(tag) {
        if (!this._diagRec || !this._diagRec.active) return null;
        const t = Math.round(Math.max(0, (performance.now() - this._diagRec.startedAtPerf) / 1000) * 1000) / 1000;
        const marker = { t, frame: this._diagRec.frames.length, tag: String(tag || 'mark') };
        this._diagRec.markers.push(marker);
        return marker;
    }

    getStemDiagStatus() {
        const rec = this._diagRec;
        const elapsedSec = (rec && rec.active) ? Math.max(0, (performance.now() - rec.startedAtPerf) / 1000) : 0;
        return {
            active: !!(rec && rec.active),
            elapsedSec,
            maxSec: rec ? rec.maxSec : 30,
            frameCount: rec ? rec.frames.length : 0,
            markerCount: rec ? rec.markers.length : 0
        };
    }

    _captureStemDiagFrame(dt) {
        const rec = this._diagRec;
        if (!rec || !rec.active) return;

        const r3 = (x) => Math.round((Number(x) || 0) * 1000) / 1000;
        const r4 = (x) => Math.round((Number(x) || 0) * 10000) / 10000;
        const t = r3(Math.max(0, (performance.now() - rec.startedAtPerf) / 1000));
        const s = this.stems;

        const frame = {
            t,
            dt: r4(dt),
            src: this.audioSourceState,
            sens: r3(this.sensitivity),
            sig: r3(this.liveSignalLevel),
            stems: [r3(s.drums), r3(s.bass), r3(s.vocals), r3(s.synths), r3(s.hats)]
        };

        if (this.audioSourceState === 'live_music' && this.lastStemDiag) {
            const d = this.lastStemDiag;
            frame.td = [r3(d.rms), r3(d.peak), r3(d.fluxTDNorm), r3(d.tdTransient), r3(d.tdGate)];
            frame.ms = [r3(d.stereoConf), r3(d.midTotal), r3(d.sideTotal), r3(d.diffRatio), r3(d.sideRatio)];
            frame.scores = [r3(d.kickScore), r3(d.snareScore), r3(d.snareBroadGate), r3(d.broadbandSpread), r3(d.broadbandDrumDuck)];
            frame.vDiag = [
                r3(d.vocalNorm), r3(d.synthNorm), r3(d.vocalRatio), r3(d.vocalGateSmooth),
                r3(d.maxProm), r3(d.meanProm), r3(d.maxMod), r3(d.meanMod),
                r3(d.maxPVocal), r3(d.maxBandRatio), r3(d.meanMidDomVoc),
                r3(d.meanSustFrac), r3(d.meanVocBandE), r3(d.meanLocalFloor)
            ];
            frame.raw = [r3(d.rawDrums), r3(d.rawBass), r3(d.rawVocals), r3(d.rawSynths), r3(d.rawHats)];

            const nB = this._hpssBands;
            const eb = new Array(nB);
            const md = new Array(nB);
            for (let b = 0; b < nB; b++) {
                eb[b] = Math.round(Math.max(0, Math.min(250, (this._hpssCurrent[b] || 0) * 200)));
                md[b] = Math.round(Math.max(0, Math.min(100, (this._bandMidDom[b] || 0) * 100)));
            }
            frame.eb = eb;
            frame.md = md;
        }

        rec.frames.push(frame);
        if (t >= rec.maxSec || rec.frames.length >= rec.maxFrames) {
            this.stopStemDiagLog(true);
        }
    }

    _summarizeMetric(arr) {
        if (!arr || arr.length === 0) {
            return { mean: 0, p50: 0, p90: 0, p99: 0, max: 0 };
        }
        const r3 = (x) => Math.round((Number(x) || 0) * 1000) / 1000;
        const sorted = arr.slice().sort((a, b) => a - b);
        const n = sorted.length;
        let sum = 0;
        for (let i = 0; i < n; i++) sum += sorted[i];
        const pct = (q) => sorted[Math.min(n - 1, Math.max(0, Math.floor((n - 1) * q)))];
        return {
            mean: r3(sum / n),
            p50: r3(pct(0.50)),
            p90: r3(pct(0.90)),
            p99: r3(pct(0.99)),
            max: r3(sorted[n - 1])
        };
    }

    stopStemDiagLog(download = true) {
        const rec = this._diagRec;
        if (!rec) return null;
        rec.active = false;

        const r3 = (x) => Math.round((Number(x) || 0) * 1000) / 1000;
        const r1 = (x) => Math.round((Number(x) || 0) * 10) / 10;
        const sampleRate = this.audioCtx ? (this.audioCtx.sampleRate || 48000) : 48000;
        if (!this._hpssBandRanges) {
            this._buildHpssBands(sampleRate);
        }

        let trackLabel = null;
        let trackSettings = null;
        if (this.mediaStream && this.mediaStream.getAudioTracks) {
            const tracks = this.mediaStream.getAudioTracks();
            if (tracks && tracks[0]) {
                trackLabel = tracks[0].label || null;
                if (tracks[0].getSettings) {
                    const st = tracks[0].getSettings();
                    trackSettings = {
                        channelCount: st.channelCount,
                        sampleRate: st.sampleRate,
                        echoCancellation: st.echoCancellation,
                        noiseSuppression: st.noiseSuppression,
                        autoGainControl: st.autoGainControl
                    };
                }
            }
        }

        let appVersion = 'unknown';
        if (typeof document !== 'undefined' && document.querySelector) {
            const vEl = document.querySelector('.app-version');
            if (vEl && vEl.textContent) appVersion = vEl.textContent.trim();
        }

        const frames = rec.frames;
        const nFrames = frames.length;
        const durationSec = nFrames > 0 ? r3(frames[nFrames - 1].t) : r3((performance.now() - rec.startedAtPerf) / 1000);

        const stemArrays = [[], [], [], [], []];
        let liveFrames = 0, simFrames = 0, stereoConfSum = 0, hasStereoCount = 0;
        const ld = {
            vocalNorm: [], synthNorm: [], vocalRatio: [], vocalGateSmooth: [],
            broadbandSpread: [], broadbandDrumDuck: [], kickScore: [], snareScore: [],
            maxProm: [], maxBandRatio: [], maxMod: [], maxPVocal: [],
            meanMidDomVoc: [], meanSustFrac: [], rawVocals: []
        };
        const bandSum = new Float64Array(this._hpssBands);

        for (let i = 0; i < nFrames; i++) {
            const fr = frames[i];
            for (let k = 0; k < 5; k++) stemArrays[k].push(fr.stems[k] || 0);
            if (fr.src === 'live_music' && fr.vDiag) {
                liveFrames++;
                const sc = fr.ms ? fr.ms[0] : 0;
                stereoConfSum += sc;
                if (sc > 0.35) hasStereoCount++;

                ld.vocalNorm.push(fr.vDiag[0]);
                ld.synthNorm.push(fr.vDiag[1]);
                ld.vocalRatio.push(fr.vDiag[2]);
                ld.vocalGateSmooth.push(fr.vDiag[3]);
                ld.maxProm.push(fr.vDiag[4]);
                ld.maxMod.push(fr.vDiag[6]);
                ld.maxPVocal.push(fr.vDiag[8]);
                ld.maxBandRatio.push(fr.vDiag[9]);
                ld.meanMidDomVoc.push(fr.vDiag[10]);
                ld.meanSustFrac.push(fr.vDiag[11]);

                ld.kickScore.push(fr.scores[0]);
                ld.snareScore.push(fr.scores[1]);
                ld.broadbandSpread.push(fr.scores[3]);
                ld.broadbandDrumDuck.push(fr.scores[4]);
                ld.rawVocals.push(fr.raw ? fr.raw[2] : 0);

                if (fr.eb) {
                    for (let b = 0; b < this._hpssBands; b++) {
                        bandSum[b] += (fr.eb[b] || 0) / 200;
                    }
                }
            } else {
                simFrames++;
            }
        }

        const bandMeanEb = new Array(this._hpssBands);
        for (let b = 0; b < this._hpssBands; b++) {
            bandMeanEb[b] = liveFrames > 0 ? r3(bandSum[b] / liveFrames) : 0;
        }

        const payload = {
            meta: {
                appVersion,
                capturedAt: rec.startedAtIso || new Date().toISOString(),
                durationSec,
                frameCount: nFrames,
                sampleRate,
                stemFftSize: this.stemFftSize,
                stemSmoothing: this.stemAnalyser ? this.stemAnalyser.smoothingTimeConstant : 0.06,
                inputChannelCount: this._inputChannelCount,
                trackLabel,
                trackSettings,
                hpssBands: this._hpssBands,
                hpssFrames: this._hpssFrames,
                bandCentersHz: this._hpssBandRanges.map((r) => r1(r.fc)),
                bandRanges: this._hpssBandRanges.map((r) => [r.sBin, r.eBin, r.msSBin, r.msEBin]),
                fieldKeys: {
                    stems: ['drums', 'bass', 'vocals', 'synths', 'hats'],
                    td: ['rms', 'peak', 'fluxTDNorm', 'tdTransient', 'tdGate'],
                    ms: ['stereoConf', 'midTotal', 'sideTotal', 'diffRatio', 'sideRatio'],
                    scores: ['kickScore', 'snareScore', 'snareBroadGate', 'broadbandSpread', 'broadbandDrumDuck'],
                    vDiag: [
                        'vocalNorm', 'synthNorm', 'vocalRatio', 'vocalGateSmooth',
                        'maxProm', 'meanProm', 'maxMod', 'meanMod',
                        'maxPVocal', 'maxBandRatio', 'meanMidDomVoc',
                        'meanSustFrac', 'meanVocBandE', 'meanLocalFloor'
                    ],
                    raw: ['rawDrums', 'rawBass', 'rawVocals', 'rawSynths', 'rawHats'],
                    ebScale: 'value / 200 (clamped 0..1.25)',
                    mdScale: 'value / 100 (0..1.00 mid/(mid+side))'
                }
            },
            summary: {
                liveFrames,
                simFrames,
                stereoConfAvg: liveFrames > 0 ? r3(stereoConfSum / liveFrames) : 0,
                hasStereoPct: liveFrames > 0 ? r1((hasStereoCount * 100) / liveFrames) : 0,
                stems: {
                    drums: this._summarizeMetric(stemArrays[0]),
                    bass: this._summarizeMetric(stemArrays[1]),
                    vocals: this._summarizeMetric(stemArrays[2]),
                    synths: this._summarizeMetric(stemArrays[3]),
                    hats: this._summarizeMetric(stemArrays[4])
                },
                liveDiag: {
                    vocalNorm: this._summarizeMetric(ld.vocalNorm),
                    synthNorm: this._summarizeMetric(ld.synthNorm),
                    vocalRatio: this._summarizeMetric(ld.vocalRatio),
                    vocalGateSmooth: this._summarizeMetric(ld.vocalGateSmooth),
                    broadbandSpread: this._summarizeMetric(ld.broadbandSpread),
                    broadbandDrumDuck: this._summarizeMetric(ld.broadbandDrumDuck),
                    kickScore: this._summarizeMetric(ld.kickScore),
                    snareScore: this._summarizeMetric(ld.snareScore),
                    maxProm: this._summarizeMetric(ld.maxProm),
                    maxBandRatio: this._summarizeMetric(ld.maxBandRatio),
                    maxMod: this._summarizeMetric(ld.maxMod),
                    maxPVocal: this._summarizeMetric(ld.maxPVocal),
                    meanMidDomVoc: this._summarizeMetric(ld.meanMidDomVoc),
                    meanSustFrac: this._summarizeMetric(ld.meanSustFrac),
                    rawVocals: this._summarizeMetric(ld.rawVocals)
                },
                bandMeanEb
            },
            markers: rec.markers,
            frames
        };

        const now = new Date();
        const pad2 = (n) => String(n).padStart(2, '0');
        const filename = 'litestep-stems-log-' +
            now.getFullYear() + pad2(now.getMonth() + 1) + pad2(now.getDate()) + '-' +
            pad2(now.getHours()) + pad2(now.getMinutes()) + pad2(now.getSeconds()) + '.json';

        if (download && typeof document !== 'undefined' && typeof Blob !== 'undefined' && typeof URL !== 'undefined' && URL.createObjectURL) {
            try {
                const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(url), 5000);
            } catch (err) {
                console.warn('Failed to trigger stem log download:', err);
            }
        }

        const cb = rec.onFinish;
        rec.onFinish = null;
        if (cb) {
            try { cb(payload, filename); } catch (e) { console.warn('Diag onFinish error:', e); }
        }
        return { payload, filename };
    }
}

// Global singleton instance
window.audioEngine = new AudioEngine();
