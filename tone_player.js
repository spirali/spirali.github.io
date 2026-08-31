function createToneWidget(containerId, config) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const defaults = {
        frequencies: [],
        labels: [],
        toneDuration: 0.5, // seconds for sequence & chord
        individualToneDuration: 0.3, // seconds for individual click
        gapDuration: 0.2,    // seconds between tones in sequence
    };
    const settings = { ...defaults, ...config };

    // --- State Variables ---
    let audioCtx = null;
    let currentOscillator = null; // To stop individual tones
    let finalChordOscillators = []; // To stop the "play all" tones
    let isPlayingSequence = false;
    let stopPlaybackSequence = false; // Flag to stop the sequence

    // --- SVG Icons ---
    const playIcon = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
    const stopIcon = `<svg viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>`;
    const playAllIcon = `
<svg viewBox="0 0 24 24">
  <path d="M6 8l6 8 6-8z"/>
  <path d="M6 2l6 8 6-8z"/>
</svg>`;
    // --- Create HTML Structure ---
    const widget = document.createElement('div');
    widget.className = 'tone-sequencer';

    const playButton = document.createElement('button');
    playButton.className = 'play-btn';
    playButton.innerHTML = playIcon;
    widget.appendChild(playButton);

    const toneElements = [];
    settings.frequencies.forEach((freq, index) => {
        const toneItem = document.createElement('div');
        toneItem.className = 'tone-item';
        toneItem.dataset.frequency = freq; // Store frequency in dataset

        const label = settings.labels[index];
        if (label) {
            const labelSpan = document.createElement('span');
            labelSpan.className = 'tone-label';
            labelSpan.textContent = label;
            toneItem.appendChild(labelSpan);
        }

        const freqSpan = document.createElement('span');
        freqSpan.className = 'tone-freq';
        freqSpan.textContent = `${parseFloat(freq.toFixed(2))} Hz`;
        toneItem.appendChild(freqSpan);
        
        widget.appendChild(toneItem);
        toneElements.push(toneItem);
    });

    // New "Play All" button
    const playAllButton = document.createElement('button');
    playAllButton.className = 'play-all-btn';
    playAllButton.innerHTML = playAllIcon;
    widget.appendChild(playAllButton);

    container.innerHTML = '';
    container.appendChild(widget);

    // --- Audio & Playback Logic ---

    function getAudioContext() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        return audioCtx;
    }

    function playTone(frequency, duration, highlightElement = null) {
        const ctx = getAudioContext();
        if (!ctx) return;

        if (currentOscillator) {
            currentOscillator.stop();
            currentOscillator = null;
        }
        
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
        
        gainNode.gain.setValueAtTime(1, ctx.currentTime);

        oscillator.connect(gainNode).connect(ctx.destination);
        oscillator.start(0);
        oscillator.stop(ctx.currentTime + duration);

        currentOscillator = oscillator;

        if (highlightElement) {
            highlightElement.classList.add('playing');
            setTimeout(() => {
                highlightElement.classList.remove('playing');
            }, duration * 1000);
        }

        oscillator.onended = () => {
            if (currentOscillator === oscillator) {
                currentOscillator = null;
            }
        };
    }

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    function stopFinalChord() {
        finalChordOscillators.forEach(osc => {
            try { osc.stop(); } catch(e) { /* Ignore errors */ }
        });
        finalChordOscillators = [];
    }

    async function startSequence() {
        if (isPlayingSequence) return;

        // Stop any other sounds before starting sequence
        stopFinalChord();
        if (currentOscillator) {
            currentOscillator.stop();
        }

        isPlayingSequence = true;
        stopPlaybackSequence = false;
        playButton.className = 'stop-btn';
        playButton.innerHTML = stopIcon;
        
        toneElements.forEach(el => el.classList.remove('playing'));

        for (let i = 0; i < toneElements.length; i++) {
            if (stopPlaybackSequence) break;

            const currentElement = toneElements[i];
            const freq = parseFloat(currentElement.dataset.frequency);

            currentElement.classList.add('playing');
            playTone(freq, settings.toneDuration);

            await sleep(settings.toneDuration * 1000);
            currentElement.classList.remove('playing');

            if (i < toneElements.length - 1 && !stopPlaybackSequence) {
                await sleep(settings.gapDuration * 1000);
            }
        }
        
        isPlayingSequence = false;
        playButton.className = 'play-btn';
        playButton.innerHTML = playIcon;
    }
    
    async function playAllTones() {
        // Stop any other sounds that might be playing
        stopFinalChord();
        if (currentOscillator) {
            currentOscillator.stop();
            currentOscillator = null;
        }
        if (isPlayingSequence) {
            stopPlaybackSequence = true; // Signal sequence to stop
            await sleep(50); // Give it a moment to react
        }
        toneElements.forEach(el => el.classList.remove('playing')); // Clear highlights

        const ctx = getAudioContext();
        if (!ctx) return;

        const duration = settings.toneDuration;
        toneElements.forEach(el => el.classList.add('playing'));

        settings.frequencies.forEach(freq => {
            const oscillator = ctx.createOscillator();
            const gainNode = ctx.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.value = freq;

            const now = ctx.currentTime;
            const targetGain = 1.0 / settings.frequencies.length; // Prevent clipping
            gainNode.gain.setValueAtTime(0, now);
            gainNode.gain.linearRampToValueAtTime(targetGain, now + 0.1); // Fade in
            gainNode.gain.linearRampToValueAtTime(targetGain, now + duration - 0.1); // Hold
            gainNode.gain.linearRampToValueAtTime(0, now + duration); // Fade out

            oscillator.connect(gainNode).connect(ctx.destination);
            oscillator.start(now);
            oscillator.stop(now + duration);
            finalChordOscillators.push(oscillator);
        });

        await sleep(duration * 1000);
        
        // Cleanup after natural playback
        finalChordOscillators = [];
        toneElements.forEach(el => el.classList.remove('playing'));
    }

    playButton.addEventListener('click', () => {
        if (isPlayingSequence) {
            stopPlaybackSequence = true;
        } else {
            startSequence();
        }
    });

    playAllButton.addEventListener('click', playAllTones);

    toneElements.forEach((item) => {
        item.addEventListener('click', () => {
            if (isPlayingSequence) {
                stopPlaybackSequence = true;
            }
            stopFinalChord(); 

            setTimeout(() => {
                playTone(parseFloat(item.dataset.frequency), settings.individualToneDuration, item);
            }, 50); 
        });
    });
}