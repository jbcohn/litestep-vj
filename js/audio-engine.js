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

        // Configuration
        this.sensitivity = 1.2;
        this.smoothing = 0.82;
        this.isListening = false;
        this.useSimulation = true;

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
            return true;
        } catch (e) {
            console.warn("Web Audio API not supported:", e);
            this.useSimulation = true;
            return false;
        }
    }

    async startAudioInput(deviceId = null) {
        if (!this.audioCtx) await this.init();
        if (this.audioCtx.state === 'suspended') {
            await this.audioCtx.resume();
        }

        try {
            if (this.mediaStream) {
                this.mediaStream.getTracks().forEach(track => track.stop());
            }

            const constraints = {
                audio: deviceId ? { deviceId: { exact: deviceId } } : true
            };

            this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            if (this.source) {
                this.source.disconnect();
            }

            this.source = this.audioCtx.createMediaStreamSource(this.mediaStream);
            this.source.connect(this.analyser);
            this.isListening = true;
            this.useSimulation = false;
            console.log("Audio input connected successfully.");
            return true;
        } catch (err) {
            console.warn("Unable to capture audio input, falling back to simulated beat:", err);
            this.isListening = false;
            this.useSimulation = true;
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

    update(dt = 0.016) {
        this.timeSinceLastBeat += dt;
        this.isBeat = false;
        this.dropDetected = false;

        // Track beat phase from BPM
        const beatInterval = 60 / Math.max(40, this.bpm);
        this.beatPhase = (this.beatPhase + dt / beatInterval) % 1.0;

        if (this.isListening && this.analyser) {
            this.analyser.getByteFrequencyData(this.frequencyData);
            this.analyser.getByteTimeDomainData(this.timeDomainData);

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

            // 6. Real-Time Musical Structure State Machine
            this.updateMusicalState(dt);

        } else if (this.useSimulation) {
            // Simulated 80-beat EDM cycle:
            // 32 beats Groove -> 16 beats Breakdown -> 15 beats Buildup -> 1 beat Pre-Drop -> 16 beats Drop
            this.simTime += dt;
            const beatFreq = this.bpm / 60; // beats per sec
            const totalBeatsInCycle = 80;
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
}

// Global singleton instance
window.audioEngine = new AudioEngine();
