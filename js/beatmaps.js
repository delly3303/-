/**
 * Beatmaps & Song Library
 * Predefined songs with high quality synchronized note charts.
 */

// Generate rhythmic beat patterns algorithmically to match the synthesized music
function generateChart(bpm, duration, difficulty = 'normal', chartType = 'neon') {
    const beatSec = 60 / bpm;
    const notes = [];
    let noteId = 1;

    const totalBars = Math.floor(duration / (beatSec * 4));
    const introBars = 1; // 1-bar intro lead-in so player hears beat before first note

    // Rhythm templates based on chartType
    for (let bar = introBars; bar < totalBars; bar++) {
        const barStart = bar * beatSec * 4;

        if (chartType === 'neon') {
            // Neon Skyline (128 BPM): Beginner / Intermediate friendly
            // Bar style alternates between steady kicks and melody fills
            const pattern = bar % 4;

            if (pattern === 0) {
                // Quarter notes on 1, 2, 3, 4 (Kick & Snare beats)
                for (let b = 0; b < 4; b++) {
                    const lane = [0, 1, 2, 3][(bar + b) % 4];
                    notes.push({ id: noteId++, time: barStart + b * beatSec, lane, type: 'tap' });
                }
            } else if (pattern === 1) {
                // 8th note rhythm
                for (let b = 0; b < 4; b++) {
                    notes.push({ id: noteId++, time: barStart + b * beatSec, lane: b % 2 === 0 ? 0 : 3, type: 'tap' });
                    if (b % 2 === 0) {
                        notes.push({ id: noteId++, time: barStart + (b + 0.5) * beatSec, lane: 1 + (b % 2), type: 'tap' });
                    }
                }
            } else if (pattern === 2) {
                // Hold notes showcase (strictly aligned to 2 beats)
                notes.push({ id: noteId++, time: barStart, lane: 0, type: 'hold', duration: beatSec * 2.0 });
                notes.push({ id: noteId++, time: barStart + beatSec * 1.0, lane: 2, type: 'tap' });
                notes.push({ id: noteId++, time: barStart + beatSec * 2.0, lane: 3, type: 'hold', duration: beatSec * 2.0 });
                notes.push({ id: noteId++, time: barStart + beatSec * 3.0, lane: 1, type: 'tap' });
            } else {
                // Staircase flow: 0 -> 1 -> 2 -> 3
                for (let step = 0; step < 8; step++) {
                    const lane = step < 4 ? step : (7 - step);
                    notes.push({ id: noteId++, time: barStart + step * (beatSec * 0.5), lane, type: 'tap' });
                }
            }

        } else if (chartType === 'starlight') {
            // Starlight Velocity (150 BPM): Fast & Energetic (Hard)
            const pattern = bar % 4;

            if (pattern === 0 || pattern === 2) {
                // Dual taps & alternating doubles
                for (let b = 0; b < 4; b++) {
                    if (b === 0 || b === 2) {
                        notes.push({ id: noteId++, time: barStart + b * beatSec, lane: 0, type: 'tap' });
                        notes.push({ id: noteId++, time: barStart + b * beatSec, lane: 3, type: 'tap' });
                    } else {
                        notes.push({ id: noteId++, time: barStart + b * beatSec, lane: 1, type: 'tap' });
                        notes.push({ id: noteId++, time: barStart + b * beatSec, lane: 2, type: 'tap' });
                    }
                    // Offbeat single
                    notes.push({ id: noteId++, time: barStart + (b + 0.5) * beatSec, lane: (bar + b) % 4, type: 'tap' });
                }
            } else if (pattern === 1) {
                // Hold note on left hand while right hand plays trill (clean 3-beat duration)
                notes.push({ id: noteId++, time: barStart, lane: 0, type: 'hold', duration: beatSec * 3.0 });
                for (let b = 0; b < 6; b++) {
                    notes.push({ id: noteId++, time: barStart + (0.5 + b * 0.5) * beatSec, lane: 2 + (b % 2), type: 'tap' });
                }
            } else {
                // Fast 16th streams (bursts of 4)
                for (let b = 0; b < 4; b++) {
                    notes.push({ id: noteId++, time: barStart + b * beatSec, lane: b, type: 'tap' });
                    notes.push({ id: noteId++, time: barStart + (b + 0.25) * beatSec, lane: (b + 1) % 4, type: 'tap' });
                    notes.push({ id: noteId++, time: barStart + (b + 0.5) * beatSec, lane: (b + 2) % 4, type: 'tap' });
                }
            }

        } else if (chartType === 'quantum') {
            // Quantum Hyperdrive (175 BPM): Insane / Master
            const pattern = bar % 5;

            if (pattern === 0) {
                // Dense 16th stream
                for (let s = 0; s < 12; s++) {
                    const lane = [0, 1, 2, 3, 2, 1, 0, 1, 3, 2, 1, 0][s % 12];
                    notes.push({ id: noteId++, time: barStart + s * (beatSec * 0.25), lane, type: 'tap' });
                }
                // Double chord at the end of bar
                notes.push({ id: noteId++, time: barStart + beatSec * 3.5, lane: 0, type: 'tap' });
                notes.push({ id: noteId++, time: barStart + beatSec * 3.5, lane: 3, type: 'tap' });
            } else if (pattern === 1 || pattern === 3) {
                // Jackhammer / rapid double hits
                for (let b = 0; b < 4; b++) {
                    notes.push({ id: noteId++, time: barStart + b * beatSec, lane: b % 2 === 0 ? 0 : 3, type: 'tap' });
                    notes.push({ id: noteId++, time: barStart + (b + 0.25) * beatSec, lane: b % 2 === 0 ? 0 : 3, type: 'tap' });
                    notes.push({ id: noteId++, time: barStart + (b + 0.5) * beatSec, lane: 1, type: 'tap' });
                    notes.push({ id: noteId++, time: barStart + (b + 0.5) * beatSec, lane: 2, type: 'tap' });
                }
            } else if (pattern === 2) {
                // Dual holds with center taps (clean 2-beat holds)
                notes.push({ id: noteId++, time: barStart, lane: 0, type: 'hold', duration: beatSec * 2.0 });
                notes.push({ id: noteId++, time: barStart, lane: 3, type: 'hold', duration: beatSec * 2.0 });
                notes.push({ id: noteId++, time: barStart + beatSec * 0.5, lane: 1, type: 'tap' });
                notes.push({ id: noteId++, time: barStart + beatSec * 1.0, lane: 2, type: 'tap' });
                notes.push({ id: noteId++, time: barStart + beatSec * 1.5, lane: 1, type: 'tap' });

                notes.push({ id: noteId++, time: barStart + beatSec * 2.0, lane: 1, type: 'hold', duration: beatSec * 2.0 });
                notes.push({ id: noteId++, time: barStart + beatSec * 2.0, lane: 2, type: 'hold', duration: beatSec * 2.0 });
                notes.push({ id: noteId++, time: barStart + beatSec * 2.5, lane: 0, type: 'tap' });
                notes.push({ id: noteId++, time: barStart + beatSec * 3.0, lane: 3, type: 'tap' });
                notes.push({ id: noteId++, time: barStart + beatSec * 3.5, lane: 0, type: 'tap' });
            } else {
                // High-speed sweep
                for (let s = 0; s < 16; s++) {
                    notes.push({ id: noteId++, time: barStart + s * (beatSec * 0.25), lane: s % 4, type: 'tap' });
                }
            }
        }
    }

    // Sort notes chronologically
    notes.sort((a, b) => a.time - b.time);
    return notes;
}

const BUILTIN_SONGS = [
    {
        id: 'neon_skyline',
        title: 'Neon Skyline',
        artist: 'Antigravity Soundworks',
        bpm: 128,
        duration: 52, // 52 seconds
        difficulty: 'NORMAL',
        level: 5,
        color: '#00f2fe',
        previewColor: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
        description: '부드러운 신스웨이브 비트와 상쾌한 리듬. 입문자 및 중급자 추천!',
        notes: generateChart(128, 52, 'normal', 'neon')
    },
    {
        id: 'starlight_velocity',
        title: 'Starlight Velocity',
        artist: 'Cyber Pulse Unit',
        bpm: 150,
        duration: 56, // 56 seconds
        difficulty: 'HARD',
        level: 9,
        color: '#f093fb',
        previewColor: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
        description: '몰아치는 드럼앤베이스와 빠른 16비트 계단 패턴. 화려한 연타 도전!',
        notes: generateChart(150, 56, 'hard', 'starlight')
    },
    {
        id: 'quantum_hyperdrive',
        title: 'Quantum Hyperdrive',
        artist: 'Overdrive X',
        bpm: 175,
        duration: 54, // 54 seconds
        difficulty: 'EXPERT',
        level: 13,
        color: '#ff0844',
        previewColor: 'linear-gradient(135deg, #ff0844 0%, #ffb199 100%)',
        description: '175 BPM 극한의 초고속 유로비트! 복합 롱노트와 폭풍 연타의 한계 돌파.',
        notes: generateChart(175, 54, 'expert', 'quantum')
    }
];

window.BUILTIN_SONGS = BUILTIN_SONGS;
