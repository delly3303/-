/**
 * Main Rhythm Game Engine
 * Handles rendering, timing synchronization, input handling, judgement, particle effects, and scoring.
 */

class RhythmGame {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Game Settings
        this.speed = parseFloat(localStorage.getItem('rhythm_speed') || '2.5');
        this.offset = parseFloat(localStorage.getItem('rhythm_offset') || '0.0'); // Sync calibration in ms
        this.keyBindings = JSON.parse(localStorage.getItem('rhythm_keys') || '["KeyD", "KeyF", "KeyJ", "KeyK"]');
        this.keyLabels = ['D', 'F', 'J', 'K'];

        // Audio Engine
        this.soundEngine = window.soundEngine;

        // Current Song & Beatmap
        this.currentSong = null;
        this.notes = []; // Active note objects
        this.totalNotesCount = 0;

        // Game State
        this.state = 'MENU'; // MENU, PLAYING, PAUSED, RESULT
        this.startTime = 0;
        this.gameTime = 0;
        this.isGameOver = false;

        // Lane State & Key States
        this.lanePressed = [false, false, false, false];
        this.activeHolds = [null, null, null, null]; // Currently held notes per lane

        // Scoring & Stats
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.health = 100; // 0 to 100
        this.stats = {
            perfect: 0,
            great: 0,
            good: 0,
            miss: 0
        };

        // Judgement feedback animation
        this.currentJudgement = null;
        this.judgementTimer = 0;
        this.comboPulse = 0;

        // Visual effects
        this.particles = [];
        this.shockwaves = [];
        this.laneBeams = [0, 0, 0, 0]; // Alpha values for key beam glow

        // Lane Colors: Neon Cyan, Neon Magenta, Neon Magenta, Neon Cyan
        this.laneColors = ['#00f2fe', '#f093fb', '#f093fb', '#00f2fe'];
        this.laneGlows = ['rgba(0, 242, 254, 0.5)', 'rgba(240, 147, 251, 0.5)', 'rgba(240, 147, 251, 0.5)', 'rgba(0, 242, 254, 0.5)'];

        // Judgement Timing Thresholds in seconds
        this.WINDOWS = {
            PERFECT: 0.045, // ±45ms
            GREAT: 0.090,   // ±90ms
            GOOD: 0.145,    // ±145ms
            MISS: 0.200     // ±200ms
        };

        this.initCanvasSize();
        this.bindEvents();
        this.lastFrameTime = performance.now();
        requestAnimationFrame((t) => this.loop(t));
    }

    initCanvasSize() {
        const resize = () => {
            const container = document.getElementById('gameContainer');
            if (container) {
                this.canvas.width = container.clientWidth;
                this.canvas.height = container.clientHeight;
            }
        };
        window.addEventListener('resize', resize);
        resize();
    }

    bindEvents() {
        // Keyboard Down
        window.addEventListener('keydown', (e) => {
            // Prevent default browser scrolling or focused button activation on game keys
            if (['KeyD', 'KeyF', 'KeyJ', 'KeyK', 'Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code) ||
                ['d', 'f', 'j', 'k', 'D', 'F', 'J', 'K', 'ㅇ', 'ㄹ', 'ㅓ', 'ㅏ'].includes(e.key)) {
                e.preventDefault();
            }

            if (e.repeat) return;

            // Global Shortcuts
            if (e.code === 'Escape') {
                if (this.state === 'COUNTDOWN') {
                    this.quitToSongSelect();
                    return;
                } else if (this.state === 'PLAYING' || this.state === 'PAUSED') {
                    this.togglePause();
                    return;
                }
            }

            if (this.state !== 'PLAYING' && this.state !== 'COUNTDOWN') return;

            for (let i = 0; i < 4; i++) {
                const targetCode = this.keyBindings[i];
                const targetKey = this.keyLabels[i].toLowerCase();
                const koreanKeys = ['ㅇ', 'ㄹ', 'ㅓ', 'ㅏ'];

                if (e.code === targetCode || e.key.toLowerCase() === targetKey || e.key === koreanKeys[i]) {
                    this.onLaneDown(i);
                    break;
                }
            }
        });

        // Keyboard Up
        window.addEventListener('keyup', (e) => {
            if (this.state !== 'PLAYING' && this.state !== 'COUNTDOWN') return;

            for (let i = 0; i < 4; i++) {
                const targetCode = this.keyBindings[i];
                const targetKey = this.keyLabels[i].toLowerCase();
                const koreanKeys = ['ㅇ', 'ㄹ', 'ㅓ', 'ㅏ'];

                if (e.code === targetCode || e.key.toLowerCase() === targetKey || e.key === koreanKeys[i]) {
                    this.onLaneUp(i);
                    break;
                }
            }
        });

        // Mouse & Touch support for interactive play
        const handleTouchLane = (clientX, isDown) => {
            if (this.state !== 'PLAYING' && this.state !== 'COUNTDOWN') return;
            const rect = this.canvas.getBoundingClientRect();
            const x = clientX - rect.left;
            const laneMetrics = this.getLaneMetrics();
            if (x >= laneMetrics.startX && x <= laneMetrics.startX + laneMetrics.totalWidth) {
                const lane = Math.floor((x - laneMetrics.startX) / laneMetrics.laneWidth);
                if (lane >= 0 && lane < 4) {
                    if (isDown) this.onLaneDown(lane);
                    else this.onLaneUp(lane);
                }
            }
        };

        this.canvas.addEventListener('mousedown', (e) => handleTouchLane(e.clientX, true));
        this.canvas.addEventListener('mouseup', (e) => handleTouchLane(e.clientX, false));

        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                handleTouchLane(e.changedTouches[i].clientX, true);
            }
        }, { passive: false });

        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            for (let i = 0; i < e.changedTouches.length; i++) {
                handleTouchLane(e.changedTouches[i].clientX, false);
            }
        }, { passive: false });
    }

    getLaneMetrics() {
        const height = this.canvas.height;
        const width = this.canvas.width;
        // Optimal track width: min 360, max 640
        const trackWidth = Math.min(width * 0.92, 540);
        const laneWidth = trackWidth / 4;
        const startX = (width - trackWidth) / 2;
        const judgeY = height * 0.82; // 82% from top
        const noteHeight = 26;

        return {
            trackWidth,
            laneWidth,
            startX,
            judgeY,
            noteHeight
        };
    }

    startCountdown(onComplete) {
        this.state = 'COUNTDOWN';
        this.countdownTimerId = null;

        const overlay = document.getElementById('countdownOverlay');
        const textElem = document.getElementById('countdownText');
        if (!overlay || !textElem) {
            this.state = 'PLAYING';
            onComplete();
            return;
        }

        overlay.classList.remove('hidden');
        textElem.classList.remove('start-text');

        const steps = ['3', '2', '1', 'START!'];
        let currentStepIndex = 0;

        const triggerStepAnimation = () => {
            textElem.style.animation = 'none';
            textElem.offsetHeight; // trigger reflow
            textElem.style.animation = '';
        };

        const runStep = () => {
            if (this.state !== 'COUNTDOWN') {
                overlay.classList.add('hidden');
                return;
            }

            const step = steps[currentStepIndex];
            textElem.textContent = step;
            triggerStepAnimation();

            if (step === 'START!') {
                textElem.classList.add('start-text');
                this.soundEngine.playCountdownSound('START');

                this.countdownTimerId = setTimeout(() => {
                    overlay.classList.add('hidden');
                    textElem.classList.remove('start-text');
                    this.state = 'PLAYING';
                    onComplete();
                }, 550);
            } else {
                textElem.classList.remove('start-text');
                this.soundEngine.playCountdownSound(parseInt(step, 10));
                currentStepIndex++;
                this.countdownTimerId = setTimeout(runStep, 750);
            }
        };

        runStep();
    }

    cancelCountdown() {
        if (this.countdownTimerId) {
            clearTimeout(this.countdownTimerId);
            this.countdownTimerId = null;
        }
        const overlay = document.getElementById('countdownOverlay');
        if (overlay) overlay.classList.add('hidden');
    }

    startSong(song) {
        if (document.activeElement && document.activeElement.blur) {
            document.activeElement.blur();
        }
        this.cancelCountdown();
        this.currentSong = song;
        // Deep clone notes array
        this.notes = song.notes.map(n => ({
            ...n,
            hit: false,
            holding: false,
            holdFinished: false,
            missed: false,
            holdProgressTime: 0
        }));

        this.totalNotesCount = this.notes.length;
        this.score = 0;
        this.combo = 0;
        this.maxCombo = 0;
        this.health = 100;
        this.stats = { perfect: 0, great: 0, good: 0, miss: 0 };
        this.currentJudgement = null;
        this.particles = [];
        this.shockwaves = [];
        this.activeHolds = [null, null, null, null];
        this.lanePressed = [false, false, false, false];
        this.gameTime = 0;
        this.isGameOver = false;

        // Switch UI panels to show in-game track preview
        document.getElementById('startScreen').classList.add('hidden');
        document.getElementById('songSelectScreen').classList.add('hidden');
        document.getElementById('resultScreen').classList.add('hidden');
        document.getElementById('pauseOverlay').classList.add('hidden');
        document.getElementById('inGameHud').classList.remove('hidden');

        // Update in-game song title display
        document.getElementById('hudSongTitle').textContent = song.title;
        document.getElementById('hudArtist').textContent = song.artist || 'Original Track';

        // Start with a 3-second countdown preparation!
        this.startCountdown(() => {
            // Start Audio
            if (song.isCustom && song.audioBuffer) {
                this.soundEngine.startCustomTrack(song.audioBuffer, 0);
            } else {
                this.soundEngine.startSynthesizedTrack(song, 0);
            }
        });
    }

    togglePause() {
        if (this.state === 'PLAYING') {
            this.state = 'PAUSED';
            this.soundEngine.stopTrack();
            document.getElementById('pauseOverlay').classList.remove('hidden');
        } else if (this.state === 'PAUSED') {
            document.getElementById('pauseOverlay').classList.add('hidden');
            // Resume with countdown
            this.startCountdown(() => {
                if (this.currentSong.isCustom && this.currentSong.audioBuffer) {
                    this.soundEngine.startCustomTrack(this.currentSong.audioBuffer, this.gameTime);
                } else {
                    this.soundEngine.startSynthesizedTrack(this.currentSong, this.gameTime);
                }
            });
        }
    }

    restartSong() {
        this.cancelCountdown();
        this.soundEngine.stopTrack();
        if (this.currentSong) {
            this.startSong(this.currentSong);
        }
    }

    quitToSongSelect() {
        this.cancelCountdown();
        this.soundEngine.stopTrack();
        this.state = 'MENU';
        document.getElementById('pauseOverlay').classList.add('hidden');
        document.getElementById('resultScreen').classList.add('hidden');
        document.getElementById('inGameHud').classList.add('hidden');
        document.getElementById('songSelectScreen').classList.remove('hidden');
    }

    onLaneDown(lane) {
        this.lanePressed[lane] = true;
        this.laneBeams[lane] = 1.0;

        // Warm-up tap sound during countdown
        if (this.state === 'COUNTDOWN') {
            this.soundEngine.playHitSound(lane, 'TAP');
            return;
        }

        const songTime = this.gameTime + (this.offset / 1000);

        // Find the closest unhit note in this lane within hit window
        let bestNote = null;
        let minDiff = Infinity;

        for (let i = 0; i < this.notes.length; i++) {
            const note = this.notes[i];
            if (note.lane !== lane || note.hit || note.missed) continue;

            const diff = Math.abs(note.time - songTime);

            // If note is too far in future, stop searching
            if (note.time - songTime > this.WINDOWS.MISS) break;

            if (diff < minDiff && diff <= this.WINDOWS.MISS) {
                minDiff = diff;
                bestNote = note;
            }
        }

        if (bestNote) {
            this.judgeHit(bestNote, minDiff);
            if (bestNote.type === 'hold' && !bestNote.missed) {
                bestNote.holding = true;
                this.activeHolds[lane] = bestNote;
            }
        } else {
            // Empty lane press hit sound (light click)
            this.soundEngine.playHitSound(lane, 'TAP');
        }
    }

    onLaneUp(lane) {
        this.lanePressed[lane] = false;

        const heldNote = this.activeHolds[lane];
        if (heldNote) {
            const songTime = this.gameTime + (this.offset / 1000);
            const holdEndTime = heldNote.time + heldNote.duration;

            // Ratio of hold completed
            const ratio = Math.min(1.0, (songTime - heldNote.time) / heldNote.duration);

            if (ratio >= 0.82 || songTime >= holdEndTime - this.WINDOWS.GREAT) {
                // Completed successfully!
                this.triggerJudgement('PERFECT');
                this.spawnParticles(lane, this.getLaneMetrics().judgeY, '#00f2fe', 24);
                this.soundEngine.playHitSound(lane, 'PERFECT');
                heldNote.completed = true;
            } else if (ratio >= 0.45) {
                // Released midway
                this.triggerJudgement('GOOD');
                heldNote.broken = true;
            } else {
                // Released too early
                this.triggerJudgement('MISS');
                heldNote.missed = true;
                heldNote.broken = true;
                this.combo = 0;
                this.health = Math.max(0, this.health - 6);
                this.soundEngine.playHitSound(lane, 'MISS');
            }

            heldNote.holding = false;
            this.activeHolds[lane] = null;
        }
    }

    judgeHit(note, diff) {
        note.hit = true;
        let judgement = 'MISS';

        if (diff <= this.WINDOWS.PERFECT) {
            judgement = 'PERFECT';
            this.score += 1000 + (this.combo * 15);
            this.stats.perfect++;
            this.health = Math.min(100, this.health + 2.5);
        } else if (diff <= this.WINDOWS.GREAT) {
            judgement = 'GREAT';
            this.score += 750 + (this.combo * 10);
            this.stats.great++;
            this.health = Math.min(100, this.health + 1.5);
        } else if (diff <= this.WINDOWS.GOOD) {
            judgement = 'GOOD';
            this.score += 400 + (this.combo * 5);
            this.stats.good++;
            this.health = Math.min(100, this.health + 0.5);
        } else {
            judgement = 'MISS';
            note.missed = true;
            this.stats.miss++;
            this.health = Math.max(0, this.health - 8);
            this.combo = 0;
        }

        if (judgement !== 'MISS') {
            this.combo++;
            if (this.combo > this.maxCombo) {
                this.maxCombo = this.combo;
            }
            const metrics = this.getLaneMetrics();
            this.spawnParticles(note.lane, metrics.judgeY, this.laneColors[note.lane], 20);
            this.spawnShockwave(note.lane, metrics.judgeY, this.laneColors[note.lane]);
        }

        this.triggerJudgement(judgement);
        this.soundEngine.playHitSound(note.lane, judgement);
    }

    triggerJudgement(judgement) {
        this.currentJudgement = judgement;
        this.judgementTimer = 1.0; // 1.0 down to 0
        this.comboPulse = 1.0;
    }

    spawnParticles(lane, y, color, count = 16) {
        const metrics = this.getLaneMetrics();
        const centerX = metrics.startX + lane * metrics.laneWidth + metrics.laneWidth / 2;

        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * Math.random());
            const speed = Math.random() * 6 + 2;
            this.particles.push({
                x: centerX + (Math.random() * 40 - 20),
                y: y + (Math.random() * 10 - 5),
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1.5,
                size: Math.random() * 5 + 2,
                color: color,
                alpha: 1.0,
                decay: Math.random() * 0.03 + 0.02
            });
        }
    }

    spawnShockwave(lane, y, color) {
        const metrics = this.getLaneMetrics();
        const centerX = metrics.startX + lane * metrics.laneWidth + metrics.laneWidth / 2;
        this.shockwaves.push({
            x: centerX,
            y: y,
            radius: 5,
            maxRadius: metrics.laneWidth * 0.7,
            alpha: 0.9,
            color: color
        });
    }

    update(dt) {
        // In countdown mode, only animate visual feedback like lane beams
        if (this.state === 'COUNTDOWN') {
            for (let i = 0; i < 4; i++) {
                if (this.lanePressed[i]) {
                    this.laneBeams[i] = 1.0;
                } else if (this.laneBeams[i] > 0) {
                    this.laneBeams[i] = Math.max(0, this.laneBeams[i] - dt * 5.0);
                }
            }
            return;
        }

        if (this.state !== 'PLAYING') return;

        // Current song time from SoundEngine
        this.gameTime = this.soundEngine.getCurrentTime();

        // Check for missed notes
        const songTime = this.gameTime + (this.offset / 1000);
        for (let i = 0; i < this.notes.length; i++) {
            const note = this.notes[i];
            if (!note.hit && !note.missed) {
                // If note has passed beyond MISS threshold
                if (songTime - note.time > this.WINDOWS.MISS) {
                    note.missed = true;
                    this.stats.miss++;
                    this.combo = 0;
                    this.health = Math.max(0, this.health - 6);
                    this.triggerJudgement('MISS');
                    this.soundEngine.playHitSound(note.lane, 'MISS');
                }
            }
        }

        // Handle active hold notes
        for (let lane = 0; lane < 4; lane++) {
            const note = this.activeHolds[lane];
            if (note && note.holding) {
                note.holdProgressTime += dt;
                // Emit continuous holding particles
                if (Math.random() < 0.45) {
                    const metrics = this.getLaneMetrics();
                    this.spawnParticles(lane, metrics.judgeY, this.laneColors[lane], 2);
                }
                // Add tick score
                this.score += Math.round(dt * 220);

                // If hold duration completed (Tail reached judge line while player holding)
                if (songTime >= note.time + note.duration) {
                    this.triggerJudgement('PERFECT');
                    this.spawnParticles(lane, this.getLaneMetrics().judgeY, '#00f2fe', 24);
                    this.soundEngine.playHitSound(lane, 'PERFECT');
                    note.holding = false;
                    note.completed = true;
                    this.activeHolds[lane] = null;
                }
            }
        }

        // Update Judgement & Combo animations
        if (this.judgementTimer > 0) {
            this.judgementTimer = Math.max(0, this.judgementTimer - dt * 2.8);
        }
        if (this.comboPulse > 0) {
            this.comboPulse = Math.max(0, this.comboPulse - dt * 4.0);
        }

        // Update lane beam highlights
        for (let i = 0; i < 4; i++) {
            if (this.lanePressed[i]) {
                this.laneBeams[i] = 1.0;
            } else if (this.laneBeams[i] > 0) {
                this.laneBeams[i] = Math.max(0, this.laneBeams[i] - dt * 5.0);
            }
        }

        // Update Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.15; // Gravity
            p.alpha -= p.decay;
            if (p.alpha <= 0) {
                this.particles.splice(i, 1);
            }
        }

        // Update Shockwaves
        for (let i = this.shockwaves.length - 1; i >= 0; i--) {
            const sw = this.shockwaves[i];
            sw.radius += (sw.maxRadius - sw.radius) * 12 * dt;
            sw.alpha -= 2.2 * dt;
            if (sw.alpha <= 0 || sw.radius >= sw.maxRadius * 0.95) {
                this.shockwaves.splice(i, 1);
            }
        }

        // Update In-Game HUD Elements
        this.updateHud();

        // Check Song Finished
        if (this.gameTime >= this.currentSong.duration + 1.5) {
            this.showResults();
        }
    }

    updateHud() {
        document.getElementById('hudScore').textContent = this.score.toLocaleString();
        document.getElementById('hudCombo').textContent = this.combo;

        // Health bar height (vertical bar)
        const hpBar = document.getElementById('hudHealthFill');
        if (hpBar) {
            hpBar.style.height = `${Math.max(0, Math.min(100, this.health))}%`;
            if (this.health < 25) {
                hpBar.style.background = 'linear-gradient(0deg, #ff0844, #ff4e50)';
            } else {
                hpBar.style.background = 'linear-gradient(0deg, #00f2fe, #4facfe)';
            }
        }

        // Progress bar
        const progress = Math.min(100, (this.gameTime / this.currentSong.duration) * 100);
        const progBar = document.getElementById('hudProgressFill');
        if (progBar) {
            progBar.style.width = `${progress}%`;
        }

        // Accuracy
        const totalHit = this.stats.perfect + this.stats.great + this.stats.good + this.stats.miss;
        let accuracy = 100.0;
        if (totalHit > 0) {
            const weighted = (this.stats.perfect * 1.0 + this.stats.great * 0.75 + this.stats.good * 0.4);
            accuracy = (weighted / totalHit) * 100;
        }
        document.getElementById('hudAccuracy').textContent = `${accuracy.toFixed(1)}%`;
    }

    showResults() {
        this.state = 'RESULT';
        this.soundEngine.stopTrack();

        document.getElementById('inGameHud').classList.add('hidden');
        document.getElementById('resultScreen').classList.remove('hidden');

        // Calculate Rank
        let rank = 'F';
        let rankColor = '#94a3b8';
        if (this.score >= 980000) { rank = 'SSS'; rankColor = '#ffd700'; }
        else if (this.score >= 950000) { rank = 'SS'; rankColor = '#fbbf24'; }
        else if (this.score >= 900000) { rank = 'S'; rankColor = '#38bdf8'; }
        else if (this.score >= 800000) { rank = 'A'; rankColor = '#4ade80'; }
        else if (this.score >= 700000) { rank = 'B'; rankColor = '#a855f7'; }
        else if (this.score >= 600000) { rank = 'C'; rankColor = '#f97316'; }

        const totalHit = this.stats.perfect + this.stats.great + this.stats.good + this.stats.miss;
        let accuracy = 0;
        if (totalHit > 0) {
            const weighted = (this.stats.perfect * 1.0 + this.stats.great * 0.75 + this.stats.good * 0.4);
            accuracy = (weighted / totalHit) * 100;
        }

        const rankElem = document.getElementById('resRank');
        rankElem.textContent = rank;
        rankElem.style.color = rankColor;
        rankElem.style.textShadow = `0 0 35px ${rankColor}`;

        document.getElementById('resSongTitle').textContent = this.currentSong.title;
        document.getElementById('resScore').textContent = this.score.toLocaleString();
        document.getElementById('resMaxCombo').textContent = this.maxCombo;
        document.getElementById('resAccuracy').textContent = `${accuracy.toFixed(1)}%`;

        document.getElementById('resPerfect').textContent = this.stats.perfect;
        document.getElementById('resGreat').textContent = this.stats.great;
        document.getElementById('resGood').textContent = this.stats.good;
        document.getElementById('resMiss').textContent = this.stats.miss;
    }

    render() {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        ctx.clearRect(0, 0, width, height);

        if (this.state !== 'PLAYING' && this.state !== 'PAUSED' && this.state !== 'COUNTDOWN') {
            return;
        }

        const metrics = this.getLaneMetrics();
        const { trackWidth, laneWidth, startX, judgeY, noteHeight } = metrics;
        const pixelsPerSecond = 320 * this.speed;
        const songTime = this.gameTime + (this.offset / 1000);

        // 1. Draw Track Background
        ctx.save();
        ctx.fillStyle = 'rgba(12, 16, 28, 0.92)';
        ctx.fillRect(startX, 0, trackWidth, height);

        // Track outer glow border
        ctx.strokeStyle = 'rgba(0, 242, 254, 0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(startX, 0, trackWidth, height);

        // 2. Draw Lane Dividers & Lane Beams
        for (let i = 0; i < 4; i++) {
            const lx = startX + i * laneWidth;

            // Lane dividing line
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(lx, 0);
            ctx.lineTo(lx, height);
            ctx.stroke();

            // Lane Key Press Light Beam
            if (this.laneBeams[i] > 0) {
                const beamAlpha = Math.max(0, Math.min(1, this.laneBeams[i])) * 0.4;
                const beamColor = (i === 0 || i === 3)
                    ? `rgba(0, 242, 254, ${beamAlpha})`
                    : `rgba(240, 147, 251, ${beamAlpha})`;

                const gradReal = ctx.createLinearGradient(0, judgeY, 0, 0);
                gradReal.addColorStop(0, beamColor);
                gradReal.addColorStop(1, 'rgba(0,0,0,0)');

                ctx.fillStyle = gradReal;
                ctx.fillRect(lx, 0, laneWidth, judgeY);
            }
        }
        // Rightmost border line
        ctx.beginPath();
        ctx.moveTo(startX + trackWidth, 0);
        ctx.lineTo(startX + trackWidth, height);
        ctx.stroke();

        // 3. Draw Judgement Line (Bottom Bar)
        const judgeGrad = ctx.createLinearGradient(startX, judgeY, startX + trackWidth, judgeY);
        judgeGrad.addColorStop(0, '#00f2fe');
        judgeGrad.addColorStop(0.5, '#f093fb');
        judgeGrad.addColorStop(1, '#00f2fe');

        ctx.strokeStyle = judgeGrad;
        ctx.lineWidth = 4;
        ctx.shadowColor = '#00f2fe';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(startX, judgeY);
        ctx.lineTo(startX + trackWidth, judgeY);
        ctx.stroke();
        ctx.shadowBlur = 0; // Reset

        // Key Buttons area at bottom
        for (let i = 0; i < 4; i++) {
            const lx = startX + i * laneWidth;
            const btnHeight = height - judgeY;

            if (this.lanePressed[i]) {
                ctx.fillStyle = i % 3 === 0 ? 'rgba(0, 242, 254, 0.28)' : 'rgba(240, 147, 251, 0.28)';
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            }
            ctx.fillRect(lx + 3, judgeY + 2, laneWidth - 6, btnHeight - 4);

            // Key label
            ctx.font = 'bold 20px "Segoe UI", sans-serif';
            ctx.fillStyle = this.lanePressed[i] ? '#ffffff' : 'rgba(255, 255, 255, 0.6)';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(this.keyLabels[i], lx + laneWidth / 2, judgeY + btnHeight * 0.45);
        }

        // 4. Render Notes (Falling Tiles)
        for (let i = 0; i < this.notes.length; i++) {
            const note = this.notes[i];

            // --- 4-A. Tap Note Rendering ---
            if (note.type === 'tap') {
                if (note.hit || note.missed) continue;

                const timeDiff = note.time - songTime;
                const y = judgeY - timeDiff * pixelsPerSecond;

                // Cull offscreen notes
                if (y > height + 60 || y < -60) continue;

                const lx = startX + note.lane * laneWidth + 4;
                const nw = laneWidth - 8;
                this.drawTile(ctx, lx, y - noteHeight / 2, nw, noteHeight, this.laneColors[note.lane], false);
                continue;
            }

            // --- 4-B. Hold Note Rendering ---
            if (note.holdFinished) continue;

            const holdTailDiff = (note.time + note.duration) - songTime;
            let tailY = judgeY - holdTailDiff * pixelsPerSecond;

            const headTimeDiff = note.time - songTime;
            let headY = judgeY - headTimeDiff * pixelsPerSecond;

            // When actively holding or completed successfully, head is pinned to the judgement line
            if (note.holding || note.completed) {
                headY = judgeY;

                // When tail reaches judge line, the hold note has cleanly finished!
                if (tailY >= judgeY) {
                    note.holdFinished = true;
                    continue;
                }
            }

            // If broken or missed hold note has completely fallen below screen
            if (tailY > height + 80) {
                note.holdFinished = true;
                continue;
            }

            // Offscreen above check (not even reached the screen yet)
            if (headY < -100 && tailY < -100) continue;

            const lx = startX + note.lane * laneWidth + 4;
            const nw = laneWidth - 8;
            const color = this.laneColors[note.lane];
            const isBroken = note.missed || note.broken;

            const bodyHeight = Math.max(0, headY - tailY);

            // Draw Hold Body Ribbon
            if (bodyHeight > 0) {
                const bodyGrad = ctx.createLinearGradient(0, tailY, 0, headY);
                if (isBroken) {
                    bodyGrad.addColorStop(0, 'rgba(80, 80, 80, 0.25)');
                    bodyGrad.addColorStop(1, 'rgba(120, 120, 120, 0.35)');
                } else {
                    const alphaTop = note.lane % 3 === 0 ? 'rgba(0, 242, 254, 0.55)' : 'rgba(240, 147, 251, 0.55)';
                    bodyGrad.addColorStop(0, alphaTop);
                    bodyGrad.addColorStop(1, color);
                }

                ctx.fillStyle = bodyGrad;
                ctx.fillRect(lx + 8, tailY, nw - 16, bodyHeight);

                // Hold body edge lines
                ctx.strokeStyle = isBroken ? 'rgba(120, 120, 120, 0.5)' : color;
                ctx.lineWidth = 2;
                ctx.strokeRect(lx + 8, tailY, nw - 16, bodyHeight);
            }

            // Draw Tail End Cap Tile (정확한 꼬리 타일)
            this.drawHoldTailCap(ctx, lx, tailY - noteHeight * 0.35, nw, noteHeight * 0.7, isBroken ? '#777777' : color);

            // Draw Head Tile
            if (!note.completed || bodyHeight > 4) {
                this.drawTile(ctx, lx, headY - noteHeight / 2, nw, noteHeight, isBroken ? '#777777' : color, true);
            }
        }

        // 5. Render Shockwaves & Particles
        this.renderShockwaves(ctx);
        this.renderParticles(ctx);

        // 6. Judgement & Combo Display in center lane
        this.renderJudgementText(ctx, startX + trackWidth / 2, judgeY - 90);

        ctx.restore();
    }

    drawHoldTailCap(ctx, x, y, width, height, color) {
        ctx.save();
        const radius = 4;
        ctx.shadowColor = color;
        ctx.shadowBlur = 10;

        ctx.beginPath();
        ctx.roundRect(x + 4, y, width - 8, height, radius);

        const grad = ctx.createLinearGradient(x, y, x, y + height);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.3, color);
        grad.addColorStop(1, color);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.restore();
    }

    drawTile(ctx, x, y, width, height, color, isHoldHead) {
        ctx.save();
        const radius = 6;

        // Tile glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 14;

        // Rounded Tile Body
        ctx.beginPath();
        ctx.roundRect(x, y, width, height, radius);

        // Gradient Fill
        const grad = ctx.createLinearGradient(x, y, x, y + height);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.2, color);
        grad.addColorStop(1, color);
        ctx.fillStyle = grad;
        ctx.fill();

        // Neon border
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.8;
        ctx.stroke();

        // Top Gloss Highlight
        ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
        ctx.beginPath();
        ctx.roundRect(x + 4, y + 2, width - 8, height * 0.35, [3, 3, 0, 0]);
        ctx.fill();

        if (isHoldHead) {
            // Little dot or icon in hold head
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(x + width / 2, y + height / 2, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
    }

    renderParticles(ctx) {
        for (const p of this.particles) {
            ctx.save();
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            ctx.shadowColor = p.color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    renderShockwaves(ctx) {
        for (const sw of this.shockwaves) {
            ctx.save();
            ctx.globalAlpha = sw.alpha;
            ctx.strokeStyle = sw.color;
            ctx.lineWidth = 3;
            ctx.shadowColor = sw.color;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.ellipse(sw.x, sw.y, sw.radius, sw.radius * 0.45, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    renderJudgementText(ctx, cx, cy) {
        if (!this.currentJudgement && this.combo === 0) return;

        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // 1. Judgement Word (PERFECT, GREAT, GOOD, MISS)
        if (this.currentJudgement && this.judgementTimer > 0) {
            const scale = 1.0 + (this.judgementTimer * 0.25);
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);

            let jColor = '#00f2fe';
            if (this.currentJudgement === 'GREAT') jColor = '#4facfe';
            else if (this.currentJudgement === 'GOOD') jColor = '#facc15';
            else if (this.currentJudgement === 'MISS') jColor = '#ef4444';

            ctx.font = '900 32px "Segoe UI", sans-serif';
            ctx.shadowColor = jColor;
            ctx.shadowBlur = 20;
            ctx.fillStyle = jColor;
            ctx.fillText(this.currentJudgement, 0, 0);

            ctx.restore();
        }

        // 2. Combo Counter
        if (this.combo > 1) {
            const comboScale = 1.0 + (this.comboPulse * 0.2);
            ctx.save();
            ctx.translate(cx, cy + 45);
            ctx.scale(comboScale, comboScale);

            ctx.font = '900 42px "Segoe UI", sans-serif';
            ctx.fillStyle = '#ffffff';
            ctx.shadowColor = '#00f2fe';
            ctx.shadowBlur = 16;
            ctx.fillText(`${this.combo}`, 0, 0);

            ctx.font = 'bold 14px "Segoe UI", sans-serif';
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.shadowBlur = 0;
            ctx.fillText('COMBO', 0, 24);

            ctx.restore();
        }

        ctx.restore();
    }

    loop(currentTime) {
        const dt = Math.min((currentTime - this.lastFrameTime) / 1000, 0.1);
        this.lastFrameTime = currentTime;

        try {
            this.update(dt);
            this.render();
        } catch (err) {
            console.error('Frame loop error:', err);
        }

        requestAnimationFrame((t) => this.loop(t));
    }
}

// Global game instance initialization
window.game = null;
function initRhythmGame() {
    if (!window.game && document.getElementById('gameCanvas')) {
        window.game = new RhythmGame();
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRhythmGame);
} else {
    initRhythmGame();
}
