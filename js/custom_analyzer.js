/**
 * Audio Beat Analyzer for Custom Uploaded Songs (MP3, WAV, OGG)
 * Analyzes audio amplitude and spectral flux to dynamically generate a playable 4-lane beatmap.
 */

class CustomSongAnalyzer {
    constructor(soundEngine) {
        this.soundEngine = soundEngine;
    }

    /**
     * Analyzes an uploaded File object and returns a playable song object
     * @param {File} file
     * @param {Function} progressCallback (percent, statusText)
     */
    async analyzeFile(file, progressCallback = () => {}) {
        await this.soundEngine.ensureReady();
        progressCallback(10, '오디오 파일 읽는 중...');

        const arrayBuffer = await file.arrayBuffer();
        progressCallback(30, '오디오 파형 디코딩 중...');

        const audioBuffer = await this.soundEngine.ctx.decodeAudioData(arrayBuffer);
        progressCallback(50, '비트 및 리듬 분석 중...');

        const songData = await this.generateBeatmapFromBuffer(audioBuffer, file.name, progressCallback);
        progressCallback(100, '채보 생성 완료!');

        return {
            ...songData,
            audioBuffer: audioBuffer
        };
    }

    async generateBeatmapFromBuffer(audioBuffer, fileName, progressCallback) {
        const sampleRate = audioBuffer.sampleRate;
        const channelData = audioBuffer.getChannelData(0); // Left channel or mono
        const duration = audioBuffer.duration;

        // Window size for energy calculation (~20ms)
        const windowSize = Math.floor(sampleRate * 0.02);
        const hopSize = Math.floor(windowSize / 2);
        const totalWindows = Math.floor((channelData.length - windowSize) / hopSize);

        const energies = new Float32Array(totalWindows);

        for (let i = 0; i < totalWindows; i++) {
            const startIdx = i * hopSize;
            let sumSquare = 0;
            for (let j = 0; j < windowSize; j += 4) { // Subsampled for fast computation
                const val = channelData[startIdx + j];
                sumSquare += val * val;
            }
            energies[i] = Math.sqrt(sumSquare / (windowSize / 4));
        }

        // Calculate moving average energy (window ~ 0.5 sec)
        const avgWindow = Math.floor(sampleRate * 0.5 / hopSize);
        const peaks = [];
        const minDistanceBetweenNotes = 0.14; // Minimum seconds between notes on same lane
        let lastNoteTime = -1;

        for (let i = avgWindow; i < totalWindows - avgWindow; i++) {
            // Local average
            let localSum = 0;
            for (let k = -avgWindow; k <= avgWindow; k++) {
                localSum += energies[i + k];
            }
            const localMean = localSum / (2 * avgWindow + 1);

            // Is local peak above adaptive threshold?
            const currentEnergy = energies[i];
            const threshold = localMean * 1.45 + 0.015;

            if (currentEnergy > threshold &&
                currentEnergy > energies[i - 1] &&
                currentEnergy > energies[i + 1]) {

                const time = (i * hopSize) / sampleRate;

                // Ensure a 1.5 second lead-in intro so player is ready
                if (time < 1.5) continue;

                // Enforce global minimum onset distance
                if (time - lastNoteTime >= 0.11) {
                    peaks.push({
                        time: time,
                        energy: currentEnergy
                    });
                    lastNoteTime = time;
                }
            }
        }

        progressCallback(80, '4레인 노트 패턴 빌딩 중...');

        // Map peaks to 4 lanes in musical patterns
        const notes = [];
        let noteId = 1;
        let lastLane = 1;
        let comboStreak = 0;

        for (let i = 0; i < peaks.length; i++) {
            const peak = peaks[i];
            const nextPeak = peaks[i + 1];

            // Decide lane variation
            let lane;
            const diffFromLast = peak.time - (notes[notes.length - 1]?.time || 0);

            if (diffFromLast < 0.22) {
                // Rapid stream: step staircase (0 -> 1 -> 2 -> 3 or alternating)
                comboStreak++;
                if (comboStreak % 2 === 0) {
                    lane = (lastLane + 1) % 4;
                } else {
                    lane = (lastLane + 2) % 4;
                }
            } else {
                comboStreak = 0;
                // Distribute across lanes pseudo-randomly but nicely spaced
                const rand = Math.random();
                if (rand < 0.25) lane = 0;
                else if (rand < 0.5) lane = 1;
                else if (rand < 0.75) lane = 2;
                else lane = 3;

                // Avoid 3 same lanes in a row
                if (lane === lastLane) {
                    lane = (lane + 1) % 4;
                }
            }
            lastLane = lane;

            // Long note check: if there is a gap > 0.75s to next note and high energy, create hold note!
            if (nextPeak && (nextPeak.time - peak.time) > 0.75 && peak.energy > 0.08) {
                const rawDuration = Math.min(2.0, (nextPeak.time - peak.time) * 0.75);
                // Snap to 0.25s beat grid for musical precision
                const holdDuration = Math.max(0.5, Math.round(rawDuration / 0.25) * 0.25);
                notes.push({
                    id: noteId++,
                    time: peak.time,
                    lane: lane,
                    type: 'hold',
                    duration: holdDuration
                });
            } else {
                notes.push({
                    id: noteId++,
                    time: peak.time,
                    lane: lane,
                    type: 'tap'
                });
            }
        }

        // Clean filename for display
        const cleanTitle = fileName.replace(/\.[^/.]+$/, "");

        return {
            id: 'custom_' + Date.now(),
            title: cleanTitle,
            artist: '커스텀 트랙',
            bpm: Math.round((notes.length / duration) * 30) || 130, // Approximate BPM indicator
            duration: Math.ceil(duration),
            difficulty: 'CUSTOM',
            level: Math.min(15, Math.max(3, Math.round(notes.length / duration * 1.5))),
            color: '#a855f7',
            previewColor: 'linear-gradient(135deg, #a855f7 0%, #06b6d4 100%)',
            description: `자동 비트 분석 완료! 총 ${notes.length}개의 노트가 생성되었습니다.`,
            notes: notes,
            isCustom: true
        };
    }
}

window.customAnalyzer = new CustomSongAnalyzer(window.soundEngine);
