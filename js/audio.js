/**
 * 4 KO'ZIR: OMON QOLISH — Procedural Web Audio Engine
 * Realistic card physics, trump impacts, burn crackles, and UI sounds
 */

class SoundEngine {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.initialized = false;
    }

    init() {
        if (this.initialized) return;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioCtx();
            this.initialized = true;
        } catch (e) {
            console.warn('Web Audio API not supported', e);
        }
    }

    ensureContext() {
        if (!this.initialized) this.init();
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        return this.ctx && !this.muted;
    }

    toggleMute() {
        this.muted = !this.muted;
        return this.muted;
    }

    // Crisp card dealing / sliding sound
    playCardDeal() {
        if (!this.ensureContext()) return;
        const now = this.ctx.currentTime;

        // Filtered white noise burst for paper friction
        const bufferSize = this.ctx.sampleRate * 0.065;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.sin((i / bufferSize) * Math.PI);
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1600, now);
        filter.frequency.exponentialRampToValueAtTime(3200, now + 0.06);
        filter.Q.value = 1.8;

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.18, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(now);
    }

    // Card placed on felt table
    playCardPlace(isTrump = false) {
        if (!this.ensureContext()) return;
        const now = this.ctx.currentTime;

        // Soft thump on felt
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(isTrump ? 190 : 140, now);
        osc.frequency.exponentialRampToValueAtTime(42, now + 0.09);

        gain.gain.setValueAtTime(isTrump ? 0.35 : 0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.095);

        // Snap crispness
        this.playCardDeal();

        // Special metallic shimmer when cutting with personal trump
        if (isTrump) {
            const chime = this.ctx.createOscillator();
            const cGain = this.ctx.createGain();
            chime.type = 'sine';
            chime.frequency.setValueAtTime(587.33, now); // D5
            chime.frequency.exponentialRampToValueAtTime(880, now + 0.18); // A5
            cGain.gain.setValueAtTime(0.14, now);
            cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
            chime.connect(cGain);
            cGain.connect(this.ctx.destination);
            chime.start(now);
            chime.stop(now + 0.23);
        }
    }

    // Pass / Bita subtle click
    playPass() {
        if (!this.ensureContext()) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(260, now + 0.07);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.08);
    }

    // Bita (table cleared)
    playBita() {
        if (!this.ensureContext()) return;
        const now = this.ctx.currentTime;
        [330, 440, 659.25].forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + idx * 0.045);
            gain.gain.setValueAtTime(0.14, now + idx * 0.045);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.045 + 0.18);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.045);
            osc.stop(now + idx * 0.045 + 0.19);
        });
    }

    // Taking cards (Ko'tarish)
    playTake() {
        if (!this.ensureContext()) return;
        const now = this.ctx.currentTime;
        [310, 233].forEach((freq, idx) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, now + idx * 0.09);
            gain.gain.setValueAtTime(0.1, now + idx * 0.09);
            gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.2);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + idx * 0.09);
            osc.stop(now + idx * 0.09 + 0.22);
        });
    }

    // Error / Invalid move feedback
    playError() {
        if (!this.ensureContext()) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(155, now);
        osc.frequency.setValueAtTime(130, now + 0.07);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.19);
    }

    // Dramatic card burn / elimination sound
    playCardBurn() {
        if (!this.ensureContext()) return;
        const now = this.ctx.currentTime;

        // Deep dramatic impact + fire crackle
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.exponentialRampToValueAtTime(38, now + 0.65);
        gain.gain.setValueAtTime(0.32, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(now);
        osc.stop(now + 0.72);

        // Fire sizzle noise
        const bufferSize = this.ctx.sampleRate * 0.55;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 1.4);
        }
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(950, now);
        const nGain = this.ctx.createGain();
        nGain.gain.setValueAtTime(0.22, now);
        nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
        noise.connect(filter);
        filter.connect(nGain);
        nGain.connect(this.ctx.destination);
        noise.start(now);
    }

    // Fanfare for victory
    playVictory() {
        if (!this.ensureContext()) return;
        const now = this.ctx.currentTime;
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + i * 0.11);
            gain.gain.setValueAtTime(0.2, now + i * 0.11);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.11 + 0.45);
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(now + i * 0.11);
            osc.stop(now + i * 0.11 + 0.46);
        });
    }
}

window.soundFX = new SoundEngine();
