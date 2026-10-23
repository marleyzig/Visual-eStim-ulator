// js/video_beat_sync.js

document.addEventListener("DOMContentLoaded", () => {
    // Media & UI Elements
    const videoLoader = document.getElementById('videoLoader');
    const videoElement = document.getElementById('beatVideo');
    const detectedHzText = document.getElementById('detectedHzVal');
    
    const canvas = document.getElementById('audioVisualizer');
    const canvasCtx = canvas.getContext('2d');
    const hoverText = document.getElementById('hoverFreqText');
    const beatFlash = document.getElementById('beatFlash');
    
    const pixelTarget = document.getElementById('pixelTarget');
    const pixelResizeHandle = document.getElementById('pixelResizeHandle');
    const panelFilter = document.getElementById('panelFilter');

    // Controls
    const ctrlFilterType = document.getElementById('ctrlFilterType');
    const ctrlFreq = document.getElementById('ctrlFreq');
    const ctrlQ = document.getElementById('ctrlQ');
    const ctrlFFT = document.getElementById('ctrlFFT');
    const ctrlSpike = document.getElementById('ctrlSpike');
    const ctrlFloor = document.getElementById('ctrlFloor');
    const ctrlSmooth = document.getElementById('ctrlSmooth');
    const ctrlRampUp = document.getElementById('ctrlRampUp');
    const ctrlTimeout = document.getElementById('ctrlTimeout');
    const ctrlRampDown = document.getElementById('ctrlRampDown');
    const radioModes = document.querySelectorAll('input[name="detectMode"]');

    // Audio Graph
    let audioCtx = null;
    let analyser = null;
    let source = null;
    let filter = null;
    let isAudioSetup = false;

    // State
    let currentMode = 'energy';
    let lastBeatTime = 0;
    let rawIntervals = [];        
    let currentTargetHz = 0.5;    
    let currentOutputHz = 0.5;    
    let lastSentHz = 0.5;         
    
    let metricHistory = [];
    let prevAudioData = new Uint8Array(1024); 
    let prevPixelData = new Uint8ClampedArray(10000); // Frame buffer for Visual Flux

    const pixelCanvas = document.createElement('canvas');
    const pixelCtx = pixelCanvas.getContext('2d', { willReadFrequently: true });
    pixelCanvas.width = 50; pixelCanvas.height = 50;

    // --- Control Binders ---
    const bindText = (id) => {
        const el = document.getElementById(id);
        const txt = document.getElementById(id.replace('ctrl', 'val'));
        if (el && txt) el.addEventListener('input', e => txt.innerText = e.target.value);
    };
    ['ctrlFreq', 'ctrlQ', 'ctrlSpike', 'ctrlFloor', 'ctrlSmooth', 'ctrlRampUp', 'ctrlTimeout', 'ctrlRampDown'].forEach(bindText);

    ctrlFilterType.addEventListener('change', (e) => { if(filter) filter.type = e.target.value; });
    ctrlFreq.addEventListener('input', (e) => { if(filter) filter.frequency.value = parseFloat(e.target.value); });
    ctrlQ.addEventListener('input', (e) => { if(filter) filter.Q.value = parseFloat(e.target.value); });
    ctrlFFT.addEventListener('change', (e) => { if(analyser) analyser.fftSize = parseInt(e.target.value); });

    radioModes.forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentMode = e.target.value;
            pixelTarget.style.display = (currentMode === 'visual') ? 'block' : 'none';
            panelFilter.style.opacity = (currentMode === 'visual') ? '0.3' : '1.0';
            panelFilter.style.pointerEvents = (currentMode === 'visual') ? 'none' : 'auto';
            metricHistory = []; 
        });
    });

    // --- Visualizer Hover ---
    canvas.addEventListener('mousemove', (e) => {
        if (!audioCtx || !analyser) return;
        const rect = canvas.getBoundingClientRect();
        const binIndex = Math.floor(((e.clientX - rect.left) / rect.width) * analyser.frequencyBinCount);
        hoverText.innerText = `Probe: ~${Math.round((binIndex / analyser.frequencyBinCount) * (audioCtx.sampleRate / 2))} Hz`;
    });
    canvas.addEventListener('mouseleave', () => hoverText.innerText = `Hover to probe Hz`);

    // --- Pixel Box Drag & Resize ---
    let isDraggingBox = false, isResizingBox = false;
    let dragStartX = 0, dragStartY = 0, initialLeft = 0, initialTop = 0, initialWidth = 0, initialHeight = 0;

    pixelTarget.addEventListener('mousedown', (e) => {
        if (e.target === pixelResizeHandle) {
            isResizingBox = true;
        } else {
            isDraggingBox = true;
            pixelTarget.style.cursor = 'grabbing';
        }
        dragStartX = e.clientX; dragStartY = e.clientY;
        initialLeft = pixelTarget.offsetLeft; initialTop = pixelTarget.offsetTop;
        initialWidth = pixelTarget.offsetWidth; initialHeight = pixelTarget.offsetHeight;
        pixelTarget.style.transform = 'none'; 
        pixelTarget.style.left = initialLeft + 'px'; pixelTarget.style.top = initialTop + 'px';
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (isDraggingBox) {
            pixelTarget.style.left = `${initialLeft + (e.clientX - dragStartX)}px`;
            pixelTarget.style.top = `${initialTop + (e.clientY - dragStartY)}px`;
        } else if (isResizingBox) {
            const dx = e.clientX - dragStartX;
            const dy = e.clientY - dragStartY;
            let newWidth = initialWidth + dx;
            let newHeight = initialHeight - dy; // Moving mouse UP (negative dy) increases height
            
            if (newWidth >= 20) pixelTarget.style.width = `${newWidth}px`;
            if (newHeight >= 20) {
                pixelTarget.style.height = `${newHeight}px`;
                pixelTarget.style.top = `${initialTop + dy}px`; // Shift top anchor to match height change
            }
        }
    });

    document.addEventListener('mouseup', () => {
        isDraggingBox = false; isResizingBox = false;
        pixelTarget.style.cursor = 'grab';
    });

    // --- Loading & Web Audio Setup ---
    videoLoader.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        videoElement.src = URL.createObjectURL(file);
        videoElement.load();
    });

    videoElement.addEventListener('play', () => {
        // ONLY hijack the audio engine if we are in Energy or Transient mode
        if (currentMode !== 'visual' && !isAudioSetup) { 
            setupAudioRouting(); 
            isAudioSetup = true; 
        }
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
        
        const rect = canvas.getBoundingClientRect();
        if (rect.width > 0) {
            canvas.width = rect.width; 
            canvas.height = rect.height;
        }
        requestAnimationFrame(detectBeat);
    });
	
	// --- Canvas Resize Fix for Accordion ---
    const detailsVisualizer = document.getElementById('detailsVisualizer');
    if (detailsVisualizer) {
        detailsVisualizer.addEventListener('toggle', () => {
            if (detailsVisualizer.open) {
                const rect = canvas.getBoundingClientRect();
                if (rect.width > 0) {
                    canvas.width = rect.width;
                    canvas.height = rect.height;
                }
            }
        });
    }

    function setupAudioRouting() {
        // Create the context
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        
        // --- NEW: Force unlock the context if the browser suspended it ---
        if (audioCtx.state === 'suspended') {
            audioCtx.resume().then(() => {
                console.log("AudioContext successfully resumed.");
            });
        }
        
        source = audioCtx.createMediaElementSource(videoElement);
        
        filter = audioCtx.createBiquadFilter();
        filter.type = ctrlFilterType.value;
        filter.frequency.value = parseFloat(ctrlFreq.value);
        filter.Q.value = parseFloat(ctrlQ.value);
        
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = parseInt(ctrlFFT.value);
        analyser.smoothingTimeConstant = 0.8;
        
        // Split 1: Unaltered music to speakers
        source.connect(audioCtx.destination); 
        // Split 2: Audio to the math engine
        source.connect(filter);
        filter.connect(analyser);
    }

    // --- Main Detection Loop ---
    function detectBeat() {
        if (videoElement.paused || videoElement.ended) return;
        requestAnimationFrame(detectBeat);

        let currentMetric = 0;
        const data = new Uint8Array(analyser ? analyser.frequencyBinCount : 0);
        if (analyser && currentMode !== 'visual') analyser.getByteFrequencyData(data); 

        // 1. ENGINE MATH
        if (currentMode === 'energy') {
            let sum = 0;
            for (let i = 0; i < data.length; i++) sum += data[i];
            currentMetric = sum / data.length;
            
        } else if (currentMode === 'transient') {
            let flux = 0;
            for (let i = 0; i < data.length; i++) {
                let diff = data[i] - prevAudioData[i];
                if (diff > 0) flux += diff; 
            }
            prevAudioData.set(data);
            currentMetric = Math.min(255, flux / (data.length * 0.15)); 
            
        } else if (currentMode === 'visual') {
            // Visual Flux (Frame Difference) for perfect grey-dot capture
            const scaleX = videoElement.videoWidth / videoElement.clientWidth;
            const scaleY = videoElement.videoHeight / videoElement.clientHeight;
            
            pixelCtx.drawImage(videoElement, pixelTarget.offsetLeft * scaleX, pixelTarget.offsetTop * scaleY, pixelTarget.offsetWidth * scaleX, pixelTarget.offsetHeight * scaleY, 0, 0, 50, 50);
            const frameData = pixelCtx.getImageData(0, 0, 50, 50).data;
            
            let totalDiff = 0;
            for(let i=0; i<frameData.length; i+=4) {
                let currentLuma = (frameData[i]*0.299 + frameData[i+1]*0.587 + frameData[i+2]*0.114);
                let prevLuma = (prevPixelData[i]*0.299 + prevPixelData[i+1]*0.587 + prevPixelData[i+2]*0.114);
                totalDiff += Math.abs(currentLuma - prevLuma);
            }
            prevPixelData.set(frameData);
            currentMetric = Math.min(255, (totalDiff / (frameData.length / 4)) * 4.0);
        }

        // 2. AVERAGING & TRIGGER
        metricHistory.push(currentMetric);
        if (metricHistory.length > 45) metricHistory.shift(); 
        let avgMetric = metricHistory.reduce((a, b) => a + b, 0) / metricHistory.length;
        
        let now = performance.now();
        let spikeMult = 1.0 + (parseFloat(ctrlSpike.value) / 100.0); 
        let floorVol = parseFloat(ctrlFloor.value);
        
        if (currentMetric > avgMetric * spikeMult && currentMetric > floorVol && (now - lastBeatTime > 250)) {
            let dt = now - lastBeatTime; 
            lastBeatTime = now;
            
            rawIntervals.push(dt);
            let maxHistory = parseInt(ctrlSmooth.value);
            while(rawIntervals.length > maxHistory) rawIntervals.shift();

            let instantHz = 0.5;
            
            if (currentMode === 'visual') {
                // Mean (Blended) Average: Smooths out chunky video framerate jitter
                let sumDt = rawIntervals.reduce((a, b) => a + b, 0);
                let meanDt = sumDt / rawIntervals.length;
                instantHz = 1000 / meanDt;
            } else {
                // Median (Middle) Average: Rejects false double-beats in audio
                let sorted = [...rawIntervals].sort((a, b) => a - b);
                let mid = Math.floor(sorted.length / 2);
                let medianDt = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
                instantHz = 1000 / medianDt;
            }
            
            currentTargetHz = Math.max(0.5, Math.min(5.0, instantHz));

            beatFlash.style.opacity = 1.0;
            beatFlash.style.transition = 'none';
            setTimeout(() => { beatFlash.style.transition = 'opacity 0.3s'; beatFlash.style.opacity = 0; }, 50);
        }

        // 3. SMOOTHING & DECAY
        if ((now - lastBeatTime) / 1000.0 > parseFloat(ctrlTimeout.value)) {
            currentTargetHz = 0.5;
            currentOutputHz += (currentTargetHz - currentOutputHz) * parseFloat(ctrlRampDown.value);
            if (rawIntervals.length > 0) rawIntervals = [];
        } else {
            currentOutputHz += (currentTargetHz - currentOutputHz) * parseFloat(ctrlRampUp.value);
        }

        // 4. DISPATCH
        if (Math.abs(currentOutputHz - lastSentHz) >= 0.01) {
            detectedHzText.innerText = currentOutputHz.toFixed(2);
            document.querySelectorAll('.deck').forEach(deck => {
                const syncToggle = deck.querySelector('.syncBeatToggle');
                
                // Target .seqSpeed for 4-Phase, or .masterAmFreq for 3-Phase
                const speedSlider = deck.querySelector('.seqSpeed') || deck.querySelector('.masterAmFreq');
                
                if (syncToggle && syncToggle.checked && speedSlider) {
                    speedSlider.value = currentOutputHz.toFixed(2);
                    speedSlider.dispatchEvent(new Event('input')); 
                }
            });
            lastSentHz = currentOutputHz;
        }

        // 5. DRAW
        drawSpectrum(data, currentMetric, avgMetric * spikeMult, floorVol);
    }

    function drawSpectrum(data, currentMetric, thresholdTarget, floorVol) {
        const w = canvas.width, h = canvas.height;
        canvasCtx.fillStyle = '#000';
        canvasCtx.fillRect(0, 0, w, h);

        if (currentMode !== 'visual') {
            // --- 1. CALCULATE FILTER WINDOW ---
            const nyquist = audioCtx ? audioCtx.sampleRate / 2 : 24000;
            const targetFreq = parseFloat(ctrlFreq.value);
            const qFactor = parseFloat(ctrlQ.value);
            const filterType = ctrlFilterType.value;

            // Map a frequency (Hz) to an exact X-pixel on the canvas
            const mapFreqToX = (f) => Math.max(0, Math.min(w, (f / nyquist) * w));
            const targetX = mapFreqToX(targetFreq);

            // --- 2. DRAW FILTER OVERLAY ---
            canvasCtx.fillStyle = 'rgba(178, 102, 255, 0.15)'; // Faint purple shading
            canvasCtx.strokeStyle = 'rgba(178, 102, 255, 0.8)'; // Solid purple border
            canvasCtx.lineWidth = 2;

            // ... (keep the if/else statements for the filter types exactly the same) ...
            if (filterType === 'lowpass' || filterType === 'lowshelf') {
                canvasCtx.fillRect(0, 0, targetX, h);
                canvasCtx.beginPath(); canvasCtx.moveTo(targetX, 0); canvasCtx.lineTo(targetX, h); canvasCtx.stroke();
            } else if (filterType === 'highpass') {
                canvasCtx.fillRect(targetX, 0, w - targetX, h);
                canvasCtx.beginPath(); canvasCtx.moveTo(targetX, 0); canvasCtx.lineTo(targetX, h); canvasCtx.stroke();
            } else if (filterType === 'bandpass') {
                // Calculate bandwidth window based on Q-Factor
                const bandwidth = targetFreq / qFactor;
                const startX = mapFreqToX(targetFreq - (bandwidth / 2));
                const endX = mapFreqToX(targetFreq + (bandwidth / 2));
                
                // Draw shaded window
                canvasCtx.fillRect(startX, 0, endX - startX, h);
                
                // Draw outer boundary lines
                canvasCtx.lineWidth = 1;
                canvasCtx.beginPath(); canvasCtx.moveTo(startX, 0); canvasCtx.lineTo(startX, h); canvasCtx.stroke();
                canvasCtx.beginPath(); canvasCtx.moveTo(endX, 0); canvasCtx.lineTo(endX, h); canvasCtx.stroke();
                
                // Draw solid center line
                canvasCtx.lineWidth = 2;
                canvasCtx.beginPath(); canvasCtx.moveTo(targetX, 0); canvasCtx.lineTo(targetX, h); canvasCtx.stroke();
            }

            // --- 3. DRAW AUDIO BARS (Fixed Scaling) ---
            const barWidth = w / data.length;
            for (let i = 0; i < data.length; i++) {
                const barHeight = (data[i] / 255) * h;
                canvasCtx.fillStyle = `rgb(${barHeight + (25 * (i / data.length))},${250 * (i / data.length)},50)`;
                // Fix: Uses strict barWidth so it perfectly fits the canvas edge
                canvasCtx.fillRect(i * barWidth, h - barHeight, barWidth > 1 ? barWidth - 1 : barWidth, barHeight);
            }
        } else {
            // Visual Mode Grid
            canvasCtx.strokeStyle = '#222';
            canvasCtx.lineWidth = 1;
            canvasCtx.beginPath();
            for(let i=0; i<w; i+=20) { canvasCtx.moveTo(i,0); canvasCtx.lineTo(i,h); }
            for(let i=0; i<h; i+=20) { canvasCtx.moveTo(0,i); canvasCtx.lineTo(w,i); }
            canvasCtx.stroke();
        }

        // --- 4. DRAW THRESHOLD METRICS ---
        canvasCtx.fillStyle = '#fff'; canvasCtx.fillRect(w - 20, h - ((currentMetric / 255) * h), 20, 3);
        
        // Update the threshold target bar from '#0af' to use the CSS variable
        canvasCtx.fillStyle = 'var(--purple)'; 
        canvasCtx.fillRect(w - 20, h - ((thresholdTarget / 255) * h), 20, 2);
        
        canvasCtx.fillStyle = 'rgba(255, 0, 0, 0.5)'; canvasCtx.fillRect(0, h - ((floorVol / 255) * h), w, 1);
    }
});