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

        // Simulation State
        this.simTime = 0;
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
        const beatInterval = 60 / this.bpm;
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

            // Transient Beat Detection on Sub + Bass
            const instantBassEnergy = rawSub * 0.6 + rawBass * 0.4;
            this.bassHistory.push(instantBassEnergy);
            if (this.bassHistory.length > this.historySize) this.bassHistory.shift();

            const avgBass = this.bassHistory.reduce((a, b) => a + b, 0) / this.bassHistory.length;
            const variance = this.bassHistory.reduce((a, b) => a + Math.pow(b - avgBass, 2), 0) / this.bassHistory.length;
            const dynamicThreshold = (-15 * variance) + 1.35; // Adaptive sensitivity

            if (instantBassEnergy > avgBass * Math.max(1.15, dynamicThreshold) && instantBassEnergy > 0.18 && this.timeSinceLastBeat > 0.22) {
                this.isBeat = true;
                const interval = this.timeSinceLastBeat;
                this.timeSinceLastBeat = 0;
                this.beatConfidence = Math.min(1.0, (instantBassEnergy - avgBass) * 2.5);

                // Auto-estimate BPM from live inter-beat intervals
                if (interval >= 0.28 && interval <= 2.2) {
                    let normInterval = interval;
                    // Fold into typical 70 - 170 BPM musical range
                    while (normInterval < 0.35) normInterval *= 2; // > 171 BPM -> half time
                    while (normInterval > 0.86) normInterval /= 2; // < 70 BPM -> double time

                    this.detectedIntervals.push(normInterval);
                    if (this.detectedIntervals.length > 8) this.detectedIntervals.shift();

                    if (this.detectedIntervals.length >= 4) {
                        const sorted = this.detectedIntervals.slice().sort((a, b) => a - b);
                        const medianInterval = sorted[Math.floor(sorted.length / 2)];
                        const rawBpm = Math.round(60 / medianInterval);
                        if (rawBpm >= 65 && rawBpm <= 180) {
                            // Smooth moving average
                            this.bpm = Math.round(this.bpm * 0.82 + rawBpm * 0.18);
                        }
                    }
                }

                this.beatCallbacks.forEach(cb => cb(this.beatConfidence));
            }

            // Drop Detection: Sudden surge of full spectrum energy after a quiet lull
            if (this.energy > 0.65 && avgBass < 0.25 && this.timeSinceLastBeat < 0.05) {
                this.dropDetected = true;
                this.dropCallbacks.forEach(cb => cb());
            }

        } else if (this.useSimulation) {
            // Simulated 4-on-the-floor beat loop (Kick on quarter notes, hi-hats on 8ths, rolling synth bass)
            this.simTime += dt;
            const beatFreq = this.bpm / 60; // beats per sec
            const kickEnv = Math.pow(Math.max(0, 1 - (this.simTime * beatFreq % 1.0)), 3.5);
            const hatEnv = Math.pow(Math.max(0, 1 - ((this.simTime * beatFreq + 0.5) % 1.0)), 4.0);
            const synEnv = 0.35 + 0.25 * Math.sin(this.simTime * 2.1);

            this.sub = kickEnv * 0.9 * this.sensitivity;
            this.bass = (kickEnv * 0.7 + synEnv * 0.3) * this.sensitivity;
            this.mids = synEnv * this.sensitivity;
            this.highs = hatEnv * 0.65 * this.sensitivity;
            this.energy = (this.sub * 0.4 + this.bass * 0.3 + this.mids * 0.2 + this.highs * 0.1);

            if (kickEnv > 0.88 && this.timeSinceLastBeat > 0.35) {
                this.isBeat = true;
                this.timeSinceLastBeat = 0;
                this.beatConfidence = 0.9;
                this.beatCallbacks.forEach(cb => cb(0.9));
            }
        }
    }
}

// Global singleton instance
window.audioEngine = new AudioEngine();
