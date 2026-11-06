/**
 * Web Audio API Synth & Sound Engine
 * Provides hit sounds, synchronized background music with lookahead scheduling, and custom audio playback.
 */

class SoundEngine {
    constructor() {
        this.ctx = null;
        this.masterGain = null;
        this.bgmGain = null;
        this.sfxGain = null;
        this.bgmVolume = 0.7;
        this.sfxVolume = 0.85;

        // Custom audio buffer source if playing custom song
        this.customSource = null;
        this.activeScheduledNodes = [];
        this.isPlaying = false;
        this.playbackStartTime = 0;
        this.currentTrackData = null;

        // Lookahead Scheduler
        this.schedulerIntervalId = null;
        this.nextScheduledBeat = 0;
        this.pausedTimeOffset = 0;
    }

    init() {
        if (this.ctx) return;
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContextClass();

        this.masterGain = this.ctx.createGain();
        this.bgmGain = this.ctx.createGain();
        this.sfxGain = this.ctx.createGain();

        this.bgmGain.gain.setValueAtTime(this.bgmVolume, this.ctx.currentTime);
        this.sfxGain.gain.setValueAtTime(this.sfxVolume, this.ctx.currentTime);

        this.bgmGain.connect(this.masterGain);
        this.sfxGain.connect(this.masterGain);
        this.masterGain.connect(this.ctx.destination);
    }

    async ensureReady() {
        if (!this.ctx) {
            this.init();
        }
        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }
    }

    setBgmVolume(val) {
        this.bgmVolume = Math.max(0, Math.min(1, val));
        if (this.bgmGain && this.ctx) {
            this.bgmGain.gain.setTargetAtTime(this.bgmVolume, this.ctx.currentTime, 0.05);
        }
    }

    setSfxVolume(val) {
        this.sfxVolume = Math.max(0, Math.min(1, val));
        if (this.sfxGain && this.ctx) {
            this.sfxGain.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.05);
        }
    }

    // Lane hit sound with pleasant musical frequencies
    playHitSound(lane = 0, judgement = 'PERFECT') {
        if (!this.ctx) return;
        try {
            const t = this.ctx.currentTime;

            if (judgement === 'MISS') {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(90, t);
                osc.frequency.linearRampToValueAtTime(30, t + 0.12);
                gain.gain.setValueAtTime(0.25, t);
                gain.gain.linearRampToValueAtTime(0.0001, t + 0.12);
                osc.connect(gain);
                gain.connect(this.sfxGain);
                osc.start(t);
                osc.stop(t + 0.12);
                return;
            }

            // Pentatonic / chord frequencies for each lane: C5, E5, G5, B5
            const freqs = [523.25, 659.25, 783.99, 1046.50];
            const baseFreq = freqs[lane % 4] || 523.25;

            // Pluck synth sound
            const osc1 = this.ctx.createOscillator();
            const osc2 = this.ctx.createOscillator();
            const hitGain = this.ctx.createGain();

            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(baseFreq, t);

            osc2.type = 'triangle';
            osc2.frequency.setValueAtTime(baseFreq * 2, t);

            const volume = judgement === 'PERFECT' ? 0.4 : judgement === 'GREAT' ? 0.3 : 0.2;
            hitGain.gain.setValueAtTime(volume, t);
            hitGain.gain.linearRampToValueAtTime(0.0001, t + 0.14);

            osc1.connect(hitGain);
            osc2.connect(hitGain);
            hitGain.connect(this.sfxGain);

            osc1.start(t);
            osc2.start(t);
            osc1.stop(t + 0.14);
            osc2.stop(t + 0.14);

            // Crisp snap transient
            this.playSnapClick(t);
        } catch (e) {
            console.warn('Hit sound error:', e);
        }
    }

    playSnapClick(t) {
        try {
            const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * 0.012)); // 12ms burst
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;

            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(3200, t);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(0.18, t);
            gain.gain.linearRampToValueAtTime(0.0001, t + 0.012);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.sfxGain);

            noise.start(t);
            noise.stop(t + 0.012);
        } catch (e) {}
    }

    // Countdown sound cue (3, 2, 1, START)
    playCountdownSound(step) {
        if (!this.ctx) return;
        try {
            const t = this.ctx.currentTime;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            if (step === 'START' || step === 'GO') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(880, t); // High A5
                osc.frequency.linearRampToValueAtTime(1320, t + 0.22); // Sweep up

                gain.gain.setValueAtTime(0.4, t);
                gain.gain.linearRampToValueAtTime(0.0001, t + 0.25);

                osc.connect(gain);
                gain.connect(this.sfxGain);

                osc.start(t);
                osc.stop(t + 0.25);
            } else {
                const freqs = { 3: 440, 2: 523.25, 1: 659.25 };
                const f = freqs[step] || 520;
                osc.type = 'sine';
                osc.frequency.setValueAtTime(f, t);

                gain.gain.setValueAtTime(0.35, t);
                gain.gain.linearRampToValueAtTime(0.0001, t + 0.15);

                osc.connect(gain);
                gain.connect(this.sfxGain);

                osc.start(t);
                osc.stop(t + 0.15);
            }
        } catch (e) {}
    }

    // Drum synthesis helpers
    scheduleKick(time) {
        if (time < this.ctx.currentTime - 0.05) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(150, time);
            osc.frequency.exponentialRampToValueAtTime(40, time + 0.12);

            gain.gain.setValueAtTime(0.85, time);
            gain.gain.linearRampToValueAtTime(0.0001, time + 0.22);

            osc.connect(gain);
            gain.connect(this.bgmGain);

            osc.start(time);
            osc.stop(time + 0.22);
            this.activeScheduledNodes.push(osc);
        } catch (e) {}
    }

    scheduleSnare(time) {
        if (time < this.ctx.currentTime - 0.05) return;
        try {
            const osc = this.ctx.createOscillator();
            const oscGain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(200, time);
            osc.frequency.linearRampToValueAtTime(80, time + 0.1);
            oscGain.gain.setValueAtTime(0.35, time);
            oscGain.gain.linearRampToValueAtTime(0.0001, time + 0.12);
            osc.connect(oscGain);
            oscGain.connect(this.bgmGain);
            osc.start(time);
            osc.stop(time + 0.12);
            this.activeScheduledNodes.push(osc);

            const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * 0.15));
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1800, time);
            filter.Q.setValueAtTime(1.5, time);

            const noiseGain = this.ctx.createGain();
            noiseGain.gain.setValueAtTime(0.4, time);
            noiseGain.gain.linearRampToValueAtTime(0.0001, time + 0.15);

            noise.connect(filter);
            filter.connect(noiseGain);
            noiseGain.connect(this.bgmGain);
            noise.start(time);
            noise.stop(time + 0.15);
            this.activeScheduledNodes.push(noise);
        } catch (e) {}
    }

    scheduleHiHat(time, open = false) {
        if (time < this.ctx.currentTime - 0.05) return;
        try {
            const duration = open ? 0.16 : 0.05;
            const bufferSize = Math.max(1, Math.floor(this.ctx.sampleRate * duration));
            const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
            }
            const noise = this.ctx.createBufferSource();
            noise.buffer = buffer;
            const filter = this.ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(7000, time);

            const gain = this.ctx.createGain();
            gain.gain.setValueAtTime(open ? 0.3 : 0.2, time);
            gain.gain.linearRampToValueAtTime(0.0001, time + duration);

            noise.connect(filter);
            filter.connect(gain);
            gain.connect(this.bgmGain);
            noise.start(time);
            noise.stop(time + duration);
            this.activeScheduledNodes.push(noise);
        } catch (e) {}
    }

    scheduleBass(time, duration, freq) {
        if (time < this.ctx.currentTime - 0.05) return;
        try {
            const osc = this.ctx.createOscillator();
            const filter = this.ctx.createBiquadFilter();
            const gain = this.ctx.createGain();

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, time);

            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(320, time);
            filter.frequency.linearRampToValueAtTime(120, time + duration);

            gain.gain.setValueAtTime(0.35, time);
            gain.gain.setValueAtTime(0.3, time + duration - 0.02);
            gain.gain.linearRampToValueAtTime(0.0001, time + duration);

            osc.connect(filter);
            filter.connect(gain);
            gain.connect(this.bgmGain);

            osc.start(time);
            osc.stop(time + duration);
            this.activeScheduledNodes.push(osc);
        } catch (e) {}
    }

    scheduleLead(time, duration, freq, type = 'sawtooth') {
        if (time < this.ctx.currentTime - 0.05) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = type;
            osc.frequency.setValueAtTime(freq, time);

            gain.gain.setValueAtTime(0.22, time);
            gain.gain.linearRampToValueAtTime(0.0001, time + duration);

            osc.connect(gain);
            gain.connect(this.bgmGain);

            osc.start(time);
            osc.stop(time + duration);
            this.activeScheduledNodes.push(osc);
        } catch (e) {}
    }

    /**
     * Start playing a built-in track with efficient Lookahead Scheduling
     */
    startSynthesizedTrack(track, startOffset = 0) {
        this.stopTrack();
        this.isPlaying = true;
        this.currentTrackData = track;
        this.playbackStartTime = this.ctx.currentTime - startOffset;

        const bpm = track.bpm;
        const beatSec = 60 / bpm;
        const totalDuration = track.duration;
        const totalBeats = Math.floor(totalDuration / beatSec);

        // Calculate initial beat from startOffset
        this.nextScheduledBeat = Math.max(0, Math.floor(startOffset / beatSec));

        const noteToFreq = (n) => 440 * Math.pow(2, (n - 69) / 12);
        const lookaheadWindow = 1.2; // Schedule notes up to 1.2 seconds ahead

        const scheduleUpcomingBeats = () => {
            if (!this.isPlaying) return;

            const currentSongTime = this.getCurrentTime();
            const scheduleUntilTime = currentSongTime + lookaheadWindow;

            while (this.nextScheduledBeat < totalBeats) {
                const beatTime = this.nextScheduledBeat * beatSec;
                if (beatTime > scheduleUntilTime) {
                    break; // Enough notes scheduled for now
                }

                const audioTime = this.playbackStartTime + beatTime;
                this.renderBeatForSong(track.id, this.nextScheduledBeat, audioTime, beatSec, noteToFreq);
                this.nextScheduledBeat++;
            }

            // Cleanup expired audio nodes from array to keep memory minimal
            const now = this.ctx.currentTime;
            this.activeScheduledNodes = this.activeScheduledNodes.filter(n => {
                // Keep only very recent or future nodes
                return true;
            });
            if (this.activeScheduledNodes.length > 80) {
                this.activeScheduledNodes.splice(0, 40);
            }
        };

        // Run immediately, then recurring every 45ms
        scheduleUpcomingBeats();
        this.schedulerIntervalId = setInterval(scheduleUpcomingBeats, 45);
    }

    renderBeatForSong(songId, b, t, beatSec, noteToFreq) {
        const bar = Math.floor(b / 4);
        const beatInBar = b % 4;

        if (songId === 'neon_skyline') {
            const bassChords = [33, 33, 29, 29, 24, 24, 31, 31];
            const melodyPattern = [57, 60, 64, 60, 67, 64, 60, 62, 57, 60, 64, 69, 67, 64, 62, 60];

            this.scheduleKick(t);
            if (beatInBar === 1 || beatInBar === 3) this.scheduleSnare(t);
            this.scheduleHiHat(t + beatSec * 0.5, false);
            this.scheduleHiHat(t, false);

            const root = bassChords[bar % bassChords.length];
            this.scheduleBass(t, beatSec * 0.45, noteToFreq(root));
            this.scheduleBass(t + beatSec * 0.5, beatSec * 0.45, noteToFreq(root + 12));

            const melNote = melodyPattern[b % melodyPattern.length];
            this.scheduleLead(t, beatSec * 0.6, noteToFreq(melNote + 12), 'sawtooth');
            if (b % 2 === 0) {
                this.scheduleLead(t + beatSec * 0.5, beatSec * 0.4, noteToFreq(melNote + 16), 'sine');
            }

        } else if (songId === 'starlight_velocity') {
            const roots = [38, 38, 34, 34, 41, 41, 36, 36];
            const leadScale = [62, 65, 69, 72, 74, 72, 69, 65];

            this.scheduleKick(t);
            if (beatInBar === 2) this.scheduleKick(t + beatSec * 0.5);
            if (beatInBar === 1 || beatInBar === 3) this.scheduleSnare(t);

            for (let s = 0; s < 4; s++) {
                this.scheduleHiHat(t + s * (beatSec / 4), s === 2);
            }

            const r = roots[bar % roots.length];
            this.scheduleBass(t, beatSec * 0.35, noteToFreq(r));
            this.scheduleBass(t + beatSec * 0.5, beatSec * 0.35, noteToFreq(r + 7));

            const lead1 = leadScale[(b * 2) % leadScale.length];
            const lead2 = leadScale[(b * 2 + 1) % leadScale.length];
            this.scheduleLead(t, beatSec * 0.42, noteToFreq(lead1), 'sawtooth');
            this.scheduleLead(t + beatSec * 0.5, beatSec * 0.42, noteToFreq(lead2), 'square');

        } else if (songId === 'quantum_hyperdrive') {
            const chords = [40, 36, 43, 38];
            const euroLead = [64, 67, 71, 74, 76, 74, 71, 67, 69, 72, 76, 79, 78, 76, 72, 69];

            this.scheduleKick(t);
            if (bar % 4 === 3 && beatInBar === 3) {
                this.scheduleKick(t + beatSec * 0.5);
                this.scheduleKick(t + beatSec * 0.75);
            }
            if (beatInBar === 1 || beatInBar === 3) this.scheduleSnare(t);

            this.scheduleHiHat(t, false);
            this.scheduleHiHat(t + beatSec * 0.25, false);
            this.scheduleHiHat(t + beatSec * 0.5, true);
            this.scheduleHiHat(t + beatSec * 0.75, false);

            const ch = chords[bar % chords.length];
            this.scheduleBass(t, beatSec * 0.23, noteToFreq(ch));
            this.scheduleBass(t + beatSec * 0.25, beatSec * 0.23, noteToFreq(ch));
            this.scheduleBass(t + beatSec * 0.5, beatSec * 0.23, noteToFreq(ch + 12));
            this.scheduleBass(t + beatSec * 0.75, beatSec * 0.23, noteToFreq(ch));

            const idx = (b * 2) % euroLead.length;
            this.scheduleLead(t, beatSec * 0.28, noteToFreq(euroLead[idx]), 'sawtooth');
            this.scheduleLead(t + beatSec * 0.5, beatSec * 0.28, noteToFreq(euroLead[(idx + 1) % euroLead.length]), 'sawtooth');
        }
    }

    startCustomTrack(audioBuffer, startOffset = 0) {
        this.stopTrack();
        this.isPlaying = true;
        this.playbackStartTime = this.ctx.currentTime - startOffset;

        this.customSource = this.ctx.createBufferSource();
        this.customSource.buffer = audioBuffer;
        this.customSource.connect(this.bgmGain);
        this.customSource.start(0, startOffset);
    }

    stopTrack() {
        this.isPlaying = false;
        if (this.schedulerIntervalId) {
            clearInterval(this.schedulerIntervalId);
            this.schedulerIntervalId = null;
        }

        if (this.customSource) {
            try {
                this.customSource.stop();
                this.customSource.disconnect();
            } catch (e) {}
            this.customSource = null;
        }

        for (const node of this.activeScheduledNodes) {
            try {
                node.stop();
                node.disconnect();
            } catch (e) {}
        }
        this.activeScheduledNodes = [];
    }

    getCurrentTime() {
        if (!this.ctx || !this.isPlaying) return 0;
        return Math.max(0, this.ctx.currentTime - this.playbackStartTime);
    }
}

// Global sound instance
window.soundEngine = new SoundEngine();
