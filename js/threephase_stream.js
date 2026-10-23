// js/threephase_stream.js

export class ThreePhaseSequencer {
    constructor(containerId, defaultWs) {
        this.id = containerId;
        this.container = document.getElementById(containerId);
        
        // --- State Variables ---
        this.ws = null;
        this.lastUpdate = 0;
        this.STREAM_INTERVAL_MS = 33;
        this.MAX_ESTIM_FREQ = 2000;
        this.logCounter = 0;

        // Spatial & Math State
        this.cX = 0.5;
        this.cY = 0.5;
        this.sX = 0.5;
        this.sY = 0.5;
        this.driftingToCenter = false;
        this.DRIFT_SPEED = 0.005;
        this.traceHistory = [];
        this.isDragging = false;

        // Playback State
        this.isPlaying = { left: false, right: false };

        // Auto Spatial Variables
        this.isAutoMode = false;
        this.autoRadius = 0.5;
        this.autoSpeed = 0.2;
        this.autoOriginX = 0.5;
        this.autoOriginY = 0.5;

        // Power Dot Pendulum Variables
        this.powerMotionType = 'orbit';
        this.powerSweepSpeed = 0.5;
        this.powerSweepArc = 360;
        this.powerEndPause = 0;
        this.currentPowerAngle = 0;
        this.powerDir = 1;
        this.powerPauseTimer = 0;
        
        // --- NEW: Phase Integration Variables ---
        // Instead of calculating based on absolute time, we accumulate phase using Delta Time (dt)
        // This prevents the dot from teleporting when speeds change.
        this.lastFrameTime = performance.now() / 1000.0;
        this.amPhaseL = 0;
        this.amPhaseR = Math.PI / 2; // 90-degree offset creates the circular orbit
        this.fmPhaseL = 0;
        this.fmPhaseR = 0;
        this.tremPhaseL = 0;
        this.tremPhaseR = 0;
        this.autoPhase = 0;

        // Bind Methods
        this.mainLoop = this.mainLoop.bind(this);
        this.updateCenterFromEvent = this.updateCenterFromEvent.bind(this);
        
        // Isolate Radio Button Groups
        this.container.querySelectorAll('input[type="radio"]').forEach(radio => {
            radio.name = radio.name + '_' + this.id;
        });

        // Initialize UI and Events
        this.initElements();
        this.initEvents();
        this.setupTabs();
        this.setupChannels();
        this.setupSpatialControls();

        // Connect Default WebSockets
        this.wsAddress.value = defaultWs;
        
        // Start Engine
        requestAnimationFrame(this.mainLoop);
    }

    initElements() {
        this.wsAddress = this.container.querySelector('.wsAddress');
        this.wsPresetSelect = this.container.querySelector('.wsPresetSelect');
        this.btnConnect = this.container.querySelector('.connectStreamBtn');
        this.streamStatus = this.container.querySelector('.streamStatus');
        this.wsSummaryStatus = this.container.querySelector('.wsSummaryStatus');
        this.wsContainer = this.container.querySelector('.wsContainer');
        this.btnPlayStop = this.container.querySelector('.mainPlayStop');
        
        this.masterVol = this.container.querySelector('.masterVol');
        this.masterVolText = this.container.querySelector('.masterVolText');
        
        this.freqRangeText = this.container.querySelector('.carrierFreqRangeText');
        this.freqRangeBar = this.container.querySelector('.carrierFreqRangeBar');
        this.freqDot = this.container.querySelector('.carrierFreqDot');
        this.syncFreqToggle = this.container.querySelector('.syncFreqToggle');

        this.canvas = this.container.querySelector('.joystickCanvas');
        this.ctx = this.canvas ? this.canvas.getContext('2d') : null;
        this.btnReset = this.container.querySelector('.btnCenterReset');
        
        this.gPulseFreq = this.container.querySelector('.globalPulseFreq');
        this.gPulseWidth = this.container.querySelector('.globalPulseWidth');
        this.rotationAngle = this.container.querySelector('.rotationAngle');
    }

    initEvents() {
        this.btnConnect.addEventListener('click', () => {
            if (this.ws) this.ws.close();
            this.ws = new WebSocket(this.wsAddress.value);
            
            this.ws.onopen = () => {
                this.streamStatus.textContent = 'Connected';
                this.streamStatus.style.color = '#0f9';
                if (this.wsSummaryStatus) {
                    this.wsSummaryStatus.textContent = 'Connected';
                    this.wsSummaryStatus.style.color = '#0f9';
                    this.wsSummaryStatus.style.fontWeight = 'bold';
                }
                if (this.wsContainer) {
                    this.wsContainer.style.borderColor = '#0f9';
                    this.wsContainer.open = false; 
                }
            };
            
            this.ws.onclose = () => {
                this.streamStatus.textContent = 'Disconnected';
                this.streamStatus.style.color = '#f55';
                if (this.wsSummaryStatus) {
                    this.wsSummaryStatus.textContent = 'Disconnected';
                    this.wsSummaryStatus.style.color = '#777';
                    this.wsSummaryStatus.style.fontWeight = 'normal';
                }
                if (this.wsContainer) {
                    this.wsContainer.style.borderColor = '#333';
                }
            };
        });

        if (this.wsPresetSelect && this.wsAddress) {
            this.wsPresetSelect.addEventListener('change', (e) => this.wsAddress.value = e.target.value);
        }

        this.btnPlayStop.addEventListener('click', () => {
            const isCurrentlyPlaying = Object.values(this.isPlaying).some(v => v);
            const willPlay = !isCurrentlyPlaying;
            
            ['left', 'right'].forEach(s => {
                this.isPlaying[s] = willPlay;
            });
            
            this.btnPlayStop.textContent = willPlay ? '⏹ Stop Deck' : '▶ Start Deck';
            this.btnPlayStop.style.background = willPlay ? '#f55' : '#0f9';
            this.btnPlayStop.style.color = willPlay ? '#fff' : '#000';
        });

        if (this.masterVol && this.masterVolText) {
            this.masterVol.addEventListener('input', (e) => this.masterVolText.value = e.target.value);
            this.masterVolText.addEventListener('change', (e) => {
                let v = parseInt(e.target.value) || 100;
                v = Math.max(0, Math.min(100, v));
                this.masterVol.value = v;
                this.masterVolText.value = v;
            });
        }

        if (this.canvas) {
            this.canvas.addEventListener('mousedown', (e) => { this.isDragging = true; this.updateCenterFromEvent(e); });
            window.addEventListener('mousemove', (e) => { if (this.isDragging) this.updateCenterFromEvent(e); });
            window.addEventListener('mouseup', () => { this.isDragging = false; });
            
            this.canvas.addEventListener('touchstart', (e) => { this.isDragging = true; this.updateCenterFromEvent(e); e.preventDefault(); }, {passive: false});
            window.addEventListener('touchmove', (e) => { if (this.isDragging) { this.updateCenterFromEvent(e); e.preventDefault(); } }, {passive: false});
            window.addEventListener('touchend', () => { this.isDragging = false; });
        }

        if (this.btnReset) this.btnReset.addEventListener('click', () => this.driftingToCenter = true);

        ['globalPulseFreq', 'globalPulseWidth', 'rotationAngle'].forEach(id => {
            const el = this.container.querySelector(`.${id}`);
            const val = this.container.querySelector(`.${id}Val`);
            if (el && val) el.addEventListener('input', e => val.innerText = e.target.value);
        });

        ['left', 'right'].forEach(side => {
            ['TremDepth', 'TremFreq'].forEach(prop => {
                const slider = this.container.querySelector(`.${side}${prop}`);
                const val = this.container.querySelector(`.${side}${prop}Val`);
                if (slider && val) slider.addEventListener('input', e => val.innerText = prop === 'TremFreq' ? parseFloat(e.target.value).toFixed(2) : e.target.value);
            });
        });
    }

    setupTabs() {
        const tabButtons = this.container.querySelectorAll('.btnTab');
        const displayPanes = this.container.querySelectorAll('.pane');
        const emptyState = this.container.querySelector('.emptyState');

        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetPaneClass = btn.getAttribute('data-target');
                if (btn.classList.contains('activeTab')) {
                    btn.classList.remove('activeTab');
                    btn.style.background = '#333';
                    btn.style.borderColor = '#555';
                    displayPanes.forEach(p => p.style.display = 'none');
                    if (emptyState) emptyState.style.display = 'block';
                    return;
                }
                tabButtons.forEach(t => { 
                    t.classList.remove('activeTab'); 
                    t.style.background = '#333';
                    t.style.borderColor = '#555';
                });
                displayPanes.forEach(p => p.style.display = 'none');
                btn.classList.add('activeTab');
                btn.style.background = '#1a1a1a'; 
                btn.style.borderColor = 'var(--purple)';
                const targetPane = this.container.querySelector('.' + targetPaneClass);
                if (targetPane) targetPane.style.display = 'block';
            });
        });
    }

    setupChannels() {
        if (this.syncFreqToggle) {
            this.syncFreqToggle.addEventListener('change', (e) => {
                if (e.target.checked) {
                    const leftSlider = this.container.querySelector('.leftFreq');
                    const rightSlider = this.container.querySelector('.rightFreq');
                    if (leftSlider && rightSlider && leftSlider.value !== rightSlider.value) {
                        rightSlider.value = leftSlider.value;
                        rightSlider.dispatchEvent(new Event('input'));
                    }
                }
            });
        }

        ['left', 'right'].forEach(side => {
            const freqSlider = this.container.querySelector(`.${side}Freq`);
            const fmDepthSlider = this.container.querySelector(`.${side}FmDepth`);
            const fmDepthText = this.container.querySelector(`.${side}FmDepthText`);

            if (freqSlider) freqSlider.max = this.MAX_ESTIM_FREQ;

            const updateFmHeadroom = () => {
                if (freqSlider && fmDepthSlider) {
                    const currentFreq = parseFloat(freqSlider.value) || 0;
                    const maxFm = Math.min(currentFreq, this.MAX_ESTIM_FREQ - currentFreq);
                    fmDepthSlider.max = maxFm;
                    
                    if (parseFloat(fmDepthSlider.value) > maxFm) {
                        fmDepthSlider.value = maxFm;
                        if (fmDepthText) fmDepthText.value = maxFm.toFixed(0);
                    }
                }
            };
            updateFmHeadroom();

            const params = ['Freq', 'FmDepth', 'FmFreq']; 
            params.forEach(paramName => {
                const slider = this.container.querySelector(`.${side}${paramName}`);
                const text = this.container.querySelector(`.${side}${paramName}Text`);
                
                if (slider && text) {
                    slider.addEventListener('input', (e) => {
                        let decimals = slider.step && slider.step.includes('.') ? slider.step.split('.')[1].length : 0;
                        text.value = parseFloat(e.target.value).toFixed(decimals);
                        
                        if (paramName === 'Freq') {
                            updateFmHeadroom();
                            if (this.syncFreqToggle && this.syncFreqToggle.checked) {
                                const otherSide = side === 'left' ? 'right' : 'left';
                                const otherSlider = this.container.querySelector(`.${otherSide}Freq`);
                                if (otherSlider && otherSlider.value !== slider.value) {
                                    otherSlider.value = slider.value;
                                    otherSlider.dispatchEvent(new Event('input')); 
                                }
                            }
                        }
                    });
                    
                    text.addEventListener('change', (e) => {
                        let v = parseFloat(e.target.value);
                        if (isNaN(v)) v = slider.min;
                        v = Math.max(+slider.min, Math.min(+slider.max, v));
                        slider.value = v;
                        let decimals = slider.step && slider.step.includes('.') ? slider.step.split('.')[1].length : 0;
                        text.value = v.toFixed(decimals);
                        if (paramName === 'Freq') {
                            updateFmHeadroom();
                            if (this.syncFreqToggle && this.syncFreqToggle.checked) {
                                const otherSide = side === 'left' ? 'right' : 'left';
                                const otherSlider = this.container.querySelector(`.${otherSide}Freq`);
                                if (otherSlider && otherSlider.value !== slider.value) {
                                    otherSlider.value = slider.value;
                                    otherSlider.dispatchEvent(new Event('input')); 
                                }
                            }
                        }
                    });
                }
            });
        });
    }

    setupSpatialControls() {
        const orbitRadius = this.container.querySelector('.orbitRadius');
        const syncRadiusToggle = this.container.querySelector('.syncRadiusToggle');
        const mainRadiusContainer = this.container.querySelector('.mainRadiusContainer');
        const splitRadiusContainer = this.container.querySelector('.splitRadiusContainer');
        const orbitRadiusX = this.container.querySelector('.orbitRadiusX');
        const orbitRadiusY = this.container.querySelector('.orbitRadiusY');

        const updateStretchValues = () => {
            if (syncRadiusToggle && syncRadiusToggle.checked) {
                let val = parseFloat(orbitRadius.value);
                this.sX = (val / 100.0) * 0.5;
                this.sY = (val / 100.0) * 0.5;
            } else if (orbitRadiusX && orbitRadiusY) {
                this.sX = (parseFloat(orbitRadiusX.value) / 100.0) * 0.5;
                this.sY = (parseFloat(orbitRadiusY.value) / 100.0) * 0.5;
            }
        };

        if (orbitRadius && syncRadiusToggle) {
            syncRadiusToggle.addEventListener('change', (e) => {
                if (e.target.checked) {
                    mainRadiusContainer.style.display = 'block';
                    splitRadiusContainer.style.display = 'none';
                    const masterVal = orbitRadius.value;
                    orbitRadiusX.value = masterVal;
                    orbitRadiusY.value = masterVal;
                    this.container.querySelector('.orbitRadiusXVal').innerText = masterVal;
                    this.container.querySelector('.orbitRadiusYVal').innerText = masterVal;
                } else {
                    mainRadiusContainer.style.display = 'none';
                    splitRadiusContainer.style.display = 'grid';
                }
                updateStretchValues();
            });

            orbitRadius.addEventListener('input', (e) => {
                this.container.querySelector('.orbitRadiusVal').innerText = e.target.value;
                if (syncRadiusToggle.checked) {
                    orbitRadiusX.value = e.target.value;
                    orbitRadiusY.value = e.target.value;
                    this.container.querySelector('.orbitRadiusXVal').innerText = e.target.value;
                    this.container.querySelector('.orbitRadiusYVal').innerText = e.target.value;
                }
                updateStretchValues();
            });

            orbitRadiusX.addEventListener('input', (e) => { this.container.querySelector('.orbitRadiusXVal').innerText = e.target.value; updateStretchValues(); });
            orbitRadiusY.addEventListener('input', (e) => { this.container.querySelector('.orbitRadiusYVal').innerText = e.target.value; updateStretchValues(); });
        }

        const syncAmFreqToggle = this.container.querySelector('.syncAmFreqToggle');
        const mainAmFreqContainer = this.container.querySelector('.mainAmFreqContainer');
        const splitLeftAmFreq = this.container.querySelector('.splitLeftAmFreq');
        const splitRightAmFreq = this.container.querySelector('.splitRightAmFreq');
        const masterAmFreq = this.container.querySelector('.masterAmFreq');
        const masterAmFreqText = this.container.querySelector('.masterAmFreqText');
        const masterAmFreqMult = this.container.querySelector('.masterAmFreqMult');
        const masterAmFreqMultText = this.container.querySelector('.masterAmFreqMultText');
        const leftAmFreq = this.container.querySelector('.leftAmFreq');
        const leftAmFreqText = this.container.querySelector('.leftAmFreqText');
        const rightAmFreq = this.container.querySelector('.rightAmFreq');
        const rightAmFreqText = this.container.querySelector('.rightAmFreqText');

        const updateSyncedAmFreq = () => {
            const baseChannel = this.container.querySelector(`input[name="baseChannel_${this.id}"]:checked`)?.value || 'left';
            const baseVal = parseFloat(masterAmFreq.value) || 0;
            const multVal = parseFloat(masterAmFreqMult?.value || 1);
            const multipliedVal = baseVal * multVal;

            const baseLabel = this.container.querySelector('.baseSpeedLabel');
            const multLabel = this.container.querySelector('.multSpeedLabel');
            const baseSpan = this.container.querySelector('.baseTextSpan');
            const multSpan = this.container.querySelector('.multTextSpan');

            if (baseChannel === 'left') {
                leftAmFreq.value = baseVal;
                leftAmFreqText.value = baseVal.toFixed(2);
                rightAmFreq.value = multipliedVal;
                rightAmFreqText.value = multipliedVal.toFixed(2);
                if (baseLabel) baseLabel.style.color = 'var(--purple)';
                if (multLabel) multLabel.style.color = 'var(--gold)';
                if (baseSpan) baseSpan.innerText = 'Base Speed (Left):';
                if (multSpan) multSpan.innerText = 'Multiplier (Right):';
            } else {
                rightAmFreq.value = baseVal;
                rightAmFreqText.value = baseVal.toFixed(2);
                leftAmFreq.value = multipliedVal;
                leftAmFreqText.value = multipliedVal.toFixed(2);
                if (baseLabel) baseLabel.style.color = 'var(--gold)';
                if (multLabel) multLabel.style.color = 'var(--purple)';
                if (baseSpan) baseSpan.innerText = 'Base Speed (Right):';
                if (multSpan) multSpan.innerText = 'Multiplier (Left):';
            }
        };

        if (syncAmFreqToggle && masterAmFreq) {
            this.container.querySelectorAll(`input[name="baseChannel_${this.id}"]`).forEach(radio => {
                radio.addEventListener('change', () => { if (syncAmFreqToggle.checked) updateSyncedAmFreq(); });
            });

            syncAmFreqToggle.addEventListener('change', (e) => {
                if (e.target.checked) {
                    mainAmFreqContainer.style.display = 'block';
                    splitLeftAmFreq.style.display = 'none';
                    splitRightAmFreq.style.display = 'none';
                    leftAmFreq.max = 160; rightAmFreq.max = 160;
                    updateSyncedAmFreq();
                } else {
                    mainAmFreqContainer.style.display = 'none';
                    splitLeftAmFreq.style.display = 'block';
                    splitRightAmFreq.style.display = 'block';
                    leftAmFreq.max = 20; rightAmFreq.max = 20;
                    if (parseFloat(leftAmFreq.value) > 20) { leftAmFreq.value = 20; leftAmFreqText.value = '20.00'; }
                    if (parseFloat(rightAmFreq.value) > 20) { rightAmFreq.value = 20; rightAmFreqText.value = '20.00'; }
                }
            });

            masterAmFreq.addEventListener('input', (e) => { masterAmFreqText.value = e.target.value; if (syncAmFreqToggle.checked) updateSyncedAmFreq(); });
            masterAmFreqText.addEventListener('change', (e) => { let val = parseFloat(e.target.value) || 1.0; masterAmFreq.value = val; if (syncAmFreqToggle.checked) updateSyncedAmFreq(); });
            if (masterAmFreqMult) masterAmFreqMult.addEventListener('input', (e) => { masterAmFreqMultText.innerText = e.target.value + 'x'; if (syncAmFreqToggle.checked) updateSyncedAmFreq(); });

            leftAmFreq.addEventListener('input', e => leftAmFreqText.value = e.target.value);
            leftAmFreqText.addEventListener('change', e => leftAmFreq.value = parseFloat(e.target.value) || 0);
            rightAmFreq.addEventListener('input', e => rightAmFreqText.value = e.target.value);
            rightAmFreqText.addEventListener('change', e => rightAmFreq.value = parseFloat(e.target.value) || 0);
        }

        const modeManual = this.container.querySelector('.modeManual');
        const modeAuto = this.container.querySelector('.modeAuto');
        const autoControls = this.container.querySelector('.autoSpatialControls');
        const autoRadiusSlider = this.container.querySelector('.autoRadius');
        const autoSpeedSlider = this.container.querySelector('.autoSpeed');
        const autoSpeedText = this.container.querySelector('.autoSpeedText');
        const autoOriginXSlider = this.container.querySelector('.autoOriginX');
        const autoOriginYSlider = this.container.querySelector('.autoOriginY');
        const powerMotionTypeDrop = this.container.querySelector('.powerMotionType');
        const powerPendExtras = this.container.querySelector('.powerPendulumExtras');
        
        if (powerMotionTypeDrop && powerPendExtras) {
            powerMotionTypeDrop.addEventListener('change', e => {
                this.powerMotionType = e.target.value;
                if (this.powerMotionType === 'pendulum') {
                    powerPendExtras.style.display = 'grid';
                    this.currentPowerAngle = 0;
                    this.powerDir = 1;
                } else {
                    powerPendExtras.style.display = 'none';
                }
            });
        }

        const bindTextSlider = (id, prop) => {
            const slider = this.container.querySelector(`.${id}`);
            if (slider) slider.addEventListener('input', e => {
                this.container.querySelector(`.${id}Val`).innerText = e.target.value;
                this[prop] = parseFloat(e.target.value);
            });
        };
        bindTextSlider('powerSweepSpeed', 'powerSweepSpeed');
        bindTextSlider('powerSweepArc', 'powerSweepArc');
        bindTextSlider('powerEndPause', 'powerEndPause');

        if (modeManual && modeAuto) {
            autoOriginXSlider?.addEventListener('input', (e) => { this.autoOriginX = parseFloat(e.target.value); this.container.querySelector('.autoOriginXVal').innerText = Math.round(this.autoOriginX * 100) + '%'; });
            autoOriginYSlider?.addEventListener('input', (e) => { this.autoOriginY = parseFloat(e.target.value); this.container.querySelector('.autoOriginYVal').innerText = Math.round(this.autoOriginY * 100) + '%'; });

            modeManual.addEventListener('change', () => { this.isAutoMode = false; autoControls.style.display = 'none'; });
            modeAuto.addEventListener('change', () => { this.isAutoMode = true; autoControls.style.display = 'grid'; this.driftingToCenter = false; });
            autoRadiusSlider.addEventListener('input', (e) => { this.autoRadius = parseFloat(e.target.value); this.container.querySelector('.autoRadiusVal').innerText = Math.round(this.autoRadius * 100) + '%'; });
            
            autoSpeedSlider.addEventListener('input', (e) => { this.autoSpeed = parseFloat(e.target.value); autoSpeedText.value = this.autoSpeed.toFixed(2); });
            autoSpeedText.addEventListener('change', (e) => {
                let parsed = parseFloat(e.target.value);
                if (isNaN(parsed)) parsed = 0.2;
                parsed = Math.max(-100, Math.min(100, parsed)); 
                this.autoSpeed = parsed; autoSpeedSlider.value = parsed; autoSpeedText.value = parsed.toFixed(2);
            });
        }
    }

    updateCenterFromEvent(e) {
        if (!this.isDragging || this.isAutoMode) return;
        this.driftingToCenter = false;
        
        const rect = this.canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        
        this.cX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
        this.cY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    }

    calculatePhaseIntensities(canvasX, canvasY) {
        let alpha = (0.5 - canvasY) * 2.0; 
        let beta = (0.5 - canvasX) * 2.0;

        let r = Math.sqrt(alpha * alpha + beta * beta);
        if (r > 1.0) { alpha /= r; beta /= r; r = 1.0; }

        const t11 = (2.0 - r + alpha) / 2.0;
        const t12 = -beta / 2.0;
        const t21 = t12;
        const t22 = (2.0 - r - alpha) / 2.0;

        const inv_sqrt3 = 1.0 / Math.sqrt(3);
        const sqrt3_over_2 = Math.sqrt(3) / 2.0;

        const ab00 = 1.0 * inv_sqrt3;             const ab01 = 0.0;
        const ab10 = -0.5 * inv_sqrt3;            const ab11 = sqrt3_over_2 * inv_sqrt3;
        const ab20 = -0.5 * inv_sqrt3;            const ab21 = -sqrt3_over_2 * inv_sqrt3;

        const T00 = ab00 * t11 + ab01 * t21;      const T01 = ab00 * t12 + ab01 * t22;
        const T10 = ab10 * t11 + ab11 * t21;      const T11 = ab10 * t12 + ab11 * t22;
        const T20 = ab20 * t11 + ab21 * t21;      const T21 = ab20 * t12 + ab21 * t22;

        const N = Math.sqrt(T00 * T00 + T01 * T01);
        const L = Math.sqrt(T10 * T10 + T11 * T11);
        const R = Math.sqrt(T20 * T20 + T21 * T21);

        const scale = Math.sqrt(3);
        return [N * scale, L * scale, R * scale];
    }

    calculateMix(left, right, method) {
        if (method === 'max') return Math.max(left, right);
        if (method === 'average') return (left + right) / 2;
        if (method === 'rms') return Math.sqrt((Math.pow(left, 2) + Math.pow(right, 2)) / 2);
        if (method === 'sum') return (left + right) * 0.75;
        return (left + right) / 2;
    }

    mainLoop() {
        // ZOMBIE KILLER
        if (!document.getElementById(this.id)) return;

        requestAnimationFrame(this.mainLoop);
        
        const nowMs = performance.now();
        if (nowMs - this.lastUpdate < this.STREAM_INTERVAL_MS) return;
        this.lastUpdate = nowMs;

        const currentTime = nowMs / 1000.0;
        const dt = (currentTime - this.lastFrameTime) || 0;
        this.lastFrameTime = currentTime;

        // --- V0 Tremolo Math (Using dt phase integration) ---
        const baseMasterVol = this.masterVol ? (+this.masterVol.value / 100) : 1.0;
        
        const lTremDepth = (+this.container.querySelector('.leftTremDepth')?.value || 0) / 100;
        const lTremFreq = (+this.container.querySelector('.leftTremFreq')?.value || 1);
        this.tremPhaseL = (this.tremPhaseL + 2 * Math.PI * lTremFreq * dt) % (2 * Math.PI);
        const lWave = (Math.sin(this.tremPhaseL) + 1) / 2; 
        const lMult = 1.0 - (lTremDepth * lWave); 

        const rTremDepth = (+this.container.querySelector('.rightTremDepth')?.value || 0) / 100;
        const rTremFreq = (+this.container.querySelector('.rightTremFreq')?.value || 1);
        this.tremPhaseR = (this.tremPhaseR + 2 * Math.PI * rTremFreq * dt) % (2 * Math.PI);
        const rWave = (Math.sin(this.tremPhaseR) + 1) / 2; 
        const rMult = 1.0 - (rTremDepth * rWave); 

        const mixMethod = this.container.querySelector(`input[name="tremoloMix_${this.id}"]:checked`)?.value || 'average';
        let combinedTremolo = 1.0;
        if (mixMethod === 'average') combinedTremolo = (lMult + rMult) / 2;
        else if (mixMethod === 'multiply') combinedTremolo = lMult * rMult;

        const masterVolScaled = baseMasterVol * combinedTremolo;
        
        let leftFreqFinal = 0, rightFreqFinal = 0;
        let oscLeft = 0, oscRight = 0;

        // --- AM (Orbit Motion) Phase Calculation ---
        const isAmLinked = this.container.querySelector('.syncAmFreqToggle')?.checked;
        const baseChannel = this.container.querySelector(`input[name="baseChannel_${this.id}"]:checked`)?.value || 'left';
        const amMult = parseFloat(this.container.querySelector('.masterAmFreqMult')?.value || 1);
        
        const amFreqL = +(this.container.querySelector('.leftAmFreq')?.value || 0);
        const amFreqR = +(this.container.querySelector('.rightAmFreq')?.value || 0);

        // PHASE LOCK LOGIC: If linked, strictly lock the phase to maintain perfect Lissajous figures
        if (isAmLinked) {
            if (baseChannel === 'left') {
                this.amPhaseL = (this.amPhaseL + 2 * Math.PI * amFreqL * dt) % (2 * Math.PI);
                this.amPhaseR = (this.amPhaseL * amMult) + (Math.PI / 2);
            } else {
                // Integrate a raw base phase for Right without the PI/2 offset for clean math
                this.amPhaseRawR = (this.amPhaseRawR || 0) + 2 * Math.PI * amFreqR * dt;
                this.amPhaseRawR %= (2 * Math.PI);
                this.amPhaseR = this.amPhaseRawR + (Math.PI / 2);
                this.amPhaseL = this.amPhaseRawR * amMult;
            }
        } else {
            // Independent phase integration (Allows them to drift naturally when unlinked)
            this.amPhaseL = (this.amPhaseL + 2 * Math.PI * amFreqL * dt) % (2 * Math.PI);
            this.amPhaseR = (this.amPhaseR + 2 * Math.PI * amFreqR * dt) % (2 * Math.PI);
        }

        // --- Apply AM Waveforms and FM Envelopes ---
        ['left', 'right'].forEach(side => {
            if (!this.isPlaying[side]) return;

            // Apply calculated AM phase
            const amWaveform = this.container.querySelector(`.${side}AmWaveform`)?.value;
            if (side === 'left') {
                oscLeft = Math.sin(this.amPhaseL);
                if (amWaveform === 'square') oscLeft = Math.sign(oscLeft);
            } else {
                oscRight = Math.sin(this.amPhaseR);
                if (amWaveform === 'square') oscRight = Math.sign(oscRight);
            }

            // FM (Carrier Frequency Modulation)
            const baseFreq = +(this.container.querySelector(`.${side}Freq`)?.value || 0);
            const fmDepth = +(this.container.querySelector(`.${side}FmDepth`)?.value || 0);
            const fmFreq = +(this.container.querySelector(`.${side}FmFreq`)?.value || 0);
            const fmWaveform = this.container.querySelector(`.${side}FmWaveform`)?.value;

            let currentFreq = baseFreq;
            if (fmDepth > 0 && fmFreq > 0) {
                if (side === 'left') {
                    this.fmPhaseL = (this.fmPhaseL + 2 * Math.PI * fmFreq * dt) % (2 * Math.PI);
                    let fmMod = Math.sin(this.fmPhaseL);
                    if (fmWaveform === 'square') fmMod = Math.sign(fmMod);
                    currentFreq += (fmMod * fmDepth);
                } else {
                    this.fmPhaseR = (this.fmPhaseR + 2 * Math.PI * fmFreq * dt) % (2 * Math.PI);
                    let fmMod = Math.sin(this.fmPhaseR);
                    if (fmWaveform === 'square') fmMod = Math.sign(fmMod);
                    currentFreq += (fmMod * fmDepth);
                }
            }

            if (side === 'left') leftFreqFinal = currentFreq;
            if (side === 'right') rightFreqFinal = currentFreq;
        });

        // Power Dot Pendulum Override Math (Already uses dt integration natively)
        if (this.powerMotionType === 'pendulum') {
            if (currentTime >= this.powerPauseTimer) {
                this.currentPowerAngle += this.powerDir * (this.powerSweepArc * 2 * this.powerSweepSpeed * dt);
                
                if (this.currentPowerAngle >= this.powerSweepArc) {
                    this.currentPowerAngle = this.powerSweepArc;
                    this.powerDir = -1;
                    this.powerPauseTimer = currentTime + (this.powerEndPause / 1000);
                } else if (this.currentPowerAngle <= 0) {
                    this.currentPowerAngle = 0;
                    this.powerDir = 1;
                    this.powerPauseTimer = currentTime + (this.powerEndPause / 1000);
                }
            }
            const sweepPhase = (this.currentPowerAngle - 90) * (Math.PI / 180);
            oscRight = Math.cos(sweepPhase); 
            oscLeft = Math.sin(sweepPhase);
        }

        // Auto Spatial Mode Math (Using dt phase integration)
        if (this.isAutoMode) {
            this.autoPhase = (this.autoPhase + 2 * Math.PI * this.autoSpeed * dt) % (2 * Math.PI);
            this.cX = this.autoOriginX + Math.cos(this.autoPhase) * (this.autoRadius * 0.5);
            this.cY = this.autoOriginY + Math.sin(this.autoPhase) * (this.autoRadius * 0.5);
        }

        // Center Drift Math
        if (this.driftingToCenter) {
            const dx = 0.5 - this.cX;
            const dy = 0.5 - this.cY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < this.DRIFT_SPEED) {
                this.cX = 0.5; this.cY = 0.5; 
                this.driftingToCenter = false;
            } else {
                this.cX += (dx / distance) * this.DRIFT_SPEED;
                this.cY += (dy / distance) * this.DRIFT_SPEED;
            }
        }

        // 2D Rotation Matrix Math
        let rawX = this.cX + (oscRight * this.sX);
        let rawY = this.cY + (oscLeft * this.sY);

        const rotDeg = parseFloat(this.rotationAngle?.value || 0);
        const rotRad = rotDeg * (Math.PI / 180);
        const dx = rawX - 0.5;
        const dy = rawY - 0.5;

        const rotatedX = 0.5 + (dx * Math.cos(rotRad) - dy * Math.sin(rotRad));
        const rotatedY = 0.5 + (dx * Math.sin(rotRad) + dy * Math.cos(rotRad));

        let finalX = Math.max(0, Math.min(1, rotatedX));
        let finalY = Math.max(0, Math.min(1, rotatedY));
        let invertedX = 1.0 - finalX;
        let invertedY = 1.0 - finalY;

        // Visualizer Draw
        if (this.ctx && this.canvas) {
            this.ctx.fillStyle = '#111';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            const [rawE1, rawE2, rawE3] = this.calculatePhaseIntensities(finalX, finalY);
            const e1 = rawE1 * masterVolScaled;
            const e2 = rawE2 * masterVolScaled;
            const e3 = rawE3 * masterVolScaled;

            const w = this.canvas.width;
            const h = this.canvas.height;
            const padding = 35;
            const radius = (w / 2) - padding;

            const electrodes = [
                { angle: Math.PI / 2,                       intensity: e1, color: '254, 46, 46' }, 
                { angle: Math.PI / 2 + (2 * Math.PI / 3),   intensity: e2, color: '84, 99, 255' }, 
                { angle: Math.PI / 2 - (2 * Math.PI / 3),   intensity: e3, color: '255, 199, 23' } 
            ];

            electrodes.forEach(el => {
                const ex = (w / 2) + radius * Math.cos(el.angle);
                const ey = (h / 2) - radius * Math.sin(el.angle); 
                
                this.ctx.beginPath();
                this.ctx.arc(ex, ey, 10 + (25 * el.intensity), 0, 2 * Math.PI);
                this.ctx.fillStyle = `rgba(${el.color}, ${0.1 + (el.intensity * 0.5)})`;
                this.ctx.fill();

                this.ctx.beginPath();
                this.ctx.arc(ex, ey, 8, 0, 2 * Math.PI);
                this.ctx.fillStyle = `rgb(${el.color})`;
                this.ctx.fill();
                
                this.ctx.fillStyle = '#eee';
                this.ctx.font = '12px sans-serif';
                this.ctx.textAlign = 'center';
                this.ctx.fillText(Math.round(el.intensity * 100) + '%', ex, ey - 22);
            });

            this.ctx.strokeStyle = '#333'; this.ctx.lineWidth = 1; this.ctx.beginPath();
            this.ctx.moveTo(w / 2, 0); this.ctx.lineTo(w / 2, h);
            this.ctx.moveTo(0, h / 2); this.ctx.lineTo(w, h / 2);
            this.ctx.stroke();

            if (this.isPlaying.left || this.isPlaying.right) this.traceHistory.push({ x: finalX, y: finalY });
            if (this.traceHistory.length > 100) this.traceHistory.shift();

            this.ctx.strokeStyle = '#b266ff'; this.ctx.lineWidth = 2; this.ctx.beginPath();
            for (let i = 0; i < this.traceHistory.length; i++) {
                let px = this.traceHistory[i].x * w;
                let py = this.traceHistory[i].y * h;
                if (i === 0) this.ctx.moveTo(px, py);
                else this.ctx.lineTo(px, py);
            }
            this.ctx.stroke();

            this.ctx.fillStyle = '#ff4444'; this.ctx.beginPath();
            this.ctx.arc(this.cX * w, this.cY * h, 6, 0, Math.PI * 2);
            this.ctx.fill();

            const dotX = finalX * w;
            const dotY = finalY * h;

            this.ctx.beginPath();
            this.ctx.moveTo(this.cX * w, this.cY * h);
            this.ctx.lineTo(dotX, dotY);
            this.ctx.strokeStyle = '#555';
            this.ctx.stroke();

            this.ctx.beginPath();
            this.ctx.arc(dotX, dotY, 8, 0, 2 * Math.PI);
            this.ctx.fillStyle = '#fff';
            this.ctx.fill();
            this.ctx.strokeStyle = '#000';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
        }

        // TCode Assembly
        let tcodeCommands = [];
        
        if (this.isPlaying.left || this.isPlaying.right) {
            let tcodeX = Math.round(invertedX * 9999).toString().padStart(4, '0');
            let tcodeY = Math.round(invertedY * 9999).toString().padStart(4, '0');
            tcodeCommands.push(`L0${tcodeY}`);
            tcodeCommands.push(`L1${tcodeX}`);
        }

        let tcodeVol = Math.round(masterVolScaled * 9999).toString().padStart(4, '0');
        tcodeCommands.push(`V0${tcodeVol}`);

        const formatFreq = (freqHz) => {
            const percent = freqHz / this.MAX_ESTIM_FREQ;
            const val = Math.max(0, Math.min(9999, Math.round(percent * 9999)));
            return `C0${String(val).padStart(4, '0')}`;
        };

        const bothPlaying = this.isPlaying.left && this.isPlaying.right;
        let finalOutputFreq = 0;

        if (bothPlaying) {
            finalOutputFreq = this.calculateMix(leftFreqFinal, rightFreqFinal, 'average');
            tcodeCommands.push(formatFreq(finalOutputFreq));
        } else {
            if (this.isPlaying.left) {
                finalOutputFreq = leftFreqFinal;
                tcodeCommands.push(formatFreq(leftFreqFinal));
            }
            if (this.isPlaying.right) {
                finalOutputFreq = rightFreqFinal;
                tcodeCommands.push(formatFreq(rightFreqFinal));
            }
        }

        // Visualizer Update
        if (this.freqRangeText && this.freqDot) {
            const getBounds = (side) => {
                // Removed the isPlaying check so it always reads the sliders
                const base = +this.container.querySelector(`.${side}Freq`)?.value || 0;
                const depth = +this.container.querySelector(`.${side}FmDepth`)?.value || 0;
                const fmHz = +this.container.querySelector(`.${side}FmFreq`)?.value || 0;
                if (depth > 0 && fmHz > 0) return { min: Math.max(0, base - depth), max: base + depth };
                return { min: base, max: base };
            };

            const lBounds = getBounds('left');
            const rBounds = getBounds('right');
            let minOut = 0, maxOut = 0;

            // Determine display bounds whether playing or stopped
            if (this.isPlaying.left && !this.isPlaying.right) {
                minOut = lBounds.min;
                maxOut = lBounds.max;
            } else if (this.isPlaying.right && !this.isPlaying.left) {
                minOut = rBounds.min;
                maxOut = rBounds.max;
            } else {
                // If both playing, OR both stopped (viewing a preset)
                minOut = this.calculateMix(lBounds.min, rBounds.min, 'average');
                maxOut = this.calculateMix(lBounds.max, rBounds.max, 'average');
            }

            minOut = Math.max(0, Math.min(this.MAX_ESTIM_FREQ, minOut));
            maxOut = Math.max(0, Math.min(this.MAX_ESTIM_FREQ, maxOut));

            if (minOut === maxOut) {
                this.freqRangeText.textContent = `${Math.round(minOut)} Hz`;
                if (this.freqRangeBar) this.freqRangeBar.style.display = 'none';
            } else {
                this.freqRangeText.textContent = `${Math.round(minOut)} - ${Math.round(maxOut)} Hz`;
                if (this.freqRangeBar) this.freqRangeBar.style.display = 'block';
            }

            const minPct = (minOut / this.MAX_ESTIM_FREQ) * 100;
            const maxPct = (maxOut / this.MAX_ESTIM_FREQ) * 100;
            
            // If stopped, position the dot in the middle of the theoretical range
            let displayFreq = finalOutputFreq;
            if (!this.isPlaying.left && !this.isPlaying.right) {
                displayFreq = (minOut + maxOut) / 2;
            }
            
            const currentPct = Math.max(0, Math.min(100, (displayFreq / this.MAX_ESTIM_FREQ) * 100));

            if (this.freqRangeBar) {
                this.freqRangeBar.style.left = `${minPct}%`;
                this.freqRangeBar.style.width = `${Math.max(0.5, maxPct - minPct)}%`;
            }
            this.freqDot.style.left = `${currentPct}%`;
        }

        // Pulse Math
        const anyPlaying = this.isPlaying.left || this.isPlaying.right;
        const combinedPulseFreq = anyPlaying ? (+this.gPulseFreq?.value || 0) : 0;
        const combinedPulseWidth = anyPlaying ? (+this.gPulseWidth?.value || 0) : 0;

        // Calculate and push P0 and P1 regardless of value to prevent firmware state traps
        const maxFreq = this.gPulseFreq.max ? parseFloat(this.gPulseFreq.max) : 1000;
        const p0Val = Math.max(0, Math.min(9999, Math.round((combinedPulseFreq / maxFreq) * 9999)));
        tcodeCommands.push(`P0${String(p0Val).padStart(4, '0')}`);

        const maxWidth = this.gPulseWidth.max ? parseFloat(this.gPulseWidth.max) : 1000;
        const p1Val = Math.max(0, Math.min(9999, Math.round((combinedPulseWidth / maxWidth) * 9999)));
        tcodeCommands.push(`P1${String(p1Val).padStart(4, '0')}`);

        // Send Packet & Log
        if (tcodeCommands.length > 0) {
            const finalCommand = tcodeCommands.join(' ');
            
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(finalCommand + '\n');
            }

            // --- MASTER RECORDER INTERCEPT ---
            if (window.isRecordingSession) {
                window.sessionData.push({
                    time: Math.round(performance.now() - window.sessionStartTime),
                    ws: this.wsAddress.value, // Captures this specific deck's websocket URL
                    cmd: finalCommand.trim() 
                });
            }
            
            const isMoving = this.isPlaying.left || this.isPlaying.right || this.isDragging || this.driftingToCenter || this.isAutoMode;
            
            if (isMoving && this.logCounter++ % 15 === 0) {
                console.log(`[${this.id}] TCODE OUTPUT:`, finalCommand);
            }
        }
    }
}

window.ThreePhaseSequencer = ThreePhaseSequencer;